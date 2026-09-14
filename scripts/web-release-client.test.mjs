import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, readdir, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { packageWeb, validatePublicPath } from '../deploy/automation/package-web.mjs';
import { sshArguments, safeRemoteStatus, sendWeb, verifyProduction } from '../deploy/automation/send-web.mjs';

const commit = 'a'.repeat(40);
const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'fwx-release-client-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<html>ready</html>');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("public")');
  return { root, dist, archive: join(root, 'web.tar.gz') };
}

test('release packaging preserves files and long Unicode names with a checked manifest', async t => {
  const f = await fixture(t);
  const unicode = `assets/${'中文图片'.repeat(12)}.webp`;
  await writeFile(join(f.dist, unicode), 'public-image');
  const before = (await stat(join(f.dist, 'index.html'))).mode;
  const hash = await packageWeb(f.dist, commit, f.archive);
  const compressed = await readFile(f.archive);
  assert.equal(hash, digest(compressed));
  assert.equal((await stat(f.archive)).mode & 0o777, 0o600);
  const inspection = spawnSync('python3', ['-c',
    'import tarfile,json,sys,hashlib\nwith tarfile.open(sys.argv[1],"r:gz") as a:\n m=a.getmembers(); files={x.name:a.extractfile(x).read() for x in m}; print(json.dumps({"members":[{"name":x.name,"mode":x.mode,"regular":x.isfile()} for x in m],"manifest":json.loads(files["release.json"]),"hashes":{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}))', f.archive], { encoding: 'utf8' });
  assert.equal(inspection.status, 0, inspection.stderr);
  const result = JSON.parse(inspection.stdout);
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.commit, commit);
  assert.equal(result.manifest.files.length, 3);
  assert.ok(result.members.some(member => member.name === unicode));
  assert.ok(result.members.every(member => member.regular && member.mode === 0o644));
  for (const file of result.manifest.files) {
    assert.equal(file.sha256, result.hashes[file.path]);
    assert.equal(file.size, (await stat(join(f.dist, file.path))).size);
  }
  assert.ok(!result.manifest.files.some(file => file.path === 'release.json'));
  assert.equal((await stat(join(f.dist, 'index.html'))).mode, before);
  assert.ok(!(await readdir(f.dist)).includes('release.json'));
  assert.deepEqual((await readdir(f.root)).sort(), ['dist', 'web.tar.gz']);
});

test('release paths reject traversal, hidden files, control characters and sensitive material', () => {
  for (const path of ['../key', '/absolute', './index.html', 'a//b', 'a/../b', '.env', 'a/.git/config', 'a\\b', 'a\nb', 'a\u0000b', 'id_ed25519', 'a/server.pem', 'credentials.json', 'backup.sql', 'a/source.js.map', 'node_modules/index.js', 'release.json', `${'d/'.repeat(32)}file`, `${'directory-name-'.repeat(100)}/file`]) {
    assert.throws(() => validatePublicPath(path), undefined, path);
  }
  for (const path of ['index.html', 'assets/main-a123.js', 'resource/木质零件.glb', 'blockly-media/LICENSE.txt']) {
    assert.equal(validatePublicPath(path), path);
  }
});

test('release packaging refuses symlinks and hardlinks without modifying the source', async t => {
  const f = await fixture(t);
  await symlink('index.html', join(f.dist, 'symlink.html'));
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /regular|link/i);
  await rm(join(f.dist, 'symlink.html'));
  await link(join(f.dist, 'index.html'), join(f.dist, 'hardlink.html'));
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /regular|link/i);
  assert.equal(await readFile(join(f.dist, 'index.html'), 'utf8'), '<html>ready</html>');
});

test('release packaging rejects invalid commit, output inside dist and overwriting an archive', async t => {
  const f = await fixture(t);
  await assert.rejects(packageWeb(f.dist, 'HEAD', f.archive), /commit/i);
  await assert.rejects(packageWeb(f.dist, commit, join(f.dist, 'bundle.tar.gz')), /outside/i);
  await writeFile(f.archive, 'preserve');
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /exist/i);
  assert.equal(await readFile(f.archive, 'utf8'), 'preserve');
});

test('SSH transport pins the host, ignores ambient SSH configuration and disables alternate authentication', () => {
  const args = sshArguments({ host: 'example.test', port: '2222', keyPath: '/private/key', knownHostsPath: '/private/hosts' }, `publish ${commit} ${'b'.repeat(64)}`);
  const joined = args.join(' ');
  for (const option of ['StrictHostKeyChecking=yes', 'UserKnownHostsFile=/private/hosts', 'GlobalKnownHostsFile=/dev/null', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'BatchMode=yes', 'ForwardAgent=no', 'ClearAllForwardings=yes', 'PermitLocalCommand=no']) assert.ok(joined.includes(option), option);
  assert.ok(joined.includes('-F /dev/null'));
  assert.ok(args.includes('-T'));
  assert.equal(args.at(-2), 'fwx-deploy@example.test');
  assert.equal(args.at(-1), `publish ${commit} ${'b'.repeat(64)}`);
  for (const host of ['-oProxyCommand=sh', 'host;echo bad', 'user@host', 'host\n']) assert.throws(() => sshArguments({ host, port: '22', keyPath: 'k', knownHostsPath: 'h' }, 'status'));
  assert.throws(() => sshArguments({ host: 'example.test', port: '0', keyPath: 'k', knownHostsPath: 'h' }, 'status'));
  assert.throws(() => sshArguments({ host: 'example.test', port: '22', keyPath: 'k', knownHostsPath: 'h' }, 'sh'));
});

test('only validated deployment status can reach client logs', () => {
  assert.deepEqual(safeRemoteStatus(JSON.stringify({ schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: true, secret: 'hidden' })), { schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: true });
  assert.equal(safeRemoteStatus(JSON.stringify({ schemaVersion: 1, currentCommit: null, previousCommit: null, ready: false })).ready, false);
  for (const text of ['private secret', JSON.stringify({ schemaVersion: 1, currentCommit: 'bad' }), '::warning::untrusted\n{}']) assert.throws(() => safeRemoteStatus(text));
});

test('invalid publication fails before credentials or SSH are used and does not leak environment secrets', async t => {
  const f = await fixture(t);
  await writeFile(f.archive, 'not-the-expected-archive');
  let invoked = false;
  await assert.rejects(sendWeb({ operation: 'publish', commit, archive: f.archive, archiveSha256: 'b'.repeat(64) }, { env: { SSH_KEY: 'never-print-this', SSH_KNOWN_HOSTS: 'never-print-that' }, transport: () => { invoked = true; } }), error => !error.message.includes('never-print') && /digest/i.test(error.message));
  assert.equal(invoked, false);
});

test('temporary credentials are private, removed after success and not returned in deployment status', async t => {
  const f = await fixture(t);
  const archiveSha256 = await packageWeb(f.dist, commit, f.archive);
  const env = { SSH_KEY: 'fake-test-identity-not-a-real-secret-value', SSH_KNOWN_HOSTS: 'example.test test-only-key', FWX_DEPLOY_HOST: 'example.test' };
  let identityPath;
  let verificationCount = 0;
  const result = await sendWeb({ operation: 'publish', commit, archive: f.archive, archiveSha256 }, { env,
    transport: async (args, archive) => {
      identityPath = args[args.indexOf('-i') + 1];
      const hostsPath = args.find(argument => argument.startsWith('UserKnownHostsFile=')).split('=')[1];
      assert.equal((await stat(identityPath)).mode & 0o777, 0o600);
      assert.equal((await stat(hostsPath)).mode & 0o777, 0o600);
      assert.equal((await stat(join(identityPath, '..'))).mode & 0o777, 0o700);
      assert.equal(await readFile(identityPath, 'utf8'), `${env.SSH_KEY}\n`);
      assert.equal(archive, f.archive);
      assert.equal(args.at(-1), `publish ${commit} ${archiveSha256}`);
      return { schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: true, privateOutput: 'must-not-escape' };
    },
    verify: async actualCommit => { assert.equal(actualCommit, commit); verificationCount += 1; }
  });
  assert.equal(verificationCount, 1);
  assert.deepEqual(result, { schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: true });
  await assert.rejects(stat(identityPath), { code: 'ENOENT' });
});

test('a failed public read-back conditionally rolls back exactly that commit and fails the release', async t => {
  const f = await fixture(t);
  const archiveSha256 = await packageWeb(f.dist, commit, f.archive);
  const commands = [];
  let identityPath;
  await assert.rejects(sendWeb({ operation: 'publish', commit, archive: f.archive, archiveSha256 }, {
    env: { SSH_KEY: 'fake-test-identity-not-a-real-secret-value', SSH_KNOWN_HOSTS: 'example.test test-only-key', FWX_DEPLOY_HOST: 'example.test' },
    transport: async args => {
      identityPath = args[args.indexOf('-i') + 1];
      commands.push(args.at(-1));
      return { schemaVersion: 1, currentCommit: commands.length === 1 ? commit : 'c'.repeat(40), previousCommit: 'c'.repeat(40), ready: true };
    },
    verify: async () => { throw new Error('upstream credential must not be logged'); }
  }), /preceding frontend release was restored/);
  assert.deepEqual(commands, [`publish ${commit} ${archiveSha256}`, `rollback ${commit}`]);
  await assert.rejects(stat(identityPath), { code: 'ENOENT' });
});

test('pending transactions and an unchanged rollback cannot be reported as successful', async t => {
  const f = await fixture(t);
  const archiveSha256 = await packageWeb(f.dist, commit, f.archive);
  const env = { SSH_KEY: 'fake-test-identity-not-a-real-secret-value', SSH_KNOWN_HOSTS: 'example.test test-only-key', FWX_DEPLOY_HOST: 'example.test' };
  const request = { operation: 'publish', commit, archive: f.archive, archiveSha256 };
  let verified = false;
  await assert.rejects(sendWeb(request, { env,
    transport: async () => ({ schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: false }),
    verify: async () => { verified = true; }
  }), /unfinished deployment/);
  assert.equal(verified, false);
  await assert.rejects(sendWeb(request, { env,
    transport: async () => ({ schemaVersion: 1, currentCommit: commit, previousCommit: null, ready: true }),
    verify: async () => { throw new Error('test check failed'); }
  }), /rollback was not confirmed/);
});

test('public verification checks matching commit, actual entry bytes, API health and forbids redirects', async () => {
  const files = {
    'index.html': '<script type="module" src="/assets/main.js"></script><link href="/assets/main.css" rel="stylesheet">',
    'assets/main.js': 'console.log("tested")',
    'assets/main.css': 'body{margin:0}'
  };
  const manifest = { schemaVersion: 1, commit, files: Object.entries(files).map(([path, value]) => ({ path, sha256: digest(value), size: Buffer.byteLength(value) })) };
  const requested = [];
  const fetcher = async (url, options) => {
    assert.equal(url.origin, 'https://flightwoodx.com');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    requested.push(url.pathname);
    const body = url.pathname === '/release.json' ? JSON.stringify(manifest) : url.pathname === '/api/health' ? JSON.stringify({ status: 'OK', db: 'connected' }) : files[url.pathname.slice(1)];
    return new Response(body, { status: body ? 200 : 404 });
  };
  await verifyProduction(commit, fetcher);
  assert.deepEqual(requested.sort(), ['/api/health', '/assets/main.css', '/assets/main.js', '/index.html', '/release.json']);
  await assert.rejects(verifyProduction('d'.repeat(40), fetcher), /does not match/);
  files['assets/main.js'] = 'changed after publishing';
  await assert.rejects(verifyProduction(commit, fetcher), /bytes do not match/);
});

test('secret-looking file contents and directory symlinks fail closed', async t => {
  const f = await fixture(t);
  await writeFile(join(f.dist, 'assets', 'accident.txt'), ['-----BEGIN ', 'PRIVATE KEY-----'].join(''));
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /Private key/);
  await rm(join(f.dist, 'assets', 'accident.txt'));
  await symlink('assets', join(f.dist, 'linked-assets'));
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /links/);
});

test('only empty ordinary single-link .gitkeep build placeholders are omitted', async t => {
  const f = await fixture(t);
  const placeholder = join(f.dist, 'assets', '.gitkeep');
  await writeFile(placeholder, '');
  await packageWeb(f.dist, commit, f.archive);
  assert.equal((await stat(placeholder)).size, 0);
  const listing = spawnSync('python3', ['-c', 'import tarfile,sys\nwith tarfile.open(sys.argv[1]) as a: print("\\n".join(a.getnames()))', f.archive], { encoding: 'utf8' });
  assert.equal(listing.status, 0);
  assert.ok(!listing.stdout.includes('.gitkeep'));
  await rm(f.archive);
  await writeFile(placeholder, 'not-public');
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /Hidden/);
  await rm(placeholder);
  await symlink('../index.html', placeholder);
  await assert.rejects(packageWeb(f.dist, commit, f.archive), /Hidden|link/i);
});

test('CI deploys only the tested production SHA without rebuilding or exposing credentials to pull requests', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /- production/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/production' \}\}/);
  assert.match(workflow, /needs: \[evidence, verify, browser, docker-smoke\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/production'/);
  assert.match(workflow, /environment: ecs-production/);
  assert.match(workflow, /group: ecs-production\s+cancel-in-progress: false/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /name: Download and hard-verify the exact tested artifact/);
  assert.match(workflow, /ci-evidence\.mjs "\$RELEASE_SHA" --download/);
  assert.match(workflow, /name: Set up production-compatible Python\s+if: needs\.evidence\.outputs\.reuse != 'true' && matrix\.name == 'Tests'\s+uses: actions\/setup-python@e797f83bcb11b83ae66e0230d6156d7c80228e7c # v6\.0\.0\s+with:\s+python-version: '3\.10'/);
  const deploy = workflow.slice(workflow.indexOf('\n  deploy-production:'));
  assert.ok(deploy.length > 50);
  assert.doesNotMatch(deploy, /pnpm (?:install|build)|npm install|docker compose/);
  assert.match(deploy, /SSH_KEY: \$\{\{ secrets\.SSH_KEY \}\}/);
  assert.match(deploy, /SSH_KNOWN_HOSTS: \$\{\{ secrets\.SSH_KNOWN_HOSTS \}\}/);
  assert.doesNotMatch(deploy, /pull_request_target|workflow_run|ssh-keyscan|StrictHostKeyChecking=no/);
});

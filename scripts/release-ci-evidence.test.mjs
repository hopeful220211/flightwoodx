import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findReusableEvidence, downloadVerifiedArtifact, REQUIRED_CHECKS } from '../deploy/automation/ci-evidence.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/project';
const now = Date.parse('2026-09-14T12:00:00Z');
function fixture() {
  const run = { id: 101, workflow_id: 9, path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'success', head_sha: sha, head_branch: 'codex/feature', run_attempt: 1, run_started_at: '2026-09-14T11:00:00Z', updated_at: '2026-09-14T11:15:00Z', repository: { id: 7, full_name: repository }, head_repository: { id: 7, full_name: repository } };
  const jobs = REQUIRED_CHECKS.map(name => ({ id: name, name, head_sha: sha, status: 'completed', conclusion: 'success', steps: [{ name: name === 'Browser core flow' ? 'Start isolated application and verify core flow' : name === 'API container smoke' ? 'Verify container against isolated MongoDB' : `Run ${name}`, status: 'completed', conclusion: 'success' }] }));
  jobs.find(j => j.name === 'Browser core flow').steps.push({ name: 'Package the exact browser-tested public bundle', status: 'completed', conclusion: 'success' });
  jobs.find(j => j.name === 'Browser core flow').steps.push({ name: 'Retain the tested frontend release', status: 'completed', conclusion: 'success', started_at: '2026-09-14T11:13:59Z', completed_at: '2026-09-14T11:14:02Z' });
  jobs.find(j => j.name === 'API container smoke').steps.push({ name: 'Build API production image', status: 'completed', conclusion: 'success' });
  const artifact = { id: 44, name: `web-release-${sha}`, size_in_bytes: 300, expired: false, digest: `sha256:${'b'.repeat(64)}`, created_at: '2026-09-14T11:14:00Z', expires_at: '2026-09-17T11:14:00Z', workflow_run: { id: 101, repository_id: 7, head_repository_id: 7, head_sha: sha, head_branch: 'codex/feature' } };
  const data = { run, jobs, artifacts: [artifact], runs: [run], requests: [] };
  const fetcher = async (url, options) => {
    const u = new URL(url);
    data.requests.push(u.pathname + u.search);
    assert.equal(u.origin, 'https://api.github.com');
    assert.equal(options.redirect, 'error');
    let result;
    if (u.pathname === '/repos/owner/project') result = { id: 7, full_name: repository };
    else if (u.pathname.endsWith('/workflows/ci.yml')) result = { id: 9, path: '.github/workflows/ci.yml' };
    else if (u.pathname.endsWith('/workflows/ci.yml/runs')) result = { workflow_runs: data.runs };
    else if (u.pathname.endsWith('/attempts/1/jobs')) result = { jobs: data.jobs };
    else if (u.pathname.endsWith('/artifacts')) result = { artifacts: data.artifacts };
    else if (u.pathname.endsWith('/runs/101')) result = data.run;
    else throw new Error(`Unexpected fixture URL ${u.pathname}`);
    return new Response(JSON.stringify(result));
  };
  return { ...data, data, fetcher, options: { sha, repository, token: 'test-token-not-real', now, fetcher } };
}

test('only the exact commit with all eight executed checks and a bound artifact is reusable', async () => {
  const f = fixture();
  const result = await findReusableEvidence(f.options);
  assert.equal(result.reuse, true);
  assert.equal(result.commit, sha);
  assert.equal(result.runId, 101);
  assert.equal(result.artifactId, 44);
  assert.equal(result.artifactDigest, f.artifacts[0].digest);
  assert.deepEqual(result.checks, REQUIRED_CHECKS);
});

test('rejects wrong SHA, fork, pull request, production, untrusted branch, workflow and unfinished sources', async t => {
  for (const change of [
    { head_sha: 'c'.repeat(40) }, { event: 'pull_request' }, { event: 'pull_request_target' }, { head_branch: 'production' }, { head_branch: 'untrusted' },
    { path: '.github/workflows/other.yml' }, { workflow_id: 10 }, { status: 'in_progress' }, { conclusion: 'failure' },
    { repository: { id: 8, full_name: repository } }, { head_repository: { id: 8, full_name: 'fork/project' } },
  ]) await t.test(JSON.stringify(change), async () => {
    const f = fixture(); Object.assign(f.run, change);
    assert.equal((await findReusableEvidence(f.options)).reuse, false);
  });
});

test('missing, skipped, duplicate, failed and reused-green required jobs cannot stand in for full checks', async t => {
  for (const mutate of [
    f => f.jobs.pop(), f => { f.jobs[0].conclusion = 'skipped'; }, f => f.jobs.push({ ...f.jobs[0] }),
    f => { f.jobs[0].head_sha = 'c'.repeat(40); }, f => { f.jobs[0].steps[0].conclusion = 'skipped'; },
    f => { f.jobs[0].steps = [{ name: 'Reuse already verified CI evidence', conclusion: 'success', status: 'completed' }]; },
    f => { f.jobs.find(j => j.name === 'Browser core flow').steps.pop(); },
  ]) await t.test(String(mutate), async () => {
    const f = fixture(); mutate(f);
    assert.equal((await findReusableEvidence(f.options)).reuse, false);
  });
});

test('expired, duplicate, malformed or cross-run artifacts force a fresh full CI', async t => {
  for (const change of [
    { expired: true }, { expires_at: '2026-09-14T12:01:00Z' }, { digest: null }, { digest: 'sha256:no' },
    { name: `web-release-${'c'.repeat(40)}` }, { id: -1 }, { size_in_bytes: 1024 ** 3 },
    { created_at: '2026-09-14T10:00:00Z' },
    { created_at: '2026-09-14T11:01:00Z' },
    { workflow_run: { id: 102, repository_id: 7, head_repository_id: 7, head_sha: sha, head_branch: 'codex/feature' } },
    { workflow_run: { id: 101, repository_id: 7, head_repository_id: 99, head_sha: sha, head_branch: 'codex/feature' } },
  ]) await t.test(JSON.stringify(change), async () => {
    const f = fixture(); Object.assign(f.artifacts[0], change);
    assert.equal((await findReusableEvidence(f.options)).reuse, false);
  });
  const f = fixture(); f.artifacts.push({ ...f.artifacts[0], id: 45 });
  assert.equal((await findReusableEvidence(f.options)).reuse, false);
});

test('invalid input and missing credentials fail before network; permission errors are not silently treated as cache misses', async () => {
  for (const change of [{ sha: 'HEAD' }, { repository: '../other' }, { token: '' }]) {
    await assert.rejects(findReusableEvidence({ ...fixture().options, ...change, fetcher: () => assert.fail('network') }));
  }
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(findReusableEvidence({ ...fixture().options, fetcher: async () => new Response('secret must not escape', { status }) }), error => error.message.includes(String(status)) && !error.message.includes('secret'));
  }
});

test('REST pagination finds later runs, required jobs and artifacts instead of accepting only the first page', async () => {
  const f = fixture();
  const fetcher = async (url, options) => {
    const u = new URL(url); const page = Number(u.searchParams.get('page'));
    if (page === 1 && u.pathname.endsWith('/runs')) return new Response(JSON.stringify({ workflow_runs: Array.from({ length: 100 }, (_, i) => ({ ...f.run, id: 200 + i, event: 'pull_request' })) }));
    if (page === 1 && u.pathname.endsWith('/jobs')) return new Response(JSON.stringify({ jobs: Array.from({ length: 100 }, (_, i) => ({ name: `other ${i}` })) }));
    if (page === 1 && u.pathname.endsWith('/artifacts')) return new Response(JSON.stringify({ artifacts: Array.from({ length: 100 }, (_, i) => ({ name: `other ${i}` })) }));
    return f.fetcher(url, options);
  };
  assert.equal((await findReusableEvidence({ ...f.options, fetcher })).reuse, true);
});

test('own current production fallback may download only after all actual checks; another production run may never be reused', async () => {
  const f = fixture(); Object.assign(f.run, { head_branch: 'production', status: 'in_progress', conclusion: null });
  assert.equal((await findReusableEvidence(f.options)).reuse, false);
  await assert.rejects(downloadVerifiedArtifact({ ...f.options, runId: 101, directory: '/unused', currentRunId: 999 }), /trusted|evidence/i);
});

test('ZIP digest mismatch fails hard before archive extraction and never forwards token to storage host', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fwx-evidence-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(); const bytes = Buffer.from('wrong zip bytes'); f.artifacts[0].size_in_bytes = bytes.length;
  const fetcher = async (url, options) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/44/zip')) return new Response(null, { status: 302, headers: { location: 'https://fixture.blob.core.windows.net/archive?signed=private' } });
    if (u.hostname === 'fixture.blob.core.windows.net') { assert.equal(options.headers?.Authorization, undefined); return new Response(bytes); }
    return f.fetcher(url, options);
  };
  await assert.rejects(downloadVerifiedArtifact({ ...f.options, fetcher, runId: 101, artifactId: 44, artifactDigest: f.artifacts[0].digest, directory: join(root, 'out') }), /digest/i);
  await assert.rejects(readFile(join(root, 'out', 'web.tar.gz')), { code: 'ENOENT' });
});

test('download verifies ZIP SHA, exact members and tar SHA without installing dependencies', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fwx-evidence-zip-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(); const archivePath = join(root, 'artifact.zip');
  const tarDigest = createHash('sha256').update('tested bundle').digest('hex');
  const zip = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n z.writestr("web.tar.gz", "tested bundle")\n z.writestr("web.sha256", sys.argv[2]+"\\n")', archivePath, tarDigest]);
  assert.equal(zip.status, 0);
  const bytes = await readFile(archivePath); f.artifacts[0].size_in_bytes = bytes.length; f.artifacts[0].digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const fetcher = async (url, options) => new URL(url).pathname.endsWith('/44/zip') ? new Response(bytes) : f.fetcher(url, options);
  const result = await downloadVerifiedArtifact({ ...f.options, fetcher, runId: 101, artifactId: 44, artifactDigest: f.artifacts[0].digest, directory: join(root, 'out') });
  assert.equal(result.archiveSha256, tarDigest);
  assert.equal(await readFile(join(root, 'out', 'web.tar.gz'), 'utf8'), 'tested bundle');
  await assert.rejects(downloadVerifiedArtifact({ ...f.options, fetcher, runId: 101, artifactId: 45, artifactDigest: f.artifacts[0].digest, directory: join(root, 'other') }), /artifact/i);
  Object.assign(f.run, { head_branch: 'production', status: 'in_progress', conclusion: null });
  f.artifacts[0].workflow_run.head_branch = 'production';
  const current = await downloadVerifiedArtifact({ ...f.options, fetcher, runId: 101, currentRunId: 101, directory: join(root, 'current') });
  assert.equal(current.archiveSha256, tarDigest);
});

test('even a correctly digested ZIP rejects traversal, links, duplicate members, unexpected files and bad tar digest', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fwx-evidence-hostile-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['traversal', 'link', 'duplicate', 'extra', 'bad-digest']) await t.test(mode, async () => {
    const f = fixture(); const zipPath = join(root, `${mode}.zip`);
    const script = `import hashlib,stat,sys,zipfile
target,mode=sys.argv[1:]
with zipfile.ZipFile(target,'w') as z:
 i=zipfile.ZipInfo('web.tar.gz')
 if mode=='link': i.external_attr=(stat.S_IFLNK|0o777)<<16
 z.writestr(i,'tested')
 z.writestr('web.sha256', '0'*64 if mode=='bad-digest' else hashlib.sha256(b'tested').hexdigest())
 if mode in ('traversal','duplicate','extra'): z.writestr({'traversal':'../outside','duplicate':'web.tar.gz','extra':'secret.txt'}[mode],'invalid')
`;
    const zipped = spawnSync('python3', ['-I', '-c', script, zipPath, mode]); assert.equal(zipped.status, 0);
    const bytes = await readFile(zipPath); f.artifacts[0].size_in_bytes = bytes.length; f.artifacts[0].digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const fetcher = async (url, options) => new URL(url).pathname.endsWith('/44/zip') ? new Response(bytes) : f.fetcher(url, options);
    await assert.rejects(downloadVerifiedArtifact({ ...f.options, fetcher, runId: 101, artifactId: 44, artifactDigest: f.artifacts[0].digest, directory: join(root, mode) }), /ZIP contents|bundle digest/);
    await assert.rejects(readFile(join(root, mode, 'web.tar.gz')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(root, 'outside')), { code: 'ENOENT' });
  });
});

test('new attempt requires fresh successful upload; an artifact left over from an earlier attempt is not evidence', async () => {
  const f = fixture(); f.run.run_attempt = 2;
  const upload = f.jobs.find(job => job.name === 'Browser core flow').steps.find(step => step.name === 'Retain the tested frontend release');
  Object.assign(upload, { started_at: '2026-09-14T11:20:00Z', completed_at: '2026-09-14T11:20:02Z' });
  const fetcher = (url, options) => f.fetcher(String(url).replace('/attempts/2/', '/attempts/1/'), options);
  assert.equal((await findReusableEvidence({ ...f.options, fetcher })).reuse, false);
  f.artifacts[0].created_at = '2026-09-14T11:20:01Z';
  assert.equal((await findReusableEvidence({ ...f.options, fetcher })).reuse, true);
  upload.conclusion = 'skipped';
  assert.equal((await findReusableEvidence({ ...f.options, fetcher })).reuse, false);
});

test('workflow preserves full fallback and explicit evidence checks for every protected check name', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /needs: \[evidence, verify, browser, docker-smoke\]/);
  for (const key of ['verify', 'browser', 'docker-smoke']) {
    const section = workflow.split(`\n  ${key}:\n`)[1].split(/\n  [a-z-]+:\n/)[0];
    assert.match(section, /needs: evidence/);
    assert.match(section, /name: Reuse already verified CI evidence\s+if: needs\.evidence\.outputs\.reuse == 'true'/);
    assert.match(section, /name: Check out repository\s+if: needs\.evidence\.outputs\.reuse != 'true'/);
    assert.doesNotMatch(section.split('steps:')[0], /\n    if:/);
  }
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /actions: write|contents: write|continue-on-error/);
  assert.match(workflow, /--artifact "\$ARTIFACT_ID" --digest "\$ARTIFACT_DIGEST"/);
});

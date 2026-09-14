import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireReleaseLock, classifyChanges, parseArguments, parseChangedPaths, runRelease } from '../deploy/automation/release.mjs';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const NEW = 'c'.repeat(40);

test('release is read-only by default; unsafe and ambiguous flags are rejected', () => {
  assert.deepEqual(parseArguments([]), { publish: false, waitMinutes: 20, help: false });
  assert.equal(parseArguments(['--publish', '--wait-minutes', '5']).publish, true);
  for (const args of [['--force'], ['--publish', '--publish'], ['--wait-minutes', '0'], ['--wait-minutes', '31'], ['--wait-minutes', '2.5'], ['--publish=yes']]) assert.throws(() => parseArguments(args));
});

test('NUL paths preserve spaces and classify every deleted/renamed side conservatively', () => {
  assert.deepEqual(parseChangedPaths('apps/web/public/a b.png\0apps/api/src/old.js\0'), ['apps/web/public/a b.png', 'apps/api/src/old.js']);
  assert.throws(() => parseChangedPaths('apps/web/x.js\n'));
  assert.throws(() => parseChangedPaths('../private\0'));
  assert.equal(classifyChanges(['apps/web/src/a.tsx', 'docs/x.md']).frontendOnly, true);
  assert.equal(classifyChanges(['apps/web/src/a.tsx', 'apps/api/src/old.js']).frontendOnly, false);
  assert.equal(classifyChanges(['packages/shared/src/index.ts']).frontendOnly, false);
  assert.equal(classifyChanges(['pnpm-lock.yaml']).frontendOnly, false);
  assert.equal(classifyChanges(['deploy/automation/server.py']).frontendOnly, false);
  assert.equal(classifyChanges(['.github/workflows/ci.yml']).frontendOnly, false);
  assert.equal(classifyChanges(['apps/web/.env.production']).frontendOnly, false);
  assert.equal(classifyChanges(['apps/api/scripts/migrations/new.js']).categories.includes('migration'), true);
  assert.equal(classifyChanges(['mystery.sh']).categories.includes('unknown'), true);
  assert.equal(classifyChanges(['CURRENT_STATUS.md']).needsPublication, false);
});

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'fwx-release-test-'));
  await mkdir(join(root, '.git'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const events = [];
  let time = Date.parse('2026-09-14T00:00:00Z');
  let remoteReads = 0;
  const context = { root, calls, events, verified: [], evidenceCalls: 0 };
  const run = async (command, args) => {
    calls.push([command, ...args]);
    const key = args.join(' ');
    if (command === 'git') {
      if (key === 'rev-parse --show-toplevel') return { code: 0, stdout: `${root}\n` };
      if (key === 'rev-parse --git-common-dir') return { code: 0, stdout: '.git\n' };
      if (key.startsWith('remote get-url')) return { code: 0, stdout: overrides.remote || 'https://github.com/hopeful220211/flightwoodx.git\n' };
      if (key === 'rev-parse HEAD') return { code: 0, stdout: `${overrides.head || SHA}\n` };
      if (key === 'symbolic-ref --short HEAD') return { code: 0, stdout: `${overrides.branch || 'codex/release-test'}\n` };
      if (key.startsWith('status ')) return { code: 0, stdout: overrides.dirty ? '?? private.txt\0' : '' };
      if (key.startsWith('fetch ')) return { code: 0, stdout: '' };
      if (key === 'rev-parse refs/remotes/origin/production') return { code: 0, stdout: `${overrides.production || OLD}\n` };
      if (key.startsWith('merge-base ')) return { code: overrides.diverged ? 1 : 0, stdout: '' };
      if (key.startsWith('diff ')) return { code: 0, stdout: overrides.paths ?? 'apps/web/src/App.tsx\0' };
      if (key.startsWith('ls-remote ')) {
        if (!key.endsWith('refs/heads/production')) return { code: 0, stdout: overrides.candidateRemote ? `${SHA}\trefs/heads/codex/release-test\n` : '' };
        remoteReads++;
        const value = overrides.race && remoteReads === 1 ? NEW : remoteReads >= 2 ? SHA : OLD;
        return { code: 0, stdout: `${value}\trefs/heads/production\n` };
      }
      if (key.startsWith('push ')) {
        if (overrides.pushFailure) throw new Error('SECRET transport failure');
        return { code: 0, stdout: '' };
      }
    }
    if (command === 'gh' && key === 'auth token --hostname github.com') return { code: 0, stdout: 'private-test-token\n' };
    if (command === 'gh' && key.includes('/actions/workflows/ci.yml/runs?')) {
      if (!key.includes('branch=production')) return { code: 0, stdout: JSON.stringify({ workflow_runs: overrides.candidateFailed ? [{ id: 88, head_sha: SHA, head_branch: 'codex/release-test', event: 'push', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'failure', repository: { full_name: 'hopeful220211/flightwoodx' }, head_repository: { full_name: 'hopeful220211/flightwoodx' } }] : [] }) };
      const runData = { id: 999, head_sha: SHA, head_branch: 'production', event: 'push', path: '.github/workflows/ci.yml', status: overrides.pending ? 'in_progress' : 'completed', conclusion: overrides.runFailed ? 'failure' : 'success', created_at: '2026-09-14T00:00:01Z', repository: { full_name: 'hopeful220211/flightwoodx' }, head_repository: { full_name: 'hopeful220211/flightwoodx' } };
      return { code: 0, stdout: JSON.stringify({ workflow_runs: context.pushed || overrides.resume ? [runData] : [] }) };
    }
    if (command === 'gh' && key.includes('/actions/runs/999/jobs')) return { code: 0, stdout: JSON.stringify({ jobs: [{ name: 'Publish tested frontend', conclusion: overrides.skippedPublish ? 'skipped' : 'success', status: 'completed' }] }) };
    throw new Error(`Unmocked ${command} ${key}`);
  };
  context.deps = {
    cwd: root,
    run: async (command, args, options) => {
      const result = await run(command, args, options);
      if (command === 'git' && args[0] === 'push' && args.at(-1).endsWith(':refs/heads/production')) context.pushed = true;
      return result;
    },
    now: () => time,
    sleep: async ms => { time += ms; },
    emit: event => events.push(event),
    evidence: async ({ sha, token }) => {
      context.evidenceCalls++;
      assert.equal(token, 'private-test-token');
      return overrides.noEvidence || (overrides.candidateNeeded && context.evidenceCalls === 1) ? { reuse: false, reason: 'not_found', commit: sha } : { reuse: true, commit: sha, runId: 88, artifactId: 77, artifactDigest: `sha256:${'d'.repeat(64)}`, artifactName: `web-release-${sha}`, expiresAt: '2026-09-16T00:00:00Z' };
    },
    readPublic: async () => { if (overrides.publicUnavailable) throw new Error('network'); return { commit: overrides.publicCommit || overrides.production || OLD }; },
    verify: async sha => { context.verified.push(sha); if (overrides.verifyFailure) throw new Error('SECRET response'); },
  };
  return context;
}

test('plan records scope/evidence/timings without pushing, rebuilding or requiring clean tree', async t => {
  const f = await fixture(t, { dirty: true });
  const result = await runRelease(parseArguments([]), f.deps);
  assert.equal(result.status, 'planned');
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes('dirty_worktree'));
  assert.ok(!f.calls.some(call => call[0] === 'git' && call[1] === 'push'));
  assert.ok(!f.calls.some(call => ['pnpm', 'docker', 'ssh'].includes(call[0])));
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  assert.equal(receipt.commit, SHA);
  assert.ok(receipt.stages.every(stage => Number.isFinite(stage.durationMs)));
  assert.ok(!JSON.stringify([receipt, f.events]).includes('private-test-token'));
});

test('successful publish uses exact SHA ordinary fast-forward and independently verifies public bytes', async t => {
  const f = await fixture(t);
  const result = await runRelease(parseArguments(['--publish']), f.deps);
  assert.equal(result.status, 'published');
  assert.equal(result.productionRunId, 999);
  assert.equal(result.productionRunUrl, 'https://github.com/hopeful220211/flightwoodx/actions/runs/999');
  assert.deepEqual(f.calls.filter(call => call[0] === 'git' && call[1] === 'push'), [['git', 'push', 'origin', `${SHA}:refs/heads/production`]]);
  assert.deepEqual(f.verified, [SHA]);
  assert.equal(f.evidenceCalls, 2);
  assert.ok(!f.calls.flat().some(arg => /--force|reset|commit|add$/u.test(arg)));
});

for (const [name, overrides, code] of [
  ['dirty tree', { dirty: true }, 'dirty_worktree'],
  ['API changes', { paths: 'apps/api/src/app.js\0' }, 'separate_release_required'],
  ['unknown files', { paths: 'unclassified.bin\0' }, 'separate_release_required'],
  ['diverged production', { diverged: true }, 'production_not_ancestor'],
  ['untrusted remote', { remote: 'https://secret@example.com/other/repo.git\n' }, 'unexpected_repository'],
  ['non-codex missing CI', { noEvidence: true, branch: 'main' }, 'candidate_branch_required'],
  ['failed existing candidate CI', { noEvidence: true, candidateFailed: true }, 'candidate_ci_failed'],
  ['missing candidate trigger', { noEvidence: true, candidateRemote: true }, 'candidate_ci_not_started'],
  ['unavailable public baseline', { publicUnavailable: true }, 'production_baseline_unconfirmed'],
  ['different public baseline', { publicCommit: NEW }, 'production_baseline_unconfirmed'],
  ['production race', { race: true }, 'production_changed'],
]) test(`publish stops before write for ${name}`, async t => {
  const f = await fixture(t, overrides);
  const result = await runRelease(parseArguments(['--publish']), f.deps);
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorCode, code);
  assert.ok(!f.calls.some(call => call[0] === 'git' && call[1] === 'push'));
  assert.ok(!JSON.stringify(f.events).includes('secret@example.com'));
});

test('explicit publish prepares one candidate CI by ordinary developer-branch push before production', async t => {
  const f = await fixture(t, { candidateNeeded: true });
  const result = await runRelease(parseArguments(['--publish']), f.deps);
  assert.equal(result.status, 'published');
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(f.calls.filter(call => call[0] === 'git' && call[1] === 'push'), [
    ['git', 'push', 'origin', `${SHA}:refs/heads/codex/release-test`],
    ['git', 'push', 'origin', `${SHA}:refs/heads/production`],
  ]);
  assert.equal(f.evidenceCalls, 3);
});

test('candidate wait is bounded and never falls through to production without proof', async t => {
  const f = await fixture(t, { noEvidence: true });
  const result = await runRelease(parseArguments(['--publish', '--wait-minutes', '1']), f.deps);
  assert.equal(result.errorCode, 'candidate_wait_timeout');
  assert.equal(result.status, 'failed');
  assert.equal(f.calls.filter(call => call[0] === 'git' && call[1] === 'push').length, 1);
  assert.ok(!f.calls.flat().includes(`${SHA}:refs/heads/production`));
  assert.equal(result.durationMs, 60_000);
});

test('docs-only release avoids production push; already published exact commit verifies without redeploy', async t => {
  const f = await fixture(t, { paths: 'docs/a.md\0' });
  const docs = await runRelease(parseArguments(['--publish']), f.deps);
  assert.equal(docs.status, 'no_publication_needed');
  assert.ok(!f.pushed);
  const g = await fixture(t, { production: SHA, paths: '' });
  const current = await runRelease(parseArguments(['--publish']), g.deps);
  assert.equal(current.status, 'already_published');
  assert.deepEqual(g.verified, [SHA]);
  assert.ok(!g.pushed);
});

test('retry after production push resumes that existing deployment without a second push', async t => {
  const f = await fixture(t, { production: SHA, paths: '', publicCommit: OLD, resume: true });
  const result = await runRelease(parseArguments(['--publish']), f.deps);
  assert.equal(result.status, 'already_published');
  assert.equal(result.resumed, true);
  assert.equal(result.productionRunId, 999);
  assert.deepEqual(f.verified, [SHA]);
  assert.ok(!f.calls.some(call => call[0] === 'git' && call[1] === 'push'));
});

for (const [name, overrides, code] of [
  ['failed push', { pushFailure: true }, 'command_failed'],
  ['failed workflow', { runFailed: true }, 'production_workflow_failed'],
  ['skipped publish job', { skippedPublish: true }, 'publish_not_confirmed'],
  ['bounded waiting', { pending: true }, 'production_wait_timeout'],
  ['public byte failure', { verifyFailure: true }, 'public_verification_failed'],
]) test(`failure receipt preserves actionable stage and never leaks raw transport output: ${name}`, async t => {
  const f = await fixture(t, overrides);
  const result = await runRelease(parseArguments(['--publish', '--wait-minutes', '1']), f.deps);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, code);
  assert.ok(result.stages.some(stage => stage.status === 'failed'));
  assert.ok(!JSON.stringify([result, f.events]).includes('SECRET'));
});

test('workspace-wide lock rejects a second run, releases safely and rejects symlink storage', async t => {
  const f = await fixture(t);
  const first = await acquireReleaseLock(join(f.root, '.git'));
  await assert.rejects(acquireReleaseLock(join(f.root, '.git')), /release_locked/u);
  await first.release();
  const next = await acquireReleaseLock(join(f.root, '.git'));
  await next.release();
  const target = join(f.root, 'redirect');
  await mkdir(target);
  await writeFile(join(target, 'keep'), 'preserve');
  await rm(join(f.root, '.git', 'fwx-releases'), { recursive: true });
  await symlink(target, join(f.root, '.git', 'fwx-releases'));
  await assert.rejects(acquireReleaseLock(join(f.root, '.git')), /unsafe_receipt_directory/u);
  assert.equal(await readFile(join(target, 'keep'), 'utf8'), 'preserve');
});

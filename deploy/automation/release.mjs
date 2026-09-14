import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyProduction } from './send-web.mjs';

const REPOSITORY = 'hopeful220211/flightwoodx';
const COMMIT = /^[0-9a-f]{40}$/u;
const ORIGIN_URLS = new Set([`https://github.com/${REPOSITORY}.git`, `https://github.com/${REPOSITORY}`, `git@github.com:${REPOSITORY}.git`, `ssh://git@github.com/${REPOSITORY}.git`]);
const HELP = `Usage: pnpm release [--publish] [--wait-minutes 1..30]
Default: inspect exact HEAD, production, changed files and reusable CI evidence. No remote writes.
--publish: release a clean frontend-only commit; if needed push the current codex/ branch and wait for its CI once, then fast-forward production, wait for deployment and verify the public version/entry hashes/API health.
No commits, force pushes, credential changes, backend or deployment-program upgrades are performed.
--wait-minutes: one total CI/deployment wait budget, default 20. Failures stop; no automatic rerun loops.
JSON stage timings and a private receipt are written for successful, blocked and failed runs.
Backend/shared/deployment/workflow changes require their separate reviewed activation procedure.
`;

class ReleaseError extends Error {
  constructor(code, blocked = false) { super(code); this.code = code; this.blocked = blocked; }
}
const stop = code => { throw new ReleaseError(code, true); };

export function parseArguments(args) {
  const options = { publish: false, waitMinutes: 20, help: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new ReleaseError('duplicate_argument', true);
    seen.add(arg);
    if (arg === '--publish') options.publish = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--wait-minutes') {
      const value = args[++i];
      if (!/^(?:[1-9]|[12][0-9]|30)$/u.test(value || '')) throw new ReleaseError('invalid_wait_minutes', true);
      options.waitMinutes = Number(value);
    } else throw new ReleaseError('unknown_argument', true);
  }
  return options;
}

export function parseChangedPaths(raw) {
  if (!raw) return [];
  if (typeof raw !== 'string' || !raw.endsWith('\0')) stop('invalid_git_paths');
  const paths = raw.slice(0, -1).split('\0');
  if (paths.some(path => !path || isAbsolute(path) || /[\u0000-\u001f\u007f\\]/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..'))) stop('invalid_git_paths');
  return [...new Set(paths)];
}

export function classifyChanges(paths) {
  const categories = new Set();
  for (const path of paths) {
    if (/(?:^|\/)(?:migrations?|migrate[^/]*)(?:\/|\.)|\.sql$/iu.test(path)) categories.add('migration');
    else if (path.startsWith('deploy/') || /(?:^|\/)(?:Dockerfile(?:\..*)?|docker-compose[^/]*|\.env(?:\..*)?)$/u.test(path)) categories.add('deployment');
    else if (path.startsWith('.github/') || path.startsWith('.agents/')) categories.add('workflow');
    else if (path.startsWith('apps/api/')) categories.add('backend');
    else if (path.startsWith('packages/') || ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'].includes(path)) categories.add('shared');
    else if (path.startsWith('apps/web/')) categories.add('frontend');
    else if (path.startsWith('docs/') || ['AGENTS.md', 'ARCHITECTURE.md', 'CURRENT_STATUS.md', 'README.md'].includes(path)) categories.add('docs');
    else if (path.startsWith('scripts/')) categories.add('workflow');
    else categories.add('unknown');
  }
  const list = [...categories].sort();
  return { categories: list, frontendOnly: list.every(value => ['frontend', 'docs'].includes(value)), needsPublication: list.some(value => value !== 'docs') };
}

function commandRunner(command, args, { cwd, allowFailure = false, timeout = 60_000, signal } = {}) {
  return new Promise((fulfill, reject) => {
    execFile(command, args, { cwd, timeout, signal, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' } }, (error, stdout) => {
      if (error && !(allowFailure && error.code === 1)) return reject(new ReleaseError(signal?.aborted ? 'interrupted' : 'command_failed'));
      fulfill({ code: error ? error.code : 0, stdout });
    });
  });
}

export async function acquireReleaseLock(commonDirectory) {
  const root = await realpath(commonDirectory);
  const directory = join(root, 'fwx-releases');
  await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) stop('unsafe_receipt_directory');
  const lockPath = join(directory, 'release.lock');
  let handle;
  try { handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (error.code === 'EEXIST') stop('release_locked'); throw error; }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
  catch (error) { await handle.close(); await unlink(lockPath); throw error; }
  const identity = await handle.stat();
  let released = false;
  return { directory, async release() {
    if (released) return;
    released = true;
    await handle.close();
    const current = await lstat(lockPath).catch(() => null);
    if (current?.ino === identity.ino && current?.dev === identity.dev && !current.isSymbolicLink()) await unlink(lockPath);
  } };
}

async function readPublic(fetcher = fetch) {
  const response = await fetcher(`https://flightwoodx.com/release.json?release-check=${Date.now()}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new ReleaseError('public_status_unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new ReleaseError('public_status_unavailable'); chunks.push(chunk); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (value.schemaVersion !== 1 || !COMMIT.test(value.commit)) throw new ReleaseError('public_status_unavailable');
  return { commit: value.commit };
}

const ACTIONS = {
  dirty_worktree: '先完成并提交当前修改；程序不会自动提交或丢弃文件。',
  unexpected_repository: 'origin 的读取和推送地址都必须是 hopeful220211/flightwoodx。',
  production_not_ancestor: '生产分支已有不同历史，先核对并整合改动，再验证新提交。',
  nonlinear_release_history: 'production 要求直线历史。先保留原分支，将合并结果整理为基于当前 production 的单父发布提交并核对文件内容，再启动候选 CI；不要修改分支保护。',
  separate_release_required: '包含后端、共享契约、迁移或发布程序变更。按 deploy/automation/README.md 的对应流程单独验证、授权并记录启用；不能只发布网页。',
  production_changed: '生产分支在检查期间变化；未覆盖该版本，重新检查后再发布。',
  production_baseline_unconfirmed: '正式网站与 production 分支版本尚未一致；先等待或处理已有发布，再准备下一版。',
  candidate_branch_required: '缺少有效 CI；请在 codex/ 开发分支提交后再次运行。',
  candidate_ci_not_started: '该提交已在开发分支，但没有对应 CI；检查工作流触发条件后明确启动检查，程序不会等待不存在的作业。',
  candidate_ci_failed: '候选提交的 CI 失败；修复后再发布，不自动反复重跑。',
  ci_evidence_expired: '同提交的 CI 归档已经过期；请对该候选 CI 明确重跑一次，再发布。',
  candidate_wait_timeout: '候选 CI 尚未确认，已停止等待；检查作业后可再次运行同一命令。',
  production_wait_timeout: '发布结果尚未确认，已停止等待；不重复推送，先查看 production 作业和正式版本。',
  production_workflow_failed: '生产流程失败；查看对应作业及正式版本，程序不会自动重试或回退更新版本。',
  publish_not_confirmed: '未找到成功的发布作业；不能将其他检查成功视为上线。',
  public_verification_failed: '正式版本、入口摘要或健康检查未通过；按原发布器状态核对，不自动覆盖后续版本。',
  release_locked: '已有发布进程或遗留锁；核对私有 release.lock 的进程后再处理，不自动删除锁。',
  command_failed: '命令未完成；检查 GitHub 登录、网络和分支保护。原始输出未记录，避免泄露凭据。',
};

export async function runRelease(options, dependencies = {}) {
  if (options.help) return { status: 'help', text: HELP };
  const { now = Date.now, sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)), emit = event => process.stdout.write(`${JSON.stringify(event)}\n`), run = commandRunner, verify = verifyProduction, evidence: injectedEvidence, cwd = process.cwd(), signal } = dependencies;
  const started = now();
  const deadline = started + options.waitMinutes * 60_000;
  const receipt = { schemaVersion: 1, mode: options.publish ? 'publish' : 'plan', repository: REPOSITORY, startedAt: new Date(started).toISOString(), status: 'running', stages: [] };
  let lock;
  let repositoryRoot = cwd;
  const command = async (name, args, extra = {}) => {
    if (signal?.aborted) throw new ReleaseError('interrupted');
    try { return await run(name, args, { cwd: repositoryRoot, signal, ...extra }); }
    catch (error) { throw error instanceof ReleaseError ? error : new ReleaseError('command_failed'); }
  };
  const git = async (...args) => (await command('git', args)).stdout;
  const api = async path => {
    try { return JSON.parse((await command('gh', ['api', `repos/${REPOSITORY}/${path}`])).stdout); }
    catch (error) { throw error instanceof ReleaseError ? error : new ReleaseError('invalid_github_response'); }
  };
  async function persist() {
    if (!lock || !receipt.receiptPath) return;
    const temp = `${receipt.receiptPath}.tmp-${randomUUID()}`;
    const file = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(`${JSON.stringify(receipt, null, 2)}\n`); await file.sync(); } finally { await file.close(); }
    await rename(temp, receipt.receiptPath);
  }
  async function stage(name, task) {
    const start = now();
    emit({ type: 'release-stage', stage: name, status: 'running' });
    try {
      const value = await task();
      receipt.stages.push({ name, status: 'success', durationMs: now() - start });
      emit({ type: 'release-stage', ...receipt.stages.at(-1) });
      await persist();
      return value;
    } catch (error) {
      const safeError = error instanceof ReleaseError ? error : new ReleaseError('release_check_failed');
      receipt.stages.push({ name, status: safeError.blocked ? 'blocked' : 'failed', durationMs: now() - start, errorCode: safeError.code });
      emit({ type: 'release-stage', ...receipt.stages.at(-1) });
      throw safeError;
    }
  }
  async function productionRef() {
    const lines = (await git('ls-remote', '--heads', 'origin', 'refs/heads/production')).trim().split('\n');
    if (lines.length !== 1 || !/^[0-9a-f]{40}\trefs\/heads\/production$/u.test(lines[0])) stop('invalid_production_ref');
    return lines[0].slice(0, 40);
  }
  async function workflowRuns(branch) {
    const data = await api(`actions/workflows/ci.yml/runs?head_sha=${receipt.commit}&branch=${encodeURIComponent(branch)}&event=push&per_page=30`);
    if (!Array.isArray(data.workflow_runs)) throw new ReleaseError('invalid_github_response');
    return data.workflow_runs.filter(item => item.head_sha === receipt.commit && item.head_branch === branch && item.event === 'push' && item.path === '.github/workflows/ci.yml' && item.repository?.full_name === REPOSITORY && item.head_repository?.full_name === REPOSITORY && Number.isSafeInteger(item.id)).sort((a, b) => b.id - a.id);
  }
  const rememberRun = (kind, id) => {
    receipt[`${kind}RunId`] = id;
    receipt[`${kind}RunUrl`] = `https://github.com/${REPOSITORY}/actions/runs/${id}`;
  };
  async function waitForDeployment(previousRuns = new Set()) {
    while (now() < deadline) {
      const current = (await workflowRuns('production')).find(item => !previousRuns.has(item.id));
      if (current) rememberRun('production', current.id);
      if (current?.status === 'completed') {
        if (current.conclusion !== 'success') throw new ReleaseError('production_workflow_failed');
        const data = await api(`actions/runs/${current.id}/jobs?per_page=100`);
        const publish = data.jobs?.filter(job => job.name === 'Publish tested frontend');
        if (publish?.length !== 1 || publish[0].status !== 'completed' || publish[0].conclusion !== 'success') throw new ReleaseError('publish_not_confirmed');
        return;
      }
      emit({ type: 'release-progress', stage: 'production-deployment', status: current?.status || 'queued', elapsedMs: now() - started, runUrl: receipt.productionRunUrl });
      await sleep(Math.min(20_000, Math.max(0, deadline - now())));
    }
    throw new ReleaseError('production_wait_timeout');
  }
  try {
    await stage('repository', async () => {
      repositoryRoot = (await git('rev-parse', '--show-toplevel')).trim();
      const common = (await git('rev-parse', '--git-common-dir')).trim();
      lock = await acquireReleaseLock(resolve(repositoryRoot, common));
      receipt.receiptPath = join(lock.directory, `${new Date(started).toISOString().replaceAll(':', '-')}-${randomUUID()}.json`);
      for (const args of [['remote', 'get-url', '--all', 'origin'], ['remote', 'get-url', '--push', '--all', 'origin']]) {
        const urls = (await git(...args)).trim().split('\n');
        if (urls.length !== 1 || !ORIGIN_URLS.has(urls[0])) stop('unexpected_repository');
      }
      receipt.commit = (await git('rev-parse', 'HEAD')).trim();
      if (!COMMIT.test(receipt.commit)) stop('invalid_commit');
      receipt.dirty = (await git('status', '--porcelain=v1', '-z', '--untracked-files=all')).length > 0;
      await git('fetch', '--no-tags', 'origin', 'refs/heads/production:refs/remotes/origin/production');
      receipt.productionBefore = (await git('rev-parse', 'refs/remotes/origin/production')).trim();
      if (!COMMIT.test(receipt.productionBefore)) stop('invalid_production_ref');
      receipt.productionAncestor = (await command('git', ['merge-base', '--is-ancestor', receipt.productionBefore, receipt.commit], { allowFailure: true })).code === 0;
      receipt.mergeCommits = (await git('rev-list', '--merges', `${receipt.productionBefore}..${receipt.commit}`)).trim().split('\n').filter(Boolean);
      if (receipt.mergeCommits.some(value => !COMMIT.test(value))) stop('invalid_commit');
      receipt.changedPaths = parseChangedPaths(await git('diff', '--name-only', '--no-renames', '-z', receipt.productionBefore, receipt.commit, '--'));
      receipt.scope = classifyChanges(receipt.changedPaths);
      receipt.scope.commitOnly = true;
    });
    const token = await stage('github-access', async () => (await command('gh', ['auth', 'token', '--hostname', 'github.com'])).stdout.trim());
    const evidence = injectedEvidence || (await import('./ci-evidence.mjs')).findReusableEvidence;
    const getEvidence = async () => {
      try { return await evidence({ sha: receipt.commit, repository: REPOSITORY, token, now: now() }); }
      catch { throw new ReleaseError('ci_evidence_unavailable'); }
    };
    const rememberProof = proof => {
      receipt.ci = { reuse: proof.reuse === true, reason: proof.reason, commit: proof.commit, runId: proof.runId, artifactId: proof.artifactId, artifactDigest: proof.artifactDigest, expiresAt: proof.expiresAt };
      if (Number.isSafeInteger(proof.runId)) rememberRun('candidate', proof.runId);
    };
    let proof = await stage('ci-evidence', getEvidence);
    rememberProof(proof);
    await stage('public-status', async () => {
      try { receipt.publicBefore = await (dependencies.readPublic || readPublic)(); }
      catch { receipt.publicBefore = { available: false }; }
    });
    receipt.blockers = [receipt.dirty && 'dirty_worktree', !receipt.productionAncestor && 'production_not_ancestor', receipt.mergeCommits.length > 0 && 'nonlinear_release_history', !receipt.scope.frontendOnly && 'separate_release_required', !proof.reuse && 'ci_evidence_missing', receipt.scope.needsPublication && receipt.publicBefore.commit !== receipt.productionBefore && 'production_baseline_unconfirmed'].filter(Boolean);
    receipt.ready = receipt.blockers.length === 0;
    if (!options.publish) receipt.status = 'planned';
    else {
      await stage('release-boundary', async () => {
        for (const blocker of receipt.blockers.filter(value => value !== 'ci_evidence_missing')) stop(blocker);
      });
      if (receipt.productionBefore === receipt.commit) {
        if (receipt.publicBefore.commit !== receipt.commit) {
          await stage('production-deployment', async () => {
            const current = (await workflowRuns('production'))[0];
            if (!current) throw new ReleaseError('publish_not_confirmed');
            receipt.resumed = true;
            await waitForDeployment();
          });
        }
        await stage('public-verification', async () => { try { await verify(receipt.commit); } catch { throw new ReleaseError('public_verification_failed'); } });
        receipt.status = 'already_published';
      } else if (!receipt.scope.needsPublication) receipt.status = 'no_publication_needed';
      else {
        if (!proof.reuse) await stage('candidate-ci', async () => {
          const branch = (await git('symbolic-ref', '--short', 'HEAD')).trim();
          if (!/^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.endsWith('.lock')) stop('candidate_branch_required');
          const existing = (await workflowRuns(branch))[0];
          if (existing) rememberRun('candidate', existing.id);
          if (existing?.status === 'completed') stop(existing.conclusion === 'success' ? 'ci_evidence_expired' : 'candidate_ci_failed');
          if (!existing) {
            const remote = (await git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`)).trim();
            if (remote === `${receipt.commit}\trefs/heads/${branch}`) stop('candidate_ci_not_started');
            if (remote && !new RegExp(`^[0-9a-f]{40}\\trefs/heads/${branch.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u').test(remote)) stop('invalid_candidate_ref');
            if ((await git('rev-parse', 'HEAD')).trim() !== receipt.commit || (await git('status', '--porcelain=v1', '-z', '--untracked-files=all'))) stop('dirty_worktree');
            await git('push', 'origin', `${receipt.commit}:refs/heads/${branch}`);
          }
          while (now() < deadline) {
            proof = await getEvidence();
            if (proof.reuse) { rememberProof(proof); return; }
            const current = (await workflowRuns(branch))[0];
            if (current) rememberRun('candidate', current.id);
            if (current?.status === 'completed' && current.conclusion !== 'success') stop('candidate_ci_failed');
            emit({ type: 'release-progress', stage: 'candidate-ci', status: current?.status || 'queued', elapsedMs: now() - started, runUrl: receipt.candidateRunUrl });
            await sleep(Math.min(20_000, Math.max(0, deadline - now())));
          }
          throw new ReleaseError('candidate_wait_timeout');
        });
        let previousRuns;
        await stage('production-preflight', async () => {
          if (now() >= deadline) throw new ReleaseError('candidate_wait_timeout');
          if ((await git('rev-parse', 'HEAD')).trim() !== receipt.commit || (await git('status', '--porcelain=v1', '-z', '--untracked-files=all'))) stop('dirty_worktree');
          proof = await getEvidence();
          if (!proof.reuse || proof.commit !== receipt.commit) stop('ci_evidence_missing');
          rememberProof(proof);
          previousRuns = new Set((await workflowRuns('production')).map(item => item.id));
          if (await productionRef() !== receipt.productionBefore) stop('production_changed');
          if (now() >= deadline) throw new ReleaseError('candidate_wait_timeout');
          receipt.ready = true;
          receipt.blockers = [];
        });
        // Plain push is intentionally not --force-with-lease: server-side branch
        // protection and Git's fast-forward check remain effective in the race
        // after the fresh read. Only the already tested exact SHA can be sent.
        await stage('production-push', async () => { await git('push', 'origin', `${receipt.commit}:refs/heads/production`); });
        await stage('production-deployment', () => waitForDeployment(previousRuns));
        await stage('public-verification', async () => {
          if (await productionRef() !== receipt.commit) stop('production_changed');
          try { await verify(receipt.commit); } catch { throw new ReleaseError('public_verification_failed'); }
        });
        receipt.status = 'published';
      }
    }
  } catch (error) {
    receipt.status = error instanceof ReleaseError && error.blocked ? 'blocked' : 'failed';
    receipt.errorCode = error instanceof ReleaseError ? error.code : 'release_check_failed';
    receipt.nextAction = ACTIONS[receipt.errorCode] || '核对当前阶段和仓库发布说明后处理；程序未将未确认结果记为成功。';
  } finally {
    receipt.completedAt = new Date(now()).toISOString();
    receipt.durationMs = now() - started;
    try { await persist(); } catch { receipt.receiptWriteFailed = true; }
    if (lock) await lock.release();
    emit({ type: 'release-summary', ...receipt });
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else {
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once('SIGINT', abort); process.once('SIGTERM', abort);
      const result = await runRelease(options, { signal: controller.signal });
      process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
      if (['failed', 'blocked'].includes(result.status)) process.exitCode = result.status === 'blocked' ? 2 : 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ type: 'release-summary', status: 'blocked', errorCode: error instanceof ReleaseError ? error.code : 'release_check_failed', durationMs: 0 })}\n`);
    process.exitCode = 2;
  }
}

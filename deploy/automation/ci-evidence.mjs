#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REQUIRED_CHECKS = Object.freeze([
  'Repository harness', 'Typecheck and API syntax', 'Tests', 'Lint',
  'Security checks', 'Production build', 'Browser core flow', 'API container smoke',
]);
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_EVIDENCE_AGE_MS = 72 * 60 * 60 * 1000;
const MIN_ARTIFACT_LIFETIME_MS = 5 * 60 * 1000;
const integer = value => Number.isSafeInteger(value) && value > 0;
const fullSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const digestPattern = /^sha256:[0-9a-f]{64}$/;

function client(options) {
  const { sha, repository, token, fetcher = fetch, now = Date.now() } = options;
  if (!fullSha(sha)) throw new Error('A full lowercase 40-character commit SHA is required');
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.includes('..')) throw new Error('Invalid GitHub repository');
  if (typeof token !== 'string' || !token.trim()) throw new Error('GitHub read access is required; sign in before checking release evidence');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function request(path) {
    let response;
    try { response = await fetcher(`https://api.github.com/repos/${repository}${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error('GitHub evidence request failed; check network access and retry'); }
    if (!response.ok) throw new Error(`GitHub evidence request failed (HTTP ${response.status}); release evidence was not verified`);
    try { return await response.json(); } catch { throw new Error('GitHub returned invalid release evidence'); }
  }
  async function pages(path, key) {
    const values = [];
    for (let page = 1; page <= 100; page += 1) {
      const response = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(response[key])) throw new Error('GitHub returned an invalid paginated evidence list');
      values.push(...response[key]);
      if (response[key].length < 100) return values;
    }
    throw new Error('GitHub evidence pagination exceeded its safe limit; narrow the candidate and retry');
  }
  return { sha, repository, token, fetcher, now, headers, request, pages };
}

function sameRepository(value, repo) {
  return value?.id === repo.id && value?.full_name?.toLowerCase() === repo.full_name.toLowerCase();
}

function trustedRun(run, c, repo, workflow, currentRunId) {
  const ownProduction = run.id === currentRunId && run.head_branch === 'production';
  const sourceBranch = /^(?:main|platform-2\.0|(?:codex|preview)\/.+)$/.test(run.head_branch ?? '');
  const started = Date.parse(run.run_started_at);
  return integer(run.id) && integer(run.run_attempt) && run.head_sha === c.sha &&
    run.workflow_id === workflow.id && run.path === WORKFLOW_PATH && run.event === 'push' &&
    sameRepository(run.repository, repo) && sameRepository(run.head_repository, repo) &&
    Number.isFinite(started) && started <= c.now && c.now - started <= MAX_EVIDENCE_AGE_MS &&
    (ownProduction ? ['in_progress', 'completed'].includes(run.status) && [null, 'success'].includes(run.conclusion) : sourceBranch && run.status === 'completed' && run.conclusion === 'success');
}

function executedChecks(jobs, sha) {
  const successfulStep = (job, name) => job.steps?.some(step => step.name === name && step.status === 'completed' && step.conclusion === 'success');
  return REQUIRED_CHECKS.every(name => {
    const matching = jobs.filter(job => job.name === name);
    if (matching.length !== 1) return false;
    const job = matching[0];
    if (job.head_sha !== sha || job.status !== 'completed' || job.conclusion !== 'success') return false;
    if (name === 'Browser core flow') {
      if (!successfulStep(job, 'Retain the tested frontend release')) return false;
      if (job.steps?.some(step => step.name === 'Verify all browser shards')) {
        return successfulStep(job, 'Verify all browser shards') && successfulStep(job, 'Verify the exact tested archive') && ['1', '2', '3', 'privacy'].every(group => {
          const matches = jobs.filter(candidate => candidate.name === `Browser shard ${group}`);
          const shard = matches[0];
          return matches.length === 1 && shard.head_sha === sha && shard.status === 'completed' && shard.conclusion === 'success' && successfulStep(shard, 'Verify and unpack build archive') && successfulStep(shard, 'Run isolated browser group');
        });
      }
      return successfulStep(job, 'Start isolated application and verify core flow') && successfulStep(job, 'Package the exact browser-tested public bundle');
    }
    if (name === 'API container smoke') return successfulStep(job, 'Build API production image') && successfulStep(job, 'Verify container against isolated MongoDB');
    return successfulStep(job, `Run ${name}`);
  });
}

function trustedArtifact(artifact, run, c, repo, jobs) {
  const created = Date.parse(artifact.created_at);
  const expiry = Date.parse(artifact.expires_at);
  const upload = jobs.find(job => job.name === 'Browser core flow').steps.find(step => step.name === 'Retain the tested frontend release');
  const uploadStarted = Date.parse(upload.started_at);
  const uploadCompleted = Date.parse(upload.completed_at);
  return integer(artifact.id) && artifact.name === `web-release-${c.sha}` &&
    integer(artifact.size_in_bytes) && artifact.size_in_bytes <= MAX_ARCHIVE_BYTES &&
    artifact.expired === false && digestPattern.test(artifact.digest ?? '') &&
    Number.isFinite(created) && created >= Date.parse(run.run_started_at) && created <= c.now &&
    Number.isFinite(uploadStarted) && Number.isFinite(uploadCompleted) && uploadCompleted >= uploadStarted &&
    created >= uploadStarted && created <= uploadCompleted + 1000 &&
    Number.isFinite(expiry) && expiry > c.now + MIN_ARTIFACT_LIFETIME_MS &&
    artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === c.sha &&
    artifact.workflow_run.repository_id === repo.id && artifact.workflow_run.head_repository_id === repo.id &&
    artifact.workflow_run.head_branch === run.head_branch;
}

async function context(c) {
  const [repo, workflow] = await Promise.all([c.request(''), c.request('/actions/workflows/ci.yml')]);
  if (!integer(repo.id) || repo.full_name?.toLowerCase() !== c.repository.toLowerCase() || !integer(workflow.id) || workflow.path !== WORKFLOW_PATH) throw new Error('GitHub repository or workflow identity did not match');
  return { repo, workflow };
}

async function inspectRun(run, c, repo, workflow, currentRunId) {
  if (!trustedRun(run, c, repo, workflow, currentRunId)) return null;
  const [jobs, artifacts] = await Promise.all([
    c.pages(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs'),
    c.pages(`/actions/runs/${run.id}/artifacts`, 'artifacts'),
  ]);
  if (!executedChecks(jobs, c.sha)) return null;
  const matching = artifacts.filter(artifact => artifact.name === `web-release-${c.sha}`);
  if (matching.length !== 1 || !trustedArtifact(matching[0], run, c, repo, jobs)) return null;
  const artifact = matching[0];
  return { reuse: true, reason: 'exact-commit-full-ci', commit: c.sha, runId: run.id, artifactId: artifact.id,
    artifactDigest: artifact.digest, artifactName: artifact.name, artifactSize: artifact.size_in_bytes,
    expiresAt: artifact.expires_at, checks: [...REQUIRED_CHECKS] };
}

export async function findReusableEvidence(options) {
  const c = client(options);
  const { repo, workflow } = await context(c);
  const runs = await c.pages(`/actions/workflows/ci.yml/runs?head_sha=${c.sha}&event=push&status=success`, 'workflow_runs');
  for (const run of runs) {
    if (run.id === options.excludeRunId) continue;
    const result = await inspectRun(run, c, repo, workflow);
    if (result) return result;
  }
  return { reuse: false, reason: 'no-trusted-unexpired-full-ci', commit: c.sha };
}

async function downloadZip(c, evidence, path) {
  const deadline = Date.now() + 180_000;
  let response;
  try {
    response = await c.fetcher(`https://api.github.com/repos/${c.repository}/actions/artifacts/${evidence.artifactId}/zip`, { headers: c.headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status === 302) {
      const location = new URL(response.headers.get('location'));
      if (location.protocol !== 'https:' || location.username || location.password || location.port || !/\.(?:blob\.core\.windows\.net|actions\.githubusercontent\.com|githubusercontent\.com)$/.test(location.hostname)) throw new Error('untrusted storage');
      // Do not forward the GitHub credential to the signed storage URL.
      response = await c.fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(180_000) });
    }
  } catch { throw new Error('Verified artifact download failed; no bundle was extracted'); }
  if (!response.ok || !response.body) throw new Error(`Verified artifact download failed (HTTP ${response.status})`);
  const file = await open(path, 'wx', 0o600);
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      if (Date.now() > deadline) throw new Error('Artifact download exceeded its time limit');
      size += chunk.length;
      if (size > MAX_ARCHIVE_BYTES || size > evidence.artifactSize) throw new Error('Downloaded artifact exceeds verified size');
      hash.update(chunk);
      await file.writeFile(chunk);
    }
  } catch {
    throw new Error('Artifact download was interrupted or exceeded its time/size limit; no bundle was extracted');
  } finally { await file.close(); }
  if (size !== evidence.artifactSize || `sha256:${hash.digest('hex')}` !== evidence.artifactDigest) throw new Error('Artifact ZIP digest mismatch; refusing to extract or publish');
}

// ZIP entries are fixed public artifact filenames, never caller-supplied paths.
const EXTRACT_ZIP = `import hashlib,pathlib,re,stat,sys,zipfile
archive,destination=sys.argv[1:]
with zipfile.ZipFile(archive) as z:
 entries=z.infolist()
 if len(entries)!=2 or {i.filename for i in entries}!={'web.tar.gz','web.sha256'}: raise ValueError('Unexpected artifact members')
 for i in entries:
  kind=stat.S_IFMT(i.external_attr>>16)
  if kind not in (0,stat.S_IFREG) or i.flag_bits&1 or i.file_size>300*1024*1024: raise ValueError('Unsafe artifact entry')
  if i.filename=='web.sha256' and i.file_size>128: raise ValueError('Invalid bundle digest file')
 digest=z.read('web.sha256').decode('ascii').strip()
 if not re.fullmatch('[0-9a-f]{64}',digest): raise ValueError('Invalid bundle digest')
 data=z.read('web.tar.gz')
 if hashlib.sha256(data).hexdigest()!=digest: raise ValueError('Bundle digest mismatch')
 for name,data in [('web.tar.gz',data),('web.sha256',(digest+'\\n').encode())]:
  target=pathlib.Path(destination)/name
  with target.open('xb') as f: f.write(data)
  target.chmod(0o600)
`;

export async function downloadVerifiedArtifact(options) {
  const c = client(options);
  if (!integer(options.runId)) throw new Error('An exact source run ID is required');
  const { repo, workflow } = await context(c);
  const run = await c.request(`/actions/runs/${options.runId}`);
  const evidence = await inspectRun(run, c, repo, workflow, options.currentRunId);
  if (!evidence) throw new Error('Trusted full CI evidence is missing or no longer valid');
  if (options.artifactId !== undefined && evidence.artifactId !== options.artifactId || options.artifactDigest !== undefined && evidence.artifactDigest !== options.artifactDigest) throw new Error('Pinned artifact identity or digest changed');
  // Other runs always require a pinned identity from the earlier evidence check.
  if (options.runId !== options.currentRunId && (!integer(options.artifactId) || !digestPattern.test(options.artifactDigest ?? ''))) throw new Error('Source artifact ID and digest must be pinned');
  if (typeof options.directory !== 'string' || !options.directory.trim()) throw new Error('A fresh download directory is required');
  const directory = resolve(options.directory);
  const temporary = await mkdtemp(join(tmpdir(), 'fwx-verified-artifact-'));
  try {
    const zip = join(temporary, 'artifact.zip');
    await downloadZip(c, evidence, zip);
    await mkdir(directory, { mode: 0o700 });
    const extracted = spawnSync('python3', ['-I', '-c', EXTRACT_ZIP, zip, directory], { encoding: 'utf8', timeout: 30_000 });
    if (extracted.status !== 0) throw new Error('Artifact ZIP contents or bundle digest failed validation; nothing was published');
    const archiveSha256 = (await readFile(join(directory, 'web.sha256'), 'utf8')).trim();
    return { ...evidence, archiveSha256 };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function main(argv) {
  const [sha, ...args] = argv;
  const options = { sha, repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN, excludeRunId: Number(process.env.GITHUB_RUN_ID) || undefined };
  const flags = new Map();
  while (args.length) {
    const flag = args.shift(); const value = args.shift();
    if (!['--download', '--run', '--artifact', '--digest'].includes(flag) || !value || flags.has(flag)) throw new Error('Usage: ci-evidence.mjs <40sha> [--download NEW_DIRECTORY --run RUN_ID --artifact ARTIFACT_ID --digest sha256:DIGEST]');
    flags.set(flag, value);
  }
  let result;
  if (flags.has('--download')) {
    result = await downloadVerifiedArtifact({ ...options, directory: flags.get('--download'), runId: Number(flags.get('--run')), artifactId: flags.has('--artifact') ? Number(flags.get('--artifact')) : undefined, artifactDigest: flags.get('--digest'), currentRunId: process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/production' ? Number(process.env.GITHUB_RUN_ID) : undefined });
  } else {
    if (flags.size) throw new Error('Download options require --download');
    result = await findReusableEvidence(options);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, ['reuse', 'runId', 'artifactId', 'artifactDigest'].map(key => `${key}=${result[key] ?? ''}\n`).join(''));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_TIMEOUT_MS = 20 * 60 * 1000;

// Tests run alone: the API pretest writes shared CJS build outputs. The final
// production build remains owned by `pnpm ci`, after every check has passed.
export const CHECKS = Object.freeze(
  ['harness', 'typecheck', 'check:api', 'lint', 'security', 'test']
    .map(script => Object.freeze({ command: 'pnpm', script })),
);

function stopChild(child, signal) {
  if (!child.pid) return;
  try {
    // Only the process group created for this check, never other pnpm jobs.
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export function executeCheck(check, { signal } = {}) {
  return new Promise(resolveExit => {
    if (signal?.aborted) return resolveExit(130);
    const child = spawn(check.command, ['run', check.script], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: false,
      detached: process.platform !== 'win32',
    });
    let stopped = false;
    let escalation;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      stopChild(child, 'SIGTERM');
      escalation = setTimeout(() => stopChild(child, 'SIGKILL'), 5_000);
      escalation.unref();
    };
    const timeout = setTimeout(stop, CHECK_TIMEOUT_MS);
    signal?.addEventListener('abort', stop, { once: true });
    // Abort may occur between the initial check and listener registration.
    if (signal?.aborted) stop();
    const settle = code => {
      clearTimeout(timeout);
      clearTimeout(escalation);
      signal?.removeEventListener('abort', stop);
      resolveExit(stopped ? 130 : code);
    };
    child.once('error', () => settle(1));
    child.once('close', code => settle(Number.isInteger(code) ? code : 1));
  });
}

export async function runChecks({ execute = executeCheck, signal, onEvent = () => {}, now = () => performance.now() } = {}) {
  const startedAt = now();
  const checks = CHECKS.map(check => ({ ...check, status: 'not-run', durationMs: 0, exitCode: null }));
  let failed = false;
  let next = 0;
  async function runOne(index) {
    const check = checks[index];
    const start = now();
    check.status = 'running';
    onEvent({ type: 'start', script: check.script });
    let code;
    try {
      code = await execute(CHECKS[index], { signal });
    } catch {
      // Errors may contain environment values; only report the failing gate.
      code = 1;
    }
    check.durationMs = Math.max(0, now() - start);
    check.exitCode = Number.isInteger(code) ? code : 1;
    check.status = check.exitCode === 0 && !signal?.aborted ? 'passed' : 'failed';
    if (check.status === 'failed') failed = true;
    onEvent({ type: 'finish', ...check });
  }
  async function worker() {
    while (!failed && !signal?.aborted && next < checks.length - 1) {
      const index = next++;
      await runOne(index);
    }
  }
  // Limit local contention. There is no retries/skip/cache mode: each required
  // gate runs once; failures stop queued work and leave it explicitly not-run.
  await Promise.all([worker(), worker()]);
  if (!failed && !signal?.aborted) await runOne(checks.length - 1);
  return { ok: checks.every(check => check.status === 'passed'), checks, durationMs: Math.max(0, now() - startedAt) };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm check\nRuns six required gates once, with at most two independent checks at a time. Tests run alone. pnpm ci adds the final production build. No gates may be skipped.');
    return 0;
  }
  if (args.length) {
    console.error('Unknown option. Use --help; checks cannot be skipped.');
    return 1;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const result = await runChecks({
      signal: controller.signal,
      onEvent: event => {
        if (event.type === 'start') console.log(`[check] START ${event.script}`);
        else console.log(`[check] ${event.status.toUpperCase()} ${event.script} ${(event.durationMs / 1000).toFixed(1)}s`);
      },
    });
    console.log(`[check] ${result.ok ? 'PASSED' : 'FAILED'} ${(result.durationMs / 1000).toFixed(1)}s total`);
    const notRun = result.checks.filter(check => check.status === 'not-run');
    if (notRun.length) console.log(`[check] NOT RUN after failure/cancellation: ${notRun.map(check => check.script).join(', ')}`);
    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

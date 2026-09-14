import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { CHECKS, runChecks } from './check-release.mjs';

test('release checks preserve all six canonical gates without adding a second build', () => {
  assert.deepEqual(CHECKS.map(check => check.script), ['harness', 'typecheck', 'check:api', 'lint', 'security', 'test']);
  assert.ok(CHECKS.every(check => check.command === 'pnpm'));
});

test('independent checks run at most two at once and tests wait for all of them', async () => {
  const events = [];
  let active = 0;
  let peak = 0;
  const result = await runChecks({
    execute: async check => {
      events.push(`start:${check.script}`);
      active += 1;
      peak = Math.max(peak, active);
      if (check.script === 'test') assert.equal(active, 1);
      await new Promise(resolve => setTimeout(resolve, check.script === 'harness' ? 2 : 5));
      active -= 1;
      events.push(`end:${check.script}`);
      return 0;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(peak, 2);
  assert.deepEqual(result.checks.map(check => check.status), Array(6).fill('passed'));
  assert.ok(CHECKS.slice(0, -1).every(check => events.indexOf(`end:${check.script}`) < events.indexOf('start:test')));
  assert.ok(result.checks.every(check => Number.isFinite(check.durationMs) && check.durationMs >= 0));
  assert.ok(result.durationMs >= 0);
});

test('failure stops scheduling pending checks and never starts tests', async () => {
  const started = [];
  const result = await runChecks({
    execute: async check => {
      started.push(check.script);
      await new Promise(resolve => setTimeout(resolve, check.script === 'harness' ? 1 : 5));
      return check.script === 'harness' ? 7 : 0;
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(started, ['harness', 'typecheck']);
  assert.equal(result.checks[0].exitCode, 7);
  assert.equal(result.checks[0].status, 'failed');
  assert.equal(result.checks[1].status, 'passed');
  assert.ok(result.checks.slice(2).every(check => check.status === 'not-run'));
});

test('spawn failures become a failed gate, not a successful or unhandled check', async () => {
  const result = await runChecks({ execute: async () => { throw new Error('private environment must not be logged'); } });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, 'failed');
  assert.equal(result.checks[0].exitCode, 1);
  assert.ok(!JSON.stringify(result).includes('private environment'));
  assert.equal(result.checks.at(-1).status, 'not-run');
});

test('cancellation does not start any pending gate or report success', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runChecks({ signal: controller.signal, execute: async () => { assert.fail('cancelled checks cannot execute'); } });
  assert.equal(result.ok, false);
  assert.ok(result.checks.every(check => check.status === 'not-run'));
});

test('a check must explicitly return exit code zero to pass', async () => {
  const result = await runChecks({ execute: async () => undefined });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, 'failed');
});

test('help is read-only and unknown flags fail before starting checks', () => {
  const url = new URL('./check-release.mjs', import.meta.url);
  const help = spawnSync(process.execPath, [url.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /pnpm check/);
  assert.doesNotMatch(help.stdout, /START/);
  const unknown = spawnSync(process.execPath, [url.pathname, '--skip-tests'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.doesNotMatch(unknown.stdout, /START/);
});

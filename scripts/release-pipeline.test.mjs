import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const yaml = createRequire(require.resolve('eslint/package.json'))('js-yaml');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CI has exactly one frontend build and tests its artifact in four isolated groups', async () => {
  const source = await read('.github/workflows/ci.yml');
  const { jobs } = yaml.load(source);
  const builds = Object.values(jobs).flatMap(job => job.steps || []).filter(step => /pnpm build\b/u.test(step.run || ''));
  assert.equal(builds.length, 1);
  assert.ok(!jobs.verify.strategy.matrix.include.some(entry => /pnpm build\b/u.test(entry.command)));
  assert.equal(jobs.build.name, 'Production build');
  assert.deepEqual(jobs['browser-shards'].strategy.matrix.group, ['1', '2', '3', 'privacy']);
  assert.equal(jobs['browser-shards'].strategy['fail-fast'], false);
  assert.ok(jobs['browser-shards'].services.mongo);
  assert.match(jobs['browser-shards'].steps.find(step => step.name === 'Run isolated browser group').run, /--shard=.*\/3/u);
  assert.deepEqual(jobs.browser.needs, ['evidence', 'build', 'browser-shards']);
  assert.match(jobs.browser.steps.find(step => step.name === 'Verify all browser shards').run, /success/u);
  assert.ok(jobs.browser.steps.some(step => step.name === 'Verify the exact tested archive'));
  assert.equal((jobs.build.steps || []).filter(step => step.name === 'Retain the tested frontend release').length, 0);
});

test('release checks inspect existing evidence instead of rerunning full local CI', async () => {
  const { scripts } = JSON.parse(await read('package.json'));
  assert.equal(scripts['release:check'], scripts.release);
});

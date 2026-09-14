import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('release commands and mandatory project entry points stay connected', async () => {
  const { scripts } = JSON.parse(await read('package.json'));
  assert.equal(scripts.release, 'node deploy/automation/release.mjs');
  assert.equal(scripts['release:check'], 'pnpm run ci');
  assert.equal(scripts.check, 'node scripts/check-release.mjs');
  assert.equal(scripts.ci, 'pnpm check && pnpm build');
  for (const path of ['AGENTS.md', '.agents/skills/flightwoodx-development/SKILL.md']) {
    const source = await read(path);
    assert.ok(source.includes('pnpm release'), `${path} must route releases to the program`);
    assert.ok(source.includes('release-procedure.md'), `${path} must link the fixed procedure`);
  }
  const procedure = await read('deploy/automation/release-procedure.md');
  assert.ok(procedure.includes('pnpm release --publish'));
  assert.ok(procedure.includes('同一提交'));
  assert.ok(procedure.includes('正式'));
});

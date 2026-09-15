import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const root = new URL('../', import.meta.url)
test('every image install receives the dependency patches required by the frozen lockfile', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  const patches = Object.values(manifest.pnpm.patchedDependencies)
  assert.ok(patches.length > 0)
  for (const path of patches) assert.ok(existsSync(fileURLToPath(new URL(path, root))), `Missing ${path}`)
  const dockerfile = readFileSync(new URL('apps/api/Dockerfile', root), 'utf8')
  const stages = dockerfile.split(/^FROM /m).filter(stage => stage.includes('RUN pnpm install'))
  assert.equal(stages.length, 2)
  for (const stage of stages) {
    const copy = stage.indexOf('COPY patches ./patches')
    assert.ok(copy >= 0 && copy < stage.indexOf('RUN pnpm install'), 'Copy patches before installing in each image stage')
  }
})

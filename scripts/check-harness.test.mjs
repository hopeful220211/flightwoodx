import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as harness from './check-harness.mjs'
import { CHECKS } from './check-release.mjs'

const scriptPath = fileURLToPath(new URL('./check-harness.mjs', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const fixtureRoots = []
const requiredGovernanceFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'CURRENT_STATUS.md',
  'apps/web/AGENTS.md',
  'apps/api/AGENTS.md',
  'packages/AGENTS.md',
  'docs/index.md',
  'docs/product-specs/core-flow.md',
  'docs/quality/HARNESS.md',
  'docs/quality/QUALITY_SCORE.md',
  'docs/quality/SECURITY.md',
  'docs/quality/RELIABILITY.md',
  'docs/quality/TECH_DEBT.md',
  'docs/exec-plans/index.md',
  '.agents/skills/flightwoodx-development/SKILL.md',
  '.agents/skills/flightwoodx-development/agents/openai.yaml',
]
const documentsRequiringMetadata = [
  'docs/index.md',
  'docs/product-specs/core-flow.md',
  'docs/quality/HARNESS.md',
  'docs/quality/QUALITY_SCORE.md',
  'docs/quality/SECURITY.md',
  'docs/quality/RELIABILITY.md',
  'docs/quality/TECH_DEBT.md',
  'docs/exec-plans/index.md',
]
const documentMetadata = [
  '> 状态：测试中',
  '> 更新时间：2026-08-15',
  '> 适用范围：测试仓库',
  '> 替代关系：不替代其他文档',
].join('\n')
const validSkill = `---
name: flightwoodx-development
description: Develop and verify FlightWoodX repository changes.
---

# FlightWoodX development
`
const validOpenAiMetadata = `interface:
  display_name: "FlightWoodX Development"
  short_description: "Develop FlightWoodX safely"
  default_prompt: "Use $flightwoodx-development for this repository change."
`

function writeFixtureFile(rootDir, relativePath, contents = '') {
  const filePath = join(rootDir, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
}

function createValidRepository() {
  const rootDir = mkdtempSync(join(tmpdir(), 'flightwoodx-harness-'))
  fixtureRoots.push(rootDir)

  writeFixtureFile(rootDir, 'AGENTS.md', '[Architecture](ARCHITECTURE.md)\n')
  writeFixtureFile(rootDir, 'ARCHITECTURE.md', '# Architecture\n')
  writeFixtureFile(rootDir, 'CURRENT_STATUS.md', '# Current status\n')
  writeFixtureFile(rootDir, 'apps/web/AGENTS.md', '# Web rules\n')
  writeFixtureFile(rootDir, 'apps/api/AGENTS.md', '# API rules\n')
  writeFixtureFile(rootDir, 'packages/AGENTS.md', '# Package rules\n')
  for (const documentPath of documentsRequiringMetadata) {
    writeFixtureFile(rootDir, documentPath, `# Governance\n\n${documentMetadata}\n`)
  }
  writeFixtureFile(rootDir, 'apps/web/package.json', '{"name":"web"}\n')
  writeFixtureFile(rootDir, 'apps/api/package.json', '{"name":"api"}\n')
  writeFixtureFile(rootDir, 'apps/api/src/server.js', 'module.exports = {}\n')
  writeFixtureFile(
    rootDir,
    'packages/shared/package.json',
    '{"name":"@fwx/shared","dependencies":{}}\n',
  )
  writeFixtureFile(rootDir, 'packages/shared/src/index.ts', 'export const ok = true\n')
  writeFixtureFile(
    rootDir,
    '.agents/skills/flightwoodx-development/SKILL.md',
    validSkill,
  )
  writeFixtureFile(
    rootDir,
    '.agents/skills/flightwoodx-development/agents/openai.yaml',
    validOpenAiMetadata,
  )

  return rootDir
}

function assertFinding(findings, code, path) {
  const finding = findings.find(
    (candidate) => candidate.code === code && candidate.path === path,
  )
  assert.ok(finding, `Expected ${code} for ${path}; received ${JSON.stringify(findings)}`)
  assert.equal(typeof finding.message, 'string')
  assert.ok(finding.message.length > 0)
}

test.after(() => {
  for (const rootDir of fixtureRoots) rmSync(rootDir, { recursive: true, force: true })
})

test('exports the aggregate check and individually testable rules', () => {
  const expectedExports = [
    'checkAgentsFileSizes',
    'checkApplicationBoundaries',
    'checkApiUsesJavaScriptOnly',
    'checkConfigurationBoundaries',
    'checkDocumentMetadata',
    'checkDuplicateCurrentStatusFiles',
    'checkForbiddenSkillDiscoveryResidue',
    'checkHarness',
    'checkMarkdownLocalLinks',
    'checkManifestEntryBoundaries',
    'checkPackageManifestBoundaries',
    'checkPackageSourceBoundaries',
    'checkRepositorySkills',
    'checkRepositorySkillShape',
    'checkRequiredGovernanceFiles',
    'checkSourcePathSafety',
    'checkStaticAssetBoundaries',
    'checkLocalAgentSettings',
  ]

  for (const exportName of expectedExports) {
    assert.equal(typeof harness[exportName], 'function', exportName)
  }
  assert.equal(harness.MAX_AGENTS_BYTES, 16 * 1024)
  assert.deepEqual(harness.ALLOWED_REPOSITORY_SKILLS, ['flightwoodx-development'])
  assert.deepEqual(harness.REQUIRED_GOVERNANCE_FILES, requiredGovernanceFiles)
  assert.deepEqual(harness.DOCUMENTS_REQUIRING_METADATA, documentsRequiringMetadata)
})

test('aggregate check accepts a repository that satisfies every rule', () => {
  const rootDir = createValidRepository()

  assert.deepEqual(harness.checkHarness(rootDir), [])
})

test('CLI accepts a repository that satisfies the harness rules', () => {
  const rootDir = createValidRepository()
  const result = spawnSync(process.execPath, [scriptPath, rootDir], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Harness check passed/)
})

for (const requiredPath of requiredGovernanceFiles) {
  test(`requires governance file ${requiredPath}`, () => {
    const rootDir = createValidRepository()
    rmSync(join(rootDir, requiredPath))

    assertFinding(
      harness.checkHarness(rootDir),
      'required-governance-file',
      requiredPath,
    )
  })
}

test('limits the size of required AGENTS files', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'AGENTS.md', 'x'.repeat(16 * 1024 + 1))

  assertFinding(harness.checkHarness(rootDir), 'agents-size-limit', 'AGENTS.md')
})

for (const markdownPath of requiredGovernanceFiles.filter((path) => path.endsWith('.md'))) {
  test(`rejects broken local links in ${markdownPath}`, () => {
    const rootDir = createValidRepository()
    writeFixtureFile(rootDir, markdownPath, '[Missing](missing.md#section)\n')

    assertFinding(harness.checkHarness(rootDir), 'broken-markdown-link', markdownPath)
  })
}

for (const documentPath of documentsRequiringMetadata) {
  test(`requires governance metadata in ${documentPath}`, () => {
    const rootDir = createValidRepository()
    writeFixtureFile(rootDir, documentPath, '# Missing metadata\n')

    assertFinding(
      harness.checkHarness(rootDir),
      'missing-document-metadata',
      documentPath,
    )
  })
}

for (const directory of [
  'docs/product-specs',
  'docs/quality',
  'docs/exec-plans/active',
]) {
  test(`requires metadata in newly added ${directory} documents`, () => {
    const rootDir = createValidRepository()
    const documentPath = `${directory}/future.md`
    writeFixtureFile(rootDir, documentPath, '# Future document\n')

    assertFinding(
      harness.checkHarness(rootDir),
      'missing-document-metadata',
      documentPath,
    )
  })

  test(`checks links in newly added ${directory} documents`, () => {
    const rootDir = createValidRepository()
    const documentPath = `${directory}/future.md`
    writeFixtureFile(
      rootDir,
      documentPath,
      `# Future document\n\n${documentMetadata}\n\n[Missing](missing.md)\n`,
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'broken-markdown-link',
      documentPath,
    )
  })
}

for (const label of ['状态', '更新时间', '适用范围', '替代关系']) {
  test(`requires non-empty ${label} metadata`, () => {
    const rootDir = createValidRepository()
    const incompleteMetadata = documentMetadata
      .split('\n')
      .filter((line) => !line.includes(label))
      .join('\n')
    writeFixtureFile(
      rootDir,
      'docs/index.md',
      `# Documentation\n\n${incompleteMetadata}\n`,
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'missing-document-metadata',
      'docs/index.md',
    )
  })
}

test('rejects Markdown links that leave the repository', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'AGENTS.md', '[Outside](..)\n')

  assertFinding(
    harness.checkHarness(rootDir),
    'markdown-link-outside-repository',
    'AGENTS.md',
  )
})

test('rejects relative imports from package source into apps', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/src/bad.ts',
    "import '../../../apps/web/src/main.ts'\n",
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'package-imports-app',
    'packages/shared/src/bad.ts',
  )
})

test('rejects static filesystem paths from package source into apps', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/src/bad.ts',
    "const assets = path.join(__dirname, '../../../apps/web/public')\n",
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'package-imports-app',
    'packages/shared/src/bad.ts',
  )
})

test('rejects imports of an application package name from package source', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/src/bad.ts',
    "export { default } from 'web'\n",
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'package-imports-app',
    'packages/shared/src/bad.ts',
  )
})

test('rejects package manifests that depend on application packages', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/package.json',
    '{"name":"@fwx/shared","devDependencies":{"api":"workspace:*"}}\n',
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'package-depends-on-app',
    'packages/shared/package.json',
  )
})

test('rejects package manifest aliases that resolve to application packages', () => {
  const specifications = [
    'file:../../apps/web',
    'link:../../apps/web',
    '../../apps/web',
    'npm:web@1.0.0',
    'workspace:web@*',
    'workspace:../../apps/web',
  ]

  for (const specification of specifications) {
    const rootDir = createValidRepository()
    writeFixtureFile(
      rootDir,
      'packages/shared/package.json',
      JSON.stringify({
        name: '@fwx/shared',
        dependencies: { 'web-alias': specification },
      }),
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'package-depends-on-app',
      'packages/shared/package.json',
    )
  }
})

for (const dependencyName of ['react', 'react-dom', 'express', 'mongoose']) {
  test(`rejects ${dependencyName} in package manifests`, () => {
    const rootDir = createValidRepository()
    writeFixtureFile(
      rootDir,
      'packages/shared/package.json',
      JSON.stringify({
        name: '@fwx/shared',
        dependencies: { [dependencyName]: '*' },
      }),
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'package-depends-on-runtime',
      'packages/shared/package.json',
    )

    const aliasRootDir = createValidRepository()
    writeFixtureFile(
      aliasRootDir,
      'packages/shared/package.json',
      JSON.stringify({
        name: '@fwx/shared',
        dependencies: { 'runtime-alias': `npm:${dependencyName}@latest` },
      }),
    )

    assertFinding(
      harness.checkHarness(aliasRootDir),
      'package-depends-on-runtime',
      'packages/shared/package.json',
    )
  })
}

test('rejects source imports between applications', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/src/bad.ts',
    "import '../../api/src/app.js'\n",
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'app-imports-app',
    'apps/web/src/bad.ts',
  )
})

test('rejects static filesystem paths between applications', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/bad.js',
    "const assets = path.resolve(__dirname, '../../../web/public')\n",
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'app-imports-app',
    'apps/api/src/routes/bad.js',
  )
})

test('rejects filesystem paths through standard Node fs bindings', () => {
  const rootDir = createValidRepository()
  const fixtures = {
    'fs-promises-property.js': "const fs = require('node:fs'); fs.promises.readFile('../web/package.json')\n",
    'fs-promises-require-alias.js': "const { promises: fsp } = require('node:fs'); fsp.readFile('../web/package.json')\n",
    'fs-promises-import-alias.js': "import { promises as fsp } from 'node:fs'; fsp.readFile('../web/package.json')\n",
    'fs-promises-property-alias.js': "const fs = require('node:fs'); const fsp = fs.promises; fsp.readFile('../web/package.json')\n",
    'fs-method-alias.js': "const fs = require('node:fs'); const read = fs.promises.readFile; read('../web/package.json')\n",
    'fs-inline-require.js': "require('node:fs').readFileSync('../web/package.json')\n",
    'fs-inline-promises.js': "require('node:fs').promises.readFile('../web/package.json')\n",
  }

  for (const [fileName, source] of Object.entries(fixtures)) {
    writeFixtureFile(rootDir, `apps/api/src/${fileName}`, source)
  }

  const findings = harness.checkHarness(rootDir)
  for (const fileName of Object.keys(fixtures)) {
    assertFinding(findings, 'dynamic-source-path', `apps/api/src/${fileName}`)
  }
})

test('rejects path-like literals for Node fs path methods and both path positions', () => {
  const rootDir = createValidRepository()
  const singlePathMethods = [
    'access',
    'accessSync',
    'appendFile',
    'appendFileSync',
    'chmod',
    'chmodSync',
    'chown',
    'chownSync',
    'createReadStream',
    'createWriteStream',
    'exists',
    'existsSync',
    'glob',
    'globSync',
    'lchown',
    'lchownSync',
    'lstat',
    'lstatSync',
    'lutimes',
    'lutimesSync',
    'mkdir',
    'mkdirSync',
    'mkdtemp',
    'mkdtempSync',
    'open',
    'openAsBlob',
    'openSync',
    'opendir',
    'opendirSync',
    'readFile',
    'readFileSync',
    'readdir',
    'readdirSync',
    'readlink',
    'readlinkSync',
    'realpath',
    'realpathSync',
    'rm',
    'rmSync',
    'rmdir',
    'rmdirSync',
    'stat',
    'statSync',
    'statfs',
    'statfsSync',
    'truncate',
    'truncateSync',
    'unlink',
    'unlinkSync',
    'unwatchFile',
    'utimes',
    'utimesSync',
    'watch',
    'watchFile',
    'writeFile',
    'writeFileSync',
  ]
  const dualPathMethods = [
    'copyFile',
    'copyFileSync',
    'cp',
    'cpSync',
    'link',
    'linkSync',
    'rename',
    'renameSync',
    'symlink',
    'symlinkSync',
  ]

  for (const method of singlePathMethods) {
    writeFixtureFile(
      rootDir,
      `apps/api/src/fs-${method}.js`,
      `const fs = require('node:fs'); fs.${method}('../web/target')\n`,
    )
  }
  for (const method of dualPathMethods) {
    writeFixtureFile(
      rootDir,
      `apps/api/src/fs-${method}.js`,
      `const fs = require('node:fs'); fs.${method}('local', '../web/target')\n`,
    )
  }

  const findings = harness.checkHarness(rootDir)
  for (const method of [...singlePathMethods, ...dualPathMethods]) {
    assertFinding(findings, 'dynamic-source-path', `apps/api/src/fs-${method}.js`)
  }
})

test('rejects path resolve and join literals that implicitly depend on cwd', () => {
  const rootDir = createValidRepository()
  const fixtures = {
    'path-implicit-resolve.js': "const path = require('node:path'); path.resolve('../web/public')\n",
    'path-implicit-join.js': "const path = require('node:path'); path.join('..', 'web/public')\n",
    'path-implicit-named.js': "const { resolve: locate } = require('node:path'); locate('apps/web/public')\n",
    'path-implicit-inline.js': "require('node:path').resolve('../web/public')\n",
  }

  for (const [fileName, source] of Object.entries(fixtures)) {
    writeFixtureFile(rootDir, `apps/api/src/${fileName}`, source)
  }

  const findings = harness.checkHarness(rootDir)
  for (const fileName of Object.keys(fixtures)) {
    assertFinding(findings, 'dynamic-source-path', `apps/api/src/${fileName}`)
  }
})

test('rejects symbolic links anywhere inside application or package source', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'apps/web/src/peer.js', 'module.exports = {}\n')
  symlinkSync(
    '../../web/src/peer.js',
    join(rootDir, 'apps/api/src/local-peer.js'),
  )
  symlinkSync(
    '../../../apps/web/src/peer.js',
    join(rootDir, 'packages/shared/src/local-peer.ts'),
  )

  const findings = harness.checkHarness(rootDir)
  assertFinding(findings, 'source-symlink', 'apps/api/src/local-peer.js')
  assertFinding(findings, 'source-symlink', 'packages/shared/src/local-peer.ts')

  symlinkSync('apps/web/src', join(rootDir, 'peer'), 'dir')
  assertFinding(harness.checkHarness(rootDir), 'repository-symlink', 'peer')

  const packageLinkRoot = createValidRepository()
  writeFixtureFile(packageLinkRoot, 'hidden-api/package.json', '{"name":"api"}\n')
  writeFixtureFile(packageLinkRoot, 'hidden-api/src/server.js', 'module.exports = {}\n')
  rmSync(join(packageLinkRoot, 'apps/api'), { recursive: true })
  symlinkSync('../hidden-api', join(packageLinkRoot, 'apps/api'), 'dir')
  assertFinding(harness.checkHarness(packageLinkRoot), 'repository-symlink', 'apps/api')
})

test('rejects dynamic source references and statically checks template imports', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/dynamic.js',
    "const peer = '../../../web/public'; path.resolve(__dirname, peer)\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/dynamic.ts',
    "const peer = '../../../apps/web'; new URL(peer, import.meta.url)\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/multi-segment.js',
    "path.join(__dirname, '..', '..', '..', 'web', 'public')\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/multi-segment.ts',
    "path.resolve(__dirname, '..', '..', '..', 'apps', 'web')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/concatenated.js',
    "path.resolve(__dirname, '../../../' + peer)\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/template-path.ts',
    'new URL(`../../../apps/${target}`, import.meta.url)\n',
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/template-import.ts',
    'export const load = () => import(`../../../apps/web/src/peer.ts`)\n',
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/comment-marker-import.ts',
    'const marker = "//"; import("../../../apps/web/src/peer.ts")\n',
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/regex-marker-import.ts',
    'const commentPattern = /\\/\\//; import("../../../apps/web/src/peer.ts")\n',
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/require-alias.js',
    "const load = require; load('../../../web/src/peer.js')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/require-main.js',
    'if (require.main === module) module.exports = true\n',
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/path-namespace.mjs',
    "import * as nodePath from 'node:path'; nodePath.resolve(__dirname, '../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/path-require.js',
    "const nodePath = require('node:path'); nodePath.resolve(__dirname, '../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/path-binding.mjs',
    "import { resolve as locate } from 'node:path'; locate(__dirname, '../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/path-element.js',
    "path['resolve'](__dirname, '../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/dirname-concatenated.js',
    "path.resolve(__dirname + '/../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/dirname-alias.js',
    "const base = __dirname; path.resolve(base, '../../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/cwd-base.js',
    "path.resolve(process.cwd(), 'apps/web/src/peer.js')\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/package-dirname-concatenated.ts',
    "path.join(__dirname + '/../../../apps/web/src/peer.ts')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/create-require.mjs',
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('../../../web/src/peer.js')\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/url-alias.ts',
    "import { URL as NodeURL } from 'node:url'; new NodeURL('../../../apps/web/src/peer.ts', import.meta.url)\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/import-meta-resolve.ts',
    "import.meta.resolve('../../../apps/web/src/peer.ts')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/web/src/import-meta-glob.ts',
    "import.meta.glob('../../api/src/*.js')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/import-meta-dirname.mjs',
    "path.resolve(import.meta.dirname, '../../web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/process-cwd-binding.js',
    "const { cwd } = process; path.resolve(cwd(), 'apps/web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/process-cwd-property.js',
    "const getCwd = process.cwd; path.resolve(getCwd(), 'apps/web/public')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/direct-fs.js',
    "fs.readFileSync('../../../web/public/file.txt')\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/direct-fs.ts',
    "readFileSync('../../../apps/web/public/file.txt')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/glob-wildcard.ts',
    "import.meta.glob('../../../*/src/*.ts')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/glob-brace.ts',
    "import.meta.glob('../../../{web}/src/*.ts')\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/glob-ext.ts',
    "import.meta.glob('../../../@(web)/src/*.ts')\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/import-type.ts',
    "export type Peer = import('../../../apps/web/src/peer').Peer\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/reference-path.ts',
    '/// <reference path="../../../apps/web/src/peer.ts" />\nexport const ok = true\n',
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/jsdoc-import.js',
    '/** @typedef {import("../../../apps/web/src/peer").Peer} Peer */\n',
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/module-declaration.ts',
    "declare module '../../../apps/web/src/peer' { export const peer: true }\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/api/src/routes/dynamic-import.js',
    "const prefix = '../../../web'; import(prefix + '/src/peer.js')\n",
  )

  const findings = harness.checkHarness(rootDir)
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/dynamic.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/concatenated.js')
  assertFinding(findings, 'dynamic-source-module', 'apps/api/src/routes/create-require.mjs')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/cwd-base.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/dirname-alias.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/dirname-concatenated.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/direct-fs.js')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/glob-brace.ts')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/glob-ext.ts')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/glob-wildcard.ts')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/import-meta-dirname.mjs')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/multi-segment.js')
  assertFinding(findings, 'dynamic-source-module', 'apps/api/src/routes/dynamic-import.js')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/path-binding.mjs')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/path-element.js')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/path-namespace.mjs')
  assertFinding(findings, 'app-imports-app', 'apps/api/src/routes/path-require.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/process-cwd-binding.js')
  assertFinding(findings, 'dynamic-source-path', 'apps/api/src/routes/process-cwd-property.js')
  assertFinding(findings, 'dynamic-source-module', 'apps/api/src/routes/require-alias.js')
  assertFinding(findings, 'app-imports-app', 'apps/web/src/import-meta-glob.ts')
  assertFinding(findings, 'dynamic-source-path', 'packages/shared/src/dynamic.ts')
  assertFinding(findings, 'dynamic-source-path', 'packages/shared/src/direct-fs.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/import-meta-resolve.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/import-type.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/jsdoc-import.js')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/module-declaration.ts')
  assertFinding(findings, 'dynamic-source-path', 'packages/shared/src/multi-segment.ts')
  assertFinding(findings, 'dynamic-source-path', 'packages/shared/src/package-dirname-concatenated.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/reference-path.ts')
  assertFinding(findings, 'dynamic-source-path', 'packages/shared/src/template-path.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/comment-marker-import.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/regex-marker-import.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/template-import.ts')
  assertFinding(findings, 'package-imports-app', 'packages/shared/src/url-alias.ts')
  assert.equal(
    findings.some((finding) => finding.path === 'apps/api/src/routes/require-main.js'),
    false,
  )
})

test('rejects application manifests that depend on another application', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/package.json',
    '{"name":"web","dependencies":{"api":"workspace:*"}}\n',
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'app-depends-on-app',
    'apps/web/package.json',
  )
})

test('rejects application manifest aliases that resolve to peer applications', () => {
  const specifications = [
    'file:../api',
    'link:../api',
    '../api',
    'npm:api@1.0.0',
    'workspace:api@*',
    'workspace:../api',
  ]

  for (const specification of specifications) {
    const rootDir = createValidRepository()
    writeFixtureFile(
      rootDir,
      'apps/web/package.json',
      JSON.stringify({
        name: 'web',
        dependencies: { 'api-alias': specification },
      }),
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'app-depends-on-app',
      'apps/web/package.json',
    )
  }
})

test('rejects manifest entry points that leave their owning app or package', () => {
  const fixtures = [
    [
      'packages/shared/package.json',
      { name: '@fwx/shared', main: '../../apps/web/src/main.ts' },
    ],
    [
      'packages/shared/package.json',
      { name: '@fwx/shared', types: '../../../outside.d.ts' },
    ],
    [
      'apps/web/package.json',
      { name: 'web', module: '../api/src/server.js' },
    ],
    [
      'apps/web/package.json',
      { name: 'web', browser: '../api/src/server.js' },
    ],
    [
      'packages/shared/package.json',
      {
        name: '@fwx/shared',
        exports: {
          '.': {
            import: './src/index.ts',
            require: '../../apps/api/src/server.js',
          },
        },
      },
    ],
    [
      'packages/shared/package.json',
      {
        name: '@fwx/shared',
        imports: {
          '#peer': {
            node: ['./src/index.ts', '../../apps/web/src/main.tsx'],
          },
        },
      },
    ],
  ]

  for (const [manifestPath, manifest] of fixtures) {
    const rootDir = createValidRepository()
    writeFixtureFile(rootDir, manifestPath, JSON.stringify(manifest))

    assertFinding(
      harness.checkManifestEntryBoundaries(rootDir),
      'manifest-entry-crosses-boundary',
      manifestPath,
    )
  }
})

test('fails closed on invalid manifest entry targets without rejecting valid maps', () => {
  const invalidFixtures = [
    { name: '@fwx/shared', main: 42 },
    { name: '@fwx/shared', exports: { '.': '${ENTRY}' } },
    { name: '@fwx/shared', imports: { '#entry': 42 } },
    { name: '@fwx/shared', browser: ['./src/index.ts'] },
  ]

  for (const manifest of invalidFixtures) {
    const rootDir = createValidRepository()
    writeFixtureFile(
      rootDir,
      'packages/shared/package.json',
      JSON.stringify(manifest),
    )
    assertFinding(
      harness.checkManifestEntryBoundaries(rootDir),
      'invalid-manifest-entry',
      'packages/shared/package.json',
    )
  }

  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/package.json',
    JSON.stringify({
      name: '@fwx/shared',
      main: './src/index.ts',
      module: 'src/index.ts',
      types: './src/index.ts',
      browser: {
        './src/server.ts': false,
        './src/client.ts': './src/index.ts',
        'node:fs': false,
      },
      exports: {
        '.': {
          types: './src/index.ts',
          import: './src/index.ts',
        },
        './disabled': null,
      },
      imports: {
        '#internal': './src/index.ts',
        '#dependency': 'some-package',
      },
    }),
  )

  assert.deepEqual(harness.checkManifestEntryBoundaries(rootDir), [])
})

test('rejects TypeScript and Vite aliases that cross application boundaries', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/tsconfig.paths.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '#web/*': ['../../apps/web/src/*'] },
      },
    }),
  )
  writeFixtureFile(
    rootDir,
    'apps/web/tsconfig.paths.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '#api/*': ['../api/src/*'] },
      },
    }),
  )
  writeFixtureFile(
    rootDir,
    'apps/web/vite.config.ts',
    "export default { resolve: { alias: { '@api': '../api/src' } } }\n",
  )
  writeFixtureFile(
    rootDir,
    'configs/compiler.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '..',
        paths: { '#api/*': ['apps/api/src/*'] },
      },
    }),
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/tsconfig.extended.json',
    JSON.stringify({ extends: '../../configs/compiler.json' }),
  )
  writeFixtureFile(
    rootDir,
    'apps/web/jsconfig.json',
    JSON.stringify({ compilerOptions: { baseUrl: '../api/src' } }),
  )
  writeFixtureFile(
    rootDir,
    'apps/api/vite.config.mjs',
    "const alias = { '@web': '../web/src' }; export default { resolve: { alias } }\n",
  )

  const findings = harness.checkHarness(rootDir)
  assertFinding(
    findings,
    'config-crosses-application',
    'packages/shared/tsconfig.paths.json',
  )
  assertFinding(
    findings,
    'config-crosses-application',
    'apps/web/tsconfig.paths.json',
  )
  assertFinding(
    findings,
    'config-crosses-application',
    'apps/web/vite.config.ts',
  )
  assertFinding(
    findings,
    'config-crosses-application',
    'packages/shared/tsconfig.extended.json',
  )
  assertFinding(
    findings,
    'config-crosses-application',
    'apps/web/jsconfig.json',
  )
  assertFinding(
    findings,
    'dynamic-config-alias',
    'apps/api/vite.config.mjs',
  )
})

test('rejects Vite filesystem settings that cross app or package boundaries', () => {
  const fixtures = [
    ['publicDir', "export default { publicDir: '../api/public' }\n"],
    ['root', "export default { root: '../api' }\n"],
    ['envDir', "export default { envDir: '../../packages/shared' }\n"],
    [
      'server-fs-allow',
      "export default { server: { fs: { allow: ['../api/public'] } } }\n",
    ],
    [
      'build-outDir',
      "export default { build: { outDir: '../../packages/shared/dist' } }\n",
    ],
    [
      'rollup-input',
      "export default { build: { rollupOptions: { input: { app: '../api/index.html' } } } }\n",
    ],
  ]

  for (const [name, config] of fixtures) {
    const rootDir = createValidRepository()
    writeFixtureFile(rootDir, 'apps/web/vite.config.ts', config)

    assertFinding(
      harness.checkConfigurationBoundaries(rootDir),
      'config-crosses-boundary',
      'apps/web/vite.config.ts',
    )
  }
})

test('rejects dynamic Vite filesystem settings that cannot be checked', () => {
  const fixtures = [
    ['publicDir', 'publicDir: configuredPath'],
    ['root', 'root: configuredPath'],
    ['envDir', 'envDir: configuredPath'],
    ['server-fs-allow', 'server: { fs: { allow: [configuredPath] } }'],
    ['build-outDir', 'build: { outDir: configuredPath }'],
    [
      'rollup-input',
      'build: { rollupOptions: { input: { app: configuredPath } } }',
    ],
  ]

  for (const [name, property] of fixtures) {
    const rootDir = createValidRepository()
    writeFixtureFile(
      rootDir,
      'apps/web/vite.config.ts',
      `const configuredPath = process.env.${name.replaceAll('-', '_')}\nexport default { ${property} }\n`,
    )

    assertFinding(
      harness.checkConfigurationBoundaries(rootDir),
      'dynamic-config-path',
      'apps/web/vite.config.ts',
    )
  }
})

test('accepts local static Vite filesystem settings and disabled publicDir', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/vite.config.ts',
    `export default {
  root: '.',
  publicDir: false,
  envDir: '.',
  server: { fs: { allow: ['.'] } },
  build: {
    outDir: 'dist',
    rollupOptions: { input: { app: 'index.html' } },
  },
}\n`,
  )

  const findings = harness.checkConfigurationBoundaries(rootDir)
  assert.equal(
    findings.some((candidate) => (
      candidate.code === 'config-crosses-boundary'
      || candidate.code === 'dynamic-config-path'
    )),
    false,
    JSON.stringify(findings),
  )
})

test('rejects stylesheet imports and URLs that leave their owning module', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/src/cross-import.css',
    "@import '../../api/src/peer.css';\n",
  )
  writeFixtureFile(
    rootDir,
    'packages/shared/src/cross-url.scss',
    ".preview { background: url('../../../apps/web/public/peer.svg'); }\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/web/src/cross-use.sass',
    "@use '../../api/src/theme'\n",
  )
  writeFixtureFile(
    rootDir,
    'apps/web/src/dynamic.less',
    ".preview { background: url(var(--asset)); }\n",
  )

  const findings = harness.checkStaticAssetBoundaries(rootDir)
  for (const path of [
    'apps/web/src/cross-import.css',
    'apps/web/src/cross-use.sass',
    'packages/shared/src/cross-url.scss',
  ]) {
    assertFinding(findings, 'static-asset-crosses-boundary', path)
  }
  assertFinding(findings, 'dynamic-static-asset-path', 'apps/web/src/dynamic.less')
})

test('ignores comments and remote or package stylesheet targets', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/src/safe.css',
    `/* @import '../../api/src/comment.css'; */
@import 'misans/lib/Normal/MiSans-Regular.min.css';
@import url('https://example.com/theme.css');
.icon {
  background-image: url('/fonts/local.woff2');
  mask-image: url('data:image/svg+xml,%3Csvg%3E');
  filter: url('#marker');
  content: "url('../../api/src/string.svg')";
}\n`,
  )

  assert.deepEqual(harness.checkStaticAssetBoundaries(rootDir), [])
})

test('rejects local Vite HTML entry references that leave their owning app', () => {
  const fixtures = [
    [
      '<script type="module" src="../api/public/peer.js"></script>\n',
      'static-asset-crosses-boundary',
    ],
    [
      '<link rel="stylesheet" href="../api/public/peer.css">\n',
      'static-asset-crosses-boundary',
    ],
    [
      '<script type="module" src="{{ moduleEntry }}"></script>\n',
      'dynamic-static-asset-path',
    ],
  ]

  for (const [html, code] of fixtures) {
    const rootDir = createValidRepository()
    writeFixtureFile(rootDir, 'apps/web/index.html', html)
    assertFinding(
      harness.checkStaticAssetBoundaries(rootDir),
      code,
      'apps/web/index.html',
    )
  }
})

test('accepts local and remote Vite HTML entry references', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'apps/web/index.html',
    `<link rel="stylesheet" href="/src/index.css">
<link rel="stylesheet" href="https://example.com/theme.css">
<script type="module" src="/src/main.tsx"></script>\n`,
  )

  assert.deepEqual(harness.checkStaticAssetBoundaries(rootDir), [])
})

test('allows only CommonJS .js source in apps/api/src', () => {
  const rootDir = createValidRepository()
  for (const extension of ['ts', 'mjs', 'jsx', 'JS']) {
    writeFixtureFile(rootDir, `apps/api/src/route.${extension}`, 'export {}\n')
  }

  const findings = harness.checkHarness(rootDir)
  for (const extension of ['ts', 'mjs', 'jsx', 'JS']) {
    assertFinding(
      findings,
      'api-source-language',
      `apps/api/src/route.${extension}`,
    )
  }
})

test('allows only the FlightWoodX repository skill allowlist', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, '.agents/skills/lark-doc/SKILL.md', '# Lark doc\n')

  assertFinding(
    harness.checkHarness(rootDir),
    'unapproved-repository-skill',
    '.agents/skills/lark-doc',
  )
})

test('rejects non-directory entries in the repository skills directory', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, '.agents/skills/README.md', '# Not a skill\n')

  assertFinding(
    harness.checkRepositorySkills(rootDir),
    'invalid-repository-skill-entry',
    '.agents/skills/README.md',
  )
})

test('rejects an allowlisted repository skill that is a symbolic link', () => {
  const rootDir = createValidRepository()
  const skillPath = join(rootDir, '.agents/skills/flightwoodx-development')
  const targetPath = join(rootDir, '.skill-target')
  writeFixtureFile(targetPath, 'SKILL.md', '# Linked skill\n')
  writeFixtureFile(targetPath, 'agents/openai.yaml', 'interface: {}\n')
  rmSync(skillPath, { recursive: true })
  symlinkSync(targetPath, skillPath, 'dir')

  assertFinding(
    harness.checkHarness(rootDir),
    'repository-skill-symlink',
    '.agents/skills/flightwoodx-development',
  )
})

test('rejects a required governance file that is a symbolic link', () => {
  const rootDir = createValidRepository()
  const governancePath = join(
    rootDir,
    '.agents/skills/flightwoodx-development/agents/openai.yaml',
  )
  writeFixtureFile(rootDir, 'linked-openai.yaml', 'interface: {}\n')
  rmSync(governancePath)
  symlinkSync(join(rootDir, 'linked-openai.yaml'), governancePath)

  assertFinding(
    harness.checkHarness(rootDir),
    'required-governance-file',
    '.agents/skills/flightwoodx-development/agents/openai.yaml',
  )
})

test('rejects required governance files reached through an outside directory link', () => {
  const rootDir = createValidRepository()
  const externalRoot = mkdtempSync(join(tmpdir(), 'flightwoodx-external-'))
  fixtureRoots.push(externalRoot)
  writeFixtureFile(externalRoot, 'core-flow.md', `# External\n\n${documentMetadata}\n`)
  rmSync(join(rootDir, 'docs/product-specs'), { recursive: true })
  symlinkSync(externalRoot, join(rootDir, 'docs/product-specs'), 'dir')

  assertFinding(
    harness.checkHarness(rootDir),
    'required-governance-file',
    'docs/product-specs/core-flow.md',
  )
})

test('requires the repository skill name frontmatter', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    '.agents/skills/flightwoodx-development/SKILL.md',
    validSkill.replace('name: flightwoodx-development\n', ''),
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'invalid-repository-skill',
    '.agents/skills/flightwoodx-development/SKILL.md',
  )
})

test('requires a non-empty repository skill description', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    '.agents/skills/flightwoodx-development/SKILL.md',
    validSkill.replace(
      'description: Develop and verify FlightWoodX repository changes.',
      'description:',
    ),
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'invalid-repository-skill',
    '.agents/skills/flightwoodx-development/SKILL.md',
  )
})

for (const field of ['display_name', 'short_description', 'default_prompt']) {
  test(`requires non-empty ${field} in repository skill metadata`, () => {
    const rootDir = createValidRepository()
    const invalidMetadata = validOpenAiMetadata
      .split('\n')
      .filter((line) => !line.includes(`${field}:`))
      .join('\n')
    writeFixtureFile(
      rootDir,
      '.agents/skills/flightwoodx-development/agents/openai.yaml',
      invalidMetadata,
    )

    assertFinding(
      harness.checkHarness(rootDir),
      'invalid-repository-skill',
      '.agents/skills/flightwoodx-development/agents/openai.yaml',
    )
  })
}

test('requires the repository skill default prompt to invoke the skill', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    '.agents/skills/flightwoodx-development/agents/openai.yaml',
    validOpenAiMetadata.replace('$flightwoodx-development', 'FlightWoodX'),
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'invalid-repository-skill',
    '.agents/skills/flightwoodx-development/agents/openai.yaml',
  )
})

test('rejects nested CURRENT_STATUS.md files', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'apps/web/CURRENT_STATUS.md', '# Stale status\n')

  assertFinding(
    harness.checkHarness(rootDir),
    'nested-current-status',
    'apps/web/CURRENT_STATUS.md',
  )
})

test('rejects the legacy root skills directory', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'skills/legacy/SKILL.md', '# Legacy\n')

  assertFinding(
    harness.checkHarness(rootDir),
    'legacy-skill-discovery',
    'skills',
  )
})

test('rejects a dangling .claude/skills symbolic link', () => {
  const rootDir = createValidRepository()
  mkdirSync(join(rootDir, '.claude'), { recursive: true })
  symlinkSync('missing-skills', join(rootDir, '.claude/skills'), 'dir')

  assertFinding(
    harness.checkHarness(rootDir),
    'legacy-skill-discovery',
    '.claude/skills',
  )
})

test('rejects skills-lock.json', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'skills-lock.json', '{"skills":[]}\n')

  assertFinding(
    harness.checkHarness(rootDir),
    'legacy-skill-discovery',
    'skills-lock.json',
  )
})

test('rejects nested local Claude permission settings', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(
    rootDir,
    'packages/shared/.claude/settings.local.json',
    '{"permissions":{"allow":["Bash(git push:*)"]}}\n',
  )

  assertFinding(
    harness.checkHarness(rootDir),
    'local-agent-settings',
    'packages/shared/.claude/settings.local.json',
  )
})

test('CLI exits non-zero and reports actionable findings', () => {
  const rootDir = createValidRepository()
  writeFixtureFile(rootDir, 'apps/api/src/route.tsx', 'export {}\n')
  const result = spawnSync(process.execPath, [scriptPath, rootDir], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /api-source-language/)
  assert.match(result.stderr, /apps\/api\/src\/route\.tsx/)
})

test('root scripts and GitHub CI execute the harness', () => {
  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
  const workflow = readFileSync(
    join(repositoryRoot, '.github/workflows/ci.yml'),
    'utf8',
  )

  assert.equal(packageJson.scripts.harness, 'node scripts/check-harness.mjs')
  assert.match(packageJson.scripts.test, /node --test scripts\/\*\.test\.mjs/)
  assert.equal(packageJson.scripts.check, 'node scripts/check-release.mjs')
  assert.equal(CHECKS.filter(check => check.command === 'pnpm' && check.script === 'harness').length, 1)
  assert.match(workflow, /name: Repository harness\s+command: pnpm harness/)
})

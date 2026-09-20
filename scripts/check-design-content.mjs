import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Ignore presentation attributes only. Text, URLs, images, data, event handlers,
// order and geometry attributes stay in the comparison, even in hidden states.
export function contentSignature(source, file = 'page.tsx') {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const tokens = []
  function visit(node) {
    if (ts.isJsxAttribute(node) && ['className', 'style'].includes(node.name.getText(root))) return
    const children = node.getChildren(root)
    if (!children.length) {
      const text = ts.isJsxText(node) ? node.text.replace(/\s+/g, ' ').trim() : node.getText(root)
      if (text) tokens.push([node.kind, text])
    } else children.forEach(visit)
  }
  visit(root)
  return JSON.stringify(tokens)
}

export function checkDesignContent(base) {
  if (!/^[a-f\d]{7,40}$/.test(base)) throw new Error('Use an exact baseline commit SHA.')
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'apps/web/src'], { encoding: 'utf8' }).trim().split('\n')
  const violations = []
  let checked = 0
  for (const file of files) {
    if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue
    const before = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    let after
    try { after = readFileSync(file, 'utf8') } catch { violations.push(`${file}: missing`); continue }
    checked++
    if (contentSignature(before, file) !== contentSignature(after, file)) violations.push(file)
  }
  const assetChanges = execFileSync('git', ['diff', '--name-only', base, '--', 'apps/web/public'], { encoding: 'utf8' }).trim()
  if (assetChanges) violations.push(...assetChanges.split('\n'))
  return { checked, violations }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkDesignContent(process.argv[2] ?? '')
  console.log(JSON.stringify(result))
  if (result.violations.length) process.exitCode = 1
}

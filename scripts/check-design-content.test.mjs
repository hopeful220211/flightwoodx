import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentSignature } from './check-design-content.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('root design contract pins the upstream design reference', () => {
  assert.ok(readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8').includes('8147538b4226ae41e2487a9179e3bcc1f68e8554'))
})

test('all UI source uses readable auxiliary text, including editor and admin states', () => {
  const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])
  const root = fileURLToPath(new URL('../apps/web/src', import.meta.url))
  const violations = files(root).filter(file => file.endsWith('.tsx') && !file.includes('.test.')).filter(file => /text-\[(?:9|10|11)px\]|tracking-\[0\.(?:12|14|16|18|2)em\]/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(violations, [])
})

test('design-only comparison accepts classes and rejects copy, assets, handlers, order and geometry changes', () => {
  const source = 'const Page = () => <button className="text-sm" onClick={save}>保存<img src="/wood.png" width={20} /></button>'
  assert.equal(contentSignature(source), contentSignature(source.replace('text-sm', 'text-base')))
  for (const [from, to] of [['保存', '立即保存'], ['/wood.png', '/new.png'], ['{save}', '{remove}'], ['{20}', '{40}']]) {
    assert.notEqual(contentSignature(source), contentSignature(source.replace(from, to)))
  }
  assert.notEqual(contentSignature('<div><p>一</p><p>二</p></div>'), contentSignature('<div><p>二</p><p>一</p></div>'))
})

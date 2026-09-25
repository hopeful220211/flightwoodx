import { readdir, mkdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const sourceDir = path.join(publicDir, 'resource/picture')
const outputDir = path.join(publicDir, 'optimized/picture')
let inputBytes = 0
let outputBytes = 0
let count = 0

async function optimize(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name)
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) { await optimize(source, name); continue }
    if (!/\.(png|jpe?g)$/i.test(entry.name)) continue
    const destination = path.join(outputDir, name.replace(/\.[^.]+$/, '.webp'))
    const original = await stat(source)
    const previous = await stat(destination).catch(() => null)
    if (!previous || previous.mtimeMs < original.mtimeMs) {
      await mkdir(path.dirname(destination), { recursive: true })
      await sharp(source).rotate().resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(destination)
    }
    inputBytes += original.size
    outputBytes += (await stat(destination)).size
    count++
  }
}

await optimize(sourceDir)

// Preserve the owner-supplied originals and the existing 1440px fallbacks.
// Additional sizes match the home/about display slots and high-density screens.
const responsiveImages = [
  ['UI/web_1', [360, 640, 720]],
  ['UI/web_2', [320, 640, 960]],
  ['UI/web_3', [320, 640, 960]],
  ['about/team', [384, 768, 1152, 1788]],
  ...['red-dot', 'if-design', 'idea', 'other-awards'].map(name => [`honors/${name}`, [320, 640]]),
]

// These two generated files were superseded by the smaller, sharper existing
// 1396px fallback; keep them out of subsequent public builds.
for (const width of [1080, 1396]) {
  await unlink(path.join(outputDir, `UI/web_1-${width}.webp`)).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
}

let responsiveBytes = 0
const variantScriptModified = (await stat(fileURLToPath(import.meta.url))).mtimeMs
for (const [name, widths] of responsiveImages) {
  const source = path.join(sourceDir, `${name}.png`)
  const original = await stat(source)
  for (const width of widths) {
    const destination = path.join(outputDir, `${name}-${width}.webp`)
    const previous = await stat(destination).catch(() => null)
    if (!previous || previous.mtimeMs < Math.max(original.mtimeMs, variantScriptModified)) {
      await mkdir(path.dirname(destination), { recursive: true })
      await sharp(source).rotate().resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 100, effort: 5 }).toFile(destination)
    }
    responsiveBytes += (await stat(destination)).size
  }
}
console.log(`Public images: ${count} WebP files, ${(inputBytes / 1048576).toFixed(1)} MB → ${(outputBytes / 1048576).toFixed(1)} MB`)
console.log(`Responsive picture variants: ${responsiveImages.reduce((total, [, widths]) => total + widths.length, 0)} files, ${(responsiveBytes / 1048576).toFixed(2)} MB`)

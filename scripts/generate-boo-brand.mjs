import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Keep brand assets on the exact same frame A as the animated mascot.
const component = await readFile('src/components/home/VirtualMascot.astro', 'utf8')
const source = component.match(/const frameA = \[([\s\S]*?)\]/)?.[1] ?? ''
const rows = [...source.matchAll(/'([.OWSEP]{16})'/g)].map((match) => match[1])
assert.equal(rows.length, 16)
const palette = { O: '#212529', W: '#ffffff', S: '#d3d3d3', E: '#212529', P: '#f4a6b8' }
const rgba = Buffer.alloc(16 * 16 * 4)
const pixels = []
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    const fill = palette[rows[y][x]]
    if (!fill) continue
    const offset = (y * 16 + x) * 4
    rgba[offset] = parseInt(fill.slice(1, 3), 16)
    rgba[offset + 1] = parseInt(fill.slice(3, 5), 16)
    rgba[offset + 2] = parseInt(fill.slice(5, 7), 16)
    rgba[offset + 3] = 255
    pixels.push({ x, y, fill })
  }
}
const svg = (size, scale, offset, background = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Boo, the pixel ghost">${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}${pixels.map(({ x, y, fill }) => `<rect x="${offset + x * scale}" y="${offset + y * scale}" width="${scale}" height="${scale}" fill="${fill}"/>`).join('')}</svg>\n`
const image = () => sharp(rgba, { raw: { width: 16, height: 16, channels: 4 } })
const faviconBuffers = await Promise.all(
  [16, 32, 48].map((size) => image().resize(size, size, { kernel: 'nearest' }).png().toBuffer())
)
await writeFile('public/favicon/favicon.svg', svg(16, 1, 0))
await writeFile('public/favicon/favicon-16x16.png', faviconBuffers[0])
await writeFile('public/favicon/favicon-32x32.png', faviconBuffers[1])
// ICO directory with independent, nearest-neighbor PNG frames; no resampling by an ICO encoder.
const directory = Buffer.alloc(6 + 3 * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(3, 4)
let offset = directory.length
for (let i = 0; i < 3; i++) {
  const entry = 6 + i * 16,
    size = [16, 32, 48][i],
    png = faviconBuffers[i]
  directory[entry] = size
  directory[entry + 1] = size
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(png.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += png.length
}
await writeFile('public/favicon/favicon.ico', Buffer.concat([directory, ...faviconBuffers]))
async function card(size) {
  const scale = Math.floor((size * 0.75) / 16),
    width = scale * 16,
    offset = Math.floor((size - width) / 2)
  const ghost = await image().resize(width, width, { kernel: 'nearest' }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: '#f5f5f5' } })
    .composite([{ input: ghost, left: offset, top: offset }])
    .png()
    .toBuffer()
}
for (const [name, size] of [
  ['apple-touch-icon', 180],
  ['android-chrome-192x192', 192],
  ['android-chrome-512x512', 512]
]) {
  await writeFile(`public/favicon/${name}.png`, await card(size))
}
await writeFile('public/avatar-fallback.svg', svg(256, 12, 32, '#f5f5f5'))
const avatar = await card(256)
await writeFile('public/avatar-fallback.png', avatar)
await writeFile('src/assets/avatar.png', avatar)
console.log('Generated Boo SVG, 16/32/48 ICO, touch/PWA icons, and avatar fallbacks.')

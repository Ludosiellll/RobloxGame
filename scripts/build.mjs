// Сборка игр в архивы для консоли Яндекс Игр: npm run build [-- <id>|all]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { build } from 'vite'
import JSZip from 'jszip'
import { ROOT, checkBuild, pickGames, viteConfig, walk } from './lib.mjs'

const ids = pickGames(process.argv[2])
let failed = false
for (const id of ids) {
  await build(viteConfig(id))
  const dir = join(ROOT, 'dist', id)
  const { problems, total, files } = checkBuild(dir)
  const zip = new JSZip()
  for (const f of walk(dir)) zip.file(relative(dir, f).split('\\').join('/'), readFileSync(f))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  mkdirSync(join(ROOT, 'release'), { recursive: true })
  const out = join(ROOT, 'release', `${id}.zip`)
  writeFileSync(out, buf)
  console.log(`${id}: ${files} файлов, ${(total / 1024).toFixed(0)} КБ, архив ${(buf.length / 1024).toFixed(0)} КБ → ${relative(ROOT, out)}`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  if (problems.length) failed = true
}
process.exit(failed ? 1 : 0)

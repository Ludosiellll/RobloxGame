// Запускает собранную программу в проверочном режиме и убеждается, что сцена загрузилась целиком.
// node scripts/desktop-check.mjs <путь к программе> [куда сохранить снимок окна]
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const [exe, shotArg = 'desktop-check.png'] = process.argv.slice(2)
if (!exe) {
  console.error('нужен путь к программе')
  process.exit(2)
}
const shot = resolve(shotArg)
const reportFile = shot + '.json'
rmSync(shot, { force: true })
rmSync(reportFile, { force: true })

const args = process.platform === 'linux' ? ['--no-sandbox'] : []
const child = spawn(resolve(exe), args, { env: { ...process.env, MAKET_SHOT: shot }, stdio: 'ignore' })
const timer = setTimeout(() => {
  child.kill()
  console.error((process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '') + 'программа не завершилась за 150 с')
  process.exit(1)
}, 150000)
child.on('error', (e) => {
  clearTimeout(timer)
  console.error((process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '') + 'не удалось запустить: ' + e.message)
  process.exit(1)
})
child.on('exit', () => {
  clearTimeout(timer)
  if (!existsSync(reportFile)) {
    console.error((process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '') + 'программа закрылась, не оставив отчёта')
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(reportFile, 'utf8'))
  const st = report.state
  const problems = []
  if (!st) problems.push('приложение не запустилось внутри окна')
  else {
    if (!(st.items > 0)) problems.push('в сцене нет предметов')
    if (st.loaded !== st.items) problems.push(`загружено моделей ${st.loaded} из ${st.items}`)
    if (!(st.fonts >= 6)) problems.push(`загружено шрифтов ${st.fonts}`)
    if (!st.db.includes('maket-db')) problems.push('хранилище моделей не открылось')
  }
  if (!existsSync(shot) || statSync(shot).size < 20000) problems.push('снимок окна пустой')
  // на GitHub результат попадает в заметки к запуску — их видно без входа в аккаунт
  const ci = process.env.GITHUB_ACTIONS === 'true'
  console.log(JSON.stringify(report))
  if (problems.length) {
    console.error((ci ? '::error::' : '') + 'НЕ ПРОШЛО: ' + problems.join('; ') + ' ' + JSON.stringify(report).slice(0, 600))
    process.exit(1)
  }
  console.log((ci ? '::notice::' : '') + `программа запустилась, сцена загружена: моделей ${st.loaded}, шрифтов ${st.fonts}, окно ${report.size.width}×${report.size.height}`)
})

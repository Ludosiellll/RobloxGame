// Шаблон: проверка конвейера (SDK, реклама за награду, сохранения, пауза, языки).
// Новая игра: npm run new-game -- <id>, затем заменить этот файл своей игрой.

import { boot, markReady } from '@shared/boot'
import { fullscreenCanvas } from '@shared/canvas'
import { createI18n } from '@shared/i18n'

// Без await на верхнем уровне: его не понимают старые Safari на телефонах.
async function start() {
  const platform = await boot({ saveKey: 'template-v1', languages: ['ru', 'en', 'tr'] })
  const t = createI18n(
    {
      ru: { coins: 'Монеты: {n}', tap: 'Нажми!', reward: '+50 монет за рекламу', paused: 'Пауза' },
      en: { coins: 'Coins: {n}', tap: 'Tap!', reward: '+50 coins for an ad', paused: 'Paused' },
      tr: { coins: 'Altın: {n}', tap: 'Dokun!', reward: 'Reklam için +50 altın', paused: 'Duraklatıldı' },
    },
    platform.lang,
  )

  const save = await platform.load({ coins: 0 })
  const ui = document.getElementById('ui') as HTMLDivElement
  const screen = fullscreenCanvas(document.getElementById('game') as HTMLCanvasElement)

  const tap = document.createElement('button')
  tap.textContent = t('tap')
  tap.onclick = () => {
    save.coins += 1
    platform.save(save)
  }
  const reward = document.createElement('button')
  reward.textContent = t('reward')
  reward.onclick = async () => {
    reward.disabled = true
    if (await platform.showRewarded()) {
      save.coins += 50
      platform.save(save)
    }
    reward.disabled = false
  }
  ui.append(reward, tap)

  platform.onPause(() => platform.gameplayStop())
  platform.onResume(() => platform.gameplayStart())

  let pulse = 0
  function frame(time: number) {
    const { ctx, width, height } = screen
    if (!platform.paused) pulse = (Math.sin(time / 300) + 1) / 2
    ctx.fillStyle = '#14161f'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffd34d'
    ctx.beginPath()
    ctx.arc(width / 2, height * 0.38, Math.min(width, height) * (0.12 + pulse * 0.02), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '600 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(platform.paused ? t('paused') : t('coins', { n: save.coins }), width / 2, height * 0.14)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  document.getElementById('loading')?.remove()
  markReady(platform)
  platform.gameplayStart()
}

void start()

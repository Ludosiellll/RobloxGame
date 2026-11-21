// Новая игра из шаблона: npm run new-game -- <id> (латиница, цифры, дефис)
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { GAMES } from './lib.mjs'

const id = process.argv[2]
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Укажи id игры: латиница, цифры, дефис. Пример: npm run new-game -- meteor-merge')
  process.exit(1)
}
const target = join(GAMES, id)
if (existsSync(target)) {
  console.error(`games/${id} уже есть`)
  process.exit(1)
}
cpSync(join(GAMES, '_template'), target, { recursive: true })
console.log(`Создана games/${id}. Поменяй saveKey в src/main.ts и название в game.json.`)

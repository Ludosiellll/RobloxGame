// Локальный запуск игры: npm run dev -- <id>
import { createServer } from 'vite'
import { pickGames, viteConfig } from './lib.mjs'

const [id] = pickGames(process.argv[2] ?? '_template')
const server = await createServer({ ...viteConfig(id), logLevel: 'info', server: { host: true, port: 5173 } })
await server.listen()
server.printUrls()

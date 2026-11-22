import { defineConfig } from 'vitest/config'

// Один файл скрипта со стабильным именем: так страницу проще публиковать и оборачивать в программу.
import pkg from './package.json'

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
})

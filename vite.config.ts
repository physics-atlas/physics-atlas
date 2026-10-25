/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'

// `npm run dev` compiles content/ once at startup; this recompiles whenever a
// concept or page file changes, so an edit shows up without restarting: a
// concept recompiles the concepts and then the pages (their numbers and the
// Typst equations follow the concepts), a page just the pages. The
// regenerated files under src/data/ then reload as usual.
function recompileContent(): Plugin {
  const concepts = resolve('content/concepts')
  const pages = resolve('content/pages')
  return {
    name: 'recompile-content',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add([concepts, pages])
      const script = (name: string) =>
        new Promise<boolean>((done) =>
          execFile(process.execPath, [`scripts/${name}`], (error, stdout, stderr) => {
            if (error) server.config.logger.error(stderr.trim() || error.message, { timestamp: true })
            else server.config.logger.info(stdout.trim(), { timestamp: true })
            done(!error)
          }),
        )
      const run = async (file: string) => {
        const path = resolve(file)
        if (path.startsWith(concepts)) {
          if (await script('compile-concepts.mjs')) await script('compile-pages.mjs')
        } else if (path.startsWith(pages)) await script('compile-pages.mjs')
      }
      server.watcher.on('add', run).on('change', run).on('unlink', run)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), recompileContent()],
  test: {
    // Vitest 5 caches transformed modules on disk, keyed by their own content,
    // so an import.meta.glob (the proposal fixtures) keeps the file list it was
    // first expanded with: an added or broken fixture would go unnoticed.
    fsModuleCache: false,
  },
})

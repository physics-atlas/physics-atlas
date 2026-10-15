import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'

// `npm run dev` compiles content/concepts once at startup; this recompiles
// whenever a concept file changes, so editing a node file shows up on the map
// without restarting. The regenerated src/data/concepts.json then reloads as usual.
function recompileConcepts(): Plugin {
  const dir = resolve('content/concepts')
  return {
    name: 'recompile-concepts',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(dir)
      const run = (file: string) => {
        if (!resolve(file).startsWith(dir)) return
        execFile(process.execPath, ['scripts/compile-concepts.mjs'], (error, stdout, stderr) => {
          if (error) server.config.logger.error(stderr.trim() || error.message, { timestamp: true })
          else server.config.logger.info(stdout.trim(), { timestamp: true })
        })
      }
      server.watcher.on('add', run).on('change', run).on('unlink', run)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), recompileConcepts()],
})

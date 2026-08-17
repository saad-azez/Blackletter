import { copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = dirname(fileURLToPath(import.meta.url))

const WEBFLOW_PAGE_FILES = ['blackletter-page.js', 'blackletter-page.css']

/**
 * The Webflow page script and stylesheet are pasted into the live site as a
 * <script> and a <link>, so they have to be reachable from a real CDN.
 *
 * They used to be served through jsDelivr's GitHub proxy
 * (cdn.jsdelivr.net/gh/saad-azez/Blackletter@<hash>/webflow/...), which
 * stopped being able to fetch this repo AT ALL — every ref and every path
 * answers 404 "Failed to fetch saad-azez/Blackletter from GitHub", old
 * pinned commits included — and took the whole page down with it: no page
 * script means no curtain, no section intros and no smooth scroll.
 *
 * Emitting them into the build instead puts them on the project's own Vercel
 * deployment, the same origin that already serves the 3D assets: one origin,
 * deployed automatically on push, and no cache purging (Vercel serves these
 * must-revalidate, so a finished deploy is live immediately).
 */
function emitWebflowPageAssets() {
  return {
    name: 'blackletter-webflow-page-assets',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(projectRoot, 'dist/webflow')

      mkdirSync(outDir, { recursive: true })
      WEBFLOW_PAGE_FILES.forEach((file) => {
        copyFileSync(resolve(projectRoot, 'webflow', file), resolve(outDir, file))
      })

      // The 3D islands load their GLBs and textures by absolute URL, and
      // those URLs pointed at raw.githack.com, a GitHub raw proxy that
      // answers 503 and 429 (rate limited) often enough to leave the page
      // with no 3D at all — and to stall the gated preloader into its 20s
      // safety cap, which is the long dark screen before the hero appears.
      //
      // Mirrored at the SAME path the proxy used, so swapping the host in
      // the Webflow component props is all those URLs need:
      //   raw.githack.com/saad-azez/Blackletter/main/src/assets/…
      //   →  <this deployment>/src/assets/…
      cpSync(resolve(projectRoot, 'src/assets'), resolve(projectRoot, 'dist/src/assets'), {
        recursive: true,
      })
    },
  } as const
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), emitWebflowPageAssets()],
})

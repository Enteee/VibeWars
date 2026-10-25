import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/**
 * The client is a plain ESM app — no framework. The HTML/CSS shell owns menus
 * and build editors; Phaser owns only the game viewport (brief §21).
 */
export default defineConfig({
  // The GitHub Pages deploy (#103) serves the client under a sub-path
  // (`/VibeWars/`, `/VibeWars/next/`). Read at config time, so it is not a
  // `VITE_` variable. Dev and the server-served build stay at the root.
  base: process.env.VIBEWARS_BASE ?? "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Phaser is large; a visible budget keeps us honest about what we add.
    chunkSizeWarningLimit: 1600,
    sourcemap: true,
    // The sandboxed music host is a second page (ADR-0028).
    rolldownOptions: {
      input: { main: "index.html", "music-host": "music-host.html" },
    },
  },
  resolve: {
    alias: {
      // Strudel's repl builds a Kabelsalat REPL no track uses (ADR-0028).
      "@kabelsalat/web": fileURLToPath(
        new URL("./src/music/host/shims/kabelsalat-web.ts", import.meta.url),
      ),
    },
  },
  // The music host has an opaque origin, so its own module scripts and
  // samples are cross-origin fetches with `Origin: null` (ADR-0028).
  preview: { cors: { origin: "*" } },
  server: {
    // Only the opaque host's `Origin: null` may read cross-origin. Any
    // site's sandboxed frame sends that too, so the dev server serves
    // nothing outside the code the game is built from: never the repo
    // root, where `.bots/` keeps the company's logs (CVE-2025-24010).
    cors: { origin: "null" },
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../../packages", import.meta.url)),
        fileURLToPath(new URL("../../node_modules", import.meta.url)),
      ],
    },
    port: 5173,
    strictPort: true,
    // No proxy to the game server. The client addresses it directly via
    // `VITE_VIBEWARS_SERVER` (see `resolveEndpoint`), because Colyseus
    // opens its WebSocket at `/<processId>/<roomId>` — a root-level path
    // that cannot be pattern-matched apart from Vite's own HMR socket
    // without guessing. An earlier proxy here claimed to forward the
    // websocket and never did; it only forwarded matchmaking.
  },
});

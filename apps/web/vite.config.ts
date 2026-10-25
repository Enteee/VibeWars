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
    // Spike (#368): the sandboxed music host is a second entry.
    rolldownOptions: {
      input: { main: "index.html", "music-host": "music-host.html" },
    },
  },
  // Spike (#368): the opaque-origin music host fetches its own module
  // scripts and samples in CORS mode, with `Origin: null`.
  resolve: {
    alias: {
      "@kabelsalat/web": new URL("./src/music/host/shims/kabelsalat-web.ts", import.meta.url)
        .pathname,
    },
  },
  preview: { cors: { origin: "*" } },
  server: {
    cors: { origin: "*" },
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

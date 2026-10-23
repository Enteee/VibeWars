import { defineConfig } from "vite";

/**
 * The client is a plain ESM app — no framework. The HTML/CSS shell owns menus
 * and build editors; Phaser owns only the game viewport (brief §21).
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Phaser is large; a visible budget keeps us honest about what we add.
    chunkSizeWarningLimit: 1600,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Colyseus matchmaking + websocket during `vite dev`.
      "/matchmake": { target: "http://localhost:2567", changeOrigin: true },
      "/healthz": { target: "http://localhost:2567", changeOrigin: true },
    },
  },
});

import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// The page `scripts/assets/render-sfx.mjs` renders sound effects in. Built
// apart from the game: it ships nowhere.
export default defineConfig({
  root: fileURLToPath(new URL("sfx-render", import.meta.url)),
  base: "./",
  build: { outDir: process.env.SFX_RENDER_OUT ?? "dist-sfx", emptyOutDir: true },
});

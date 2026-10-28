import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

// The transport the client plays over (#403): see `src/net/transport/index.ts`.
// A typo would otherwise build a client that quietly uses Trystero.
const TRANSPORT = process.env.VITE_VIBEWARS_TRANSPORT;
if (TRANSPORT !== undefined && TRANSPORT !== "trystero" && TRANSPORT !== "broadcast") {
  throw new Error(
    `VITE_VIBEWARS_TRANSPORT must be "trystero" or "broadcast", got ${JSON.stringify(TRANSPORT)}`,
  );
}

// The vendored GW1 skill corpus is MIT (#1235) and ships to the browser
// (#1220), so its notice ships too, read from the vendored file itself:
// one source of the text, nothing copied into `public/`.
const CORPUS_LICENSE = fileURLToPath(
  new URL("../../packages/game-data/raw/gw-skilldata/LICENSE", import.meta.url),
);
const CORPUS_LICENSE_PATH = "licenses/gw-skilldata.txt";

function corpusLicense(): Plugin {
  return {
    name: "vibewars-corpus-license",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: CORPUS_LICENSE_PATH,
        source: readFileSync(CORPUS_LICENSE, "utf8"),
      });
    },
    // The dev server serves it at the same path, so the credit link works there.
    configureServer(server) {
      const url = `${server.config.base}${CORPUS_LICENSE_PATH}`;
      server.middlewares.use((req, res, next) => {
        if (req.url !== url) {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(readFileSync(CORPUS_LICENSE, "utf8"));
      });
    },
  };
}

/**
 * The client is a plain ESM app — no framework. The HTML/CSS shell owns menus
 * and build editors; Phaser owns only the game viewport (brief §21).
 */
export default defineConfig({
  // The GitHub Pages deploy (#103) serves the client under a sub-path
  // (`/VibeWars/`, `/VibeWars/next/`). Read at config time, so it is not a
  // `VITE_` variable. Dev and the server-served build stay at the root.
  base: process.env.VIBEWARS_BASE ?? "/",
  plugins: [corpusLicense()],
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
  preview: {
    cors: { origin: "*" },
    // Not `localhost`, which listens on `::1` first: Firefox gathers no
    // ICE candidates on a page loaded over IPv6 loopback, so two Firefox
    // windows there never connect (#707).
    host: "127.0.0.1",
  },
  server: {
    // As `preview.host`: Firefox plays peer to peer only from 127.0.0.1 (#707).
    host: "127.0.0.1",
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
  },
});

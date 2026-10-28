import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

import { licencesPlugin } from "./plugins/licences.js";

// The transport the client plays over (#403): see `src/net/transport/index.ts`.
// A typo would otherwise build a client that quietly uses Trystero.
const TRANSPORT = process.env.VITE_VIBEWARS_TRANSPORT;
if (TRANSPORT !== undefined && TRANSPORT !== "trystero" && TRANSPORT !== "broadcast") {
  throw new Error(
    `VITE_VIBEWARS_TRANSPORT must be "trystero" or "broadcast", got ${JSON.stringify(TRANSPORT)}`,
  );
}

// This build's id (#1268): `pages.yml` passes the commit it builds, e2e its
// own. Without one it is `dev`, which never checks for a newer build.
const BUILD = process.env.VIBEWARS_BUILD ?? "dev";
if (!/^[\w.-]+$/.test(BUILD)) {
  throw new Error(
    `VIBEWARS_BUILD must be letters, digits, ".", "_" or "-", got ${JSON.stringify(BUILD)}`,
  );
}

/** `build.json` beside `index.html`: the id a running tab compares its own to. */
function buildFile(): Plugin {
  return {
    name: "vibewars-build-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: `${JSON.stringify({ build: BUILD })}\n`,
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
  define: { __VIBEWARS_BUILD__: JSON.stringify(BUILD) },
  // Every bundled npm package's licence, for Options (#1242, ADR-0039).
  plugins: [licencesPlugin(), buildFile()],
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

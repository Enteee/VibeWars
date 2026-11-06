#!/usr/bin/env node
/**
 * `pnpm sfx:render` — renders every sound effect from its Strudel source to
 * `apps/web/public/sfx/<id>.mp3` (#2524, epic #366 step 10).
 *
 * Each `apps/web/src/audio/sfx/<id>.strudel.js` is evaluated in headless
 * Chromium and its cycle 0 rendered through an `OfflineAudioContext`
 * (22.05 kHz, mono), with `Math.random` seeded so superdough's noise buffers
 * repeat. Node then trims to the length the source's header declares,
 * normalises to its declared peak, and ffmpeg fades 5 ms at both ends and
 * encodes the bit-exact 48 kbit/s MP3 the sound player decodes.
 *
 * The header is the first line of the source:
 *
 *   // sfx cast-self: 0.25 s, peak -16 dBFS
 *
 * An id whose source hash matches `<id>.mp3.hash` beside its output is
 * skipped. A source that fails to evaluate, or renders silence or off its
 * declared peak, stops the run with the id: a build never ships a missing or
 * silent cue.
 *
 *   --out <dir>     write here instead of apps/web/public/sfx
 *   --only <id>     render one id
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourcesDir = path.join(root, "apps/web/src/audio/sfx");

const SAMPLE_RATE = 22050;
const FADE_S = 0.005;
/** How far an encoded cue's peak may sit from the one its header declares. */
const PEAK_TOLERANCE_DB = 0.5;
/** Below this a render is silence. */
const SILENT = 1e-4;
/** Seeds `Math.random`; any constant, but a constant. */
const SEED = 0x5f3759df;

const argv = process.argv.slice(2);
const flag = (/** @type {string} */ name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const outDir = path.resolve(flag("out") ?? path.join(root, "apps/web/public/sfx"));
const only = flag("only");

/**
 * @param {string} id
 * @param {string} source
 * @returns {{ seconds: number, peakDb: number }}
 */
function readHeader(id, source) {
  const m = /^\/\/ sfx ([a-z-]+): ([\d.]+) s, peak (-[\d.]+) dBFS$/m.exec(source);
  if (m?.[1] !== id) {
    throw new Error(`${id}: the header must read "// sfx ${id}: <seconds> s, peak -<dB> dBFS"`);
  }
  return { seconds: Number(m[2]), peakDb: Number(m[3]) };
}

const sources = fs
  .readdirSync(sourcesDir)
  .filter((f) => f.endsWith(".strudel.js"))
  .map((f) => f.slice(0, -".strudel.js".length))
  .filter((id) => only === undefined || id === only)
  .sort()
  .map((id) => {
    const source = fs.readFileSync(path.join(sourcesDir, `${id}.strudel.js`), "utf8");
    return { id, source, ...readHeader(id, source) };
  });

fs.mkdirSync(outDir, { recursive: true });

/**
 * The page's source is part of every hash: a change to the renderer must
 * re-render everything.
 * @param {string} source
 */
const hashOf = (source) =>
  createHash("sha256")
    .update(source)
    .update(fs.readFileSync(path.join(root, "apps/web/sfx-render/render.ts")))
    .update(fs.readFileSync(fileURLToPath(import.meta.url)))
    .digest("hex");

const todo = sources.filter(({ id, source }) => {
  const hashFile = path.join(outDir, `${id}.mp3.hash`);
  return !(
    fs.existsSync(path.join(outDir, `${id}.mp3`)) &&
    fs.existsSync(hashFile) &&
    fs.readFileSync(hashFile, "utf8") === hashOf(source)
  );
});

if (todo.length === 0) {
  console.log(`sfx: ${String(sources.length)} up to date`);
  process.exit(0);
}

// The page, built apart from the game (apps/web/vite.sfx.config.ts).
const pageDir = fs.mkdtempSync(path.join(os.tmpdir(), "sfx-render-"));
const build = spawnSync(
  "pnpm",
  ["--filter", "@vibewars/web", "exec", "vite", "build", "-c", "vite.sfx.config.ts"],
  { env: { ...process.env, SFX_RENDER_OUT: pageDir }, stdio: ["ignore", "ignore", "inherit"] },
);
if (build.status !== 0) throw new Error("the sfx render page did not build");

const MIME = /** @type {Record<string, string>} */ ({
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
});
const server = http.createServer((req, res) => {
  const file = path.join(pageDir, path.normalize(new URL(req.url ?? "/", "http://x").pathname));
  if (!file.startsWith(pageDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const index = path.join(pageDir, "index.html");
    res.writeHead(200, { "content-type": "text/html" }).end(fs.readFileSync(index));
    return;
  }
  res
    .writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" })
    .end(fs.readFileSync(file));
});
await new Promise((resolve) =>
  server.listen(0, "127.0.0.1", () => {
    resolve(undefined);
  }),
);
const address = server.address();
const url = `http://127.0.0.1:${String(typeof address === "object" ? address?.port : 0)}/`;

const executablePath = process.env.VIBEWARS_CHROMIUM;
const browser = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

/**
 * Renders in a fresh page: superdough keeps global audio state, and a page
 * per cue makes one cue's render independent of the others.
 * @param {string} source
 * @param {number} seconds
 * @returns {Promise<number[]>}
 */
async function renderInPage(source, seconds) {
  const page = await browser.newPage();
  try {
    await page.addInitScript((seed) => {
      let a = seed;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, SEED);
    await page.goto(url);
    await page.waitForFunction(() => "renderSfx" in globalThis);
    return await page.evaluate(
      ([s, n]) =>
        /** @type {(s: string, n: number) => Promise<number[]>} */ (
          /** @type {Record<string, unknown>} */ (globalThis).renderSfx
        )(s, n),
      /** @type {[string, number]} */ ([source, seconds]),
    );
  } finally {
    await page.close();
  }
}

/**
 * @param {string} id
 * @param {Float32Array} samples  trimmed, faded and scaled
 * @param {string} file
 */
function encode(id, samples, file) {
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      ...["-loglevel", "error", "-y", "-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", "1"],
      ...["-i", "pipe:0", "-map_metadata", "-1"],
      ...["-fflags", "+bitexact", "-flags:a", "+bitexact", "-id3v2_version", "0"],
      ...["-codec:a", "libmp3lame", "-b:a", "48k", "-ac", "1", "-ar", String(SAMPLE_RATE), file],
    ],
    { input: Buffer.from(samples.buffer), stdio: ["pipe", "inherit", "inherit"] },
  );
  if (ffmpeg.status !== 0) throw new Error(`${id}: ffmpeg failed`);
}

/**
 * @param {Float32Array} samples
 * @returns {number}
 */
function peakOf(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/**
 * @param {string} id
 * @param {string} file
 * @returns {number} dBFS
 */
function decodedPeakDb(id, file) {
  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", file, "-f", "f32le", "-ac", "1", "pipe:1"],
    { maxBuffer: 1 << 26 },
  );
  if (ffmpeg.status !== 0) throw new Error(`${id}: ffmpeg could not decode its output`);
  const out = ffmpeg.stdout;
  const decoded = new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
  return 20 * Math.log10(peakOf(decoded));
}

try {
  for (const { id, source, seconds, peakDb } of todo) {
    let rendered;
    try {
      rendered = await renderInPage(source, seconds);
    } catch (e) {
      throw new Error(`${id}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    const length = Math.round(seconds * SAMPLE_RATE);
    const samples = Float32Array.from(rendered.slice(0, length));
    // 5 ms fades so nothing clicks, then the peak: the fade comes first so
    // a transient at either end is not normalised and then faded away.
    const fade = Math.round(FADE_S * SAMPLE_RATE);
    for (let i = 0; i < fade; i++) {
      samples[i] = (samples[i] ?? 0) * (i / fade);
      const j = samples.length - 1 - i;
      samples[j] = (samples[j] ?? 0) * (i / fade);
    }
    const peak = peakOf(samples);
    if (!(peak > SILENT)) throw new Error(`${id}: the render is silent`);
    console.log(`sfx ${id}: ${seconds.toFixed(2)} s, ${String(peakDb)} dBFS`);
    const file = path.join(outDir, `${id}.mp3`);
    // Normalise, encode, listen to what the browser will decode (MP3
    // overshoots, and a noisy cue's peak moves with it) and correct once.
    let gainDb = peakDb - 20 * Math.log10(peak);
    let heard = Number.NaN;
    for (let pass = 0; pass < 2; pass++) {
      const scaled = samples.map((v) => v * 10 ** (gainDb / 20));
      encode(id, scaled, file);
      heard = decodedPeakDb(id, file);
      if (Math.abs(heard - peakDb) <= PEAK_TOLERANCE_DB / 2) break;
      gainDb += peakDb - heard;
    }
    if (Math.abs(heard - peakDb) > PEAK_TOLERANCE_DB) {
      throw new Error(
        `${id}: encoded peak ${heard.toFixed(2)} dBFS, header declares ${String(peakDb)}`,
      );
    }
    fs.writeFileSync(`${file}.hash`, hashOf(source));
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(pageDir, { recursive: true, force: true });
}

#!/usr/bin/env node
/**
 * `pnpm bench:render` — how long a frame of a layered map takes to draw,
 * against Crossroads on the same run (#3157).
 *
 * Builds the static client, serves it, and opens the live menu background
 * on each map in headless Chromium at 1280×720, as e2e does: picked as a
 * Hosted Game's map, which the background then fights on. Each map draws
 * for `BENCH_SECONDS` (5) after a second to settle; the time between two
 * animation frames is a frame's cost. Prints p50 and p95 per map and the
 * ratio of each to Crossroads'. The percentiles weigh a frame by how long
 * it lasted: what a moment of the run is spent in, so a map that hangs
 * for a second between quick frames does not measure as quick.
 *
 *   BENCH_MAP=a,b      the maps, by id; Crossroads is always measured.
 *                      Default: Crossroads and every map of more than
 *                      one layer.
 *   BENCH_MAX_RATIO=12 exit 1 when a map's p50 is more than this many
 *                      times Crossroads'. CI's regression gate.
 *   --url <url>        measure a client already served there.
 *
 * The menu background never draws faster than 30 fps (#3119): a map
 * under that cap measures as the cap. Software GL is far over it.
 *
 * Browser: VIBEWARS_CHROMIUM (as for e2e), else Playwright's own.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

/* global document, requestAnimationFrame -- in page.evaluate, which runs in the page */

const PORT = 4322;
const MAPS = path.join(import.meta.dirname, "..", "..", "packages", "game-maps", "maps");
const BASELINE = "arena-crossroads";
const SETTLE_MS = 1000;
const SECONDS = Number(process.env.BENCH_SECONDS ?? 5);
const MAX_RATIO =
  process.env.BENCH_MAX_RATIO === undefined ? undefined : Number(process.env.BENCH_MAX_RATIO);
const { values: options } = parseArgs({ options: { url: { type: "string" } } });

/** Every arena map of more than one layer, read from its `map.json`. */
function layeredMaps() {
  return fs
    .readdirSync(MAPS)
    .filter((id) => {
      const file = path.join(MAPS, id, "map.json");
      return (
        fs.existsSync(file) &&
        Number(/"layers":\s*(\d+)/.exec(fs.readFileSync(file, "utf8"))?.[1] ?? 1) > 1
      );
    })
    .sort();
}

/** The maps to measure, Crossroads first. */
function mapsToMeasure() {
  const asked = process.env.BENCH_MAP;
  const ids =
    asked === undefined || asked === ""
      ? layeredMaps()
      : asked
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
  return [BASELINE, ...ids.filter((id) => id !== BASELINE)];
}

/**
 * Serve the static client, built first, and resolve once it answers.
 *
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "render-bench-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    // No splash: the menu, and its background, from load.
    env: { ...process.env, VITE_VIBEWARS_TRANSPORT: "broadcast", VITE_VIBEWARS_SPLASH: "off" },
    detached: true,
  });
  const stop = () => {
    if (child.exitCode === null && child.pid !== undefined) {
      process.kill(-child.pid);
    }
    fs.rmSync(out, { recursive: true, force: true });
  };
  for (let waited = 0; waited < 300 && child.exitCode === null; waited += 1) {
    try {
      if ((await fetch(url)).ok) {
        return { url, stop };
      }
    } catch {
      // Not up yet.
    }
    await sleep(1000);
  }
  stop();
  throw new Error(`the client did not come up at ${url}; is the port taken?`);
}

/**
 * The frame the `p`th percent of the run's time falls in: `frames`
 * sorted ascending, each weighed by its length.
 *
 * @param {readonly number[]} frames
 * @param {number} p
 */
function percentile(frames, p) {
  const total = frames.reduce((sum, frame) => sum + frame, 0);
  let passed = 0;
  for (const frame of frames) {
    passed += frame;
    if (passed >= (total * p) / 100) {
      return frame;
    }
  }
  return NaN;
}

/**
 * Frame times on `mapId`'s menu background, in ms, sorted.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 * @returns {Promise<number[]>}
 */
async function measure(page, mapId) {
  const entry = page
    .locator(".mode-rail")
    .getByRole("button", { name: "Hosted Game", exact: true });
  await entry.click();
  await page.locator(".lobby-map select").selectOption(mapId);
  const background = page.locator("#menu-background");
  await page.waitForFunction(
    (id) => {
      const root = document.querySelector("#menu-background");
      return (
        root instanceof HTMLElement && root.dataset.map === id && root.dataset.shown !== undefined
      );
    },
    mapId,
    { timeout: 60_000 },
  );
  if ((await background.locator("canvas").count()) !== 1) {
    throw new Error(`${mapId}: the menu background has no canvas`);
  }
  await sleep(SETTLE_MS);
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        /** @type {number[]} */
        const frames = [];
        let last = performance.now();
        const end = last + ms;
        /** @param {number} now */
        const step = (now) => {
          frames.push(now - last);
          last = now;
          if (now < end) {
            requestAnimationFrame(step);
          } else {
            resolve(frames.sort((a, b) => a - b));
          }
        };
        requestAnimationFrame(step);
      }),
    SECONDS * 1000,
  );
}

const served = options.url === undefined ? await serve() : undefined;
const url = options.url ?? served?.url ?? "";
const executablePath = process.env.VIBEWARS_CHROMIUM;
let browser;
let failed = false;
try {
  browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  const rows = [];
  for (const mapId of mapsToMeasure()) {
    const frames = await measure(page, mapId);
    rows.push({
      mapId,
      frames: frames.length,
      p50: percentile(frames, 50),
      p95: percentile(frames, 95),
    });
  }
  const base = rows[0]?.p50 ?? NaN;
  console.log("| map | frames | p50 ms | p95 ms | p50 / Crossroads |");
  console.log("|---|---|---|---|---|");
  for (const row of rows) {
    const ratio = row.p50 / base;
    console.log(
      `| ${row.mapId} | ${String(row.frames)} | ${row.p50.toFixed(1)} | ${row.p95.toFixed(1)} | ${ratio.toFixed(2)} |`,
    );
    if (MAX_RATIO !== undefined && !(ratio <= MAX_RATIO)) {
      console.error(
        `${row.mapId}: p50 is ${ratio.toFixed(2)}× Crossroads', over ${String(MAX_RATIO)}×`,
      );
      failed = true;
    }
  }
} finally {
  await browser?.close();
  served?.stop();
}
process.exitCode = failed ? 1 : 0;

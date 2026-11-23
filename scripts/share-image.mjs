#!/usr/bin/env node
/**
 * `pnpm run share:image` — retake the link-preview picture (#3534):
 * apps/web/public/share.png, 1200×630. Not part of CI: a docs tool, run
 * when the look has moved.
 *
 * Builds the client with the BroadcastChannel transport, serves it, and
 * shoots the splash screen (#2884): its live bot-vs-bot fight with the
 * VibeWars name and rule over it, without the "Press any key" line, at
 * 1200×630. ImageMagick then quantises the PNG under 300 KB.
 *
 *   --map <id>     the arena behind the title (default DEFAULT_MAP)
 *   --wait <s>     seconds to let the fight run before the shot (default the map's)
 *   --crop x,y,w,h the part of the 1200×630 page shot, in CSS px, 1200:630
 *                  (default the map's, from CROPS)
 *   --sweep        also keep the whole page every 2 s in $TMPDIR/share-sweep,
 *                  to pick --wait and --crop by eye
 *   --url <url>    shoot a client already served there
 *
 * Wrap in `company heavy`. Browser: VIBEWARS_CHROMIUM, else Playwright's.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

const PORT = 4322;
const SWEEP = path.join(os.tmpdir(), "share-sweep");
/** The map share.png is taken on (#3879). */
const DEFAULT_MAP = "ember-pits";
/**
 * Per map, where its fight is at 1200×630 CSS px and when it is at its
 * busiest: a part of the page shot at 2×, so its bodies are readable.
 *
 * @type {Record<string, { wait: number, crop: Crop } | undefined>}
 */
const CROPS = {
  "ember-pits": { wait: 55, crop: { x: 420, y: 60, width: 600, height: 315 } },
  "arena-canyon": { wait: 14, crop: { x: 300, y: 162, width: 600, height: 315 } },
};
const OUT = path.join(import.meta.dirname, "..", "apps", "web", "public", "share.png");
const { values: options } = parseArgs({
  options: {
    url: { type: "string" },
    map: { type: "string", default: DEFAULT_MAP },
    wait: { type: "string" },
    crop: { type: "string" },
    sweep: { type: "boolean", default: false },
  },
});

const preset = CROPS[options.map];
const wait = Number(options.wait ?? preset?.wait ?? 14);
const CROP = options.crop === undefined ? preset?.crop : parseCrop(options.crop);
if (CROP === undefined) {
  throw new Error(`no crop for ${options.map}: add it to CROPS or pass --crop`);
}

/** @typedef {{ x: number, y: number, width: number, height: number }} Crop */

/**
 * `x,y,w,h` in CSS px of the page, at the page's 1200:630.
 *
 * @param {string} text
 * @returns {Crop}
 */
function parseCrop(text) {
  const [x, y, width, height] = text.split(",").map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width * 630 !== height * 1200) {
    throw new Error(`--crop ${text}: want x,y,w,h with w:h = 1200:630`);
  }
  return { x, y, width, height };
}

async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "share-image-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, VITE_VIBEWARS_TRANSPORT: "broadcast" },
    detached: true,
  });
  const stop = () => {
    if (child.exitCode === null && child.pid !== undefined) {
      process.kill(-child.pid);
    }
    fs.rmSync(out, { recursive: true, force: true });
  };
  for (let waited = 0; waited < 180 && child.exitCode === null; waited += 1) {
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

const server =
  options.url === undefined ? await serve() : { url: options.url, stop: () => undefined };
const work = fs.mkdtempSync(path.join(os.tmpdir(), "share-shot-"));
try {
  const browser = await chromium.launch({
    executablePath: process.env.VIBEWARS_CHROMIUM,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  });
  await page.goto(`${server.url}?splash&menu-background=${options.map}`);
  const splash = page.locator(".splash");
  page.on("pageerror", (error) => {
    console.error("page error:", String(error));
  });
  try {
    await splash.locator(".splash-hint").waitFor({ timeout: 90_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(os.tmpdir(), "share-image-failed.png") });
    console.error(await page.locator("body").innerText());
    throw error;
  }
  // A key starts it, and the fight runs until the name arrives.
  await page.keyboard.press("Space");
  // The title is put up over the fight while it still runs: at the prompt the
  // fight is over, and a card with a title and no battle says nothing. Its
  // band sits across the crop's lower third, wherever on the page the crop is.
  const band = `left:${String(CROP.x)}px!important;width:${String(CROP.width)}px!important;top:${String(CROP.y + CROP.height * 0.68)}px!important`;
  await page.addStyleTag({
    content:
      `.splash-title{visibility:visible!important;background:rgba(0,0,0,.5);inset-inline:auto!important;${band};padding-block:.75rem!important}` +
      ".splash-wordmark{font-size:3rem!important}" +
      ".splash-prompt,.splash-hint{visibility:hidden!important}",
  });
  if (options.sweep) {
    fs.mkdirSync(SWEEP, { recursive: true });
    // Named by the second it was taken at: a 2× page can take seconds to shoot.
    const start = Date.now();
    for (let second = 0; second < wait; second = (Date.now() - start) / 1000) {
      await sleep(2000);
      const name = String(Math.round((Date.now() - start) / 1000)).padStart(2, "0");
      await page.screenshot({ path: path.join(SWEEP, `${options.map}-${name}.png`) });
    }
  } else {
    await sleep(wait * 1000);
  }
  await page.screenshot({ path: path.join(work, "shot.png"), clip: CROP });
  await browser.close();

  execFileSync("magick", [path.join(work, "shot.png"), "-colors", "192", "-strip", OUT]);
  console.log(`${OUT}: ${String(fs.statSync(OUT).size)} bytes`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  server.stop();
}

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
 *   --map <id>     the arena behind the title (default arena-canyon)
 *   --wait <s>     seconds to let the fight run first (default 14)
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
const OUT = path.join(import.meta.dirname, "..", "apps", "web", "public", "share.png");
const { values: options } = parseArgs({
  options: {
    url: { type: "string" },
    map: { type: "string", default: "arena-canyon" },
    wait: { type: "string", default: "14" },
  },
});

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
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
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
  await sleep(Number(options.wait) * 1000);
  await page.keyboard.press("Space");
  await splash.locator(".splash-prompt").waitFor({ timeout: 30_000 });
  // The name and its rule stay; "Press any key" does not belong on a card.
  await page.addStyleTag({ content: ".splash-prompt{visibility:hidden!important}" });
  await sleep(1500);
  await page.screenshot({ path: path.join(work, "shot.png") });
  await browser.close();

  execFileSync("magick", [path.join(work, "shot.png"), "-colors", "192", "-strip", OUT]);
  console.log(`${OUT}: ${String(fs.statSync(OUT).size)} bytes`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  server.stop();
}

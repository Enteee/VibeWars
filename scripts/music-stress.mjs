#!/usr/bin/env node
/**
 * `node scripts/music-stress.mjs` — how the music holds up under load
 * (#420). Not part of CI: timing on a shared runner says nothing.
 *
 * Builds the static client, serves it, and plays 60 s of the Training
 * Ground with `?musicstats`: intensity forced to 3 and one crossfade
 * halfway. Prints one row per second of what the music host counted
 * (apps/web/src/music/host/stats.ts), and the totals, for each load:
 *
 *   chromium  Pixel 7 landscape: no throttle, CPU 4x and 6x (CDP) in the
 *             Training Ground, the same three in `match`, and the menu at 4x
 *             (music alone, no arena)
 *   firefox   no throttle, `?stress=40` (the main thread busy-waits 40 ms
 *             every 100 ms; Firefox has no CPU throttling), and the menu
 *             with it
 *
 * `match` is the heaviest load the client can make in one page: the Training
 * Ground's Armor ladder (six dummies), sound effects on, the HUD showing, and
 * a player who never stops walking, targeting, attacking and casting. There is
 * no 4v4 with bots to play locally; a networked match needs a server.
 *
 * Chromium runs with sandboxed frames in the page's process, as on a
 * phone, so the music shares the game's main thread.
 *
 *   --browser chromium|firefox   one browser only
 *   --seconds <n>                play this long (default 60)
 *   --url <url>                  measure a client already served there, built
 *                                with VITE_VIBEWARS_STRESS=on for `?stress=`
 *   --only <text>               only the loads whose name contains this
 *   --rows                       print every second, not only the totals
 *
 * Browsers: VIBEWARS_CHROMIUM (as for e2e), VIBEWARS_FIREFOX (a Playwright
 * Firefox build; the default is Playwright's own).
 */
/* global window, addEventListener -- in page.evaluate and addInitScript, which run in the page */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium, devices, firefox } from "@playwright/test";

const PORT = 4319;
const { values: options } = parseArgs({
  options: {
    browser: { type: "string" },
    seconds: { type: "string", default: "60" },
    url: { type: "string" },
    rows: { type: "boolean", default: false },
    only: { type: "string" },
  },
});
const SECONDS = Number(options.seconds);
/** The track the crossfade goes to: one no Training Ground map plays by default. */
const CROSSFADE_TO = "last-stand";

/**
 * @typedef {{
 *   ticks: number, lateTicks: number, maxTickGapMs: number, maxTickWorkMs: number,
 *   skippedMs: number,
 *   events: number, lateEvents: number, baseLatencyMs: number, outputLatencyMs: number,
 *   glitches: number | null, glitchMs: number | null,
 *   underruns: number | null, underrunMs: number | null, maxReductionDb: number,
 * }} Stats
 *
 * @typedef {{
 *   name: string, browser: "chromium" | "firefox", cpu: number, stress: number,
 *   screen: "training" | "match" | "menu",
 * }} Load
 */

/** @type {Load[]} */
const LOADS = [
  { name: "no throttle", browser: "chromium", cpu: 1, stress: 0, screen: "training" },
  { name: "CPU 4x", browser: "chromium", cpu: 4, stress: 0, screen: "training" },
  { name: "CPU 6x", browser: "chromium", cpu: 6, stress: 0, screen: "training" },
  { name: "match, no throttle", browser: "chromium", cpu: 1, stress: 0, screen: "match" },
  { name: "match, CPU 4x", browser: "chromium", cpu: 4, stress: 0, screen: "match" },
  { name: "match, CPU 6x", browser: "chromium", cpu: 6, stress: 0, screen: "match" },
  { name: "menu, CPU 4x", browser: "chromium", cpu: 4, stress: 0, screen: "menu" },
  { name: "no stress", browser: "firefox", cpu: 1, stress: 0, screen: "training" },
  { name: "stress=40", browser: "firefox", cpu: 1, stress: 40, screen: "training" },
  { name: "menu, stress=40", browser: "firefox", cpu: 1, stress: 40, screen: "menu" },
];

/**
 * Serve the static client, built first, and resolve once it answers.
 *
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  // Outside the checkout, so the build leaves nothing behind to ignore.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "music-stress-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    // The one build where `?stress=` works.
    env: { ...process.env, VITE_VIBEWARS_ONLINE: "off", VITE_VIBEWARS_STRESS: "on" },
    detached: true,
  });
  // `exitCode` stays null while it runs, as a server should.
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

/**
 * @param {"chromium" | "firefox"} browser
 * @returns {Promise<import("@playwright/test").Browser>}
 */
function launch(browser) {
  if (browser === "chromium") {
    const executablePath = process.env.VIBEWARS_CHROMIUM;
    return chromium.launch({
      ...(executablePath === undefined ? {} : { executablePath }),
      // Autoplay needs no gesture for the test, and a sandboxed frame stays
      // in the page's process, as it does on Android.
      args: [
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=IsolateSandboxedIframes",
        "--disable-site-isolation-trials",
      ],
    });
  }
  const executablePath = process.env.VIBEWARS_FIREFOX;
  return firefox.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    firefoxUserPrefs: { "media.autoplay.default": 0 },
  });
}

/**
 * Play one load and collect what the music host reported, a row a second.
 *
 * @param {string} url
 * @param {Load} load
 * @returns {Promise<Stats[]>}
 */
async function measure(url, load) {
  const browser = await launch(load.browser);
  try {
    const device = devices["Pixel 7 landscape"];
    const context = await browser.newContext(
      load.browser === "chromium"
        ? device
        : { viewport: device.viewport, userAgent: device.userAgent },
    );
    const page = await context.newPage();
    // Every stats message, so no second is missed or read twice.
    await page.addInitScript(() => {
      /** @type {unknown[]} */
      const seen = [];
      Object.assign(window, { musicStatsSeen: seen });
      addEventListener("message", (event) => {
        const data = /** @type {unknown} */ (event.data);
        if (typeof data === "object" && data !== null && "type" in data && data.type === "stats") {
          seen.push(data);
        }
      });
    });
    const query = `?musicstats${load.stress > 0 ? `&stress=${String(load.stress)}` : ""}`;
    await page.goto(`${url}${query}`);
    await page.locator(".roster").waitFor();
    if (load.screen !== "menu") {
      await page.getByRole("button", { name: "new character" }).click();
      await page.locator(".editor-row select").first().selectOption("elementalist");
      // The arena needs WebGL, which a headless Firefox may not have. The
      // music plays on regardless, so it is measured on the editor screen.
      try {
        await page.locator(".training canvas").waitFor({ timeout: 15_000 });
      } catch {
        console.log(`(${load.browser}: no Training Ground here, measured on the editor)`);
      }
    } else {
      await page.locator("body").click({ position: { x: 5, y: 5 } });
    }
    if (load.screen === "match") {
      await page.locator("select.training-scenario").selectOption("armor-ladder");
    }
    await page.waitForFunction(() => "__musicStats" in window, undefined, { timeout: 30_000 });

    if (load.cpu > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: load.cpu });
    }
    const start = await page.evaluate(() => {
      const control = /** @type {{ __music: { intensity: (level: number) => void } }} */ (
        /** @type {unknown} */ (window)
      ).__music;
      control.intensity(3);
      return /** @type {{ musicStatsSeen: unknown[] }} */ (/** @type {unknown} */ (window))
        .musicStatsSeen.length;
    });
    const playing = load.screen === "match" ? play(page) : undefined;
    await sleep((SECONDS * 1000) / 2);
    await page.evaluate((trackId) => {
      const control = /** @type {{ __music: { crossfadeTo: (id: string) => void } }} */ (
        /** @type {unknown} */ (window)
      ).__music;
      control.crossfadeTo(trackId);
    }, CROSSFADE_TO);
    await sleep((SECONDS * 1000) / 2);
    await playing?.stop();
    const seen = await page.evaluate(
      () =>
        /** @type {{ musicStatsSeen: unknown[] }} */ (/** @type {unknown} */ (window))
          .musicStatsSeen,
    );
    return /** @type {Stats[]} */ (seen.slice(start));
  } finally {
    await browser.close();
  }
}

/**
 * A player at the keyboard: arm the arena with a click, then walk about,
 * target, attack and cast without a pause until stopped.
 *
 * @param {import("@playwright/test").Page} page
 */
function play(page) {
  const state = { going: true };
  const done = (async () => {
    const box = await page.locator(".training canvas").boundingBox();
    if (box === null) {
      return;
    }
    // Clicks go to the canvas's coordinates: the stage's hint paints over its corner.
    const click = (/** @type {number} */ fx, /** @type {number} */ fy) =>
      page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await click(0.5, 0.5);
    const walks = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (let round = 0; state.going; round += 1) {
      const walk = walks[round % walks.length] ?? "ArrowRight";
      await page.keyboard.down(walk);
      // The default keymap: Tab targets, Space attacks, Q-F cast.
      for (const key of ["Tab", "Space", "KeyQ", "KeyW", "KeyE", "KeyR"]) {
        await page.keyboard.press(key);
        await sleep(40);
      }
      await page.keyboard.up(walk);
    }
  })();
  return {
    stop: async () => {
      state.going = false;
      await done;
    },
  };
}

/** @param {number} value */
const fixed = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * @param {Load} load
 * @param {Stats[]} rows
 */
function report(load, rows) {
  const sum = (/** @type {keyof Stats} */ key) =>
    rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const max = (/** @type {keyof Stats} */ key) =>
    rows.reduce((most, row) => Math.max(most, row[key] ?? 0), 0);
  const first = rows[0];
  const last = rows.at(-1);
  console.log(`\n## ${load.browser}, ${load.name} (${String(rows.length)} s)`);
  if (options.rows) {
    console.log(
      "s | ticks | late ticks | max gap ms | max tick work ms | skipped ms | events | late events | underrun ms | max reduction dB | glitches",
    );
    rows.forEach((row, i) => {
      console.log(
        [
          i + 1,
          row.ticks,
          row.lateTicks,
          row.maxTickGapMs,
          row.maxTickWorkMs,
          row.skippedMs,
          row.events,
          row.lateEvents,
          row.underrunMs ?? "-",
          row.maxReductionDb,
        ]
          .map((value) => (value === "-" ? value : fixed(value)))
          .concat(row.glitches === null ? "-" : String(row.glitches))
          .join(" | "),
      );
    });
  }
  // Cumulative since the context started: the run's share is last minus first.
  const glitches =
    first?.glitches == null || last?.glitches == null
      ? "n/a"
      : `${String(last.glitches - first.glitches)} (${fixed((last.glitchMs ?? 0) - (first.glitchMs ?? 0))} ms)`;
  // Per second, not cumulative; `null` where the browser cannot say.
  const underruns = rows.some((row) => row.underrunMs === null)
    ? "n/a"
    : `${String(sum("underruns"))} s (${fixed(sum("underrunMs"))} ms)`;
  console.log(
    `ticks ${String(sum("ticks"))}, late ${String(sum("lateTicks"))}, max gap ${fixed(max("maxTickGapMs"))} ms, max tick work ${fixed(max("maxTickWorkMs"))} ms, ` +
      `skipped ${fixed(sum("skippedMs"))} ms, events ${String(sum("events"))}, ` +
      `late events ${String(sum("lateEvents"))}, glitches ${glitches}, ` +
      `underruns ${underruns}, max reduction ${fixed(Math.min(0, ...rows.map((r) => r.maxReductionDb)))} dB, ` +
      `latency base ${fixed(last?.baseLatencyMs ?? 0)} / output ${fixed(last?.outputLatencyMs ?? 0)} ms`,
  );
}

const served =
  options.url === undefined
    ? await serve()
    : {
        url: options.url,
        stop: () => {
          // Someone else's server: theirs to stop.
        },
      };
try {
  for (const load of LOADS.filter(
    (l) =>
      (options.browser === undefined || l.browser === options.browser) &&
      (options.only === undefined || l.name.includes(options.only)),
  )) {
    report(load, await measure(served.url, load));
  }
} finally {
  served.stop();
}

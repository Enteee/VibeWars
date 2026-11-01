#!/usr/bin/env node
/**
 * `node scripts/music-stress.mjs` — how the music holds up under load
 * (#420). Not part of CI: timing on a shared runner says nothing.
 *
 * Builds the static client, serves it, and plays 60 s of the Training
 * Ground with `?musicstats`: intensity forced (3 unless
 * `--intensity`) and one crossfade
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
 *   --intensity <n>              the intensity it plays at (default 3)
 *   --url <url>                  measure a client already served there, built
 *                                with VITE_VIBEWARS_STRESS=on for `?stress=`
 *   --only <text>               only the loads whose name contains this
 *   --rows                       print every second, not only the totals
 *   --pulse                      render to a real-time stream: start a user
 *                                PulseAudio with a null sink for the run.
 *                                Without a sound device a browser's audio
 *                                clock may be a fake that never underruns.
 *   --reactivity                 instead of the minute at intensity 3, step
 *                                the music through changes and print how late
 *                                each is heard (#509): intensity +1, -1, +2,
 *                                0-1-0-1 within a second, a switch, an edit
 *   --json <file>                write the totals per browser and load, and
 *                                whether each browser's readings are
 *                                validated (#519), to this file
 *
 * `audiostress` loads (#519) busy-wait that many ms in every render quantum
 * of the music's audio thread (`?audiostress=`, 2.5 ms is about 95 % of the
 * budget at 48 kHz), on the menu, music alone. A browser whose underrunMs
 * does not stay near 0 at 0 and rise with the stress is *unvalidated*: its
 * numbers are printed and marked, and nobody tunes from them.
 *
 * Every load has a deadline (#1311): a page whose main thread stops would
 * otherwise hold the run to the job's timeout. `max(180 s, 3 x the load's
 * planned seconds)`, or `MUSIC_MEASURE_DEADLINE_S` seconds when set. A load
 * past it is logged as `HUNG ... at <step>`, its browser killed, and recorded
 * in the JSON as `hung: { step, seconds }` without totals; the run goes on.
 *
 * Browsers: VIBEWARS_CHROMIUM (as for e2e), VIBEWARS_FIREFOX (a Playwright
 * Firefox build; the default is Playwright's own, which must match the
 * pinned @playwright/test). Firefox runs with its content sandbox off
 * (MOZ_DISABLE_CONTENT_SANDBOX), as Chromium runs --no-sandbox: the jail and
 * the runner have no user namespaces for it.
 */
/* global window, document, MutationObserver, addEventListener -- in page.evaluate and addInitScript, which run in the page */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium, devices, firefox } from "@playwright/test";

import { validated } from "./music-stress-validation.mjs";

const PORT = 4319;
const { values: options } = parseArgs({
  options: {
    browser: { type: "string" },
    seconds: { type: "string", default: "60" },
    url: { type: "string" },
    rows: { type: "boolean", default: false },
    only: { type: "string" },
    pulse: { type: "boolean", default: false },
    json: { type: "string" },
    reactivity: { type: "boolean", default: false },
    intensity: { type: "string", default: "3" },
  },
});
const SECONDS = Number(options.seconds);
const INTENSITY = Number(options.intensity);
/** The track the crossfade goes to: one no Training Ground map plays by default. */
const CROSSFADE_TO = "last-stand";

/**
 * @typedef {{
 *   ticks: number, lateTicks: number, maxTickGapMs: number, maxTickWorkMs: number,
 *   skippedMs: number,
 *   events: number, droppedEvents: number, baseLatencyMs: number, outputLatencyMs: number,
 *   glitches: number | null, glitchMs: number | null,
 *   underruns: number | null, underrunMs: number | null, maxReductionDb: number,
 * }} Stats
 *
 * @typedef {{
 *   name: string, browser: "chromium" | "firefox", cpu: number, stress: number,
 *   audioStress?: number,
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
  { name: "menu, no stress", browser: "firefox", cpu: 1, stress: 0, screen: "menu" },
  { name: "no stress", browser: "firefox", cpu: 1, stress: 0, screen: "training" },
  { name: "stress=40", browser: "firefox", cpu: 1, stress: 40, screen: "training" },
  { name: "menu, stress=40", browser: "firefox", cpu: 1, stress: 40, screen: "menu" },
  ...["chromium", "firefox"].flatMap((browser) =>
    [0, 1.5, 2.5].map((audioStress) => ({
      name: `audiostress ${String(audioStress)}`,
      browser: /** @type {"chromium" | "firefox"} */ (browser),
      cpu: 1,
      stress: 0,
      audioStress,
      screen: /** @type {const} */ ("menu"),
    })),
  ),
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
    env: { ...process.env, VITE_VIBEWARS_STRESS: "on" },
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
    env: {
      ...process.env,
      MOZ_DISABLE_CONTENT_SANDBOX: "1",
      // Firefox dlopens libpulse; a Nix build does not find it by itself.
      // It is put in front of the inherited path, not instead of it, which
      // other libraries may need; an empty entry would mean the cwd.
      ...(process.env.VIBEWARS_PULSE_LIB === undefined
        ? {}
        : {
            LD_LIBRARY_PATH: [process.env.VIBEWARS_PULSE_LIB, process.env.LD_LIBRARY_PATH]
              .filter(Boolean)
              .join(":"),
          }),
    },
  });
}

/** Seconds a browser gets to close before it is killed. */
const CLOSE_CAP_S = 20;
/** Lines of each distinct page message forwarded per load; the rest are counted. */
const FORWARDED_LINES = 5;
/** Seconds a load takes besides the music playing: start-up and the page's setup. */
const SETUP_S = 30;
/** What `steps` takes, in seconds: its settles, the quick changes and the crossfade wait. */
const REACTIVITY_S = 69;

/**
 * @typedef {{
 *   step: string,
 *   abandoned: boolean,
 *   browser: import("@playwright/test").Browser | undefined,
 * }} Progress
 */

/**
 * Close a browser, and kill its process if it will not close in time.
 *
 * @param {import("@playwright/test").Browser | undefined} browser
 */
async function shut(browser) {
  if (browser === undefined) {
    return;
  }
  const closed = await Promise.race([
    browser.close().then(
      () => true,
      () => true,
    ),
    sleep(CLOSE_CAP_S * 1000).then(() => false),
  ]);
  if (!closed) {
    console.log(`(the browser did not close in ${String(CLOSE_CAP_S)} s: killed)`);
    // Playwright launches the browser as a process of its own; the types do not say so.
    /** @type {{ process?: () => { kill: (signal: string) => void } | undefined }} */ (
      /** @type {unknown} */ (browser)
    )
      .process?.()
      ?.kill("SIGKILL");
  }
}

/** The seconds a load may take before it counts as hung. */
function deadlineSeconds() {
  const override = process.env.MUSIC_MEASURE_DEADLINE_S;
  if (override !== undefined) {
    const seconds = Number(override);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`MUSIC_MEASURE_DEADLINE_S must be a positive number, not "${override}"`);
    }
    return seconds;
  }
  return Math.max(180, 3 * (SETUP_S + (options.reactivity ? REACTIVITY_S : SECONDS)));
}

/**
 * Measure one load within its deadline.
 *
 * @param {string} url
 * @param {Load} load
 * @returns {Promise<{ rows: Stats[] } | { hung: { step: string, seconds: number } }>}
 */
async function measureWithDeadline(url, load) {
  /** @type {Progress} */
  const progress = { step: "launch", abandoned: false, browser: undefined };
  const started = Date.now();
  const work = measure(url, load, progress).then((rows) => ({ rows }));
  // If the deadline wins, whatever the abandoned load throws later is not news.
  work.catch(() => undefined);
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const expired = /** @type {Promise<"expired">} */ (
    new Promise((resolve) => {
      timer = setTimeout(resolve, deadlineSeconds() * 1000, "expired");
    })
  );
  try {
    const outcome = await Promise.race([work, expired]);
    if (outcome !== "expired") {
      return /** @type {{ rows: Stats[] }} */ (outcome);
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
      `HUNG ${load.browser} "${load.name}" at ${progress.step} after ${String(seconds)} s`,
    );
    progress.abandoned = true;
    await shut(progress.browser);
    return { hung: { step: progress.step, seconds } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Play one load and collect what the music host reported, a row a second.
 *
 * @param {string} url
 * @param {Load} load
 * @param {Progress} progress  `step` is where this is, for the deadline to name
 * @returns {Promise<Stats[]>}
 */
async function measure(url, load, progress) {
  /** @type {Map<string, number>} */
  const messages = new Map();
  /** Move to the next step; a load the deadline gave up on stops here, and its browser closes. */
  const at = (/** @type {string} */ step) => {
    if (progress.abandoned) {
      throw new Error(`abandoned before ${step}`);
    }
    progress.step = step;
  };
  at("launch");
  const browser = await launch(load.browser);
  progress.browser = browser;
  try {
    at("context");
    const device = devices["Pixel 7 landscape"];
    const context = await browser.newContext(
      load.browser === "chromium"
        ? device
        : { viewport: device.viewport, userAgent: device.userAgent },
    );
    const page = await context.newPage();
    // What the page says: an audio context that will not start says so here.
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        const line = `[${load.browser} ${message.type()}] ${message.text()}`;
        const count = (messages.get(line) ?? 0) + 1;
        messages.set(line, count);
        if (count <= FORWARDED_LINES) {
          console.log(line);
        }
      }
    });
    page.on("pageerror", (error) => {
      console.log(`[${load.browser} pageerror] ${error.message}`);
    });
    // Every stats message, so no second is missed or read twice.
    await page.addInitScript(() => {
      /** @type {unknown[]} */
      const seen = [];
      /** @type {unknown[]} */
      const heard = [];
      Object.assign(window, { musicStatsSeen: seen, musicHeardSeen: heard });
      addEventListener("message", (event) => {
        const data = /** @type {unknown} */ (event.data);
        if (typeof data === "object" && data !== null && "type" in data && data.type === "stats") {
          seen.push(data);
        } else if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "heard"
        ) {
          heard.push(data);
        } else if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "error"
        ) {
          // The music host reports failures by message; surface them as a warning.
          console.warn(`music host error: ${JSON.stringify(data)}`);
        }
      });
    });
    const query =
      `?musicstats${load.stress > 0 ? `&stress=${String(load.stress)}` : ""}` +
      ((load.audioStress ?? 0) > 0 ? `&audiostress=${String(load.audioStress)}` : "");
    at("goto");
    await page.goto(`${url}${query}`);
    // The Pixel 7 profile is touch-only, so the page holds the menu behind
    // its keyboard-and-mouse notice (#1392) until Continue anyway.
    await page.locator(".mode-rail, .touch-notice-continue").first().waitFor();
    const touchNotice = page.locator(".touch-notice-continue");
    if (await touchNotice.isVisible()) {
      await touchNotice.click();
    }
    await page.locator(".mode-rail").waitFor();
    at("setup");
    if (load.screen !== "menu") {
      // Every screen #screens shows and every press the page receives, in
      // order: a red run says whether the editor ever came, and whether the
      // input reached the page at all (#862).
      await page.evaluate(() => {
        /** @type {string[]} */
        const seen = [];
        const at = () => `${String(Math.round(performance.now()))} ms`;
        const root = document.querySelector("#screens");
        if (root !== null) {
          const note = () => {
            seen.push(`${at()}: ${[...root.children].map((c) => c.className).join(", ")}`);
          };
          note();
          new MutationObserver(note).observe(root, { childList: true });
        }
        for (const type of ["keydown", "pointerdown", "click"]) {
          document.addEventListener(
            type,
            (event) => {
              const target = event.target instanceof Element ? event.target : null;
              seen.push(`${at()}: ${type} on ${target?.tagName ?? "?"}.${target?.className ?? ""}`);
            },
            { capture: true },
          );
        }
        Object.assign(window, { musicStressSeen: seen });
      });
      // By keyboard, not a click: Playwright's Firefox without its content
      // sandbox, as here, drops a mouse press that jumps to some points of
      // the page before the page sees it, and since the top bar (#814) the
      // button sits on one (#862). Enter is as much a gesture for the music.
      // The editor opens from Character Builder on the mode rail (#1525).
      await page
        .locator(".mode-rail")
        .getByRole("button", { name: "Character Builder", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "new character" }).focus();
      await page.keyboard.press("Enter");
      // The profession is a picker: open it, then click the cell.
      try {
        await page.locator('.editor-profession[data-which="primary"]').click({ timeout: 15_000 });
      } catch (error) {
        // Say what the page shows instead, so a red run names its cause.
        const shown = await page.locator("body").innerText();
        const seen = await page.evaluate(() =>
          "musicStressSeen" in window ? window.musicStressSeen : [],
        );
        console.log(
          `[${load.browser}] no profession picker; the page shows:\n${shown}\n` +
            `it saw:\n${JSON.stringify(seen, null, 1)}`,
        );
        throw error;
      }
      await page
        .locator('.profession-grid .profession-cell[data-profession="elementalist"]')
        .click();
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

    at("throttle");
    if (load.cpu > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: load.cpu });
    }
    if ((load.audioStress ?? 0) > 0) {
      // The worklet times a spin once when it loads: let that stall pass.
      await sleep(3000);
    }
    const start = await page.evaluate(
      () =>
        /** @type {{ musicStatsSeen: unknown[] }} */ (/** @type {unknown} */ (window))
          .musicStatsSeen.length,
    );
    at("measuring");
    const playing = load.screen === "match" ? play(page) : undefined;
    if (options.reactivity) {
      await steps(page);
    } else {
      await music(page, "intensity", INTENSITY);
      await sleep((SECONDS * 1000) / 2);
      await music(page, "crossfadeTo", CROSSFADE_TO);
      await sleep((SECONDS * 1000) / 2);
    }
    at("stop-play");
    await playing?.stop();
    at("read-stats");
    const { seen, heard } = await page.evaluate(() => {
      const w = /** @type {{ musicStatsSeen: unknown[], musicHeardSeen: unknown[] }} */ (
        /** @type {unknown} */ (window)
      );
      return { seen: w.musicStatsSeen, heard: w.musicHeardSeen };
    });
    if (heard.length > 0) {
      reportHeard(/** @type {Heard[]} */ (heard));
    }
    return /** @type {Stats[]} */ (seen.slice(start));
  } finally {
    progress.step = "close";
    for (const [line, count] of messages) {
      if (count > FORWARDED_LINES) {
        console.log(`… ${line} ×${String(count - FORWARDED_LINES)} more`);
      }
    }
    await shut(browser);
  }
}

/**
 * Call the page's music control (`window.__music`, `?musicstats` only).
 *
 * @param {import("@playwright/test").Page} page
 * @param {"intensity" | "crossfadeTo" | "evaluate"} method
 * @param {number | string} argument
 */
async function music(page, method, argument) {
  await page.evaluate(([name, value]) => {
    const control = /** @type {{ __music: Record<string, (value: unknown) => void> }} */ (
      /** @type {unknown} */ (window)
    ).__music;
    control[name]?.(value);
  }, /** @type {const} */ ([method, argument]));
}

/**
 * The changes `--reactivity` times, in order, each given time to be heard
 * before the next: the `heard` lines print in this order.
 *
 * @param {import("@playwright/test").Page} page
 */
async function steps(page) {
  const settle = () => sleep(8000);
  await music(page, "intensity", 1);
  await settle();
  console.log("steps: +1 (1 -> 2), -1 (2 -> 1), +2 (1 -> 3), 0-1-0-1, switch, edit");
  await music(page, "intensity", 2);
  await settle();
  await music(page, "intensity", 1);
  await settle();
  await music(page, "intensity", 3);
  await settle();
  for (const level of [0, 1, 0, 1]) {
    await music(page, "intensity", level);
    await sleep(250);
  }
  await settle();
  await music(page, "crossfadeTo", CROSSFADE_TO);
  await sleep(20_000);
  await music(page, "evaluate", CROSSFADE_TO);
  await settle();
}

/** @typedef {{ type: "heard", change: string, delayMs: number }} Heard */

/**
 * How late each change was heard (#509), as the live engine reports it.
 *
 * @param {Heard[]} heard
 */
function reportHeard(heard) {
  for (const h of heard) {
    console.log(`  heard ${h.change} after ${fixed(h.delayMs)} ms`);
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
  // An abandoned load (past its deadline) leaves this failing against a dead page.
  done.catch(() => undefined);
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
 * What a load adds up to; the same numbers the printed line and the JSON show.
 *
 * @param {Stats[]} rows
 */
function totals(rows) {
  const sum = (/** @type {keyof Stats} */ key) =>
    rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const max = (/** @type {keyof Stats} */ key) =>
    rows.reduce((most, row) => Math.max(most, row[key] ?? 0), 0);
  return {
    seconds: rows.length,
    ticks: sum("ticks"),
    lateTicks: sum("lateTicks"),
    maxTickGapMs: max("maxTickGapMs"),
    maxTickWorkMs: max("maxTickWorkMs"),
    skippedMs: sum("skippedMs"),
    // `null` where the browser cannot say.
    underruns: rows.some((row) => row.underrunMs === null) ? null : sum("underruns"),
    underrunMs: rows.some((row) => row.underrunMs === null) ? null : sum("underrunMs"),
    maxReductionDb: Math.min(0, ...rows.map((row) => row.maxReductionDb)),
  };
}

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
      "s | ticks | late ticks | max gap ms | max tick work ms | skipped ms | events | dropped events | underrun ms | max reduction dB | glitches",
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
          row.droppedEvents,
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
      `dropped events ${String(sum("droppedEvents"))}, glitches ${glitches}, ` +
      `underruns ${underruns}, max reduction ${fixed(Math.min(0, ...rows.map((r) => r.maxReductionDb)))} dB, ` +
      `latency base ${fixed(last?.baseLatencyMs ?? 0)} / output ${fixed(last?.outputLatencyMs ?? 0)} ms`,
  );
}

/**
 * A user PulseAudio with a null sink, so the browsers render to a real-time
 * stream. Everything lives in a temp directory, and stops with the run.
 *
 * @returns {Promise<() => void>}
 */
async function startPulse() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "music-pulse-"));
  const socket = path.join(dir, "native");
  const child = spawn(
    "pulseaudio",
    [
      "-n",
      "--daemonize=no",
      "--exit-idle-time=-1",
      "--load=module-null-sink",
      `--load=module-native-protocol-unix socket=${socket}`,
    ],
    {
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, PULSE_RUNTIME_PATH: dir, XDG_RUNTIME_DIR: dir },
    },
  );
  for (let waited = 0; waited < 50 && !fs.existsSync(socket); waited += 1) {
    if (child.exitCode !== null) {
      break;
    }
    await sleep(100);
  }
  if (!fs.existsSync(socket)) {
    child.kill();
    throw new Error("pulseaudio did not come up; is it in the dev shell?");
  }
  process.env.PULSE_SERVER = `unix:${socket}`;
  return () => {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

const stopPulse = options.pulse ? await startPulse() : undefined;
const served =
  options.url === undefined
    ? await serve()
    : {
        url: options.url,
        stop: () => {
          // Someone else's server: theirs to stop.
        },
      };
/** @type {Record<string, { validated: boolean, loads: unknown[] }>} */
const result = {};
try {
  for (const load of LOADS.filter(
    (l) =>
      (options.browser === undefined || l.browser === options.browser) &&
      (options.only === undefined || l.name.includes(options.only)),
  )) {
    const outcome = await measureWithDeadline(served.url, load);
    const entry = (result[load.browser] ??= { validated: false, loads: [] });
    const description = {
      name: load.name,
      screen: load.screen,
      cpu: load.cpu,
      stress: load.stress,
      audioStress: load.audioStress ?? 0,
    };
    if ("hung" in outcome) {
      entry.loads.push({ ...description, hung: outcome.hung });
      continue;
    }
    report(load, outcome.rows);
    entry.loads.push({ ...description, ...totals(outcome.rows) });
  }
  for (const [browser, entry] of Object.entries(result)) {
    // Only the audiostress loads: the other loads also have none.
    entry.validated = validated(
      /** @type {{ name: string, audioStress: number, underrunMs: number | null }[]} */ (
        entry.loads
      ).filter((reading) => reading.name.startsWith("audiostress")),
    );
    console.log(
      `\n${browser}: underrun readings ${entry.validated ? "validated" : "UNVALIDATED, do not tune from them"}`,
    );
  }
  if (options.json !== undefined) {
    fs.writeFileSync(options.json, `${JSON.stringify({ browsers: result }, null, 2)}\n`);
  }
} finally {
  served.stop();
  stopPulse?.();
}
// An abandoned hung load may leave a handle open; the run is over.
process.exit(process.exitCode ?? 0);

#!/usr/bin/env node
/**
 * `pnpm bench:render` — how long a frame of a layered map takes to draw,
 * against a fixed synthetic workload on the same run (#3157, #3190).
 *
 * Builds the static client, serves it, and opens the live menu background
 * on each map in headless Chromium at 1280×720, as e2e does: picked as a
 * Hosted Game's map, which the background then fights on. Each map draws
 * for `BENCH_SECONDS` (5) after a second to settle; the time between two
 * animation frames is a frame's cost. Headless Chromium holds every frame
 * to 60 Hz whatever its flags (they stay, harmless), so a frame lighter than
 * 16.7 ms measures as the cap, not its cost; such a map is marked
 * `(cap-bound)` in the table. The ratio is therefore only meaningful for work
 * heavier than the cap, and the script enforces that: the calibration must
 * itself take more than `MIN_CALIBRATION_MS`. The baseline is a calibration run the script owns:
 * the frozen reference map, `packages/game-maps/bench/reference-map.json`, drawn
 * as the maps are, so whatever bounds a runner (fill, geometry, JS) bounds both
 * (#3255), but with no whole-screen pass (the vignette and the like,
 * `apps/web/src/render/whole-screen-passes.ts`): a cost every map pays
 * would land in the yardstick too and the ratio would hide it (#4129). It is measured in windows interleaved with the maps (one
 * before each, one after, after an unmeasured warm-up). Each map is judged against the mean
 * of the two windows around it, and a pair of windows differing by over
 * `MAX_CALIBRATION_SPREAD` is measured again, twice at most, then fails the run as too noisy to judge (exit 75, `verdict.mjs`). Prints p50 and p95 per map
 * and the ratio of each to the calibration's. The percentiles weigh a frame by how long
 * it lasted: what a moment of the run is spent in, so a map that hangs
 * for a second between quick frames does not measure as quick.
 *
 *   BENCH_MAP=a,b      the maps, by id. Default: every map of more
 *                      than one layer.
 *   BENCH_MAX_RATIO=2.7 exit 1 when a map's p50 is more than this many
 *                      times the calibration's. CI's regression gate.
 *   --url <url>        measure a client already served there.
 *   --follow           only the follow case (#3240), below.
 *
 * Then the follow case: on every map measured and `FLAT_BASELINE`, a Hosted
 * 1v1 whose body walks `followLoop` while the camera follows it and the
 * pointer hovers the ground, uncapped, and the wheel zooms all the way out
 * and in again and again (#3545). Its rows join the table, outside
 * the calibration's gate: walking costs a frame about twice what standing
 * does. A second table gives the frame's update and render JS, the
 * update's share of the frame, the snapshot cadence, the host's ms per
 * beat (a Hosted game ticks on the page's main thread), which the client
 * measures itself under `?frametiming`, and each map's p50 over the flat
 * baseline's, both walked.
 *   BENCH_FOLLOW_SECONDS=12  how long each map walks, measured.
 *   BENCH_MAX_FOLLOW_RATIO=12 exit 1 when a map walked is more than this
 *                      many times the flat baseline walked.
 *   BENCH_PROFILE=<mapId> record a CPU profile of that map's walk to
 *                      `bench-<mapId>.cpuprofile` and print its 15
 *                      functions of most self time (#3499). Off in CI.
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

import { UNHOSTED_MAPS } from "../ci/perf-plan.mjs";

import { BENCH_CEILINGS } from "./ceilings.mjs";
import { exitCode, settled, shardOf, verdict } from "./verdict.mjs";

/* global document, requestAnimationFrame, window -- in page.evaluate, which runs in the page */

/** A map p50 this close to a frame-rate cap (60 Hz, or the menu's 30 fps limiter) is cap-bound. */
const CAP_TOLERANCE_MS = 0.5;
const CAPS_MS = [1000 / 60, 1000 / 30];
/**
 * The calibration's map (#3255), offered only by the build this script
 * makes. Frozen: an edit to it moves every ratio, so re-derive the gate
 * (`BENCH_MAX_RATIO`, `BENCH_CEILINGS`) in the same change.
 */
const REFERENCE_MAP = "bench-reference";
/** A calibration lighter than two 60 Hz frames is bound by the caps, not by its cost. */
const MIN_CALIBRATION_MS = 2000 / 60 + 0.1;

/** The two calibration windows around a map may differ this much, of their mean. */
const MAX_CALIBRATION_SPREAD = 0.2;
/** A map whose bracket is unstable is measured again this many times at most (#3503). */
const MAX_REMEASURES = 2;

const PORT = 4322;
/** Where the maps it measures live: the arenas, and the tutorial's (#3245). */
const MAP_DIRS = ["maps", "tutorial"].map((dir) =>
  path.join(import.meta.dirname, "..", "..", "packages", "game-maps", dir),
);
/** `FLAT_BASELINE`'s map, beside the reference map rather than in `MAP_DIRS`. */
const FLAT_BASELINE_FILE = path.join(
  import.meta.dirname,
  "..",
  "..",
  "packages",
  "game-maps",
  "bench",
  "flat-map.json",
);
const SETTLE_MS = 1000;
/** The first map is loaded this long, unmeasured, before the warm-up calibration. */
const WARMUP_LOAD_SECONDS = 5;
/** The warm-up lasts at least this long: the runner is slow for the first 20-40 s (#3243). */
const WARMUP_MIN_MS = 45_000;
/** After that, until two windows in a row agree within this much, of their mean. */
const WARMUP_TOLERANCE = 0.05;
/**
 * The warm-up ends here, settled or not; not settled fails the run. 75 s left
 * about four windows past `WARMUP_MIN_MS`, so one noisy window sank the shard
 * with exit 75 on many PRs (#4036). The warm-up is discarded: only time changes.
 */
const WARMUP_CAP_MS = 150_000;
/** After a map page closes, before the next calibration window: its renderer winds down (#3243). */
const CALIBRATION_SETTLE_MS = 1500;
const SECONDS = Number(process.env.BENCH_SECONDS ?? 5);
const MAX_RATIO =
  process.env.BENCH_MAX_RATIO === undefined ? undefined : Number(process.env.BENCH_MAX_RATIO);
const MAX_FOLLOW_RATIO =
  process.env.BENCH_MAX_FOLLOW_RATIO === undefined
    ? undefined
    : Number(process.env.BENCH_MAX_FOLLOW_RATIO);
const { values: options } = parseArgs({
  options: { url: { type: "string" }, follow: { type: "boolean" } },
});

/**
 * `mapId`'s `map.json`, in whichever of `MAP_DIRS` holds it, or the flat baseline's file.
 *
 * @param {string} mapId
 * @returns {string}
 */
function mapFile(mapId) {
  if (mapId === FLAT_BASELINE) {
    return FLAT_BASELINE_FILE;
  }
  const file = MAP_DIRS.map((dir) => path.join(dir, mapId, "map.json")).find((each) =>
    fs.existsSync(each),
  );
  if (file === undefined) {
    throw new Error(`${mapId}: no map.json`);
  }
  return file;
}

/**
 * Every arena and tutorial map of more than one layer, read from its `map.json`,
 * but one the Hosted lobby never offers (#3446).
 */
function layeredMaps() {
  return MAP_DIRS.flatMap((dir) =>
    fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, "map.json"))),
  )
    .filter((id) => !UNHOSTED_MAPS.includes(id))
    .filter(
      (id) => Number(/"layers":\s*(\d+)/.exec(fs.readFileSync(mapFile(id), "utf8"))?.[1] ?? 1) > 1,
    )
    .sort();
}

/**
 * The maps to measure: every one, or this shard's (BENCH_SHARD=i/n, #3509). A
 * shard carries its own warm-up, calibration and flat baseline, as its ratios
 * are taken on the runner that ran it.
 */
function mapsToMeasure() {
  const asked = process.env.BENCH_MAP;
  const ids =
    asked === undefined || asked === ""
      ? layeredMaps()
      : asked
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
  return shardOf(ids, process.env.BENCH_SHARD);
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
    // A profile names its functions: unminified (#3499).
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir${PROFILE === undefined ? "" : " --minify false"} && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    // No splash: the menu, and its background, from load; the reference map
    // in the lobby (#3255), drawn with no whole-screen pass (#4129).
    env: {
      ...process.env,
      VITE_VIBEWARS_TRANSPORT: "broadcast",
      VITE_VIBEWARS_SPLASH: "off",
      VIBEWARS_BENCH_REFERENCE: "1",
      VIBEWARS_BENCH_BARE_REFERENCE: "1",
    },
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
 * Open the Hosted Game lobby and pick `mapId` as its map. The lobby offers
 * only the maps of the team size on the rail, so for a map the size shown
 * does not play, like the 1v1 tutorial canyon (#3245), it steps the size,
 * down then up, until the map is offered.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 */
async function hostedMap(page, mapId) {
  await page
    .locator(".mode-rail")
    .getByRole("button", { name: "Hosted Game", exact: true })
    .click();
  const select = page.locator(".lobby-map select");
  const option = select.locator(`option[value="${mapId}"]`);
  const offered = async () => (await option.count()) > 0;
  const arrows = page.locator('.mode-rail [data-entry="team-size"] .mode-rail-step');
  for (const arrow of [arrows.first(), arrows.last()]) {
    while (!(await offered()) && (await arrow.isEnabled())) {
      await arrow.click();
      // The lobby takes the new size, and redraws its maps, a moment later.
      await option.waitFor({ state: "attached", timeout: 2000 }).catch(() => undefined);
    }
  }
  // The reference map is offered only by a build with VIBEWARS_BENCH_REFERENCE (#3255).
  if (!(await offered())) {
    throw new Error(`${mapId}: the lobby does not offer it, so this build cannot measure it`);
  }
  await select.selectOption(mapId);
}

/** The per-frame passes #3368 times, as `pass-timing.ts` names them. */
const PASSES = [
  "cutAwayTunnels",
  "drawHiddenOutlines",
  "drawMovingDecor",
  "fadeOverhangs",
  "lighting",
];

/**
 * Zero the page's pass timings, or read them and zero them: the mean ms a
 * frame of each pass costs.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<Record<string, number>>}
 */
function takePasses(page) {
  return page.evaluate(() => {
    /** @type {unknown} */
    const timing = Reflect.get(window, "__passTiming");
    const shown = /** @type {Record<string, { ms: number, calls: number }> | undefined} */ (timing);
    /** @type {Record<string, number>} */
    const means = {};
    for (const [pass, { ms, calls }] of Object.entries(shown ?? {})) {
      means[pass] = calls === 0 ? 0 : ms / calls;
    }
    Reflect.deleteProperty(window, "__passTiming");
    return means;
  });
}

/** The passes of the latest still window, which `measure` leaves for its caller. */
let lastPasses = /** @type {Record<string, number>} */ ({});

/**
 * Frame times on `mapId`'s menu background, in ms, sorted.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 * @param {number} seconds
 * @returns {Promise<number[]>}
 */
async function measure(page, mapId, seconds) {
  await hostedMap(page, mapId);
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
  await takePasses(page);
  const frames = await frameTimes(page, seconds);
  lastPasses = await takePasses(page);
  return frames;
}

/**
 * Frame intervals over `seconds` of animation frames, in ms, sorted.
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} [seconds]
 * @returns {Promise<number[]>}
 */
function frameTimes(page, seconds = SECONDS) {
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
    seconds * 1000,
  );
}

/**
 * `--follow`'s flat baseline beside the layered maps: the frozen
 * `packages/game-maps/bench/flat-map.json` (#3444), offered only by the
 * build this script makes. An edit to it moves every follow ratio, so
 * re-derive `BENCH_MAX_FOLLOW_RATIO` in the same change.
 */
const FLAT_BASELINE = "bench-flat";
/** How long `--follow` walks its loop, measured. */
const FOLLOW_SECONDS = Number(process.env.BENCH_FOLLOW_SECONDS ?? 12);
/** `--follow`'s map to take a CPU profile of while it walks (#3499), if any. */
const PROFILE = process.env.BENCH_PROFILE;
/** One step of the walk: the pointer moves, and every `CLICK_EVERY`th step it clicks. */
const STEP_MS = 50;
const CLICK_EVERY = 6;
/**
 * Every `ZOOM_EVERY`th step of the walk the wheel turns one notch, these
 * ways in turn: from the default step out to the widest, in to the
 * closest, and back (#3545). Half a second apart, so each ease runs out.
 */
const ZOOM_EVERY = 10;
const ZOOM_NOTCHES = [1, -1, -1, -1, 1, 1];
/** `deltaY` of one wheel notch: past the client's notch threshold. */
const WHEEL_DELTA_Y = 100;
/** A waypoint this close, in world units, is reached. */
const REACHED = 90;
/** Where on the canvas the walk may click, as a share of its size: clear of the HUD. */
const CLICK_BOX = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.7 };
/** A transition's uphill compass letter, as a world direction (y grows south). */
const UPHILL = new Map([
  ["n", [0, -1]],
  ["s", [0, 1]],
  ["e", [1, 0]],
  ["w", [-1, 0]],
]);

/**
 * What `--follow` reads of a `map.json`.
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ kind: "rect", x: number, y: number, width: number, height: number } | { kind: "polygon", points: Point[] }} Area
 * @typedef {{ width: number, height: number, transitions?: { area: Area, uphill: string }[] }} FollowedMap
 */

/**
 * What `?frametiming` measured in the page (apps/web/src/render/frame-timing.ts).
 *
 * @typedef {{ update: number[], render: number[], snapshots: number[], host: number[] }} FrameTiming
 */

/**
 * The loop `--follow` walks on `mapId`, from `start` (the self's spawn):
 * over the transition nearest it, past its top, then the map's centre,
 * where a map is busiest, and back. A map with no transition walks
 * spawn and centre only.
 *
 * @param {string} mapId
 * @param {Point} start
 * @returns {Point[]}
 */
function followLoop(mapId, start) {
  // The map as written; the walk needs no validation.
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(mapFile(mapId), "utf8"));
  const map = /** @type {FollowedMap} */ (parsed);
  const centre = { x: map.width / 2, y: map.height / 2 };
  /** @type {{ x: number, y: number }[]} */
  const ramp = [];
  let nearest = Infinity;
  for (const transition of map.transitions ?? []) {
    const area = transition.area;
    const at =
      area.kind === "rect"
        ? { x: area.x + area.width / 2, y: area.y + area.height / 2 }
        : {
            x: area.points.reduce((sum, p) => sum + p.x, 0) / area.points.length,
            y: area.points.reduce((sum, p) => sum + p.y, 0) / area.points.length,
          };
    const distance = Math.hypot(at.x - start.x, at.y - start.y);
    if (distance < nearest) {
      nearest = distance;
      const [dx = 0, dy = 0] = UPHILL.get(transition.uphill) ?? [];
      ramp.splice(
        0,
        ramp.length,
        { x: at.x - dx * 150, y: at.y - dy * 150 },
        {
          x: at.x + dx * 200,
          y: at.y + dy * 200,
        },
      );
    }
  }
  return [...ramp, centre, ...[...ramp].reverse(), start];
}

/**
 * The world point at the canvas centre and the zoom, from the follow
 * camera's test hooks on `#viewport`.
 *
 * @param {import("@playwright/test").Page} page
 */
async function camera(page) {
  const stage = page.locator("#viewport");
  const [x = 0, y = 0] = ((await stage.getAttribute("data-camera")) ?? "").split(",").map(Number);
  return { x, y, zoom: Number(await stage.getAttribute("data-zoom")) };
}

/**
 * `--follow` on `mapId`: a Hosted 1v1 there, its frames timed while the
 * self walks `followLoop` with left clicks, the camera following, and the
 * pointer crosses the ground every step so hover runs, and the wheel
 * zooms out and in (`ZOOM_NOTCHES`, #3545). The client measures
 * itself through `?frametiming`: the update and render of each frame, and
 * the time between snapshots.
 *
 * @param {import("@playwright/test").Page} page on the client, `?frametiming`
 * @param {string} mapId
 */
async function follow(page, mapId) {
  await hostedMap(page, mapId);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // A fresh browser has no character of its own: it takes the lobby's.
  const stage = page.locator(".team-lobby-stage");
  await stage.waitFor({ timeout: 60_000 });
  if ((await stage.textContent()) === "Choose your character") {
    // The same redraw race as the seats below: dispatch the click, do not aim it.
    await page
      .locator('.team-lobby-solo .play-card-open[aria-pressed="true"]')
      .dispatchEvent("click");
  } else {
    // The Team Lobby redraws its seats faster than a click can settle on one.
    await page.locator(".team-lobby-seat").first().waitFor({ timeout: 60_000 });
    await page.locator(".team-lobby-seat").first().dispatchEvent("click");
  }
  await page.locator("#viewport canvas:not(.compass)").waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector("#viewport")?.getAttribute("data-camera") != null,
    undefined,
    { timeout: 60_000 },
  );
  await sleep(SETTLE_MS);
  const box = await page.locator("#viewport canvas:not(.compass)").boundingBox();
  if (box === null) {
    throw new Error(`${mapId}: the match has no canvas`);
  }
  const loop = followLoop(mapId, await camera(page));
  await page.evaluate(() => {
    /** @type {unknown} */
    const shown = Reflect.get(window, "__frameTiming");
    const stats = /** @type {FrameTiming} */ (shown);
    for (const times of [stats.update, stats.render, stats.snapshots, stats.host]) {
      times.length = 0;
    }
  });
  await takePasses(page);
  const profiler = PROFILE === mapId ? await page.context().newCDPSession(page) : undefined;
  if (profiler !== undefined) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
  }
  const frames = frameTimes(page, FOLLOW_SECONDS);
  const end = Date.now() + FOLLOW_SECONDS * 1000;
  let next = 0;
  for (let step = 0; Date.now() < end; step += 1) {
    if (step % CLICK_EVERY === 0) {
      const seen = await camera(page);
      const target = loop[next % loop.length] ?? seen;
      if (Math.hypot(target.x - seen.x, target.y - seen.y) < REACHED) {
        next += 1;
      }
      const goal = loop[next % loop.length] ?? seen;
      /** @type {(value: number, low: number, high: number) => number} */
      const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
      await page.mouse.click(
        box.x +
          clamp(
            box.width / 2 + (goal.x - seen.x) * seen.zoom,
            box.width * CLICK_BOX.left,
            box.width * CLICK_BOX.right,
          ),
        box.y +
          clamp(
            box.height / 2 + (goal.y - seen.y) * seen.zoom,
            box.height * CLICK_BOX.top,
            box.height * CLICK_BOX.bottom,
          ),
      );
    } else if (step % ZOOM_EVERY === ZOOM_EVERY / 2) {
      const notch = ZOOM_NOTCHES[Math.floor(step / ZOOM_EVERY) % ZOOM_NOTCHES.length] ?? 1;
      await page.mouse.wheel(0, notch * WHEEL_DELTA_Y);
    } else {
      // A fixed sweep over the ground, as a hovering player's pointer.
      await page.mouse.move(
        box.x +
          box.width *
            (CLICK_BOX.left + (CLICK_BOX.right - CLICK_BOX.left) * (((step * 37) % 100) / 100)),
        box.y +
          box.height *
            (CLICK_BOX.top + (CLICK_BOX.bottom - CLICK_BOX.top) * (((step * 53) % 100) / 100)),
      );
    }
    await sleep(STEP_MS);
  }
  const measured = await frames;
  if (profiler !== undefined) {
    const { profile } = await profiler.send("Profiler.stop");
    writeProfile(mapId, /** @type {CpuProfile} */ (profile));
  }
  const passes = await takePasses(page);
  const stats = await page.evaluate(() => {
    /** @type {unknown} */
    const shown = Reflect.get(window, "__frameTiming");
    return /** @type {FrameTiming} */ (shown);
  });
  return { frames: measured, reached: next, passes, ...stats };
}

/**
 * What a CDP `Profiler.stop` returns, as far as `writeProfile` reads it.
 *
 * @typedef {{ id: number, callFrame: { functionName: string, url: string, lineNumber: number } }} ProfileNode
 * @typedef {{ nodes: ProfileNode[], samples?: number[], timeDeltas?: number[] }} CpuProfile
 */

/**
 * Writes `profile` to `bench-<mapId>.cpuprofile` beside the report and
 * prints its 15 functions of most self time, in ms.
 *
 * @param {string} mapId
 * @param {CpuProfile} profile
 */
function writeProfile(mapId, profile) {
  const file = `bench-${mapId}.cpuprofile`;
  fs.writeFileSync(file, JSON.stringify(profile));
  const { samples = [], timeDeltas = [] } = profile;
  /** @type {Map<number, number>} */
  const selfMs = new Map();
  for (const [i, id] of samples.entries()) {
    selfMs.set(id, (selfMs.get(id) ?? 0) + (timeDeltas[i] ?? 0) / 1000);
  }
  /** @type {Map<string, number>} */
  const byFunction = new Map();
  for (const node of profile.nodes) {
    const { functionName, url, lineNumber } = node.callFrame;
    const key = `${functionName === "" ? "(anonymous)" : functionName} ${url.split("/").at(-1) ?? ""}:${String(lineNumber + 1)}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + (selfMs.get(node.id) ?? 0));
  }
  const total = [...byFunction.values()].reduce((a, b) => a + b, 0);
  console.log();
  console.log(`| ${mapId} self time (${file}) | ms | share |`);
  console.log("|---|---|---|");
  for (const [key, ms] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`| ${key} | ${ms.toFixed(0)} | ${((ms / total) * 100).toFixed(1)} % |`);
  }
}

/**
 * The median of numbers.
 *
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const low = Math.floor((sorted.length - 1) / 2);
  return ((sorted[low] ?? 0) + (sorted[Math.floor(sorted.length / 2)] ?? 0)) / 2;
}

const served = options.url === undefined ? await serve() : undefined;
const url = options.url ?? served?.url ?? "";
const executablePath = process.env.VIBEWARS_CHROMIUM;
/** @type {import("@playwright/test").Browser | undefined} */
let browser;
let failed = false;
let noisy = false;
// The warm-up never settled, so nothing was measured: even report-only fails.
let unsettled = false;
try {
  browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ["--no-sandbox", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
  });
  const viewport = { width: 1280, height: 720 };
  /** One map on a page of its own, which is collected and closed before the next calibration. */
  const mapWindow = async (/** @type {string} */ mapId, /** @type {number} */ seconds) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(url);
      return await measure(page, mapId, seconds);
    } finally {
      const session = await page.context().newCDPSession(page);
      await session.send("HeapProfiler.collectGarbage");
      await page.close();
      await sleep(CALIBRATION_SETTLE_MS);
    }
  };
  /** One calibration window: the reference map, drawn as a map is, alone (#3255). */
  const calibrationWindow = async () => percentile(await mapWindow(REFERENCE_MAP, SECONDS), 50);
  const mapIds = options.follow === true ? [] : mapsToMeasure();
  const runStart = Date.now();
  /** @type {(phase: string, since: number) => void} */
  const timed = (phase, since) => {
    console.log(`phase ${phase} ${((Date.now() - since) / 1000).toFixed(0)} s`);
  };
  // The runner is slow for the first 20-40 s of a run: load the first map, then
  // calibrate until the runner has had that long and two windows in a row agree,
  // and keep none of it (#3243).
  const [warmMap] = mapIds;
  if (warmMap !== undefined) {
    const start = Date.now();
    await mapWindow(warmMap, WARMUP_LOAD_SECONDS);
    const warm = [];
    const times = [];
    let after;
    while (after === undefined && Date.now() - start < WARMUP_CAP_MS) {
      warm.push(await calibrationWindow());
      times.push(Date.now() - start);
      after = settled(warm, times, { minMs: WARMUP_MIN_MS, tol: WARMUP_TOLERANCE });
    }
    const list = warm.map((w) => w.toFixed(1)).join(", ");
    if (after === undefined) {
      console.error(
        `calibration never settled in warm-up (${list}): the runner is too noisy to judge`,
      );
      noisy = true;
      unsettled = true;
    } else {
      console.log(
        `warm-up: map ${warmMap} ${String(WARMUP_LOAD_SECONDS)} s; calibration ${list} ms (settled after ${String(after)} windows, ${((times[after - 1] ?? 0) / 1000).toFixed(0)} s, discarded)`,
      );
    }
  }
  timed("warm-up", runStart);
  const stillStart = Date.now();
  const windows = [await calibrationWindow()];
  const rows = [];
  for (const mapId of noisy ? [] : mapIds) {
    // A bracket the runner moved under is measured again, with the window that
    // closed it opening the next one: a few seconds, not a rerun (#3503).
    for (let attempt = 1; ; attempt++) {
      const before = windows.at(-1) ?? NaN;
      const frames = await mapWindow(mapId, SECONDS);
      const passes = lastPasses;
      const after = await calibrationWindow();
      windows.push(after);
      const spread = Math.abs(before - after) / ((before + after) / 2);
      if (spread > MAX_CALIBRATION_SPREAD && attempt <= MAX_REMEASURES) {
        console.log(`re-measure ${mapId} (spread ${(spread * 100).toFixed(0)} %)`);
        continue;
      }
      rows.push({
        passes,
        mapId,
        frames: frames.length,
        p50: percentile(frames, 50),
        p95: percentile(frames, 95),
        before,
        after,
      });
      break;
    }
  }
  timed("still", stillStart);
  const followStart = Date.now();
  const followed = [];
  for (const mapId of noisy ? [] : [...mapsToMeasure(), FLAT_BASELINE]) {
    const match = await browser.newPage({ viewport });
    try {
      await match.goto(`${url}?frametiming`);
      const run = await follow(match, mapId);
      /** @type {(times: number[]) => number} */
      const sum = (times) => times.reduce((total, time) => total + time, 0);
      /** @type {(times: number[]) => number[]} */
      const sorted = (times) => [...times].sort((a, b) => a - b);
      const mean = sum(run.snapshots) / run.snapshots.length;
      followed.push({
        mapId: `${mapId} (follow)`,
        frames: run.frames.length,
        p50: percentile(run.frames, 50),
        p95: percentile(run.frames, 95),
        update: percentile(sorted(run.update), 50),
        render: percentile(sorted(run.render), 50),
        share: sum(run.update) / sum(run.frames),
        snapshotP50: percentile(sorted(run.snapshots), 50),
        snapshotP95: percentile(sorted(run.snapshots), 95),
        jitter: Math.sqrt(
          sum(run.snapshots.map((time) => (time - mean) ** 2)) / run.snapshots.length,
        ),
        reached: run.reached,
        hostP50: percentile(sorted(run.host), 50),
        hostP95: percentile(sorted(run.host), 95),
        passes: run.passes,
      });
    } finally {
      await match.close();
    }
  }
  timed("follow", followStart);
  const wholeRun = (Math.max(...windows) - Math.min(...windows)) / median(windows);
  console.log(
    `calibration windows p50 ms: ${windows.map((w) => w.toFixed(1)).join(", ")} (whole-run spread ${(wholeRun * 100).toFixed(0)} %, not gated)`,
  );
  const verdicts = verdict({
    maps: rows,
    maxRatio: MAX_RATIO,
    maxSpread: MAX_CALIBRATION_SPREAD,
    ceilings: BENCH_CEILINGS,
  });
  console.log("| map | frames | p50 ms | p95 ms | base ms | p50 / calibration |");
  console.log("|---|---|---|---|---|---|");
  for (const [i, row] of rows.entries()) {
    const v = verdicts[i];
    if (v === undefined) continue;
    console.log(
      `| ${row.mapId} | ${String(row.frames)} | ${row.p50.toFixed(1)} | ${row.p95.toFixed(1)} | ${v.base.toFixed(1)} | ${v.ratio.toFixed(2)}${v.ceiling === undefined ? "" : ` (ceiling ${v.ceiling.ratio.toFixed(1)}, #${String(v.ceiling.issue)})`}${CAPS_MS.some((cap) => Math.abs(row.p50 - cap) < CAP_TOLERANCE_MS) ? " (cap-bound)" : ""} |`,
    );
  }
  for (const v of verdicts) {
    if (v.noisy !== undefined) {
      console.error(v.noisy);
      noisy = true;
    }
    for (const failure of v.failures) {
      console.error(failure);
      failed = true;
    }
    if (!(v.base >= MIN_CALIBRATION_MS)) {
      throw new Error(
        `the calibration around ${v.mapId} is under ${String(MIN_CALIBRATION_MS)} ms, so it is bound by the frame-rate cap and the ratio would be meaningless`,
      );
    }
  }
  /** @type {(label: string, mapRows: { mapId: string, p50: number, passes: Record<string, number> }[]) => void} */
  const printPasses = (label, mapRows) => {
    console.log();
    console.log(
      `| ${label} | ${PASSES.map((pass) => `${pass} ms/frame`).join(" | ")} | passes % of p50 |`,
    );
    console.log(`|---|${PASSES.map(() => "---|").join("")}---|`);
    for (const row of mapRows) {
      const costs = PASSES.map((pass) => row.passes[pass] ?? 0);
      const share = costs.reduce((a, b) => a + b, 0) / row.p50;
      console.log(
        `| ${row.mapId} | ${costs.map((cost) => cost.toFixed(2)).join(" | ")} | ${(share * 100).toFixed(0)} % |`,
      );
    }
  };
  if (rows.length > 0) printPasses("passes (still)", rows);
  console.log();
  console.log(
    "| follow | frames | p50 ms | p95 ms | update p50 ms | render p50 ms | update share | snapshot p50 ms | snapshot p95 ms | snapshot jitter ms | host p50 ms | host p95 ms | waypoints | p50 / flat |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const flat = followed.at(-1);
  for (const row of followed) {
    const ratio = flat === undefined ? Number.NaN : row.p50 / flat.p50;
    console.log(
      `| ${row.mapId} | ${String(row.frames)} | ${row.p50.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.update.toFixed(1)} | ${row.render.toFixed(1)} | ${(row.share * 100).toFixed(0)} % | ${row.snapshotP50.toFixed(1)} | ${row.snapshotP95.toFixed(1)} | ${row.jitter.toFixed(1)} | ${row.hostP50.toFixed(1)} | ${row.hostP95.toFixed(1)} | ${String(row.reached)} | ${ratio.toFixed(2)} |`,
    );
    if (MAX_FOLLOW_RATIO !== undefined && !(ratio <= MAX_FOLLOW_RATIO)) {
      console.error(
        `${row.mapId}: p50 is ${ratio.toFixed(2)}× the flat baseline's walked, over ${String(MAX_FOLLOW_RATIO)}×`,
      );
      failed = true;
    }
  }
  printPasses("passes (follow)", followed);
} finally {
  await browser?.close();
  served?.stop();
}
// BENCH_REPORT_ONLY (the hosted perf bench, #3368): a ratio breach is printed
// above and does not fail the run, so the table still reaches the report.
// ci.yml, which enforces the ceilings, does not set it. A crash still fails.
// Exit 75 means the runner was too noisy to judge: a rerun is the remedy (#3503).
process.exitCode = exitCode({
  breach: failed,
  noisy,
  unsettled,
  reportOnly: process.env.BENCH_REPORT_ONLY !== undefined,
});

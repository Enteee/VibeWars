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
 * (#3255). It is measured in windows interleaved with the maps (one
 * before each, one after, after an unmeasured warm-up). Each map is judged against the mean
 * of the two windows around it, and a pair of windows differing by over
 * `MAX_CALIBRATION_SPREAD` fails the run as too noisy to judge (`verdict.mjs`). Prints p50 and p95 per map
 * and the ratio of each to the calibration's. The percentiles weigh a frame by how long
 * it lasted: what a moment of the run is spent in, so a map that hangs
 * for a second between quick frames does not measure as quick.
 *
 *   BENCH_MAP=a,b      the maps, by id. Default: every map of more
 *                      than one layer.
 *   BENCH_MAX_RATIO=3.5 exit 1 when a map's p50 is more than this many
 *                      times the calibration's. CI's regression gate.
 *   --url <url>        measure a client already served there.
 *   --follow           only the follow case (#3240), below.
 *
 * Then the follow case: on every map measured and `FLAT_BASELINE`, a Hosted
 * 1v1 whose body walks `followLoop` while the camera follows it and the
 * pointer hovers the ground, uncapped. Its rows join the table, outside
 * the calibration's gate: walking costs a frame about twice what standing
 * does. A second table gives the frame's update and render JS, the
 * update's share of the frame, the snapshot cadence, which the client
 * measures itself under `?frametiming`, and each map's p50 over the flat
 * baseline's, both walked.
 *   BENCH_FOLLOW_SECONDS=12  how long each map walks, measured.
 *   BENCH_MAX_FOLLOW_RATIO=2 exit 1 when a map walked is more than this
 *                      many times the flat baseline walked.
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

import { BENCH_CEILINGS } from "./ceilings.mjs";
import { settled, verdict } from "./verdict.mjs";

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

const PORT = 4322;
/** Where the maps it measures live: the arenas, and the tutorial's (#3245). */
const MAP_DIRS = ["maps", "tutorial"].map((dir) =>
  path.join(import.meta.dirname, "..", "..", "packages", "game-maps", dir),
);
const SETTLE_MS = 1000;
/** The first map is loaded this long, unmeasured, before the warm-up calibration. */
const WARMUP_LOAD_SECONDS = 5;
/** The warm-up lasts at least this long: the runner is slow for the first 20-40 s (#3243). */
const WARMUP_MIN_MS = 45_000;
/** After that, until two windows in a row agree within this much, of their mean. */
const WARMUP_TOLERANCE = 0.05;
/** The warm-up ends here, settled or not; not settled fails the run. */
const WARMUP_CAP_MS = 75_000;
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
 * `mapId`'s `map.json`, in whichever of `MAP_DIRS` holds it.
 *
 * @param {string} mapId
 * @returns {string}
 */
function mapFile(mapId) {
  const file = MAP_DIRS.map((dir) => path.join(dir, mapId, "map.json")).find((each) =>
    fs.existsSync(each),
  );
  if (file === undefined) {
    throw new Error(`${mapId}: no map.json`);
  }
  return file;
}

/** Every arena and tutorial map of more than one layer, read from its `map.json`. */
function layeredMaps() {
  return MAP_DIRS.flatMap((dir) =>
    fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, "map.json"))),
  )
    .filter(
      (id) => Number(/"layers":\s*(\d+)/.exec(fs.readFileSync(mapFile(id), "utf8"))?.[1] ?? 1) > 1,
    )
    .sort();
}

/** The maps to measure. */
function mapsToMeasure() {
  const asked = process.env.BENCH_MAP;
  const ids =
    asked === undefined || asked === ""
      ? layeredMaps()
      : asked
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
  return ids;
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
    // No splash: the menu, and its background, from load; the reference map
    // in the lobby (#3255).
    env: {
      ...process.env,
      VITE_VIBEWARS_TRANSPORT: "broadcast",
      VITE_VIBEWARS_SPLASH: "off",
      VIBEWARS_BENCH_REFERENCE: "1",
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
 * Frame times on `mapId`'s menu background, in ms, sorted.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 * @param {number} seconds
 * @returns {Promise<number[]>}
 */
async function measure(page, mapId, seconds) {
  const entry = page
    .locator(".mode-rail")
    .getByRole("button", { name: "Hosted Game", exact: true });
  await entry.click();
  const select = page.locator(".lobby-map select");
  // The reference map is offered only by a build with VIBEWARS_BENCH_REFERENCE (#3255).
  if ((await select.locator(`option[value="${mapId}"]`).count()) === 0) {
    throw new Error(`${mapId}: the lobby does not offer it, so this build cannot measure it`);
  }
  await select.selectOption(mapId);
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
  return frameTimes(page, seconds);
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

/** `--follow`'s flat baseline beside the layered maps. */
const FLAT_BASELINE = "jungle-ruins";
/** How long `--follow` walks its loop, measured. */
const FOLLOW_SECONDS = Number(process.env.BENCH_FOLLOW_SECONDS ?? 12);
/** One step of the walk: the pointer moves, and every `CLICK_EVERY`th step it clicks. */
const STEP_MS = 50;
const CLICK_EVERY = 6;
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
 * @typedef {{ update: number[], render: number[], snapshots: number[] }} FrameTiming
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
 * pointer crosses the ground every step so hover runs. The client measures
 * itself through `?frametiming`: the update and render of each frame, and
 * the time between snapshots.
 *
 * @param {import("@playwright/test").Page} page on the client, `?frametiming`
 * @param {string} mapId
 */
async function follow(page, mapId) {
  await page
    .locator(".mode-rail")
    .getByRole("button", { name: "Hosted Game", exact: true })
    .click();
  await page.locator(".lobby-map select").selectOption(mapId);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // A fresh browser has no character of its own: it takes the lobby's.
  const stage = page.locator(".team-lobby-stage");
  await stage.waitFor({ timeout: 60_000 });
  if ((await stage.textContent()) === "Choose your character") {
    await page.locator('.team-lobby-solo .play-card-open[aria-pressed="true"]').click();
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
    for (const times of [stats.update, stats.render, stats.snapshots]) {
      times.length = 0;
    }
  });
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
  const stats = await page.evaluate(() => {
    /** @type {unknown} */
    const shown = Reflect.get(window, "__frameTiming");
    return /** @type {FrameTiming} */ (shown);
  });
  return { frames: measured, reached: next, ...stats };
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
      throw new Error(
        `calibration never settled in warm-up (${list}): the runner is too noisy to judge`,
      );
    }
    console.log(
      `warm-up: map ${warmMap} ${String(WARMUP_LOAD_SECONDS)} s; calibration ${list} ms (settled after ${String(after)} windows, ${((times[after - 1] ?? 0) / 1000).toFixed(0)} s, discarded)`,
    );
  }
  const windows = [];
  const rows = [];
  for (const mapId of mapIds) {
    windows.push(await calibrationWindow());
    const frames = await mapWindow(mapId, SECONDS);
    rows.push({
      mapId,
      frames: frames.length,
      p50: percentile(frames, 50),
      p95: percentile(frames, 95),
    });
  }
  windows.push(await calibrationWindow());
  const followed = [];
  for (const mapId of [...mapsToMeasure(), FLAT_BASELINE]) {
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
      });
    } finally {
      await match.close();
    }
  }
  const wholeRun = (Math.max(...windows) - Math.min(...windows)) / median(windows);
  console.log(
    `calibration windows p50 ms: ${windows.map((w) => w.toFixed(1)).join(", ")} (whole-run spread ${(wholeRun * 100).toFixed(0)} %, not gated)`,
  );
  const verdicts = verdict({
    windows,
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
  console.log();
  console.log(
    "| follow | frames | p50 ms | p95 ms | update p50 ms | render p50 ms | update share | snapshot p50 ms | snapshot p95 ms | snapshot jitter ms | waypoints | p50 / flat |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  const flat = followed.at(-1);
  for (const row of followed) {
    const ratio = flat === undefined ? Number.NaN : row.p50 / flat.p50;
    console.log(
      `| ${row.mapId} | ${String(row.frames)} | ${row.p50.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.update.toFixed(1)} | ${row.render.toFixed(1)} | ${(row.share * 100).toFixed(0)} % | ${row.snapshotP50.toFixed(1)} | ${row.snapshotP95.toFixed(1)} | ${row.jitter.toFixed(1)} | ${String(row.reached)} | ${ratio.toFixed(2)} |`,
    );
    if (MAX_FOLLOW_RATIO !== undefined && !(ratio <= MAX_FOLLOW_RATIO)) {
      console.error(
        `${row.mapId}: p50 is ${ratio.toFixed(2)}× the flat baseline's walked, over ${String(MAX_FOLLOW_RATIO)}×`,
      );
      failed = true;
    }
  }
} finally {
  await browser?.close();
  served?.stop();
}
process.exitCode = failed ? 1 : 0;

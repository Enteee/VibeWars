#!/usr/bin/env node
/**
 * `pnpm run promo:capture` — shoot the scenes of the promo video (#3811).
 * Not part of CI; run it under `company heavy`. Plays the built client in
 * Chromium at 1920x1080, as a player would, as `scripts/readme-shots.mjs`
 * does, and records each scene's video into `out/promo/capture/`:
 *
 *   <scene>.webm   what the screen showed
 *   <scene>.json   `{ events, marks }`: the combat events (`?capture`, seconds
 *                  of the video) and named moments, for `assemble.mjs`
 *   music.webm     the music of a real-time run of the fight, one continuous take, tapped
 *                  inside the music host (see `AUDIO_TAP`); the music bed
 *
 *   --scene <name>  shoot one scene: fight, editor, act-<name>, friends, ranked
 *   --url <url>     use a client served there, built with
 *                   VITE_VIBEWARS_TRANSPORT=broadcast and VITE_VIBEWARS_SPLASH=off
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

import { advance, cycleSkills, waitEvent } from "./actions.mjs";
import { musicSettled } from "./plan.mjs";

const PORT = 4322;
const ROOT = path.join(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "out", "promo", "capture");
const SIZE = { width: 1920, height: 1080 };
const { values: options } = parseArgs({
  options: { url: { type: "string" }, scene: { type: "string" } },
});

/** The Elementalist/Mesmer starter build, as in `readme-shots.mjs`. */
const BUILD_CODE = "OgVFoMm8lmMgufXOyleRGFB";
const NAME = "Aria Stormveil";
/** A fight is tried this often before the run fails: an interrupt is not certain. */
const FIGHT_TRIES = 5;
/** The longest a fight is watched for its interrupt, ms. */
const FIGHT_MS = 150_000;
/** The ranked scene's map. */
const RANKED_MAP = "broken-tower";
/** A shot is tried this often before the run fails (#3982). */
const SCENE_TRIES = 5;
/** The longest an action shot waits for its event, ms. */
const ACTION_MS = 60_000;
/** @typedef {{ kind: string, skillId: string }} Combat */
/**
 * The action shots: the map, and the event that starts each.
 * @type {Record<string, { map: string, wanted: (event: Combat) => boolean }>}
 */
const ACTIONS = {
  cast: { map: "arena-canyon", wanted: (e) => e.kind === "damage" && e.skillId !== "" },
  heal: { map: "ember-pits", wanted: (e) => e.kind === "heal" && e.skillId !== "" },
  ramp: { map: "broken-tower", wanted: (e) => e.kind === "damage" },
};

/**
 * Runs in every frame before its scripts, the sandboxed music host's
 * included: when the music bus's limiter is wired to the speakers, the
 * same signal also goes to a recorder. `window.__music` hands the take
 * back. No game code is involved, and a normal session has none of it.
 */
const AUDIO_TAP = `(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function tap(destination, ...rest) {
    if (
      destination instanceof AudioDestinationNode &&
      this instanceof DynamicsCompressorNode &&
      Reflect.get(window, "__music") === undefined
    ) {
      const sink = this.context.createMediaStreamDestination();
      connect.call(this, sink);
      const chunks = [];
      const recorder = new MediaRecorder(sink.stream, { mimeType: "audio/webm;codecs=opus" });
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.start(1000);
      const take = {
        startedAt: Date.now(),
        stop: () =>
          new Promise((resolve) => {
            recorder.onstop = async () => {
              const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
              let binary = "";
              for (let at = 0; at < bytes.length; at += 8192) {
                binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
              }
              resolve({ startedAt: take.startedAt, base64: btoa(binary) });
            };
            recorder.stop();
          }),
      };
      Object.defineProperty(window, "__music", { value: take });
    }
    return connect.call(this, destination, ...rest);
  };
})();`;

/**
 * Runs in the game's page: every track the music host reports playing
 * (#3983), with when it is heard and its tempo. A switch's fade-in ends a
 * cycle after that; the cut's music starts after the last one.
 */
const SWITCH_TAP = `(() => {
  if (window !== window.top) {
    return;
  }
  const switches = [];
  Object.defineProperty(window, "__musicSwitches", { value: switches });
  addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "playing" && typeof data.heardAtEpochMs === "number") {
      switches.push({ heardAtEpochMs: data.heardAtEpochMs, cps: data.cps });
    }
  });
})();`;

/**
 * Runs in every frame: the interval between animation frames, ms, into
 * `window.__frames`, so a scene's frame pacing can be told from the recorder's.
 */
const FRAME_LOG = `(() => {
  const frames = [];
  Reflect.set(window, "__frames", frames);
  let last = performance.now();
  const tick = (now) => {
    frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

let step = "start";

/** @returns {Promise<{ url: string, stop: () => void }>} */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "promo-capture-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      VITE_VIBEWARS_TRANSPORT: "broadcast",
      VITE_VIBEWARS_SPLASH: "off",
      // The ranked scene shows the end panel from the e2e fixture; the build is thrown away after.
      VITE_VIBEWARS_SUMMARY_FIXTURE: "on",
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

/** Frames per second of a stepped scene, as `capture-clock.ts`. */
const FPS = 20;

/**
 * A stepped scene's recorder (#4006): each frame is one `__captureStep(1)`
 * of the page, then a PNG of the viewport piped into ffmpeg, so the video
 * is smooth however slowly the host draws. Before `start`, frames are
 * stepped but not recorded (the match loading).
 *
 * @typedef {{
 *   seconds(): number,
 *   origin(): number,
 *   start(file: string): Promise<void>,
 *   steps(count: number): Promise<void>,
 *   pump(): () => Promise<void>,
 *   stop(): Promise<void>,
 * }} Stepper
 */

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Stepper}
 */
function stepper(page) {
  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | undefined} */
  let ffmpeg;
  /** @type {Promise<void> | undefined} */
  let exited;
  let recorded = 0;
  let origin = 0;
  return {
    seconds: () => recorded / FPS,
    origin: () => origin,
    async start(file) {
      origin = Number(await page.evaluate("globalThis.__captureNow()"));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      ffmpeg = spawn(
        "ffmpeg",
        ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-"]
          .concat(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-deadline", "realtime"])
          .concat(["-cpu-used", "8", "-pix_fmt", "yuv420p", file]),
        { stdio: ["pipe", "ignore", "inherit"] },
      );
      const child = ffmpeg;
      exited = new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ffmpeg exited ${String(code)}`));
          }
        });
      });
    },
    async steps(count) {
      for (let i = 0; i < count; i += 1) {
        await page.evaluate("globalThis.__captureStep(1)");
        const child = ffmpeg;
        if (child !== undefined) {
          const png = await page.screenshot({ type: "png" });
          await new Promise((resolve, reject) => {
            child.stdin.write(png, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve(undefined);
              }
            });
          });
          recorded += 1;
        }
      }
    },
    /** Steps unrecorded frames back to back, for the lobby; the returned stop waits for the last. */
    pump() {
      const run = { on: true };
      const loop = (async () => {
        while (run.on) {
          await page.evaluate("globalThis.__captureStep(1)");
        }
      })();
      return async () => {
        run.on = false;
        await loop;
      };
    },
    async stop() {
      ffmpeg?.stdin.end();
      await exited;
    },
  };
}

/** Frames for `ms` of match time. */
const frames = (/** @type {number} */ ms) => Math.round((ms * FPS) / 1000);

/**
 * A scene: a fresh, recorded context with one page on the menu, so no
 * scene inherits another's lobby or character.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 * @param {string} name
 * @param {"video" | "stepped" | "none"} [mode]  recorded by the browser; frame-stepped (#4006); or not recorded
 */
async function openScene(browser, name, url, mode = "video") {
  const stepped = mode === "stepped";
  const dir = path.join(OUT, `${name}-video`);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    ...(process.env.PROMO_NO_VIDEO === undefined && mode === "video"
      ? { recordVideo: { dir, size: SIZE } }
      : {}),
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(AUDIO_TAP);
  await context.addInitScript(SWITCH_TAP);
  if (mode === "video") {
    await context.addInitScript(FRAME_LOG);
  }
  const startedAt = Date.now();
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(`${url}?capture${stepped ? "=step" : ""}`);
  await page.locator(".mode-rail").waitFor();
  /** @type {Record<string, number>} */
  const marks = {};
  /** @type {Stepper | undefined} */
  let stepper;
  /** Seconds into the video, now: frames recorded when stepped, else the wall clock. */
  const now = () => (stepper === undefined ? (Date.now() - startedAt) / 1000 : stepper.seconds());
  return {
    context,
    page,
    dir,
    marks,
    now,
    startedAt,
    get stepper() {
      return stepper;
    },
    set stepper(value) {
      stepper = value;
    },
  };
}

/**
 * End a scene: close the context so the video is written, move it to
 * `<name>.webm`, and save the events and marks beside it.
 *
 * @param {Awaited<ReturnType<typeof openScene>>} scene
 * @param {string} name
 * @param {readonly { t: number, kind: string, skillId: string }[]} events  `t` as `performance.now()`
 * @param {number} timeOrigin  `performance.timeOrigin` of the page that saw them
 */
async function closeScene(scene, name, events, timeOrigin) {
  const video = scene.page.video();
  const stepped = scene.stepper;
  await stepped?.stop();
  /** @type {number[]} */
  const frames = await scene.page
    .evaluate(() => {
      /** @type {unknown} */
      const log = Reflect.get(globalThis, "__frames");
      return Array.isArray(log) ? log.map(Number) : [];
    })
    .catch(() => []);
  if (frames.length > 0) {
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (/** @type {number} */ q) =>
      (sorted[Math.floor(q * (sorted.length - 1))] ?? 0).toFixed(1);
    console.log(
      `${name} rAF ms: n=${String(frames.length)} p50=${at(0.5)} p95=${at(0.95)} max=${at(1)} over40=${String(frames.filter((f) => f > 40).length)}`,
    );
  }
  await scene.context.close();
  fs.mkdirSync(OUT, { recursive: true });
  await video?.saveAs(path.join(OUT, `${name}.webm`));
  fs.rmSync(scene.dir, { recursive: true, force: true });
  // Stepped: event times are the page's virtual clock; the video starts at its `origin`.
  const seen = events.map((event) => ({
    ...event,
    t:
      stepped === undefined
        ? (timeOrigin + event.t - scene.startedAt) / 1000
        : (event.t - stepped.origin()) / 1000,
  }));
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify({ events: seen, marks: scene.marks }, null, 1),
  );
  console.log(`${name}: ${String(seen.length)} events, marks ${JSON.stringify(scene.marks)}`);
}

/**
 * Paste `text` onto the page, as Ctrl+V would.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} text
 */
async function paste(page, text) {
  await page.locator("body").evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

/**
 * Open `label`'s screen from the menu's mode rail.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} label
 */
async function openRail(page, label) {
  const entry = page.locator(".mode-rail").getByRole("button", { name: label, exact: true });
  await entry.click();
  await entry.and(page.locator('[aria-pressed="true"]')).waitFor();
}

/**
 * A Hosted Game on `mapId`, 8 a side, the host in a seat (as
 * `readme-shots.mjs` does it); resolves when the match canvas is up.
 *
 * A stepped scene's lobby runs in real time with its clock pumped, then
 * recording starts at the match canvas.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 * @param {{ stepper: Stepper, name: string } | undefined} [stepped]
 */
async function startMatch(page, mapId, stepped) {
  const stopPump = stepped?.stepper.pump();
  step = "hosted game";
  await openRail(page, "Hosted Game");
  await page.getByRole("button", { name: "Larger team" }).click();
  await page.getByRole("button", { name: /^Join/ }).first().click();
  await page.locator(".lobby-map select").selectOption(mapId);
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  step = "team lobby";
  await liveClick(page.getByRole("button", { name: /^Your Team Builds/ }));
  await liveClick(page.getByText("8 members").first());
  await liveClick(page.getByRole("button", { name: "Propose this build" }));
  await liveClick(page.locator(".team-lobby-proposals button").first());
  step = "seat";
  const seats = page.locator(".team-lobby-seat-free");
  await liveClick(seats.first());
  step = "match";
  await page.locator("#viewport canvas:not(.compass)").waitFor({ timeout: 90_000 });
  await stopPump?.();
  await stepped?.stepper.start(path.join(OUT, `${stepped.name}.webm`));
}

/**
 * Click through the DOM: the lobby redraws under the pointer at 1920x1080 and
 * detaches the element a real click is aiming at.
 * @param {import("@playwright/test").Locator} locator
 */
async function liveClick(locator) {
  await locator.waitFor();
  await locator.evaluate((element) => {
    /** @type {HTMLElement} */ (element).click();
  });
}

/**
 * Hold `key` for `ms`.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} key
 * @param {number} ms
 * @param {Stepper} [stepper]  frames instead of wall time: held for exactly `ms` x 20 / 1000 of them
 */
async function walk(page, key, ms, stepper) {
  await page.keyboard.down(key);
  await (stepper === undefined ? sleep(ms) : stepper.steps(frames(ms)));
  await page.keyboard.up(key);
}

/** @param {import("@playwright/test").Page} page */
async function pageEvents(page) {
  return page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    events: /** @type {{ t: number, kind: string, skillId: string }[]} */ (
      /** @type {unknown} */ (Reflect.get(globalThis, "__capture")) ?? []
    ),
  }));
}

/**
 * The fight, and the cold open before it: the Gallery's raise, then a
 * fight watched until it has an interrupt. Frame-stepped (#4006), so the
 * video is smooth; the music is another, real-time run (`fightMusic`).
 * Retried: a match with no interrupt is no use to the cut.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function fight(browser, url) {
  for (let attempt = 1; attempt <= FIGHT_TRIES; attempt += 1) {
    const scene = await openScene(browser, "fight", url, "stepped");
    const frame = stepper(scene.page);
    scene.stepper = frame;
    await startMatch(scene.page, "wardens-gallery", { stepper: frame, name: "fight" });
    scene.marks.matchStart = scene.now();
    step = "fight";
    // Heroes are held for the raise; Space takes the nearest foe on and keeps at it.
    await frame.steps(frames(20_000));
    scene.marks.fightStart = scene.now();
    await scene.page.keyboard.down("KeyW");
    await walk(scene.page, "KeyD", 3000, frame);
    await scene.page.keyboard.up("KeyW");
    let watched = 0;
    let seen = await pageEvents(scene.page);
    while (watched < FIGHT_MS && !seen.events.some((e) => e.kind === "interrupted" && e.t > 0)) {
      await scene.page.keyboard.press("Space");
      await frame.steps(frames(2000));
      watched += 2000;
      seen = await pageEvents(scene.page);
    }
    // A little more, so the cut has an aftermath.
    await frame.steps(frames(6000));
    seen = await pageEvents(scene.page);
    const interrupted = seen.events.some((event) => event.kind === "interrupted");
    await closeScene(scene, "fight", seen.events, seen.timeOrigin);
    if (interrupted) {
      await fightMusic(browser, url);
      return;
    }
    console.error(`fight try ${String(attempt)}: no interrupt`);
  }
  throw new Error(`no fight with an interrupt in ${String(FIGHT_TRIES)} tries`);
}

/**
 * The music of the fight, taken in real time in a run of its own: audio
 * cannot be stepped. Its `musicSettled` mark goes into `fight.json`; the
 * assembly aligns the take's beat to the plan, not to this run's video.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function fightMusic(browser, url) {
  for (let attempt = 1; attempt <= FIGHT_TRIES; attempt += 1) {
    const scene = await openScene(browser, "fight-music", url, "none");
    await startMatch(scene.page, "wardens-gallery");
    step = "fight music";
    await sleep(20_000);
    for (let i = 0; i < 8; i += 1) {
      await scene.page.keyboard.press("Space");
      await sleep(2000);
    }
    const music = await musicTake(scene.page);
    const switches = await musicSwitches(scene.page);
    await scene.context.close();
    if (music !== undefined) {
      fs.writeFileSync(path.join(OUT, "music.webm"), Buffer.from(music.base64, "base64"));
      const file = path.join(OUT, "fight.json");
      /** @type {unknown} */
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const shot = /** @type {{ marks: Record<string, number> }} */ (raw);
      shot.marks.musicSettled = musicSettled(switches, music.startedAt);
      fs.writeFileSync(file, JSON.stringify(shot, null, 1));
      console.log(`fight music: settled at ${String(shot.marks.musicSettled)} s`);
      return;
    }
    console.error(`fight music try ${String(attempt)}: no music`);
  }
  throw new Error(`no music take in ${String(FIGHT_TRIES)} tries`);
}

/**
 * The switches the music host reported in `page`, from `SWITCH_TAP`.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{ heardAtEpochMs: number, cps: number }[]>}
 */
async function musicSwitches(page) {
  return /** @type {{ heardAtEpochMs: number, cps: number }[]} */ (
    await page.evaluate("globalThis.__musicSwitches ?? []")
  );
}

/**
 * The music take of whichever frame has one: the host's.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{ startedAt: number, base64: string } | undefined>}
 */
async function musicTake(page) {
  for (const frame of page.frames()) {
    /** @type {unknown} */
    const got = await frame
      .evaluate("globalThis.__music ? globalThis.__music.stop() : undefined")
      .catch(() => undefined);
    if (got !== undefined && got !== null) {
      return /** @type {{ startedAt: number, base64: string }} */ (got);
    }
  }
  return undefined;
}

/**
 * The build editor: a character with both professions and a full bar,
 * the template pasted, a skill's tooltip open.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function editor(browser, url) {
  const scene = await openScene(browser, "editor", url);
  const { page } = scene;
  step = "editor";
  await sleep(1500);
  await openRail(page, "Character Builder");
  await sleep(800);
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").waitFor();
  await sleep(1000);
  scene.marks.paste = scene.now();
  await paste(page, BUILD_CODE);
  await page.locator(".toast", { hasText: "Imported" }).waitFor();
  await page.locator("input.editor-name").fill(NAME);
  await sleep(1500);
  await page.getByText("Fireball", { exact: true }).locator("visible=true").first().hover();
  await page.locator(".skill-tip").first().waitFor();
  await sleep(2500);
  const { events, timeOrigin } = await pageEvents(page);
  await closeScene(scene, "editor", events, timeOrigin);
}

/**
 * Wait out the pre-match hold: the countdown shows, then goes, and the
 * spawn bubble fades. What is filmed after this is the live match.
 *
 * @param {import("@playwright/test").Page} page
 */
async function waitLive(page) {
  const hold = page.locator(".hud-pre-match");
  await hold.filter({ hasText: /Match starts in/ }).waitFor({ timeout: 90_000 });
  await hold.waitFor({ state: "hidden", timeout: 90_000 });
  await sleep(2500);
}

/**
 * `waitLive` for a stepped scene: the countdown runs in frames.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Stepper} stepper
 */
async function waitLiveStepped(page, stepper) {
  const hold = page.locator(".hud-pre-match");
  const limit = frames(90_000);
  let last = "";
  for (let i = 0; i < limit; i += 1) {
    await stepper.steps(1);
    // The banner is gone once the match is live, whether or not a frame saw its countdown.
    if (!(await hold.isVisible())) {
      await stepper.steps(frames(2500));
      return;
    }
    last = (await hold.textContent()) ?? "";
  }
  throw new Error(`the pre-match hold never ended; the banner said "${last}"`);
}

/**
 * An action shot (#3982): the match is fast-forwarded past the countdown,
 * the player advances and casts until `wanted` shows among the combat
 * events, and the shot's start (`marks.action`) is that event's time.
 * Retried like `fight`: bots are random, so a run may never produce it.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 * @param {string} name  the scene, `act-<name>`
 * @param {string} mapId
 * @param {(event: { kind: string, skillId: string }) => boolean} wanted
 */
async function actionScene(browser, url, name, mapId, wanted) {
  const id = `act-${name}`;
  for (let attempt = 1; attempt <= SCENE_TRIES; attempt += 1) {
    const scene = await openScene(browser, id, url, "stepped");
    const frame = stepper(scene.page);
    scene.stepper = frame;
    await startMatch(scene.page, mapId, { stepper: frame, name: id });
    scene.marks.matchStart = scene.now();
    step = id;
    await waitLiveStepped(scene.page, frame);
    await scene.page.mouse.move(960, 540);
    const hit = await waitEvent(scene.page, frame, wanted, ACTION_MS, async () => {
      await advance(scene.page, frame, 1500);
      await cycleSkills(scene.page, frame);
    });
    if (hit !== undefined) {
      const seen = await pageEvents(scene.page);
      scene.marks.action = (hit.t - frame.origin()) / 1000;
      // The shot's two seconds, played out.
      await frame.steps(frames(2000));
      const after = await pageEvents(scene.page);
      await closeScene(scene, id, after.events, seen.timeOrigin);
      return;
    }
    const { events, timeOrigin } = await pageEvents(scene.page);
    await closeScene(scene, id, events, timeOrigin);
    console.error(`${id} try ${String(attempt)}: no event`);
  }
  throw new Error(`${id}: no event in ${String(SCENE_TRIES)} tries`);
}

/**
 * Play with friends: a Hosted Game lobby, Copy invite link, a second
 * player in another page of the same browser context joining by it, then
 * both ready and the match starting. The guest's page is recorded too and ignored.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function friends(browser, url) {
  const scene = await openScene(browser, "friends", url);
  const { page, context } = scene;
  step = "lobby";
  await openRail(page, "Hosted Game");
  // 1v1: a side of one each, so two players are a full match.
  await page.getByRole("button", { name: "Smaller team" }).click();
  await page.getByRole("button", { name: "Smaller team" }).click();
  await sleep(1500);
  scene.marks.copy = scene.now();
  const lobby = page.locator("#topbar .topbar-lobby-button");
  await lobby.click();
  await page.locator("#topbar .lobby-window .topbar-lobby-open").click();
  await page.locator("#topbar .lobby-window .lobby-copy").click();
  await page.locator(".toast", { hasText: "Copied" }).waitFor();
  const invite = await page.evaluate(() => navigator.clipboard.readText());
  await sleep(1500);
  await page.keyboard.press("Escape");
  step = "guest joins";
  const guest = await context.newPage();
  guest.setDefaultTimeout(20_000);
  await guest.goto(`${url}?capture`);
  await guest.locator(".mode-rail").waitFor();
  await guest.goto(invite);
  await page.bringToFront();
  scene.marks.joined = scene.now();
  await page
    .locator(".lobby-panel", { hasText: /Spectating:.+,/ })
    .first()
    .waitFor();
  await sleep(1500);
  step = "friends ready";
  await guest.getByRole("button", { name: "join team 2" }).click();
  await guest.getByRole("button", { name: "Ready", exact: true }).click();
  await page.bringToFront();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  scene.marks.ready = scene.now();
  await page.getByRole("button", { name: "start match" }).click();
  await page.locator("#viewport canvas:not(.compass)").waitFor({ timeout: 90_000 });
  await page.locator(".hud-pre-match", { hasText: /Match starts in/ }).waitFor({ timeout: 90_000 });
  scene.marks.countdown = scene.now();
  await sleep(4000);
  const { events, timeOrigin } = await pageEvents(page);
  await closeScene(scene, "friends", events, timeOrigin);
}

/**
 * Ranked: the match end panel with its charts (the e2e fixture's fixed
 * summary), then a match with the character wearing what a top
 * player has earned, zoomed on the cape: the cosmetics' unlock facts are seeded into this
 * context's storage, as a fetched leaderboard would leave them.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function ranked(browser, url) {
  const scene = await openScene(browser, "ranked", url);
  const { page } = scene;
  step = "end panel";
  scene.marks.panel = scene.now();
  await page.goto(`${url}?summary-fixture=win`);
  await sleep(4500);
  step = "seed cosmetics";
  await page.evaluate(() => {
    localStorage.setItem(
      "vibewars.cosmetics",
      JSON.stringify({
        choice: {
          aura: "aura-starlight",
          trail: "trail-starlight",
          swing: "swing-starlight",
          cape: "cape-stars",
          emblemFrame: "emblem-frame-gilt",
          frame: "frame-orchid",
          title: "title-champion",
        },
        facts: { wins: 500, streak: 5, rank: 1 },
      }),
    );
  });
  await page.goto(`${url}?capture`);
  await page.locator(".mode-rail").waitFor();
  step = "match in the look";
  await startMatch(page, RANKED_MAP);
  await waitLive(page);
  // Wheel in on the hero, the camera's centre, and walk: the cape is the subject.
  await page.mouse.move(960, 540);
  await page.mouse.wheel(0, -400);
  await sleep(800);
  scene.marks.cape = scene.now();
  await walk(page, "KeyD", 3500);
  const { events, timeOrigin } = await pageEvents(page);
  await closeScene(scene, "ranked", events, timeOrigin);
}

/** The scenes by name; an `act-<name>` is made from `ACTIONS`. */
/** @type {Record<string, (browser: import("@playwright/test").Browser, url: string) => Promise<void>>} */
const SCENES = {
  fight,
  editor,
  friends,
  ranked,
  ...Object.fromEntries(
    Object.entries(ACTIONS).map(([name, shot]) => [
      `act-${name}`,
      (/** @type {import("@playwright/test").Browser} */ b, /** @type {string} */ u) =>
        actionScene(b, u, name, shot.map, shot.wanted),
    ]),
  ),
};

const wanted = options.scene === undefined ? Object.keys(SCENES) : [options.scene];
const unknown = wanted.find((name) => !(name in SCENES));
if (unknown !== undefined) {
  console.error(`no scene "${unknown}"; the scenes are ${Object.keys(SCENES).join(", ")}`);
  process.exit(1);
}
const served = options.url === undefined ? await serve() : undefined;
const url = options.url ?? served?.url ?? "";
const executablePath = process.env.VIBEWARS_CHROMIUM;
/** @type {import("@playwright/test").Browser | undefined} */
let browser;
try {
  browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  for (const name of wanted) {
    step = `scene ${name}`;
    await SCENES[name]?.(browser, url);
  }
} catch (error) {
  console.error(`promo capture failed at "${step}":`);
  console.error(error);
  const shot = path.join(os.tmpdir(), "promo-capture-failure.png");
  await browser
    ?.contexts()
    .at(-1)
    ?.pages()
    .at(-1)
    ?.screenshot({ path: shot })
    .catch((/** @type {unknown} */ reason) => {
      console.error(reason);
    });
  console.error(`the page at the failure: ${shot}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  served?.stop();
  // A failed stepped scene leaves its ffmpeg open on a pipe: leaving ends it.
  process.exit(process.exitCode ?? 0);
}

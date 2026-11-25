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
 *   music.webm     the music of the fight scene, one continuous take, tapped
 *                  inside the music host (see `AUDIO_TAP`); the music bed
 *
 *   --scene <name>  shoot one scene: fight, editor, map-<id>, friends, ranked
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
const MAPS = ["broken-tower", "arena-canyon", "ember-pits"];

/**
 * Every animation frame the page gets, as `performance.now()` ms, on
 * `window.__frames`: how smooth the capture ran (#3980). Like the audio tap,
 * it is the capture's own and no game code is involved.
 */
const FRAME_LOG = `(() => {
  const frames = [];
  Object.defineProperty(window, "__frames", { value: frames });
  const tick = (t) => {
    frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

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

/**
 * A scene: a fresh, recorded context with one page on the menu, so no
 * scene inherits another's lobby or character.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 * @param {string} name
 */
async function openScene(browser, name, url) {
  const dir = path.join(OUT, `${name}-video`);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: SIZE },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(AUDIO_TAP);
  await context.addInitScript(FRAME_LOG);
  const startedAt = Date.now();
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(`${url}?capture`);
  await page.locator(".mode-rail").waitFor();
  /** @type {Record<string, number>} */
  const marks = {};
  /** Seconds into the video, now. */
  const now = () => (Date.now() - startedAt) / 1000;
  return { context, page, dir, marks, now, startedAt };
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
  const frames = await frameStats(scene.page);
  console.log(`${name}: frame intervals ${JSON.stringify(frames)}`);
  const video = scene.page.video();
  await scene.context.close();
  fs.mkdirSync(OUT, { recursive: true });
  await video?.saveAs(path.join(OUT, `${name}.webm`));
  fs.rmSync(scene.dir, { recursive: true, force: true });
  const seen = events.map((event) => ({
    ...event,
    t: (timeOrigin + event.t - scene.startedAt) / 1000,
  }));
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    JSON.stringify({ events: seen, marks: scene.marks, frames }, null, 1),
  );
  console.log(`${name}: ${String(seen.length)} events, marks ${JSON.stringify(scene.marks)}`);
}

/**
 * The page's frame intervals in ms: median, 95th percentile, longest, and
 * how many frames it drew.
 *
 * @param {import("@playwright/test").Page} page
 */
async function frameStats(page) {
  /** @type {number[]} */
  const times = await page.evaluate(() => {
    /** @type {unknown} */
    const frames = Reflect.get(globalThis, "__frames");
    return Array.isArray(frames) ? frames.map(Number) : [];
  });
  const gaps = times
    .slice(1)
    .map((t, i) => t - (times[i] ?? t))
    .sort((a, b) => a - b);
  const at = (/** @type {number} */ q) =>
    Math.round((gaps[Math.floor(q * (gaps.length - 1))] ?? 0) * 10) / 10;
  return { count: times.length, p50: at(0.5), p95: at(0.95), max: at(1) };
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
 * @param {import("@playwright/test").Page} page
 * @param {string} mapId
 */
async function startMatch(page, mapId) {
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
 */
async function walk(page, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
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
 * fight watched until it has an interrupt, with the music taken beside it.
 * Retried: a match with no interrupt is no use to the cut.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 */
async function fight(browser, url) {
  for (let attempt = 1; attempt <= FIGHT_TRIES; attempt += 1) {
    const scene = await openScene(browser, "fight", url);
    await startMatch(scene.page, "wardens-gallery");
    scene.marks.matchStart = scene.now();
    step = "fight";
    // Heroes are held for the raise; Space takes the nearest foe on and keeps at it.
    await sleep(20_000);
    scene.marks.fightStart = scene.now();
    await scene.page.keyboard.down("KeyW");
    await walk(scene.page, "KeyD", 3000);
    await scene.page.keyboard.up("KeyW");
    const deadline = Date.now() + FIGHT_MS;
    let seen = await pageEvents(scene.page);
    while (Date.now() < deadline && !seen.events.some((e) => e.kind === "interrupted" && e.t > 0)) {
      await scene.page.keyboard.press("Space");
      await sleep(2000);
      seen = await pageEvents(scene.page);
    }
    // A little more, so the cut has an aftermath.
    await sleep(6000);
    seen = await pageEvents(scene.page);
    const kinds = new Set(seen.events.map((event) => event.kind));
    const music = await musicTake(scene.page);
    if (music !== undefined) {
      scene.marks.musicStart = (music.startedAt - scene.startedAt) / 1000;
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, "music.webm"), Buffer.from(music.base64, "base64"));
    }
    await closeScene(scene, "fight", seen.events, seen.timeOrigin);
    if (kinds.has("interrupted") && music !== undefined) {
      return;
    }
    console.error(
      `fight try ${String(attempt)}: ${kinds.has("interrupted") ? "no music" : "no interrupt"}`,
    );
  }
  throw new Error(`no fight with an interrupt and music in ${String(FIGHT_TRIES)} tries`);
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
 * A map, from above and walked across.
 *
 * @param {import("@playwright/test").Browser} browser
 * @param {string} url
 * @param {string} mapId
 */
async function mapScene(browser, url, mapId) {
  const scene = await openScene(browser, `map-${mapId}`, url);
  await startMatch(scene.page, mapId);
  scene.marks.matchStart = scene.now();
  step = `pan ${mapId}`;
  await waitLive(scene.page);
  scene.marks.pan = scene.now();
  await scene.page.mouse.move(960, 540);
  await scene.page.keyboard.down("KeyW");
  await sleep(4000);
  await scene.page.keyboard.up("KeyW");
  await walk(scene.page, "KeyD", 4000);
  const { events, timeOrigin } = await pageEvents(scene.page);
  await closeScene(scene, `map-${mapId}`, events, timeOrigin);
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
  await startMatch(page, MAPS[0] ?? "");
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

/** The scenes by name; a `map-<id>` is made from `MAPS`. */
/** @type {Record<string, (browser: import("@playwright/test").Browser, url: string) => Promise<void>>} */
const SCENES = {
  fight,
  editor,
  friends,
  ranked,
  ...Object.fromEntries(
    MAPS.map((id) => [
      `map-${id}`,
      (/** @type {import("@playwright/test").Browser} */ b, /** @type {string} */ u) =>
        mapScene(b, u, id),
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
}

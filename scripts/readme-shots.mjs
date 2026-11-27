#!/usr/bin/env node
/**
 * `pnpm run readme:shots` — retake the README's six pictures (#1347, #3635).
 * Not part of CI: it is a docs tool, run whenever the UI has moved.
 *
 * Builds the static client with the BroadcastChannel transport, serves it,
 * and plays it in Chromium at 1280×720, as a player would:
 *
 *   readme-match.png     a Hosted Game on The Warden's Gallery, 8 a side:
 *                        the host proposes and votes a Team Build and
 *                        takes a seat; the default zoom, in the skirmish after the raise
 *   readme-map.png       the same match zoomed out
 *   readme-heights.png   a Broken Tower match, its stairs and lights
 *   readme-editor.png    a character with both professions, a full bar,
 *                        its attributes spent and a skill's tooltip open
 *   readme-training.png  the Training Ground, a Fireball just landed on
 *                        a dummy of the Armor ladder
 *   readme-menu.png      Random Arena with the character chosen, over the
 *                        menu's live arena background
 *
 * The background map is a random pick, so the README names no map. The shots are taken into a temporary directory and only moved into
 * docs/media/ once all six exist: a failed run leaves the old set. A step
 * that cannot find what it looks for fails the run and says which step.
 *
 *   --url <url>   shoot a client already served there, built or run with
 *                 VITE_VIBEWARS_TRANSPORT=broadcast and VITE_VIBEWARS_SPLASH=off
 *
 * Browser: VIBEWARS_CHROMIUM (as for e2e), else Playwright's own.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

const PORT = 4321;
const MEDIA = path.join(import.meta.dirname, "..", "docs", "media");
const { values: options } = parseArgs({
  options: { url: { type: "string" } },
});

/**
 * The Elementalist/Mesmer starter build as a GW1 template code (#494): the
 * editor takes it pasted, and the code does not change with our own build
 * format. Fireball is in slot 1.
 */
const BUILD_CODE = "OgVFoMm8lmMgufXOyleRGFB";
const NAME = "Aria Stormveil";

/** What the run is doing, for the error a failed step throws. */
let step = "start";

/**
 * Serve the static client, built first, and resolve once it answers.
 *
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  // Outside the checkout, so the build leaves nothing behind to ignore.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "readme-shots-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    // Lobbies in one browser, with no relay, as e2e plays them.
    env: { ...process.env, VITE_VIBEWARS_TRANSPORT: "broadcast", VITE_VIBEWARS_SPLASH: "off" },
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
 * The character, built in the editor; shoots the editor and the Training
 * Ground beside it, and saves the character for the match.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} dir
 */
async function editorAndTraining(page, dir) {
  step = "open the editor";
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").waitFor();
  step = "paste the build";
  await paste(page, BUILD_CODE);
  await page.locator(".toast", { hasText: "Imported" }).waitFor();
  await page.locator("input.editor-name").fill(NAME);
  // The toast covers the bar; let it go.
  await page.locator(".toast").waitFor({ state: "detached", timeout: 15_000 });

  step = "wand on Fire Magic";
  // The template leaves the wand on Energy Storage, which the build has
  // at 7 of the 9 it needs; Fire Magic is at 12.
  await page.getByRole("button", { name: "Main hand", exact: true }).click();
  await page.getByRole("radio", { name: "Fire Magic" }).click();
  await page.keyboard.press("Escape");

  step = "editor tooltip";
  await page.getByText("Fireball", { exact: true }).locator("visible=true").first().hover();
  await page.locator(".skill-tip").first().waitFor();
  await sleep(500);
  await page.screenshot({ path: path.join(dir, "readme-editor.png") });

  step = "training ground";
  await page.mouse.move(0, 0);
  await page.getByRole("combobox", { name: "scenario" }).selectOption("armor-ladder");
  await page.getByRole("button", { name: "expand training ground" }).click();
  const stage = page.getByLabel("training arena");
  await stage.waitFor();
  // Take control on an empty spot, below the player, then the nearest dummy.
  const box = await stage.boundingBox();
  if (box === null) {
    throw new Error("the training arena has no box");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  // One step in, so the ladder fills more of the arena.
  await page.mouse.wheel(0, -120);
  await sleep(500);
  await page.keyboard.press("KeyC");
  await sleep(400);
  await page.keyboard.press("Tab");
  // Fireball in slot 1, tried until the readout counts its first hit; the shot
  // is taken on that frame, the burst still on the dummy.
  step = "cast Fireball";
  let hit = false;
  for (let tries = 0; tries < 12 && !hit; tries += 1) {
    await page.locator(".training-skill").first().click();
    for (let poll = 0; poll < 15 && !hit; poll += 1) {
      await sleep(100);
      hit = /damage\s*[1-9]/.test(await page.locator("body").innerText());
    }
  }
  if (!hit) {
    throw new Error("Fireball never landed");
  }
  await page.screenshot({ path: path.join(dir, "readme-training.png") });

  step = "save the character";
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "collapse training ground" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Saving returns to Character Builder; a card on Random Arena picks who plays.
  await openRail(page, "Random Arena");
  await page
    .locator(".character-card", { hasText: NAME })
    .first()
    .locator(".play-card-open")
    .click();
  step = "menu";
  // The live background settles on its arena.
  await sleep(2500);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(dir, "readme-menu.png") });
}

/**
 * A Hosted Game on `mapId`, 8 a side: the host proposes a Team Build,
 * votes for it and takes a seat, and the match starts with the host's
 * hero in it and bots around.
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
  // The lobby's clock runs: no waiting between these.
  await page.getByRole("button", { name: /^Your Team Builds/ }).click();
  await page.getByText("8 members").first().click();
  await page.getByRole("button", { name: "Propose this build" }).click();
  await page.mouse.click(470, 300);
  step = "seat";
  // The seat card has no handle of its own: the button just under its
  // title. An Elementalist, when the build has one; else the first seat.
  const seats = page.getByRole("button", { name: "Sit here" });
  await seats.first().waitFor();
  const title = await page
    .getByText(/^Elementalist/)
    .first()
    .boundingBox({ timeout: 1000 })
    .catch(() => null);
  let seat = seats.first();
  for (let at = 0; title !== null && at < (await seats.count()); at += 1) {
    const box = await seats.nth(at).boundingBox();
    if (
      box !== null &&
      Math.abs(box.x - title.x) < 120 &&
      box.y > title.y &&
      box.y - title.y < 90
    ) {
      seat = seats.nth(at);
    }
  }
  await seat.click();
  step = "match";
  await page.locator("#viewport canvas:not(.compass)").waitFor({ timeout: 90_000 });
  await sleep(3000);
  await page.mouse.move(640, 300);
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

/**
 * The match pictures: the Warden's Gallery close on its plinth and whole,
 * then Broken Tower's heights.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} dir
 */
async function matchShots(page, dir) {
  await startMatch(page, "wardens-gallery");
  // Heroes are held until the raise ends.
  await sleep(20_000);
  await page.keyboard.down("KeyW");
  await walk(page, "KeyD", 8000);
  await page.keyboard.up("KeyW");
  step = "match shot";
  // Space: the nearest foe is targeted and attacked.
  await page.keyboard.press("Space");
  await sleep(1500);
  await zoomTo(page, "Default", -120);
  await page.screenshot({ path: path.join(dir, "readme-match.png") });
  await zoomTo(page, "Wide", 120);
  await page.screenshot({ path: path.join(dir, "readme-map.png") });
}

/**
 * Broken Tower's heights, in a client of its own: the lobby of the match
 * before is still running in the first.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} dir
 */
async function heightsShot(page, dir) {
  await startMatch(page, "broken-tower");
  // The host sits in either team's block, one end of the map (x ~540 or
  // ~4880), and the camera's `data-camera` is where the hero stands. Walk to
  // the near cellar mouth: west torch (1370,1310) with steps (1390..1530,
  // 1337), east torch (4054,1310) with steps (3894..4034, 1337). The hero
  // stops 120 u short of the steps, which lie ahead with the torch above.
  const stage = page.locator("#viewport");
  const camera = async () => {
    const at = (await stage.getAttribute("data-camera"))?.split(",").map(Number);
    if (at?.[0] === undefined || Number.isNaN(at[0])) {
      throw new Error("heights shot: the camera has no position");
    }
    return at[0];
  };
  const west = (await camera()) < 2700;
  const key = west ? "KeyD" : "KeyA";
  const stopAt = west ? 1270 : 4154;
  await page.keyboard.down(key);
  let x = await camera();
  for (let poll = 0; poll < 100 && (west ? x < stopAt : x > stopAt); poll += 1) {
    await sleep(100);
    x = await camera();
  }
  await page.keyboard.up(key);
  if (west ? x < stopAt : x > stopAt) {
    throw new Error(
      `heights shot: the hero never reached x=${String(stopAt)}, stopped at ${String(x)}`,
    );
  }
  await sleep(600);
  step = "heights shot";
  const shot = await page.screenshot({ timeout: 60_000 });
  assertNotVoid(shot);
  fs.writeFileSync(path.join(dir, "readme-heights.png"), shot);
}

/**
 * Fail when the frame's centre is mostly the void: a walk that ended off the
 * map must stop the script, not commit a bad picture.
 *
 * @param {Buffer} png the whole 1280x720 frame
 */
function assertNotVoid(png) {
  const raw = spawnSync(
    "ffmpeg",
    [
      ...["-v", "error", "-i", "pipe:0", "-vf", "crop=200:200:540:260"],
      ...["-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    ],
    { input: png, maxBuffer: 1 << 20 },
  );
  const bytes = raw.stdout;
  if (raw.status !== 0 || bytes.length < 3) {
    throw new Error(`heights shot: the void check could not read the frame: ${String(raw.stderr)}`);
  }
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (let at = 0; at + 2 < bytes.length; at += 3) {
    const colour = bytes.readUIntBE(at, 3);
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  const pixels = bytes.length / 3;
  const same = Math.max(...counts.values());
  if (same > pixels / 2) {
    throw new Error(
      `heights shot: the walk ended off the map (${String(same)} of ${String(pixels)} px alike)`,
    );
  }
}

/**
 * Wheel a notch at a time until the stage names `name`, then wait until
 * the camera, which eases there, holds still.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} name a `data-zoom-step`: Close, Near, Default or Wide
 * @param {number} deltaY per notch: negative in, positive out
 */
async function zoomTo(page, name, deltaY) {
  const stage = page.locator("#viewport");
  await page.locator("#viewport canvas:not(.compass)").hover();
  for (let notch = 0; notch < 4; notch += 1) {
    if ((await stage.getAttribute("data-zoom-step")) === name) {
      break;
    }
    await page.mouse.wheel(0, deltaY);
    await sleep(400);
  }
  if ((await stage.getAttribute("data-zoom-step")) !== name) {
    throw new Error(`the camera did not step to ${name}`);
  }
  let last = "";
  for (let poll = 0; poll < 40; poll += 1) {
    const now = `${String(await stage.getAttribute("data-zoom"))} ${String(await stage.getAttribute("data-camera"))}`;
    if (now === last) {
      return;
    }
    last = now;
    await sleep(250);
  }
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

const served = options.url === undefined ? await serve() : undefined;
const url = options.url ?? served?.url ?? "";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "readme-shots-png-"));
const executablePath = process.env.VIBEWARS_CHROMIUM;
// Launched inside the try, so a browser that fails to start still stops the server.
/** @type {import("@playwright/test").Browser | undefined} */
let browser;
try {
  step = "launch chromium";
  browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  // A missing selector fails the step in seconds, not minutes.
  page.setDefaultTimeout(20_000);
  step = "open the client";
  await page.goto(url);
  await page.locator(".mode-rail").waitFor();
  await editorAndTraining(page, dir);
  await matchShots(page, dir);
  // Client 2 renders alone: two WebGL matches in one software Chromium starve its screenshot.
  await context.close();
  const second = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page2 = await second.newPage();
  page2.setDefaultTimeout(20_000);
  await page2.goto(url);
  await page2.locator(".mode-rail").waitFor();
  await heightsShot(page2, dir);
  const shots = [
    "readme-match.png",
    "readme-map.png",
    "readme-heights.png",
    "readme-editor.png",
    "readme-training.png",
    "readme-menu.png",
  ];
  for (const shot of shots) {
    fs.copyFileSync(path.join(dir, shot), path.join(MEDIA, shot));
    if (/match|map|heights/.test(shot)) {
      // The sand and stone take 96 colours; a third of the bytes (ImageMagick).
      const target = path.join(MEDIA, shot);
      spawnSync("magick", [target, "-colors", "96", `PNG8:${target}`], { stdio: "inherit" });
    }
    const kb = Math.round(fs.statSync(path.join(MEDIA, shot)).size / 1024);
    console.log(`docs/media/${shot}  ${String(kb)} KB`);
  }
} catch (error) {
  console.error(`readme-shots failed at "${step}":`);
  console.error(error);
  const shot = path.join(os.tmpdir(), "readme-shots-failure.png");
  await browser
    ?.contexts()[0]
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
  fs.rmSync(dir, { recursive: true, force: true });
  served?.stop();
}

#!/usr/bin/env node
/**
 * `pnpm run readme:shots` — retake the README's four pictures (#1347).
 * Not part of CI: it is a docs tool, run whenever the UI has moved.
 *
 * Builds the static client with the BroadcastChannel transport, serves it,
 * and plays it in Chromium at 1280×720, as a player would:
 *
 *   readme-editor.png    a character with both professions, a full bar,
 *                        its attributes spent and a skill's tooltip open
 *   readme-training.png  the Training Ground, a Fireball just landed on
 *                        a dummy of the Armor ladder
 *   readme-match.png     a hosted 4v4 lobby filled with bots, about ten
 *                        seconds into the fight, a step in, with the HUD
 *   readme-map.png       the same match a few seconds later, out at Wide,
 *                        on a frame with no refusal text over the arena
 *
 * The shots are taken into a temporary directory and only moved into
 * docs/media/ once all four exist: a failed run leaves the old set. A step
 * that cannot find what it looks for fails the run and says which step.
 * The bots fight at random, so the match pictures change between runs.
 *
 *   --url <url>   shoot a client already served there, built or run with
 *                 VITE_VIBEWARS_TRANSPORT=broadcast
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

const PORT = 4321;
const MEDIA = path.join(import.meta.dirname, "..", "docs", "media");
const { values: options } = parseArgs({ options: { url: { type: "string" } } });

/**
 * The Elementalist/Mesmer starter build as a GW1 template code (#494): the
 * editor takes it pasted, and the code does not change with our own build
 * format. Fireball is on Q.
 */
const BUILD_CODE = "OgVFoMm8lmMgufXOyleRGFB";
const NAME = "Aria Stormveil";
/** The other seven: three beside you, four against; the host picks what they play (#1454). */
const BOTS = { 1: 3, 2: 4 };
/** The arena both match shots are on; it fills the frame at Wide. */
const MAP = "arena-canyon";

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
    env: { ...process.env, VITE_VIBEWARS_TRANSPORT: "broadcast" },
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
  await page.locator("button", { hasText: /^gear$/i }).click();
  await page
    .getByRole("combobox", { name: "wand attribute" })
    .selectOption({ label: "Fire Magic" });
  await page.locator("button", { hasText: /^skills$/i }).click();

  step = "editor tooltip";
  await page.locator(".skill-box", { hasText: "Fireball" }).first().hover();
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
  await page.keyboard.press("KeyQ");
  // Fireball's cast and flight, and its burst on the dummy.
  await sleep(2000);
  await page.screenshot({ path: path.join(dir, "readme-training.png") });

  step = "save the character";
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "collapse training ground" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".selectable-row", { hasText: NAME }).first().click();
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
 * How many pixels of the arena, the HUD's corners left out, are in the
 * neutral floating-text yellow, #ffd866 at any fade over the dark floor:
 * "can't reach", "interrupted!" and the like. The target ring shares it,
 * so shoot this with no target. Status icons are an orange yellow, less
 * blue for their green, and stay out.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Buffer} png
 * @returns {Promise<number>}
 */
async function yellowPixels(page, png) {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await globalThis.createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (context === null) {
      return 0;
    }
    context.drawImage(bitmap, 0, 0);
    // Below the target panel, left of the compass and the party, above the bar.
    const { data } = context.getImageData(0, 150, 1060, 400);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [red = 0, green = 0, blue = 0] = data.subarray(i, i + 3);
      const hue =
        green > 0.8 * red && green < 0.92 * red && blue > 0.43 * green && blue < 0.65 * green;
      if (red > 60 && red - blue > 30 && hue) {
        count += 1;
      }
    }
    return count;
  }, png.toString("base64"));
}

/**
 * Host a lobby, fill it with bots, play the match and shoot it twice.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} dir
 */
async function match(page, dir) {
  step = "host a lobby";
  await page.locator(".screen-menu input.field-input").first().fill(NAME);
  await page.getByRole("button", { name: "host a lobby" }).click();
  await page.locator(".lobby-code").waitFor();
  step = "pick the map";
  await page.locator(".lobby-map select").selectOption(MAP);
  step = "join team 1";
  await page.getByRole("button", { name: "join team 1" }).click();
  for (const [team, count] of Object.entries(BOTS)) {
    const shown = page
      .locator(".lobby-team")
      .nth(Number(team) - 1)
      .locator(".lobby-bot-count");
    for (let bots = 1; bots <= count; bots += 1) {
      step = `bot ${String(bots)} on team ${team}`;
      await page.getByRole("button", { name: `one bot more on team ${team}` }).click();
      // Each + asks for one more than the count shown: wait for it to land.
      await shown.filter({ hasText: String(bots) }).waitFor();
    }
  }
  step = "start the match";
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await page.locator(".hud-bar-health").waitFor();

  step = "zoom in";
  // A step in, so the hero shows the fight rather than the floor round it.
  await zoomTo(page, "Near", -120);

  step = "fight";
  // Into the fight with the bots: a foe targeted, the wand and the bar on it.
  const target = page.locator(".hud-target-text");
  const keys = ["KeyQ", "KeyW", "KeyE", "KeyA"];
  for (let second = 0; second < 12; second += 1) {
    if ((await target.textContent()) === "no target") {
      await page.keyboard.press("Tab");
    }
    // None in the last seconds, so no "That skill is recharging." in the shot.
    if (second < 9) {
      await page.keyboard.press(keys[second % keys.length] ?? "KeyQ");
    }
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(dir, "readme-match.png") });

  step = "zoom out";
  await zoomTo(page, "Wide", 120);
  // The bots refuse now and then ("can't reach"); wait for a frame with
  // none over the arena. No target, so its ring is not counted as one.
  // Esc cancels a cast first, then drops the target.
  for (let press = 0; press < 3 && (await target.textContent()) !== "no target"; press += 1) {
    await page.keyboard.press("Escape");
    await sleep(200);
  }
  let shot = await page.screenshot();
  for (let retry = 0; retry < 20 && (await yellowPixels(page, shot)) > 10; retry += 1) {
    await sleep(500);
    shot = await page.screenshot();
  }
  fs.writeFileSync(path.join(dir, "readme-map.png"), shot);
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
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  // A missing selector fails the step in seconds, not minutes.
  page.setDefaultTimeout(20_000);
  step = "open the client";
  await page.goto(url);
  await page.locator(".roster").waitFor();
  await editorAndTraining(page, dir);
  await match(page, dir);
  const shots = ["readme-editor.png", "readme-training.png", "readme-match.png", "readme-map.png"];
  for (const shot of shots) {
    fs.copyFileSync(path.join(dir, shot), path.join(MEDIA, shot));
    const kb = Math.round(fs.statSync(path.join(MEDIA, shot)).size / 1024);
    console.log(`docs/media/${shot}  ${String(kb)} KB`);
  }
} catch (error) {
  console.error(`readme-shots failed at "${step}":`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  served?.stop();
}

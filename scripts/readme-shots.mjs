#!/usr/bin/env node
/**
 * `pnpm run readme:shots` — retake the README's three pictures (#1347, #3635).
 * Not part of CI: it is a docs tool, run whenever the UI has moved.
 *
 * Builds the static client with the BroadcastChannel transport, serves it,
 * and plays it in Chromium at 1280×720, as a player would:
 *
 *   readme-editor.png    a character with both professions, a full bar,
 *                        its attributes spent and a skill's tooltip open
 *   readme-training.png  the Training Ground, a Fireball just landed on
 *                        a dummy of the Armor ladder
 *   readme-menu.png      Random Arena with the character chosen, over the
 *                        menu's live arena background
 *
 * The background map is a random pick, so the README names no map. The shots are taken into a temporary directory and only moved into
 * docs/media/ once all three exist: a failed run leaves the old set. A step
 * that cannot find what it looks for fails the run and says which step.
 *
 *   --url <url>   shoot a client already served there, built or run with
 *                 VITE_VIBEWARS_TRANSPORT=broadcast and VITE_VIBEWARS_SPLASH=off
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
    await page.getByRole("button", { name: "Fireball" }).click();
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
  const shots = ["readme-editor.png", "readme-training.png", "readme-menu.png"];
  for (const shot of shots) {
    fs.copyFileSync(path.join(dir, shot), path.join(MEDIA, shot));
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

/**
 * `pnpm docs:diagrams` (#3557): renders the docs' diagrams with the game's
 * own renderer into docs/player/img/<id>.png, 800x450. A scene is data in
 * apps/web/src/dev/diagram-scenes.ts; its map scenes open the dev client's
 * `?scene=<id>` hook, its UI scenes click through the menus. A heavy job:
 * run it as `company heavy --short pnpm docs:diagrams`. Needs WebGL; where
 * a scene cannot draw, it fails and writes nothing for it.
 *
 *   node scripts/docs/diagrams.mjs [id ...]   only those scenes
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { DIAGRAM_SCENES, UI_SCENES } from "../../apps/web/src/dev/diagram-scenes.ts";

/** @typedef {import("@playwright/test").Browser} Browser */
/** @typedef {import("../../apps/web/src/dev/diagram-scenes.ts").DiagramScene} DiagramScene */

/* global window -- in page.waitForFunction, which runs in the page */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "docs", "player", "img");
const PORT = 4457;
const WIDTH = 800;
const HEIGHT = 450;
const MAX_BYTES = 150 * 1024;
/** Smaller than any drawn scene: a blank canvas compresses to almost nothing. */
const MIN_BYTES = 8 * 1024;
/**
 * The player in the UI shots. Left to the game, the name is random per
 * browser, so two frames of one flow would show two players and every
 * re-run would change the images. Dev serves at `/`, so the key is the
 * plain `vibewars` namespace (storage/namespace.ts).
 */
const PLAYER_NAME_KEY = "vibewars.playerName";
const PLAYER_NAME = "SwiftComet";

/** The dev client, up and answering; resolves its url and a way to stop it. */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@vibewars/web",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ],
    {
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        VITE_VIBEWARS_TRANSPORT: "broadcast",
        VITE_VIBEWARS_SPLASH: "off",
        VITE_VIBEWARS_MENU_BACKGROUND: "off",
      },
      detached: true,
    },
  );
  const stop = () => {
    if (child.exitCode === null && child.pid !== undefined) {
      process.kill(-child.pid);
    }
  };
  for (let waited = 0; waited < 120 && child.exitCode === null; waited += 1) {
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
  throw new Error(`the dev client did not come up at ${url}; is the port taken?`);
}

/** Writes `png` as `<id>.png`, or throws: too big, or too empty to be a drawing. */
/**
 * @param {string} id
 * @param {Buffer} png
 */
function save(id, png) {
  if (png.length > MAX_BYTES) {
    throw new Error(`${id}: ${String(png.length)} bytes, over the ${String(MAX_BYTES)} limit`);
  }
  if (png.length < MIN_BYTES) {
    throw new Error(`${id}: ${String(png.length)} bytes; the frame is blank (no WebGL?)`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${id}.png`), png);
  console.log(`${id}.png ${String(png.length)} bytes`);
}

/**
 * @param {Browser} browser
 * @param {string} url
 * @param {DiagramScene} scene
 */
async function mapScene(browser, url, scene) {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${url}?scene=${scene.id}`);
    await page.waitForFunction(
      () => /** @type {{ __sceneReady?: boolean }} */ (window).__sceneReady === true,
      undefined,
      { timeout: 60_000 },
    );
    save(scene.id, await page.screenshot({ type: "png" }));
  } finally {
    await page.close();
  }
}

/** The Team Arena screens, reached through the menus as the e2e specs do. */
/**
 * @param {Browser} browser
 * @param {string} url
 * @param {string[]} wanted
 */
async function uiScenes(browser, url, wanted) {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    reducedMotion: "reduce",
  });
  try {
    await page.addInitScript(
      ([key, name]) => {
        localStorage.setItem(key, name);
      },
      [PLAYER_NAME_KEY, PLAYER_NAME],
    );
    await page.goto(url);
    await page
      .locator(".mode-rail")
      .getByRole("button", { name: "Team Arena", exact: true })
      .click();
    await page.locator(".mode-rail-size-value").waitFor();
    /** @type {Record<string, () => Promise<void>>} */
    const shots = {
      "team-arena-size": () => Promise.resolve(),
      "team-arena-signup": async () => {
        await page
          .getByRole("button", { name: /^join team/i })
          .first()
          .click();
        await page.locator(".lobby-panel").waitFor();
      },
    };
    for (const scene of UI_SCENES) {
      await shots[scene.ui]();
      if (wanted.length === 0 || wanted.includes(scene.id)) {
        save(scene.id, await page.screenshot({ type: "png" }));
      }
    }
  } finally {
    await page.close();
  }
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter(
  (id) => ![...DIAGRAM_SCENES, ...UI_SCENES].some((scene) => scene.id === id),
);
if (unknown.length > 0) {
  console.error(`no such scene: ${unknown.join(", ")}`);
  process.exit(2);
}
const served = await serve();
/** @type {Browser | undefined} */
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.VIBEWARS_CHROMIUM === undefined
      ? {}
      : { executablePath: process.env.VIBEWARS_CHROMIUM }),
    args: ["--no-sandbox"],
  });
  for (const scene of DIAGRAM_SCENES) {
    if (wanted.length === 0 || wanted.includes(scene.id)) {
      await mapScene(browser, served.url, scene);
    }
  }
  if (wanted.length === 0 || UI_SCENES.some((scene) => wanted.includes(scene.id))) {
    await uiScenes(browser, served.url, wanted);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  served.stop();
}

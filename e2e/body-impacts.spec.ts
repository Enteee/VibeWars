import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Sprint, a stance, lands on yourself: a glow (#1139). */
const SPRINTER = "Warrior/Monk";
const SPRINT = starterKey(SPRINTER, "warrior.sprint");
/** A player's body radius (#166). */
const RADIUS = 14;

const arena = JSON.parse(
  readFileSync(new URL("../packages/game-maps/maps/arena-alpha/map.json", import.meta.url), "utf8"),
) as {
  readonly spawnPoints: readonly {
    readonly team: number;
    readonly position: { readonly x: number; readonly y: number };
  }[];
};

/**
 * A strip just past your body's right edge, r + 1 to r + 5, as in
 * `body-rings.spec.ts`: where the glow's ring closes in (r + 4, frozen),
 * clear of the target ring at r + 8 and of the status row under you.
 * Watched every frame from now on, in the page: the glow lasts 0.3 s, which
 * a screenshot round trip on a busy runner can miss. `window.strip` holds,
 * per frame since, whether the strip differs from the frame it started at.
 */
async function watchRightEdge(page: Page): Promise<void> {
  const self = arena.spawnPoints.find((spawn) => spawn.team === 0)?.position;
  if (self === undefined) {
    throw new Error("arena-alpha has no team 0 spawn");
  }
  const canvas = page.locator("#viewport canvas:not(.compass)");
  const view = await projection(page.locator("#viewport"), canvas);
  const from = view.onCanvas({ x: self.x + RADIUS + 1, y: self.y - 2 });
  const to = view.onCanvas({ x: self.x + RADIUS + 5, y: self.y + 2 });
  await canvas.evaluate(
    (element, clip) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error("the arena canvas is not a canvas");
      }
      // CSS px to the canvas's own pixels.
      const scale = element.width / element.getBoundingClientRect().width;
      const x = Math.round(clip.x * scale);
      const y = Math.round(clip.y * scale);
      const width = Math.max(1, Math.round(clip.width * scale));
      const height = Math.max(1, Math.round(clip.height * scale));
      const copy = new OffscreenCanvas(width, height).getContext("2d", {
        willReadFrequently: true,
      });
      if (copy === null) {
        throw new Error("no 2d context to copy the strip into");
      }
      const frames: boolean[] = [];
      (window as { strip?: readonly boolean[] }).strip = frames;
      let first: Uint8ClampedArray | undefined;
      const sample = () => {
        copy.clearRect(0, 0, width, height);
        copy.drawImage(element, x, y, width, height, 0, 0, width, height);
        const pixels = copy.getImageData(0, 0, width, height).data;
        if (first === undefined) {
          first = pixels;
        } else {
          const base = first;
          frames.push(pixels.some((value, k) => value !== base[k]));
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
  );
  await expect.poll(() => strip(page)).not.toEqual([]);
}

/** What `watchRightEdge` has seen so far, a frame each. */
function strip(page: Page): Promise<readonly boolean[]> {
  return page.evaluate(() => (window as { strip?: readonly boolean[] }).strip ?? []);
}

test("a skill that lands glows on the body it helped, then is gone (#1139)", async ({ page }) => {
  // The frozen form: held 0.3 s at full alpha, then removed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bringStarter(page, SPRINTER);
  await page.goto("./");
  await startSoloMatch(page);
  await watchRightEdge(page);
  expect(await strip(page)).not.toContain(true);

  await page.keyboard.press(SPRINT);
  await expect(
    page.getByRole("list", { name: "your effects" }).getByAltText("Sprint"),
  ).toBeVisible();
  // It glowed, and the frames since are the strip as it was.
  await expect.poll(async () => (await strip(page)).includes(true)).toBe(true);
  await expect.poll(async () => (await strip(page)).at(-1)).toBe(false);
});

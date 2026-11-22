import { expect, test, type Locator, type Page } from "@playwright/test";

import { codeLabel } from "../apps/web/src/input/keymap.js";
import { projection } from "./camera.js";
import { chooseProfession } from "./helpers/professions.js";
import { openLibraryGroup } from "./helpers/library.js";
import { openRail } from "./helpers/menu.js";
import { PIXEL_8A_PORTRAIT, passTouchNotice } from "./helpers/phone.js";
import { skillKey } from "./keys.js";

/**
 * Touch controls in the arena (#3781), on a Pixel 8a in the Training
 * Ground: a tap on the ground walks, a tap on a dummy targets it, a
 * double tap attacks, and a tap on a skill slot casts it.
 */

test.use(PIXEL_8A_PORTRAIT);

const stage = (page: Page): Locator => page.locator(".training-stage");

/** Where the arena draws `id`, world units, from the stage's `data-positions` hook (#497). */
async function shownAt(page: Page, id: string): Promise<{ x: number; y: number } | undefined> {
  const value = (await stage(page).getAttribute("data-positions")) ?? "";
  const entry = value.split(";").find((each) => each.startsWith(`${id}:`));
  if (entry === undefined) {
    return undefined;
  }
  const [x = Number.NaN, y = Number.NaN] = entry
    .slice(id.length + 1)
    .split(",")
    .map(Number);
  return { x, y };
}

/** A new elementalist with Fireball on the bar, its Training Ground on screen. */
async function openTraining(page: Page): Promise<Locator> {
  await page.goto("./");
  await passTouchNotice(page);
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "elementalist");
  await openLibraryGroup(page, "Fire Magic");
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(".training-skill:not(.is-empty)")).toHaveText([codeLabel(skillKey(0))]);
  const canvas = page.locator(".training canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  return canvas;
}

/** Tap `world` where the arena draws it now. */
async function tapWorld(
  page: Page,
  canvas: Locator,
  world: { readonly x: number; readonly y: number },
): Promise<void> {
  const at = (await projection(stage(page), canvas)).onPage(world);
  await page.touchscreen.tap(at.x, at.y);
}

/** Fingers moved through the DevTools protocol: Playwright's touchscreen only taps. */
async function fingers(
  page: Page,
  steps: readonly (readonly { readonly x: number; readonly y: number }[])[],
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  for (const [index, points] of steps.entries()) {
    const type = index === 0 ? "touchStart" : "touchMove";
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point, id) => ({ ...point, id })),
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Take control of the arena by tapping a corner of it: that tap only takes it (#310). */
async function takeControl(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  await page.touchscreen.tap(box.x + 8, box.y + 8);
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
}

/**
 * Tap the ground short of the dummy, which starts off the narrow stage,
 * until you stand there and the camera has caught up; the dummy's point.
 */
async function walkNearDummy(
  page: Page,
  canvas: Locator,
): Promise<{ readonly x: number; readonly y: number }> {
  const dummy = await shownAt(page, "dummy");
  if (dummy === undefined) {
    throw new Error("no dummy on the stage");
  }
  const spot = { x: dummy.x - 150, y: dummy.y + 30 };
  await tapWorld(page, canvas, spot);
  await expect
    .poll(async () => {
      const you = await shownAt(page, "you");
      return you === undefined ? Infinity : Math.hypot(you.x - spot.x, you.y - spot.y);
    })
    .toBeLessThan(6);
  // The camera eases after you: wait until it centres on where you stopped.
  await expect
    .poll(async () => {
      const you = await shownAt(page, "you");
      const [x = Number.NaN, y = Number.NaN] = (
        (await stage(page).getAttribute("data-camera")) ?? ""
      )
        .split(",")
        .map(Number);
      return you === undefined ? Infinity : Math.hypot(you.x - x, you.y - y);
    })
    .toBeLessThan(2);
  return dummy;
}

test("a tap walks, a tap on the dummy targets it, a double tap attacks it", async ({ page }) => {
  // Walks and a swing in game time, slower than wall time under load (#327).
  test.setTimeout(90_000);
  const canvas = await openTraining(page);
  await takeControl(page, canvas);

  // The ground: you walk there, and target nothing.
  const dummy = await walkNearDummy(page, canvas);
  await expect(stage(page)).toHaveAttribute("data-target", "");

  // The dummy: targeted, and you stand still.
  const before = await shownAt(page, "you");
  await tapWorld(page, canvas, dummy);
  await expect(stage(page)).toHaveAttribute("data-target", "dummy");
  await page.waitForTimeout(500);
  expect(await shownAt(page, "you")).toEqual(before);
  await expect(page.locator(".training-log")).not.toContainText(/Wand \(.+\) hits/);

  // A fingertip off its edge still finds it; two taps on it attack.
  const view = await projection(stage(page), canvas);
  const at = view.onPage(dummy);
  const nearby = { x: at.x, y: at.y + 14 * view.zoom + 12 };
  await page.touchscreen.tap(nearby.x, nearby.y);
  await page.touchscreen.tap(nearby.x, nearby.y);
  await expect(stage(page)).toHaveAttribute("data-target", "dummy");
  await expect(page.locator(".training-log")).toContainText(/Wand \(.+\) hits/, {
    timeout: 45_000,
  });
});

test("a tap on a skill slot casts it on the target", async ({ page }) => {
  // The cast is 1.75 s of game time, slower than wall time under load (#327).
  test.setTimeout(90_000);
  const canvas = await openTraining(page);
  await takeControl(page, canvas);
  const dummy = await walkNearDummy(page, canvas);
  await tapWorld(page, canvas, dummy);
  await expect(stage(page)).toHaveAttribute("data-target", "dummy");
  await page.locator(".training-skill").first().tap();
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
    { timeout: 45_000 },
  );
});

test("a drag pans the camera and a pinch zooms it, and neither walks", async ({ page }) => {
  const canvas = await openTraining(page);
  await takeControl(page, canvas);
  const you = await shownAt(page, "you");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const camera = await stage(page).getAttribute("data-camera");
  const step = await stage(page).getAttribute("data-zoom-step");

  // One finger, 80 px left and held there: the view looks right.
  await fingers(page, [
    [centre],
    [{ x: centre.x - 20, y: centre.y }],
    [{ x: centre.x - 50, y: centre.y }],
    [{ x: centre.x - 80, y: centre.y }],
  ]);
  await expect
    .poll(async () => Number((await stage(page).getAttribute("data-camera"))?.split(",")[0]))
    .not.toBe(Number(camera?.split(",")[0]));
  // Two fingers drawn apart: closer in.
  await fingers(page, [
    [
      { x: centre.x - 40, y: centre.y },
      { x: centre.x + 40, y: centre.y },
    ],
    [
      { x: centre.x - 60, y: centre.y },
      { x: centre.x + 60, y: centre.y },
    ],
    [
      { x: centre.x - 80, y: centre.y },
      { x: centre.x + 80, y: centre.y },
    ],
  ]);
  await expect(stage(page)).not.toHaveAttribute("data-zoom-step", step ?? "");
  expect(await shownAt(page, "you")).toEqual(you);
  await expect(stage(page)).toHaveAttribute("data-target", "");
});

import { expect, test } from "@playwright/test";

import { projection } from "./camera.js";
import { PIXEL_8A_PORTRAIT } from "./helpers/phone.js";

/**
 * Phones are welcome (#3782): a Pixel 8a is offered the tutorial after the
 * splash like any other device, its tutor names the gesture rather than a
 * key, and a tap walks its first station. Only that one station: the rest
 * is `tutorial.spec`'s, which is at its per-spec ceiling.
 */

test.use(PIXEL_8A_PORTRAIT);

test("a phone learns to walk with a tap (#3782)", async ({ page }) => {
  // A solo start plus a walk on a loaded runner, as tutorial.spec's first station.
  test.setTimeout(240_000);
  await page.goto("./?splash&menu-background=bench-flat");
  const splash = page.locator(".splash");
  await expect(splash.locator(".splash-hint")).toBeVisible();
  await expect(page.locator("#menu-background")).toHaveAttribute("data-map", "bench-flat");
  await page.touchscreen.tap(200, 450);
  await expect(splash.locator(".splash-prompt")).toBeVisible({ timeout: 10_000 });
  await page.touchscreen.tap(200, 450);
  await expect(splash).toHaveCount(0);
  await page.getByRole("button", { name: "Learn to play" }).tap();

  const frame = page.locator(".tutorial-frame");
  await expect(frame).toHaveCount(1, { timeout: 30_000 });
  await expect(frame.locator(".tutorial-how")).toHaveText("Tap the ground to walk there.");
  await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
  const [x = 0, y = 0] = ((await frame.getAttribute("data-mark")) ?? "").split(",").map(Number);
  const stage = page.locator("#viewport");
  const said = frame.locator(".tutorial-said");
  // The praise stands 2.5 s only, then the next station's intro: either is past the walk.
  const walked = /Nice stride! You're a natural\.|Look north!/;
  // The camera may still be easing in on a slow runner, which makes one
  // projection stale: project afresh and tap again until the walk lands.
  await expect(async () => {
    if (walked.test((await said.textContent()) ?? "")) {
      return;
    }
    const at = (await projection(stage, page.locator("#viewport canvas:not(.compass)"))).onPage({
      x,
      y,
    });
    await page.touchscreen.tap(at.x, at.y);
    await expect(said).toHaveText(walked, { timeout: 15_000 });
  }).toPass({ timeout: 120_000 });
});

test("a phone puts its character in the team by tap and Put here (#3876)", async ({ page }) => {
  // A walk through the team editor on a loaded runner, as tutorial.spec's.
  test.setTimeout(180_000);
  await page.goto("./?menu-background=bench-flat&tutorial-menu=team");
  const panel = page.locator(".coach-panel");
  const bubble = page.locator(".coach-bubble");
  const target = (id: string) => page.locator(`[data-tutorial~="${id}"]`);
  await expect(target("rail-teams")).toHaveClass(/tutorial-pulse/);
  await target("rail-teams").tap();
  const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-build-size"]');
  await stepper.getByRole("button", { name: "Smaller team" }).tap();
  await expect(stepper).toContainText("2v2");
  await target("team-new").tap();
  await expect(page.locator(".team-grid .team-row")).toHaveCount(2);
  for (let read = 0; read < 3; read += 1) {
    await bubble.getByRole("button", { name: "Got it" }).tap();
  }

  // The touch line, not the drag one, and the step waits for it done.
  await expect(panel).toContainText("Put your character in the team");
  await expect(bubble).toContainText("Tap your character, then Put here on a member.");
  await page.locator(".library-tab", { hasText: "My characters" }).tap();
  const pick = page.locator(".team-pick").first();
  await pick.tap();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  const put = page.locator(".team-grid .team-row").nth(1).locator(".team-row-put");
  await put.tap();
  await expect(put).toBeHidden();
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toContainText("Fill the team");
});

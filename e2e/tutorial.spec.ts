import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";

/** Through the splash to its end, where a first-timer is offered the tutorial (#3218). */
async function pastTheSplash(page: Page, fragment = ""): Promise<void> {
  await page.goto(`./?splash&menu-background${fragment}`);
  const splash = page.locator(".splash");
  await expect(splash.locator(".splash-hint")).toBeVisible();
  // The fight is drawn before the offer reads its map.
  await expect(page.locator("#menu-background")).toHaveAttribute("data-map", /.+/);
  await page.keyboard.press("Space");
  await expect(splash.locator(".splash-prompt")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(splash).toHaveCount(0);
}

test.describe("the first-time tutorial (#3218)", () => {
  test("Skip opens the menu, and it is not offered again", async ({ page }) => {
    await pastTheSplash(page);
    const offer = page.locator(".tutorial-offer");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Skip" }).click();
    await expect(offer).toHaveCount(0);
    await expect(page.locator(".screen-rail")).toBeVisible();

    await pastTheSplash(page);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });

  test("Learn, then a click on the mark: praise, then the menu, and no offer again", async ({
    page,
  }) => {
    await pastTheSplash(page);
    await page.getByRole("button", { name: "Learn to play" }).click();
    const frame = page.locator(".tutorial-frame");
    await expect(frame.locator(".tutorial-said")).toHaveText(
      "This war never ends. Walk with me; I have an idea.",
    );
    await expect(frame.locator(".tutorial-how")).toContainText("W");
    await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
    const [x = 0, y = 0] = ((await frame.getAttribute("data-mark")) ?? "").split(",").map(Number);
    const view = await projection(
      page.locator("#viewport"),
      page.locator("#viewport canvas:not(.compass)"),
    );
    const at = view.onPage({ x, y });
    await page.mouse.click(at.x, at.y);
    await expect(frame.locator(".tutorial-said")).toHaveText("Nice stride! You're a natural.", {
      timeout: 15_000,
    });
    await expect(page.locator(".screen-rail")).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveCount(0);

    await pastTheSplash(page);
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });

  test("a guild link, even through a forced splash, is never offered it", async ({ page }) => {
    await pastTheSplash(page, "#guild=VW.gold.black.cross");
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});

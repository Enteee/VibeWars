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

  test("Learn, walk to the mark, look around, step in: then the menu, and no offer again", async ({
    page,
  }) => {
    await pastTheSplash(page);
    await page.getByRole("button", { name: "Learn to play" }).click();
    const frame = page.locator(".tutorial-frame");
    await expect(frame.locator(".tutorial-said")).toHaveText(
      "This war never ends. Walk with me; I have an idea.",
    );
    await expect(frame.locator(".tutorial-how")).toContainText("W");
    // Only the pair in the party window, and no scoreline (#3221).
    await expect(page.locator(".party-window .party-row")).toHaveCount(2);
    await expect(page.locator(".hud-scoreboard")).toBeHidden();
    await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
    const [x = 0, y = 0] = ((await frame.getAttribute("data-mark")) ?? "").split(",").map(Number);
    // The camera may still be easing in on a slow runner, which makes one
    // projection stale: project afresh and click again until the walk lands.
    await expect(async () => {
      const view = await projection(
        page.locator("#viewport"),
        page.locator("#viewport canvas:not(.compass)"),
      );
      const at = view.onPage({ x, y });
      await page.mouse.click(at.x, at.y);
      await expect(frame.locator(".tutorial-said")).toHaveText("Nice stride! You're a natural.", {
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });

    // Station 2 (#3222): one wheel notch out, then a right-drag north to the leash.
    await expect(frame.locator(".tutorial-said")).toHaveText(
      "Maybe this teleporter gets us around the battlefield. Look north!",
      { timeout: 10_000 },
    );
    await expect(frame).not.toHaveAttribute("data-mark", /.+/);
    const box = await page.locator("#viewport canvas:not(.compass)").boundingBox();
    if (box === null) {
      throw new Error("no canvas");
    }
    // The praise shows for 2.5 s only, which a slow runner's drag can outlast:
    // keep every line the guide says, and look for it among them.
    await frame.evaluate((element) => {
      new MutationObserver(() => {
        const text = element.querySelector(".tutorial-said")?.textContent ?? "";
        const said = element.getAttribute("data-said-log") ?? "";
        if (!said.endsWith(`|${text}`)) {
          element.setAttribute("data-said-log", `${said}|${text}`);
        }
      }).observe(element, { childList: true, characterData: true, subtree: true });
    });
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, 100);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(centre.x, box.y + 1, { steps: 10 });
    await expect(frame).toHaveAttribute(
      "data-said-log",
      /\|There it is! Our way around the fight\./,
    );
    await page.mouse.up({ button: "right" });

    // Station 3: the pad carries the mark. The view has glided back, so the
    // pad may be off the top: click toward it until it shows, then on it.
    await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/, { timeout: 10_000 });
    const [padX = 0, padY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
      .split(",")
      .map(Number);
    await expect(async () => {
      const view = await projection(
        page.locator("#viewport"),
        page.locator("#viewport canvas:not(.compass)"),
      );
      const at = view.onPage({ x: padX, y: padY });
      const inset = 40;
      await page.mouse.click(
        Math.min(box.x + box.width - inset, Math.max(box.x + inset, at.x)),
        Math.min(box.y + box.height - inset, Math.max(box.y + inset, at.y)),
      );
      await expect(frame.locator(".tutorial-said")).toHaveText("Together. Hold your breath.", {
        timeout: 5_000,
      });
    }).toPass({ timeout: 40_000 });
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

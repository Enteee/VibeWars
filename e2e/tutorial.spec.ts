import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";

/**
 * A map whose ground is layer 0, and one whose ground is layer 1 (#3248):
 * the tutorial walks on either.
 */
const FLAT_MAP = "jungle-ruins";
const RAISED_MAP = "arena-crossroads";
/** Where the pair arrives in the canyon (#3247), its first map's arrival pad. */
const CANYON_ARRIVAL = { x: 1000, y: 1800 };
/**
 * Beside the canyon's first rockfall, 200 south of its middle (#3247):
 * near enough for each of its strikes to count as a dodge, out of its reach.
 */
const DODGE_SPOT = { x: 1860, y: 1920 };
/** The furthest a click in the canyon sends the player, in world units: well inside the view. */
const STRIDE = 250;

/**
 * Through the splash to its end, where a first-timer is offered the
 * tutorial (#3218), with the menu fight, which the tutorial plays on,
 * pinned to `mapId`.
 */
async function pastTheSplash(page: Page, mapId: string, fragment = ""): Promise<void> {
  await page.goto(`./?splash&menu-background=${mapId}${fragment}`);
  const splash = page.locator(".splash");
  await expect(splash.locator(".splash-hint")).toBeVisible();
  // The fight is drawn before the offer reads its map.
  await expect(page.locator("#menu-background")).toHaveAttribute("data-map", mapId);
  await page.keyboard.press("Space");
  await expect(splash.locator(".splash-prompt")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(splash).toHaveCount(0);
}

test.describe("the first-time tutorial (#3218)", () => {
  test("Skip opens the menu, and it is not offered again", async ({ page }) => {
    await pastTheSplash(page, FLAT_MAP);
    const offer = page.locator(".tutorial-offer");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Skip" }).click();
    await expect(offer).toHaveCount(0);
    await expect(page.locator(".screen-rail")).toBeVisible();

    await pastTheSplash(page, FLAT_MAP);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });

  for (const mapId of [FLAT_MAP, RAISED_MAP]) {
    test(`Learn on ${mapId}, walk to the mark, look around, step in, dodge in the canyon: then the menu, and no offer again`, async ({
      page,
    }) => {
      // Four stations, each a walk or a drag in a sim that runs no faster than
      // the page draws: a loaded runner takes most of a minute (#3222), and
      // the canyon's three dodges at least 18 s more (#3247).
      test.setTimeout(180_000);
      await pastTheSplash(page, mapId);
      await page.getByRole("button", { name: "Learn to play" }).click();
      const frame = page.locator(".tutorial-frame");
      await expect(frame.locator(".tutorial-said")).toHaveText(
        "This war never ends. Walk with me; I have an idea.",
      );
      await expect(frame.locator(".tutorial-how")).toContainText("W");
      // The guide's praise shows for 2.5 s only, which a slow runner can
      // outlast: keep every line said on the body, which outlives the frame.
      await frame.evaluate((element) => {
        new MutationObserver(() => {
          const text = element.querySelector(".tutorial-said")?.textContent ?? "";
          const said = document.body.getAttribute("data-said-log") ?? "";
          if (!said.endsWith(`|${text}`)) {
            document.body.setAttribute("data-said-log", `${said}|${text}`);
          }
        }).observe(element, { childList: true, characterData: true, subtree: true });
      });
      const saidLog = page.locator("body");
      const hasSaid = async (line: string): Promise<boolean> =>
        ((await saidLog.getAttribute("data-said-log")) ?? "").split("|").includes(line);
      // Only the pair in the party window, and no scoreline (#3221).
      await expect(page.locator(".party-window .party-row")).toHaveCount(2);
      await expect(page.locator(".hud-scoreboard")).toBeHidden();
      // No empty target frame over the teleporter's pad (#3222).
      await expect(page.locator(".hud-target")).toBeHidden();
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [x = 0, y = 0] = ((await frame.getAttribute("data-mark")) ?? "").split(",").map(Number);
      // The camera may still be easing in on a slow runner, which makes one
      // projection stale: project afresh and click again until the walk lands.
      const stride = "Nice stride! You're a natural.";
      await expect(async () => {
        if (await hasSaid(stride)) {
          return;
        }
        const view = await projection(
          page.locator("#viewport"),
          page.locator("#viewport canvas:not(.compass)"),
        );
        const at = view.onPage({ x, y });
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => hasSaid(stride), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 30_000 });

      // Station 2 (#3222): one wheel notch out, then a right-drag north to the leash.
      await expect
        .poll(() => hasSaid("Maybe this teleporter gets us around the battlefield. Look north!"), {
          timeout: 10_000,
        })
        .toBe(true);
      await expect(frame).not.toHaveAttribute("data-mark", /.+/);
      const box = await page.locator("#viewport canvas:not(.compass)").boundingBox();
      if (box === null) {
        throw new Error("no canvas");
      }
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, 100);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(centre.x, box.y + 1, { steps: 10 });
      await expect.poll(() => hasSaid("There it is! Our way around the fight.")).toBe(true);
      await page.mouse.up({ button: "right" });

      // Station 3: the pad carries the mark. The view has glided back, so the
      // pad may be off the top: click toward it until it shows, then on it.
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/, { timeout: 10_000 });
      const [padX = 0, padY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      // Once on the pad the guide speaks and the view closes: a retry that
      // starts after that has nothing to project, so it asks the log first.
      const together = "Together. Hold your breath.";
      await expect(async () => {
        if (await hasSaid(together)) {
          return;
        }
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
        await expect.poll(() => hasSaid(together), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });

      // Station 4 (#3247): the canyon, the player on its arrival.
      await expect(frame).toHaveAttribute("data-world", "canyon", { timeout: 15_000 });
      const stage = page.locator("#viewport");
      await expect
        .poll(async () => {
          const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
            .split(",")
            .map(Number);
          return Math.hypot(cx - CANYON_ARRIVAL.x, cy - CANYON_ARRIVAL.y);
        })
        .toBeLessThan(150);
      await expect
        .poll(() => hasSaid("Rocks fall here. When a shadow grows, step aside!"), {
          timeout: 10_000,
        })
        .toBe(true);
      const walkTo = async (point: { x: number; y: number }): Promise<void> => {
        // A stride toward it at most, so the click stays clear of the HUD
        // at the screen's edges, whoever follows it up clicks again.
        const view = await projection(stage, page.locator("#viewport canvas:not(.compass)"));
        const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
          .split(",")
          .map(Number);
        const far = Math.hypot(point.x - cx, point.y - cy);
        const reach = Math.min(1, STRIDE / Math.max(far, 1));
        const at = view.onPage({ x: cx + (point.x - cx) * reach, y: cy + (point.y - cy) * reach });
        await page.mouse.click(at.x, at.y);
      };
      // Beside the first landing, until three of its strikes have missed.
      await expect(async () => {
        await walkTo(DODGE_SPOT);
        await expect(frame).toHaveAttribute("data-dodges", /^[3-9]$/, { timeout: 3_000 });
      }).toPass({ timeout: 90_000 });
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [goalX = 0, goalY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      const quick = "Quick feet! The rocks can't catch you.";
      await expect(async () => {
        if (await hasSaid(quick)) {
          return;
        }
        await walkTo({ x: goalX, y: goalY });
        await expect.poll(() => hasSaid(quick), { timeout: 3_000 }).toBe(true);
      }).toPass({ timeout: 90_000 });
      await expect(page.locator(".screen-rail")).toBeVisible({ timeout: 15_000 });
      await expect(frame).toHaveCount(0);

      await pastTheSplash(page, mapId);
      await expect(page.locator(".tutorial-offer")).toHaveCount(0);
    });
  }

  test("a guild link, even through a forced splash, is never offered it", async ({ page }) => {
    await pastTheSplash(page, FLAT_MAP, "#guild=VW.gold.black.cross");
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});

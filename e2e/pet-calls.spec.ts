import { expect, test, type Page } from "@playwright/test";

import { key } from "./keys.js";
import { startSoloMatch } from "./helpers/peers.js";
import { chooseProfession } from "./helpers/professions.js";

/**
 * Calls on your pet (#1108): Call of Haste goes on the wolf Charm Animal
 * brings, whatever you have selected, and starts recharging.
 */

/**
 * Right-click outward from the middle of the arena, where the camera
 * holds you, until the wolf at your heel is your target.
 */
async function selectWolf(page: Page): Promise<void> {
  const canvas = page.locator("#viewport canvas:not(.compass)");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("no arena");
  }
  const target = page.locator(".hud-target-text");
  for (let radius = 0; radius <= 60; radius += 6) {
    for (let degrees = 0; degrees < 360; degrees += 30) {
      const angle = (degrees * Math.PI) / 180;
      await page.mouse.click(
        box.x + box.width / 2 + radius * Math.cos(angle),
        box.y + box.height / 2 + radius * Math.sin(angle),
        { button: "right" },
      );
      const wolf = target.filter({ hasText: "Wolf" });
      if (
        await wolf.waitFor({ timeout: 200 }).then(
          () => true,
          () => false,
        )
      ) {
        return;
      }
    }
  }
  throw new Error("no wolf near you");
}

test("Call of Haste goes on your wolf and recharges (#1108)", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page.locator("input.editor-name").fill("Houndmaster");
  for (const name of ["Charm Animal", "Call of Haste"]) {
    await page.locator(".skill-box", { hasText: name }).locator(".skill-box-equip").click();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".roster").getByText("Houndmaster", { exact: true }).click();
  await startSoloMatch(page);

  const slot = page.locator(".hud-skill").nth(1);
  await expect(slot.locator(".recharge-overlay")).toHaveCount(0);
  await page.keyboard.press(key("skill-2"));
  await expect(slot.locator(".recharge-overlay")).toHaveCount(1);

  await selectWolf(page);
  const effects = page.getByRole("list", { name: "your target's effects" });
  await expect(effects.getByAltText("Call of Haste")).toBeVisible();
});

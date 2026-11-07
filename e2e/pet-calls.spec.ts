import { expect, test } from "@playwright/test";

import { key } from "./keys.js";
import { openLibraryGroup } from "./helpers/library.js";
import { openRail, pickCharacter } from "./helpers/menu.js";
import { startSoloMatch } from "./helpers/peers.js";
import { chooseProfession } from "./helpers/professions.js";

/**
 * Calls on your pet (#1108): Call of Haste goes on the wolf Charm Animal
 * brings, whatever you have selected, and starts recharging.
 */

test("Call of Haste goes on your wolf and recharges (#1108)", async ({ page }) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page.locator("input.editor-name").fill("Houndmaster");
  await openLibraryGroup(page, "Beast Mastery");
  for (const name of ["Charm Animal", "Call of Haste"]) {
    await page.locator(".skill-box", { hasText: name }).locator(".skill-box-equip").click();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Houndmaster");
  await startSoloMatch(page);

  const slot = page.locator(".hud-skill").nth(1);
  await expect(slot.locator(".recharge-overlay")).toHaveCount(0);
  await page.keyboard.press(key("skill-2"));
  await expect(slot.locator(".recharge-overlay")).toHaveCount(1);

  // Target the wolf from its party-window row, the only companion row:
  // no aiming at a moving pet on the canvas (#2719).
  await page.locator(".party-companion .party-row").click();
  await expect(page.locator(".hud-target-text")).toContainText("Wolf");
  const effects = page.getByRole("list", { name: "your target's effects" });
  await expect(effects.getByAltText("Call of Haste")).toBeVisible();
});

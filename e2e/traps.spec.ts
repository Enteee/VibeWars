import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";
import { key } from "./keys.js";
import { startSoloMatch } from "./helpers/peers.js";
import { chooseProfession } from "./helpers/professions.js";

/**
 * Traps (#1105): a trap you set is drawn for you, an outline at the
 * radius its spring hits, centred where you stood.
 */

/** A page screenshot `half` px each way round the world point `dx` right of where the camera looks. */
async function besideYou(page: Page, dx: number, half = 6): Promise<Buffer> {
  const canvas = page.locator("#viewport canvas:not(.compass)");
  const view = await projection(page.locator("#viewport"), canvas);
  const [cx = 0, cy = 0] = ((await page.locator("#viewport").getAttribute("data-camera")) ?? "")
    .split(",")
    .map(Number);
  const at = view.onPage({ x: cx + dx, y: cy });
  return page.screenshot({
    clip: { x: at.x - half, y: at.y - half, width: 2 * half, height: 2 * half },
  });
}

test("a trap you set is drawn round where you stood (#1105)", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page.locator("input.editor-name").fill("Trapper");
  await page.locator(".skill-box", { hasText: "Barbed Trap" }).locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".roster").getByText("Trapper", { exact: true }).click();
  await startSoloMatch(page);

  // Its rim, 81 out from you: open ground until the trap is set.
  const empty = await besideYou(page, 81);
  await page.keyboard.press(key("skill-1"));
  await expect
    .poll(async () => (await besideYou(page, 81)).equals(empty), { timeout: 10_000 })
    .toBe(false);
});

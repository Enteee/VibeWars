import { expect, test } from "@playwright/test";

import { key } from "./keys.js";
import { startSoloMatch } from "./helpers/peers.js";

/**
 * The effects monitor (#834): your statuses as icons under your bars,
 * each with a bar that drains, and a hover that says what it is.
 */

test("your enchantment shows as an icon, marked yours, its bar draining; the hover names it (#834)", async ({
  page,
}) => {
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" });
  await expect(effects.getByRole("listitem")).toHaveCount(0);

  // Slot 5 of the house bar puts Armor Boost on yourself (#302).
  await page.keyboard.press(key("skill-5"));
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveClass(/is-yours/);
  // No seconds on the icon (GW1): they are in the hover.
  await expect(icon).toHaveText("");

  const fill = icon.locator(".effect-bar-fill");
  const width = async (): Promise<number> => (await fill.boundingBox())?.width ?? -1;
  const first = await width();
  expect(first).toBeGreaterThan(0);
  await expect.poll(width).toBeLessThan(first);

  await icon.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Armor Boost");
  await expect(tip).toContainText("Enchantment");
  await expect(tip).toContainText("from you");
  await expect(tip).toContainText(/\d+ s left/);
});

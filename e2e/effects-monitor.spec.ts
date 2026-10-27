import { expect, test } from "@playwright/test";

import { key } from "./keys.js";
import { startSoloMatch } from "./helpers/peers.js";
import { chooseProfession } from "./helpers/professions.js";

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

test("a maintained enchantment has no bar, its hover says maintained, and it costs you an energy pip (#837)", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "monk");
  await page.locator("input.editor-name").fill("Mender");
  await page.locator(".skill-box", { hasText: "Mending" }).locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".roster").getByText("Mender", { exact: true }).click();
  await startSoloMatch(page);
  const energyPips = page.locator(".hud-bar-energy .vital-pips");
  await expect(energyPips).toHaveAttribute("data-pips", "4");

  // No target: Mending goes on yourself.
  await page.keyboard.press(key("skill-1"));
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Mending") });
  await expect(icon).toBeVisible();
  await expect(icon.locator(".effect-bar")).toBeHidden();
  await expect(energyPips).toHaveAttribute("data-pips", "3");

  await icon.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Mending");
  await expect(tip).toContainText("maintained");
  await expect(tip).not.toContainText(/s left/);
});

test("the target frame shows a foe's enchantment, at 16 px and not marked yours (#835)", async ({
  page,
}) => {
  // One context, so the two pages find each other (helpers/peers.ts).
  const foe = await page.context().newPage();
  await page.goto("./");
  await page.getByRole("button", { name: "host a lobby" }).click();
  const code = page.locator(".lobby-code");
  await expect(code).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  await foe.goto("./");
  await foe.locator("input.code-input").fill((await code.textContent())?.trim() ?? "");
  await foe.getByRole("button", { name: "Join", exact: true }).click();
  await foe.getByRole("button", { name: "join team 2" }).click();
  await foe.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  for (const each of [page, foe]) {
    await expect(each.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  }

  const effects = page.getByRole("list", { name: "your target's effects" });
  await expect(effects).toBeHidden();
  await page.keyboard.press(key("target-next"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  await expect(effects).toBeHidden();

  // The foe puts Armor Boost on itself, slot 5 of the house bar (#302).
  await foe.keyboard.press(key("skill-5"));
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  await expect(icon).toBeVisible();
  await expect(icon).not.toHaveClass(/is-yours/);
  expect((await icon.getByRole("img").boundingBox())?.width).toBe(16);
  await foe.close();
});

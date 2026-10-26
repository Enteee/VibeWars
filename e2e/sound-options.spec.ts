import { expect, test } from "@playwright/test";

import { startSoloMatch } from "./helpers/peers.js";

/**
 * Options → Sound (#424): one set of sound controls, shown in Options and
 * in the HUD's ♪ popover. What only a browser can tell is that a setting
 * survives a reload, and that both places show the same one.
 */

test("a sound effects volume of 0 set in Options is kept after a reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "options" }).click();
  // Sound is the first section, so Options opens on it.
  await expect(page.locator('.options-entry[data-section="sound"]')).toHaveClass(/is-selected/);
  const sfx = page.locator(".sound-sfx-volume input");
  await expect(sfx).toHaveValue("1");
  await sfx.fill("0");
  await expect(page.locator(".sound-sfx-volume .sound-volume-readout")).toHaveText("0 %");

  await page.reload();
  await page.getByRole("button", { name: "options" }).click();
  await expect(page.locator(".sound-sfx-volume input")).toHaveValue("0");
});

test("music muted in Options shows muted in the HUD popover, and mute all follows the HUD button", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "options" }).click();
  await page.getByLabel("Mute music").check();
  await page.getByRole("button", { name: "back", exact: true }).click();

  await startSoloMatch(page);
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  await page.locator(".hud-music").click();
  const popover = page.locator(".hud-jukebox");
  await expect(popover).toBeVisible();
  await expect(popover.getByLabel("Mute music")).toBeChecked();
  await expect(popover.getByLabel("Mute all")).not.toBeChecked();

  // The HUD's own mute button and the popover's Mute all are one setting.
  await page.locator(".hud-mute").click();
  await expect(page.locator(".hud-mute")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".hud-music").click();
  await expect(popover).toBeVisible();
  await expect(popover.getByLabel("Mute all")).toBeChecked();
  await popover.getByLabel("Mute all").uncheck();
  await expect(page.locator(".hud-mute")).toHaveAttribute("aria-pressed", "false");
});

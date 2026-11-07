import { expect, test, type Page } from "@playwright/test";

import { startSoloMatch } from "./helpers/peers.js";

/**
 * The sound controls (#424): one set, shown in the top bar's ♪ popover
 * and the HUD's (Options has none since #2722). What only a browser can
 * tell is that a setting survives a reload, and that both places show the
 * same one.
 */

/** The top bar's ♪ popover, open. */
async function openSound(page: Page): Promise<void> {
  await page.locator("#topbar .topbar-music").click();
  await expect(page.locator("#topbar .hud-jukebox")).toBeVisible();
}

test("a sound effects volume of 0 set in the top bar is kept after a reload", async ({ page }) => {
  await page.goto("./");
  await openSound(page);
  const sfx = page.locator(".sound-sfx-volume input");
  await expect(sfx).toHaveValue("1");
  await sfx.fill("0");
  await expect(page.locator(".sound-sfx-volume .sound-volume-readout")).toHaveText("0 %");

  await page.reload();
  await openSound(page);
  await expect(page.locator(".sound-sfx-volume input")).toHaveValue("0");
});

test("music muted in the top bar shows muted in the HUD popover, and mute all follows the HUD button", async ({
  page,
}) => {
  await page.goto("./");
  await openSound(page);
  await page.getByLabel("Mute music").check();
  await page.keyboard.press("Escape");
  await expect(page.locator("#topbar .hud-jukebox")).toBeHidden();

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

test("the top bar's mute and the HUD's are one setting (#454)", async ({ page }) => {
  await page.goto("./");
  const barMute = page.locator(".topbar-mute");
  await expect(barMute).toHaveAttribute("aria-pressed", "false");
  await barMute.click();
  await expect(barMute).toHaveAttribute("aria-pressed", "true");

  await startSoloMatch(page);
  await expect(page.locator("#topbar")).toBeHidden();
  const hudMute = page.locator(".hud-mute");
  await expect(hudMute).toHaveAttribute("aria-pressed", "true");
  await hudMute.click();
  await expect(hudMute).toHaveAttribute("aria-pressed", "false");
  await expect(barMute).toHaveAttribute("aria-pressed", "false");
});

test("Options has no Sound section: the ♪ popover holds the sound controls (#2722)", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".topbar-options").click();
  await expect(page.locator('.options-entry[data-section="player"]')).toBeVisible();
  await expect(page.locator('.options-entry[data-section="sound"]')).toHaveCount(0);
});

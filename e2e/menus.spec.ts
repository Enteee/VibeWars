import { expect, test, type Page } from "@playwright/test";

import { openPeers } from "./helpers/peers.js";

/**
 * The screen bar every menu screen shares (#578): Esc is its Back, and
 * with an inline confirmation open, Esc cancels that instead.
 */

const menuHeading = (page: Page) => page.getByRole("heading", { name: "VibeWars" });

async function openMenu(page: Page): Promise<void> {
  await page.goto("./");
  await expect(menuHeading(page)).toBeVisible();
}

test("#578: Esc goes back on the teams, team editor, options, music and lobby screens", async ({
  page,
}) => {
  await openMenu(page);

  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.getByRole("button", { name: "New team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit team" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page.getByRole("button", { name: "Options", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page.getByRole("button", { name: "Music", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page.getByRole("button", { name: "Host a lobby" }).click();
  await expect(page.locator(".screen-lobby .screen-bar .lobby-code")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();
  await expect(page.locator("#status")).toHaveText("ready");

  // The main menu has no way back: Esc leaves it where it is.
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();
});

test("#578: Esc with a confirmation open cancels it, and only then goes back", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: "New team", exact: true }).click();

  // Esc from the name field is Back too, which asks first: the name changed.
  const name = page.getByLabel("Team name");
  await name.fill("Duo");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await expect(discard).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit team" })).toBeVisible();
  await expect(name).toHaveValue("Duo");
  // Cancel hands the focus back to the bar's Back.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
});

test("#578: a host with others in the lobby is asked before Leave or Esc closes it", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await openMenu(host);
    await host.getByRole("button", { name: "Host a lobby" }).click();
    const code = (await host.locator(".lobby-code").textContent())?.trim() ?? "";
    await openMenu(guest);
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(host.locator(".lobby-spectators")).toContainText("player");

    const question = host.getByText("Close the lobby for everyone?");
    await host.keyboard.press("Escape");
    await expect(question).toBeVisible();
    // The lobby redraws on the guest's change; the question stays.
    await guest.getByRole("button", { name: "Join team 2" }).click();
    await expect(host.locator(".lobby-team").nth(1)).toContainText("player");
    await expect(question).toBeVisible();
    // Esc is "no", as on every screen.
    await host.keyboard.press("Escape");
    await expect(question).toHaveCount(0);
    await expect(host.locator(".screen-lobby")).toBeVisible();

    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await host.getByRole("button", { name: "Close lobby", exact: true }).click();
    await expect(menuHeading(host)).toBeVisible();
    await expect(menuHeading(guest)).toBeVisible();
  } finally {
    await context.close();
  }
});

import { expect, test, type Page } from "@playwright/test";

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

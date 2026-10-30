import { expect, type Page } from "@playwright/test";

/**
 * From Solo Play, play as `name` (#1513): typed in Options' Player
 * section, which is where the name lives, read at the next host, join or
 * queue. Waits for Solo Play to be drawn again as Options closes, so
 * nothing typed after lands on the screen that goes.
 */
export async function setPlayerName(page: Page, name: string): Promise<void> {
  const menu = await page.locator(".screen-menu").elementHandle();
  await page.locator(".topbar-options").click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".options-screen")).toHaveCount(0);
  await expect.poll(() => menu.evaluate((node) => node.isConnected)).toBe(false);
  await expect(page.locator(".screen-menu")).toBeVisible();
}

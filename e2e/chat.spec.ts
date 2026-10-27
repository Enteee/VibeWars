import { expect, test, type Page } from "@playwright/test";

import { openPeers, startSoloMatch } from "./helpers/peers.js";

/**
 * Chat (#479): Enter opens the box, Enter sends, and the lobby host
 * routes each line. Two pages of one context, over BroadcastChannel.
 */

async function openMenu(page: Page, playerName: string): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await page.locator(".screen-menu input.field-input").first().fill(playerName);
}

/** Press Enter where nothing has a use for it, type `text`, and send it. */
async function say(page: Page, text: string): Promise<void> {
  await page.locator("body").press("Enter");
  await expect(page.getByRole("textbox", { name: "chat message" })).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("all chat reaches both teams, team chat only its own, as text (#479)", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  await openMenu(host, "Ann");
  await host.getByRole("button", { name: "host a lobby" }).click();
  const code = (await host.locator(".lobby-code").textContent())?.trim() ?? "";
  await openMenu(guest, "Bob");
  await guest.locator("input.code-input").fill(code);
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: "join team 2" }).click();

  // In the lobby, all chat is the default.
  await say(host, "glhf <b>everyone</b>");
  const guestLog = guest.getByRole("log");
  await expect(guestLog).toContainText("Ann: glhf <b>everyone</b>");
  await expect(guestLog.locator("b")).toHaveCount(0);

  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await guest.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  await expect(guest.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");

  // In a match, team chat is the default; `!` says it to all.
  await say(host, "spike their monk");
  await say(host, "!gg");
  await expect(host.getByRole("log")).toContainText("[Team] Ann: spike their monk");
  await expect(guestLog).toContainText("[All] Ann: gg");
  await expect(guestLog).not.toContainText("spike their monk");
  await context.close();
});

test("keys typed into chat never cast or move (#479)", async ({ page }) => {
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator(".hud-statuses")).toContainText("no active effects");
  // A casts slot 5 of the house bar, a self-cast enchantment (#302).
  await say(page, "aaaa wasd");
  await expect(page.getByRole("log")).toContainText("aaaa wasd");
  await page.waitForTimeout(300);
  await expect(page.locator(".hud-statuses")).toContainText("no active effects");
});

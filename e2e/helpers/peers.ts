import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Pages that play with each other (#403).
 *
 * e2e plays over BroadcastChannel, which reaches only pages of one
 * `BrowserContext`: two contexts would never find each other, and the
 * test would fail as a lobby that never answers. Every multi-player test
 * opens its pages here, so none opens a second context by accident.
 */
export async function openPeers(
  browser: Browser,
  count: number,
): Promise<{ context: BrowserContext; pages: Page[] }> {
  const context = await browser.newContext();
  const pages: Page[] = [];
  for (let i = 0; i < count; i += 1) {
    pages.push(await context.newPage());
  }
  return { context, pages };
}

/** Host a lobby from the menu on show; its code, as the lobby screen shows it. */
async function hostLobby(page: Page): Promise<string> {
  await page.getByRole("button", { name: "host a lobby" }).click();
  const code = page.locator(".lobby-code");
  await expect(code).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  return (await code.textContent())?.trim() ?? "";
}

/**
 * A match in a lobby of one, which `canStart` allows: what Quick Match
 * was for the tests that need nobody else. Resolves once the HUD shows
 * the player, so the match is really on. Starts from the menu on show.
 */
export async function startSoloMatch(page: Page): Promise<void> {
  await hostLobby(page);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
}

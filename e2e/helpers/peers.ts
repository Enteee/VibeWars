import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { openRail } from "./menu.js";

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

/**
 * The lobby every page hosts from load (#1526), on Hosted Game (#1525);
 * its code, as the title bar shows it.
 */
export async function hostLobby(page: Page): Promise<string> {
  await openRail(page, "Hosted Game");
  const code = page.locator("#topbar .topbar-lobby-code");
  await expect(code).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  await expect(page.locator(".lobby-panel")).toBeVisible();
  return (await code.textContent())?.trim() ?? "";
}

/**
 * Save the active character as a Team Build of one, named after it, so a
 * side of one can propose it in the Team Lobby and play it (#1525): every
 * hosted lobby is a Team Lobby, and a spec plays the character it
 * brought. Ends on Team Builder; returns the Team Build's name.
 */
export async function saveSoloTeam(page: Page): Promise<string> {
  await openRail(page, "Random Arena");
  const picked = page.locator('.play-card-open[aria-pressed="true"] .play-card-name');
  const name = (await picked.textContent())?.trim() ?? "";
  expect(name, "a character is picked").not.toBe("");
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).click();
  await page.getByLabel("Team name").fill(`Solo ${name}`);
  await page.getByRole("button", { name: `add ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".screen-teams")).toBeVisible();
  return `Solo ${name}`;
}

/**
 * The Team Lobby (#1460) of sides of one: each page proposes its Team
 * Build, everyone is ready, then each takes its side's one seat and is
 * ready again. Resolves once each page's HUD shows the player.
 */
export async function playOwnTeams(
  players: readonly { readonly page: Page; readonly team: string }[],
): Promise<void> {
  for (const { page, team } of players) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    await page.locator(".team-lobby-propose select").selectOption({ label: team });
  }
  for (const { page } of players) {
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const { page } of players) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    await page.locator(".team-lobby-seat").first().click();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const { page } of players) {
    await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  }
}

/**
 * The Team Lobby (#1460) for a spec that needs a match and not a
 * particular character: nobody proposes, so each side plays the house
 * team. Everyone is ready, then each takes its side's seat `seats[i]`,
 * the first unless said, and is ready again. Resolves once each page's
 * HUD shows the player.
 */
export async function playHouseTeams(
  pages: readonly Page[],
  seats: readonly number[] = [],
): Promise<void> {
  for (const page of pages) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
  }
  for (const page of pages) {
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const [index, page] of pages.entries()) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    await page
      .locator(".team-lobby-seat")
      .nth(seats[index] ?? 0)
      .click();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const page of pages) {
    await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  }
}

/**
 * A match in a lobby of one, which `canStart` allows: what Quick Match
 * was for the tests that need nobody else. The player plays the active
 * character, through a Team Build of one (#1525). Resolves once the HUD
 * shows the player, so the match is really on. Starts from the menu.
 */
export async function startSoloMatch(page: Page): Promise<void> {
  const team = await saveSoloTeam(page);
  await hostLobby(page);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([{ page, team }]);
}

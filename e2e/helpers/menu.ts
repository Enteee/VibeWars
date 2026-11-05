import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The menu's mode rail (#1525): Random Arena, Team Arena, Heroes'
 * Ascent, GvG and Hosted Game, then Character Builder and Team Builder.
 */
export type RailLabel =
  | "Random Arena"
  | "Team Arena"
  | "Heroes' Ascent"
  | "GvG"
  | "Hosted Game"
  | "Character Builder"
  | "Team Builder";

/** Open `label`'s screen from the rail, as a player would. */
export async function openRail(page: Page, label: RailLabel): Promise<void> {
  const entry = page.locator(".mode-rail").getByRole("button", { name: label, exact: true });
  await entry.click();
  await expect(entry).toHaveAttribute("aria-pressed", "true");
}

/** The card of the character `name`, newest first should two share it. */
export function characterCard(page: Page, name: string): Locator {
  return page.locator(".character-card", { hasText: name }).first();
}

/** Play as `name`: its card picked on Random Arena, which shows after. */
export async function pickCharacter(page: Page, name: string): Promise<void> {
  await openRail(page, "Random Arena");
  const card = characterCard(page, name).locator(".play-card-open");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
}

/** An invite link (#2100): this page's origin and path, then `#lobby=` and a 43-character key. */
export const INVITE_URL = /^https?:\/\/[^#]+#lobby=[A-Za-z0-9_-]{43}$/;

/**
 * Open `invite`, a lobby's invite link (#2100), in `page`: on the
 * same page only its fragment changes, so the open tab joins from it.
 */
export async function joinByCode(page: Page, invite: string): Promise<void> {
  await page.goto(invite);
}

/**
 * Join `invite` and wait until the Lobby window offers a friend's lobby
 * Leave (#1526, #2385): the page's own lobby shows its panel too, so a
 * seen panel is no sign the join is in. The invite is out of the address
 * bar by then, and the window shut again.
 */
export async function joinFriend(page: Page, invite: string): Promise<void> {
  await joinByCode(page, invite);
  await expect((await lobbyWindow(page)).locator(".topbar-leave")).toBeVisible();
  await shutLobbyWindow(page);
  expect(new URL(page.url()).hash).toBe("");
}

/**
 * The top bar's Lobby window (#2385), opened if it is shut: the lobby's
 * controls, and who is in it with `page`. A press anywhere else shuts it
 * again, so open it right before each look. On a phone the Lobby button is
 * in the ⋯.
 */
export async function lobbyWindow(page: Page): Promise<Locator> {
  const lobby = page.locator("#topbar .topbar-lobby-button");
  if ((await lobby.getAttribute("aria-expanded")) !== "true") {
    const more = page.locator("#topbar .topbar-more");
    if (!(await lobby.isVisible()) && (await more.isVisible())) {
      await more.click();
    }
    await lobby.click();
  }
  const panel = page.locator("#topbar .lobby-window");
  await expect(panel).toBeVisible();
  return panel;
}

/** Shut the Lobby window (#2385) if it is open, so it covers nothing under it. */
export async function shutLobbyWindow(page: Page): Promise<void> {
  const panel = page.locator("#topbar .lobby-window");
  if (await panel.isVisible()) {
    await panel.press("Escape");
  }
  await expect(panel).toHaveCount(0);
}

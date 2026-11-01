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
 * Join `invite` and wait until the title bar names a friend's lobby
 * (#1526): the page's own lobby shows its panel too, so a seen panel is
 * no sign the join is in. The invite is out of the address bar by then.
 */
export async function joinFriend(page: Page, invite: string): Promise<void> {
  await joinByCode(page, invite);
  await expect(page.locator("#topbar .topbar-leave")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
}

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

/** The lobby code field and Join in the title bar (#1525). */
export async function joinByCode(page: Page, code: string): Promise<void> {
  await page.locator("input.code-input").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

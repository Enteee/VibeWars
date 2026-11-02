import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { INVITE_URL, openRail } from "./menu.js";

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
 * Open this page's own lobby to friends with its key (#1682): every
 * lobby starts closed, and a closed one takes nobody new. On a phone it
 * is in the ⋯, which the press puts away again.
 */
export async function openToFriends(page: Page): Promise<void> {
  const toggle = page.locator("#topbar .topbar-lobby-open");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const more = page.locator("#topbar .topbar-more");
  if (await more.isVisible()) {
    await more.click();
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

/**
 * The invite link to the lobby `page` is in (#2100), from Copy invite
 * link and the clipboard, granted, as a player would send it.
 */
export async function copyInvite(page: Page): Promise<string> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.locator("#topbar .lobby-copy");
  const more = page.locator("#topbar .topbar-more");
  if (!(await copy.isVisible()) && (await more.isVisible())) {
    await more.click();
  }
  await copy.click();
  await expect(page.locator(".toast")).toHaveText("Copied");
  const invite = await page.evaluate(() => navigator.clipboard.readText());
  expect(invite).toMatch(INVITE_URL);
  return invite;
}

/**
 * The sidebar's Team size, `size`: a Hosted Game host's plays that many a
 * side (#2104), and Team Builder lists and makes Team Builds of it (#2109).
 */
export async function setTeamSize(page: Page, size: 1 | 2 | 4 | 8): Promise<void> {
  const stepper = teamSizeStepper(page.locator(".mode-rail"));
  const shown = stepper.locator(".mode-rail-size-value");
  const label = `${String(size)}v${String(size)}`;
  // Step towards `size`, one size at a time, until it shows (#2141).
  for (let steps = 0; steps < 3; steps += 1) {
    const before = (await shown.textContent()) ?? "";
    if (before === label) {
      break;
    }
    const name = Number.parseInt(before, 10) > size ? "Smaller team" : "Larger team";
    await stepper.getByRole("button", { name }).click();
    await expect(shown).not.toHaveText(before);
  }
  await expect(shown).toHaveText(label);
}

/** The team size stepper (#2141) in `scope`: ‹ 4v4 ›. */
function teamSizeStepper(scope: Page | Locator): Locator {
  return scope.getByRole("group", { name: "Team size" });
}

/**
 * The Team size in `scope` shows `size`, and with `locked` cannot be
 * changed there, both arrows off: a party member's follows its leader
 * (#2107), a Team Build's editor shows the size it was made at (#2109).
 */
export async function expectTeamSize(
  scope: Page | Locator,
  size: 1 | 2 | 4 | 8,
  { locked = false }: { readonly locked?: boolean } = {},
): Promise<void> {
  const stepper = teamSizeStepper(scope);
  await expect(stepper.locator(".mode-rail-size-value")).toHaveText(
    `${String(size)}v${String(size)}`,
  );
  if (locked) {
    await expect(stepper.getByRole("button", { disabled: true })).toHaveCount(2);
  }
}

/** The Team size in `scope` is at `size`, and › goes no larger: 8v8 is no Random Arena (#2022). */
export async function expectTeamSizeAtMost(scope: Page | Locator, size: 1 | 2 | 4): Promise<void> {
  await expectTeamSize(scope, size);
  await expect(teamSizeStepper(scope).getByRole("button", { name: "Larger team" })).toBeDisabled();
}

/**
 * The lobby every page hosts from load (#1526), on Hosted Game (#1525),
 * opened to friends (#1682); its invite link (#2100). It plays `size`
 * a side on `map`, 1v1 on arena-alpha unless said: the sidebar's
 * stored size (#2104) is 4v4, which most specs do not want.
 */
export async function hostLobby(
  page: Page,
  { size = 1, map = "arena-alpha" }: { readonly size?: 1 | 2 | 4 | 8; readonly map?: string } = {},
): Promise<string> {
  await openRail(page, "Hosted Game");
  await expect(page.locator(".lobby-panel")).toBeVisible();
  await expect(page.locator("#topbar .topbar-lobby:not([hidden])")).toBeAttached();
  await setTeamSize(page, size);
  // A size keeps a map that suits it: pick the map after the size.
  const maps = page.locator(".lobby-map select");
  await maps.selectOption(map);
  await expect(maps).toHaveValue(map);
  await openToFriends(page);
  return copyInvite(page);
}

/**
 * Save `size` copies of the active character as a Team Build, named
 * after it, so a side can propose it in the Team Lobby and play it
 * (#1525): every hosted lobby is a Team Lobby, and a spec plays the
 * character it brought. `size` copies make a side of that many with no
 * bot (#2029), in a lobby of that team size (#2104): a Team Build of that
 * size (#2109), picked in the sidebar first. A 1v1 needs none: it plays
 * the active character (#2141). Ends on Team Builder; returns the Team
 * Build's name.
 */
export async function saveSoloTeam(page: Page, size: 2 | 4 | 8): Promise<string> {
  await openRail(page, "Random Arena");
  const picked = page.locator('.play-card-open[aria-pressed="true"] .play-card-name');
  const name = (await picked.textContent())?.trim() ?? "";
  expect(name, "a character is picked").not.toBe("");
  await openRail(page, "Team Builder");
  await setTeamSize(page, size);
  await page.getByRole("button", { name: "New team build", exact: true }).click();
  const teamName = `${String(size)} × ${name}`;
  await page.getByLabel("team name").fill(teamName);
  // A Team Build is its size in blank members (#2225): the character is
  // dragged onto each.
  await page.getByRole("tab", { name: "My characters", exact: true }).click();
  const pick = page.locator(".team-pick").filter({
    has: page.locator(".team-pick-name").getByText(name, { exact: true }),
  });
  const names = page.locator(".team-grid .team-row-name");
  for (let copy = 0; copy < size; copy += 1) {
    await pick.dragTo(page.locator(".team-grid .team-row").nth(copy));
    await expect(names.nth(copy)).toHaveText(name);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(page.locator(".screen-teams")).toBeVisible();
  return teamName;
}

/**
 * Propose `team` in the Team Lobby's vote, as a player does (#2116):
 * open Your Team Builds, expand its row, press Propose this build. A
 * page that brought its starter twice has two Team Builds of that name,
 * which propose the same: the first is as good as any. Resolves once
 * the proposal is the side's.
 */
export async function proposeTeam(page: Page, team: string): Promise<void> {
  const proposals = page.locator(".team-lobby-proposals .play-card");
  const before = await proposals.count();
  await page.getByRole("button", { name: "Your Team Builds", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "Your Team Builds" });
  await drawer.getByRole("button", { name: team, exact: true }).first().click();
  await drawer.getByRole("button", { name: "Propose this build", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(proposals).not.toHaveCount(before);
}

/**
 * The Team Lobby (#1460) of each page's own build: each page proposes its
 * Team Build `team`, or in a 1v1, with no `team`, sees its active
 * character proposed for it (#2141). Everyone is ready, then each takes
 * its side's seat `seat`, the first unless said, and is ready again.
 * Resolves once each page's HUD shows the player.
 */
export async function playOwnTeams(
  players: readonly {
    readonly page: Page;
    readonly team?: string | undefined;
    readonly seat?: number;
  }[],
): Promise<void> {
  for (const { page, team } of players) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    if (team === undefined) {
      await expect(page.locator(".team-lobby-proposals .play-card")).toHaveCount(1);
    } else {
      await proposeTeam(page, team);
    }
  }
  for (const { page } of players) {
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const { page, seat } of players) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    await page
      .locator(".team-lobby-seat")
      .nth(seat ?? 0)
      .click();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const { page } of players) {
    await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  }
}

/**
 * The Team Lobby (#1460) for a spec that needs a match and not a
 * particular character: nobody proposes, so each side plays a random
 * preset team. Everyone is ready, then each takes its side's seat `seats[i]`,
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
 * was for the tests that need nobody else, but for the one bot of the
 * preset team its empty side plays (#2029). The player plays the active
 * character, as a 1v1 does (#2141). Resolves once the HUD shows the
 * player, so the match is really on. Starts from the menu.
 */
export async function startSoloMatch(page: Page): Promise<void> {
  await hostLobby(page);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([{ page }]);
}

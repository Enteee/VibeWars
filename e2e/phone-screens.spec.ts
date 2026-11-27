import { expect, test, type Locator, type Page } from "@playwright/test";

import { joinFriend, openRail, showRail, type RailLabel } from "./helpers/menu.js";
import { clickTopbarIcon, optionsEntry } from "./helpers/overlay.js";
import { copyInvite, hostLobby, openPeers, openToFriends, setTeamSize } from "./helpers/peers.js";
import {
  PIXEL_8A_LANDSCAPE,
  PIXEL_8A_PORTRAIT,
  TOUCH_TARGET,
  expectFitsPhone,
} from "./helpers/phone.js";
import { namePlayer } from "./helpers/player.js";
import { chooseProfession } from "./helpers/professions.js";
import { bringStarter } from "./helpers/starter.js";

/**
 * Every screen outside a match and the editors fits a Pixel 8a, upright
 * and on its side (#3776): no sideways scroll, a finger-sized hit box on
 * every control, no text under 12 px, and on its side a one-row top bar.
 * One test a screen, so a failure names it.
 */

test.use(PIXEL_8A_PORTRAIT);

/** The menu on the phone, which opens straight to it (#3782). */
async function openPhone(page: Page, url = "./"): Promise<void> {
  await page.goto(url);
  await expect(page.locator(".rail-title")).toBeVisible();
}

/** Back from a drilled-in flyout page to its list (#4216). */
async function backToList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back to the list", exact: true }).click();
}

/**
 * Until a drilled-in page has stopped sliding in (#4216): mid-slide, a
 * 44 px box is mapped through its transform and reads 43.99.
 */
async function drilledIn(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(".flyout-rail-main")
        .evaluateAll((mains) => mains.some((main) => main.getAnimations().length > 0)),
    )
    .toBe(false);
}

/** `locator`'s box is a finger's at least (#3776). */
async function expectFingerSized(locator: Locator, what: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0, `${what} wide`).toBeGreaterThanOrEqual(TOUCH_TARGET);
  expect(box?.height ?? 0, `${what} tall`).toBeGreaterThanOrEqual(TOUCH_TARGET);
}

test("upright, the rail is a drawer behind a finger-wide toggle (#3924)", async ({ page }) => {
  await openPhone(page);
  const toggle = page.locator(".rail-drawer-toggle");
  const rail = page.locator(".mode-rail");
  const scrim = page.locator(".rail-drawer-scrim");
  await expect(rail).toBeHidden();
  await expectFingerSized(toggle, "toggle");

  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rail).toBeVisible();
  await expect(rail.locator('[aria-pressed="true"]')).toBeFocused();
  for (const entry of await rail.locator(".mode-rail-entry").all()) {
    await expectFingerSized(entry, (await entry.getAttribute("aria-label")) ?? "entry");
  }
  // A tap on the dim puts it away, and the focus goes back to the toggle.
  await scrim.tap();
  await expect(rail).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  // An entry switches the screen and puts the drawer away.
  await toggle.tap();
  await rail.getByRole("button", { name: "Team Builder", exact: true }).tap();
  await expect(page.locator(".rail-title")).toHaveText("Team Builder");
  await expect(rail).toBeHidden();

  // The size stepper does not: you step sizes and look.
  await toggle.tap();
  const shown = rail.locator(".mode-rail-size-value");
  const before = (await shown.textContent()) ?? "";
  await rail.getByRole("button", { name: "Smaller team" }).tap();
  await expect(shown).not.toHaveText(before);
  await expect(rail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rail).toBeHidden();
  await expectFitsPhone(page, "menu, drawer put away");
});

test.describe("on its side", () => {
  test.use(PIXEL_8A_LANDSCAPE);

  test("the rail stays a rail, with no drawer toggle (#3924)", async ({ page }) => {
    await openPhone(page);
    await expect(page.locator(".mode-rail")).toBeVisible();
    await expect(page.locator(".rail-drawer-toggle")).toBeHidden();
  });
});

test("a phone opens straight to the menu, with no keyboard-and-mouse notice (#3782)", async ({
  page,
}) => {
  await openPhone(page);
  await expect(page.getByText("VibeWars needs a keyboard and mouse.")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("the splash screen fits the phone (#3776)", async ({ page }) => {
  await page.goto("./?splash&menu-background");
  await expect(page.locator(".splash")).toBeVisible();
  await expectFitsPhone(page, "splash");
});

for (const label of [
  "Random Arena",
  "Team Arena",
  "Heroes' Ascent",
  "GvG",
  "Hosted Game",
  "Character Builder",
  "Team Builder",
  "Matches",
] as const satisfies readonly RailLabel[]) {
  test(`the menu's ${label} fits the phone (#3776)`, async ({ page }) => {
    await openPhone(page);
    await openRail(page, label);
    await expectFitsPhone(page, label);
  });
}

test("Options, every section, fits the phone, drilled into from a list of 44 px entries (#3776, #4216)", async ({
  page,
}) => {
  await openPhone(page);
  await clickTopbarIcon(page, ".topbar-options");
  const entries = page.locator(".flyout-rail-entry");
  await expect(optionsEntry(page, "player")).toBeFocused();
  await expectFitsPhone(page, "Options: the list");
  for (let i = 0; i < (await entries.count()); i += 1) {
    const title = (await entries.nth(i).textContent()) ?? "";
    await entries.nth(i).click();
    await expect(page.locator(".flyout-rail-title")).toHaveText(title);
    await drilledIn(page);
    await expectFitsPhone(page, `Options: ${title}`);
    await backToList(page);
    await expect(entries.nth(i)).toBeFocused();
  }
});

test("Options > Controls fits a 360 px phone: every key row stacks (#4238)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openPhone(page);
  await clickTopbarIcon(page, ".topbar-options");
  await optionsEntry(page, "controls").click();
  await drilledIn(page);
  await expect(page.locator(".keys-table")).toBeVisible();
  await expectFitsPhone(page, "Options: Controls, 360 px");
});

test("Help, every page, fits the phone (#3776)", async ({ page }) => {
  await openPhone(page);
  await clickTopbarIcon(page, ".topbar-help");
  const entries = page.locator(".flyout-rail-entry");
  await expect(entries).toHaveCount(14);
  await expectFitsPhone(page, "Help: the list");
  for (let i = 0; i < 14; i += 1) {
    await entries.nth(i).click();
    await drilledIn(page);
    await expectFitsPhone(page, `Help: ${(await entries.nth(i).getAttribute("data-id")) ?? ""}`);
    await backToList(page);
  }
});

test("a hosted lobby fits the phone, for its host and its guest (#3776)", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  await openPhone(host);
  await namePlayer(host, "Host");
  const invite = await hostLobby(host);
  await expectFitsPhone(host, "lobby, host");
  await guest.goto("./");
  await expect(guest.locator(".rail-drawer-toggle")).toBeVisible();
  await namePlayer(guest, "Guest");
  await joinFriend(guest, invite);
  await expect(guest.locator(".lobby-panel")).toBeVisible();
  await expectFitsPhone(guest, "lobby, guest");
  await context.close();
});

/**
 * Tap on `page` brought to the front: two pages share one window, and the
 * one behind gets no animation frames, so nothing on it settles.
 */
async function press(page: Page, target: Locator): Promise<void> {
  await page.bringToFront();
  await target.click();
}

/**
 * A party's Team Lobby, both its stages, for its leader and its member,
 * then its Team Arena queue window. The Vault (#2701) is a party's window
 * at Heroes' Ascent's last round, the same title, wait and detail rows: a run
 * won to the Hall is out of an e2e's reach.
 */
test("a party's Team Lobby and its Team Arena queue fit the phone (#3776)", async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, pages } = await openPeers(browser, 2);
  const [leader, member] = pages as [Page, Page];
  await openPhone(leader);
  await namePlayer(leader, "Leader");
  await openRail(leader, "Team Arena");
  await openToFriends(leader);
  const invite = await copyInvite(leader);
  await member.goto("./");
  await expect(member.locator(".rail-drawer-toggle")).toBeVisible();
  await namePlayer(member, "Member");
  await joinFriend(member, invite);
  await expect(member.locator(".lobby-panel")).toContainText("Leader");
  // The ranking rules are Help's Ranking page (#3787), not a note here.
  await expect(leader.locator(".lobby-panel")).not.toContainText(/ranked/i);

  await press(leader, leader.getByRole("button", { name: "Find a match" }));
  for (const page of [leader, member]) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    await page.bringToFront();
    await expectFitsPhone(page, "Team Lobby, vote");
  }
  await press(leader, leader.getByRole("button", { name: "Your Team Builds", exact: true }));
  await expect(leader.getByRole("complementary", { name: "Your Team Builds" })).toBeVisible();
  await expectFitsPhone(leader, "Team Lobby, Your Team Builds");

  // Nobody votes: the stage runs out, as a party with no build of its own does.
  for (const page of [leader, member]) {
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character", {
      timeout: 40_000,
    });
    await page.bringToFront();
    await expectFitsPhone(page, "Team Lobby, seats");
  }
  await press(leader, leader.locator(".team-lobby-seat").nth(0));
  await press(member, member.locator(".team-lobby-seat").nth(1));

  await press(leader, leader.locator("#topbar .topbar-queue"));
  await expect(leader.locator("#topbar .queue-window")).toContainText("Team Arena");
  await expectFitsPhone(leader, "Team Arena queue");
  await context.close();
});

test("the queue's window fits the phone (#3776)", async ({ page }) => {
  await page.goto("./");
  await bringStarter(page, "Elementalist/Mesmer");
  await namePlayer(page, "Queuer");
  await openRail(page, "Random Arena");
  await setTeamSize(page, 1);
  await page.locator("#topbar .lobby-find").click();
  await page.locator("#topbar .topbar-queue").click();
  await expect(page.locator("#topbar .queue-window")).toBeVisible();
  await expectFitsPhone(page, "queue");
});

test("the menu and Options fit the phone in German, the menu in Arabic (#3776)", async ({
  browser,
}) => {
  for (const locale of ["de", "ar"]) {
    const context = await browser.newContext({ ...PIXEL_8A_PORTRAIT, locale });
    const page = await context.newPage();
    await openPhone(page);
    await expectFitsPhone(page, `menu, ${locale}`);
    if (locale === "de") {
      await clickTopbarIcon(page, ".topbar-options");
      await expectFitsPhone(page, `Options, ${locale}`);
    }
    await context.close();
  }
});

/**
 * A phone's top bar (#3933): its first row, and the status's row under it
 * where a screen has one; never a third. 44 px buttons, two rows and the
 * bar's padding come to under this.
 */
const TWO_ROW_TOPBAR = 110;

/** The top bar is at most two rows, and in an editor the ☰ is on the name's. */
async function expectTwoRowTopbar(page: Page, what: string, editor: boolean): Promise<void> {
  const bar = await page.locator("#topbar").boundingBox();
  expect(bar?.height ?? Infinity, what).toBeLessThanOrEqual(TWO_ROW_TOPBAR);
  if (editor) {
    const name = await page.locator("#topbar .editor-name").boundingBox();
    const more = await page.locator("#topbar .topbar-more").boundingBox();
    expect(more?.y, `${what}: ☰ on the name's row`).toBe(name?.y);
  }
}

/** The rail entry `entry` in any language, the drawer opened first: `openRail` goes by the English name. */
async function openEntry(page: Page, entry: string): Promise<void> {
  await showRail(page);
  const choice = page.locator(`.mode-rail [data-entry="${entry}"]`);
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
}

for (const viewport of [PIXEL_8A_PORTRAIT.viewport, { width: 360, height: 800 }]) {
  for (const locale of ["en", "de"]) {
    const size = `${String(viewport.width)}x${String(viewport.height)}, ${locale}`;
    test(`the editors' top bar keeps to two rows at ${size} (#3933)`, async ({ browser }) => {
      const context = await browser.newContext({ ...PIXEL_8A_PORTRAIT, viewport, locale });
      const page = await context.newPage();
      await openPhone(page);
      await openEntry(page, "characters");
      await page.locator(".play-card-new").click();
      await chooseProfession(page, "primary", "elementalist");
      // A long name scrolls in its field; the bar does not grow for it.
      await page.locator("input.editor-name").fill("Ailsa the Unbroken Stormcaller of Ascalon");
      await expectTwoRowTopbar(page, `Character Builder, ${size}`, true);
      await openPhone(page);
      await openEntry(page, "teams");
      await page.locator(".play-card-new").click();
      await expect(page.locator(".team-editor")).toBeVisible();
      await expectTwoRowTopbar(page, `Team Builder, ${size}`, true);
      await openPhone(page);
      await openEntry(page, "team-arena");
      await expectTwoRowTopbar(page, `Team Arena, ${size}`, false);
      await context.close();
    });
  }
}

import { expect, test, type Page } from "@playwright/test";

import { joinFriend, openRail, type RailLabel } from "./helpers/menu.js";
import { clickTopbarIcon } from "./helpers/overlay.js";
import { openPeers, hostLobby, setTeamSize } from "./helpers/peers.js";
import { PIXEL_8A_PORTRAIT, expectFitsPhone, passTouchNotice } from "./helpers/phone.js";
import { namePlayer } from "./helpers/player.js";
import { bringStarter } from "./helpers/starter.js";

/**
 * Every screen outside a match and the editors fits a Pixel 8a, upright
 * and on its side (#3776): no sideways scroll, a finger-sized hit box on
 * every control, no text under 12 px, and on its side a one-row top bar.
 * One test a screen, so a failure names it.
 */

test.use(PIXEL_8A_PORTRAIT);

/** The menu on the phone, past the touch notice. */
async function openPhone(page: Page, url = "./"): Promise<void> {
  await page.goto(url);
  await passTouchNotice(page);
  await expect(page.locator(".mode-rail")).toBeVisible();
}

test("the splash screen fits the phone (#3776)", async ({ page }) => {
  await page.goto("./?splash&menu-background");
  await passTouchNotice(page);
  await expect(page.locator(".splash")).toBeVisible();
  await expectFitsPhone(page, "splash");
});

for (const label of [
  "Random Arena",
  "Team Arena",
  "Heroes' Ascent",
  "GvG",
  "Matches",
] as const satisfies readonly RailLabel[]) {
  test(`the menu's ${label} fits the phone (#3776)`, async ({ page }) => {
    await openPhone(page);
    await openRail(page, label);
    await expectFitsPhone(page, label);
  });
}

test("Options, every section, fits the phone (#3776)", async ({ page }) => {
  await openPhone(page);
  await clickTopbarIcon(page, ".topbar-options");
  const entries = page.locator(".options-entry");
  for (let i = 0; i < (await entries.count()); i += 1) {
    await entries.nth(i).click();
    await expectFitsPhone(page, `Options: ${(await entries.nth(i).textContent()) ?? ""}`);
  }
});

test("Help, every page, fits the phone (#3776)", async ({ page }) => {
  await openPhone(page);
  await clickTopbarIcon(page, ".topbar-help");
  const picker = page.locator(".help-picker");
  for (const value of await picker
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))) {
    await picker.selectOption(value);
    await expectFitsPhone(page, `Help: ${value}`);
  }
});

test("a hosted lobby fits the phone, for its host and its guest (#3776)", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  await openPhone(host);
  await namePlayer(host, "Host");
  const invite = await hostLobby(host);
  await expectFitsPhone(host, "lobby, host");
  // The host passed the touch notice for this device, whose storage they share.
  await guest.goto("./");
  await expect(guest.locator(".mode-rail")).toBeVisible();
  await namePlayer(guest, "Guest");
  await joinFriend(guest, invite);
  await expect(guest.locator(".lobby-panel")).toBeVisible();
  await expectFitsPhone(guest, "lobby, guest");
  await context.close();
});

test("the queue's window fits the phone (#3776)", async ({ page }) => {
  await page.goto("./");
  await passTouchNotice(page);
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

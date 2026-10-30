import { expect, test, type Page } from "@playwright/test";

import { joinByCode, openRail } from "./helpers/menu.js";
import { hostLobby, openPeers } from "./helpers/peers.js";

/**
 * The screen bar every menu screen shares (#578), in the top bar (#1272):
 * Esc is its Back, and with an inline confirmation open, Esc cancels that
 * instead.
 */

const menuHeading = (page: Page) => page.getByRole("heading", { name: "VibeWars" });

async function openMenu(page: Page): Promise<void> {
  await page.goto("./");
  await expect(menuHeading(page)).toBeVisible();
}

test("#578: Esc goes back on the team editor, options and lobby screens", async ({ page }) => {
  await openMenu(page);

  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();
  // Team Builder has no way back either.
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();
  await openRail(page, "Random Arena");
  await expect(page.locator(".character-card")).toBeVisible();

  await page.locator(".topbar-options").click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  // The lobby is the page's own (#1526): Esc leaves it where it is.
  await hostLobby(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-hosted-game .lobby-panel")).toBeVisible();
  await expect(page.locator("#status")).toBeHidden();

  // The main menu has no way back: Esc leaves it where it is.
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();
});

test("#578: Esc with a confirmation open cancels it, and only then goes back", async ({ page }) => {
  await openMenu(page);
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).click();

  // Esc from the name field is Back too, which asks first: the name changed.
  const name = page.getByLabel("Team name");
  await name.fill("Duo");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await expect(discard).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Duo");
  // Cancel hands the focus back to the bar's Back.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(page.locator(".screen-teams")).toBeVisible();
});

test("#1272: the editor's Discard question takes the status's room: the bar stays one row, Save in it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Rurik");
  const bar = page.locator("#topbar");
  const status = bar.locator(".topbar-status");
  await expect(status).toBeVisible();
  const height = (await bar.boundingBox())?.height;

  await page.keyboard.press("Escape");
  await expect(bar.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await expect(status).toBeHidden();
  await expect(bar.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  expect((await bar.boundingBox())?.height).toBe(height);

  await bar.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(status).toBeVisible();
});

test("#1526: a guest joins from the title bar, follows the host's mode, and leaves to a lobby of its own", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await openMenu(host);
    await openMenu(guest);
    const code = host.locator("#topbar .topbar-lobby-code");
    await expect(code).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    const hostCode = (await code.textContent()) ?? "";
    const guestCode = guest.locator("#topbar .topbar-lobby-code");
    await expect(guestCode).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    const ownCode = (await guestCode.textContent()) ?? "";
    // Alone, the party strip says how to change that.
    await expect(host.locator(".party-strip")).toContainText("Share your code to play together");

    await joinByCode(guest, hostCode);
    await expect(guestCode).toHaveText(hostCode);
    const leave = guest.locator("#topbar").getByRole("button", { name: "Leave", exact: true });
    await expect(leave).toBeVisible();
    await expect(host.locator(".party-strip .party-member")).toHaveCount(2);
    // A party queues in card 4: alone only.
    await expect(guest.locator(".random-arena-tile").first()).toBeDisabled();

    // The host picks the mode; the guest's rail and screen follow, its modes locked.
    await openRail(host, "GvG");
    await expect(guest.locator(".screen-gvg .lobby-panel")).toBeVisible();
    const hosted = guest.locator(".mode-rail-entry[aria-label='Hosted Game']");
    await expect(hosted).toHaveAttribute("aria-disabled", "true");
    await expect(hosted).toHaveAttribute("title", "The host picks the mode");
    // The builders are everyone's, and opening one leaves no lobby.
    await openRail(guest, "Team Builder");
    await expect(guestCode).toHaveText(hostCode);

    await leave.click();
    await expect(guestCode).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    await expect(guestCode).not.toHaveText(hostCode);
    await expect(guestCode).not.toHaveText(ownCode);
    await expect(leave).toBeHidden();
    await expect(host.locator(".party-strip .party-member")).toHaveCount(1);
  } finally {
    await context.close();
  }
});

/** A rolled character's random name (#1149): "Kaelen Ashvale". */
const ROLLED_NAME = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

test("#853: the first start rolls a starter character, chosen; Reroll replaces it in place, Clone rolls a new one", async ({
  page,
}) => {
  await openMenu(page);
  // Chosen on Random Arena, where the menu opens on a first start (#1525).
  await expect(page.locator(".mode-rail-entry[aria-pressed=true]")).toHaveAttribute(
    "aria-label",
    "Random Arena",
  );
  const card = page.locator(".character-card");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveClass(/is-selected/);
  await expect(page.locator(".random-arena-tile").first()).toBeEnabled();
  const name = card.locator(".play-card-name");
  await expect(name).toHaveText(ROLLED_NAME);
  const first = await name.innerText();
  // Drawn as a match draws it (#1250): the figure, not a lettered dot.
  const figure = card.locator("canvas.character-figure");
  await expect(figure).toBeVisible();
  await expect(card.locator(".character-dot")).toHaveCount(0);
  // With its primary profession's glyph inside the disc, as in a match (#1037).
  await expect(figure).toHaveAttribute("data-glyph", /^[a-z]+$/);

  // Rolled once: a reload keeps it, and rolls nothing new.
  await page.reload();
  await expect(card).toHaveCount(1);
  await expect(name).toHaveText(first);

  // Rerolled at once, unasked (#1146), on Character Builder: another
  // starter build under another random name (#1149), the same card.
  await openRail(page, "Character Builder");
  const actions = card.locator(".play-card-actions");
  await actions.getByRole("button", { name: "Reroll", exact: true }).click();
  await expect(name).not.toHaveText(first);
  await expect(name).toHaveText(ROLLED_NAME);
  await expect(card).toHaveCount(1);

  // It has Clone, not Edit (#1147): Clone opens the editor on a fresh
  // roll under another random name (#1457), one even for a double-click.
  const rolled = await name.innerText();
  await expect(actions.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await actions.getByRole("button", { name: "Clone", exact: true }).dblclick();
  await expect(page.locator("input.editor-name")).toHaveValue(ROLLED_NAME);
  await expect(page.locator("input.editor-name")).not.toHaveValue(rolled);
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The copy is an ordinary character: Edit, no Clone or Reroll.
  await expect(card).toHaveCount(2);
  const pyro = page.locator(".character-card", { hasText: "Pyro" });
  const original = page.locator(".character-card", { hasText: rolled });
  await expect(pyro.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(pyro.locator(".roster-clone, .roster-reroll")).toHaveCount(0);
  await expect(original.locator(".roster-reroll")).toHaveCount(1);
  // The rerolled one is still chosen.
  await openRail(page, "Random Arena");
  await expect(original).toHaveClass(/is-selected/);
});

test("#1290: a fresh character, empty bar and all, holds its weapon on the menu", async ({
  page,
}) => {
  await openMenu(page);
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Blank");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const blank = page.locator(".character-card", { hasText: "Blank" });
  await expect(blank).not.toHaveClass(/is-invalid/);
  await expect(blank.locator("canvas.character-figure")).toHaveAttribute("data-weapon-id", "sword");
});

test("#579: Random Arena's cards are buttons: Enter or Space chooses; Edit is on Character Builder", async ({
  page,
}) => {
  await openMenu(page);
  // The first start's rolled character (#853), chosen.
  const cards = page.locator(".character-card");
  await expect(cards).toHaveCount(1);
  const rolled = cards.first();
  await expect(rolled).toHaveClass(/is-selected/);
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await openRail(page, "Random Arena");
  const pyro = page.locator(".character-card", { hasText: "Pyro" });
  await expect(pyro.locator(".mini-skill")).toHaveCount(8);
  const choosePyro = pyro.locator(".play-card-open");
  await choosePyro.focus();
  await page.keyboard.press("Enter");
  await expect(pyro).toHaveClass(/is-selected/);
  await expect(choosePyro).toBeFocused();

  const starter = cards.filter({ hasNotText: "Pyro" });
  await starter.locator(".play-card-open").focus();
  await page.keyboard.press(" ");
  await expect(starter).toHaveClass(/is-selected/);
  await expect(pyro).not.toHaveClass(/is-selected/);
  // Random Arena only chooses: nothing to edit there.
  await expect(pyro.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  // Record is Random Arena's own button in the top bar; Options is its ⚙ (#1272), Music its ♪ (#1453).
  const own = page.locator("#topbar .topbar-screen-actions").getByRole("button");
  await expect(own).toHaveText(["Record"]);
  await expect(page.locator("#topbar .topbar-options")).toBeVisible();
  await expect(page.locator("#topbar .topbar-music")).toBeVisible();

  // Edit opens the editor and chooses nobody.
  await openRail(page, "Character Builder");
  await pyro.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Pyro");
  await page.keyboard.press("Escape");
  await openRail(page, "Random Arena");
  await expect(starter).toHaveClass(/is-selected/);
});

test("#1272: on a phone, the menu's ⋯ holds Record and the chevron is Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openMenu(page);
  const more = page.locator("#topbar .topbar-more");
  const record = page
    .locator("#topbar .topbar-screen-actions")
    .getByRole("button", { name: "Record", exact: true });

  // Folded away until ⋯ opens; the global icons with them.
  await expect(record).toBeHidden();
  await expect(page.locator("#topbar .topbar-options")).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#topbar .topbar-options")).toBeVisible();
  await record.click();
  await expect(page.getByRole("heading", { name: "Record" })).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");

  // Only the place shows, not the crumbs before it.
  await expect(page.locator("#topbar .topbar-crumb", { hasText: "VibeWars" })).toBeHidden();

  const back = page.locator("#topbar").getByRole("button", { name: "Back", exact: true });
  await expect(back).toHaveText("‹", { useInnerText: true });
  await back.click();
  await expect(menuHeading(page)).toBeVisible();
});

test("#1525: on a phone, a screen with no ⋯ keeps Lobby Code, Join and the global icons on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openMenu(page);
  await openRail(page, "Team Builder");
  const bar = page.locator("#topbar");
  await expect(bar.locator(".topbar-more")).toBeHidden();
  await expect(bar.getByRole("textbox", { name: "Lobby code", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Join", exact: true })).toBeVisible();
  // The rightmost icon still inside the bar, and nothing scrolls sideways.
  const right = await bar.locator(".topbar-fullscreen").evaluate((node) => {
    return node.getBoundingClientRect().right;
  });
  expect(right).toBeLessThanOrEqual(320);
  const overflow = await bar.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBe(0);
});

test("#1525: the rail switches screens and keeps the last; each mode hosts on its own maps", async ({
  page,
}) => {
  await openMenu(page);
  const rail = page.locator(".mode-rail .mode-rail-entry");
  await expect(rail).toHaveCount(7);
  for (const label of [
    "Random Arena",
    "Team Arena",
    "Heroes' Ascent",
    "GvG",
    "Hosted Game",
    "Character Builder",
    "Team Builder",
  ]) {
    await expect(
      page.locator(".mode-rail").getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".mode-rail-entry[aria-label='Random Arena']")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await openRail(page, "GvG");
  // No Record or Music in the bar: GvG's buttons are its lobby's (#1526).
  await expect(page.locator("#topbar .topbar-screen-actions").getByRole("button")).toHaveText([
    "Ready",
    "Start match",
  ]);
  await page.reload();
  await expect(page.locator(".mode-rail-entry[aria-label='GvG']")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // GvG plays one map, so its host sees it named, not picked.
  await expect(page.locator("#topbar .lobby-map")).toHaveText("Map: Guild Hall Isle (large)");

  // Heroes' Ascent picks among its three.
  await openRail(page, "Heroes' Ascent");
  const options = page.locator("#topbar .lobby-map select option");
  await expect(options).toHaveCount(3);
  await expect(page.locator("#topbar .lobby-map select")).toHaveValue("relic-temples");
});

import { expect, test, type Page } from "@playwright/test";

import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { joinByCode, lobbyWindow, openRail, shutLobbyWindow } from "./helpers/menu.js";
import { copyInvite, hostLobby, openPeers, openToFriends } from "./helpers/peers.js";

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
  await expect(page.locator(".team-editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();
  // Team Builder has no way back either.
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();
  await openRail(page, "Random Arena");
  await expect(page.locator(".character-card")).toBeVisible();

  await page.locator(".topbar-options").click();
  await expect(page.getByRole("dialog", { name: "Options" })).toBeVisible();
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

  // Esc from the name field leaves too, which asks first: the name changed.
  const name = page.getByLabel("team name");
  await name.fill("Duo");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await expect(discard).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(page.locator(".team-editor")).toBeVisible();
  await expect(name).toHaveValue("Duo");
  // The question stood in for Save, which is back; Save itself waits for a member.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(page.locator(".screen-teams")).toBeVisible();
});

test("#1272: the editor's Discard question takes the status's room: the bar stays one row, Keep editing in it", async ({
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
  // It stands in for Save, its anchor (#1902).
  await expect(bar.getByRole("button", { name: "Keep editing", exact: true })).toBeInViewport();
  expect((await bar.boundingBox())?.height).toBe(height);

  await bar.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(status).toBeVisible();
  await expect(bar.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
});

test("#1526: a guest joins from the title bar, follows the host's mode, and leaves to a lobby of its own", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await openMenu(host);
    await openMenu(guest);
    const hostInvite = await copyInvite(host);
    await openToFriends(host);
    // The Lobby window names whose lobby it is, never its key (#2100, #2385).
    const guestLabel = (await lobbyWindow(guest)).locator(".lobby-code-label");
    await expect(guestLabel).toHaveText("Your lobby");
    const ownInvite = await copyInvite(guest);
    // Alone, the host's Lobby counts nobody, and its window says so (#2385).
    await expect(host.locator("#topbar .topbar-lobby-button .topbar-badge")).toBeHidden();
    await expect(await lobbyWindow(host)).toContainText("Just you.");

    await joinByCode(guest, hostInvite);
    const leave = (await lobbyWindow(guest)).getByRole("button", { name: "Leave", exact: true });
    await expect(guestLabel).toHaveText("Lobby");
    await expect(leave).toBeVisible();
    await shutLobbyWindow(guest);
    await expect(host.locator("#topbar .topbar-lobby-button .topbar-badge")).toHaveText("2");
    await expect((await lobbyWindow(host)).locator(".party-member")).toHaveCount(2);
    // A party queues in card 4: alone only.
    await expect(guest.locator("#topbar .lobby-find")).toBeDisabled();

    // The host picks the mode; the guest's rail and screen follow, its modes locked.
    await openRail(host, "GvG");
    await expect(guest.locator(".screen-gvg .lobby-panel")).toBeVisible();
    const hosted = guest.locator(".mode-rail-entry[aria-label='Hosted Game']");
    await expect(hosted).toHaveAttribute("aria-disabled", "true");
    await expect(hosted).toHaveAttribute("title", "The host picks the mode");
    // The builders are everyone's, and opening one leaves no lobby.
    await openRail(guest, "Team Builder");
    await lobbyWindow(guest);
    await expect(guestLabel).toHaveText("Lobby");
    await expect(leave).toBeVisible();

    await leave.click();
    await expect(guestLabel).toHaveText("Your lobby");
    await expect(leave).toBeHidden();
    // A new lobby of its own: neither the host's nor the one it left.
    const newInvite = await copyInvite(guest);
    expect(newInvite).not.toBe(hostInvite);
    expect(newInvite).not.toBe(ownInvite);
    await expect((await lobbyWindow(host)).locator(".party-member")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("#1526: a join that lands after the player queued seats nothing: the queue stays, the host gets no ghost", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await openMenu(host);
    await openMenu(guest);
    const hostInvite = await copyInvite(host);
    await openToFriends(host);
    const hostLobbyWindow = await lobbyWindow(host);
    await expect(hostLobbyWindow).toContainText("Just you.");

    // The host's page stops answering, so the guest's join waits for it.
    const debugger_ = await context.newCDPSession(host);
    await debugger_.send("Debugger.enable");
    await debugger_.send("Debugger.pause");
    await joinByCode(guest, hostInvite);
    await guest.locator("#topbar .lobby-find").click();
    await expect(guest.locator("#topbar .topbar-queue")).toBeVisible();

    // The host answers: the join lands late, and is let go.
    await debugger_.send("Debugger.resume");
    // An absence: give the late join the time it took to land unguarded.
    await host.waitForTimeout(3_000);
    await expect(hostLobbyWindow.locator(".party-member")).toHaveCount(0);
    await expect(hostLobbyWindow).toContainText("Just you.");
    await expect(guest.locator("#topbar .topbar-queue")).toBeVisible();
  } finally {
    await context.close();
  }
});

/** A rolled character's name: its PvX build's (#2636), "Gust (A/E)". */
const ROLLED_NAMES = STARTER_BUILDS.map((build) => build.name);

test("#853: the first start rolls a starter character, chosen; Reroll replaces it in place, Clone copies it", async ({
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
  await expect(page.locator("#topbar .lobby-find")).toBeEnabled();
  const name = card.locator(".play-card-name");
  const first = await name.innerText();
  expect(ROLLED_NAMES).toContain(first);
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
  // starter build under its own name (#2636), the same card.
  await openRail(page, "Character Builder");
  const actions = card.locator(".play-card-actions");
  await actions.getByRole("button", { name: "Reroll", exact: true }).click();
  await expect(name).not.toHaveText(first);
  await expect(card).toHaveCount(1);

  // It has Clone, not Edit (#1147): Clone opens the editor on a copy of
  // the character shown (#2038), one even for a double-click.
  const rolled = await name.innerText();
  expect(ROLLED_NAMES).toContain(rolled);
  const professions = await card.locator(".play-card-line").innerText();
  await expect(actions.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await actions.getByRole("button", { name: "Clone", exact: true }).dblclick();
  await expect(page.locator("input.editor-name")).toHaveValue(`${rolled} (copy)`);
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The copy is an ordinary character: Edit, no Clone or Reroll.
  await expect(card).toHaveCount(2);
  const pyro = page.locator(".character-card", { hasText: "Pyro" });
  const original = page.locator(".character-card", { hasText: rolled });
  await expect(pyro.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(pyro.locator(".roster-clone, .roster-reroll")).toHaveCount(0);
  await expect(pyro.locator(".play-card-line")).toHaveText(professions);
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

  // Random Arena's one button is Find a match (#2980); Options is its ⚙ (#1272), Music its ♪ (#1453).
  const own = page.locator("#topbar .topbar-queue-action").getByRole("button");
  await expect(own).toHaveText(["Find a match"]);
  await expect(page.locator("#topbar .topbar-screen-actions").getByRole("button")).toHaveCount(0);
  await expect(page.locator("#topbar .topbar-options")).toBeVisible();
  await expect(page.locator("#topbar .topbar-music")).toBeVisible();
  // Lobby sits between Options and Music (#2385); the queue icon, before
  // Help, hides while nothing is queued (#2743).
  await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
  expect(
    await page
      .locator("#topbar .topbar-actions > button")
      .evaluateAll((buttons) => buttons.map((node) => node.getAttribute("class") ?? "")),
  ).toEqual([
    "topbar-queue",
    "topbar-help",
    "topbar-options",
    "topbar-lobby-button",
    "topbar-music",
    "topbar-mute",
    "topbar-fullscreen",
  ]);

  // Edit opens the editor and chooses nobody.
  await openRail(page, "Character Builder");
  await pyro.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Pyro");
  await page.keyboard.press("Escape");
  await openRail(page, "Random Arena");
  await expect(starter).toHaveClass(/is-selected/);
});

for (const screen of ["Random Arena", "Character Builder"] as const) {
  test(`#2053: on a phone, ${screen} folds the Lobby into a ⋯, its window's Copy invite link in full (#2385)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMenu(page);
    await openRail(page, screen);
    const bar = page.locator("#topbar");
    await expect(bar.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
    await expect(bar.locator(".topbar-lobby-button")).toBeHidden();
    const copy = (await lobbyWindow(page)).getByRole("button", {
      name: "Copy invite link",
      exact: true,
    });
    await expect(copy).toBeVisible();
    const box = await copy.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    // Nothing inside the box is cut off: the whole label shows.
    const clipped = await copy.evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(clipped).toBe(false);
    // No key to type, and none shown (#2100).
    await expect(bar.getByRole("textbox")).toHaveCount(0);
    expect(await bar.textContent()).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
}

test("#1525: on a phone, the ⋯, the global icons and the Lobby window's Copy invite link stay on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openMenu(page);
  await openRail(page, "Team Builder");
  const bar = page.locator("#topbar");
  const more = bar.locator(".topbar-more");
  await expect(more).toBeVisible();
  const right = await more.evaluate((node) => node.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(320);
  const overflow = await bar.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBe(0);
  const panel = await lobbyWindow(page);
  await expect(panel.getByRole("button", { name: "Copy invite link", exact: true })).toBeVisible();
  const edges = await panel.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return [box.left, box.right];
  });
  expect(edges[0]).toBeGreaterThanOrEqual(0);
  expect(edges[1]).toBeLessThanOrEqual(320);
  // No key to type (#2100).
  await expect(bar.getByRole("textbox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("#1525: the rail switches screens and keeps the last; each mode hosts on its own maps", async ({
  page,
}) => {
  await openMenu(page);
  const rail = page.locator(".mode-rail .mode-rail-entry");
  await expect(rail).toHaveCount(8);
  for (const label of [
    "Random Arena",
    "Team Arena",
    "Heroes' Ascent",
    "GvG",
    "Hosted Game",
    "Character Builder",
    "Team Builder",
    "Matches",
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
  // No Record or Music in the bar: GvG's button is its party's (#1526, #1766).
  await expect(page.locator("#topbar .topbar-queue-action").getByRole("button")).toHaveText([
    "Find a match",
  ]);
  await page.reload();
  await expect(page.locator(".mode-rail-entry[aria-label='GvG']")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // GvG plays one map, so its host sees it named, not picked.
  await expect(page.locator("#topbar .lobby-map")).toHaveText("Map: Guild Hall Isle (small)");

  // Heroes' Ascent starts on its first map, and Team Arena draws one for
  // each match: neither is picked (#1994).
  await openRail(page, "Heroes' Ascent");
  await expect(page.locator("#topbar .lobby-map")).toHaveText(/^Map: The Hollow Deep \(/);
  await expect(page.locator("#topbar .lobby-map select")).toHaveCount(0);
  await openRail(page, "Team Arena");
  await expect(page.locator("#topbar .lobby-map")).toHaveText("Map: random (Team Arena)");
});

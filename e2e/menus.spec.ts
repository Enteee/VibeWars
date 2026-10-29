import { expect, test, type Page } from "@playwright/test";

import { openPeers } from "./helpers/peers.js";

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

test("#578: Esc goes back on the teams, team editor, options, music and lobby screens", async ({
  page,
}) => {
  await openMenu(page);

  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.getByRole("button", { name: "New team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit team" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page.locator(".topbar-options").click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page
    .locator(".topbar-screen-actions")
    .getByRole("button", { name: "Music", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();

  await page.getByRole("button", { name: "Host a lobby" }).click();
  await expect(page.locator("#topbar .lobby-code")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();
  await expect(page.locator("#status")).toBeHidden();

  // The main menu has no way back: Esc leaves it where it is.
  await page.keyboard.press("Escape");
  await expect(menuHeading(page)).toBeVisible();
});

test("#578: Esc with a confirmation open cancels it, and only then goes back", async ({ page }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: "New team", exact: true }).click();

  // Esc from the name field is Back too, which asks first: the name changed.
  const name = page.getByLabel("Team name");
  await name.fill("Duo");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("button", { name: "Discard", exact: true });
  await expect(discard).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit team" })).toBeVisible();
  await expect(name).toHaveValue("Duo");
  // Cancel hands the focus back to the bar's Back.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
});

test("#1272: the editor's Discard question takes the status's room: the bar stays one row, Save in it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
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

test("#578: a host with others in the lobby is asked before Leave or Esc closes it", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    await openMenu(host);
    await host.getByRole("button", { name: "Host a lobby" }).click();
    const code = (await host.locator(".lobby-code").textContent())?.trim() ?? "";
    await openMenu(guest);
    await guest.locator("input.code-input").fill(code);
    await guest.getByRole("button", { name: "Join", exact: true }).click();
    await expect(host.locator(".lobby-spectators")).toContainText("player");

    const question = host.getByText("Close the lobby for everyone?");
    await host.keyboard.press("Escape");
    await expect(question).toBeVisible();
    // The lobby redraws on the guest's change; the question stays.
    await guest.getByRole("button", { name: "Join team 2" }).click();
    await expect(host.locator(".lobby-team").nth(1)).toContainText("player");
    await expect(question).toBeVisible();
    // Esc is "no", as on every screen.
    await host.keyboard.press("Escape");
    await expect(question).toHaveCount(0);
    await expect(host.locator(".screen-lobby")).toBeVisible();

    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await host.getByRole("button", { name: "Close lobby", exact: true }).click();
    await expect(menuHeading(host)).toBeVisible();
    await expect(menuHeading(guest)).toBeVisible();
  } finally {
    await context.close();
  }
});

/** A rolled character's random name (#1149): "Kaelen Ashvale". */
const ROLLED_NAME = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

test("#853: the first start rolls a starter character, chosen; Reroll replaces it in place, Clone copies it", async ({
  page,
}) => {
  await openMenu(page);
  const roster = page.locator(".roster");
  const row = roster.locator(".selectable-row");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveClass(/is-selected/);
  await expect(page.getByRole("button", { name: "Random Arena", exact: true })).toBeEnabled();
  const name = row.locator(".selectable-row-name");
  await expect(name).toHaveText(ROLLED_NAME);
  const first = await name.innerText();
  // Drawn as a match draws it (#1250): the figure, not a lettered dot.
  const figure = row.locator("canvas.character-figure");
  await expect(figure).toBeVisible();
  await expect(row.locator(".character-dot")).toHaveCount(0);
  // With its primary profession's glyph inside the disc, as in a match (#1037).
  await expect(figure).toHaveAttribute("data-glyph", /^[a-z]+$/);

  // Rolled once: a reload keeps it, and rolls nothing new.
  await page.reload();
  await expect(row).toHaveCount(1);
  await expect(name).toHaveText(first);

  // Rerolled at once, unasked (#1146): another starter build under
  // another random name (#1149), the same row, still chosen.
  const actions = roster.locator(".selectable-row-actions");
  await actions.getByRole("button", { name: "Reroll", exact: true }).click();
  await expect(name).not.toHaveText(first);
  await expect(name).toHaveText(ROLLED_NAME);
  await expect(row).toHaveCount(1);
  await expect(row).toHaveClass(/is-selected/);

  // It has Clone, not Edit (#1147): Clone opens the editor on a copy,
  // one copy even for a double-click.
  const rolled = await name.innerText();
  await expect(actions.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await actions.getByRole("button", { name: "Clone", exact: true }).dblclick();
  await expect(page.locator("input.editor-name")).toHaveValue(`${rolled} (copy)`);
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The copy is an ordinary character: Edit, no Clone or Reroll. The
  // rolled one is still chosen.
  await expect(row).toHaveCount(2);
  const pyro = roster.locator(".selectable-row", { hasText: "Pyro" });
  const original = roster.locator(".selectable-row", { hasText: rolled });
  await expect(pyro.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(pyro.locator(".roster-clone, .roster-reroll")).toHaveCount(0);
  await expect(original.locator(".roster-reroll")).toHaveCount(1);
  await expect(original).toHaveClass(/is-selected/);
});

test("#1290: a fresh character, empty bar and all, holds its weapon on the menu", async ({
  page,
}) => {
  await openMenu(page);
  const roster = page.locator(".roster");
  await roster.getByRole("button", { name: "New character" }).click();
  await page.locator("input.editor-name").fill("Blank");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const blank = roster.locator(".selectable-row", { hasText: "Blank" });
  await expect(blank).not.toHaveClass(/is-invalid/);
  await expect(blank.locator("canvas.character-figure")).toHaveAttribute("data-weapon-id", "sword");
});

test("#579: the roster's rows are buttons: Enter or Space chooses, Edit sits beside", async ({
  page,
}) => {
  await openMenu(page);
  // The first start's rolled character (#853), chosen.
  const roster = page.locator(".roster");
  await expect(roster.locator(".selectable-row")).toHaveCount(1);
  const rolled = roster.locator(".selectable-row").first();
  await expect(rolled).toHaveClass(/is-selected/);
  await roster.getByRole("button", { name: "New character" }).click();
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const pyro = roster.locator(".selectable-row", { hasText: "Pyro" });
  await expect(pyro.locator(".mini-skill")).toHaveCount(8);
  const choosePyro = pyro.locator(".selectable-row-choose");
  await choosePyro.focus();
  await page.keyboard.press("Enter");
  await expect(pyro).toHaveClass(/is-selected/);
  await expect(choosePyro).toBeFocused();

  const starter = roster.locator(".selectable-row").filter({ hasNotText: "Pyro" });
  await starter.locator(".selectable-row-choose").focus();
  await page.keyboard.press(" ");
  await expect(starter).toHaveClass(/is-selected/);
  await expect(pyro).not.toHaveClass(/is-selected/);

  // Edit opens the editor and chooses nobody.
  await pyro.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Pyro");
  await page.keyboard.press("Escape");
  await expect(starter).toHaveClass(/is-selected/);

  // Teams and Music are the menu's own buttons in the top bar; Options is its ⚙ (#1272).
  for (const name of ["Teams", "Music"]) {
    await expect(
      page.locator("#topbar .topbar-screen-actions").getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator("#topbar .topbar-options")).toBeVisible();
});

test("#1272: on a phone, Music's ⋯ holds its other buttons and the chevron is Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openMenu(page);
  const more = page.locator("#topbar .topbar-more");
  const screenButton = (name: string) =>
    page.locator("#topbar .topbar-screen-actions").getByRole("button", { name, exact: true });

  // Folded away until ⋯ opens; the global icons with them.
  await expect(screenButton("Music")).toBeHidden();
  await expect(page.locator("#topbar .topbar-options")).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#topbar .topbar-options")).toBeVisible();
  await screenButton("Music").click();
  await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");

  // Only the place shows, not the crumbs before it.
  await expect(page.locator("#topbar .topbar-crumb", { hasText: "VibeWars" })).toBeHidden();
  await expect(screenButton("Sound settings")).toBeHidden();
  await more.click();
  await screenButton("Sound settings").click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  // Reached from Music, its breadcrumb says so.
  await expect(page.locator("#topbar .topbar-crumbs")).toHaveText("VibeWars > Music > Options");

  const back = page.locator("#topbar").getByRole("button", { name: "Back", exact: true });
  await expect(back).toHaveText("‹", { useInnerText: true });
  await back.click();
  await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
  await back.click();
  await expect(menuHeading(page)).toBeVisible();
});

import { expect, test, type Locator, type Page } from "@playwright/test";

import { openLibraryGroup } from "./helpers/library.js";
import { openRail } from "./helpers/menu.js";
import { OVERLAY_VIEWPORTS, clickTopbarIcon, expectCloseAtTopRight } from "./helpers/overlay.js";
import { chooseProfession } from "./helpers/professions.js";

/**
 * The Options screen (#423) and its Controls section (#309): what only a
 * browser can tell is that a key bound there is the key the Training Ground
 * casts with, and that it is still bound after a reload.
 */

const WIDE = { width: 1500, height: 950 };

const cell = (page: Page, action: string, index = 0): Locator =>
  page.locator(`.key-cell[data-action="${action}"][data-index="${String(index)}"]`);

async function openKeys(page: Page): Promise<void> {
  await page.locator(".topbar-options").click();
  await expect(page.locator(".options-screen")).toBeVisible();
  // Options opens on its first section, Player (#1513).
  await page.locator('.options-entry[data-section="controls"]').click();
  await expect(page.locator('.options-entry[data-section="controls"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".keys-screen")).toBeVisible();
}

test("(1) Skill 1 bound to Z in Controls casts on Z, not Q, and survives a reload", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openKeys(page);
  await expect(cell(page, "skill-1")).toHaveText("Q");

  await cell(page, "skill-1").click();
  await expect(cell(page, "skill-1")).toHaveText("press a key...");
  await page.keyboard.press("z");
  await expect(cell(page, "skill-1")).toHaveText("Z");
  await expect(page.locator(".keys-preset")).toHaveValue("custom");

  // Esc outside a capture is the way back.
  await page.keyboard.press("Escape");
  await expect(page.locator(".options-screen")).toHaveCount(0);

  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "elementalist");
  await openLibraryGroup(page, "Fire Magic");
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(".training-skill").first()).toHaveText("Z");
  await expect(page.locator(".training-skill").first()).toHaveAccessibleName("Fireball");
  await page.locator(".training-stage").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".training")).toHaveClass(/is-armed/);

  // Q is nobody's key now. Fireball is a 1 s cast; were Q still Skill 1,
  // its hit would be in the log well inside this wait.
  await page.keyboard.press("q");
  await page.waitForTimeout(2500);
  await expect(page.locator(".training-log-row", { hasText: "Fireball" })).toHaveCount(0);

  await page.keyboard.press("z");
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );

  await page.reload();
  await openKeys(page);
  await expect(cell(page, "skill-1")).toHaveText("Z");
});

test("(2) taking a key from another action empties its cell and says so", async ({ page }) => {
  await page.goto("./");
  await openKeys(page);
  await cell(page, "skill-2").click();
  await page.keyboard.press("q");
  await expect(cell(page, "skill-2")).toHaveText("Q");
  await expect(cell(page, "skill-1")).toHaveText("-");
  await expect(cell(page, "skill-1")).toHaveClass(/is-flashing/);
  await expect(page.locator(".keys-line")).toHaveText("Q was Skill 1; Skill 1 now has no key.");
  await expect(page.locator('tr:has(.key-cell[data-action="skill-1"]) .keys-warning')).toHaveText(
    "no key",
  );

  // Esc in a capture cancels it, and stays on the screen.
  await cell(page, "skill-3").click();
  await page.keyboard.press("Escape");
  await expect(cell(page, "skill-3")).toHaveText("E");
  await expect(page.locator(".keys-screen")).toBeVisible();

  await page.getByRole("button", { name: "reset to VibeWars" }).click();
  await expect(cell(page, "skill-1")).toHaveText("Q");
  await expect(page.locator(".keys-preset")).toHaveValue("vibewars");
});

test("(3) Space binds and stays bound: its keyup does not click the cell again", async ({
  page,
}) => {
  await page.goto("./");
  await openKeys(page);
  await cell(page, "mute").click();
  await page.keyboard.press("Space");
  await expect(cell(page, "mute")).toHaveText("Space");
  await expect(page.locator(".key-cell.is-capturing")).toHaveCount(0);
  await expect(cell(page, "attack")).toHaveText("-");
});

test("(4) Back leaves Options for the menu; on a narrow screen the sections sit above", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("./");
  // On a phone the menu's join controls and the global icons fold into ⋯ (#1272, #2053).
  await page.locator("#topbar .topbar-more").click();
  await openKeys(page);
  const entry = await page.locator('.options-entry[data-section="controls"]').boundingBox();
  const pane = await page.locator(".options-pane").boundingBox();
  expect(entry).not.toBeNull();
  expect(pane).not.toBeNull();
  if (entry !== null && pane !== null) {
    expect(entry.y + entry.height).toBeLessThanOrEqual(pane.y);
  }

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".options-screen")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
});

test("the top bar's ⚙ opens Options over the screen; Esc closes it and leaves the screen as it was (#454)", async ({
  page,
}) => {
  await page.goto("./");
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "new team" }).click();
  const teamName = page.locator("#topbar").getByRole("textbox", { name: "team name", exact: true });
  await expect(teamName).toBeVisible();

  await page.locator("#topbar").getByRole("button", { name: "Options" }).click();
  const options = page.getByRole("dialog", { name: "Options" });
  await expect(options).toBeVisible();
  // Esc is the overlay's: it closes, and the team editor does not also go back.
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(teamName).toBeVisible();

  // Its × does the same; then Esc is the screen's again.
  await page.locator("#topbar").getByRole("button", { name: "Options" }).click();
  // The × is the window's own, at its top right (#2381).
  await options.getByRole("button", { name: "Close", exact: true }).click();
  await expect(options).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(teamName).toHaveCount(0);
});

for (const viewport of OVERLAY_VIEWPORTS) {
  test(`Options' × sits at its own top right at ${String(viewport.width)} px; it and Esc close it (#2381)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    const options = page.getByRole("dialog", { name: "Options" });

    await clickTopbarIcon(page, ".topbar-options");
    const close = await expectCloseAtTopRight(page, options);
    await close.click();
    await expect(options).toHaveCount(0);

    await clickTopbarIcon(page, ".topbar-options");
    await expect(options).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
  });
}

test("Options lists the third-party licences, each with its full text (#1235)", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".topbar-options").click();
  await page.locator('.options-entry[data-section="licences"]').click();
  const corpus = page.locator('.licence-entry[data-licence="gw-skilldata"]');
  await expect(corpus.locator(".licence-name")).toHaveText("gw-skilldata (MIT)");
  await expect(corpus).toContainText("GW1 skill data");
  // The notice survives the build, verbatim from the vendored file.
  const text = corpus.locator(".licence-text");
  await expect(text).toContainText("Copyright (c) 2024 smiley");
  await expect(text).toContainText("Permission is hereby granted");
});

test("Options lists every bundled npm package and the VCSL samples, each with its licence (#1242)", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".topbar-options").click();
  await page.locator('.options-entry[data-section="licences"]').click();
  const vcsl = page.locator('.licence-entry[data-licence="VCSL"]');
  await expect(vcsl.locator(".licence-name")).toHaveText("VCSL (CC0-1.0)");
  // Generated by the build from the package itself, collapsed until opened.
  const phaser = page.locator('.licence-entry[data-licence="phaser"]');
  await expect(phaser.locator(".licence-name")).toContainText("(MIT)");
  await expect(phaser.locator(".licence-text")).toBeHidden();
  await phaser.locator("summary").click();
  await expect(phaser.locator(".licence-text")).toContainText("Permission is hereby granted");
});

for (const viewport of OVERLAY_VIEWPORTS) {
  test(`Options is a window under the bar at ${String(viewport.width)} px, the screen still there behind it (#2386)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    const options = page.getByRole("dialog", { name: "Options" });
    await clickTopbarIcon(page, ".topbar-options");
    await expect(options).toBeVisible();
    await expect(options).not.toHaveAttribute("aria-modal", /.*/);

    const bar = await page.locator("#topbar").boundingBox();
    const box = await options.boundingBox();
    expect(bar).not.toBeNull();
    expect(box).not.toBeNull();
    if (bar !== null && box !== null) {
      expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    // No backdrop: the menu behind it shows, and a press on it closes Options.
    const heading = page.getByRole("heading", { name: "VibeWars" });
    await expect(heading).toBeVisible();
    await heading.click();
    await expect(options).toHaveCount(0);
  });
}

test("⚙ toggles Options; Esc, × and a press outside give the focus back to ⚙ (#2386)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  const gear = page.locator("#topbar .topbar-options");
  const options = page.getByRole("dialog", { name: "Options" });

  await gear.click();
  await expect(options).toBeVisible();
  await expect(gear).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.options-entry[data-section="player"]')).toBeFocused();
  await gear.click();
  await expect(options).toHaveCount(0);
  await expect(gear).toBeFocused();

  for (const shut of [
    () => page.keyboard.press("Escape"),
    () => options.getByRole("button", { name: "Close", exact: true }).click(),
    () => page.getByRole("heading", { name: "VibeWars" }).click(),
  ]) {
    await gear.click();
    await expect(options).toBeVisible();
    await shut();
    await expect(options).toHaveCount(0);
    await expect(gear).toHaveAttribute("aria-expanded", "false");
  }
  // The press outside is the player's to place; the others hand ⚙ the focus.
  await gear.click();
  await page.keyboard.press("Escape");
  await expect(gear).toBeFocused();
});

test("a key still being rebound keeps Options open through a press outside; Esc cancels only it (#2386)", async ({
  page,
}) => {
  await page.goto("./");
  await openKeys(page);
  await cell(page, "skill-1").click();
  await expect(cell(page, "skill-1")).toHaveText("press a key...");
  await page.getByRole("heading", { name: "VibeWars" }).click();
  await expect(page.locator(".options-screen")).toBeVisible();
  await cell(page, "skill-1").focus();
  await page.keyboard.press("Escape");
  await expect(cell(page, "skill-1")).toHaveText("Q");
  await expect(page.locator(".options-screen")).toBeVisible();
});

test("Options and the Lobby window shut each other: one top-bar window at a time (#2386)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  const options = page.getByRole("dialog", { name: "Options" });
  const lobby = page.locator("#topbar .lobby-window");
  await page.locator("#topbar .topbar-options").click();
  await expect(options).toBeVisible();
  await page.locator("#topbar .topbar-lobby-button").click();
  await expect(lobby).toBeVisible();
  await expect(options).toHaveCount(0);
  await page.locator("#topbar .topbar-options").click();
  await expect(options).toBeVisible();
  await expect(lobby).toHaveCount(0);
});

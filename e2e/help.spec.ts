import { expect, test, type Locator, type Page } from "@playwright/test";

import { lobbyWindow, openRail } from "./helpers/menu.js";
import { OVERLAY_VIEWPORTS, clickTopbarIcon, expectCloseAtTopRight } from "./helpers/overlay.js";
import { startSoloMatch } from "./helpers/peers.js";

/**
 * The Help screen (#1257): the [?] of the top bar and of the HUD opens
 * the player docs over what runs under it, and Esc puts them away.
 */

for (const viewport of OVERLAY_VIEWPORTS) {
  test(`Help's × sits at its own top right at ${String(viewport.width)} px; it and Esc close it (#2381)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    const help = page.getByRole("dialog", { name: "Help" });

    await clickTopbarIcon(page, ".topbar-help");
    const close = await expectCloseAtTopRight(page, help);
    await close.click();
    await expect(help).toHaveCount(0);

    await clickTopbarIcon(page, ".topbar-help");
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toHaveCount(0);
  });
}

test("[?] opens Help on Getting started; Esc returns to the menu as it was (#1257)", async ({
  page,
}) => {
  await page.goto("./");
  // The page's own lobby, which Help leaves open (#1526).
  const lobby = (await lobbyWindow(page)).locator(".lobby-code-label");
  await expect(lobby).toHaveText("Your lobby");

  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  // Help shuts the Lobby window it opens over (#2385).
  await expect(page.locator("#topbar .lobby-window")).toHaveCount(0);
  await expect(page.locator("#topbar .topbar-crumbs")).toHaveText(
    "VibeWars > Help > Getting started",
  );
  await expect(help.locator(".help-page h1")).toHaveText("Getting started");
  // The bar over the match has no status: it once still said "entering
  // match…" (#1272).
  await expect(page.locator("#status")).toBeHidden();
  await expect(help.locator('.options-entry[data-page="getting-started"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Markdown, rendered: headings and lists, no raw syntax.
  await expect(help.locator(".help-page h2", { hasText: "Make a character" })).toBeVisible();
  await expect(help.locator(".help-page ol li").first()).toContainText("New character");
  await expect(help.locator(".help-page")).not.toContainText("##");

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  // The menu under it is as it was.
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await lobbyWindow(page);
  await expect(lobby).toHaveText("Your lobby");
});

test("the HUD's [?] opens Help over a match; Esc closes it and gives focus back (#1257)", async ({
  page,
}) => {
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator("#topbar")).toBeHidden();
  await page.locator(".hud-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  await expect(help.locator(".help-page h1")).toHaveText("Getting started");
  // Its keys are its own: F10 asks nothing beneath it.
  await page.keyboard.press("F10");
  await expect(page.locator(".hud-leave").getByRole("button", { name: "yes" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(page.locator(".hud-help")).toBeFocused();
});

test("Help, not the menu, says peers see your IP address (#541, #1442)", async ({ page }) => {
  await page.goto("./");
  // Hosted Game is where a lobby was hosted, so where the warning was.
  await openRail(page, "Hosted Game");
  await expect(page.locator(".lobby-panel")).toBeVisible();
  await expect(page.getByText("IP address")).toHaveCount(0);

  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.locator(".help-page")).toContainText("see your IP address");
});

/** Help on its Third-party licences page, as a player reaches it. */
async function openLicences(page: Page): Promise<Locator> {
  await page.goto("./");
  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await help.getByRole("button", { name: "Third-party licences" }).click();
  return help;
}

test("Help's last page is the third-party licences, not Options' (#2559)", async ({ page }) => {
  const help = await openLicences(page);
  const nav = help.locator(".options-nav");
  // After the docs, before the source link.
  await expect(nav.locator(":scope > *").last()).toHaveText("Source code");
  await expect(nav.locator(":scope > *").nth(-2)).toHaveText("Third-party licences");
  const entry = nav.locator('.options-entry[data-page="licences"]');
  await expect(entry).toHaveClass(/is-selected/);
  await expect(entry).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#topbar .topbar-crumbs")).toHaveText(
    "VibeWars > Help > Third-party licences",
  );

  await page.keyboard.press("Escape");
  await page.locator(".topbar-options").click();
  await expect(page.locator('.options-entry[data-section="licences"]')).toHaveCount(0);
});

test("Help lists the third-party licences, each with its full text (#1235)", async ({ page }) => {
  const help = await openLicences(page);
  const corpus = help.locator('.licence-entry[data-licence="gw-skilldata"]');
  await expect(corpus.locator(".licence-name")).toHaveText("gw-skilldata (MIT)");
  await expect(corpus).toContainText("GW1 skill data");
  // The notice survives the build, verbatim from the vendored file.
  const text = corpus.locator(".licence-text");
  await expect(text).toContainText("Copyright (c) 2024 smiley");
  await expect(text).toContainText("Permission is hereby granted");
});

test("Help lists every bundled npm package and the VCSL samples, each with its licence (#1242)", async ({
  page,
}) => {
  const help = await openLicences(page);
  const vcsl = help.locator('.licence-entry[data-licence="VCSL"]');
  await expect(vcsl.locator(".licence-name")).toHaveText("VCSL (CC0-1.0)");
  // Generated by the build from the package itself, collapsed until opened.
  const phaser = help.locator('.licence-entry[data-licence="phaser"]');
  await expect(phaser.locator(".licence-name")).toContainText("(MIT)");
  await expect(phaser.locator(".licence-text")).toBeHidden();
  await phaser.locator("summary").click();
  await expect(phaser.locator(".licence-text")).toContainText("Permission is hereby granted");
});

import { expect, test, type Locator, type Page } from "@playwright/test";

import { LANGUAGES } from "../apps/web/src/i18n/languages.js";
import { lobbyWindow, openRail } from "./helpers/menu.js";
import { OVERLAY_VIEWPORTS, clickTopbarIcon, expectCloseAtTopRight } from "./helpers/overlay.js";
import { startSoloMatch } from "./helpers/peers.js";

/**
 * Help (#1257): the [?] of the top bar and of the HUD drops the player
 * docs as a window (#3552), beside what runs under it, and Esc puts them away.
 */

/** Help's page picker. */
const picker = (help: Locator): Locator => help.getByRole("combobox", { name: "help pages" });

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
  // A window, not a screen: the bar still says where you are (#3552).
  await expect(page.locator("#topbar .topbar-crumbs")).not.toContainText("Help");
  await expect(help.locator(".help-page h1")).toHaveText("Getting started");
  // The bar over the match has no status: it once still said "entering
  // match…" (#1272).
  await expect(page.locator("#status")).toBeHidden();
  await expect(picker(help)).toBeFocused();
  await expect(picker(help)).toHaveValue("getting-started");
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

test("[?] stays in the bar, shown open, while Help is open; a second press closes it (#2724, #3552)", async ({
  page,
}) => {
  await page.goto("./");
  const icon = page.locator(".topbar-help");
  await icon.click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("aria-expanded", "true");

  // An in-page link switches the page in place, and the picker follows.
  await help.locator('.help-page a[data-page="modes"]').first().click();
  await expect(picker(help)).toHaveValue("modes");
  await picker(help).selectOption("controls");
  await expect(help.locator(".help-page")).toHaveAttribute("data-page", "controls");
  await expect(icon).toBeVisible();

  await icon.click();
  await expect(help).toHaveCount(0);
  await expect(icon).toHaveAttribute("aria-expanded", "false");
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
  await picker(help).selectOption({ label: "Third-party licences" });
  return help;
}

test("Help's last page is the third-party licences, not Options' (#2559)", async ({ page }) => {
  const help = await openLicences(page);
  // After the docs; the source link, then the release and build, at the foot.
  await expect(picker(help).locator("option").last()).toHaveText("Third-party licences");
  await expect(picker(help)).toHaveValue("licences");
  await expect(help.locator(".help-page")).toHaveAttribute("data-page", "licences");
  const foot = help.locator(".help-footer > *");
  await expect(foot.last()).toHaveClass("help-version");
  await expect(foot.nth(-2)).toHaveText("Source code");

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

test("without the build's list, Help lists the vendored works and says nothing more (#2643)", async ({
  page,
}) => {
  await page.route("**/licences.json", (route) => route.fulfill({ status: 404 }));
  const help = await openLicences(page);
  await expect(help.locator('.licence-entry[data-licence="VCSL"]')).toBeVisible();
  await expect(help.locator(".licences-bundled")).toBeEmpty();
  await expect(help.locator('.licence-entry[data-licence="phaser"]')).toHaveCount(0);
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

test("Help's foot names the release and the build (#2798)", async ({ page }) => {
  await page.goto("./");
  await clickTopbarIcon(page, ".topbar-help");
  await expect(page.locator(".help-version")).toHaveText(/^VibeWars dev · build [\w.-]{1,8}$/);
});

for (const { code } of LANGUAGES) {
  test.describe(`Help in ${code} at 360 px (#3733)`, () => {
    test.use({ locale: code, viewport: { width: 360, height: 740 } });

    test("no page scrolls sideways", async ({ page }) => {
      await page.goto("./");
      await page.locator(".topbar-help").click();
      const help = page.getByRole("dialog");
      const pane = help.locator(".help-page");
      const picker = help.locator(".help-picker");
      for (const id of await picker
        .locator("option")
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))) {
        await picker.selectOption(id);
        await expect(pane).toHaveAttribute("data-page", id);
        const { scrollWidth, clientWidth } = await pane.evaluate((node) => ({
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }));
        expect(
          scrollWidth,
          `${id} is ${String(scrollWidth)} px in ${String(clientWidth)}`,
        ).toBeLessThanOrEqual(clientWidth + 1);
      }
    });
  });
}

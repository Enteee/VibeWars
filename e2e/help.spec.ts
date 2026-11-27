import { expect, test, type Locator, type Page } from "@playwright/test";

import type { LanguageCode } from "../apps/web/src/i18n/languages.js";
import { hudMenuRow } from "./helpers/hud-menu.js";
import { lobbyWindow, openRail } from "./helpers/menu.js";
import { OVERLAY_VIEWPORTS, clickTopbarIcon, expectCloseAtTopRight } from "./helpers/overlay.js";
import { startSoloMatch } from "./helpers/peers.js";

/**
 * Help (#1257): the [?] of the top bar and of the HUD drops the player
 * docs as a window (#3552), beside what runs under it, and Esc puts them away.
 */

/** Help's rail of pages (#4216). */
const rail = (help: Locator): Locator => help.getByRole("navigation", { name: "help pages" });
/** The rail's entry for the page `id`. */
const entry = (help: Locator, id: string): Locator =>
  rail(help).locator(`.flyout-rail-entry[data-id="${id}"]`);

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
  await expect(entry(help, "getting-started")).toBeFocused();
  await expect(entry(help, "getting-started")).toHaveAttribute("aria-current", "page");
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

  // An in-page link switches the page in place, and the rail follows.
  await help.locator('.help-page a[data-page="modes"]').first().click();
  await expect(entry(help, "modes")).toHaveAttribute("aria-current", "page");
  await entry(help, "controls").click();
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
  await (await hudMenuRow(page, "help")).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  await expect(help.locator(".help-page h1")).toHaveText("Getting started");
  // Its keys are its own: F10 asks nothing beneath it.
  await page.keyboard.press("F10");
  await expect(page.locator(".hud-leave").getByRole("button", { name: "yes" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  // Its row went with ☰'s list, so focus goes back to ☰ (#3923).
  await expect(page.locator(".hud-menu-toggle")).toBeFocused();
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

test("a Help link to a section opens its page at that heading, not the top (#3812)", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await entry(help, "ranking").click();
  await help.locator('.help-page a[data-anchor="heroes-ascent"]').first().click();
  const pane = help.locator(".help-page");
  await expect(pane).toHaveAttribute("data-page", "modes");
  const heading = pane.locator("h2#heroes-ascent");
  await expect(heading).toHaveText("Heroes' Ascent");
  // Scrolled to it: the heading stands at the pane's top, not far down the page.
  await expect
    .poll(async () => {
      const [top, at] = await Promise.all([pane.boundingBox(), heading.boundingBox()]);
      return top === null || at === null ? Infinity : Math.abs(at.y - top.y);
    })
    .toBeLessThan(40);
  expect(await pane.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

/** Help on its Third-party licences page, as a player reaches it. */
async function openLicences(page: Page): Promise<Locator> {
  await page.goto("./");
  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await rail(help).getByRole("button", { name: "Third-party licences", exact: true }).click();
  return help;
}

test("Help's last page is the third-party licences, not Options' (#2559)", async ({ page }) => {
  const help = await openLicences(page);
  // After the docs; the source link, then the release and build, at the foot.
  await expect(rail(help).locator(".flyout-rail-entry").last()).toHaveText("Third-party licences");
  await expect(entry(help, "licences")).toHaveAttribute("aria-current", "page");
  await expect(help.locator(".help-page")).toHaveAttribute("data-page", "licences");
  const foot = help.locator(".help-footer > *");
  await expect(foot.last()).toHaveClass("help-version");
  await expect(foot.nth(-2)).toHaveText("Source code");

  await page.keyboard.press("Escape");
  await page.locator(".topbar-options").click();
  await expect(
    page
      .getByRole("navigation", { name: "options sections" })
      .getByRole("button", { name: /licen/i }),
  ).toHaveCount(0);
});

test("Help's Trailer page, first after the docs, fetches nothing from GitHub until Play (#3835)", async ({
  page,
}) => {
  const github: string[] = [];
  await page.route(/^https:\/\/([a-z.-]+\.)?github(usercontent)?\.com\//, (route) => {
    github.push(route.request().url());
    return route.abort();
  });
  await page.goto("./");
  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(rail(help).locator(".flyout-rail-entry").nth(-2)).toHaveText("Trailer");
  await entry(help, "trailer").click();
  await expect(help.locator(".help-page")).toHaveAttribute("data-page", "trailer");
  const video = help.locator("video.trailer-video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("preload", "none");
  const url =
    "https://github.com/Enteee/VibeWars/releases/download/v0.12.0/vibewars-trailer-16x9.mp4";
  await expect(video).toHaveAttribute("src", url);
  await expect(help.getByRole("link", { name: "Download" })).toHaveAttribute("href", url);
  await expect(help.getByRole("link", { name: "Phone version (vertical)" })).toHaveAttribute(
    "href",
    /vibewars-trailer-9x16\.mp4$/,
  );
  expect(github).toEqual([]);
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

// The longest words (de, hu, fi, ru), right to left (ar), and the source.
// All 30 pass, but take 2.4 min on one worker (#3733).
for (const code of ["en", "de", "ar", "ru", "hu", "fi"] satisfies LanguageCode[]) {
  test.describe(`Help in ${code} at 360 px (#3733)`, () => {
    test.use({ locale: code, viewport: { width: 360, height: 740 } });

    test("no page scrolls sideways", async ({ page }) => {
      await page.goto("./");
      await clickTopbarIcon(page, ".topbar-help");
      const help = page.getByRole("dialog");
      const pane = help.locator(".help-page");
      // Narrow, the rail is a list: each page is drilled into, then back (#4216).
      const entries = help.locator(".flyout-rail-entry");
      for (const id of await entries.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset.id ?? ""),
      )) {
        await help.locator(`.flyout-rail-entry[data-id="${id}"]`).click();
        await expect(pane).toHaveAttribute("data-page", id);
        const { scrollWidth, clientWidth } = await pane.evaluate((node) => ({
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }));
        expect(
          scrollWidth,
          `${id} is ${String(scrollWidth)} px in ${String(clientWidth)}`,
        ).toBeLessThanOrEqual(clientWidth + 1);
        await help.locator(".flyout-rail-back-button").click();
      }
    });
  });
}

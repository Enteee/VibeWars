import { expect, test, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";

import { joinFriend, openRail } from "./helpers/menu.js";
import { clickTopbarIcon } from "./helpers/overlay.js";
import { hostLobby, openPeers } from "./helpers/peers.js";
import { PIXEL_8A_LANDSCAPE, PIXEL_8A_PORTRAIT } from "./helpers/phone.js";

/**
 * Every screen outside a match and the editors fits a Pixel 8a (#3776),
 * upright and on its side: no sideways scroll, a 44x44 box round every
 * control, no text under 12 px, and on its side a top bar one row high.
 * Each screen is opened upright and then turned, so it lays out again.
 */

test.use(PIXEL_8A_PORTRAIT);

/** Where the screens outside a match draw: the top bar, the screen under it, its chat, the splash. */
const SCREENS = ["#topbar", "#screens", "#app > .chat", ".splash"];

/** What does not fit, by rule; every list empty when the screen fits. */
interface Misfits {
  readonly sideways: string[];
  readonly targets: string[];
  readonly text: string[];
  readonly topbar: string[];
}

/**
 * The screen as shown now, measured against the rules: its controls and
 * text within `scopes`, a window over the screen for one.
 */
async function misfits(page: Page, scopes: readonly string[]): Promise<Misfits> {
  return page.evaluate((scopes) => {
    const shown = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 && box.height > 0 && element.checkVisibility({ visibilityProperty: true })
      );
    };
    const name = (element: Element): string => {
      const text = element.textContent.trim().slice(0, 24);
      const label = element.getAttribute("aria-label") ?? "";
      return `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} "${label || text}"`;
    };
    const root = document.documentElement;
    const sideways =
      root.scrollWidth > root.clientWidth
        ? [`page ${String(root.scrollWidth)} px wide in ${String(root.clientWidth)}`]
        : [];

    const controls = document.querySelectorAll(
      [
        "a[href]",
        "button",
        "input:not([type=hidden])",
        "select",
        "textarea",
        "summary",
        "[role=button]",
        "[role=tab]",
        "[role=link]",
        "[role=switch]",
        "[role=checkbox]",
      ]
        .flatMap((control) => scopes.map((scope) => `${scope} ${control}`))
        .join(", "),
    );
    const targets: string[] = [];
    for (const control of controls) {
      // A box or a toggle drawn by its label is hit through the label.
      const hit =
        control instanceof HTMLInputElement && control.labels !== null && control.labels.length > 0
          ? control.labels[0]
          : control;
      if (hit === undefined || !shown(hit)) {
        continue;
      }
      const box = hit.getBoundingClientRect();
      if (box.width < 44 - 0.5 || box.height < 44 - 0.5) {
        targets.push(`${name(control)} ${box.width.toFixed(0)}x${box.height.toFixed(0)}`);
      }
    }

    const text: string[] = [];
    for (const element of document.querySelectorAll(
      scopes.map((scope) => `${scope} *`).join(", "),
    )) {
      const own = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
      );
      if (!own || !shown(element)) {
        continue;
      }
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size < 12 - 0.01) {
        text.push(`${name(element)} ${size.toFixed(1)} px`);
      }
    }

    const bar = document.querySelector("#topbar");
    const height = bar === null ? 0 : bar.getBoundingClientRect().height;
    const topbar =
      window.innerHeight < window.innerWidth && height > 56
        ? [`top bar ${height.toFixed(0)} px tall`]
        : [];
    return { sideways, targets, text, topbar };
  }, scopes);
}

/** `screen` fits now; on failure the message names it and every misfit. */
async function expectFits(page: Page, screen: string, scopes = SCREENS): Promise<void> {
  const found = await misfits(page, scopes);
  expect.soft(found, `${screen} fits a Pixel 8a`).toEqual({
    sideways: [],
    targets: [],
    text: [],
    topbar: [],
  });
}

/** `screen` fits upright, and again once turned on its side. */
async function expectFitsBothWays(page: Page, screen: string, scopes = SCREENS): Promise<void> {
  await page.setViewportSize(PIXEL_8A_PORTRAIT.viewport);
  await expectFits(page, `${screen} upright`, scopes);
  await page.setViewportSize(PIXEL_8A_LANDSCAPE.viewport);
  await expectFits(page, `${screen} on its side`, scopes);
  await page.setViewportSize(PIXEL_8A_PORTRAIT.viewport);
}

/** Open `path` past the touch-only notice (#1392), as a phone player does. */
async function open(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  await page.locator(".touch-notice-continue").click();
  await expect(page.locator(".touch-notice")).toHaveCount(0);
}

test("the splash fits", async ({ page }) => {
  // Past the notice already: the tap on its Continue would reach the splash too.
  await page.addInitScript((key) => {
    localStorage.setItem(key, "true");
  }, `${STORAGE_NAMESPACE}.touch-notice-dismissed`);
  await page.goto("./?splash&menu-background");
  await expect(page.locator(".splash")).toBeVisible();
  await expectFitsBothWays(page, "the splash");
});

test("the menu and its rail fit", async ({ page }) => {
  await open(page);
  await expect(page.locator(".mode-rail")).toBeVisible();
  await expectFitsBothWays(page, "the menu");
});

test("Options fits", async ({ page }) => {
  await open(page);
  await clickTopbarIcon(page, ".topbar-options");
  await expect(page.locator(".options-screen")).toBeVisible();
  await expectFitsBothWays(page, "Options", [".options-screen"]);
});

test("every Help page fits", async ({ page }) => {
  await open(page);
  await clickTopbarIcon(page, ".topbar-help");
  const help = page.getByRole("dialog", { name: "Help" });
  const pages = help.getByRole("combobox", { name: "help pages" });
  const ids = await pages
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(ids.length).toBeGreaterThan(5);
  for (const id of ids) {
    await pages.selectOption(id);
    await expect(help.locator(`.help-page[data-page="${id}"]`)).toBeVisible();
    await expectFitsBothWays(page, `Help's ${id}`, [".help-window"]);
  }
});

test("Matches fits", async ({ page }) => {
  await open(page);
  await openRail(page, "Matches");
  await expect(page.locator(".screen-matches")).toBeVisible();
  await expectFitsBothWays(page, "Matches");
});

test("the queue window fits", async ({ page }) => {
  await open(page);
  await openRail(page, "Random Arena");
  await page.locator("#topbar .lobby-find").click();
  await page.locator("#topbar .topbar-queue").click();
  // The Vault is this same window with other lines (#2701).
  await expect(page.locator(".queue-window")).toBeVisible();
  await expectFitsBothWays(page, "the queue window", ["#topbar"]);
});

test("the hosted lobby fits its host, the one who joins it, and its Team Lobby", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2, PIXEL_8A_PORTRAIT);
  const [host, guest] = pages;
  if (host === undefined || guest === undefined) {
    throw new Error("two pages");
  }
  await open(host);
  // The host went past the notice for both: they share one device.
  await guest.goto("./");
  const invite = await hostLobby(host);
  await expectFitsBothWays(host, "the lobby, hosting");
  await joinFriend(guest, invite);
  await expectFitsBothWays(guest, "the lobby, joined");

  await host.getByRole("button", { name: "join team 1" }).click();
  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  await expect(host.locator(".screen-team-lobby")).toBeVisible();
  await expectFitsBothWays(host, "the Team Lobby");
  await context.close();
});

for (const { locale, screen } of [
  { locale: "de-DE", screen: "Options" },
  { locale: "de-DE", screen: "the menu" },
  { locale: "ar", screen: "the menu" },
] as const) {
  test.describe(`in ${locale}`, () => {
    test.use({ locale });

    test(`${screen} fits upright`, async ({ page }) => {
      await open(page);
      if (screen === "Options") {
        await clickTopbarIcon(page, ".topbar-options");
        await expect(page.locator(".options-screen")).toBeVisible();
      }
      await expectFits(
        page,
        `${screen} in ${locale}`,
        screen === "Options" ? [".options-screen"] : SCREENS,
      );
    });
  });
}

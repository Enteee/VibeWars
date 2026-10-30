import { expect, test } from "@playwright/test";

import { startSoloMatch } from "./helpers/peers.js";

/**
 * The Help screen (#1257): the [?] of the top bar and of the HUD opens
 * the player docs over what runs under it, and Esc puts them away.
 */

test("[?] opens Help on Getting started; Esc returns to the menu as it was (#1257)", async ({
  page,
}) => {
  await page.goto("./");
  const name = page.getByRole("textbox", { name: "Your name" });
  await name.fill("Rurik");

  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
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
  // The menu under it is untouched.
  await expect(name).toHaveValue("Rurik");
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
  await expect(page.getByRole("button", { name: "host a lobby" })).toBeVisible();
  await expect(page.getByText("IP address")).toHaveCount(0);

  await page.locator(".topbar-help").click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.locator(".help-page")).toContainText("see your IP address");
});

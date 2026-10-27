import { expect, test, type Page } from "@playwright/test";

import { openPeers } from "./helpers/peers.js";

/**
 * Random Arena (#880, #854): one button, a stranger, a random map. Two
 * pages of one context queue on the BroadcastChannel board, as e2e plays
 * on BroadcastChannel rather than Trystero (#403), and meet in a 1v1, a
 * mode the menu ships.
 */

/** Make a character and choose it: the queue needs one. */
async function makeCharacter(page: Page): Promise<void> {
  await page.goto("./");
  const roster = page.locator(".roster");
  await roster.getByRole("button", { name: "New character" }).click();
  await page.locator("input.editor-name").fill("Pyro");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await roster
    .locator(".selectable-row", { hasText: "Pyro" })
    .locator(".selectable-row-choose")
    .click();
}

/** From the menu, queue for a 1v1 as `name`. */
async function queue1v1(page: Page, name: string): Promise<void> {
  await page.locator(".screen-menu input.field-input").first().fill(name);
  await page.getByRole("button", { name: "1v1", exact: true }).click();
  await page.getByRole("button", { name: "Random Arena", exact: true }).click();
  await expect(page.locator(".screen-queue .screen-title")).toHaveText("Random Arena 1v1 · Pyro");
}

test("Random Arena is greyed out until there is a character to queue with, and 4v4 is the default", async ({
  page,
}) => {
  await page.goto("./");
  const row = page.locator(".menu-random-arena");
  await expect(row.getByRole("button", { name: "Random Arena", exact: true })).toBeDisabled();
  await expect(row).toContainText("Make a character first.");
  await expect(row.getByRole("button", { name: "4v4", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("two players queue for a 1v1, are matched, see the versus splash and play one match", async ({
  browser,
}) => {
  // A group settles for 3 s and its lobby counts down 5 s.
  test.setTimeout(60_000);
  const { context, pages } = await openPeers(browser, 2);
  const [alice, bob] = pages as [Page, Page];

  try {
    await makeCharacter(alice);
    // The second page reads the character the first stored: one context, one storage.
    await bob.goto("./");
    await queue1v1(alice, "Alice");
    await expect(alice.locator(".queue-count")).toHaveText("1 searching · 2 needed");
    await queue1v1(bob, "Bob");

    for (const page of [alice, bob]) {
      await expect(page.locator(".queue-status")).toHaveText("Match found", { timeout: 15_000 });
    }
    const aliceSplash = alice.locator(".versus-splash");
    const bobSplash = bob.locator(".versus-splash");
    await expect(aliceSplash).toBeVisible({ timeout: 25_000 });
    await expect(bobSplash).toBeVisible({ timeout: 25_000 });
    await expect(aliceSplash.locator(".versus-team.is-ours")).toContainText("Alice");
    await expect(aliceSplash.locator(".versus-team.is-theirs")).toContainText("Bob");
    await expect(bobSplash.locator(".versus-team.is-ours")).toContainText("Bob");
    // One lobby, so one planned map.
    const map = (await aliceSplash.locator(".versus-map").textContent()) ?? "";
    expect(map).not.toBe("");
    await expect(bobSplash.locator(".versus-map")).toHaveText(map);

    for (const page of [alice, bob]) {
      await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp", {
        timeout: 15_000,
      });
    }
  } finally {
    await context.close();
  }
});

test("Leave queue from searching goes back to the menu", async ({ page }) => {
  await makeCharacter(page);
  await queue1v1(page, "Alice");
  await expect(page.locator(".queue-status")).toHaveText("Searching");
  await page.getByRole("button", { name: "Leave queue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await expect(page.locator(".screen-queue")).toHaveCount(0);
});

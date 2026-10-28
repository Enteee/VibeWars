import { expect, test, type Page } from "@playwright/test";

import { openPeers } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";
import { key } from "./keys.js";

/**
 * Random Arena (#880, #854): one button, a stranger, a random map. Two
 * pages of one context queue on the BroadcastChannel board, as e2e plays
 * on BroadcastChannel rather than Trystero (#403), and meet in a 1v1, a
 * mode the menu ships.
 */

/**
 * The character the queue needs, with a known bar (#852): a blank new
 * character would be handed a random starter build by the host.
 */
const BUILD = "Elementalist/Mesmer";

/** Make a character and choose it: the queue needs one. */
async function makeCharacter(page: Page): Promise<void> {
  await bringStarter(page, BUILD);
}

/** From the menu, queue for a 1v1 as `name`. */
async function queue1v1(page: Page, name: string): Promise<void> {
  await page.locator(".screen-menu input.field-input").first().fill(name);
  await page.getByRole("button", { name: "1v1", exact: true }).click();
  await page.getByRole("button", { name: "Random Arena", exact: true }).click();
  await expect(page.locator(".screen-queue .screen-title")).toHaveText(
    `Random Arena 1v1 · ${BUILD}`,
  );
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

test("two players queue for a 1v1, are matched, see the versus splash, play it out and queue again", async ({
  browser,
}) => {
  // A group settles for 3 s and its lobby counts down 5 s; the starter
  // build's spells take under a minute to kill a foe who stands still.
  test.setTimeout(150_000);
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

    // The count and the foe's pip (#881).
    await expect(alice.locator(".hud-scoreboard")).toContainText("1 v 1");
    const pip = alice.locator(".hud-enemy-pip");
    await expect(pip).toHaveAttribute("title", "Bob");
    await expect(pip).not.toHaveClass(/is-dead/);

    // Alice beats Bob, who stands still, with the starter build's spells.
    await alice.keyboard.press(key("target-next"));
    await alice.keyboard.press(key("attack"));
    const result = alice.locator(".hud-result");
    await expect(async () => {
      for (const skill of [
        "elementalist.glyph-of-lesser-energy",
        "elementalist.fireball",
        "elementalist.chain-lightning",
        "elementalist.lightning-orb",
      ]) {
        await alice.keyboard.press(starterKey(BUILD, skill));
      }
      await expect(result).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 90_000 });
    await expect(result).toHaveText(/victory/i);
    await expect(bob.locator(".hud-result")).toHaveText(/defeat/i);
    await expect(alice.locator(".hud-scoreboard")).toContainText("1 v 0");
    await expect(pip).toHaveClass(/is-dead/);

    // Four seconds on, the queue screen says how it went.
    await expect(alice.locator(".queue-status")).toHaveText("Victory", { timeout: 10_000 });
    await expect(alice.locator(".queue-streak")).toHaveText(
      "1 win in a row this visit (not a rating)",
    );
    await expect(bob.locator(".queue-status")).toHaveText("Defeat", { timeout: 10_000 });
    await expect(bob.locator(".queue-streak")).toBeHidden();
    await expect(bob.getByRole("button", { name: "Back to menu", exact: true })).toBeVisible();

    await alice.getByRole("button", { name: "Queue again", exact: true }).click();
    await expect(alice.locator(".queue-status")).toHaveText("Searching");
    await expect(alice.locator(".screen-queue .screen-title")).toHaveText(
      `Random Arena 1v1 · ${BUILD}`,
    );
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

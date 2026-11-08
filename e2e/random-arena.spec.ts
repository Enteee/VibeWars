import { expect, test, type Locator, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { openRail } from "./helpers/menu.js";
import { expectTeamSize, expectTeamSizeAtMost, openPeers, setTeamSize } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";
import { bringStarter, starterKey } from "./helpers/starter.js";
import { key } from "./keys.js";

/**
 * Random Arena (#880, #854): one tile, a stranger, a random map. Two
 * pages of one context queue on the BroadcastChannel board, as e2e plays
 * on BroadcastChannel rather than Trystero (#403), and meet in a 1v1, a
 * mode the menu ships.
 */

/**
 * The character the queue needs, with a known bar (#852): a blank new
 * character would be handed a random starter build by the host.
 */
const BUILD = "Elementalist/Mesmer";

/**
 * Make `page`'s ticket keys from `seed`, so its group's map is known.
 * The map follows from the tickets' ids (`formGroups`), and the map
 * decides the mode (#476): a 1v1 drawn onto Ember Pits would play Kill
 * Count, where Bob respawns and one kill wins nothing. Pinning the keys
 * keeps the product free of a test hook. Only 48-byte draws are seeded,
 * which is what @noble/secp256k1 makes a secret key from, each the same
 * whatever drew before it; every other draw stays random. Seeds 1 and 2
 * meet on Long Hall, an Annihilation map; the test checks it, so a
 * change to formation fails here, loudly.
 */
async function seedTicketKeys(page: Page, seed: number): Promise<void> {
  // Source text, as the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await page.addInitScript(`
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (array) => {
      if (!(array instanceof Uint8Array) || array.length !== 48) return random(array);
      for (let i = 0; i < 48; i += 1) array[i] = (${String(seed)} * 97 + i * 13) & 0xff;
      return array;
    };
  `);
}

/** Make a character and choose it: the queue needs one. */
async function makeCharacter(page: Page): Promise<void> {
  await bringStarter(page, BUILD);
}

/** From Random Arena, queue for a 1v1 as `name`: 1v1 in the sidebar, then Ready (#2022). */
async function queue1v1(page: Page, name: string): Promise<void> {
  await namePlayer(page, name);
  await openRail(page, "Random Arena");
  await setTeamSize(page, 1);
  await page.locator("#topbar .screen-ready").click();
  // The queue waits in the background (#2743): the screen stays, the icon says so.
  await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
  await expect(page.locator(".screen-random-arena")).toBeVisible();
}

/** The queue icon's flyout, opened. */
async function queueWindow(page: Page): Promise<Locator> {
  await page.locator("#topbar .topbar-queue").click();
  const flyout = page.locator("#topbar .queue-window");
  await expect(flyout).toBeVisible();
  return flyout;
}

test("Random Arena's Ready is greyed out without a character to queue with, or at 8v8 (#1525, #2022)", async ({
  page,
}) => {
  await page.goto("./");
  const screen = page.locator(".screen-random-arena");
  const ready = page.locator("#topbar .screen-ready");
  const hint = screen.locator(".random-arena-hint");
  // The first start's rolled character (#853) queues; gone, it does not
  // come back, and nothing is left to queue with. The menu cannot delete
  // it (#1147), so the store is emptied under the page. Source text, as
  // the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await expect(ready).toHaveText("Ready");
  await expect(ready).toBeEnabled();
  await expect(hint).toBeHidden();
  // 8v8 is no Random Arena: offered, but not to pick.
  await expectTeamSize(screen, 4);
  await expectTeamSizeAtMost(screen, 4);
  await setTeamSize(page, 2);
  await expect(ready).toBeEnabled();
  await page.evaluate(`
    new Promise((resolve, reject) => {
      const open = indexedDB.open(${JSON.stringify(STORAGE_NAMESPACE)});
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("characters", "readwrite");
        tx.objectStore("characters").clear();
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve(null);
      };
    })
  `);
  await page.reload();
  await expect(screen.locator(".empty-state")).toContainText("No characters yet.");
  await expect(ready).toBeDisabled();
  await expect(ready).toHaveAttribute("title", "Make a character first.");
  await expect(hint).toHaveText("Make a character first.");
  // The size picked survived the reload.
  await expectTeamSize(screen, 2);
});

test("two players queue for a 1v1, are matched, see the versus splash, play it out and queue again", async ({
  browser,
}) => {
  // A group settles for 3 s and its lobby counts down 5 s; the starter
  // build's spells take under a minute to kill a foe who stands still.
  test.setTimeout(150_000);
  const { context, pages } = await openPeers(browser, 2);
  const [alice, bob] = pages as [Page, Page];
  await seedTicketKeys(alice, 1);
  await seedTicketKeys(bob, 2);

  try {
    await makeCharacter(alice);
    // The second page reads the character the first stored: one context, one storage.
    await bob.goto("./");
    await queue1v1(alice, "Alice");
    const flyout = await queueWindow(alice);
    await expect(flyout).toContainText("Random Arena 1v1");
    await expect(flyout).toContainText("1 searching · 2 needed");
    await alice.keyboard.press("Escape");
    await expect(flyout).toBeHidden();
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
    await expect(aliceSplash.locator(".versus-map")).toContainText("Long Hall");
    await expect(bobSplash.locator(".versus-map")).toHaveText(
      (await aliceSplash.locator(".versus-map").textContent()) ?? "",
    );

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
    // Back to the background queue, on Random Arena (#2743).
    await expect(alice.locator("#topbar .topbar-queue")).toBeVisible();
    await expect(alice.locator(".screen-random-arena")).toBeVisible();
    await expect(alice.locator(".screen-queue")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("Random Arena queues in the background: the icon sits left of Help, and Leave Queue ends it (#2743)", async ({
  page,
}) => {
  await makeCharacter(page);
  await queue1v1(page, "Alice");
  // Immediately left of Help.
  await expect(page.locator("#topbar .topbar-queue + .topbar-help")).toHaveCount(1);
  const ready = page.locator("#topbar .screen-ready");
  await expect(ready).toBeDisabled();
  await expect(ready).toHaveAttribute("title", "You are in a queue.");
  // Anywhere a lobby member may go: Character Builder, and back.
  await openRail(page, "Character Builder");
  await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
  await openRail(page, "Random Arena");
  const flyout = await queueWindow(page);
  await flyout.getByRole("button", { name: "Leave Queue", exact: true }).click();
  await expect(flyout).toBeHidden();
  await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await expect(ready).toBeEnabled();
});

test("queued, Team Arena stays browsable: Find a match waits, saying why, until its Leave Queue (#2781)", async ({
  page,
}) => {
  await makeCharacter(page);
  await queue1v1(page, "Alice");
  await openRail(page, "Team Arena");
  const screen = page.locator(".screen-team-arena");
  await expect(screen).toContainText("You are in a queue.");
  const find = page.getByRole("button", { name: "Find a match", exact: true });
  await expect(find).toBeDisabled();
  await expect(find).toHaveAttribute("title", "You are in a queue.");
  // The queue is for the size it has: no mode's size changes under it.
  const size = page.locator(".mode-rail-size");
  await expect(size).toHaveAttribute("title", "Leave the queue to change the team size");
  await expect(size).toContainText("1v1");
  // Its maps, to look at: a list, nothing to pick.
  await expect(screen.locator(".screen-queued-maps li").first()).toBeVisible();
  await expect(screen.locator("select")).toHaveCount(0);

  await screen.getByRole("button", { name: "Leave Queue", exact: true }).click();
  await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
  // Out of it, the player's own lobby opens here, and finds a match.
  await expect(find).toBeEnabled();
  await expect(size).not.toHaveAttribute("title", "Leave the queue to change the team size");
  await expect(size).not.toContainText("1v1");
});

test("deleting the queued character leaves the queue and says why (#2743)", async ({ page }) => {
  await makeCharacter(page);
  await queue1v1(page, "Alice");
  await openRail(page, "Character Builder");
  await page.locator(".character-card").first().getByRole("button", { name: "edit" }).click();
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(
    page.getByText("Your queued character was deleted, so you left the queue"),
  ).toBeVisible();
  await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
});

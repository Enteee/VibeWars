import { expect, test, type Locator, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { openRail } from "./helpers/menu.js";
import { expectTeamSize, expectTeamSizeAtMost, openPeers, setTeamSize } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";
import { bringStarter, starterKey } from "./helpers/starter.js";
import {
  parseReceipt,
  validateReceipt,
  type RankedReceipt,
} from "../packages/ranking/src/index.js";
import { nobleReceiptCrypto } from "../packages/ranking/src/receipt.test-support.js";
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
  await page.locator("#topbar .lobby-find").click();
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
  const ready = page.locator("#topbar .lobby-find");
  const hint = screen.locator(".random-arena-hint");
  // The first start's rolled character (#853) queues; gone, it does not
  // come back, and nothing is left to queue with. The menu cannot delete
  // it (#1147), so the store is emptied under the page. Source text, as
  // the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await expect(ready).toHaveText("Find a match");
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
  // Strangers' 1v1 is ranked: each page needs a key of its own.
  await ownRankedSelf(alice);
  await ownRankedSelf(bob);
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
    await expect(pip).toHaveAttribute("aria-label", "Bob");
    // Its hover label, signet beside the name (#3232).
    await expect(pip.locator(".hud-enemy-label")).toContainText("Bob");
    await expect(pip).not.toHaveClass(/is-dead/);
    const [aliceHud, bobHud] = await aliceBeatsBob(alice, bob);
    expect(aliceHud.result).toMatch(/victory/i);
    expect(bobHud.result).toMatch(/defeat/i);
    expect(aliceHud.scoreboard).toContain("1 v 0");
    expect(aliceHud.pip).toMatch(/\bis-dead\b/);

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

/**
 * Alice beats Bob, who stands still, with the starter build's spells,
 * and what each HUD said as the result showed. The result is up for
 * QUEUED_RESULT_SECONDS only, and a pass of presses can take longer than
 * that on a loaded runner (#3002): each page reads its HUD the frame the
 * result shows, while Alice casts.
 */
async function aliceBeatsBob(alice: Page, bob: Page): Promise<[ResultHud, ResultHud]> {
  await alice.keyboard.press(key("target-next"));
  await alice.keyboard.press(key("attack"));
  const aliceSaw = resultShown(alice);
  const bobSaw = resultShown(bob);
  const fight = { on: true };
  const stop = (): void => {
    fight.on = false;
  };
  aliceSaw.then(stop, stop);
  while (fight.on) {
    for (const skill of [
      "elementalist.glyph-of-lesser-energy",
      "elementalist.fireball",
      "elementalist.chain-lightning",
      "elementalist.lightning-orb",
    ]) {
      await alice.keyboard.press(starterKey(BUILD, skill));
    }
  }
  return Promise.all([aliceSaw, bobSaw]);
}

/**
 * Give `page` a player key of its own (#3680): two pages of one context
 * share localStorage, and so one key, which a ranked match cannot seat
 * twice. The key and its receipt chain live in the tab's sessionStorage.
 * And keep, in `__rankedPosts`, every ranked receipt the page posts.
 */
async function ownRankedSelf(page: Page): Promise<void> {
  // Source text, as the e2e tsconfig has no DOM lib (see builds.spec.ts).
  await page.addInitScript(`
    const own = (key) => key.endsWith(".playerKey") || key.endsWith(".rankedPrev");
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      return this === localStorage && own(key) ? get.call(sessionStorage, key) : get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      return this === localStorage && own(key)
        ? set.call(sessionStorage, key, value)
        : set.call(this, key, value);
    };
    window.__rankedPosts = [];
    const post = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (message) {
      if (this.name.endsWith(":ranked")) window.__rankedPosts.push(message);
      return post.call(this, message);
    };
  `);
}

/** The receipts `page` posted, as their events carry them. */
async function rankedPosts(page: Page): Promise<RankedReceipt[]> {
  const posts = await page.evaluate("window.__rankedPosts");
  expect(Array.isArray(posts)).toBe(true);
  return (posts as string[]).flatMap((post) => {
    const [, , event] = JSON.parse(post) as [string, string, { content: string }];
    const receipt = parseReceipt(event.content);
    return receipt === undefined ? [] : [receipt];
  });
}

test("a ranked 1v1 ends in a receipt both players published, which holds (#3680)", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { context, pages } = await openPeers(browser, 2);
  const [alice, bob] = pages as [Page, Page];
  for (const [page, seed] of [
    [alice, 1],
    [bob, 2],
  ] as const) {
    await ownRankedSelf(page);
    await seedTicketKeys(page, seed);
  }
  try {
    await makeCharacter(alice);
    await bob.goto("./");
    await queue1v1(alice, "Alice");
    // The rules are Help's Ranking page (#3787): no note says them here.
    await expect(alice.locator(".queue-ranked-note")).toHaveCount(0);
    await queue1v1(bob, "Bob");
    for (const page of [alice, bob]) {
      await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp", {
        timeout: 60_000,
      });
    }
    // The leave question says what leaving costs.
    await alice.locator(".hud-leave").getByRole("button", { name: "leave match" }).click();
    await expect(alice.locator(".hud-leave")).toContainText("counts as a loss");
    await alice.locator(".hud-leave").getByRole("button", { name: "no" }).click();

    const [aliceHud] = await aliceBeatsBob(alice, bob);
    expect(aliceHud.result).toMatch(/victory/i);
    for (const page of [alice, bob]) {
      await expect(page.locator(".queue-ranked")).toHaveText(
        "Ranked result published. Your rating updates within the hour.",
        { timeout: 15_000 },
      );
    }
    const [aliceReceipts, bobReceipts] = [await rankedPosts(alice), await rankedPosts(bob)];
    // Each signed one result round, then published the whole receipt, once.
    const whole = (receipts: RankedReceipt[]): RankedReceipt[] =>
      receipts.filter((receipt) => Object.keys(receipt.resultSigs).length === 2);
    expect(whole(aliceReceipts)).toHaveLength(1);
    expect(whole(bobReceipts)).toEqual(whole(aliceReceipts));
    const [receipt] = whole(aliceReceipts);
    if (receipt === undefined) throw new Error("no receipt");
    // The e2e build's stamps are of `VITE_VIBEWARS_WORK_BITS` (#3746), in `playwright.config.ts`.
    const e2eCrypto = { ...nobleReceiptCrypto, workBits: 8 };
    expect(validateReceipt(receipt, e2eCrypto)).toEqual({ ok: true, void: false });
    // The host orders the teams; Alice's is the one that won.
    const teams = receipt.start.teams.map((team) => team.map((seat) => seat.name));
    expect(teams.flat().sort()).toEqual(["Alice", "Bob"]);
    expect(receipt.result.winningTeam).toBe(teams.findIndex((team) => team.includes("Alice")));
  } finally {
    await context.close();
  }
});

/** What a page's HUD said on the frame its match result first showed. */

interface ResultHud {
  readonly result: string;
  readonly scoreboard: string;
  readonly pip: string;
}

/**
 * The HUD the moment `page`'s match result shows, read in the page every
 * 100 ms: the result leaves with the HUD QUEUED_RESULT_SECONDS later
 * (#3002), sooner than a loaded runner may come back to look.
 */
async function resultShown(page: Page): Promise<ResultHud> {
  const shown = await page.waitForFunction(
    () => {
      const result = document.querySelector<HTMLElement>(".hud-result");
      if (result === null || result.style.display === "none") return undefined;
      return {
        result: result.textContent,
        scoreboard: document.querySelector(".hud-scoreboard")?.textContent ?? "",
        pip: document.querySelector(".hud-enemy-pip")?.className ?? "",
      };
    },
    undefined,
    // Bob's page is a background tab, where frames may not come: poll on a timer.
    { timeout: 90_000, polling: 100 },
  );
  const hud = await shown.jsonValue();
  if (hud === undefined) throw new Error("the result showed with no HUD to read");
  return hud;
}

/** Queue seeds 1 and 2, which make Alice the host, into a match, both in the arena. */
async function meetInMatch(alice: Page, bob: Page): Promise<void> {
  await ownRankedSelf(alice);
  await ownRankedSelf(bob);
  await seedTicketKeys(alice, 1);
  await seedTicketKeys(bob, 2);
  await makeCharacter(alice);
  await bob.goto("./");
  await queue1v1(alice, "Alice");
  await queue1v1(bob, "Bob");
  for (const page of [alice, bob]) {
    await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp", {
      timeout: 60_000,
    });
  }
}

async function leaveMatch(page: Page): Promise<void> {
  const leave = page.locator(".hud-leave");
  await leave.getByRole("button", { name: "leave match" }).click();
  await leave.getByRole("button", { name: "yes" }).click();
}

test("#2905: the host leaving a queued match tells the guest the host left", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { context, pages } = await openPeers(browser, 2);
  const [alice, bob] = pages as [Page, Page];
  try {
    await meetInMatch(alice, bob);
    await leaveMatch(alice);
    await expect(bob.getByText("The host left")).toBeVisible();
    await expect(bob.getByText("Lost the connection to the match.")).toHaveCount(0);
    await expect(bob.locator(".hud-leave")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("#2905: a guest leaving a queued match leaves the host playing, with no notice", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { context, pages } = await openPeers(browser, 2);
  const [alice, bob] = pages as [Page, Page];
  try {
    await meetInMatch(alice, bob);
    await leaveMatch(bob);
    await expect(bob.locator(".hud-leave")).toBeHidden();
    await expect(alice.locator(".hud-leave")).toBeVisible();
    await expect(alice.getByText("Lost the connection to the match.")).toHaveCount(0);
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
  const find = page.locator("#topbar .lobby-find");
  await expect(find).toHaveCount(0);
  await expect(page.locator(".lobby-leave-queue")).toHaveCount(0);
  // Anywhere a lobby member may go: Character Builder, and back.
  await openRail(page, "Character Builder");
  await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
  await openRail(page, "Random Arena");
  const flyout = await queueWindow(page);
  await flyout.getByRole("button", { name: "Leave Queue", exact: true }).click();
  await expect(flyout).toBeHidden();
  await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await expect(find).toBeEnabled();
});

test("Find a match stands left of the icons, and the spinner takes its place once queued (#2980)", async ({
  page,
}) => {
  await makeCharacter(page);
  await namePlayer(page, "Alice");
  const icons = page.locator("#topbar .topbar-actions");
  const find = page.locator("#topbar .lobby-find");
  const spinner = page.locator("#topbar .topbar-queue");
  /** Find a match's right edge touches the icons, with only the icons' own gap between. */
  const expectBesideIcons = async (): Promise<void> => {
    await expect(find).toHaveText("Find a match");
    const button = await find.boundingBox();
    const group = await icons.boundingBox();
    expect(button).not.toBeNull();
    expect(group).not.toBeNull();
    if (button !== null && group !== null) {
      expect(group.x - (button.x + button.width)).toBeGreaterThanOrEqual(0);
      expect(group.x - (button.x + button.width)).toBeLessThan(8);
    }
  };
  await openRail(page, "Team Arena");
  await expect(page.locator(".screen-team-arena")).toBeVisible();
  await expectBesideIcons();
  await expect(page.locator(".lobby-leave-queue")).toHaveCount(0);
  await openRail(page, "Random Arena");
  await setTeamSize(page, 1);
  await expectBesideIcons();
  await find.click();
  await expect(find).toHaveCount(0);
  await expect(spinner).toBeVisible();
  const ring = await spinner.boundingBox();
  const group = await icons.boundingBox();
  expect(ring?.x).toBe(group?.x);
  await expect(page.locator(".lobby-leave-queue")).toHaveCount(0);
  // On a phone the other icons fold into the ⋯, the spinner stays out.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#topbar")).toHaveClass(/has-more/);
  await expect(spinner).toBeVisible();
  await expect(page.locator("#topbar .topbar-help")).toBeHidden();
});

test("queued, Team Arena stays browsable with no Find a match, and the flyout's Leave Queue brings it back (#2781, #2980)", async ({
  page,
}) => {
  await makeCharacter(page);
  await queue1v1(page, "Alice");
  await openRail(page, "Team Arena");
  const screen = page.locator(".screen-team-arena");
  await expect(screen).toContainText("You are in a queue.");
  const find = page.getByRole("button", { name: "Find a match", exact: true });
  await expect(find).toHaveCount(0);
  // The queue is for the size it has: no mode's size changes under it.
  const size = page.locator(".mode-rail-size");
  await expect(size).toHaveAttribute("title", "Leave the queue to change the team size");
  await expect(size).toContainText("1v1");
  // Its maps, to look at: a list, nothing to pick.
  await expect(screen.locator(".screen-queued-maps li").first()).toBeVisible();
  await expect(screen.locator("select")).toHaveCount(0);

  const flyout = await queueWindow(page);
  await flyout.getByRole("button", { name: "Leave Queue", exact: true }).click();
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

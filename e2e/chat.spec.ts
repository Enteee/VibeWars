import { expect, test, type Locator, type Page } from "@playwright/test";

import { joinFriend } from "./helpers/menu.js";
import { hostLobby, openPeers, playHouseTeams, startSoloMatch } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";
import { bringStarter } from "./helpers/starter.js";

/**
 * Chat (#479): Enter opens the box, Enter sends, and the lobby host
 * routes each line. Two pages of one context, over BroadcastChannel.
 */

async function openMenu(page: Page, playerName: string): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await namePlayer(page, playerName);
}

/** Press Enter where nothing has a use for it, type `text`, and send it. */
async function say(page: Page, text: string): Promise<void> {
  await page.locator("body").press("Enter");
  await expect(page.getByRole("textbox", { name: "chat message" })).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("all chat reaches both teams, team chat only its own, as text (#479)", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  await openMenu(host, "Ann");
  const code = await hostLobby(host);
  await openMenu(guest, "Bob");
  await joinFriend(guest, code);
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: "join team 2" }).click();

  // In the lobby, all chat is the default.
  await say(host, "glhf <b>everyone</b>");
  const guestLog = guest.getByRole("log");
  await expect(guestLog).toContainText("Ann: glhf <b>everyone</b>");
  await expect(guestLog.locator("b")).toHaveCount(0);

  await host.getByRole("button", { name: "Ready", exact: true }).click();
  await guest.getByRole("button", { name: "Ready", exact: true }).click();
  await host.getByRole("button", { name: "start match" }).click();
  // Any characters will do: both sides play the house team (#1525).
  await playHouseTeams([host, guest]);

  // In a match, team chat is the default; `!` says it to all.
  await say(host, "spike their monk");
  await say(host, "!gg");
  await expect(host.getByRole("log")).toContainText("[Team] Ann: spike their monk");
  await expect(guestLog).toContainText("[All] Ann: gg");
  await expect(guestLog).not.toContainText("spike their monk");
  await context.close();
});

test("keys typed into chat never cast or move (#479)", async ({ page }) => {
  // A known bar (#852): slot 5 of Avatar of Balthazar is Rending Aura.
  await bringStarter(page, "Avatar of Balthazar (D)");
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" }).getByRole("listitem");
  const energy = page.locator(".hud-bar-energy .hud-bar-label");
  await expect(effects).toHaveCount(0);
  // Full, whatever Energy Storage made the maximum.
  const full = /^(\d+) \/ \1\b/;
  await expect(energy).toHaveText(full);
  // Q W E R A S D F are the skill keys; A casts slot 5, Rending Aura,
  // a self-cast enchantment that costs energy as it starts.
  await say(page, "aaaa wasd qwer f");
  await expect(page.getByRole("log")).toContainText("aaaa wasd qwer f");
  // Past the round trip: a leaked key would have spent energy and put
  // the enchantment on.
  await page.waitForTimeout(1500);
  await expect(energy).toHaveText(full);
  await expect(effects).toHaveCount(0);
});

test("in a match a click under the panel walks, and the box shows only while open (#479)", async ({
  page,
}) => {
  await page.goto("./");
  await startSoloMatch(page);
  const box = page.getByRole("textbox", { name: "chat message" });
  await expect(box).toBeHidden();
  await say(page, "rush mid");
  await expect(box).toBeHidden();
  const log = page.getByRole("log");
  await expect(log).toContainText("rush mid");

  // The middle of the panel's lines, where a click used to stop.
  const panel = await log.boundingBox();
  if (panel === null) {
    throw new Error("the chat log has no box");
  }
  const at = { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, at)).toBe(
    "CANVAS",
  );
  // The follow camera (#721) moves only when the hero does. Ember Pits'
  // first spawn sits near the west edge, so the ground under the panel is
  // outside the arena: walk east along the open spawn row first, and settle.
  const stage = page.locator("#viewport");
  const canvas = page.locator("#viewport canvas:not(.compass)");
  const view = await canvas.boundingBox();
  if (view === null) {
    throw new Error("the arena canvas has no box");
  }
  const atSpawn = (await stage.getAttribute("data-camera")) ?? "";
  await page.mouse.click(view.x + view.width * 0.85, view.y + view.height / 2);
  let last = "";
  await expect
    .poll(
      async () => {
        const now = (await stage.getAttribute("data-camera")) ?? "";
        const settled = now === last && now !== atSpawn;
        last = now;
        return settled;
      },
      { message: "the hero should walk east and stop", intervals: [500], timeout: 15_000 },
    )
    .toBe(true);
  const before = await stage.getAttribute("data-camera");
  await page.mouse.click(at.x, at.y);
  await expect(stage).not.toHaveAttribute("data-camera", before ?? "");
});

test("in the lobby the closed chat is its lines, clicks go through it, and its icon opens it (#2018)", async ({
  page,
}) => {
  await openMenu(page, "Ann");
  await hostLobby(page);
  await page.getByRole("button", { name: "join team 1" }).click();
  // Until the lobby re-renders, the clicked button keeps focus and takes the Enter.
  await expect(page.getByRole("button", { name: "leave team 1" })).toBeVisible();
  const box = page.getByRole("textbox", { name: "chat message" });
  await expect(box).toBeHidden();
  await say(page, "anyone up for a 2v2");
  await expect(box).toBeHidden();
  const log = page.getByRole("log");
  await expect(log).toContainText("anyone up for a 2v2");

  // What is under the middle of the lines takes the click, not the chat.
  const panel = await log.boundingBox();
  if (panel === null) {
    throw new Error("the chat log has no box");
  }
  const under = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest(".chat") === null,
    { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 },
  );
  expect(under).toBe(true);

  const icon = page.getByRole("button", { name: "Chat (Enter)" });
  await icon.click();
  await expect(box).toBeVisible();
  await expect(box).toBeFocused();
  await icon.click();
  await expect(box).toBeHidden();
});

test("in a match the chat sits bottom-left beside the skill bar, above the HUD when narrow (#2390)", async ({
  page,
}) => {
  await page.goto("./");
  await startSoloMatch(page);
  await say(page, "rush mid");
  const chat = page.locator("#viewport > .chat");
  const column = page.locator(".hud-column");
  /** A box, or a failure naming what has none. */
  const box = async (locator: Locator, what: string) => {
    const found = await locator.boundingBox();
    if (found === null) {
      throw new Error(`${what} has no box`);
    }
    return found;
  };
  const rem = 16;
  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("#viewport")).not.toHaveClass(/is-chat-above-hud/);
    // The measure reruns on a resize observer: retry until it has.
    await expect(async () => {
      const panel = await box(chat, "the chat");
      const skills = await box(column, "the HUD's column");
      expect(height - (panel.y + panel.height), `${String(width)} px: off the bottom`).toBeLessThan(
        rem,
      );
      // Left of the column: no overlap with the skill bar or the bars.
      expect(panel.x + panel.width, `${String(width)} px: clear of the skill bar`).toBeLessThan(
        skills.x,
      );
      // Nor with the weapon sets hanging off the skill bar's left end.
      const sets = await box(page.locator(".weapon-sets"), "the weapon sets");
      expect(panel.x + panel.width, `${String(width)} px: clear of the weapon sets`).toBeLessThan(
        sets.x,
      );
    }).toPass();
  }
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(page.locator("#viewport")).toHaveClass(/is-chat-above-hud/);
  await expect(async () => {
    const panel = await box(chat, "the chat");
    const hud = await box(page.locator(".hud"), "the HUD");
    expect(panel.y + panel.height).toBeLessThanOrEqual(hud.y);
  }).toPass();
});

test("muting a sender says so with their signet beside their name (#3232)", async ({ browser }) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  await openMenu(host, "Ann");
  const code = await hostLobby(host);
  await openMenu(guest, "Bob");
  await joinFriend(guest, code);
  await host.getByRole("button", { name: "join team 1" }).click();
  await guest.getByRole("button", { name: "join team 2" }).click();

  await say(host, "hi");
  const log = guest.getByRole("log");
  const line = log.locator(".chat-line", { hasText: "Ann: hi" });
  await expect(line).toBeVisible();
  const ann = await line.locator("img.signet").getAttribute("src");
  expect(ann).toBeTruthy();
  // Open, a name mutes; their lines go, and the notice names them.
  await guest.locator("body").press("Enter");
  await line.locator(".chat-line-name").click();
  const notice = log.locator(".chat-notice");
  await expect(notice).toContainText("Ann");
  const signet = notice.locator("img.signet");
  await expect(signet).toBeVisible();
  await expect(signet).toHaveAttribute("src", ann ?? "");
  await context.close();
});

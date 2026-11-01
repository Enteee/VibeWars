import { expect, test, type Page } from "@playwright/test";

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
  // A known bar (#852): slot 5 of Elementalist/Mesmer is Armor of Earth.
  await bringStarter(page, "Elementalist/Mesmer");
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" }).getByRole("listitem");
  const energy = page.locator(".hud-bar-energy .hud-bar-label");
  await expect(effects).toHaveCount(0);
  // Full, whatever Energy Storage made the maximum.
  const full = /^(\d+) \/ \1\b/;
  await expect(energy).toHaveText(full);
  // Q W E R A S D F are the skill keys; A casts slot 5, Armor of Earth,
  // a self-cast enchantment (#302) that costs energy as it starts.
  await say(page, "aaaa wasd qwer f");
  await expect(page.getByRole("log")).toContainText("aaaa wasd qwer f");
  // Past its 0.75 s activation and the round trip: a leaked key would
  // have spent energy, then put the enchantment on.
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
  // The follow camera (#721) moves only when the hero does.
  const stage = page.locator("#viewport");
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

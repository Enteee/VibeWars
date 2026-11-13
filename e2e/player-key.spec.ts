import { expect, test, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { joinFriend } from "./helpers/menu.js";
import { hostLobby, openPeers } from "./helpers/peers.js";
import { namePlayer } from "./helpers/player.js";

/** Everything a page let out: the URLs it asked for, its WebSocket frames and its console. */
function listen(page: Page, out: string[]): void {
  page.on("request", (request) => out.push(request.url()));
  page.on("console", (message) => out.push(message.text()));
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => out.push(String(payload)));
  });
}

/** The menu, as `name`. */
async function openMenu(page: Page, name: string): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "VibeWars" })).toBeVisible();
  await namePlayer(page, name);
}

/** The secret's hex as stored, and the other ways a slip could write it. */
function encodings(hex: string): string[] {
  const bytes = Buffer.from(hex, "hex");
  return [hex, hex.toUpperCase(), bytes.toString("base64"), bytes.toString("base64url")];
}

test("the player key's secret is in no page, link, frame or console line through a lobby (#3227)", async ({
  browser,
}) => {
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  const out: string[] = [];
  listen(host, out);
  listen(guest, out);
  try {
    await openMenu(host, "Host");
    const invite = await hostLobby(host);
    await openMenu(guest, "Guest");
    await joinFriend(guest, invite);
    await expect(host.locator(".lobby-panel")).toContainText("Guest");
    await expect(guest.locator(".lobby-panel")).toContainText("Host");

    // One context, one localStorage: the two pages hold the same key.
    const secret = await host.evaluate(
      (name) => localStorage.getItem(name),
      `${STORAGE_NAMESPACE}.playerKey`,
    );
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const seen = [invite, ...out];
    for (const page of pages) {
      seen.push(await page.content(), await page.locator("body").innerText());
    }
    for (const text of seen) {
      for (const encoded of encodings(secret ?? "")) {
        expect(text).not.toContain(encoded);
      }
    }
  } finally {
    await context.close();
  }
});

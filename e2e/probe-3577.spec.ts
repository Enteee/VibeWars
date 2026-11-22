import { schnorr } from "@noble/secp256k1";
import { expect, test } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { awaitLobby, openRail } from "./helpers/menu.js";
import { namePlayer } from "./helpers/player.js";

const SECRET = "07".repeat(32);
const PUBKEY = Buffer.from(schnorr.getPublicKey(Buffer.from(SECRET, "hex"))).toString("hex");

test("probe 3577 looks", async ({ page }) => {
  await page.route("**/ranking/leaderboard.json", (route) =>
    route.fulfill({
      json: {
        asOf: Math.floor(Date.now() / 1000),
        entries: [
          { pubkey: PUBKEY, rank: 1, name: "Ann", rating: 1800, conservative: 1700, matches: 60,
            provisional: false, wins: 50, streak: 5 },
        ],
      },
    }),
  );
  await page.addInitScript(
    ([ns, secret]) => {
      if (localStorage.getItem(`${ns}.playerKey`) === null) {
        localStorage.setItem(`${ns}.playerKey`, secret);
        localStorage.setItem(
          `${ns}.cosmetics`,
          JSON.stringify({
            choice: { frame: "frame-rose", title: "title-veteran", flame: "flame-streak" },
            facts: null,
          }),
        );
      }
    },
    [STORAGE_NAMESPACE, SECRET] as const,
  );
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("./");
  await namePlayer(page, "Annabelle");
  await openRail(page, "Hosted Game");
  await awaitLobby(page);
  await page.getByRole("button", { name: "Join team 1" }).click();
  const row = page.locator(".lobby-slot").first();
  await expect(row.locator(".cosmetic-title")).toBeVisible();
  await row.screenshot({ path: ".scratch-3577/lobby-row.png" });
  await row.locator(".cosmetic-flame").screenshot({ path: ".scratch-3577/flame.png" });
});

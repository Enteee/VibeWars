import { expect, test, type Locator } from "@playwright/test";

import { NEW_VERSION_NOTICE, NEW_VERSION_WAITING } from "../apps/web/src/build-check.js";
import { hostLobby, startSoloMatch } from "./helpers/peers.js";

/**
 * A newer deployed build (#1268). The e2e build serves its own id, so
 * only here, where `build.json` is swapped, does a page see a newer one.
 * Nothing waits for the reload itself: the menu is left long before the
 * countdown ends.
 */

test("the menu counts down to a reload; a match only says it is waiting", async ({ page }) => {
  await page.route("**/build.json", (route) => route.fulfill({ json: { build: "newer" } }));
  await page.goto("./");

  const banner = page.locator(".build-banner");
  await expect(banner).toContainText(/Reloading in \d+ s\./);

  await startSoloMatch(page);
  await expect(banner).toHaveText(new RegExp(`^${NEW_VERSION_WAITING}`));
  await expect(banner).not.toContainText("Reloading in");
});

test("a match chunk the deploy removed says a new version is out, not a lost connection", async ({
  page,
}) => {
  // What Pages answers for a chunk `rsync --delete` took away.
  await page.route(/\/assets\/arena-scene-[^/]*\.js$/, (route) =>
    route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><h1>404</h1>" }),
  );
  await page.goto("./");

  await hostLobby(page);
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // The Team Lobby (#1460): the house team, its one seat. The match's
  // chunk is fetched once the seats are taken.
  await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
  await page.locator(".team-lobby-seat").first().click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();

  // Back on the lobby, which says why.
  await expect(page.locator(".screen-problem")).toHaveText(NEW_VERSION_NOTICE);
  await expect(page.getByText("Lost the connection to the match.")).toHaveCount(0);
});

test("on a phone the banner makes room: nothing at the top hides under it, its buttons wrap (#1283)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/build.json", (route) => route.fulfill({ json: { build: "newer" } }));
  await page.goto("./");

  const banner = page.locator(".build-banner");
  await expect(banner).toBeVisible();
  /** `selector` starts at or below the bottom edge of `over`, the banner unless said. */
  const below = async (selector: string, over: Locator = banner): Promise<void> => {
    await expect(async () => {
      const top = await over.boundingBox();
      const under = await page.locator(selector).boundingBox();
      expect(top).not.toBeNull();
      expect(under).not.toBeNull();
      if (top !== null && under !== null) {
        expect(under.y).toBeGreaterThanOrEqual(top.y + top.height - 1);
      }
    }).toPass();
  };
  await below("#topbar");
  // The text on its own row, both buttons on the next.
  const text = await banner.locator(".build-banner-text").boundingBox();
  const reload = await banner.getByRole("button", { name: "Reload now" }).boundingBox();
  const notNow = await banner.getByRole("button", { name: "Not now" }).boundingBox();
  expect(reload?.y).toBe(notNow?.y);
  expect(reload?.y ?? 0).toBeGreaterThanOrEqual((text?.y ?? 0) + (text?.height ?? 0));

  await startSoloMatch(page);
  await below(".hud-top");
  await below(".hud-controls");
  // The compass sits under the match buttons, so it moves down with them.
  await below(".compass", page.locator(".hud-controls"));
  // So does the ♪ jukebox, which opens under them.
  await page.locator(".hud-music").click();
  await below(".hud-jukebox", page.locator(".hud-controls"));
  await page.locator(".hud-music").click();
  await expect(page.locator(".hud-jukebox")).toHaveCount(0);

  await banner.getByRole("button", { name: "Not now" }).click();
  await expect(banner).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue("--build-banner-space")),
    )
    .toBe("0px");
});

import { expect, test } from "@playwright/test";

import { NEW_VERSION_NOTICE, NEW_VERSION_WAITING } from "../apps/web/src/build-check.js";
import { startSoloMatch } from "./helpers/peers.js";

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

  await page.getByRole("button", { name: "host a lobby" }).click();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();

  // Back on the lobby, which says why.
  await expect(page.locator(".screen-problem")).toHaveText(NEW_VERSION_NOTICE);
  await expect(page.getByText("Lost the connection to the match.")).toHaveCount(0);
});

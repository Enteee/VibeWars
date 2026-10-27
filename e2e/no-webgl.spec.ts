import { expect, test } from "@playwright/test";

import { NO_WEBGL_NOTICE } from "../apps/web/src/ui/arena-notice.js";
import { startSoloMatch } from "./helpers/peers.js";

/**
 * A browser with no WebGL (#655): a blocklisted GPU in a recent Chromium
 * no longer falls back to software. Where the arena would be, the player
 * reads why it isn't, in the editor and in a match.
 */

test.beforeEach(async ({ page }) => {
  // What such a browser does: every WebGL context request returns null.
  await page.addInitScript(`
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      return kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl"
        ? null
        : getContext.call(this, kind, ...rest);
    };
  `);
});

test("the editor says the Training Ground needs WebGL, and keeps saying it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();

  const notice = page.locator(".editor-layout .training .arena-notice");
  await expect(notice).toHaveText(NO_WEBGL_NOTICE);
  // An edit re-renders the editor; the notice must survive it.
  await page.locator(".editor-attribute .attribute-pip").first().click();
  await expect(notice).toHaveText(NO_WEBGL_NOTICE);
  await expect(page.locator(".training-stage")).toHaveCount(0);
});

test("a match with no WebGL says so where the arena would be, and the HUD runs", async ({
  page,
}) => {
  await page.goto("./");
  // The helper waits for the health bar to read "hp": the HUD is fed.
  await startSoloMatch(page);

  await expect(page.locator("#viewport > .arena-notice")).toHaveText(NO_WEBGL_NOTICE);
  await expect(page.locator("#viewport canvas:not(.compass)")).toHaveCount(0);
});

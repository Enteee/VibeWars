import { expect, test, type Page } from "@playwright/test";

import { openRail, type RailLabel } from "./helpers/menu.js";
import { scrollToEnd } from "./helpers/overlay.js";
import { PIXEL_8A_PORTRAIT, TOUCH_TARGET } from "./helpers/phone.js";

/**
 * What floats over a phone's menu (#3934), outside `#screens`: the closed
 * chat's icon, bottom left, and the now-playing toast. The icon is a
 * finger's size on every screen and no screen's end stays under it; the
 * toast shows at the top, under the top bar, clear of the icon.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A Rail screen's editor, opened by its New button. */
const EDITORS = [
  ["Character Builder", "New character", ".editor-layout"],
  ["Team Builder", "New team build", ".team-editor"],
] as const satisfies readonly (readonly [RailLabel, string, string])[];

/** Its box every frame the toast shows, from now on. */
async function noteToast(page: Page): Promise<void> {
  await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    if (toast === null) {
      throw new Error("no now-playing toast");
    }
    const note = (): void => {
      if (!toast.hidden) {
        Object.assign(window, { toastBox: toast.getBoundingClientRect().toJSON() as unknown });
      }
      requestAnimationFrame(note);
    };
    note();
  });
}

for (const [phone, device] of [
  ["a Pixel 8a", PIXEL_8A_PORTRAIT],
  ["a 360 px phone", { ...PIXEL_8A_PORTRAIT, viewport: { width: 360, height: 800 } }],
] as const) {
  test.describe(`on ${phone}`, () => {
    test.use(device);

    for (const [label, button, editor] of EDITORS) {
      test(`the ${label}'s chat icon is a finger's size, its end scrolls clear of it and the toast shows at the top (#3934)`, async ({
        page,
      }) => {
        await page.goto("./");
        await expect(page.locator(".mode-rail")).toBeVisible();
        await noteToast(page);
        // The tap on the rail starts the music; its toast is up a few seconds.
        await openRail(page, label);
        await page.getByRole("button", { name: button, exact: true }).tap();
        await expect(page.locator(editor)).toBeVisible();

        const icon = await page.locator(".chat-toggle").boundingBox();
        expect(icon).not.toBeNull();
        if (icon === null) return;
        expect(icon.width).toBeGreaterThanOrEqual(TOUCH_TARGET);
        expect(icon.height).toBeGreaterThanOrEqual(TOUCH_TARGET);

        const toastBox = (): Promise<Box | null> =>
          page.evaluate(() => (window as { toastBox?: Box }).toastBox ?? null);
        await expect.poll(toastBox, { timeout: 5_000 }).not.toBeNull();
        const toast = await toastBox();
        const bar = await page.locator("#topbar").boundingBox();
        const viewport = device.viewport;
        if (toast !== null && bar !== null) {
          expect(toast.y).toBeGreaterThanOrEqual(bar.y + bar.height);
          expect(toast.y + toast.height).toBeLessThanOrEqual(viewport.height / 4);
          expect(toast.x).toBeGreaterThan(0);
          expect(toast.x + toast.width).toBeLessThan(viewport.width);
          expect(overlaps(toast, icon), "the toast covers the chat's icon").toBe(false);
        }

        // Scrolled to its end, the editor ends above the icon: its last
        // row, wherever it sits across the screen, is clear of it.
        await scrollToEnd(page, editor);
        const end = await page.locator(editor).boundingBox();
        expect(end).not.toBeNull();
        if (end !== null) {
          expect(overlaps(end, icon), `the ${label}'s end is under the chat's icon`).toBe(false);
        }
      });
    }
  });
}

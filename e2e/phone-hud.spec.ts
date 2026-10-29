import { expect, test, type Page } from "@playwright/test";

import { key } from "./keys.js";

/**
 * A 390x844 phone in a match (#1297): the HUD's top band is narrower than
 * the scoreboard and target frame beside the match buttons, so on a phone
 * they lay out apart. Every box here must miss every other.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PARTS = [
  ".hud-scoreboard",
  ".hud-target",
  ".hud-leave",
  ".hud-mute",
  ".hud-options",
  ".compass",
] as const;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A match against a bot from the menu on show, the bot targeted, the toast
 * noted; on `map` when given, else the lobby's default.
 */
async function phoneMatch(page: Page, map?: string): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  // The toast hides after a few seconds: note where it is, every frame it
  // shows in the match, as music.spec.ts does (#372).
  await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    const screens = document.querySelector<HTMLElement>("#screens");
    if (toast === null || screens === null) {
      throw new Error("no now-playing toast or #screens");
    }
    const note = (): void => {
      if (!toast.hidden && screens.style.display === "none") {
        Object.assign(window, { toastBox: toast.getBoundingClientRect().toJSON() as unknown });
      }
      requestAnimationFrame(note);
    };
    note();
  });
  await page.getByRole("button", { name: "host a lobby" }).click();
  if (map !== undefined) {
    await page.locator(".lobby-map select").selectOption(map);
  }
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "add a bot to team 2" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  await page.keyboard.press(key("target-closest"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
}

async function expectApart(page: Page): Promise<void> {
  const boxes = new Map<string, Box>();
  for (const part of PARTS) {
    const found = await page.locator(part).boundingBox();
    expect(found, part).not.toBeNull();
    if (found !== null) {
      boxes.set(part, found);
    }
  }
  const toastBox = (): Promise<Box | null> =>
    page.evaluate(() => (window as { toastBox?: Box }).toastBox ?? null);
  await expect.poll(toastBox, { timeout: 5_000 }).not.toBeNull();
  const toast = await toastBox();
  if (toast !== null) {
    boxes.set(".now-playing", toast);
  }
  const named = [...boxes];
  for (const [i, [name, box]] of named.entries()) {
    for (const [other, otherBox] of named.slice(i + 1)) {
      expect(overlaps(box, otherBox), `${name} overlaps ${other}`).toBe(false);
    }
  }
}

test("on a 390x844 phone the match HUD's top boxes do not overlap (#1297)", async ({ page }) => {
  await phoneMatch(page);
  await expectApart(page);
  // "leave" alone on a phone, but still named in full.
  await expect(page.getByRole("button", { name: "leave match (F10)" })).toBeVisible();
});

test("on a 390x844 phone with the new-version banner up, they still do not (#1297)", async ({
  page,
}) => {
  await page.route("**/build.json", (route) => route.fulfill({ json: { build: "newer" } }));
  await phoneMatch(page);
  await expect(page.locator(".build-banner")).toBeVisible();
  await expectApart(page);
});

test("on a 390x844 phone a Guild Battle's long scoreboard wraps clear of them too (#1226)", async ({
  page,
}) => {
  await phoneMatch(page, "guild-hall-isle");
  await expect(page.locator(".hud-scoreboard")).toContainText("Lord");
  await expectApart(page);
});

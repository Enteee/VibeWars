import { expect, test, type Page } from "@playwright/test";

import { key } from "./keys.js";

/**
 * A phone in a match (#1297, #1306): the HUD's top band is narrower than
 * the scoreboard and target frame beside the match buttons, so on a phone
 * they lay out apart. Every box here must miss every other, at 390x844 and
 * at 360x740.
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
  ".hud-help",
  ".hud-options",
  ".hud-fullscreen",
  ".hud-music",
  ".compass",
] as const;

/** The phones the HUD must fit. */
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
] as const;

type Phone = (typeof PHONES)[number];

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A match against a bot from the menu on show, the bot targeted, the toast noted. */
async function phoneMatch(page: Page, phone: Phone): Promise<void> {
  await page.setViewportSize(phone);
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
    // Fullscreen shows only where the browser offers it.
    if (!(await page.locator(part).isVisible())) {
      expect(part, "only fullscreen may be missing").toBe(".hud-fullscreen");
      continue;
    }
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

for (const phone of PHONES) {
  const size = `${String(phone.width)}x${String(phone.height)}`;

  test(`on a ${size} phone the match HUD's top boxes do not overlap (#1297, #1306)`, async ({
    page,
  }) => {
    await phoneMatch(page, phone);
    await expectApart(page);
    // "leave" alone on a phone, but still named in full.
    await expect(page.getByRole("button", { name: "leave match (F10)" })).toBeVisible();
  });

  test(`on a ${size} phone with the new-version banner up, they still do not (#1297, #1306)`, async ({
    page,
  }) => {
    await page.route("**/build.json", (route) => route.fulfill({ json: { build: "newer" } }));
    await phoneMatch(page, phone);
    await expect(page.locator(".build-banner")).toBeVisible();
    await expectApart(page);
  });
}

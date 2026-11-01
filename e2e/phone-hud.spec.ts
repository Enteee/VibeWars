import { expect, test, type Page } from "@playwright/test";

import { key } from "./keys.js";
import { hostLobby, playHouseTeams } from "./helpers/peers.js";

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

/** Every box of one frame: the toast's and each part's, null where hidden. */
type Frame = Record<string, Box | null>;

/**
 * A match against a bot from the menu on show, the bot targeted, the HUD
 * noted; on `map` when given, else the lobby's default.
 */
async function phoneMatch(page: Page, phone: Phone, map?: string): Promise<void> {
  await page.setViewportSize(phone);
  await page.goto("./");
  // The toast hides after a few seconds: note where it is, every frame it
  // shows in the match, as music.spec.ts does (#372). Every other part is
  // noted in that same frame (#1793): the build banner still grows early
  // in a match, so boxes read in different frames come from different
  // layouts.
  await page.evaluate((parts) => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    const screens = document.querySelector<HTMLElement>("#screens");
    if (toast === null || screens === null) {
      throw new Error("no now-playing toast or #screens");
    }
    /** Its box, or null where it is not shown, as Playwright's `isVisible` judges. */
    const boxOf = (element: Element | null): DOMRectReadOnly | null => {
      if (element === null || getComputedStyle(element).visibility === "hidden") {
        return null;
      }
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? box : null;
    };
    const note = (): void => {
      if (!toast.hidden && screens.style.display === "none") {
        const frame: Record<string, unknown> = {
          ".now-playing": toast.getBoundingClientRect().toJSON() as unknown,
        };
        for (const part of parts) {
          frame[part] = boxOf(document.querySelector(part))?.toJSON() ?? null;
        }
        // Only once the bot is targeted, which also means the HUD is up.
        const target = document.querySelector(".hud-target-text")?.textContent ?? "";
        if (target !== "" && target !== "no target") {
          Object.assign(window, { hudFrame: frame });
        }
      }
      requestAnimationFrame(note);
    };
    note();
  }, PARTS);
  await hostLobby(page);
  if (map !== undefined) {
    await page.locator(".lobby-map select").selectOption(map);
  }
  // Team 2's empty side plays a house team of one bot (#2029).
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // Any character will do: the house team's one seat (#1525).
  await playHouseTeams([page]);
  await page.keyboard.press(key("target-closest"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
}

/** The last frame noted with the toast up and a target: every box in it misses every other. */
async function expectApart(page: Page): Promise<void> {
  const hudFrame = (): Promise<Frame | null> =>
    page.evaluate(() => (window as { hudFrame?: Frame }).hudFrame ?? null);
  await expect.poll(hudFrame, { timeout: 5_000 }).not.toBeNull();
  const frame = (await hudFrame()) ?? {};
  const boxes = new Map<string, Box>();
  for (const [part, box] of Object.entries(frame)) {
    // Fullscreen shows only where the browser offers it.
    if (box === null) {
      expect(part, "only fullscreen may be missing").toBe(".hud-fullscreen");
      continue;
    }
    boxes.set(part, box);
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

  test(`on a ${size} phone a Guild Battle's long scoreboard wraps clear of them too (#1226)`, async ({
    page,
  }) => {
    await phoneMatch(page, phone, "guild-hall-isle");
    await expect(page.locator(".hud-scoreboard")).toContainText("Lord");
    await expectApart(page);
  });
}

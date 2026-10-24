import { expect, test, type Page } from "@playwright/test";

/**
 * Combat sounds and the mute button (#112).
 *
 * What only a browser can tell: that a real cast reaches Web Audio, that
 * muting stops it, and that the choice survives a reload. Sounds are
 * counted where they leave the game, at `AudioBufferSourceNode.start`,
 * rather than through a test hook the real client does not run.
 */

declare global {
  interface Window {
    soundStarts: number;
  }
}

async function countSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.soundStarts = 0;
    window.AudioContext = class extends AudioContext {
      override createBufferSource(): AudioBufferSourceNode {
        const node = super.createBufferSource();
        const start = node.start.bind(node);
        node.start = (...args: Parameters<AudioBufferSourceNode["start"]>): void => {
          window.soundStarts += 1;
          start(...args);
        };
        return node;
      }
    };
  });
}

async function startQuickMatch(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "quick match" }).click();
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
}

const starts = (page: Page): Promise<number> => page.evaluate(() => window.soundStarts);

test("a cast plays a sound, and muting with M silences the next one", async ({ page }) => {
  await countSounds(page);
  await startQuickMatch(page);
  const mute = page.getByRole("button", { name: "Mute (M)" });
  await expect(mute).toHaveAttribute("aria-pressed", "false");

  // Slot 5 is a self-cast enchantment: it needs no target.
  await page.keyboard.press("5");
  await expect(page.locator(".hud-statuses")).not.toContainText("no active effects");
  await expect.poll(() => starts(page)).toBeGreaterThan(0);

  await page.keyboard.press("m");
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  const before = await starts(page);
  // Still recharging, so refused: that would play "refused" if unmuted.
  await page.keyboard.press("5");
  await expect(page.locator(".hud-message")).toHaveText("That skill is recharging.");
  await page.waitForTimeout(300);
  expect(await starts(page)).toBe(before);
});

test("the mute button toggles, shows the state, and is remembered", async ({ page }) => {
  await startQuickMatch(page);
  const mute = page.getByRole("button", { name: "Mute (M)" });
  await expect(mute.locator("img")).toHaveAttribute("src", /sound-on\.svg$/);

  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(mute.locator("img")).toHaveAttribute("src", /sound-off\.svg$/);

  await startQuickMatch(page);
  await expect(page.getByRole("button", { name: "Mute (M)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // One button per match: leaving and coming back must not stack them.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "quick match" }).click();
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  await expect(page.locator(".hud-mute")).toHaveCount(1);
  await expect(page.locator(".hud-scoreboard")).toHaveCount(1);
});

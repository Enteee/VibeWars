import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1000, height: 640 } });

for (const [station, kind, file, clip] of [
  [11, "sleeper", "docs/art/3791-sleeping-guard.png", { x: 340, y: 180, width: 320, height: 220 }],
  [14, "mist-gate", "docs/art/3791-mist-gate.png", { x: 380, y: 160, width: 300, height: 240 }],
] as const) {
  test(`probe ${kind}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`./?menu-background=bench-flat&tutorial-station=${station}`);
    await expect(page.locator(".tutorial-frame")).toHaveCount(1, { timeout: 30_000 });
    await page.evaluate((k) => Reflect.set(window, "__look", k), kind);
    await page.addStyleTag({ content: ".tutorial-frame, .party-dock, .party-window, .compass, .hud-controls { visibility: hidden !important; }" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: file, clip });
  });
}

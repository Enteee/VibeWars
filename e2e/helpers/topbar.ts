import { expect, type Page } from "@playwright/test";

/**
 * The top bar's layout checks at one window width (#1334, #1368): the
 * page never scrolls sideways, the Help and fullscreen icons (the ⋯ that
 * holds them, on a phone) are inside the window, and no two of `parts`
 * overlap.
 *
 * `parts` names the status's parts, not its box: the box shrinks while
 * what is inside it spills over the buttons and the icons.
 */
export async function expectTopbarFits(page: Page, width: number, parts: string): Promise<void> {
  await page.setViewportSize({ width, height: 700 });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, `no sideways scroll at ${String(width)} px`).toBe(true);
  // At 720 px and under, the icons fold into the ⋯, which takes their place.
  for (const icon of width <= 720 ? [".topbar-more"] : [".topbar-help", ".topbar-fullscreen"]) {
    const box = await page.locator(icon).boundingBox();
    expect(box, `${icon} shows at ${String(width)} px`).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
  const overlaps = await page.evaluate((selector) => {
    const boxes = [...document.querySelectorAll(selector)]
      .map((node) => ({ name: node.className, box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0);
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter(
          ({ box: b }) =>
            a.box.left < b.right &&
            b.left < a.box.right &&
            a.box.top < b.bottom &&
            b.top < a.box.bottom,
        )
        .map((b) => `${a.name} / ${b.name}`),
    );
  }, parts);
  expect(overlaps, `nothing overlaps at ${String(width)} px`).toEqual([]);
}

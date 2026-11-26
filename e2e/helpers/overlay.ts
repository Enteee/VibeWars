import { expect, type Locator, type Page } from "@playwright/test";

/** The windows an overlay's × is checked at (#2381): a laptop and a phone. */
export const OVERLAY_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const;

/** Click a top-bar icon, through the ⋯ when the window folds the icons into it (#1272). */
export async function clickTopbarIcon(page: Page, selector: string): Promise<void> {
  const icon = page.locator(`#topbar ${selector}`);
  const more = page.locator("#topbar .topbar-more");
  // The bar folds once its screen is shown: wait for one of the two to be clickable.
  await expect(icon.or(more).filter({ visible: true })).toHaveCount(1);
  if (await more.isVisible()) {
    await more.click();
  }
  await icon.click();
}

/**
 * The overlay window's × (#2381): within 1.5rem of its panel's top right,
 * and no Back or other Close in the top bar while it is open. Returned to be
 * clicked.
 */
export async function expectCloseAtTopRight(page: Page, dialog: Locator): Promise<Locator> {
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toHaveAttribute("title", "Close (Esc)");
  const panel = await dialog.boundingBox();
  const box = await close.boundingBox();
  expect(panel).not.toBeNull();
  expect(box).not.toBeNull();
  if (panel !== null && box !== null) {
    expect(panel.x + panel.width - (box.x + box.width)).toBeLessThanOrEqual(24);
    expect(box.y - panel.y).toBeLessThanOrEqual(24);
  }
  await expect(page.locator("#topbar .topbar-back")).toBeEmpty();
  // A window that is a top-bar popover (#2386) brings its own × into the bar.
  const own = await page.locator("#topbar").locator(close).count();
  await expect(
    page.locator("#topbar").getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(own);
  return close;
}

/**
 * Which of `selector`'s elements show under the closed chat's icon, bottom
 * left (#3887), as the part of each that an ancestor's overflow leaves
 * visible: its class names, for the failure to read.
 */
export async function underChatIcon(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const icon = document.querySelector(".chat-toggle")?.getBoundingClientRect();
    if (icon === undefined) throw new Error("no chat icon");
    const under: string[] = [];
    for (const node of document.querySelectorAll(selector)) {
      let { left, top, right, bottom } = node.getBoundingClientRect();
      for (let up = node.parentElement; up !== null; up = up.parentElement) {
        if (getComputedStyle(up).overflow === "visible") continue;
        const clip = up.getBoundingClientRect();
        left = Math.max(left, clip.left);
        top = Math.max(top, clip.top);
        right = Math.min(right, clip.right);
        bottom = Math.min(bottom, clip.bottom);
      }
      const overlaps =
        left < icon.right && right > icon.left && top < icon.bottom && bottom > icon.top;
      if (right > left && bottom > top && overlaps) under.push(node.className);
    }
    return under;
  }, selector);
}

/** Scroll the screen that holds `selector` to its end, as far as it goes. */
export async function scrollToEnd(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((node) => {
    for (let up = node.parentElement; up !== null; up = up.parentElement) {
      const overflow = getComputedStyle(up).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        up.scrollTop = up.scrollHeight;
        return;
      }
    }
    throw new Error("nothing scrolls");
  });
}

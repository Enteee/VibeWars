import { expect, type Page } from "@playwright/test";

/**
 * A Pixel 8a (#3775): 412x915 CSS px, touch only. Playwright's "Pixel 7"
 * numbers, which are the 8a's CSS size. Spread into `test.use`, never a
 * `devices[...]` entry: its `defaultBrowserType` breaks `test.use`.
 */
export const PIXEL_8A_PORTRAIT = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
} as const;

/** The same phone on its side: 915x412. */
export const PIXEL_8A_LANDSCAPE = {
  ...PIXEL_8A_PORTRAIT,
  viewport: { width: 915, height: 412 },
} as const;

/** A finger's hit box (#3776): every control at least this wide and tall, in CSS px. */
export const TOUCH_TARGET = 44;

/** The smallest text a phone shows (#3776), in CSS px. */
export const MIN_TEXT = 12;

/** How tall the top bar may be on the phone on its side (#3776), in CSS px. */
export const LANDSCAPE_TOPBAR = 56;

/** Pass the touch-only notice (#1392), which a touch phone sees first. */
export async function passTouchNotice(page: Page): Promise<void> {
  await page.locator(".touch-notice-continue").click();
  await expect(page.locator(".touch-notice")).toHaveCount(0);
}

/**
 * What on the page breaks the phone's rules (#3776), one line each: a
 * sideways scroll, a control in `#topbar` or `#screens` smaller than a
 * finger, a control over an icon that is not its own, visible text
 * under `MIN_TEXT`. Empty when the page fits.
 *
 * A checkbox or radio is measured by its label when it has one: the label
 * is what a finger presses.
 */
export async function phoneOffenders(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ target, minText }) => {
      const out: string[] = [];
      const root = document.documentElement;
      if (root.scrollWidth > root.clientWidth) {
        out.push(`sideways scroll: ${String(root.scrollWidth)} > ${String(root.clientWidth)}`);
      }
      const shown = (node: Element): boolean => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
      };
      const name = (node: Element): string => {
        const text = node.textContent.trim().slice(0, 30);
        const label = node.getAttribute("aria-label") ?? node.getAttribute("title") ?? "";
        return `${node.tagName.toLowerCase()}.${node.className} "${text || label}"`;
      };
      const controls = document.querySelectorAll(
        [
          "button",
          "a[href]",
          "input:not([type=hidden])",
          "select",
          "textarea",
          "summary",
          "[role=button]",
          "[role=tab]",
          "[role=switch]",
          "[role=checkbox]",
        ]
          .map((s) => `#topbar ${s}, #screens ${s}`)
          .join(", "),
      );
      const measured = new Set<Element>();
      for (const control of controls) {
        const check =
          control instanceof HTMLInputElement &&
          (control.type === "checkbox" || control.type === "radio");
        const node = (check ? control.closest("label") : null) ?? control;
        if (measured.has(node) || !shown(node)) continue;
        measured.add(node);
        const box = node.getBoundingClientRect();
        if (box.width < target || box.height < target) {
          out.push(
            `small target ${String(Math.round(box.width))}x${String(Math.round(box.height))}: ${name(node)}`,
          );
        }
      }
      // A control grown to a finger's size must not cover a picture (#3776):
      // a card's corner buttons once sat on its skill bar. Only a picture
      // in the control's own positioned box counts, and only where the
      // control is on top: a window or overlay over the page may cover one.
      const icons = [...document.querySelectorAll("#topbar img, #screens img")].filter(shown);
      for (const node of measured) {
        const scope = node instanceof HTMLElement ? node.offsetParent : null;
        if (scope === null) continue;
        const box = node.getBoundingClientRect();
        for (const icon of icons) {
          if (node.contains(icon) || !scope.contains(icon)) continue;
          const over = icon.getBoundingClientRect();
          const left = Math.max(box.left, over.left);
          const top = Math.max(box.top, over.top);
          const wide = Math.min(box.right, over.right) - left;
          const high = Math.min(box.bottom, over.bottom) - top;
          if (wide <= 1 || high <= 1) continue;
          const atop = document.elementFromPoint(left + wide / 2, top + high / 2);
          if (atop !== null && node.contains(atop)) {
            out.push(`covers an icon: ${name(node)} over ${name(icon)}`);
            break;
          }
        }
      }
      for (const node of document.querySelectorAll("#topbar *, #screens *")) {
        const own = [...node.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "",
        );
        if (!own || !shown(node)) continue;
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (size < minText) {
          out.push(`small text ${String(size)}px: ${name(node)}`);
        }
      }
      return out;
    },
    { target: TOUCH_TARGET, minText: MIN_TEXT },
  );
}

/**
 * Check the screen on show fits the phone held both ways (#3776): no
 * offenders upright, none on its side, where the top bar is also one
 * short row. Ends upright again.
 */
export async function expectFitsPhone(page: Page, screen: string): Promise<void> {
  expect(await phoneOffenders(page), `${screen}, portrait`).toEqual([]);
  await page.setViewportSize(PIXEL_8A_LANDSCAPE.viewport);
  expect(await phoneOffenders(page), `${screen}, landscape`).toEqual([]);
  const bar = await page.locator("#topbar").boundingBox();
  expect(bar?.height ?? 0, `${screen}: top bar height, landscape`).toBeLessThanOrEqual(
    LANDSCAPE_TOPBAR,
  );
  await page.setViewportSize(PIXEL_8A_PORTRAIT.viewport);
}

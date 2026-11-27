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

/**
 * What on the page breaks the phone's rules (#3776), one line each: a
 * sideways scroll of the page or of a box in `scope` (#4238), a control in `scope` (`#topbar` and `#screens` unless
 * told: a match's HUD is outside both) smaller than a
 * finger, a control over an icon that is not its own, visible text
 * under `MIN_TEXT`. Empty when the page fits.
 *
 * A checkbox or radio is measured by its label when it has one: the label
 * is what a finger presses.
 */
export async function phoneOffenders(
  page: Page,
  scope: readonly string[] = ["#topbar", "#screens"],
): Promise<string[]> {
  return page.evaluate(
    ({ target, minText, scope }) => {
      const within = (what: string): string => scope.map((root) => `${root} ${what}`).join(", ");
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
      // A pane that scrolls sideways inside itself (#4238): the page fits,
      // but a row is still wider than the phone.
      for (const node of document.querySelectorAll(within("*"))) {
        const { overflowX } = getComputedStyle(node);
        if (
          (overflowX === "auto" || overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth + 1 &&
          shown(node)
        ) {
          out.push(
            `scrolls sideways: ${String(node.scrollWidth)} > ${String(node.clientWidth)}: ${name(node)}`,
          );
        }
      }
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
          .map(within)
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
      // Only the part of a picture its scrolling boxes show counts (#3777):
      // a list scrolled under its own tabs hides it, it is not covered. A
      // hand's art is not an icon: the paper doll draws its spot on it.
      const icons = [...document.querySelectorAll(within("img:not(.paper-doll-held)"))].filter(
        shown,
      );
      const seen = (icon: Element): DOMRect | undefined => {
        const box = icon.getBoundingClientRect();
        let left = box.left;
        let top = box.top;
        let right = box.right;
        let bottom = box.bottom;
        for (let clip = icon.parentElement; clip !== null; clip = clip.parentElement) {
          if (getComputedStyle(clip).overflow === "visible") continue;
          const edge = clip.getBoundingClientRect();
          left = Math.max(left, edge.left);
          top = Math.max(top, edge.top);
          right = Math.min(right, edge.right);
          bottom = Math.min(bottom, edge.bottom);
        }
        return right > left && bottom > top
          ? new DOMRect(left, top, right - left, bottom - top)
          : undefined;
      };
      for (const node of measured) {
        const scope = node instanceof HTMLElement ? node.offsetParent : null;
        if (scope === null) continue;
        const box = node.getBoundingClientRect();
        for (const icon of icons) {
          if (node.contains(icon) || !scope.contains(icon)) continue;
          const over = seen(icon);
          if (over === undefined) continue;
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
      for (const node of document.querySelectorAll(within("*"))) {
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
    { target: TOUCH_TARGET, minText: MIN_TEXT, scope },
  );
}

/**
 * Check the screen on show fits the phone held both ways (#3776): no
 * offenders upright, none on its side, where the top bar is also one
 * short row. Ends upright again. `scope` is `phoneOffenders`'.
 */
export async function expectFitsPhone(
  page: Page,
  screen: string,
  scope?: readonly string[],
): Promise<void> {
  expect(await phoneOffenders(page, scope), `${screen}, portrait`).toEqual([]);
  await page.setViewportSize(PIXEL_8A_LANDSCAPE.viewport);
  expect(await phoneOffenders(page, scope), `${screen}, landscape`).toEqual([]);
  const bar = await page.locator("#topbar").boundingBox();
  expect(bar?.height ?? 0, `${screen}: top bar height, landscape`).toBeLessThanOrEqual(
    LANDSCAPE_TOPBAR,
  );
  await page.setViewportSize(PIXEL_8A_PORTRAIT.viewport);
}

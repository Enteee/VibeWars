import { button, h } from "./kit.js";

/** What the notice says (#1392), and Help's Getting started with it. */
export const TOUCH_NOTICE_HEADLINE = "VibeWars needs a keyboard and mouse.";

/**
 * Whether this device is touch alone (#1392): a coarse pointer that cannot
 * hover, and no fine pointer anywhere. A narrow desktop window has its
 * mouse, and a tablet with one plugged in has `any-pointer: fine`.
 * `match` is `matchMedia`'s answer, handed in.
 */
export function isTouchOnly(match: (query: string) => boolean): boolean {
  return match("(pointer: coarse)") && match("(hover: none)") && !match("(any-pointer: fine)");
}

/** Whether `main` holds the menu back for the notice: on a touch-only device, until gone past once. */
export function needsTouchNotice(
  match: (query: string) => boolean,
  dismissed: () => boolean,
): boolean {
  return isTouchOnly(match) && !dismissed();
}

/**
 * The notice over everything (#1392): VibeWars needs a keyboard and mouse,
 * and where to open it instead. Continue anyway is the only way past it,
 * neither Esc nor a tap outside: it removes the notice, then `onContinue`.
 */
export function showTouchNotice(root: HTMLElement, onContinue: () => void): void {
  const backdrop = h("div", "touch-notice-overlay");
  const panel = h("div", "screen touch-notice");
  panel.setAttribute("role", "alertdialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", TOUCH_NOTICE_HEADLINE);
  const where = h("p", "screen-subtitle", "It does not work on a phone or a touch-only tablet. ");
  where.append(
    "Open it on a computer: ",
    h("span", "touch-notice-url", `${location.origin}${location.pathname}`),
    ".",
  );
  const go = button("Continue anyway", "primary touch-notice-continue", () => {
    backdrop.remove();
    onContinue();
  });
  panel.append(
    h("h1", "screen-title", "VibeWars"),
    h("p", "touch-notice-headline", TOUCH_NOTICE_HEADLINE),
    where,
    go,
  );
  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  go.focus();
}

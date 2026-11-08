import { t } from "../i18n/index.js";
import { button, h } from "./kit.js";

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
  const headline = t("touchNotice.headline");
  panel.setAttribute("aria-label", headline);
  // One sentence with the address in it, styled apart: split around a mark that stands for it.
  const mark = "\u0000";
  const [before = "", after = ""] = t("touchNotice.where", { url: mark }).split(mark);
  const where = h("p", "screen-subtitle", before);
  where.append(h("span", "touch-notice-url", `${location.origin}${location.pathname}`), after);
  const go = button(t("touchNotice.continue"), "primary touch-notice-continue", () => {
    backdrop.remove();
    onContinue();
  });
  panel.append(
    h("h1", "screen-title", t("touchNotice.title")),
    h("p", "touch-notice-headline", headline),
    where,
    go,
  );
  backdrop.appendChild(panel);
  root.appendChild(backdrop);
  go.focus();
}

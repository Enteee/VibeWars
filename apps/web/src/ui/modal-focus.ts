/** What can take focus from Tab inside a dialog. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  "[tabindex]",
].join(", ");

/** The dialogs holding focus, the top one last: only it answers keys. */
const held: HTMLElement[] = [];

/** `panel`'s elements Tab stops at, in document order. */
function focusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && element.closest("[hidden]") === null,
  );
}

/**
 * Holds the keyboard inside a modal dialog (#4090): focus moves into
 * `panel`, Tab and Shift+Tab cycle inside it, and Esc calls `onEscape`
 * without reaching the page. Returns the release, which hands focus
 * back to what had it, if that is still in the document. A dialog
 * opened over another holds focus until it is released.
 */
export function holdFocus(panel: HTMLElement, onEscape: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  held.push(panel);
  const onKey = (event: KeyboardEvent): void => {
    if (held.at(-1) !== panel) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const stops = focusables(panel);
    const [first, last] = [stops[0], stops.at(-1)];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    const at = document.activeElement;
    const inside = at instanceof Node && panel.contains(at);
    if (!inside || (event.shiftKey ? at === first : at === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
  document.addEventListener("keydown", onKey, true);
  if (!panel.contains(document.activeElement)) {
    focusables(panel)[0]?.focus();
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    document.removeEventListener("keydown", onKey, true);
    held.splice(held.indexOf(panel), 1);
    if (opener?.isConnected === true) {
      opener.focus();
    }
  };
}

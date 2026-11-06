/**
 * A window that drops from a top-bar or HUD button (#2385): the music
 * selector's and the Lobby's. A click on the button opens it and another
 * shuts it, as do Esc inside it and a click outside it; focus goes back to
 * the button. One is open at a time on the page: opening one shuts the other.
 */

/** What a popover shows while it is open. */
export interface PopoverContent {
  readonly element: HTMLElement;
  /** Where focus goes once it is in the page. */
  readonly focus: HTMLElement;
  /** Stop listening; the popover takes the element out itself. */
  dispose(): void;
}

/** The popover open now, page-wide, and how to shut it without stealing focus. */
let shutOpen: (() => void) | undefined;

/** Shut whichever popover is open (#2385): Help or Options opens over it. */
export function closeTopbarPopover(): void {
  shutOpen?.();
}

/**
 * Hang a popover off `trigger`, in `parent`: `build` makes its content each
 * time it opens, handed the popover's own close, and the content is disposed
 * of each time it shuts. The popover keeps no state of its own.
 */
export function attachTopbarPopover(
  trigger: HTMLButtonElement,
  parent: HTMLElement,
  build: (close: () => void) => PopoverContent,
): { dispose(): void } {
  let open: PopoverContent | undefined;
  const onKeydown = (event: KeyboardEvent): void => {
    // Esc here is this popover's, never an overlay's under it.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const shut = (refocus: boolean): void => {
    if (open === undefined) {
      return;
    }
    const closing = open;
    open = undefined;
    if (shutOpen === quiet) {
      shutOpen = undefined;
    }
    closing.element.removeEventListener("keydown", onKeydown);
    closing.dispose();
    closing.element.remove();
    trigger.setAttribute("aria-expanded", "false");
    if (refocus) {
      trigger.focus();
    }
  };
  const close = (): void => {
    shut(true);
  };
  const quiet = (): void => {
    shut(false);
  };
  const toggle = (): void => {
    if (open !== undefined) {
      close();
      return;
    }
    closeTopbarPopover();
    open = build(close);
    open.element.setAttribute("role", "dialog");
    open.element.addEventListener("keydown", onKeydown);
    parent.appendChild(open.element);
    shutOpen = quiet;
    trigger.setAttribute("aria-expanded", "true");
    open.focus.focus();
  };
  const onOutside = (event: PointerEvent): void => {
    const target = event.target;
    if (
      open !== undefined &&
      target instanceof Node &&
      !open.element.contains(target) &&
      !trigger.contains(target)
    ) {
      close();
    }
  };
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", toggle);
  document.addEventListener("pointerdown", onOutside);
  return {
    dispose() {
      trigger.removeEventListener("click", toggle);
      document.removeEventListener("pointerdown", onOutside);
      shut(false);
    },
  };
}

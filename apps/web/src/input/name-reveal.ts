type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Whether Ctrl is held right now, which shows every name (#253). */
export interface NameReveal {
  held(): boolean;
  /** Stop listening. */
  detach(): void;
}

/**
 * Track Ctrl on `target`'s `keydown`/`keyup`: GW1's show-names key. Alt
 * would have been the other choice, but a lone Alt released on Windows
 * focuses the browser's menu bar, and the game loses the keyboard.
 *
 * A keyup that happens while the tab is unfocused never arrives, so
 * Ctrl would stick on: the page's `blur`, and its turning hidden, count
 * as letting go. Never `preventDefault`s: Ctrl+R and Ctrl+W must still
 * work.
 *
 * @param page where focus and visibility changes are heard; the real
 *   window and document unless a test passes stand-ins
 */
export function attachNameReveal(
  target: Listenable,
  page: {
    readonly window: Listenable;
    readonly document: Listenable & { readonly visibilityState: string };
  } = { window, document },
): NameReveal {
  let held = false;

  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === "Control") {
      held = true;
    }
  };
  const onKeyUp = (event: Event): void => {
    if ((event as KeyboardEvent).key === "Control") {
      held = false;
    }
  };
  const letGo = (): void => {
    held = false;
  };
  const onVisibility = (): void => {
    if (page.document.visibilityState === "hidden") {
      held = false;
    }
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  page.window.addEventListener("blur", letGo);
  page.document.addEventListener("visibilitychange", onVisibility);
  return {
    held: () => held,
    detach() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      page.window.removeEventListener("blur", letGo);
      page.document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

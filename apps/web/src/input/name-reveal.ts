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
 * A keyup that happens while `target` is unfocused never reaches it, so
 * Ctrl would stick on: `target`'s own `blur` (the Training Ground stage
 * losing focus to Esc or the editor), the page's, and its turning hidden
 * all count as letting go. Never `preventDefault`s: Ctrl+R and Ctrl+W must still
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
  target.addEventListener("blur", letGo);
  page.window.addEventListener("blur", letGo);
  page.document.addEventListener("visibilitychange", onVisibility);
  return {
    held: () => held,
    detach() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", letGo);
      page.window.removeEventListener("blur", letGo);
      page.document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

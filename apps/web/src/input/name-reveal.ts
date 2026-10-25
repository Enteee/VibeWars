import { isShortcut, type Keymap } from "./keymap.js";

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Whether the names key is held right now, which shows every name (#253). */
export interface NameReveal {
  held(): boolean;
  /** Stop listening. */
  detach(): void;
}

/**
 * Track the keymap's `show-names` keys on `target`'s `keydown`/`keyup`:
 * GW1's show-names key, which was Ctrl. No keymap binds Ctrl, Alt or
 * Meta, so a show-names press with one of them held is the browser's
 * and reveals nothing (#302).
 *
 * A keyup that happens while `target` is unfocused never reaches it, so
 * the key would stick on: `target`'s own `blur` (the Training Ground
 * stage losing focus to Esc or the editor), the page's, and its turning
 * hidden all count as letting go. Never `preventDefault`s.
 *
 * @param page where focus and visibility changes are heard; the real
 *   window and document unless a test passes stand-ins
 */
export function attachNameReveal(
  target: Listenable,
  keymap: Keymap,
  page: {
    readonly window: Listenable;
    readonly document: Listenable & { readonly visibilityState: string };
  } = { window, document },
): NameReveal {
  const down = new Set<string>();
  const codes = keymap["show-names"];

  const onKeyDown = (event: Event): void => {
    const keyEvent = event as KeyboardEvent;
    if (codes.includes(keyEvent.code) && !isShortcut(keyEvent)) {
      down.add(keyEvent.code);
    }
  };
  const onKeyUp = (event: Event): void => {
    down.delete((event as KeyboardEvent).code);
  };
  const letGo = (): void => {
    down.clear();
  };
  const onVisibility = (): void => {
    if (page.document.visibilityState === "hidden") {
      down.clear();
    }
  };
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", letGo);
  page.window.addEventListener("blur", letGo);
  page.document.addEventListener("visibilitychange", onVisibility);
  return {
    held: () => down.size > 0,
    detach() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", letGo);
      page.window.removeEventListener("blur", letGo);
      page.document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

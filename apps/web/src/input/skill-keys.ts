import { SKILL_ACTIONS, actionForCode, isShortcut, type Keymap } from "./keymap.js";

/**
 * The bar slot a keydown casts, or `undefined` for none: the keymap's
 * `skill-1` to `skill-8`, as far as the bar reaches (#302). The match and
 * the Training Ground both ask here, so a key casts the same slot in both.
 *
 * An auto-repeat keydown casts nothing. Holding a skill key while it
 * recharges is a common habit, and at a fast OS repeat rate it would
 * send one `use-skill` per repeat, enough on its own to cross the
 * server's message cap and get the player dropped (#43). One press is
 * one cast. Nor does a press with Ctrl, Alt or Meta held: that is the
 * browser's shortcut. Shift is not; Shift+Q still casts.
 */
export function skillSlotForKeyDown(
  event: Pick<KeyboardEvent, "code" | "repeat" | "ctrlKey" | "altKey" | "metaKey">,
  keymap: Keymap,
  barLength: number,
): number | undefined {
  if (event.repeat || isShortcut(event)) {
    return undefined;
  }
  const action = actionForCode(keymap, event.code);
  const slot = action === undefined ? -1 : SKILL_ACTIONS.indexOf(action);
  return slot >= 0 && slot < barLength ? slot : undefined;
}

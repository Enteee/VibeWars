import {
  KEYMAP_PRESETS,
  SKILL_ACTIONS,
  type KeyAction,
  type Keymap,
} from "../apps/web/src/input/keymap.js";

/**
 * The key a player presses for `action`, as a Playwright key name: the
 * first `KeyboardEvent.code` the keymap binds it to (#302). Specs press
 * keys through this, not literals, so a preset change moves them too.
 */
export function key(action: KeyAction, keymap: Keymap = KEYMAP_PRESETS.vibewars): string {
  const code = keymap[action][0];
  if (code === undefined) {
    throw new Error(`no key is bound to ${action}`);
  }
  return code;
}

/** The key that casts bar slot `slot` (0-7) under `keymap`. */
export function skillKey(slot: number, keymap: Keymap = KEYMAP_PRESETS.vibewars): string {
  const action = SKILL_ACTIONS[slot];
  if (action === undefined) {
    throw new Error(`there is no skill slot ${String(slot)}`);
  }
  return key(action, keymap);
}

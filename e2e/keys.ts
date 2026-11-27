import {
  DEFAULT_KEYMAP,
  SKILL_ACTIONS,
  type KeyAction,
  type Keymap,
  type Modifier,
} from "../apps/web/src/input/keymap.js";

const PLAYWRIGHT_MODIFIERS: Readonly<Record<Modifier, string>> = {
  ctrl: "Control",
  alt: "Alt",
  shift: "Shift",
};

/**
 * The key a player presses for `action`, as a Playwright key name: the
 * first binding the keymap has for it (#302), its modifiers first, as
 * "Shift+KeyX" (#4183). Specs press
 * keys through this, not literals, so a preset change moves them too.
 */
export function key(action: KeyAction, keymap: Keymap = DEFAULT_KEYMAP): string {
  const binding = keymap[action][0];
  if (binding === undefined) {
    throw new Error(`no key is bound to ${action}`);
  }
  const mods = binding.mods.map((mod) => PLAYWRIGHT_MODIFIERS[mod]);
  return [...mods, binding.code].join("+");
}

/** The key that casts bar slot `slot` (0-7) under `keymap`. */
export function skillKey(slot: number, keymap: Keymap = DEFAULT_KEYMAP): string {
  const action = SKILL_ACTIONS[slot];
  if (action === undefined) {
    throw new Error(`there is no skill slot ${String(slot)}`);
  }
  return key(action, keymap);
}

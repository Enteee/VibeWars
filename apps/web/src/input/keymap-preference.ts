import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { DEFAULT_KEYMAP, parseKeymap, type Keymap } from "./keymap.js";

/** The player's keymap (#302), across reloads. */

const KEYMAP_KEY = `${STORAGE_NAMESPACE}.keymap`;

/**
 * The stored keymap, or `DEFAULT_KEYMAP` whole when there is none, it is
 * not a valid keymap, or storage throws. A keymap is never half repaired.
 */
export function loadKeymap(): Keymap {
  try {
    const stored = localStorage.getItem(KEYMAP_KEY);
    return (stored === null ? undefined : parseKeymap(JSON.parse(stored))) ?? DEFAULT_KEYMAP;
  } catch {
    // Private browsing can throw on localStorage access, and a hand-edited
    // value may not be JSON; the default keymap plays either way.
    return DEFAULT_KEYMAP;
  }
}

export function saveKeymap(map: Keymap): void {
  try {
    localStorage.setItem(KEYMAP_KEY, JSON.stringify(map));
  } catch {
    // The keymap still works for this session; it just is not remembered.
  }
}

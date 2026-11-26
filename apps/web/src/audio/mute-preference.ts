import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** Whether the player muted the combat sounds (#112), across reloads. */

const MUTED_KEY = `${STORAGE_NAMESPACE}.muted`;

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    // Private browsing can throw on localStorage access; sound on is the default.
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    // The toggle still works for this session; it just is not remembered.
  }
}

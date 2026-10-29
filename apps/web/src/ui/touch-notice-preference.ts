import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** Whether the player went past the keyboard-and-mouse notice (#1392), on this device. */

const DISMISSED_KEY = `${STORAGE_NAMESPACE}.touch-notice-dismissed`;

export function loadTouchNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    // Private browsing can throw on localStorage access: the notice shows again.
    return false;
  }
}

export function saveTouchNoticeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // Gone past for this load; it just is not remembered.
  }
}

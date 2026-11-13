import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** How the first-time tutorial ended on this device (#3218): finished, or skipped. */
export type TutorialRecord = "done" | "skipped";

const TUTORIAL_KEY = `${STORAGE_NAMESPACE}.tutorial`;

/** The record, or `undefined`: none yet, or one of another shape, which is discarded. */
export function loadTutorialRecord(): TutorialRecord | undefined {
  try {
    const stored = localStorage.getItem(TUTORIAL_KEY);
    if (stored === "done" || stored === "skipped") {
      return stored;
    }
    if (stored !== null) {
      localStorage.removeItem(TUTORIAL_KEY);
    }
    return undefined;
  } catch {
    // Private browsing can throw on localStorage access: it is offered again.
    return undefined;
  }
}

export function saveTutorialRecord(record: TutorialRecord): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, record);
  } catch {
    // Over for this load; it just is not remembered.
  }
}

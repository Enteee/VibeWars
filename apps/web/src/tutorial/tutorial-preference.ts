import { STORAGE_NAMESPACE } from "../storage/namespace.js";

import { isMenuQuestStepId, type MenuQuestStepId } from "./menu-quest.js";

/**
 * How far the first-time tutorial got on this device (#3218): finished,
 * skipped, or into the menu quest at a step (#3540), resumed from there.
 */
export type TutorialRecord = "done" | "skipped" | `menu:${MenuQuestStepId}`;

const TUTORIAL_KEY = `${STORAGE_NAMESPACE}.tutorial`;
const MENU_PREFIX = "menu:";

/** The menu quest step a record resumes at, if it is one. */
export function menuQuestStepOf(record: string | undefined): MenuQuestStepId | undefined {
  const step = record?.startsWith(MENU_PREFIX) === true ? record.slice(MENU_PREFIX.length) : "";
  return isMenuQuestStepId(step) ? step : undefined;
}

/**
 * The record, or `undefined`: none yet, or one of another shape, which is
 * discarded, as is a menu quest step that no longer exists.
 */
export function loadTutorialRecord(): TutorialRecord | undefined {
  try {
    const stored = localStorage.getItem(TUTORIAL_KEY);
    if (stored === "done" || stored === "skipped") {
      return stored;
    }
    const step = menuQuestStepOf(stored ?? undefined);
    if (step !== undefined) {
      return `menu:${step}`;
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

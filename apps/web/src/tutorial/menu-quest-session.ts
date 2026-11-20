import { t } from "../i18n/index.js";

import type { CoachOverlay } from "./coach-overlay.js";
import {
  NO_MENU_QUEST_EVENTS,
  advanceMenuQuest,
  beatTarget,
  currentBeat,
  foldMenuQuestEvent,
  menuQuestChecklist,
  menuQuestStep,
  resumeMenuQuest,
  type MenuQuestCursor,
  type MenuQuestEvent,
  type MenuQuestStepId,
} from "./menu-quest.js";
import { saveTutorialRecord } from "./tutorial-preference.js";

/**
 * The menu quest being played (#3540): the menu's events in, the coach
 * kept on the current beat, and the record saved at the start of every
 * step, so a launch resumes there. `done` is saved after the last step,
 * and the quest ends once its closing line has gone (#3544).
 */
/** How long the closing line shows, unless clicked first (#3544). */
export const FAREWELL_MS = 5000;

export interface MenuQuestSession {
  event(event: MenuQuestEvent): void;
  /**
   * Gone without a word, as for a link: the record keeps its step. Once
   * done, the closing line goes, as for a match found.
   */
  stop(): void;
}

export interface MenuQuestOptions {
  readonly from: MenuQuestStepId;
  /** The coach to show it on; `onSkip` once Skip tutorial is confirmed. */
  readonly coach: (callbacks: { readonly onSkip: () => void }) => CoachOverlay;
  readonly onEnd: (end: "done" | "skipped") => void;
}

export function startMenuQuest(options: MenuQuestOptions): MenuQuestSession {
  let state = NO_MENU_QUEST_EVENTS;
  let cursor: MenuQuestCursor = resumeMenuQuest(options.from);
  let over = false;
  const finish = (end: "done" | "skipped"): void => {
    over = true;
    saveTutorialRecord(end);
    if (end === "skipped") {
      coach.remove();
      options.onEnd(end);
      return;
    }
    coach.farewell(t("tutorial.menu.arena.farewell"), FAREWELL_MS, () => {
      options.onEnd(end);
    });
  };
  const coach = options.coach({
    onSkip: () => {
      if (!over) {
        finish("skipped");
      }
    },
  });
  /** What the coach shows now: an event that changes none of it shows nothing anew. */
  let shown = "";
  const show = (): void => {
    const step = menuQuestStep(cursor.step);
    const beat = currentBeat(cursor);
    const objectives = menuQuestChecklist(cursor, state);
    const target = beatTarget(beat, state);
    const view = JSON.stringify([cursor, target, objectives]);
    if (view === shown) {
      return;
    }
    shown = view;
    coach.show({
      title: t(step.title),
      line: t(beat.line),
      target,
      objectives: objectives.map(({ label, done }) => ({
        label: t(label),
        done,
      })),
      gotIt:
        beat.kind === "explain"
          ? () => {
              advance(true);
            }
          : undefined,
    });
  };
  const advance = (gotIt: boolean): void => {
    if (over) {
      return;
    }
    const next = advanceMenuQuest(cursor, state, gotIt);
    if (next === "done") {
      finish("done");
      return;
    }
    // A step is only ever entered at its first beat: that is where it resumes.
    if (next !== cursor && next.beat === 0) {
      saveTutorialRecord(`menu:${next.step}`);
    }
    cursor = next;
    show();
  };
  saveTutorialRecord(`menu:${cursor.step}`);
  show();
  return {
    event: (event) => {
      state = foldMenuQuestEvent(state, event);
      advance(false);
    },
    stop: () => {
      over = true;
      coach.remove();
    },
  };
}

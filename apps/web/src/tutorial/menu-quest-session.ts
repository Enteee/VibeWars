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
 * step, so a launch resumes there. `done` is saved after the last step.
 */
export interface MenuQuestSession {
  event(event: MenuQuestEvent): void;
  /** Gone without a word, as for a link: the record keeps its step. */
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
    coach.remove();
    saveTutorialRecord(end);
    options.onEnd(end);
  };
  const coach = options.coach({
    onSkip: () => {
      if (!over) {
        finish("skipped");
      }
    },
  });
  const show = (): void => {
    const step = menuQuestStep(cursor.step);
    const beat = currentBeat(cursor);
    coach.show({
      title: t(step.title),
      line: t(beat.line),
      target: beatTarget(beat, state),
      objectives: menuQuestChecklist(cursor, state).map(({ label, done }) => ({
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
      if (!over) {
        over = true;
        coach.remove();
      }
    },
  };
}

import { attributeName, professionName } from "../i18n/game-names.js";
import { t } from "../i18n/index.js";

import type { CoachOverlay } from "./coach-overlay.js";
import {
  NO_MENU_QUEST_EVENTS,
  MEMBER_BACK_BEAT,
  advanceMenuQuest,
  beatTarget,
  foldMenuQuestEvent,
  menuQuestChecklist,
  menuQuestStep,
  resumeMenuQuest,
  shownBeat,
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
/**
 * What a beat's line may name (#3786), as the game and the menu name it in
 * the player's language, so a line never disagrees with what it points at.
 */
function lineNames(): Readonly<Record<string, string>> {
  return {
    characters: t("rail.characters"),
    random: t("menu.randomTag"),
    reroll: t("menu.reroll"),
    clone: t("menu.clone"),
    newCharacter: t("menu.newCharacter"),
    warrior: professionName("warrior"),
    monk: professionName("monk"),
    strength: attributeName("warrior.strength"),
    divineFavor: attributeName("monk.divine-favor"),
    healingPrayers: attributeName("monk.healing-prayers"),
  };
}

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
  /** Whether this is a touch-only device: a beat with a touch line says it (#3876). */
  readonly touch: boolean;
  /** The coach to show it on; `onSkip` once Skip tutorial is confirmed. */
  readonly coach: (callbacks: { readonly onSkip: () => void }) => CoachOverlay;
  /** Opens the rail's drawer, where it is one: the modes step lights its entries (#3990). */
  readonly openRail: () => void;
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
    const beat = shownBeat(cursor, state);
    const objectives = menuQuestChecklist(cursor, state);
    const target = beatTarget(beat, state);
    const lead = beat.kind === "do" ? beat.lead?.(state) : undefined;
    const line = options.touch && beat.kind === "do" ? (beat.touchLine ?? beat.line) : beat.line;
    const view = JSON.stringify([cursor, line, lead, target, objectives]);
    if (view === shown) {
      return;
    }
    shown = view;
    coach.show({
      title: t(step.title),
      line: lead === undefined ? t(line, lineNames()) : `${t(lead)} ${t(line, lineNames())}`,
      target,
      // The member's build is the player's to edit, Back only pointed at.
      locked: beat !== MEMBER_BACK_BEAT,
      objectives: objectives.map(({ label, done }) => ({
        label: t(label, lineNames()),
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
  const enter = (step: MenuQuestStepId): void => {
    if (step === "modes") {
      options.openRail();
    }
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
      enter(next.step);
    }
    cursor = next;
    show();
  };
  saveTutorialRecord(`menu:${cursor.step}`);
  enter(cursor.step);
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

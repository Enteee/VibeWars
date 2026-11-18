import type { QueueMode } from "@vibewars/game-protocol";

import type { MessageKey } from "../i18n/index.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import type { RailEntry } from "../ui/rail.js";

/**
 * The menu quest (#3538, #3540): after the canyon's front, the tutorial
 * walks the player through the menu, one step at a time, each a run of
 * beats that points at one control. Pure: the session feeds it what the
 * menu did, and asks it where the player is.
 */

/** Something the menu did that an objective may be waiting for. */
export type MenuQuestEvent =
  | { readonly kind: "screen-shown"; readonly screen: RailEntry }
  | {
      readonly kind: "character-saved";
      readonly before: StoredCharacter | undefined;
      readonly after: StoredCharacter;
    }
  | { readonly kind: "team-saved"; readonly team: StoredTeam; readonly isNew: boolean }
  | { readonly kind: "team-size"; readonly size: number }
  | { readonly kind: "team-picked"; readonly teamId: string }
  | { readonly kind: "queue-joined"; readonly mode: QueueMode; readonly size: number };

/** Every event so far, folded: what the objectives ask about. */
export interface MenuQuestState {
  readonly screen: RailEntry | undefined;
  readonly screensShown: readonly RailEntry[];
  readonly charactersSaved: readonly {
    readonly before: StoredCharacter | undefined;
    readonly after: StoredCharacter;
  }[];
  readonly teamsSaved: readonly { readonly team: StoredTeam; readonly isNew: boolean }[];
  readonly teamSize: number | undefined;
  readonly teamPicked: string | undefined;
  readonly queueJoined: { readonly mode: QueueMode; readonly size: number } | undefined;
}

/** Something the player must have done, ticked live in the quest panel. */
export interface Objective {
  readonly id: string;
  readonly label: MessageKey;
  readonly done: (state: MenuQuestState) => boolean;
}

/**
 * One beat, pointing at the control with `data-tutorial="<target>"`:
 * an explanation the player reads and dismisses, or a thing to do.
 */
export type MenuBeat =
  | { readonly kind: "explain"; readonly target: string; readonly line: MessageKey }
  | {
      readonly kind: "do";
      readonly target: string;
      readonly line: MessageKey;
      readonly objectives: readonly Objective[];
    };

export interface MenuQuestStep {
  readonly id: string;
  readonly title: MessageKey;
  readonly beats: readonly MenuBeat[];
}

/** The steps, in order. The step cards of #3538 add theirs after the menu's. */
export const MENU_QUEST_STEPS = [
  {
    id: "menu",
    title: "tutorial.menu.menu.title",
    beats: [
      { kind: "explain", target: "rail", line: "tutorial.menu.menu.rail" },
      { kind: "explain", target: "rail-characters", line: "tutorial.menu.menu.characters" },
      { kind: "explain", target: "rail-teams", line: "tutorial.menu.menu.teams" },
    ],
  },
] as const satisfies readonly MenuQuestStep[];

export type MenuQuestStepId = (typeof MENU_QUEST_STEPS)[number]["id"];

/** The steps, as steps: what a step id is looked up in. */
const STEPS: readonly MenuQuestStep[] = MENU_QUEST_STEPS;

export function isMenuQuestStepId(id: string): id is MenuQuestStepId {
  return MENU_QUEST_STEPS.some((step) => step.id === id);
}

export function menuQuestStep(id: MenuQuestStepId): MenuQuestStep {
  const step = STEPS.find((each) => each.id === id);
  if (step === undefined) {
    throw new Error(`no menu quest step ${id}`);
  }
  return step;
}

export const NO_MENU_QUEST_EVENTS: MenuQuestState = {
  screen: undefined,
  screensShown: [],
  charactersSaved: [],
  teamsSaved: [],
  teamSize: undefined,
  teamPicked: undefined,
  queueJoined: undefined,
};

export function foldMenuQuestEvent(state: MenuQuestState, event: MenuQuestEvent): MenuQuestState {
  switch (event.kind) {
    case "screen-shown":
      return {
        ...state,
        screen: event.screen,
        screensShown: state.screensShown.includes(event.screen)
          ? state.screensShown
          : [...state.screensShown, event.screen],
      };
    case "character-saved":
      return {
        ...state,
        charactersSaved: [...state.charactersSaved, { before: event.before, after: event.after }],
      };
    case "team-saved":
      return {
        ...state,
        teamsSaved: [...state.teamsSaved, { team: event.team, isNew: event.isNew }],
      };
    case "team-size":
      return { ...state, teamSize: event.size };
    case "team-picked":
      return { ...state, teamPicked: event.teamId };
    case "queue-joined":
      return { ...state, queueJoined: { mode: event.mode, size: event.size } };
  }
}

/** Where the player is: a step, and the beat in it. */
export interface MenuQuestCursor {
  readonly step: MenuQuestStepId;
  readonly beat: number;
}

/** A launch with `menu:<id>` resumes at the start of that step, never mid-way. */
export function resumeMenuQuest(step: MenuQuestStepId): MenuQuestCursor {
  return { step, beat: 0 };
}

export function currentBeat(cursor: MenuQuestCursor): MenuBeat {
  const beat = menuQuestStep(cursor.step).beats[cursor.beat];
  if (beat === undefined) {
    throw new Error(`no beat ${String(cursor.beat)} in menu quest step ${cursor.step}`);
  }
  return beat;
}

/** A step is complete once every objective of every beat in it holds. */
export function stepComplete(step: MenuQuestStep, state: MenuQuestState): boolean {
  return step.beats.every(
    (beat) => beat.kind === "explain" || beat.objectives.every(({ done }) => done(state)),
  );
}

/**
 * The cursor after `state`, and Got it if `gotIt`: an explanation moves on
 * on Got it only, a thing to do once all its objectives hold. Past a
 * step's last beat is the next step's first, and past the last step,
 * `"done"`.
 */
export function advanceMenuQuest(
  cursor: MenuQuestCursor,
  state: MenuQuestState,
  gotIt: boolean,
): MenuQuestCursor | "done" {
  let at = cursor;
  let pressed = gotIt;
  for (;;) {
    const beat = currentBeat(at);
    const passed =
      beat.kind === "explain" ? pressed : beat.objectives.every(({ done }) => done(state));
    if (!passed) {
      return at;
    }
    // Got it dismisses the one explanation it was pressed on.
    pressed = false;
    const stepIndex = STEPS.findIndex(({ id }) => id === at.step);
    if (at.beat + 1 < menuQuestStep(at.step).beats.length) {
      at = { step: at.step, beat: at.beat + 1 };
    } else {
      const next = MENU_QUEST_STEPS[stepIndex + 1];
      if (next === undefined) {
        return "done";
      }
      at = resumeMenuQuest(next.id);
    }
  }
}

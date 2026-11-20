import type { LobbyMode } from "@vibewars/game-protocol";

import type { MessageKey } from "../i18n/index.js";
import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter, StoredTeam, TeamCharacter } from "../storage/schema.js";
import { RAIL, isModeEntry, type RailEntry } from "../ui/rail.js";
import { validateTeam } from "../ui/team-builder.js";

/**
 * The menu quest (#3538, #3540): after the canyon's front, the tutorial
 * walks the player through the menu, one step at a time, each a run of
 * beats that points at one control. Pure: the session feeds it what the
 * menu did, and asks it where the player is.
 */

/** A screen the quest can point into: a rail screen, the build editor, or a Team Lobby. */
export type MenuQuestScreen = RailEntry | "character-builder" | "team-lobby";

/** Something the menu did that an objective may be waiting for. */
export type MenuQuestEvent =
  | { readonly kind: "screen-shown"; readonly screen: MenuQuestScreen }
  /** One edit in the build editor (#3541): the draft before it, and after. */
  | {
      readonly kind: "build-draft";
      readonly before: StoredCharacter;
      readonly draft: StoredCharacter;
    }
  | {
      readonly kind: "character-saved";
      readonly before: StoredCharacter | undefined;
      readonly after: StoredCharacter;
    }
  /**
   * The team editor's draft (#3542), on opening and after every edit;
   * `isNew` for a team never stored, `characters` the player's own, to copy.
   */
  | {
      readonly kind: "team-draft";
      readonly draft: StoredTeam;
      readonly isNew: boolean;
      readonly characters: readonly StoredCharacter[];
    }
  | { readonly kind: "team-saved"; readonly team: StoredTeam; readonly isNew: boolean }
  | { readonly kind: "team-size"; readonly size: number }
  | {
      readonly kind: "team-picked";
      readonly teamId: string;
      /** The Team Builds the Team Lobby offered: the ones the player could pick. */
      readonly offered: readonly string[];
    }
  | { readonly kind: "queue-joined"; readonly mode: LobbyMode; readonly size: number };

/**
 * What the player has changed in the build editor (#3541), each once
 * done for good: a change undone later stays done. An edit that switches
 * profession resets attributes, skills and weapons, and counts only as
 * the switch; attributes and skills count only after one.
 */
export interface BuildChanges {
  readonly professions: boolean;
  readonly attributes: boolean;
  readonly skills: boolean;
  readonly weapons: boolean;
  readonly gear: boolean;
}

/** Every event so far, folded: what the objectives ask about. */
export interface MenuQuestState {
  readonly screen: MenuQuestScreen | undefined;
  readonly screensShown: readonly MenuQuestScreen[];
  readonly buildChanged: BuildChanges;
  readonly charactersSaved: readonly {
    readonly before: StoredCharacter | undefined;
    readonly after: StoredCharacter;
  }[];
  /** The team editor's draft, as last reported (#3542). */
  readonly teamDraft: { readonly team: StoredTeam; readonly isNew: boolean } | undefined;
  /** Whether a draft ever held a copy of the player's character (#3542). */
  readonly characterInTeam: boolean;
  readonly teamsSaved: readonly { readonly team: StoredTeam; readonly isNew: boolean }[];
  /** The team the quest had saved (#3542), for the modes step to pick. */
  readonly questTeamId: string | undefined;
  readonly teamSize: number | undefined;
  readonly teamPicked: { readonly teamId: string; readonly offered: readonly string[] } | undefined;
  readonly queueJoined: { readonly mode: LobbyMode; readonly size: number } | undefined;
}

/** Something the player must have done, ticked live in the quest panel. */
export interface Objective {
  readonly id: string;
  readonly label: MessageKey;
  readonly done: (state: MenuQuestState) => boolean;
}

/**
 * The `data-tutorial` id a beat points at, or, for a beat whose control
 * depends on the screen, the id for what the events so far showed.
 */
export type MenuTarget = string | ((state: MenuQuestState) => string);

/**
 * One beat, pointing at the controls whose `data-tutorial` holds its
 * target: an explanation the player reads and dismisses, or a thing to do.
 */
export type MenuBeat =
  | { readonly kind: "explain"; readonly target: MenuTarget; readonly line: MessageKey }
  | {
      readonly kind: "do";
      readonly target: MenuTarget;
      readonly line: MessageKey;
      readonly objectives: readonly Objective[];
    };

export interface MenuQuestStep {
  readonly id: string;
  readonly title: MessageKey;
  readonly beats: readonly MenuBeat[];
  /**
   * The step's own list (#3543), shown on every one of its beats in place
   * of the beat's objectives: each line ticked once the quest is past the
   * beat it names.
   */
  readonly checklist?: readonly { readonly label: MessageKey; readonly beat: number }[];
}

/** What the modes step says about each mode (#3543), as `docs/player/modes.md` has it. */
const MODE_LINES: Readonly<Record<LobbyMode, MessageKey>> = {
  "random-arena": "tutorial.menu.modes.randomArena",
  "team-arena": "tutorial.menu.modes.teamArena",
  "heroes-ascent": "tutorial.menu.modes.heroesAscent",
  gvg: "tutorial.menu.modes.gvg",
  "hosted-game": "tutorial.menu.modes.hostedGame",
};

/**
 * The modes step (#3543): for each of `modes`, in order, the player opens
 * it from the rail, then reads what it is beside its heading. The list
 * ticks a mode once its screen was opened.
 */
export function modesStep(modes: readonly LobbyMode[]): {
  readonly id: "modes";
  readonly title: MessageKey;
  readonly beats: readonly MenuBeat[];
  readonly checklist: readonly { readonly label: MessageKey; readonly beat: number }[];
} {
  return {
    id: "modes",
    title: "tutorial.menu.modes.title",
    beats: modes.flatMap((mode): MenuBeat[] => [
      {
        kind: "do",
        target: `rail-${mode}`,
        line: "tutorial.menu.modes.open",
        objectives: [
          {
            id: mode,
            label: railItemLabel(mode),
            // Already there counts: a click on the shown entry does nothing.
            done: (state) => state.screen === mode,
          },
        ],
      },
      { kind: "explain", target: `mode-${mode}`, line: MODE_LINES[mode] },
    ]),
    checklist: modes.map((mode, at) => ({ label: railItemLabel(mode), beat: 2 * at })),
  };
}

function railItemLabel(entry: RailEntry): MessageKey {
  const item = RAIL.find((each) => each.entry === entry);
  if (item === undefined) {
    throw new Error(`no rail entry ${entry}`);
  }
  return item.label;
}

/**
 * Whether the team picked is the quest's (#3544): the team step's, or,
 * when that is not one the Team Lobby offered (deleted, or a quest resumed
 * here), any it did: it offers only playable teams of the side's size.
 */
function questTeamPicked(state: MenuQuestState): boolean {
  const picked = state.teamPicked;
  if (picked === undefined) {
    return false;
  }
  const quest = state.questTeamId;
  return quest === undefined || !picked.offered.includes(quest) || picked.teamId === quest;
}

/** The modes the rail shows, in its order: the ones the modes step explains. */
const RAIL_MODES: readonly LobbyMode[] = RAIL.map(({ entry }) => entry).filter(isModeEntry);

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
  {
    id: "spec",
    title: "tutorial.menu.spec.title",
    beats: [
      {
        kind: "do",
        // The Characters entry, then, on its screen, the character to open.
        target: (state) => (state.screen === "characters" ? "character-open" : "rail-characters"),
        line: "tutorial.menu.spec.open",
        objectives: [
          {
            id: "open",
            label: "tutorial.menu.spec.openDone",
            done: (state) => state.screensShown.includes("character-builder"),
          },
        ],
      },
      {
        kind: "do",
        target: "professions",
        line: "tutorial.menu.spec.professions",
        objectives: [
          {
            id: "professions",
            label: "tutorial.menu.spec.professionsDone",
            done: (state) => state.buildChanged.professions,
          },
        ],
      },
      {
        kind: "do",
        target: "attributes",
        line: "tutorial.menu.spec.attributes",
        objectives: [
          {
            id: "attributes",
            label: "tutorial.menu.spec.attributesDone",
            done: (state) => state.buildChanged.attributes,
          },
        ],
      },
      {
        kind: "do",
        target: "skills",
        line: "tutorial.menu.spec.skills",
        objectives: [
          {
            id: "skills",
            label: "tutorial.menu.spec.skillsDone",
            done: (state) => state.buildChanged.skills,
          },
        ],
      },
      {
        kind: "do",
        target: "weapons",
        line: "tutorial.menu.spec.weapons",
        objectives: [
          {
            id: "weapons",
            label: "tutorial.menu.spec.weaponsDone",
            done: (state) => state.buildChanged.weapons,
          },
        ],
      },
      {
        kind: "do",
        target: "gear",
        line: "tutorial.menu.spec.gear",
        objectives: [
          {
            id: "gear",
            label: "tutorial.menu.spec.gearDone",
            done: (state) => state.buildChanged.gear,
          },
        ],
      },
      {
        kind: "do",
        target: "save",
        line: "tutorial.menu.spec.save",
        objectives: [
          {
            id: "save",
            label: "tutorial.menu.spec.saveDone",
            // The check that blocks Save itself: a build it refuses never ticks.
            done: (state) =>
              state.charactersSaved.some(({ after }) => validateBuild(after).length === 0),
          },
        ],
      },
    ],
  },
  {
    id: "team",
    title: "tutorial.menu.team.title",
    beats: [
      {
        kind: "do",
        target: "rail-teams",
        line: "tutorial.menu.team.open",
        objectives: [
          {
            id: "open",
            label: "tutorial.menu.team.openDone",
            done: (state) => state.screensShown.includes("teams"),
          },
        ],
      },
      {
        kind: "do",
        // The sidebar's size and New team build: a new team takes that size.
        target: "team-new",
        line: "tutorial.menu.team.new",
        objectives: [
          {
            id: "new",
            label: "tutorial.menu.team.newDone",
            done: (state) => state.teamDraft?.isNew === true && state.teamDraft.team.size === 2,
          },
        ],
      },
      { kind: "explain", target: "team-members", line: "tutorial.menu.team.members" },
      { kind: "explain", target: "team-member-build", line: "tutorial.menu.team.build" },
      { kind: "explain", target: "team-problems", line: "tutorial.menu.team.problems" },
      {
        kind: "do",
        target: "team-character",
        line: "tutorial.menu.team.character",
        objectives: [
          {
            id: "character",
            label: "tutorial.menu.team.characterDone",
            done: (state) => state.characterInTeam,
          },
        ],
      },
      {
        kind: "do",
        target: "team-character",
        line: "tutorial.menu.team.fill",
        objectives: [
          {
            id: "fill",
            label: "tutorial.menu.team.fillDone",
            done: (state) => state.teamDraft !== undefined && teamFilled(state.teamDraft.team),
          },
        ],
      },
      {
        kind: "do",
        target: "team-save",
        line: "tutorial.menu.team.save",
        objectives: [
          {
            id: "save",
            label: "tutorial.menu.team.saveDone",
            done: (state) => state.questTeamId !== undefined,
          },
        ],
      },
    ],
  },
  modesStep(RAIL_MODES),
  {
    // Team Arena's team is picked in the Team Lobby Find a match opens,
    // and the party queues once that ends (#3544).
    id: "arena",
    title: "tutorial.menu.arena.title",
    beats: [
      {
        kind: "do",
        target: "rail-team-arena",
        line: "tutorial.menu.arena.open",
        objectives: [
          {
            id: "open",
            label: "tutorial.menu.arena.openDone",
            done: (state) => state.screen === "team-arena",
          },
        ],
      },
      {
        kind: "do",
        target: "team-size",
        line: "tutorial.menu.arena.size",
        objectives: [
          {
            id: "size",
            label: "tutorial.menu.arena.sizeDone",
            done: (state) => state.teamSize === 2,
          },
        ],
      },
      {
        kind: "do",
        target: "find-match",
        line: "tutorial.menu.arena.find",
        objectives: [
          {
            id: "find",
            label: "tutorial.menu.arena.findDone",
            done: (state) => state.screensShown.includes("team-lobby"),
          },
        ],
      },
      {
        kind: "do",
        target: "team-builds",
        line: "tutorial.menu.arena.signup",
        objectives: [
          { id: "pick", label: "tutorial.menu.arena.signupDone", done: questTeamPicked },
        ],
      },
      {
        kind: "do",
        target: "team-lobby",
        line: "tutorial.menu.arena.queue",
        objectives: [
          {
            id: "queue",
            label: "tutorial.menu.arena.queueDone",
            done: (state) =>
              state.queueJoined?.mode === "team-arena" && state.queueJoined.size === 2,
          },
        ],
      },
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
  buildChanged: {
    professions: false,
    attributes: false,
    skills: false,
    weapons: false,
    gear: false,
  },
  charactersSaved: [],
  teamDraft: undefined,
  characterInTeam: false,
  teamsSaved: [],
  questTeamId: undefined,
  teamSize: undefined,
  teamPicked: undefined,
  queueJoined: undefined,
};

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** `changes`, and what the one edit from `before` to `draft` changed. */
export function foldBuildDraft(
  changes: BuildChanges,
  before: StoredCharacter,
  draft: StoredCharacter,
): BuildChanges {
  if (
    before.primaryProfession !== draft.primaryProfession ||
    before.secondaryProfession !== draft.secondaryProfession
  ) {
    return { ...changes, professions: true };
  }
  const ranks = (character: StoredCharacter): ReadonlyMap<string, number> =>
    new Map(character.attributes.map(({ attributeId, rank }) => [attributeId, rank]));
  const was = ranks(before);
  const now = ranks(draft);
  const attributes = [...new Set([...was.keys(), ...now.keys()])].some(
    (id) => (was.get(id) ?? 0) !== (now.get(id) ?? 0),
  );
  const skills = draft.skillBar.some(
    (skill, slot) => skill !== null && skill !== before.skillBar[slot],
  );
  return {
    professions: changes.professions,
    attributes: changes.attributes || (changes.professions && attributes),
    skills: changes.skills || (changes.professions && skills),
    weapons: changes.weapons || !sameJson(before.equipment.weaponSets, draft.equipment.weaponSets),
    gear: changes.gear || !sameJson(before.equipment.armor, draft.equipment.armor),
  };
}

/**
 * Whether `team` can be played (#3542): every member has a skill on its
 * bar, and the team editor reports no problem.
 */
export function teamFilled(team: StoredTeam): boolean {
  return (
    team.members.every(({ character }) => character.skillBar.some((skill) => skill !== null)) &&
    validateTeam(team).length === 0
  );
}

/** Whether `member` is a copy of `character`: its professions and skill bar. */
function copies(member: TeamCharacter, character: TeamCharacter): boolean {
  return (
    member.primaryProfession === character.primaryProfession &&
    member.secondaryProfession === character.secondaryProfession &&
    sameJson(member.skillBar, character.skillBar)
  );
}

/**
 * Whether `team` holds a copy of the player's character (#3542): the one
 * saved in the spec step, or, in a quest resumed at the team step, which
 * saw no save, any of `characters`.
 */
function holdsCharacter(
  state: MenuQuestState,
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): boolean {
  const saved = state.charactersSaved.map(({ after }) => after);
  const sources = saved.length > 0 ? saved : characters;
  return team.members.some(({ character }) => sources.some((source) => copies(character, source)));
}

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
    case "build-draft":
      return {
        ...state,
        buildChanged: foldBuildDraft(state.buildChanged, event.before, event.draft),
      };
    case "character-saved":
      return {
        ...state,
        charactersSaved: [...state.charactersSaved, { before: event.before, after: event.after }],
      };
    case "team-draft":
      return {
        ...state,
        teamDraft: { team: event.draft, isNew: event.isNew },
        characterInTeam:
          state.characterInTeam ||
          (event.isNew && holdsCharacter(state, event.draft, event.characters)),
      };
    case "team-saved":
      return {
        ...state,
        teamsSaved: [...state.teamsSaved, { team: event.team, isNew: event.isNew }],
        // A new team of two, playable: the one the modes step picks.
        questTeamId:
          event.isNew && event.team.size === 2 && teamFilled(event.team)
            ? event.team.id
            : state.questTeamId,
      };
    case "team-size":
      return { ...state, teamSize: event.size };
    case "team-picked":
      return { ...state, teamPicked: { teamId: event.teamId, offered: event.offered } };
    case "queue-joined":
      return { ...state, queueJoined: { mode: event.mode, size: event.size } };
  }
}

/** Where the player is: a step, and the beat in it. */
export interface MenuQuestCursor {
  readonly step: MenuQuestStepId;
  readonly beat: number;
}

/**
 * The quest's list for `cursor` after `state`: its step's own, if it has
 * one, else the current beat's objectives.
 */
export function menuQuestChecklist(
  cursor: MenuQuestCursor,
  state: MenuQuestState,
): readonly { readonly label: MessageKey; readonly done: boolean }[] {
  const { checklist } = menuQuestStep(cursor.step);
  if (checklist !== undefined) {
    return checklist.map(({ label, beat }) => ({ label, done: cursor.beat > beat }));
  }
  const beat = currentBeat(cursor);
  return beat.kind === "do"
    ? beat.objectives.map(({ label, done }) => ({ label, done: done(state) }))
    : [];
}

/** A launch with `menu:<id>` resumes at the start of that step, never mid-way. */
export function resumeMenuQuest(step: MenuQuestStepId): MenuQuestCursor {
  return { step, beat: 0 };
}

/** The `data-tutorial` id `beat` points at, after `state`. */
export function beatTarget(beat: MenuBeat, state: MenuQuestState): string {
  return typeof beat.target === "string" ? beat.target : beat.target(state);
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

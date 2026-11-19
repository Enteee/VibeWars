import { describe, expect, it } from "vitest";

import { newCharacter } from "../ui/build-editor.js";
import type { StoredCharacter, StoredTeam, TeamCharacter } from "../storage/schema.js";
import { teamCharacter, teamOf } from "../ui/team-builder.js";

import {
  MENU_QUEST_STEPS,
  NO_MENU_QUEST_EVENTS,
  advanceMenuQuest,
  beatTarget,
  currentBeat,
  foldMenuQuestEvent,
  isMenuQuestStepId,
  resumeMenuQuest,
  stepComplete,
  type MenuQuestEvent,
  type MenuQuestState,
  type MenuQuestStep,
} from "./menu-quest.js";

const TEAM = { id: "t1" } as unknown as StoredTeam;

/** A step to do, not just read: two objectives on two events. */
const PICK_AND_QUEUE: MenuQuestStep = {
  id: "pick-and-queue",
  title: "tutorial.menu.menu.title",
  beats: [
    {
      kind: "do",
      target: "rail",
      line: "tutorial.menu.menu.rail",
      objectives: [
        {
          id: "picked",
          label: "tutorial.menu.menu.teams",
          done: (s) => s.teamPicked !== undefined,
        },
        { id: "sized", label: "tutorial.menu.menu.teams", done: (s) => s.teamSize === 4 },
      ],
    },
  ],
};

describe("the menu quest", () => {
  it("folds events into its state", () => {
    let state = foldMenuQuestEvent(NO_MENU_QUEST_EVENTS, { kind: "screen-shown", screen: "teams" });
    state = foldMenuQuestEvent(state, { kind: "screen-shown", screen: "characters" });
    state = foldMenuQuestEvent(state, { kind: "screen-shown", screen: "teams" });
    state = foldMenuQuestEvent(state, { kind: "team-saved", team: TEAM, isNew: true });
    state = foldMenuQuestEvent(state, { kind: "team-size", size: 2 });
    state = foldMenuQuestEvent(state, { kind: "queue-joined", mode: "random-arena-2v2", size: 2 });
    expect(state.screen).toBe("teams");
    expect(state.screensShown).toEqual(["teams", "characters"]);
    expect(state.teamsSaved).toEqual([{ team: TEAM, isNew: true }]);
    expect(state.teamSize).toBe(2);
    expect(state.queueJoined).toEqual({ mode: "random-arena-2v2", size: 2 });
  });

  it("ticks an objective once its event came, and completes a step only when all hold", () => {
    const [picked, sized] =
      PICK_AND_QUEUE.beats[0]?.kind === "do" ? PICK_AND_QUEUE.beats[0].objectives : [];
    let state = foldMenuQuestEvent(NO_MENU_QUEST_EVENTS, { kind: "team-picked", teamId: "t1" });
    expect(picked?.done(state)).toBe(true);
    expect(sized?.done(state)).toBe(false);
    expect(stepComplete(PICK_AND_QUEUE, state)).toBe(false);
    state = foldMenuQuestEvent(state, { kind: "team-size", size: 4 });
    expect(stepComplete(PICK_AND_QUEUE, state)).toBe(true);
  });

  it("moves past an explanation on Got it only", () => {
    const start = resumeMenuQuest("menu");
    expect(advanceMenuQuest(start, NO_MENU_QUEST_EVENTS, false)).toEqual(start);
    expect(advanceMenuQuest(start, NO_MENU_QUEST_EVENTS, true)).toEqual({ step: "menu", beat: 1 });
  });

  it("walks the main menu's three explanations, rail, Characters, Teams, then on to the spec", () => {
    let cursor = advanceMenuQuest(resumeMenuQuest("menu"), NO_MENU_QUEST_EVENTS, false);
    const targets: string[] = [];
    while (cursor !== "done" && cursor.step === "menu") {
      targets.push(beatTarget(currentBeat(cursor), NO_MENU_QUEST_EVENTS));
      cursor = advanceMenuQuest(cursor, NO_MENU_QUEST_EVENTS, true);
    }
    expect(targets).toEqual(["rail", "rail-characters", "rail-teams"]);
    expect(cursor).toEqual({ step: "spec", beat: 0 });
  });

  it("resumes a saved step at its first beat", () => {
    for (const { id } of MENU_QUEST_STEPS) {
      expect(resumeMenuQuest(id)).toEqual({ step: id, beat: 0 });
    }
  });

  it("knows its step ids, and no others", () => {
    expect(isMenuQuestStepId("menu")).toBe(true);
    expect(isMenuQuestStepId("x")).toBe(false);
  });
});

/** A valid build to start from: a Warrior/Monk with two skills and points spent. */
const START: StoredCharacter = {
  ...newCharacter("c1"),
  secondaryProfession: "monk",
  attributes: [{ attributeId: "warrior.tactics", rank: 8 }],
  skillBar: ["warrior.sprint", "monk.orison-of-healing", null, null, null, null, null, null],
};

function fold(events: readonly MenuQuestEvent[]): MenuQuestState {
  return events.reduce(foldMenuQuestEvent, NO_MENU_QUEST_EVENTS);
}

function draft(before: StoredCharacter, after: StoredCharacter): MenuQuestEvent {
  return { kind: "build-draft", before, draft: after };
}

/** The spec step from `events`: where it is, or done with it. */
function specAfter(events: readonly MenuQuestEvent[]): number | "past" {
  const cursor = advanceMenuQuest(resumeMenuQuest("spec"), fold(events), false);
  return cursor !== "done" && cursor.step === "spec" ? cursor.beat : "past";
}

describe("the spec step (#3541)", () => {
  const switched: StoredCharacter = {
    ...START,
    primaryProfession: "ranger",
    attributes: [],
    skillBar: Array.from({ length: 8 }, () => null),
  };
  const opened: MenuQuestEvent = { kind: "screen-shown", screen: "character-builder" };

  it("points at Characters, then at the character to open on its screen", () => {
    const [open] = MENU_QUEST_STEPS[1].beats;
    expect(beatTarget(open, NO_MENU_QUEST_EVENTS)).toBe("rail-characters");
    expect(beatTarget(open, fold([{ kind: "screen-shown", screen: "characters" }]))).toBe(
      "character-open",
    );
    expect(specAfter([{ kind: "screen-shown", screen: "characters" }])).toBe(0);
    expect(specAfter([opened])).toBe(1);
  });

  it("ticks the switch on a primary or a secondary profession changed", () => {
    expect(fold([draft(START, switched)]).buildChanged.professions).toBe(true);
    const secondary = fold([draft(START, { ...START, secondaryProfession: "mesmer" })]);
    expect(secondary.buildChanged.professions).toBe(true);
    expect(specAfter([opened, draft(START, switched)])).toBe(2);
  });

  it("never ticks attributes or skills for the reset a switch makes", () => {
    const { buildChanged } = fold([draft(START, switched)]);
    expect(buildChanged.attributes).toBe(false);
    expect(buildChanged.skills).toBe(false);
    expect(buildChanged.weapons).toBe(false);
  });

  it("ticks attributes and skills only after the switch", () => {
    const ranked = { ...switched, attributes: [{ attributeId: "ranger.marksmanship", rank: 9 }] };
    const before = fold([draft(START, { ...START, attributes: [] })]);
    expect(before.buildChanged.attributes).toBe(false);
    const after = fold([draft(START, switched), draft(switched, ranked)]);
    expect(after.buildChanged.attributes).toBe(true);
    expect(after.buildChanged.skills).toBe(false);
    const skilled = { ...ranked, skillBar: ["ranger.barrage", ...ranked.skillBar.slice(1)] };
    const withSkill = foldMenuQuestEvent(after, draft(ranked, skilled));
    expect(withSkill.buildChanged.skills).toBe(true);
  });

  it("does not tick skills for a slot emptied", () => {
    const emptied = { ...START, skillBar: [null, ...START.skillBar.slice(1)] };
    const state = fold([draft(START, switched), draft(START, emptied)]);
    expect(state.buildChanged.skills).toBe(false);
  });

  it("ticks a weapon and a piece of gear changed, and keeps the tick when undone", () => {
    const [set1, , set3, set4] = START.equipment.weaponSets;
    const armed: StoredCharacter = {
      ...START,
      equipment: { ...START.equipment, weaponSets: [set1, set1, set3, set4] },
    };
    const dressed: StoredCharacter = {
      ...START,
      equipment: {
        ...START.equipment,
        armor: {
          ...START.equipment.armor,
          head: { ...START.equipment.armor.head, headgearAttributeId: "warrior.tactics" },
        },
      },
    };
    const state = fold([draft(START, armed), draft(armed, START)]);
    expect(state.buildChanged.weapons).toBe(true);
    expect(state.buildChanged.gear).toBe(false);
    expect(foldMenuQuestEvent(state, draft(START, dressed)).buildChanged.gear).toBe(true);
  });

  it("completes Save on a valid build saved, never on a refused one", () => {
    const changes: MenuQuestEvent[] = [opened, draft(START, switched)];
    const done = fold(changes);
    const all = {
      ...done,
      buildChanged: {
        professions: true,
        attributes: true,
        skills: true,
        weapons: true,
        gear: true,
      },
    };
    const at = (state: MenuQuestState): number | "past" => {
      const cursor = advanceMenuQuest(resumeMenuQuest("spec"), state, false);
      return cursor !== "done" && cursor.step === "spec" ? cursor.beat : "past";
    };
    expect(at(all)).toBe(6);
    const invalid = {
      ...START,
      skillBar: ["warrior.sprint", "warrior.sprint", ...START.skillBar.slice(2)],
    };
    const refused = foldMenuQuestEvent(all, {
      kind: "character-saved",
      before: START,
      after: invalid,
    });
    expect(at(refused)).toBe(6);
    const saved = foldMenuQuestEvent(all, { kind: "character-saved", before: START, after: START });
    expect(at(saved)).toBe("past");
  });
});

/** The team step from `events`: where it is, or done with it. */
function teamAfter(state: MenuQuestState, gotIt = false): number | "past" {
  let cursor = advanceMenuQuest(resumeMenuQuest("team"), state, false);
  // The three explanations are read: Got it on each.
  while (gotIt && cursor !== "done" && currentBeat(cursor).kind === "explain") {
    cursor = advanceMenuQuest(cursor, state, true);
  }
  return cursor !== "done" && cursor.step === "team" ? cursor.beat : "past";
}

describe("the team step (#3542)", () => {
  const blank = (id: string): TeamCharacter => teamCharacter(newCharacter(id), id);
  const opened = teamOf("t1", 2, [blank("m1"), blank("m2")]);
  const copied = teamOf("t1", 2, [teamCharacter(START, "m1"), blank("m2")]);
  const filled = teamOf("t1", 2, [teamCharacter(START, "m1"), teamCharacter(START, "m2")]);
  const teams: MenuQuestEvent = { kind: "screen-shown", screen: "teams" };
  const draft = (team: StoredTeam, isNew = true): MenuQuestEvent => ({
    kind: "team-draft",
    draft: team,
    isNew,
    characters: [START],
  });

  it("follows the spec step", () => {
    expect(MENU_QUEST_STEPS.map(({ id }) => id)).toEqual(["menu", "spec", "team"]);
  });

  it("opens Teams, then a new team of two", () => {
    expect(teamAfter(NO_MENU_QUEST_EVENTS)).toBe(0);
    expect(teamAfter(fold([teams]))).toBe(1);
    expect(teamAfter(fold([teams, draft(opened)]))).toBe(2);
  });

  it("never takes a team of another size, nor one already stored", () => {
    const four = teamOf("t1", 4, [blank("m1"), blank("m2"), blank("m3"), blank("m4")]);
    expect(teamAfter(fold([teams, draft(four)]))).toBe(1);
    expect(teamAfter(fold([teams, draft(opened, false)]))).toBe(1);
  });

  it("explains the editor, then waits for the character in the team", () => {
    expect(teamAfter(fold([teams, draft(opened)]), true)).toBe(5);
    expect(teamAfter(fold([teams, draft(opened), draft(copied)]), true)).toBe(6);
  });

  it("takes the character saved in the spec step over the player's others", () => {
    const other = { ...START, id: "c2", secondaryProfession: "ranger" as const };
    const saved = fold([
      { kind: "character-saved", before: undefined, after: other },
      teams,
      draft(opened),
      draft(copied),
    ]);
    expect(saved.characterInTeam).toBe(false);
    expect(fold([teams, draft(opened), draft(copied)]).characterInTeam).toBe(true);
  });

  it("keeps the character ticked once in, even if replaced later", () => {
    const state = fold([teams, draft(opened), draft(copied), draft(opened)]);
    expect(state.characterInTeam).toBe(true);
    expect(teamAfter(state, true)).toBe(6);
  });

  it("is filled only with every member built and no problem", () => {
    expect(teamAfter(fold([teams, draft(opened), draft(filled)]), true)).toBe(7);
    const unnamed = { ...filled, name: " " };
    expect(teamAfter(fold([teams, draft(opened), draft(copied), draft(unnamed)]), true)).toBe(6);
  });

  it("completes Save on the new team saved, playable, and remembers its id", () => {
    const ready = fold([teams, draft(opened), draft(filled)]);
    const unnamed = { ...filled, name: "" };
    const refused = foldMenuQuestEvent(ready, { kind: "team-saved", team: unnamed, isNew: true });
    expect(teamAfter(refused, true)).toBe(7);
    expect(refused.questTeamId).toBeUndefined();
    const old = foldMenuQuestEvent(ready, { kind: "team-saved", team: filled, isNew: false });
    expect(teamAfter(old, true)).toBe(7);
    const saved = foldMenuQuestEvent(ready, { kind: "team-saved", team: filled, isNew: true });
    expect(teamAfter(saved, true)).toBe("past");
    expect(saved.questTeamId).toBe("t1");
  });
});

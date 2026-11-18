import { describe, expect, it } from "vitest";

import type { StoredTeam } from "../storage/schema.js";

import {
  MENU_QUEST_STEPS,
  NO_MENU_QUEST_EVENTS,
  advanceMenuQuest,
  currentBeat,
  foldMenuQuestEvent,
  isMenuQuestStepId,
  resumeMenuQuest,
  stepComplete,
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

  it("walks the main menu's three explanations, rail, Characters, Teams, then is done", () => {
    let cursor = advanceMenuQuest(resumeMenuQuest("menu"), NO_MENU_QUEST_EVENTS, false);
    const targets: string[] = [];
    while (cursor !== "done") {
      targets.push(currentBeat(cursor).target);
      cursor = advanceMenuQuest(cursor, NO_MENU_QUEST_EVENTS, true);
    }
    expect(targets).toEqual(["rail", "rail-characters", "rail-teams"]);
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

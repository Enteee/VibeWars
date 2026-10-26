import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  MAX_TEAM_SIZE,
  addMember,
  moveMember,
  newTeam,
  removeMember,
  teamCounters,
} from "./team-builder.js";
import {
  addableCharacters,
  dragMember,
  isTeamUnsaved,
  markedCells,
  memberSkillCells,
  pastedTeam,
  placesLeft,
  teamEditorProblems,
  topAttributes,
} from "./team-editor.js";

function character(id: string): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: id,
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: 8 }, () => null),
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

const roster = [character("a"), character("b"), character("c")];

describe("isTeamUnsaved (#573)", () => {
  const opened = addMember(addMember(newTeam("t1"), "a"), "b");

  it("is false for the team as opened, however late it was touched", () => {
    expect(isTeamUnsaved(opened, { ...opened, updatedAt: opened.updatedAt + 5000 })).toBe(false);
  });

  it("is true for a new name, an added, removed or moved member", () => {
    expect(isTeamUnsaved(opened, { ...opened, name: "Renamed" })).toBe(true);
    expect(isTeamUnsaved(opened, addMember(opened, "c"))).toBe(true);
    expect(isTeamUnsaved(opened, removeMember(opened, 0))).toBe(true);
    expect(isTeamUnsaved(opened, moveMember(opened, 0, 1))).toBe(true);
  });

  it("is false again once an edit is undone", () => {
    expect(isTeamUnsaved(opened, moveMember(moveMember(opened, 0, 1), 1, -1))).toBe(false);
  });
});

describe("pastedTeam (#577)", () => {
  it("is unsaved and not stored, so Save stores it and Back asks", () => {
    const state = pastedTeam({ ...addMember(newTeam("t1"), "a"), name: "Duo" });

    expect(state.stored).toBe(false);
    expect(isTeamUnsaved(state.opened, state.team)).toBe(true);
  });
});

describe("teamEditorProblems (#573)", () => {
  const texts = (team: Parameters<typeof teamEditorProblems>[0]) =>
    teamEditorProblems(team, roster).map((problem) => [problem.text, problem.blocking]);

  it("blocks a new team: it has no members", () => {
    expect(texts(newTeam("t1"))).toEqual([["A team needs at least one member.", true]]);
  });

  it("asks for a name in a sentence", () => {
    expect(texts({ ...addMember(newTeam("t1"), "a"), name: "  " })).toEqual([
      ["Give the team a name.", true],
    ]);
  });

  it("names the slot of a member whose character was deleted", () => {
    expect(texts(addMember(addMember(newTeam("t1"), "a"), "gone"))).toEqual([
      ["Slot 2 references a character that no longer exists.", true],
    ]);
  });

  it("says a full team is full, as a hint that never blocks", () => {
    const members = Array.from({ length: MAX_TEAM_SIZE }, (_, index) => ({
      characterId: `m${String(index)}`,
    }));
    const characters = members.map((member) => character(member.characterId));
    expect(
      teamEditorProblems({ ...newTeam("t1"), members }, characters).map((problem) => [
        problem.text,
        problem.blocking,
      ]),
    ).toEqual([[`The team is full: ${String(MAX_TEAM_SIZE)} members.`, false]]);
  });
});

describe("addableCharacters (#573)", () => {
  it("offers everyone not on the team yet, in roster order", () => {
    const team = addMember(newTeam("t1"), "b");
    expect(addableCharacters(team, roster).map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("placesLeft (#574)", () => {
  it("counts down from the team size and stops at nought", () => {
    expect(placesLeft(newTeam("t1"))).toBe(MAX_TEAM_SIZE);
    expect(placesLeft(addMember(newTeam("t1"), "a"))).toBe(MAX_TEAM_SIZE - 1);
    const members = Array.from({ length: MAX_TEAM_SIZE + 1 }, (_, index) => ({
      characterId: `m${String(index)}`,
    }));
    expect(placesLeft({ ...newTeam("t1"), members })).toBe(0);
  });
});

describe("memberSkillCells (#574)", () => {
  it("gives eight cells: name, type and the HUD's cost, null where empty", () => {
    const bar = [
      "monk.orison-of-healing",
      null,
      "warrior.backbreaker",
      null,
      null,
      null,
      null,
      null,
    ];
    const cells = memberSkillCells({ ...character("a"), skillBar: bar });
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({
      skillId: "monk.orison-of-healing",
      name: "Orison of Healing",
      type: "spell",
      cost: "5e",
      elite: false,
    });
    expect(cells[1]).toBeNull();
    expect(cells[2]).toMatchObject({ name: "Backbreaker", cost: "9a", elite: true });
  });

  it("shows what an illegal bar stores: an unknown id by its id, a short bar padded", () => {
    const cells = memberSkillCells({ ...character("a"), skillBar: ["gone.skill"] });
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({
      skillId: "gone.skill",
      name: "gone.skill",
      type: undefined,
      cost: "",
      elite: false,
    });
    expect(cells.slice(1).every((cell) => cell === null)).toBe(true);
  });
});

describe("topAttributes (#574)", () => {
  it("lists the three highest ranks, highest first, ties in stored order, no zeroes", () => {
    const attributes = [
      { attributeId: "warrior.strength", rank: 9 },
      { attributeId: "warrior.hammer-mastery", rank: 12 },
      { attributeId: "warrior.tactics", rank: 0 },
      { attributeId: "warrior.axe-mastery", rank: 9 },
      { attributeId: "warrior.swordsmanship", rank: 3 },
    ];
    expect(topAttributes({ ...character("a"), attributes })).toEqual([
      "Hammer Mastery 12",
      "Strength 9",
      "Axe Mastery 9",
    ]);
  });
});

describe("dragMember (#574)", () => {
  const team = ["a", "b", "c", "d"].reduce((t, id) => addMember(t, id), newTeam("t1"));
  const order = (t: typeof team) => t.members.map((member) => member.characterId);

  it("drags a row to the order the same number of ↑ or ↓ presses gives", () => {
    expect(order(dragMember(team, 0, 2))).toEqual(order(moveMember(moveMember(team, 0, 1), 1, 1)));
    expect(order(dragMember(team, 0, 2))).toEqual(["b", "c", "a", "d"]);
    expect(order(dragMember(team, 3, 0))).toEqual(
      order(moveMember(moveMember(moveMember(team, 3, -1), 2, -1), 1, -1)),
    );
    expect(order(dragMember(team, 3, 0))).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves the team as it is for a drop on itself or off the end", () => {
    expect(dragMember(team, 1, 1)).toBe(team);
    expect(order(dragMember(team, -1, 2))).toEqual(order(team));
  });
});

describe("markedCells (#575)", () => {
  const withBar = (id: string, bar: readonly (string | null)[]): StoredCharacter => ({
    ...character(id),
    skillBar: Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null),
  });
  const roster = [
    withBar("a", ["warrior.distracting-blow", "warrior.backbreaker"]),
    withBar("b", [null, "monk.mend-affliction", "warrior.distracting-blow"]),
  ];
  const team = addMember(addMember(newTeam("t1"), "a"), "b");
  const counters = teamCounters(team.members, roster);

  it("marks exactly a counter's cells", () => {
    expect(markedCells({ kind: "counter", id: "interrupt" }, counters, team, roster)).toEqual(
      new Set(["a:0", "b:2"]),
    );
    expect(markedCells({ kind: "counter", id: "empty" }, counters, team, roster)).toEqual(
      new Set(["a:2", "a:3", "a:4", "a:5", "a:6", "a:7", "b:0", "b:3", "b:4", "b:5", "b:6", "b:7"]),
    );
  });

  it("finds every copy of a skill on the team", () => {
    expect(
      markedCells({ kind: "skill", skillId: "warrior.distracting-blow" }, counters, team, roster),
    ).toEqual(new Set(["a:0", "b:2"]));
    expect(
      markedCells({ kind: "skill", skillId: "monk.mend-affliction" }, counters, team, roster),
    ).toEqual(new Set(["b:1"]));
  });
});

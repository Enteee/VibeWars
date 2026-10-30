import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type TeamCharacter,
} from "../storage/schema.js";
import {
  MAX_TEAM_SIZE,
  addMember,
  moveMember,
  newTeam,
  removeMember,
  replaceMember,
  teamCounters,
} from "./team-builder.js";
import {
  copyIntoTeam,
  dragMember,
  isTeamUnsaved,
  markedCells,
  memberSkillCells,
  pastedTeam,
  placesLeft,
  teamEditorProblems,
  topAttributes,
} from "./team-editor.js";

function character(id: string): TeamCharacter {
  return {
    id,
    name: id,
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: 8 }, () => null),
    equipment: defaultBuildEquipment("warrior"),
  };
}

/** A team of a member per id, in order. */
function teamOf(...ids: readonly string[]) {
  return ids.reduce((team, id) => addMember(team, character(id)), newTeam("t1"));
}

describe("isTeamUnsaved (#573)", () => {
  const opened = teamOf("a", "b");

  it("is false for the team as opened, however late it was touched", () => {
    expect(isTeamUnsaved(opened, { ...opened, updatedAt: opened.updatedAt + 5000 })).toBe(false);
  });

  it("is true for a new name, an added, removed or moved member", () => {
    expect(isTeamUnsaved(opened, { ...opened, name: "Renamed" })).toBe(true);
    expect(isTeamUnsaved(opened, addMember(opened, character("c")))).toBe(true);
    expect(isTeamUnsaved(opened, removeMember(opened, 0))).toBe(true);
    expect(isTeamUnsaved(opened, moveMember(opened, 0, 1))).toBe(true);
  });

  it("is false again once an edit is undone", () => {
    expect(isTeamUnsaved(opened, moveMember(moveMember(opened, 0, 1), 1, -1))).toBe(false);
  });

  it("is true for a member's build edited in the build editor (#1452)", () => {
    const edited = {
      ...character("a"),
      skillBar: ["warrior.sever-artery", ...Array(7).fill(null)],
    };
    expect(isTeamUnsaved(opened, replaceMember(opened, edited))).toBe(true);
  });

  it("is false for the same build with its fields in another order", () => {
    const { name, ...rest } = character("a");
    expect(isTeamUnsaved(opened, replaceMember(opened, { ...rest, name }))).toBe(false);
  });
});

describe("copyIntoTeam (#1452)", () => {
  const solo: StoredCharacter = {
    ...character("solo"),
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    updatedAt: 1,
  };

  it("adds a copy under a new id, which an edit to the Solo character does not reach", () => {
    const team = copyIntoTeam(newTeam("t1"), solo, "m1");
    const copy = team.members[0]?.character;
    expect(copy).toEqual({ ...character("solo"), id: "m1" });

    // The copy shares no array with the Solo character it came from.
    (solo.skillBar as (string | null)[])[0] = "warrior.sever-artery";
    expect(copy?.skillBar[0]).toBeNull();
  });

  it("copies the same character twice as two members", () => {
    const team = copyIntoTeam(copyIntoTeam(newTeam("t1"), solo, "m1"), solo, "m2");
    expect(team.members.map((m) => m.character.id)).toEqual(["m1", "m2"]);
  });
});

describe("pastedTeam (#577)", () => {
  it("is unsaved and not stored, so Save stores it and Back asks", () => {
    const state = pastedTeam({ ...teamOf("a"), name: "Duo" });

    expect(state.stored).toBe(false);
    expect(isTeamUnsaved(state.opened, state.team)).toBe(true);
  });
});

describe("teamEditorProblems (#573)", () => {
  const texts = (team: Parameters<typeof teamEditorProblems>[0]) =>
    teamEditorProblems(team).map((problem) => [problem.text, problem.blocking]);

  it("blocks a new team: it has no members", () => {
    expect(texts(newTeam("t1"))).toEqual([["A team needs at least one member.", true]]);
  });

  it("asks for a name in a sentence", () => {
    expect(texts({ ...teamOf("a"), name: "  " })).toEqual([["Give the team a name.", true]]);
  });

  it("names the slot and the name of an illegal member build (#1452)", () => {
    const illegal = { ...character("Bravo"), skillBar: ["monk.orison-of-healing"] };
    expect(texts(addMember(teamOf("a"), illegal))).toEqual([
      ["Slot 2, Bravo, is not a legal build: open it to see why.", true],
    ]);
  });

  it("says a full team is full, as a hint that never blocks", () => {
    const ids = Array.from({ length: MAX_TEAM_SIZE }, (_, index) => `m${String(index)}`);
    expect(texts(teamOf(...ids))).toEqual([
      [`The team is full: ${String(MAX_TEAM_SIZE)} members.`, false],
    ]);
  });
});

describe("placesLeft (#574)", () => {
  it("counts down from the team size and stops at nought", () => {
    expect(placesLeft(newTeam("t1"))).toBe(MAX_TEAM_SIZE);
    expect(placesLeft(teamOf("a"))).toBe(MAX_TEAM_SIZE - 1);
    const members = Array.from({ length: MAX_TEAM_SIZE + 1 }, (_, index) => ({
      character: character(`m${String(index)}`),
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
  const team = teamOf("a", "b", "c", "d");
  const order = (t: typeof team) => t.members.map((member) => member.character.id);

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
  const withBar = (id: string, bar: readonly (string | null)[]): TeamCharacter => ({
    ...character(id),
    skillBar: Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null),
  });
  const team = addMember(
    addMember(newTeam("t1"), withBar("a", ["warrior.distracting-blow", "warrior.backbreaker"])),
    withBar("b", [null, "monk.mend-condition", "warrior.distracting-blow"]),
  );
  const counters = teamCounters(team.members);

  it("marks exactly a counter's cells", () => {
    expect(markedCells({ kind: "counter", id: "interrupt" }, counters, team)).toEqual(
      new Set(["a:0", "b:2"]),
    );
    expect(markedCells({ kind: "counter", id: "empty" }, counters, team)).toEqual(
      new Set(["a:2", "a:3", "a:4", "a:5", "a:6", "a:7", "b:0", "b:3", "b:4", "b:5", "b:6", "b:7"]),
    );
  });

  it("finds every copy of a skill on the team", () => {
    expect(
      markedCells({ kind: "skill", skillId: "warrior.distracting-blow" }, counters, team),
    ).toEqual(new Set(["a:0", "b:2"]));
    expect(markedCells({ kind: "skill", skillId: "monk.mend-condition" }, counters, team)).toEqual(
      new Set(["b:1"]),
    );
  });
});

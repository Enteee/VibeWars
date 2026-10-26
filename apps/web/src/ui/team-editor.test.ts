import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { MAX_TEAM_SIZE, addMember, moveMember, newTeam, removeMember } from "./team-builder.js";
import { addableCharacters, isTeamUnsaved, teamEditorProblems } from "./team-editor.js";

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

import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCHEMA_VERSION,
  TEAM_BUILD_SIZES,
  type StoredCharacter,
  type TeamCharacter,
} from "../storage/schema.js";
import { setProfessions, setRank } from "./build-editor.js";
import { summariseGear } from "./gear-editor.js";
import {
  moveMember,
  replaceMember,
  teamCounters,
  teamOf as teamOfMembers,
} from "./team-builder.js";
import {
  copyOntoMember,
  dragMember,
  dropSkill,
  isTeamUnsaved,
  markedCells,
  memberSkillCells,
  memberStats,
  memberToggle,
  pastedTeam,
  saveTitle,
  skillDropRefusal,
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

/** A team of a member per id (#2225): as many as a team size. */
function teamOf(...ids: readonly string[]) {
  return membersTeam(ids.map(character));
}

/** A team of `members`: as many as a team size. */
function membersTeam(members: readonly TeamCharacter[]) {
  const size = TEAM_BUILD_SIZES.find((s) => s === members.length);
  if (size === undefined) {
    throw new Error(`no team size of ${String(members.length)}`);
  }
  return teamOfMembers("t1", size, members);
}

describe("isTeamUnsaved (#573)", () => {
  const opened = teamOf("a", "b");

  it("is false for the team as opened, however late it was touched", () => {
    expect(isTeamUnsaved(opened, { ...opened, updatedAt: opened.updatedAt + 5000 })).toBe(false);
  });

  it("is true for a new name, a replaced or moved member", () => {
    expect(isTeamUnsaved(opened, { ...opened, name: "Renamed" })).toBe(true);
    expect(isTeamUnsaved(opened, copyOntoMember(opened, "a", character("c")))).toBe(true);
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

describe("copyOntoMember (#1452, #2225)", () => {
  const solo: StoredCharacter = {
    ...character("solo"),
    name: "Solo",
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    updatedAt: 1,
  };

  it("replaces the member, in its slot and under its id, with a copy the Solo character's edits do not reach", () => {
    const team = copyOntoMember(teamOf("a", "b"), "b", solo);
    expect(team.members).toHaveLength(2);
    const copy = team.members[1]?.character;
    expect(copy).toEqual({ ...character("solo"), name: "Solo", id: "b" });

    // The copy shares no array with the Solo character it came from.
    (solo.skillBar as (string | null)[])[0] = "warrior.sever-artery";
    expect(copy?.skillBar[0]).toBeNull();
  });

  it("copies the same character onto two members as two members", () => {
    const team = copyOntoMember(copyOntoMember(teamOf("a", "b"), "a", solo), "b", solo);
    expect(team.members.map((m) => [m.character.id, m.character.name])).toEqual([
      ["a", "Solo"],
      ["b", "Solo"],
    ]);
  });

  it("onto the member it was copied from, is a fresh copy again", () => {
    const once = copyOntoMember(teamOf("a", "b"), "a", solo);
    const edited = replaceMember(once, { ...character("a"), name: "Edited" });
    expect(copyOntoMember(edited, "a", solo).members[0]?.character.name).toBe("Solo");
  });
});

describe("skillDropRefusal and dropSkill (#2225)", () => {
  const monk: TeamCharacter = { ...character("m"), name: "Mira", primaryProfession: "monk" };

  it("equips a skill the member may hold to the slot it was dropped on", () => {
    const { team } = dropSkill(teamOf("a", "b"), "b", 3, "warrior.sever-artery");
    expect(team.members[1]?.character.skillBar[3]).toBe("warrior.sever-artery");
    expect(team.members[0]?.character.skillBar[3]).toBeNull();
  });

  it("refuses another profession's skill, saying why, and changes nothing", () => {
    const team = membersTeam([character("a"), monk]);
    expect(skillDropRefusal(monk, "warrior.sever-artery")).toBe("Monk can't use Sever Artery");
    expect(dropSkill(team, "m", 0, "warrior.sever-artery").team).toBe(team);
  });

  it("refuses a skill already on the bar", () => {
    const team = dropSkill(teamOf("a", "b"), "a", 0, "warrior.sever-artery").team;
    const member = team.members[0]?.character ?? character("a");
    expect(skillDropRefusal(member, "warrior.sever-artery")).toBe(
      "Sever Artery is already on a's bar",
    );
    expect(dropSkill(team, "a", 5, "warrior.sever-artery").team).toBe(team);
  });

  it("lets a second elite take the first's place, and says so", () => {
    const team = dropSkill(teamOf("a", "b"), "a", 0, "warrior.hundred-blades").team;
    const dropped = dropSkill(team, "a", 4, "warrior.battle-rage");
    const bar = dropped.team.members[0]?.character.skillBar;
    expect(bar?.filter((id) => id !== null)).toEqual(["warrior.battle-rage"]);
    expect(dropped.notice).toBe(
      "Battle Rage replaced Hundred Blades: only one elite skill per bar.",
    );
  });
});

describe("memberStats (#2225)", () => {
  it("reads the Character Builder's set 1 Health and Energy, and follows a rank change", () => {
    const solo = setProfessions(
      { ...character("a"), schemaVersion: CHARACTER_SCHEMA_VERSION, updatedAt: 1 },
      "elementalist",
      undefined,
    );
    const summary = summariseGear(solo, 0);
    expect(memberStats(solo)).toEqual({
      health: summary?.maxHealth,
      energy: summary?.maxEnergy,
    });
    const raised = setRank(solo, "elementalist.energy-storage", 12);
    expect(memberStats(raised)?.energy).toBeGreaterThan(memberStats(solo)?.energy ?? 0);
  });
});

describe("pastedTeam (#577)", () => {
  it("is unsaved and not stored, so Save stores it and Back asks", () => {
    const state = pastedTeam({ ...teamOf("a", "b"), name: "Duo" });

    expect(state.stored).toBe(false);
    expect(isTeamUnsaved(state.opened, state.team)).toBe(true);
  });
});

describe("teamEditorProblems (#573)", () => {
  const texts = (team: Parameters<typeof teamEditorProblems>[0]) =>
    teamEditorProblems(team).map((problem) => [problem.text, problem.blocking]);

  it("has none for a playable team", () => {
    expect(texts(teamOf("a", "b"))).toEqual([]);
  });

  it("asks for a name in a sentence", () => {
    expect(texts({ ...teamOf("a", "b"), name: "  " })).toEqual([["Give the team a name.", true]]);
  });

  it("names the slot and the name of an illegal member build (#1452)", () => {
    const illegal = { ...character("Bravo"), skillBar: ["monk.orison-of-healing"] };
    expect(texts(membersTeam([character("a"), illegal]))).toEqual([
      ["Slot 2, Bravo, is not a legal build: open it to see why.", true],
    ]);
  });
});

describe("saveTitle (#2110)", () => {
  it("saves a team with problems, naming its first", () => {
    expect(saveTitle(teamEditorProblems({ ...teamOf("a", "b"), name: "" }))).toBe(
      "Save this team (it has problems: Give the team a name.)",
    );
  });

  it("names no problem for a playable team, a full one included", () => {
    const ids = Array.from({ length: 8 }, (_, index) => `m${String(index)}`);
    expect([
      saveTitle(teamEditorProblems(teamOf("a", "b"))),
      saveTitle(teamEditorProblems(teamOf(...ids))),
    ]).toEqual(["Save this team", "Save this team"]);
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
  const team = membersTeam([
    withBar("a", ["warrior.distracting-blow", "warrior.backbreaker"]),
    withBar("b", [null, "monk.mend-condition", "warrior.distracting-blow"]),
  ]);
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

describe("memberToggle (#2536)", () => {
  const [a, b] = [character("a"), character("b")];

  it("is ▼, not expanded, for a closed member, and ▲, expanded, once it is open", () => {
    expect(memberToggle(a, undefined)).toEqual({
      glyph: "▼",
      expanded: false,
      label: "edit a here",
    });
    expect(memberToggle(a, "a")).toEqual({ glyph: "▲", expanded: true, label: "close a" });
  });

  it("flips the first member back to ▼ when another opens", () => {
    expect(memberToggle(a, "b").glyph).toBe("▼");
    expect(memberToggle(b, "b").glyph).toBe("▲");
  });
});

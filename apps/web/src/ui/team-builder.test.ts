import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  MAX_TEAM_SIZE,
  addMember,
  duplicateTeam,
  moveMember,
  newTeam,
  professionMix,
  removeMember,
  teamCounters,
  validateTeam,
} from "./team-builder.js";

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

describe("newTeam", () => {
  it("starts empty with the default ruleset", () => {
    const team = newTeam("t1");
    expect(team.members).toEqual([]);
    expect(team.rulesetId).toBe("minimal-gw-inspired-pvp-v1");
  });
});

describe("addMember / removeMember", () => {
  it("appends members in order", () => {
    let team = addMember(newTeam("t1"), "a");
    team = addMember(team, "b");
    expect(team.members.map((m) => m.characterId)).toEqual(["a", "b"]);
  });

  it("allows the same character in more than one slot", () => {
    // Two players can legitimately bring the same build to a team.
    let team = addMember(newTeam("t1"), "a");
    team = addMember(team, "a");
    expect(team.members).toHaveLength(2);
  });

  it("supports well past 8 members — 8 is not hardcoded anywhere", () => {
    let team = newTeam("t1");
    for (let i = 0; i < 12; i += 1) {
      team = addMember(team, `c${String(i)}`);
    }
    expect(team.members).toHaveLength(12);
  });

  it("refuses to grow past the configured maximum", () => {
    let team = newTeam("t1");
    for (let i = 0; i < MAX_TEAM_SIZE + 5; i += 1) {
      team = addMember(team, `c${String(i)}`);
    }
    expect(team.members).toHaveLength(MAX_TEAM_SIZE);
  });

  it("removes the right member by index", () => {
    let team = addMember(newTeam("t1"), "a");
    team = addMember(team, "b");
    team = addMember(team, "c");
    expect(removeMember(team, 1).members.map((m) => m.characterId)).toEqual(["a", "c"]);
  });
});

describe("moveMember", () => {
  function threeMemberTeam() {
    let team = addMember(newTeam("t1"), "a");
    team = addMember(team, "b");
    return addMember(team, "c");
  }

  it("moves a member toward the front", () => {
    const moved = moveMember(threeMemberTeam(), 2, -1);
    expect(moved.members.map((m) => m.characterId)).toEqual(["a", "c", "b"]);
  });

  it("moves a member toward the back", () => {
    const moved = moveMember(threeMemberTeam(), 0, 1);
    expect(moved.members.map((m) => m.characterId)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op past either end rather than losing a member", () => {
    const team = threeMemberTeam();
    expect(moveMember(team, 0, -1).members.map((m) => m.characterId)).toEqual(["a", "b", "c"]);
    expect(moveMember(team, 2, 1).members.map((m) => m.characterId)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    const team = threeMemberTeam();
    expect(moveMember(team, 99, -1).members).toHaveLength(3);
  });
});

describe("validateTeam", () => {
  it("accepts a team whose members all exist", () => {
    const team = addMember(newTeam("t1"), "a");
    expect(validateTeam(team, [character("a")])).toEqual([]);
  });

  it("rejects an empty team", () => {
    expect(validateTeam(newTeam("t1"), []).some((p) => p.message.includes("at least one"))).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    const team = { ...addMember(newTeam("t1"), "a"), name: "  " };
    expect(validateTeam(team, [character("a")]).some((p) => p.message.includes("name"))).toBe(true);
  });

  it("reports a member pointing at a deleted character", () => {
    const team = addMember(newTeam("t1"), "ghost");
    const problems = validateTeam(team, [character("a")]);
    expect(problems.some((p) => p.message.includes("no longer exists"))).toBe(true);
  });

  it("names the slot of each dangling member", () => {
    let team = addMember(newTeam("t1"), "a");
    team = addMember(team, "ghost");
    const problems = validateTeam(team, [character("a")]);
    expect(problems[0]?.message).toContain("slot 2");
  });
});

describe("duplicateTeam", () => {
  it("copies members under a new id and leaves the original untouched", () => {
    const original = addMember(newTeam("t1"), "a");
    const copy = duplicateTeam(original, "t2");
    expect(copy.id).toBe("t2");
    expect(copy.members).toEqual(original.members);
    expect(copy.name).not.toBe(original.name);
    expect(original.id).toBe("t1");
  });
});

describe("teamCounters (#575)", () => {
  const withBar = (id: string, bar: readonly (string | null)[]): StoredCharacter => ({
    ...character(id),
    skillBar: Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null),
  });
  const roster = [
    withBar("a", ["warrior.distracting-blow", "warrior.backbreaker", "ranger.broad-head-arrow"]),
    withBar("b", ["warrior.distracting-blow", "monk.mend-affliction"]),
  ];
  const members = [{ characterId: "a" }, { characterId: "b" }, { characterId: "gone" }];
  const counter = (id: string) => {
    const found = teamCounters(members, roster).find((c) => c.id === id);
    if (found === undefined) throw new Error(`no counter ${id}`);
    return found;
  };

  it("counts every copy of a skill, in the cells that hold it", () => {
    expect(counter("interrupt").cells).toEqual([
      { characterId: "a", slot: 0 },
      { characterId: "a", slot: 2 },
      { characterId: "b", slot: 0 },
    ]);
    expect(counter("knockdown").cells).toEqual([{ characterId: "a", slot: 1 }]);
    expect(counter("removal").cells).toEqual([{ characterId: "b", slot: 1 }]);
  });

  it("counts cost types and empty slots; a missing character counts nothing", () => {
    expect(counter("energy").cells).toHaveLength(4);
    expect(counter("adrenaline").cells).toEqual([{ characterId: "a", slot: 1 }]);
    expect(counter("empty").cells).toHaveLength(5 + 6);
  });

  it("wants every skill role, but no cost type or empty slot", () => {
    expect(counter("healing")).toMatchObject({ cells: [], wanted: true });
    expect(counter("empty").wanted).toBe(false);
    expect(teamCounters([], roster).map((c) => c.id)).toEqual([
      "interrupt",
      "healing",
      "removal",
      "knockdown",
      "hex",
      "condition",
      "defence",
      "energy",
      "adrenaline",
      "empty",
    ]);
  });

  it("sums the professions, most common first", () => {
    const monk: StoredCharacter = {
      ...character("m"),
      primaryProfession: "monk",
      secondaryProfession: "ranger",
    };
    expect(professionMix([...members, { characterId: "m" }], [...roster, monk])).toBe("2 W · Mo/R");
  });
});

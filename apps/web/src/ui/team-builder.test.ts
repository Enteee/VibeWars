import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamCharacter,
} from "../storage/schema.js";
import {
  MAX_TEAM_SIZE,
  addMember,
  duplicateTeam,
  moveMember,
  newTeam,
  professionMix,
  removeMember,
  replaceMember,
  teamCharacter,
  teamCounters,
  validateTeam,
} from "./team-builder.js";

function member(id: string): TeamCharacter {
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

/** The members' ids, in slot order. */
function ids(team: StoredTeam): string[] {
  return team.members.map((m) => m.character.id);
}

describe("newTeam", () => {
  it("starts empty with the default ruleset", () => {
    const team = newTeam("t1");
    expect(team.members).toEqual([]);
    expect(team.rulesetId).toBe("minimal-gw-inspired-pvp-v1");
  });
});

describe("teamCharacter (#1452)", () => {
  const solo: StoredCharacter = {
    ...member("solo"),
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    skillBar: ["warrior.sever-artery", null, null, null, null, null, null, null],
    updatedAt: 1,
  };

  it("copies a Solo character's build under a new id, without its record fields", () => {
    const copy = teamCharacter(solo, "m1");
    expect(copy).toEqual({ ...member("solo"), id: "m1", skillBar: solo.skillBar });
    expect(copy).not.toHaveProperty("schemaVersion");
    expect(copy).not.toHaveProperty("updatedAt");
  });

  it("shares nothing with the source: an edit to either leaves the other alone", () => {
    const copy = teamCharacter(solo, "m1");
    expect(copy.skillBar).not.toBe(solo.skillBar);
    expect(copy.attributes).not.toBe(solo.attributes);
  });
});

describe("addMember / removeMember / replaceMember", () => {
  it("appends members in order", () => {
    let team = addMember(newTeam("t1"), member("a"));
    team = addMember(team, member("b"));
    expect(ids(team)).toEqual(["a", "b"]);
  });

  it("supports well past 8 members — 8 is not hardcoded anywhere", () => {
    let team = newTeam("t1");
    for (let i = 0; i < 12; i += 1) {
      team = addMember(team, member(`c${String(i)}`));
    }
    expect(team.members).toHaveLength(12);
  });

  it("refuses to grow past the configured maximum", () => {
    let team = newTeam("t1");
    for (let i = 0; i < MAX_TEAM_SIZE + 5; i += 1) {
      team = addMember(team, member(`c${String(i)}`));
    }
    expect(team.members).toHaveLength(MAX_TEAM_SIZE);
  });

  it("removes the right member by index", () => {
    let team = addMember(newTeam("t1"), member("a"));
    team = addMember(team, member("b"));
    team = addMember(team, member("c"));
    expect(ids(removeMember(team, 1))).toEqual(["a", "c"]);
  });

  it("replaces a member in its own slot, by id", () => {
    let team = addMember(newTeam("t1"), member("a"));
    team = addMember(team, member("b"));
    const renamed = replaceMember(team, { ...member("a"), name: "Alpha" });
    expect(renamed.members.map((m) => m.character.name)).toEqual(["Alpha", "b"]);
  });
});

describe("moveMember", () => {
  function threeMemberTeam() {
    let team = addMember(newTeam("t1"), member("a"));
    team = addMember(team, member("b"));
    return addMember(team, member("c"));
  }

  it("moves a member toward the front", () => {
    expect(ids(moveMember(threeMemberTeam(), 2, -1))).toEqual(["a", "c", "b"]);
  });

  it("moves a member toward the back", () => {
    expect(ids(moveMember(threeMemberTeam(), 0, 1))).toEqual(["b", "a", "c"]);
  });

  it("is a no-op past either end rather than losing a member", () => {
    const team = threeMemberTeam();
    expect(ids(moveMember(team, 0, -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveMember(team, 2, 1))).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    const team = threeMemberTeam();
    expect(moveMember(team, 99, -1).members).toHaveLength(3);
  });
});

describe("validateTeam", () => {
  it("accepts a team whose members are all legal builds", () => {
    expect(validateTeam(addMember(newTeam("t1"), member("a")))).toEqual([]);
  });

  it("rejects an empty team", () => {
    expect(validateTeam(newTeam("t1")).some((p) => p.message.includes("at least one"))).toBe(true);
  });

  it("rejects an empty name", () => {
    const team = { ...addMember(newTeam("t1"), member("a")), name: "  " };
    expect(validateTeam(team).some((p) => p.message.includes("name"))).toBe(true);
  });

  it("flags an illegal member build by its slot and name (#1452)", () => {
    // A Monk skill on a Warrior with no Monk secondary.
    const illegal: TeamCharacter = {
      ...member("b"),
      name: "Bravo",
      skillBar: ["monk.orison-of-healing", null, null, null, null, null, null, null],
    };
    const team = addMember(addMember(newTeam("t1"), member("a")), illegal);
    expect(validateTeam(team).map((p) => p.message)).toEqual([
      "slot 2, Bravo, is not a legal build: open it to see why",
    ]);
  });
});

describe("duplicateTeam", () => {
  it("copies members under a new id and leaves the original untouched", () => {
    const original = addMember(newTeam("t1"), member("a"));
    const copy = duplicateTeam(original, "t2");
    expect(copy.id).toBe("t2");
    expect(copy.members).toEqual(original.members);
    expect(copy.name).not.toBe(original.name);
    expect(original.id).toBe("t1");
  });
});

describe("teamCounters (#575)", () => {
  const withBar = (id: string, bar: readonly (string | null)[]) => ({
    character: {
      ...member(id),
      skillBar: Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null),
    },
  });
  const members = [
    withBar("a", ["warrior.distracting-blow", "warrior.backbreaker", "ranger.broad-head-arrow"]),
    withBar("b", ["warrior.distracting-blow", "monk.mend-condition"]),
  ];
  const counter = (id: string) => {
    const found = teamCounters(members).find((c) => c.id === id);
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

  it("counts cost types and empty slots", () => {
    expect(counter("energy").cells).toHaveLength(4);
    expect(counter("adrenaline").cells).toEqual([{ characterId: "a", slot: 1 }]);
    expect(counter("empty").cells).toHaveLength(5 + 6);
  });

  it("wants every skill role, but no cost type or empty slot", () => {
    expect(counter("healing")).toMatchObject({
      cells: [{ characterId: "b", slot: 1 }],
      wanted: true,
    });
    expect(counter("empty").wanted).toBe(false);
    expect(teamCounters([]).map((c) => c.id)).toEqual([
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
    const monk: TeamCharacter = {
      ...member("m"),
      primaryProfession: "monk",
      secondaryProfession: "ranger",
    };
    expect(professionMix([...members, { character: monk }])).toBe("2 W · Mo/R");
  });
});

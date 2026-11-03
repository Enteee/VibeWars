import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamCharacter,
} from "../storage/schema.js";
import {
  dragSkill,
  duplicateTeam,
  memberCount,
  moveMember,
  newTeam,
  professionMix,
  replaceMember,
  teamCharacter,
  teamCounters,
  teamOf,
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

/** A team of a member for each of `names`, 2, 4 or 8 of them. */
function teamWith(...names: string[]): StoredTeam {
  const size = names.length;
  if (size !== 2 && size !== 4 && size !== 8) {
    throw new Error(`no team of ${String(size)}`);
  }
  return teamOf("t1", size, names.map(member));
}

/** The members' ids, in slot order. */
function ids(team: StoredTeam): string[] {
  return team.members.map((m) => m.character.id);
}

describe("newTeam (#2225)", () => {
  it("starts full: a blank member for each place, with the default ruleset", () => {
    let made = 0;
    const team = newTeam("t1", 4, () => {
      made += 1;
      return member(`blank${String(made)}`);
    });
    expect(team.size).toBe(4);
    expect(ids(team)).toEqual(["blank1", "blank2", "blank3", "blank4"]);
    expect(team.rulesetId).toBe("minimal-gw-inspired-pvp-v1");
  });

  it("is always its size, 2, 4 or 8", () => {
    for (const size of [2, 4, 8] as const) {
      expect(newTeam("t1", size, () => member("x")).members).toHaveLength(size);
    }
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

describe("replaceMember", () => {
  it("replaces a member in its own slot, by id, and keeps the team its size", () => {
    const renamed = replaceMember(teamWith("a", "b"), { ...member("a"), name: "Alpha" });
    expect(renamed.members.map((m) => m.character.name)).toEqual(["Alpha", "b"]);
  });
});

describe("moveMember", () => {
  it("moves a member toward the front", () => {
    expect(ids(moveMember(teamWith("a", "b", "c", "d"), 2, -1))).toEqual(["a", "c", "b", "d"]);
  });

  it("moves a member toward the back", () => {
    expect(ids(moveMember(teamWith("a", "b", "c", "d"), 0, 1))).toEqual(["b", "a", "c", "d"]);
  });

  it("is a no-op past either end rather than losing a member", () => {
    const team = teamWith("a", "b", "c", "d");
    expect(ids(moveMember(team, 0, -1))).toEqual(["a", "b", "c", "d"]);
    expect(ids(moveMember(team, 3, 1))).toEqual(["a", "b", "c", "d"]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(moveMember(teamWith("a", "b", "c", "d"), 99, -1).members).toHaveLength(4);
  });
});

describe("validateTeam", () => {
  it("accepts a team whose members are all legal builds", () => {
    expect(validateTeam(teamWith("a", "b"))).toEqual([]);
  });

  it("rejects an empty name", () => {
    const team = { ...teamWith("a", "b"), name: "  " };
    expect(validateTeam(team).some((p) => p.message.includes("name"))).toBe(true);
  });

  it("flags an illegal member build by its slot and name (#1452)", () => {
    // A Monk skill on a Warrior with no Monk secondary.
    const illegal: TeamCharacter = {
      ...member("b"),
      name: "Bravo",
      skillBar: ["monk.orison-of-healing", null, null, null, null, null, null, null],
    };
    const team = teamOf("t1", 2, [member("a"), illegal]);
    expect(validateTeam(team).map((p) => p.message)).toEqual([
      "slot 2, Bravo, is not a legal build: open it to see why",
    ]);
  });
});

describe("memberCount (#2116)", () => {
  it("is singular for one", () => {
    expect(memberCount(1)).toBe("1 member");
    expect(memberCount(4)).toBe("4 members");
  });
});

describe("validateTeam off its size (#2225)", () => {
  it("flags a team short of its size, or over it, as a stored record cannot hold", () => {
    const team = teamWith("a", "b", "c", "d");
    expect(validateTeam({ ...team, size: 2 }).map((p) => p.message)).toEqual([
      "a team of 2 has 2 members, not 4",
    ]);
    expect(validateTeam({ ...team, size: 8 }).map((p) => p.message)).toEqual([
      "a team of 8 has 8 members, not 4",
    ]);
  });
});

describe("duplicateTeam", () => {
  it("copies members under a new id and leaves the original untouched", () => {
    const original = teamWith("a", "b", "c", "d");
    const copy = duplicateTeam(original, "t2");
    expect(copy.id).toBe("t2");
    expect(copy.size).toBe(4);
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
    expect(professionMix([...members, { character: monk }])).toEqual([
      { count: 2, primary: "warrior", secondary: undefined },
      { count: 1, primary: "monk", secondary: "ranger" },
    ]);
  });
});

describe("dragSkill (#2227)", () => {
  const CHOP = "warrior.swift-chop";
  const BASH = "warrior.hammer-bash";
  const BACKBREAKER = "warrior.backbreaker";
  const EVISCERATE = "warrior.eviscerate";

  /** Two warriors, a and b, holding `a` and `b` from slot 0. */
  function bars(a: (string | null)[], b: (string | null)[]): StoredTeam {
    const team = teamWith("a", "b");
    const fill = (bar: (string | null)[]) =>
      Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null);
    return {
      ...team,
      members: team.members.map(({ character }, index) => ({
        character: { ...character, skillBar: fill(index === 0 ? a : b) },
      })),
    };
  }

  function barsOf(result: StoredTeam | { readonly message: string }): (string | null)[][] {
    if ("message" in result) {
      throw new Error(result.message);
    }
    return result.members.map(({ character }) => character.skillBar.slice(0, 3));
  }

  it.each([
    {
      what: "moves onto another member's empty slot",
      a: [CHOP],
      b: [],
      from: 0,
      to: 1,
      copy: false,
      want: [
        [null, null, null],
        [null, CHOP, null],
      ],
    },
    {
      what: "swaps with what it lands on",
      a: [CHOP],
      b: [BASH],
      from: 0,
      to: 0,
      copy: false,
      want: [
        [BASH, null, null],
        [CHOP, null, null],
      ],
    },
    {
      what: "copies with Shift, the source keeping it, replacing what is there",
      a: [CHOP],
      b: [BASH],
      from: 0,
      to: 0,
      copy: true,
      want: [
        [CHOP, null, null],
        [CHOP, null, null],
      ],
    },
    {
      what: "swaps two elites between two bars",
      a: [BACKBREAKER],
      b: [EVISCERATE],
      from: 0,
      to: 0,
      copy: false,
      want: [
        [EVISCERATE, null, null],
        [BACKBREAKER, null, null],
      ],
    },
  ])("$what", ({ a, b, from, to, copy, want }) => {
    expect(
      barsOf(dragSkill(bars(a, b), { member: 0, slot: from }, { member: 1, slot: to }, copy)),
    ).toEqual(want);
  });

  it("swaps two slots of one bar, and with Shift still only moves", () => {
    for (const copy of [false, true]) {
      const team = bars([CHOP, null, BASH], []);
      expect(
        barsOf(dragSkill(team, { member: 0, slot: 0 }, { member: 0, slot: 2 }, copy))[0],
      ).toEqual([BASH, null, CHOP]);
    }
  });

  it("leaves the team itself when a skill is dropped back on its slot", () => {
    const team = bars([CHOP], []);
    expect(dragSkill(team, { member: 0, slot: 0 }, { member: 0, slot: 0 }, false)).toBe(team);
  });

  it.each([
    {
      what: "a copy onto a bar already holding it",
      a: [CHOP],
      b: [null, CHOP],
      copy: true,
      want: "Swift Chop is already on b's bar",
    },
    {
      what: "an elite onto a bar with another elite",
      a: [BACKBREAKER],
      b: [null, EVISCERATE],
      copy: false,
      want: "b already has an elite, Eviscerate",
    },
    {
      what: "a swap whose displaced skill the source may not hold",
      a: [CHOP, EVISCERATE],
      b: [BACKBREAKER],
      copy: false,
      want: "a already has an elite, Eviscerate",
    },
    {
      what: "a skill of another profession",
      a: ["monk.orison-of-healing"],
      b: [],
      copy: false,
      want: "can't use Orison of Healing",
    },
  ])("refuses $what, changing nothing", ({ a, b, copy, want }) => {
    const result = dragSkill(bars(a, b), { member: 0, slot: 0 }, { member: 1, slot: 0 }, copy);
    expect(result).toEqual({ message: expect.stringContaining(want) as unknown });
  });
});

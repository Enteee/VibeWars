import { describe, expect, it } from "vitest";

import { type PlayerBuild, validatePlayerBuild } from "./build.js";
import { decodeTemplateCode, encodeTemplateCode } from "./template-code.js";
import { PVX_SKIPPED, PVX_SOLO, PVX_TEAMS } from "./pvx-builds.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import {
  STARTER_BUILDS,
  decodePvxBuild,
  decodePvxBuilds,
  pickStarterBuild,
  pvxKey,
} from "./starter-builds.js";
import {
  STARTER_TEAMS,
  decodePvxTeams,
  pickSoloTeam,
  pickStarterTeam,
  pvxTeamKey,
} from "./starter-teams.js";

/** Every PvX build and team that decoding skips, by key. */
function skipped(): Record<string, string> {
  return { ...decodePvxBuilds(PVX_SOLO).skipped, ...decodePvxTeams(PVX_TEAMS).skipped };
}

/** A seeded [0, 1) source: mulberry32. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function professionPair(build: PlayerBuild): string {
  return `${build.primaryProfession}/${String(build.secondaryProfession)}`;
}

describe("the PvX solo builds (#2554)", () => {
  it("are each in STARTER_BUILDS or PVX_SKIPPED, and PVX_SKIPPED is exactly what is skipped", () => {
    // A ratchet: a skill landing that makes a skipped build decode fails
    // this until it is struck from PVX_SKIPPED, so the list only shrinks.
    expect(skipped()).toEqual(PVX_SKIPPED);
    for (const pvx of PVX_SOLO) {
      const decoded = decodePvxBuild(pvx);
      if (pvxKey(pvx) in PVX_SKIPPED) {
        continue;
      }
      expect(decoded.ok, pvxKey(pvx)).toBe(true);
      if (decoded.ok) {
        expect(STARTER_BUILDS).toContainEqual(decoded.build);
        expect(validatePlayerBuild(decoded.build, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual(
          [],
        );
      }
    }
  });

  it("names each build once in the list, by its code and by its key", () => {
    expect(new Set(PVX_SOLO.map((pvx) => pvx.code)).size).toBe(PVX_SOLO.length);
    expect(new Set(PVX_SOLO.map(pvxKey)).size).toBe(PVX_SOLO.length);
  });

  it("holds no bar twice", () => {
    const bars = STARTER_BUILDS.map((build) => [...build.skillBar].sort().join());
    expect(new Set(bars).size).toBe(bars.length);
  });

  it("keeps the first of two codes for one bar, and skips the second", () => {
    const [first] = PVX_SOLO;
    if (first === undefined) throw new Error("no PvX builds");
    const again = { ...first, mode: "RA" };
    const { builds, skipped } = decodePvxBuilds([first, again]);
    expect(builds).toHaveLength(1);
    expect(skipped).toEqual({ [pvxKey(again)]: `The same bar as ${String(builds[0]?.name)}.` });
  });

  it("skips a code that does not decode, and says why", () => {
    const [first] = PVX_SOLO;
    if (first === undefined) throw new Error("no PvX builds");
    const broken = { ...first, code: first.code.slice(0, 6) };
    expect(decodePvxBuilds([broken]).skipped).toEqual({
      [pvxKey(broken)]: "This GW1 code is cut short.",
    });
  });

  it.each(PVX_SOLO.filter((pvx) => !(pvxKey(pvx) in PVX_SKIPPED)).map((pvx) => [pvxKey(pvx), pvx]))(
    "%s round-trips through the encoder",
    (_, pvx) => {
      const decoded = decodeTemplateCode(pvx.code);
      if (!decoded.ok) throw new Error(decoded.problems.join(" "));
      const encoded = encodeTemplateCode(decoded.build);
      if (!encoded.ok) throw new Error(encoded.problem);
      const again = decodeTemplateCode(encoded.code);
      expect(again.ok && again.build).toEqual(decoded.build);
    },
  );

  it("is what pickStarterBuild draws from", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999999]) {
      expect(STARTER_BUILDS).toContain(pickStarterBuild(() => r));
    }
  });
});

describe("the PvX team builds (#2555)", () => {
  it("are each in STARTER_TEAMS at their size or in PVX_SKIPPED", () => {
    expect(skipped()).toEqual(PVX_SKIPPED);
    for (const pvx of PVX_TEAMS) {
      if (pvxTeamKey(pvx) in PVX_SKIPPED) {
        continue;
      }
      const team = STARTER_TEAMS.find((starter) => starter.name === pvx.name);
      expect(team, pvxTeamKey(pvx)).toBeDefined();
      expect(team?.members).toHaveLength(pvx.members.length);
      for (const member of team?.members ?? []) {
        expect(validatePlayerBuild(member.build, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual(
          [],
        );
      }
    }
  });

  it("names a member by its team, its slot and its professions", () => {
    const henchway = STARTER_TEAMS.find((team) => team.name === "HA Henchway");
    expect(henchway?.members.map((member) => member.name)).toEqual([
      "HA Henchway 1 (E)",
      "HA Henchway 2 (Me)",
    ]);
  });

  it("skips a whole team for one member that does not decode, and says which", () => {
    const [first] = PVX_TEAMS.filter((pvx) => pvx.members.length === 4);
    if (first === undefined) throw new Error("no 4-member PvX team");
    const broken = {
      ...first,
      members: first.members.map((code, index) => (index === 2 ? code.slice(0, 6) : code)),
    };
    expect(decodePvxTeams([broken])).toEqual({
      teams: [],
      skipped: { [pvxTeamKey(broken)]: "Member 3: This GW1 code is cut short." },
    });
  });

  it.each([1, 2, 4, 8])("gives a %iv%i team for every seed", (size) => {
    for (let seed = 0; seed < 20; seed++) {
      expect(pickStarterTeam(seeded(seed), size)?.members).toHaveLength(size);
    }
  });

  it("has no team for a size there is not", () => {
    expect(pickStarterTeam(() => 0, 3)).toBeUndefined();
  });

  it("puts PvX solo builds together for a size no PvX team serves, no pair twice", () => {
    for (let seed = 0; seed < 20; seed++) {
      const solo = pickStarterTeam(seeded(seed), 1);
      expect(solo?.name).toBe(solo?.members[0]?.build.name);
      expect(STARTER_BUILDS).toContainEqual(solo?.members[0]?.build);
    }
    // 1v1 is the only size no PvX team serves today; a bigger one, as
    // 2v2 or 4v4 would get with theirs skipped, holds every pair once.
    for (const size of [2, 4, 8]) {
      for (let seed = 0; seed < 20; seed++) {
        const team = pickSoloTeam(seeded(seed), size);
        const builds = team?.members.map((member) => member.build) ?? [];
        expect(builds).toHaveLength(size);
        expect(new Set(builds.map(professionPair)).size).toBe(size);
        expect(team?.name).toBe(builds.map((build) => build.name).join(" + "));
      }
    }
  });

  it.each([1, 2, 4, 8])("never rerolls a %iv%i team into itself", (size) => {
    for (let seed = 0; seed < 20; seed++) {
      const random = seeded(seed);
      const team = pickStarterTeam(random, size);
      if (team === undefined) throw new Error("no team");
      expect(pickStarterTeam(random, size, team)?.name).not.toBe(team.name);
      expect(pickStarterTeam(() => 0, size, team)?.name).not.toBe(team.name);
      const solo = pickSoloTeam(() => 0, size);
      expect(pickSoloTeam(() => 0, size, solo)?.name).not.toBe(solo?.name);
    }
  });
});

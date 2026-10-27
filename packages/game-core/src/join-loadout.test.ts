import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, type PlayerBuild } from "./build.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { loadoutOf, resolveJoinLoadout } from "./join-loadout.js";
import { STARTER_BUILDS } from "./starter-builds.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

/** A legal elementalist/monk: both professions' attributes, both their skills. */
const LEGAL: PlayerBuild = {
  name: "Flame Caller",
  primaryProfession: "elementalist",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "elementalist.fire-magic", rank: 12 },
    { attributeId: "monk.healing-prayers", rank: 8 },
  ],
  skillBar: ["elementalist.fireball", "monk.orison-of-healing", null, null, null, null, null, null],
  equipment: defaultBuildEquipment("elementalist"),
};

/** A `random` that picks the third starter build, and the loadout it plays. */
const THIRD = () => 2.5 / STARTER_BUILDS.length;
const THIRD_LOADOUT = loadoutOf(STARTER_BUILDS[2] ?? LEGAL);

/** A `random` that fails the test if it is called: a legal claim must not roll. */
const NEVER = () => {
  throw new Error("random was called for a legal build");
};

describe("resolveJoinLoadout", () => {
  it("plays a legal build as claimed, without rolling", () => {
    const { loadout, refused } = resolveJoinLoadout(LEGAL, RULES, NEVER);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(LEGAL.skillBar);
    expect(loadout.primaryProfession).toBe("elementalist");
    expect(loadout.secondaryProfession).toBe("monk");
    expect(loadout.baseEnergyPips).toBe(4);
    expect(loadout.attributeRanks.get("elementalist.fire-magic")).toBe(12);
  });

  it("keeps the bar's gaps where the build has them, so a key always means its slot (#347)", () => {
    const gappy = [null, "elementalist.fireball", null, null, null, null, null, null];
    const { loadout, refused } = resolveJoinLoadout({ ...LEGAL, skillBar: gappy }, RULES, NEVER);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(gappy);
  });

  it("gives the starter build random picks for no build, without calling it a refusal (#852)", () => {
    expect(resolveJoinLoadout(undefined, RULES, THIRD)).toEqual({
      loadout: THIRD_LOADOUT,
      refused: undefined,
    });
  });

  it("gives the starter build random picks for a malformed, an illegal or an empty build, and says why (#852)", () => {
    expect(resolveJoinLoadout({ name: 3 }, RULES, THIRD)).toEqual({
      loadout: THIRD_LOADOUT,
      refused: { kind: "malformed" },
    });
    const illegal = resolveJoinLoadout(
      { ...LEGAL, skillBar: ["warrior.swift-chop", ...LEGAL.skillBar.slice(1)] },
      RULES,
      THIRD,
    );
    expect(illegal.loadout).toEqual(THIRD_LOADOUT);
    expect(illegal.refused?.kind).toBe("illegal");
    const empty = resolveJoinLoadout({ ...LEGAL, skillBar: Array(8).fill(null) }, RULES, THIRD);
    expect(empty).toEqual({
      loadout: THIRD_LOADOUT,
      refused: { kind: "empty-bar", build: expect.objectContaining({ name: "Flame Caller" }) },
    });
  });

  it("gives a starter build for a bar with two elites (#459)", () => {
    const twoElites = resolveJoinLoadout(
      {
        ...LEGAL,
        primaryProfession: "warrior",
        secondaryProfession: "ranger",
        attributes: [],
        skillBar: ["ranger.barrage", "warrior.backbreaker", null, null, null, null, null, null],
        equipment: defaultBuildEquipment("warrior"),
      },
      RULES,
      THIRD,
    );
    expect(twoElites.loadout).toEqual(THIRD_LOADOUT);
    expect(twoElites.refused?.kind).toBe("illegal");
  });

  it("gives a starter build its own primary's energy pips (#852)", () => {
    for (const [index, build] of STARTER_BUILDS.entries()) {
      const { loadout } = resolveJoinLoadout(undefined, RULES, () => index / STARTER_BUILDS.length);
      expect(loadout.primaryProfession).toBe(build.primaryProfession);
      expect(loadout.baseEnergyPips).toBe(loadoutOf(build).baseEnergyPips);
    }
  });
});

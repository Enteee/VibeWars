import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, type PlayerBuild } from "./build.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { loadoutOf, resolveJoinLoadout } from "./join-loadout.js";
import { STARTER_BUILDS } from "./starter-builds.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

/** A `random` that always says `value`. */
const always = (value: number) => () => value;

/** A `random` that fails the test if called: a legal claim never rolls. */
const never = (): number => {
  throw new Error("random was called");
};

/** The starter build at `index`. */
function starter(index: number): PlayerBuild {
  const build = STARTER_BUILDS[index];
  if (build === undefined) {
    throw new Error(`no starter build ${String(index)}`);
  }
  return build;
}

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

describe("resolveJoinLoadout", () => {
  it("plays a legal build as claimed, without rolling", () => {
    const { loadout, refused } = resolveJoinLoadout(LEGAL, RULES, never);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(LEGAL.skillBar);
    expect(loadout.primaryProfession).toBe("elementalist");
    expect(loadout.secondaryProfession).toBe("monk");
    expect(loadout.attributeRanks.get("elementalist.fire-magic")).toBe(12);
  });

  it("keeps the bar's gaps where the build has them, so a key always means its slot (#347)", () => {
    const gappy = [null, "elementalist.fireball", null, null, null, null, null, null];
    const { loadout, refused } = resolveJoinLoadout({ ...LEGAL, skillBar: gappy }, RULES, never);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(gappy);
  });

  it("gives the starter build random picks for no build, without calling it a refusal (#852)", () => {
    expect(resolveJoinLoadout(undefined, RULES, always(0.5))).toEqual({
      loadout: loadoutOf(starter(2)),
      refused: undefined,
    });
    expect(resolveJoinLoadout(undefined, RULES, always(0)).loadout).toEqual(loadoutOf(starter(0)));
  });

  it("gives the starter build random picks for a malformed or an illegal build, and says why (#852)", () => {
    // 0.5 picks the third of five.
    const middle = loadoutOf(starter(2));
    expect(resolveJoinLoadout({ name: 3 }, RULES, always(0.5))).toEqual({
      loadout: middle,
      refused: { kind: "malformed" },
    });
    const illegal = resolveJoinLoadout(
      { ...LEGAL, skillBar: ["warrior.swift-chop", ...LEGAL.skillBar.slice(1)] },
      RULES,
      always(0.5),
    );
    expect(illegal.loadout).toEqual(middle);
    expect(illegal.refused?.kind).toBe("illegal");
  });

  it("plays an empty bar as claimed, equipment and all, without rolling (#1290)", () => {
    const empty: PlayerBuild = { ...LEGAL, skillBar: Array(8).fill(null) };
    expect(resolveJoinLoadout(empty, RULES, never)).toEqual({
      loadout: loadoutOf(empty),
      refused: undefined,
    });
    expect(loadoutOf(empty).equipment).toEqual(LEGAL.equipment);
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
      always(0),
    );
    expect(twoElites.loadout).toEqual(loadoutOf(starter(0)));
    expect(twoElites.refused?.kind).toBe("illegal");
  });
});

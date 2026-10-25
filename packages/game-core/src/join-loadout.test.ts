import { describe, expect, it } from "vitest";

import { defaultBuildEquipment, type PlayerBuild } from "./build.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { wieldsFor } from "./equipment/weapons.js";
import { HOUSE_LOADOUT, resolveJoinLoadout } from "./join-loadout.js";
import { getSkill } from "./skills/catalog.js";

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

describe("resolveJoinLoadout", () => {
  it("plays a legal build as claimed", () => {
    const { loadout, refused } = resolveJoinLoadout(LEGAL, RULES);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(LEGAL.skillBar);
    expect(loadout.primaryProfession).toBe("elementalist");
    expect(loadout.secondaryProfession).toBe("monk");
    expect(loadout.baseEnergyPips).toBe(4);
    expect(loadout.attributeRanks.get("elementalist.fire-magic")).toBe(12);
  });

  it("keeps the bar's gaps where the build has them, so a key always means its slot (#347)", () => {
    const gappy = [null, "elementalist.fireball", null, null, null, null, null, null];
    const { loadout, refused } = resolveJoinLoadout({ ...LEGAL, skillBar: gappy }, RULES);
    expect(refused).toBeUndefined();
    expect(loadout.skillBar).toEqual(gappy);
  });

  it("gives the house loadout for no build, without calling it a refusal", () => {
    expect(resolveJoinLoadout(undefined, RULES)).toEqual({
      loadout: HOUSE_LOADOUT,
      refused: undefined,
    });
  });

  it("gives the house loadout for a malformed, an illegal or an empty build, and says why", () => {
    expect(resolveJoinLoadout({ name: 3 }, RULES)).toEqual({
      loadout: HOUSE_LOADOUT,
      refused: { kind: "malformed" },
    });
    const illegal = resolveJoinLoadout(
      { ...LEGAL, skillBar: ["warrior.swift-chop", ...LEGAL.skillBar.slice(1)] },
      RULES,
    );
    expect(illegal.loadout).toBe(HOUSE_LOADOUT);
    expect(illegal.refused?.kind).toBe("illegal");
    const empty = resolveJoinLoadout({ ...LEGAL, skillBar: Array(8).fill(null) }, RULES);
    expect(empty).toEqual({
      loadout: HOUSE_LOADOUT,
      refused: { kind: "empty-bar", build: expect.objectContaining({ name: "Flame Caller" }) },
    });
  });
});

describe("HOUSE_LOADOUT", () => {
  it("regenerates 4 energy pips, a caster's, though it wears a warrior's kit (#502)", () => {
    expect(HOUSE_LOADOUT.primaryProfession).toBe("warrior");
    expect(HOUSE_LOADOUT.baseEnergyPips).toBe(4);
  });

  it("has no dead slot: every attack skill on it can be used with the house weapon (#445)", () => {
    const weapon = HOUSE_LOADOUT.equipment.mainHand.weaponId;
    for (const id of HOUSE_LOADOUT.skillBar) {
      const rule = id === null ? undefined : getSkill(id)?.attack;
      if (rule !== undefined) {
        expect(wieldsFor(weapon, rule.weapon), `${String(id)} with ${weapon}`).toBe(true);
      }
    }
  });

  it("has every skill it lists, and an interrupt", () => {
    const skills = HOUSE_LOADOUT.skillBar.map((id) => (id === null ? undefined : getSkill(id)));
    expect(skills).not.toContain(undefined);
    expect(
      skills.some((skill) => skill?.effects.some((effect) => effect.kind === "interrupt")),
    ).toBe(true);
  });
});

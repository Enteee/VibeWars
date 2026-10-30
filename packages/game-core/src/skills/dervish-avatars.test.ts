import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MatchSimulation } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { effectiveMaxHealth } from "./tick.js";
import type { Combatant } from "./types.js";
import { weaponSnapshotOf } from "./weapon-attack.js";

/**
 * The two PvP-split Dervish Avatars (#1437): Avatar of Melandru and Avatar
 * of Dwayna, at their rank-12 values.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MAX_HEALTH = 500;

const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: weaponDamageType(WEAPONS.scythe, "dervish.scythe-mastery"),
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A rank-12 Dervish, `d`, with `skillBar`, and a sturdy foe, `f`, beside it. */
function sim(skillBar: string[]): MatchSimulation {
  const ranks = new Map([
    ["dervish.scythe-mastery", 12],
    ["dervish.mysticism", 12],
  ]);
  const spec = (id: string, team: number, x: number, bar: string[], maxHealth: number) => ({
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: SCYTHE,
    maxHealth,
    maxEnergy: 1000,
    spawn: vec2(x, 0),
    facing: 0,
  });
  return new MatchSimulation({
    seed: "dervish-avatars",
    participants: [spec("d", 0, 0, skillBar, MAX_HEALTH), spec("f", 1, 40, [], 1e5)],
  });
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

function dervish(match: MatchSimulation): Combatant {
  const participant = match.get("d");
  if (participant === undefined) throw new Error("no Dervish");
  return participant.combatant;
}

/** The Dervish, cast into the Avatar in slot 0. */
function avatar(skillId: string): MatchSimulation {
  const match = sim([skillId, "dervish.eremites-attack"]);
  expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
  stepFor(match, 2.1);
  return match;
}

describe("Avatar of Melandru (#1437)", () => {
  const SKILL = "dervish.avatar-of-melandru";

  it("adds 100 maximum Health, earth attacks, for 74 s", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    expect(self.statuses.get("avatar-of-melandru")?.remainingSeconds).toBeGreaterThan(73);
    expect(effectiveMaxHealth(self)).toBe(MAX_HEALTH + 100);
    expect(weaponSnapshotOf(self).damageType).toBe("earth");
  });

  it("cures 2 conditions whenever the Dervish loses a Dervish enchantment", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    self.statuses.apply("poison", 20, "f");
    self.statuses.apply("bleeding", 20, "f");
    self.statuses.apply("crippled", 20, "f");
    self.statuses.apply("enchanted-haste", 0.2, "d");
    stepFor(match, 0.5);
    expect(self.statuses.countByCategory("condition")).toBe(1);
  });

  it("takes the extra Health back as it ends, never killing", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    self.health = MAX_HEALTH + 100;
    self.statuses.remove("avatar-of-melandru");
    stepFor(match, DT);
    expect(self.health).toBeLessThanOrEqual(MAX_HEALTH);
    expect(self.dead).toBe(false);
  });

  it("reads as GW1 words it", () => {
    const skill = getSkill(SKILL);
    if (skill === undefined) throw new Error("no Avatar of Melandru");
    const description = describeSkill(skill);
    expect(description.typeText).toBe("Elite Form.");
    expect(description.effects.map(({ text }) => text)).toContain("Disabled for 45s after use");
    expect(describeStatus("avatar-of-melandru")).toContain("+30 elemental armor");
  });
});

describe("Avatar of Dwayna (#1437)", () => {
  const SKILL = "dervish.avatar-of-dwayna";

  it("turns attacks holy", () => {
    expect(weaponSnapshotOf(dervish(avatar(SKILL))).damageType).toBe("holy");
  });

  it("loses a hex on each Dervish attack skill", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    self.statuses.apply("faintheartedness", 20, "f");
    self.statuses.apply("malaise", 20, "f");
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    expect(self.statuses.countByCategory("hex")).toBe(1);
  });

  it("heals 41 whenever the Dervish loses a Dervish enchantment", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    self.health = 200;
    self.statuses.apply("enchanted-haste", 0.2, "d");
    stepFor(match, 0.5);
    expect(self.health).toBeCloseTo(241, 0);
  });
});

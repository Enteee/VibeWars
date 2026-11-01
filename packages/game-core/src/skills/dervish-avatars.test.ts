import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { MatchSimulation } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import type { CombatEvent } from "./effects.js";
import { fillPools, gainUnits } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { effectiveMaxHealth } from "./tick.js";
import type { Combatant } from "./types.js";
import { weaponSnapshotOf } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * The five Dervish Avatars at their rank-12 values: Melandru and Dwayna
 * (#1437, PvP-split), Balthazar, Grenth and Lyssa (#1455).
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

const SWORD: ResolvedEquipment = {
  ...SCYTHE,
  mainHand: {
    ...SCYTHE.mainHand,
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: weaponDamageType(WEAPONS.sword, "warrior.swordsmanship"),
  },
};

/** A rank-12 Dervish, `d`, with `skillBar`, and a sturdy foe, `f`, beside it. */
function sim(skillBar: string[], equipment: ResolvedEquipment = SCYTHE): MatchSimulation {
  const ranks = new Map([
    ["dervish.scythe-mastery", 12],
    ["dervish.mysticism", 12],
  ]);
  const spec = (id: string, team: number, x: number, bar: string[], maxHealth: number) => ({
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: id === "d" ? equipment : SCYTHE,
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

/** Every event of the steps over `seconds`. */
function eventsFor(match: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of match.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

function combatant(match: MatchSimulation, id: string): Combatant {
  const participant = match.get(id);
  if (participant === undefined) throw new Error(`no ${id}`);
  return participant.combatant;
}

function dervish(match: MatchSimulation): Combatant {
  return combatant(match, "d");
}

/** The Dervish, cast into the Avatar in slot 0, `second` in slot 1. */
function avatar(
  skillId: string,
  second = "dervish.eremites-attack",
  equipment: ResolvedEquipment = SCYTHE,
): MatchSimulation {
  const match = sim([skillId, second], equipment);
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
    self.statuses.apply("poison", 20, "f", NO_RANKS);
    self.statuses.apply("bleeding", 20, "f", NO_RANKS);
    self.statuses.apply("crippled", 20, "f", NO_RANKS);
    self.statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
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
    self.statuses.apply("faintheartedness", 20, "f", NO_RANKS);
    self.statuses.apply("malaise", 20, "f", NO_RANKS);
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    expect(self.statuses.countByCategory("hex")).toBe(1);
  });

  it("heals 41 whenever the Dervish loses a Dervish enchantment", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    self.health = 200;
    self.statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
    stepFor(match, 0.5);
    expect(self.health).toBeCloseTo(241, 0);
  });
});

describe("Avatar of Balthazar (#1455)", () => {
  const SKILL = "dervish.avatar-of-balthazar";

  it("gains adrenaline 25% faster, from a hit and from a skill alike", () => {
    const match = avatar(SKILL, "warrior.eviscerate");
    const self = dervish(match);
    gainUnits(self, 25, match.elapsedSeconds);
    expect(self.adrenaline.get("warrior.eviscerate")).toBe(31);
    fillPools(self, 25);
    expect(self.adrenaline.get("warrior.eviscerate")).toBe(62);
  });

  it("turns attacks holy, and burns the foes nearby whenever it loses a Dervish enchantment", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    expect(weaponSnapshotOf(self).damageType).toBe("holy");
    self.statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
    stepFor(match, 0.5);
    expect(combatant(match, "f").statuses.get("burning")?.durationSeconds).toBe(3);
  });

  it("reads as GW1 words it", () => {
    const text = describeStatus("avatar-of-balthazar");
    expect(text).toContain("+20 physical armor");
    expect(text).toContain("gain adrenaline 25% faster");
  });
});

describe("Avatar of Grenth (#1455)", () => {
  const SKILL = "dervish.avatar-of-grenth";

  it("cures a Disease already on the Dervish, and no later one lands", () => {
    const match = sim([SKILL]);
    const self = dervish(match);
    self.statuses.apply("disease", 20, "f", NO_RANKS);
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2.1);
    expect(self.statuses.has("avatar-of-grenth")).toBe(true);
    expect(self.statuses.has("disease")).toBe(false);
    expect(self.statuses.apply("disease", 20, "f", NO_RANKS)).toBe(false);
    expect(self.statuses.has("disease")).toBe(false);
  });

  it("does not catch a Disease from the foe beside it, which it would without the form", () => {
    const without = sim([SKILL]);
    combatant(without, "f").statuses.apply("disease", 20, "f", NO_RANKS);
    stepFor(without, 0.5);
    expect(dervish(without).statuses.has("disease")).toBe(true);

    const match = avatar(SKILL);
    combatant(match, "f").statuses.apply("disease", 20, "f", NO_RANKS);
    stepFor(match, 0.5);
    expect(dervish(match).statuses.has("disease")).toBe(false);
  });

  it("deals dark damage and steals 10 Health with a scythe, neither with a sword", () => {
    const scythe = avatar(SKILL);
    expect(weaponSnapshotOf(dervish(scythe)).damageType).toBe("dark");
    expect(scythe.requestAttack("d", "f")).toEqual({ ok: true });
    const stolen = eventsFor(scythe, 3).filter(
      (event) => event.kind === "life-stolen" && event.targetId === "f",
    );
    expect(stolen.length).toBeGreaterThan(0);
    expect(stolen.every((event) => event.kind === "life-stolen" && event.amount === 10)).toBe(true);

    const sword = avatar(SKILL, "dervish.eremites-attack", SWORD);
    expect(weaponSnapshotOf(dervish(sword)).damageType).toBe("slashing");
    expect(sword.requestAttack("d", "f")).toEqual({ ok: true });
    expect(eventsFor(sword, 3).some((event) => event.kind === "life-stolen")).toBe(false);
  });

  it("diseases the adjacent foes whenever it loses a Dervish enchantment", () => {
    const match = avatar(SKILL);
    dervish(match).statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
    stepFor(match, 0.5);
    expect(combatant(match, "f").statuses.has("disease")).toBe(true);
  });
});

describe("Avatar of Lyssa (#1455)", () => {
  const SKILL = "dervish.avatar-of-lyssa";

  /** The recharge slot 1 starts with, the tick the Dervish casts it on itself. */
  function rechargeOf(match: MatchSimulation, skillId: string): number {
    expect(match.requestSkill("d", 1)?.check).toEqual({ ok: true });
    const { rechargeRemaining } = dervish(match).cast;
    for (let i = 0; i < 100 && (rechargeRemaining.get(skillId) ?? 0) === 0; i += 1) {
      match.step(DT);
    }
    return rechargeRemaining.get(skillId) ?? 0;
  }

  it("recharges a Dervish enchantment 50% faster, not another profession's", () => {
    const mystic = "dervish.mystic-regeneration";
    expect(rechargeOf(avatar(SKILL, mystic), mystic)).toBeCloseTo(12 * 0.5, 1);
    const guardian = "monk.guardian";
    expect(rechargeOf(avatar(SKILL, guardian), guardian)).toBeCloseTo(6, 1);
  });

  it("with Mantra of Recovery, a Dervish enchantment takes the larger share, another the Mantra's", () => {
    const mystic = "dervish.mystic-regeneration";
    const both = avatar(SKILL, mystic);
    dervish(both).statuses.apply("mantra-of-recovery", 30, "d", NO_RANKS);
    expect(rechargeOf(both, mystic)).toBeCloseTo(12 * 0.5, 1);
    const guardian = "monk.guardian";
    const mantra = avatar(SKILL, guardian);
    dervish(mantra).statuses.apply("mantra-of-recovery", 30, "d", NO_RANKS);
    expect(rechargeOf(mantra, guardian)).toBeCloseTo(6 * 0.67, 1);
  });

  it("turns attacks chaos, and steals 1 Energy from each foe nearby on losing a Dervish enchantment", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    const foe = combatant(match, "f");
    expect(weaponSnapshotOf(self).damageType).toBe("chaos");
    foe.energy = 10;
    self.energy = 20;
    self.statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
    const events = eventsFor(match, 0.5);
    expect(events).toContainEqual({ kind: "energy-loss", targetId: "f", amount: 1 });
    expect(Math.floor(foe.energy)).toBe(9);
    expect(Math.floor(self.energy)).toBe(21);
  });

  it("steals nothing from a foe with no energy", () => {
    const match = avatar(SKILL);
    const self = dervish(match);
    combatant(match, "f").energy = 0;
    self.energy = 20;
    self.statuses.apply("enchanted-haste", 0.2, "d", NO_RANKS);
    const events = eventsFor(match, 0.5);
    expect(events.some((event) => event.kind === "energy-loss")).toBe(false);
    expect(Math.floor(self.energy)).toBe(20);
  });

  it("reads as GW1 words it", () => {
    expect(describeStatus("avatar-of-lyssa")).toContain("Dervish enchantments recharge 50% faster");
    expect(describeStatus("avatar-of-grenth")).toContain("scythe attacks deal dark damage");
    expect(describeStatus("avatar-of-grenth")).toContain("immune to Disease");
  });
});

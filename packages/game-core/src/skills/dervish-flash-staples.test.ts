import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { describeSkill, describeStatus } from "./describe.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { getSkill } from "./catalog.js";
import { makeCombatant } from "./testing.js";
import type { FiredTrigger } from "./triggers.js";
import { attackHitRiders, weaponSnapshotOf } from "./weapon-attack.js";

/**
 * Four Dervish flash enchantments (#1421): Enchanted Haste, Heart of Holy
 * Flame, Balthazar's Rage and Harrier's Haste, at their rank-12 values.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const HEART_OF_FURY = "dervish.heart-of-fury";

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

/** A rank-12 Dervish, `d`, with `skillBar` at the origin, and foes at `foes`. */
function sim(skillBar: string[], foes: readonly Vec2[]): MatchSimulation {
  const ranks = new Map([
    ["dervish.scythe-mastery", 12],
    ["dervish.mysticism", 12],
    ["dervish.wind-prayers", 12],
  ]);
  const spec = (id: string, team: number, spawn: Vec2, bar: string[]) => ({
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: SCYTHE,
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  });
  return new MatchSimulation({
    seed: "dervish-flash-staples",
    participants: [
      spec("d", 0, vec2(0, 0), skillBar),
      ...foes.map((at, i) => spec(`f${String(i)}`, 1, at, [])),
    ],
  });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function use(match: MatchSimulation, slot: number): CombatLogEntry[] {
  expect(match.requestSkill("d", slot)?.check).toEqual({ ok: true });
  return stepFor(match, 0.25);
}

function combatant(match: MatchSimulation, id: string) {
  const found = match.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Damage to `id` in `entries` credited to `skillId`. */
function damageBy(entries: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return entries
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === id ? [event.amount] : [],
      ),
    );
}

const NEAR = vec2(AREA_NEARBY - 10, 0);

describe("flash enchantment tooltips (#1421)", () => {
  it("call themselves what GW1 does", () => {
    const skill = getSkill("dervish.enchanted-haste");
    expect(skill && describeSkill(skill).typeText).toBe("Flash Enchantment Spell.");
    const dustCloak = getSkill("dervish.dust-cloak");
    expect(dustCloak && describeSkill(dustCloak).typeText).toBe("Flash Enchantment Spell.");
  });
});

describe("Enchanted Haste (#1421)", () => {
  it("moves you 25% faster", () => {
    const self = makeCombatant({ id: "d" });
    self.statuses.apply("enchanted-haste", 7, "d", NO_RANKS);
    expect(aggregateModifiers(self.statuses.active).moveSpeedMultiplier).toBe(1.25);
  });

  it("removed early, takes a condition with it; run out, it does not", () => {
    const stripped = sim(["dervish.enchanted-haste"], []);
    use(stripped, 0);
    const self = combatant(stripped, "d");
    self.statuses.apply("poison", 20, "f", NO_RANKS);
    self.statuses.remove("enchanted-haste");
    stepFor(stripped, 0.25);
    expect(self.statuses.has("poison")).toBe(false);

    const expired = sim(["dervish.enchanted-haste"], []);
    use(expired, 0);
    combatant(expired, "d").statuses.apply("poison", 20, "f", NO_RANKS);
    stepFor(expired, 7);
    expect(combatant(expired, "d").statuses.has("enchanted-haste")).toBe(false);
    expect(combatant(expired, "d").statuses.has("poison")).toBe(true);
  });

  it("says so", () => {
    expect(describeStatus("enchanted-haste")).toBe(
      "moves at 125% speed. When it ends prematurely: removes 1 condition",
    );
  });
});

describe("Heart of Holy Flame (#1421)", () => {
  it("strikes nearby foes, turns attacks holy, and sets them on fire when it ends", () => {
    const match = sim(["dervish.heart-of-holy-flame"], [NEAR, vec2(AREA_NEARBY + 40, 0)]);
    const log = use(match, 0);
    expect(damageBy(log, "dervish.heart-of-holy-flame", "f0")).toHaveLength(1);
    expect(damageBy(log, "dervish.heart-of-holy-flame", "f1")).toEqual([]);
    expect(weaponSnapshotOf(combatant(match, "d")).damageType).toBe("holy");
    stepFor(match, 30);
    expect(combatant(match, "d").statuses.has("heart-of-holy-flame")).toBe(false);
    expect(combatant(match, "f0").statuses.has("burning")).toBe(true);
    expect(combatant(match, "f1").statuses.has("burning")).toBe(false);
  });
});

describe("Balthazar's Rage (#1421)", () => {
  it("burns nearby foes for 3 s, then gives 2 strikes when it ends with a foe in earshot", () => {
    const match = sim(["dervish.balthazars-rage", HEART_OF_FURY], [NEAR]);
    use(match, 0);
    expect(combatant(match, "f0").statuses.get("burning")?.remainingSeconds).toBeCloseTo(
      3 - 0.25,
      5,
    );
    stepFor(match, 20);
    expect(combatant(match, "d").statuses.has("balthazars-rage")).toBe(false);
    expect(combatant(match, "d").adrenaline.get(HEART_OF_FURY)).toBe(2 * ADRENALINE_PER_STRIKE);
  });

  it("gives nothing when it ends with no foe in earshot", () => {
    const match = sim(["dervish.balthazars-rage", HEART_OF_FURY], [vec2(AREA_EARSHOT + 50, 0)]);
    use(match, 0);
    stepFor(match, 20);
    expect(combatant(match, "d").statuses.has("balthazars-rage")).toBe(false);
    expect(combatant(match, "d").adrenaline.get(HEART_OF_FURY)).toBe(0);
  });
});

describe("Harrier's Haste (#1421)", () => {
  /** What a scythe hit on `victim` adds under Harrier's Haste. */
  function riders(moving: boolean): FiredTrigger[] {
    const self = makeCombatant({ id: "d", equipment: SCYTHE });
    self.statuses.apply("harriers-haste", 7, "d", NO_RANKS);
    const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
    victim.moving = moving;
    const fired: FiredTrigger[] = [];
    attackHitRiders(
      self,
      victim,
      SCYTHE.mainHand,
      false,
      0,
      createRng(1),
      RULES.combat,
      new Map(),
      fired,
      [],
    );
    return fired;
  }

  it("hits a moving foe for 10 more, and a standing one for nothing more", () => {
    const [moving] = riders(true);
    expect(moving?.skillId).toBe("dervish.harriers-haste");
    expect(moving?.events.filter((event) => event.kind === "damage")).toHaveLength(1);
    expect(riders(false)).toEqual([]);
  });

  it("moves you 25% faster", () => {
    const self = makeCombatant({ id: "d" });
    self.statuses.apply("harriers-haste", 7, "d", NO_RANKS);
    expect(aggregateModifiers(self.statuses.active).moveSpeedMultiplier).toBe(1.25);
  });
});

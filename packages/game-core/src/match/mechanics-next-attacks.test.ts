import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { fillPools } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveActivationSeconds } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveSwing } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
// An enchantment that does nothing to its bearer's own blows.
const ENCHANTMENT = "guardian";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const swordsman = (): Combatant =>
  makeCombatant({
    id: "a",
    team: 0,
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
  });

const victim = (): Combatant => makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });

function swing(attacker: Combatant, target: Combatant, seed: number): readonly CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: () => false,
  }).events;
}

/** The damage one swing of `attacker` deals on `seed`. */
function dealt(attacker: Combatant, seed: number): number {
  return swing(attacker, victim(), seed).reduce(
    (sum, event) => sum + (event.kind === "damage" && event.targetId === "t" ? event.amount : 0),
    0,
  );
}

/** Whether `target` is poisoned. */
const poisonedBy = (target: Combatant): boolean => target.statuses.has("poison");

describe("Brutal Weapon (#1916)", () => {
  it("adds 13 to a blow, and nothing while its bearer is enchanted", () => {
    const plain = dealt(swordsman(), 3);
    const brutal = swordsman();
    brutal.statuses.apply("brutal-weapon", 34, "r", NO_RANKS);
    expect(dealt(brutal, 3)).toBeGreaterThan(plain);
    brutal.statuses.apply(ENCHANTMENT, 10, "m", NO_RANKS);
    expect(dealt(brutal, 3)).toBe(plain);
    // Lost, it counts again; its time ran on all along.
    brutal.statuses.remove(ENCHANTMENT);
    expect(dealt(brutal, 3)).toBeGreaterThan(plain);
    expect(brutal.statuses.has("brutal-weapon")).toBe(true);
  });

  it("says it does nothing while enchanted", () => {
    expect(describeStatus("brutal-weapon")).toBe(
      "attacks deal 13 more damage, no effect while under an enchantment",
    );
  });
});

describe("Natural Healing (#1916)", () => {
  const healing = skill("dervish.natural-healing");

  it("activates in 0.5 s unenchanted, in its corpus 1 s enchanted", () => {
    const dervish = swordsman();
    expect(effectiveActivationSeconds(healing, dervish)).toBe(0.5);
    dervish.statuses.apply(ENCHANTMENT, 10, "m", NO_RANKS);
    expect(effectiveActivationSeconds(healing, dervish)).toBe(1);
  });

  it("heals for 146 half a second after it starts, unenchanted", () => {
    const match = new MatchSimulation({
      seed: "heal",
      participants: [dervish("a", vec2(0, 0))],
    });
    const self = get(match, "a").combatant;
    self.health = 100;
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(self.cast.activeCast?.totalSeconds).toBe(0.5);
    stepFor(match, 0.6);
    expect(self.health).toBe(246);
  });

  it("an enchantment at the start keeps the corpus second", () => {
    const match = new MatchSimulation({
      seed: "heal",
      participants: [dervish("a", vec2(0, 0))],
    });
    const self = get(match, "a").combatant;
    self.statuses.apply(ENCHANTMENT, 10, "a", NO_RANKS);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(self.cast.activeCast?.totalSeconds).toBe(1);
  });

  it("says when it is faster", () => {
    expect(describeSkill(healing, new Map()).effects.map(({ text }) => text)).toContain(
      "If you have no enchantment: activates 50% faster",
    );
  });
});

describe("Natural Temper (#1916)", () => {
  /** The units one gain of 100 gives a paragon with Wild Throw, under Natural Temper. */
  function gained(enchanted: boolean): number {
    const paragon = swordsman();
    paragon.adrenaline.set("paragon.wild-throw", 0);
    paragon.statuses.apply("natural-temper", 13, "a", NO_RANKS);
    if (enchanted) {
      paragon.statuses.apply(ENCHANTMENT, 10, "m", NO_RANKS);
    }
    fillPools(paragon, 100);
    return paragon.adrenaline.get("paragon.wild-throw") ?? 0;
  }

  it("gains 33% more adrenaline, and none more while enchanted", () => {
    expect(gained(false)).toBe(133);
    expect(gained(true)).toBe(100);
  });
});

describe("Signet of Strength (#1916)", () => {
  it("its 13th attack still deals +5, the 14th not", () => {
    const signet = swordsman();
    signet.statuses.apply("signet-of-strength", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    for (let attack = 1; attack <= 14; attack += 1) {
      const plain = dealt(swordsman(), attack);
      if (attack <= 13) {
        expect(dealt(signet, attack), `attack ${String(attack)}`).toBeGreaterThan(plain);
      } else {
        expect(dealt(signet, attack)).toBe(plain);
      }
    }
    expect(signet.statuses.has("signet-of-strength")).toBe(false);
  });

  it("a blind bearer's misses spend it", () => {
    const signet = swordsman();
    signet.statuses.apply("signet-of-strength", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    signet.statuses.apply("blind", 60, "foe", NO_RANKS);
    const events = Array.from({ length: 13 }, (_, seed) => swing(signet, victim(), seed)).flat();
    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "status-expired", statusId: "signet-of-strength" }),
    );
    expect(signet.statuses.has("signet-of-strength")).toBe(false);
  });

  it("a blocked swing spends one", () => {
    let blocked = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const signet = swordsman();
      signet.statuses.apply("signet-of-strength", Number.POSITIVE_INFINITY, "a", NO_RANKS);
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      if (swing(signet, target, seed).some((event) => event.kind === "attack-blocked")) {
        blocked += 1;
      }
      expect(signet.statuses.get("signet-of-strength")?.attacksMadeLeft).toBe(12);
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("a recast starts the count again, it does not add", () => {
    const signet = swordsman();
    signet.statuses.apply("signet-of-strength", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    swing(signet, victim(), 1);
    signet.statuses.apply("signet-of-strength", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    expect(signet.statuses.get("signet-of-strength")?.attacksMadeLeft).toBe(13);
  });

  it("says it lasts until its attacks are spent", () => {
    expect(describeSkill(skill("warrior.signet-of-strength"), new Map()).effects[0]?.text).toBe(
      "Applies Signet of Strength until it ends (attacks deal 5 more damage, ends after your next 13 attacks, hit, miss or block)",
    );
  });
});

describe("Poison Tip Signet (#1916)", () => {
  const tipped = (): Combatant => {
    const ranger = swordsman();
    ranger.statuses.apply("poison-tip-signet", 60, "a", NO_RANKS);
    return ranger;
  };

  it("a hit poisons for 14 s, and the next attack is plain", () => {
    const ranger = tipped();
    const first = victim();
    swing(ranger, first, 1);
    expect(first.statuses.get("poison")?.remainingSeconds).toBe(14);
    expect(ranger.statuses.has("poison-tip-signet")).toBe(false);
    const second = victim();
    swing(ranger, second, 2);
    expect(poisonedBy(second)).toBe(false);
  });

  it("a miss ends it with no poison", () => {
    const ranger = tipped();
    ranger.statuses.apply("blind", 60, "foe", NO_RANKS);
    for (let seed = 0; seed < 50; seed += 1) {
      const target = victim();
      if (swing(ranger, target, seed).some((event) => event.kind === "attack-missed")) {
        expect(poisonedBy(target)).toBe(false);
        expect(ranger.statuses.has("poison-tip-signet")).toBe(false);
        return;
      }
      ranger.statuses.apply("poison-tip-signet", 60, "a", NO_RANKS);
    }
    throw new Error("a blind ranger never missed");
  });

  it("runs out at 60 s unspent", () => {
    const ranger = tipped();
    ranger.statuses.advance(59.9, false);
    expect(ranger.statuses.has("poison-tip-signet")).toBe(true);
    ranger.statuses.advance(0.2, false);
    expect(ranger.statuses.has("poison-tip-signet")).toBe(false);
  });

  it("an arrow carries it from its release: spent as it leaves, it poisons where it lands", () => {
    const match = new MatchSimulation({
      seed: "tip",
      participants: [archer("a", vec2(0, 0)), dummy("d", vec2(600, 0))],
    });
    const ranger = get(match, "a").combatant;
    ranger.statuses.apply("poison-tip-signet", 60, "a", NO_RANKS);
    match.requestAttack("a", "d");
    let released = false;
    for (let i = 0; i < 200 && !released; i += 1) {
      match.step(DT);
      released = match.projectiles.length > 0;
    }
    expect(released).toBe(true);
    expect(ranger.statuses.has("poison-tip-signet")).toBe(false);
    match.cancelAction("a");
    stepFor(match, 3);
    expect(get(match, "d").combatant.statuses.has("poison")).toBe(true);
  });
});

/** A rank-12 dervish with Natural Healing. */
function dervish(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: ["dervish.natural-healing"],
    attributeRanks: new Map([["dervish.wind-prayers", 12]]),
    equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery"),
    spawn,
    facing: 0,
  };
}

/** A rank-12 ranger with a longbow. */
function archer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    spawn,
    facing: 0,
  };
}

/** A sturdy foe that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

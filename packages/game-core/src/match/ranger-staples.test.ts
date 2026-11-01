import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import {
  attackDurationSeconds,
  resolveAttackSkill,
  resolveSwing,
  swingIntervalSeconds,
} from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Ranger staples (#976): Lightning Reflexes and Escape, two stances
 * that block, and Pin Down and Hunter's Shot, two arrows that cripple and
 * bleed. Escape ends on a melee attack only: a shot keeps it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const NOWHERE = (): boolean => false;
const PIN_DOWN = "ranger.pin-down";
const HUNTERS_SHOT = "ranger.hunters-shot";
const SAVAGE_SHOT = "ranger.savage-shot";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

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

const ended = (statusId: StatusId, targetId = "r"): CombatEvent => ({
  kind: "status-expired",
  targetId,
  statusId,
});

const victim = (): Combatant => makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });

/** A ranger holding `weapon`, in Escape. */
function escaping(weapon: Weapon, attributeId: string): Combatant {
  const ranger = makeCombatant({
    id: "r",
    team: 0,
    equipment: wielding(weapon, attributeId),
    attributeRanks: new Map([[attributeId, 12]]),
  });
  ranger.statuses.apply("escape", 7, "r", NO_RANKS);
  return ranger;
}

function swing(attacker: Combatant, seed = 1): CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: victim(), position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: NOWHERE,
  }).events;
}

describe("the four skills (#976)", () => {
  it("cost, activate and recharge as the PvP corpus says, at rank 12", () => {
    expect(skill("ranger.lightning-reflexes")).toMatchObject({
      type: "stance",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "ranger.expertise",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 45,
      target: "self",
      effects: [{ kind: "apply-status", statusId: "lightning-reflexes", durationSeconds: 10 }],
    });
    expect(skill("ranger.escape")).toMatchObject({
      type: "stance",
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "ranger.expertise",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0,
      rechargeSeconds: 12,
      target: "self",
      effects: [{ kind: "apply-status", statusId: "escape", durationSeconds: 7 }],
    });
    expect(skill(PIN_DOWN)).toMatchObject({
      type: "attack",
      attributeId: "ranger.marksmanship",
      cost: { kind: "energy", amount: 15 },
      activationSeconds: 0,
      rechargeSeconds: 8,
      attack: { weapon: "bow", unblockable: false },
      effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 13 }],
    });
    expect(skill(HUNTERS_SHOT)).toMatchObject({
      type: "attack",
      attributeId: "ranger.marksmanship",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      attack: { weapon: "bow", unblockable: false },
      effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 21 }],
    });
  });

  it("are stances that end each other, and Natural Stride", () => {
    const ranger = makeCombatant({ id: "r" });
    ranger.statuses.apply("natural-stride", 7, "r", NO_RANKS);
    ranger.statuses.apply("lightning-reflexes", 10, "r", NO_RANKS);
    expect(ranger.statuses.active.map(({ id }) => id)).toEqual(["lightning-reflexes"]);
    ranger.statuses.apply("escape", 7, "r", NO_RANKS);
    expect(ranger.statuses.active.map(({ id }) => id)).toEqual(["escape"]);
  });
});

describe("Lightning Reflexes (#976)", () => {
  it("blocks 75% of melee and of projectile attacks, and attacks 33% faster", () => {
    const ranger = makeCombatant({
      id: "r",
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    });
    const plain = swingIntervalSeconds(ranger);
    ranger.statuses.apply("lightning-reflexes", 10, "r", NO_RANKS);
    expect(blockChanceOf(ranger, "melee", false)).toBe(0.75);
    expect(blockChanceOf(ranger, "projectile", false)).toBe(0.75);
    expect(swingIntervalSeconds(ranger)).toBeCloseTo(plain * 0.67, 10);
    // Hunter's Shot's 1 s.
    expect(attackDurationSeconds(ranger, 1)).toBeCloseTo(0.67, 10);
  });

  it("says so", () => {
    expect(describeStatus("lightning-reflexes")).toBe(
      "attacks 33% faster, 75% chance to block attacks",
    );
  });
});

describe("Escape (#976)", () => {
  it("moves 33% faster and blocks 75% of attacks", () => {
    const modifiers = aggregateModifiers([{ id: "escape", ranks: NO_RANKS }]);
    expect(modifiers.moveSpeedMultiplier).toBe(1.33);
    expect(blockChanceOf(escaping(WEAPONS.longbow, "ranger.marksmanship"), "melee", false)).toBe(
      0.75,
    );
  });

  it("survives a longbow swing", () => {
    const ranger = escaping(WEAPONS.longbow, "ranger.marksmanship");
    expect(swing(ranger)).not.toContainEqual(ended("escape"));
    expect(ranger.statuses.has("escape")).toBe(true);
  });

  it("ends on a sword swing, a miss too", () => {
    const hitting = escaping(WEAPONS.sword, "warrior.swordsmanship");
    const events = swing(hitting);
    expect(events.some((event) => event.kind === "damage")).toBe(true);
    expect(events).toContainEqual(ended("escape"));
    expect(hitting.statuses.has("escape")).toBe(false);

    const blinded = escaping(WEAPONS.sword, "warrior.swordsmanship");
    blinded.statuses.apply("blind", 10, "foe", NO_RANKS);
    let missed = 0;
    for (let seed = 0; seed < 20 && missed === 0; seed += 1) {
      blinded.statuses.apply("escape", 7, "r", NO_RANKS);
      const missing = swing(blinded, seed);
      if (
        missing.every((event) => event.kind === "attack-missed" || event.kind === "status-expired")
      ) {
        missed += 1;
        expect(missing).toContainEqual(ended("escape"));
      }
    }
    expect(missed).toBe(1);
  });

  it("ends on a melee attack skill", () => {
    const ranger = escaping(WEAPONS.daggers, "assassin.dagger-mastery");
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: skill("assassin.jagged-strike"),
        caster: ranger,
        targets: [victim()],
        rng: createRng(1),
        rules: RULES.combat,
      },
      NOWHERE,
      [],
    );
    expect(events).toContainEqual(ended("escape"));
    expect(ranger.statuses.has("escape")).toBe(false);
  });

  it("says so", () => {
    expect(describeStatus("escape")).toBe(
      "moves at 133% speed, 75% chance to block attacks, ends if the bearer makes a melee attack",
    );
  });
});

describe("the Ranger's arrows in a match (#976)", () => {
  const archer: ParticipantSpec = {
    id: "r",
    team: 0,
    skillBar: [PIN_DOWN, HUNTERS_SHOT, SAVAGE_SHOT],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
  const target: ParticipantSpec = {
    id: "t",
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn: vec2(300, 0),
    facing: 0,
  };

  function sim(seed = "ranger"): MatchSimulation {
    return new MatchSimulation({ seed, participants: [archer, target] });
  }

  function combatant(match: MatchSimulation, id: string): Combatant {
    const found = match.get(id)?.combatant;
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /** Use the skill in `slot` at the target, and step until its arrow lands. */
  function shoot(match: MatchSimulation, slot: number): CombatLogEntry {
    match.setTarget("r", "t");
    expect(match.requestSkill("r", slot)?.check).toEqual({ ok: true });
    let released = false;
    for (let i = 0; i < 400; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.cause === "skill" && logged.sourceId === "r");
      released ||= match.projectiles.length > 0;
      if (entry !== undefined && released && match.projectiles.length === 0) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  const kinds = (entry: CombatLogEntry) => entry.events.map((event) => event.kind);

  it("Pin Down cripples for 13 s when its arrow hits", () => {
    const match = sim();
    const landed = shoot(match, 0);
    expect(kinds(landed)).toEqual(["damage", "status-applied"]);
    expect(combatant(match, "t").statuses.get("crippled")?.durationSeconds).toBe(13);
  });

  it("Hunter's Shot bleeds for 21 s when its arrow hits", () => {
    const match = sim();
    const landed = shoot(match, 1);
    expect(kinds(landed)).toEqual(["damage", "status-applied"]);
    expect(combatant(match, "t").statuses.get("bleeding")?.durationSeconds).toBe(21);
  });

  it("Pin Down cripples nobody when its arrow is blocked", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = sim(`block-${String(seed)}`);
      combatant(match, "t").statuses.apply("guardian", 1000, "t", NO_RANKS);
      const landed = shoot(match, 0);
      if (!kinds(landed).includes("attack-blocked")) {
        continue;
      }
      expect(kinds(landed)).toEqual(["attack-blocked"]);
      expect(combatant(match, "t").statuses.has("crippled")).toBe(false);
      return;
    }
    throw new Error("no seed blocked the arrow");
  });

  it("Pin Down cripples nobody when a blinded ranger misses", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = sim(`blind-${String(seed)}`);
      combatant(match, "r").statuses.apply("blind", 1000, "t", NO_RANKS);
      match.setTarget("r", "t");
      match.requestSkill("r", 0);
      const log: CombatEvent[] = [];
      for (let i = 0; i < 200; i += 1) {
        log.push(...match.step(DT).log.flatMap((entry) => entry.events));
      }
      if (!log.some((event) => event.kind === "attack-missed")) {
        continue;
      }
      expect(combatant(match, "t").statuses.has("crippled")).toBe(false);
      return;
    }
    throw new Error("no seed missed");
  });

  it("an arrow from a ranger in Escape, Savage Shot's too, keeps Escape up", () => {
    const match = sim();
    const ranger = combatant(match, "r");
    ranger.statuses.apply("escape", 1000, "r", NO_RANKS);
    expect(kinds(shoot(match, 0))).toContain("damage");
    expect(kinds(shoot(match, 2))).toContain("damage");
    expect(ranger.statuses.has("escape")).toBe(true);
  });
});

describe("the four shots (#1008)", () => {
  const CONCUSSION_SHOT = "ranger.concussion-shot";
  const CRIPPLING_SHOT = "ranger.crippling-shot";
  const DEBILITATING_SHOT = "ranger.debilitating-shot";
  const BURNING_ARROW = "ranger.burning-arrow";
  const archer: ParticipantSpec = {
    id: "r",
    team: 0,
    skillBar: [CONCUSSION_SHOT, CRIPPLING_SHOT, DEBILITATING_SHOT, BURNING_ARROW],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
  const target: ParticipantSpec = {
    id: "t",
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn: vec2(300, 0),
    facing: 0,
  };

  function sim(seed = "shots"): MatchSimulation {
    return new MatchSimulation({ seed, participants: [archer, target] });
  }

  function combatant(match: MatchSimulation, id: string): Combatant {
    const found = match.get(id)?.combatant;
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /** Use the skill in `slot` at the target, and step until its arrow lands. */
  function shoot(match: MatchSimulation, slot: number): CombatLogEntry {
    match.setTarget("r", "t");
    expect(match.requestSkill("r", slot)?.check).toEqual({ ok: true });
    let released = false;
    for (let i = 0; i < 400; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.cause === "skill" && logged.sourceId === "r");
      released ||= match.projectiles.length > 0;
      if (entry !== undefined && released && match.projectiles.length === 0) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  /** The target, 10 s into nothing: a long `skillId` it is activating. */
  function casting(match: MatchSimulation, skillId: string): Combatant {
    const foe = combatant(match, "t");
    foe.cast.beginCast(skillId, "r", 10, undefined);
    return foe;
  }

  const kinds = (entry: CombatLogEntry) => entry.events.map((event) => event.kind);
  const damageOf = (entry: CombatLogEntry): number =>
    entry.events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);

  it("Concussion Shot interrupts a spell, dazes for 17 s and deals only 13", () => {
    const match = sim();
    const foe = casting(match, "elementalist.fireball");
    const landed = shoot(match, 0);
    expect(kinds(landed)).toEqual(["damage", "interrupted", "status-applied"]);
    expect(damageOf(landed)).toBe(13);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(foe.cast.rechargeRemaining.get("elementalist.fireball")).toBeGreaterThan(0);
    expect(foe.statuses.get("dazed")?.durationSeconds).toBe(17);
  });

  it("Concussion Shot lets a chant through: no daze, and the miss names it", () => {
    const match = sim();
    const foe = casting(match, "paragon.anthem-of-flame");
    const landed = shoot(match, 0);
    expect(landed.events).toContainEqual({
      kind: "interrupt-missed",
      targetId: "t",
      refusedSkillId: "paragon.anthem-of-flame",
    });
    expect(foe.cast.activeCast?.skillId).toBe("paragon.anthem-of-flame");
    expect(foe.statuses.has("dazed")).toBe(false);
  });

  it("Concussion Shot at a foe already Dazed: the hit interrupts, and the daze refreshes", () => {
    const match = sim();
    const foe = casting(match, "elementalist.fireball");
    foe.statuses.apply("dazed", 2, "r", NO_RANKS);
    const landed = shoot(match, 0);
    expect(kinds(landed).filter((kind) => kind === "interrupted")).toHaveLength(1);
    expect(kinds(landed)).not.toContain("interrupt-missed");
    expect(foe.statuses.get("dazed")?.durationSeconds).toBe(17);
    expect(foe.statuses.get("dazed")?.remainingSeconds).toBeGreaterThan(16);
  });

  it("Crippling Shot cripples for 10 s through Lightning Reflexes, never blocked", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const match = sim(`unblockable-${String(seed)}`);
      combatant(match, "t").statuses.apply("lightning-reflexes", 1000, "t", NO_RANKS);
      const landed = shoot(match, 1);
      expect(kinds(landed)).toEqual(["damage", "status-applied"]);
      expect(combatant(match, "t").statuses.get("crippled")?.durationSeconds).toBe(10);
    }
  });

  it("Crippling Shot still misses when the ranger is Blind", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = sim(`blind-${String(seed)}`);
      combatant(match, "r").statuses.apply("blind", 1000, "t", NO_RANKS);
      match.setTarget("r", "t");
      match.requestSkill("r", 1);
      const log: CombatEvent[] = [];
      for (let i = 0; i < 200; i += 1) {
        log.push(...match.step(DT).log.flatMap((entry) => entry.events));
      }
      if (!log.some((event) => event.kind === "attack-missed")) {
        continue;
      }
      expect(combatant(match, "t").statuses.has("crippled")).toBe(false);
      return;
    }
    throw new Error("no seed missed");
  });

  it("Debilitating Shot takes 8 energy from a full foe, and 3 from a foe with 3", () => {
    const full = sim();
    expect(shoot(full, 2).events).toContainEqual({ kind: "energy-loss", targetId: "t", amount: 8 });

    const drained = sim();
    combatant(drained, "t").energy = 3;
    expect(shoot(drained, 2).events).toContainEqual({
      kind: "energy-loss",
      targetId: "t",
      amount: 3,
    });
    expect(combatant(drained, "t").energy).toBe(0);
  });

  it("Burning Arrow hits 26 harder than a plain arrow on the same roll, and burns for 6 s", () => {
    const burning = sim("same-roll");
    const burnt = shoot(burning, 3);
    expect(kinds(burnt)).toEqual(["damage", "status-applied"]);
    expect(combatant(burning, "t").statuses.get("burning")?.durationSeconds).toBe(6);

    const plain = sim("same-roll");
    const crippled = shoot(plain, 1);
    expect(damageOf(burnt) - damageOf(crippled)).toBe(26);
  });

  it("a blocked arrow lands no rider", () => {
    for (const slot of [0, 2, 3]) {
      let blocked = false;
      for (let seed = 0; seed < 20; seed += 1) {
        const match = sim(`block-${String(slot)}-${String(seed)}`);
        const foe = casting(match, "elementalist.fireball");
        foe.energy = 20;
        foe.statuses.apply("guardian", 1000, "t", NO_RANKS);
        const landed = shoot(match, slot);
        if (!kinds(landed).includes("attack-blocked")) {
          continue;
        }
        expect(kinds(landed), String(slot)).toEqual(["attack-blocked"]);
        expect(foe.cast.activeCast?.skillId).toBe("elementalist.fireball");
        expect(foe.energy).toBe(20);
        expect(foe.statuses.has("dazed") || foe.statuses.has("burning")).toBe(false);
        blocked = true;
        break;
      }
      expect(blocked, `no seed blocked slot ${String(slot)}`).toBe(true);
    }
  });
});

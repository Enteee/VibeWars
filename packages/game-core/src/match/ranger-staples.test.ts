import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { aggregateModifiers, type StatusId } from "../skills/status.js";
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
    mainHand: { weapon, attributeId, damageType: weapon.damageType, requirementMet: true },
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
  ranger.statuses.apply("escape", 7, "r");
  return ranger;
}

function swing(attacker: Combatant, seed = 1): CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: victim(), position: vec2(40, 0) },
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
    ranger.statuses.apply("natural-stride", 7, "r");
    ranger.statuses.apply("lightning-reflexes", 10, "r");
    expect(ranger.statuses.active.map(({ id }) => id)).toEqual(["lightning-reflexes"]);
    ranger.statuses.apply("escape", 7, "r");
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
    ranger.statuses.apply("lightning-reflexes", 10, "r");
    expect(blockChanceOf(ranger, "melee")).toBe(0.75);
    expect(blockChanceOf(ranger, "projectile")).toBe(0.75);
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
    const modifiers = aggregateModifiers([{ id: "escape" }]);
    expect(modifiers.moveSpeedMultiplier).toBe(1.33);
    expect(blockChanceOf(escaping(WEAPONS.longbow, "ranger.marksmanship"), "melee")).toBe(0.75);
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
    blinded.statuses.apply("blind", 10, "foe");
    let missed = 0;
    for (let seed = 0; seed < 20 && missed === 0; seed += 1) {
      blinded.statuses.apply("escape", 7, "r");
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
      combatant(match, "t").statuses.apply("guardian", 1000, "t");
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
      combatant(match, "r").statuses.apply("blind", 1000, "t");
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
    ranger.statuses.apply("escape", 1000, "r");
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
    skillBar: [CONCUSSION_SHOT, CRIPPLING_SHOT, DEBILITATING_SHOT, BURNING_ARROW, PIN_DOWN],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
  const foe: ParticipantSpec = {
    id: "t",
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 20,
    spawn: vec2(300, 0),
    facing: 0,
  };

  function sim(seed = "shots"): MatchSimulation {
    return new MatchSimulation({ seed, participants: [archer, foe] });
  }

  function combatant(match: MatchSimulation, id: string): Combatant {
    const found = match.get(id)?.combatant;
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /**
   * Use the skill in `slot` at the foe, who starts on `busyWith` (or
   * nothing) while the arrow flies, and return what the arrow did.
   */
  function shoot(match: MatchSimulation, slot: number, busyWith?: string): CombatLogEntry {
    match.setTarget("r", "t");
    expect(match.requestSkill("r", slot)?.check).toEqual({ ok: true });
    for (let i = 0; i < 400 && match.projectiles.length === 0; i += 1) {
      match.step(DT);
    }
    if (busyWith !== undefined) {
      combatant(match, "t").cast.beginCast(busyWith, "t", 30, undefined);
    }
    for (let i = 0; i < 400; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.cause === "skill" && logged.sourceId === "r");
      if (entry !== undefined) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  const kinds = (entry: CombatLogEntry) => entry.events.map((event) => event.kind);
  const damage = (entry: CombatLogEntry): number =>
    entry.events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);

  it("cost, activate and recharge as the PvP corpus says, at rank 12", () => {
    expect(skill(CONCUSSION_SHOT)).toMatchObject({
      elite: false,
      attributeId: "ranger.marksmanship",
      cost: { kind: "energy", amount: 25 },
      activationSeconds: 0.5,
      rechargeSeconds: 5,
      attack: { weapon: "bow", weaponDamage: 0, unblockable: false },
    });
    // The 2026-04-28 revision: 2 s and 10, not fandom's 8.
    expect(skill(CRIPPLING_SHOT)).toMatchObject({
      elite: true,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 2,
      attack: { weapon: "bow", unblockable: true },
      effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 10 }],
    });
    expect(skill(DEBILITATING_SHOT)).toMatchObject({
      elite: false,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 10,
      attack: { weapon: "bow", unblockable: false },
    });
    expect(skill(BURNING_ARROW)).toMatchObject({
      elite: true,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 0,
      rechargeSeconds: 5,
      attack: { weapon: "bow", unblockable: false },
      effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 6 }],
    });
  });

  it("Concussion Shot interrupts a spell, which recharges, dazes for 17 s and deals 13", () => {
    const match = sim();
    const landed = shoot(match, 0, "elementalist.fireball");
    expect(kinds(landed)).toEqual(["damage", "interrupted", "status-applied"]);
    expect(damage(landed)).toBe(13);
    const target = combatant(match, "t");
    expect(target.cast.activeCast).toBeUndefined();
    expect(target.cast.rechargeRemaining.get("elementalist.fireball") ?? 0).toBeGreaterThan(0);
    expect(target.statuses.get("dazed")?.durationSeconds).toBe(17);
  });

  it("Concussion Shot lets a chant go on, dazes nobody, and says why", () => {
    const match = sim();
    const landed = shoot(match, 0, "paragon.anthem-of-flame");
    expect(landed.events).toContainEqual({
      kind: "interrupt-missed",
      targetId: "t",
      refusedSkillId: "paragon.anthem-of-flame",
    });
    expect(kinds(landed)).toEqual(["damage", "interrupt-missed"]);
    const target = combatant(match, "t");
    expect(target.cast.activeCast?.skillId).toBe("paragon.anthem-of-flame");
    expect(target.statuses.has("dazed")).toBe(false);
  });

  it("Concussion Shot on a foe already Dazed: one interrupt, no miss, and Dazed back to 17 s", () => {
    const match = sim();
    combatant(match, "t").statuses.apply("dazed", 2, "r");
    const landed = shoot(match, 0, "elementalist.fireball");
    expect(kinds(landed).filter((kind) => kind === "interrupted")).toHaveLength(1);
    expect(kinds(landed)).not.toContain("interrupt-missed");
    expect(combatant(match, "t").statuses.get("dazed")?.durationSeconds).toBe(17);
  });

  it("Crippling Shot cripples for 10 s through Lightning Reflexes, never blocked", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = sim(`reflexes-${String(seed)}`);
      combatant(match, "t").statuses.apply("lightning-reflexes", 1000, "t");
      const landed = shoot(match, 1);
      expect(kinds(landed)).toEqual(["damage", "status-applied"]);
      expect(combatant(match, "t").statuses.get("crippled")?.durationSeconds).toBe(10);
    }
  });

  it("Crippling Shot still misses when the ranger is Blind", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = sim(`blind-${String(seed)}`);
      combatant(match, "r").statuses.apply("blind", 1000, "t");
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
    expect(combatant(full, "t").energy).toBe(12);

    const low = sim();
    combatant(low, "t").energy = 3;
    expect(shoot(low, 2).events).toContainEqual({ kind: "energy-loss", targetId: "t", amount: 3 });
    expect(combatant(low, "t").energy).toBe(0);
  });

  it("Burning Arrow hits 26 harder than a plain arrow on the same roll, and burns for 6 s", () => {
    const burning = sim();
    const plain = sim();
    const hot = shoot(burning, 3);
    expect(damage(hot) - damage(shoot(plain, 4))).toBe(26);
    expect(combatant(burning, "t").statuses.get("burning")?.durationSeconds).toBe(6);
  });

  it("none of the other three lands its rider on a blocked arrow", () => {
    for (const slot of [0, 2, 3]) {
      let blocked = false;
      for (let seed = 0; seed < 20 && !blocked; seed += 1) {
        const match = sim(`block-${String(slot)}-${String(seed)}`);
        combatant(match, "t").statuses.apply("guardian", 1000, "t");
        const landed = shoot(match, slot, "elementalist.fireball");
        blocked = kinds(landed).includes("attack-blocked");
        if (blocked) {
          expect(kinds(landed)).toEqual(["attack-blocked"]);
        }
      }
      expect(blocked).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffects } from "../skills/effects.js";
import { blockChanceOf } from "../skills/tick.js";
import { getSkill } from "../skills/catalog.js";
import { emptyAdrenaline } from "../skills/adrenaline.js";
import { chargeAdrenaline, makeCombatant, withStatusDefinitions } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BACKBREAKER = "warrior.backbreaker";
const FIREBALL = "elementalist.fireball";
const KNOCKDOWN = [{ kind: "knockdown", durationSeconds: 4 }] as const;

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

/** A rank-12 hammer warrior with Backbreaker and the adrenaline for it. */
function hammerer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [BACKBREAKER],
    attributeRanks: new Map([["warrior.hammer-mastery", 12]]),
    equipment: wielding(WEAPONS.hammer, "warrior.hammer-mastery"),
    spawn,
    facing: 0,
  };
}

/** A sturdy foe with a sword and Fireball, to be caught mid-cast. */
function caster(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [FIREBALL],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    maxHealth: 1e6,
    maxEnergy: 1000,
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

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

const events = (log: readonly CombatLogEntry[]) => log.flatMap((entry) => entry.events);

/**
 * The hammerer at `a`, the caster `v` in reach, attacking `a` and then
 * casting Fireball at it as Backbreaker is pressed: its blow lands at
 * 0.875 s, inside Fireball's 1 s cast.
 */
function backbreakerMidCast(): MatchSimulation {
  const match = new MatchSimulation({
    seed: "knockdown",
    participants: [hammerer("a", vec2(0, 0)), caster("v", vec2(40, 0))],
  });
  chargeAdrenaline(get(match, "a").combatant);
  match.setTarget("a", "v");
  match.setTarget("v", "a");
  expect(match.requestAttack("v", "a")).toEqual({ ok: true });
  expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
  expect(match.requestSkill("v", 0)?.check).toEqual({ ok: true });
  return match;
}

/** Step until `id` is knocked down, returning the log so far. */
function untilKnockedDown(match: MatchSimulation, id: string): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 100 && get(match, id).combatant.knockdownRemaining === 0; i += 1) {
    log.push(...match.step(DT).log);
  }
  expect(get(match, id).combatant.knockdownRemaining).toBeGreaterThan(0);
  return log;
}

describe("Backbreaker knocks down (#544)", () => {
  it("on a hit: down 4 s, its cast cancelled and recharging, its attack ended, no interrupt", () => {
    const match = backbreakerMidCast();
    const log = untilKnockedDown(match, "v");

    expect(events(log)).toContainEqual({
      kind: "knocked-down",
      targetId: "v",
      durationSeconds: 4,
    });
    const victim = get(match, "v").combatant;
    expect(victim.cast.activeCast).toBeUndefined();
    expect(victim.cast.rechargeRemaining.get(FIREBALL)).toBeCloseTo(7, 1);
    expect(victim.attack).toBeUndefined();
    expect(events(log).some((event) => event.kind === "interrupted")).toBe(false);
    // The Fireball never goes off.
    expect(stepFor(match, 3).filter((entry) => entry.skillId === FIREBALL)).toEqual([]);
  });

  it("while down, clicks, attacks and skills are refused, and none of them come back on rising", () => {
    const match = backbreakerMidCast();
    untilKnockedDown(match, "v");
    const at = get(match, "v").position;

    match.walkTo("v", vec2(-300, 0));
    expect(match.requestAttack("v", "a")).toEqual({ ok: false, reason: "caster-knocked-down" });
    get(match, "v").combatant.cast.startRecharge(FIREBALL, 0);
    expect(match.requestSkill("v", 0)?.check).toEqual({
      ok: false,
      reason: "caster-knocked-down",
    });
    stepFor(match, 1);
    expect(get(match, "v").position).toEqual(at);

    stepFor(match, 3.5);
    const risen = get(match, "v");
    expect(risen.combatant.knockdownRemaining).toBe(0);
    expect(risen.position).toEqual(at);
    expect(risen.walkGoal).toBeUndefined();
    expect(risen.combatant.attack).toBeUndefined();
    expect(match.requestAttack("v", "a")).toEqual({ ok: true });
  });

  it("lasts exactly 4 s: down on the tick it lands, standing 80 ticks later", () => {
    const match = backbreakerMidCast();
    untilKnockedDown(match, "v");
    const ticks = 4 / DT;
    for (let i = 1; i < ticks; i += 1) {
      match.step(DT);
      expect(get(match, "v").combatant.knockdownRemaining).toBeGreaterThan(0);
    }
    match.step(DT);
    expect(get(match, "v").combatant.knockdownRemaining).toBe(0);
  });

  it("a held direction walks on the rising tick: the key mirrors the keyboard, not an action", () => {
    const match = backbreakerMidCast();
    match.setInputDirection("v", vec2(0, 1));
    // Moving cancelled the Fireball; the knockdown still lands on the blow.
    untilKnockedDown(match, "v");
    const at = get(match, "v").position;
    while (get(match, "v").combatant.knockdownRemaining > 0) {
      expect(get(match, "v").position).toEqual(at);
      match.step(DT);
    }
    expect(get(match, "v").position).not.toEqual(at);
  });

  it("a key released while down stands the risen body still", () => {
    const match = backbreakerMidCast();
    match.setInputDirection("v", vec2(0, 1));
    untilKnockedDown(match, "v");
    stepFor(match, 1);
    match.setInputDirection("v", vec2(0, 0));
    const at = get(match, "v").position;
    stepFor(match, 4);
    expect(get(match, "v").combatant.knockdownRemaining).toBe(0);
    expect(get(match, "v").position).toEqual(at);
  });

  it("a key pressed while down cancels nothing it lands on and walks on rising", () => {
    const match = backbreakerMidCast();
    untilKnockedDown(match, "v");
    const at = get(match, "v").position;
    match.setInputDirection("v", vec2(1, 0));
    expect(get(match, "v").walkGoal).toBeUndefined();
    stepFor(match, 4.5);
    expect(get(match, "v").position.x).toBeGreaterThan(at.x);
  });

  it("on a miss (blind): nothing", () => {
    withStatusDefinitions({ blind: { attackMissChance: 1 } }, () => {
      const match = backbreakerMidCast();
      get(match, "a").combatant.statuses.apply("blind", 10, "v", NO_RANKS);
      const log = stepFor(match, 1);
      expect(events(log)).toContainEqual({ kind: "attack-missed", targetId: "v" });
      expect(events(log).some((event) => event.kind === "knocked-down")).toBe(false);
      expect(get(match, "v").combatant.knockdownRemaining).toBe(0);
    });
  });

  it("death while down stands the corpse up: nothing left to count down at respawn", () => {
    const match = backbreakerMidCast();
    untilKnockedDown(match, "v");
    const victim = get(match, "v").combatant;
    victim.health = 1;
    emptyAdrenaline(get(match, "a").combatant);
    expect(match.requestAttack("a", "v")).toEqual({ ok: true });
    stepFor(match, 3.5);
    expect(victim.dead).toBe(true);
    expect(victim.knockdownRemaining).toBe(0);
  });

  it("describes itself", () => {
    const skill = getSkill(BACKBREAKER);
    expect(skill === undefined ? [] : describeSkill(skill).effects.map((e) => e.text)).toContain(
      "Knocks down for 4s",
    );
  });
});

describe("the knockdown effect", () => {
  const context = (target = makeCombatant({ id: "t", team: 1 })) => ({
    caster: makeCombatant({ id: "c" }),
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
  });

  it("does nothing to someone already down, and lands again the instant they rise", () => {
    const ctx = context();
    expect(applyEffects(KNOCKDOWN, ctx)).toHaveLength(1);
    ctx.target.knockdownRemaining = 0.05;
    expect(applyEffects(KNOCKDOWN, ctx)).toEqual([]);
    expect(ctx.target.knockdownRemaining).toBe(0.05);
    ctx.target.knockdownRemaining = 0;
    expect(applyEffects(KNOCKDOWN, ctx)).toEqual([
      { kind: "knocked-down", targetId: "t", durationSeconds: 4 },
    ]);
  });

  it("two the same tick: the first lands, the second does nothing", () => {
    const ctx = context();
    const both = [...KNOCKDOWN, { kind: "knockdown", durationSeconds: 2 }] as const;
    expect(applyEffects(both, ctx)).toEqual([
      { kind: "knocked-down", targetId: "t", durationSeconds: 4 },
    ]);
    expect(ctx.target.knockdownRemaining).toBe(4);
  });

  it("does nothing to the dead", () => {
    const ctx = context(makeCombatant({ id: "t", team: 1, dead: true }));
    expect(applyEffects(KNOCKDOWN, ctx)).toEqual([]);
    expect(ctx.target.knockdownRemaining).toBe(0);
  });

  it("does nothing while a status that prevents it is active", () => {
    withStatusDefinitions({ "armor-boost": { preventsKnockdown: true } }, () => {
      const ctx = context();
      ctx.target.statuses.apply("armor-boost", 10, "t", NO_RANKS);
      expect(applyEffects(KNOCKDOWN, ctx)).toEqual([]);
      expect(ctx.target.knockdownRemaining).toBe(0);
    });
  });

  it("is not a status: removing every enchantment, hex and condition leaves it", () => {
    const ctx = context();
    applyEffects(KNOCKDOWN, ctx);
    ctx.target.statuses.removeByCategory("condition");
    ctx.target.statuses.removeByCategory("hex");
    ctx.target.statuses.removeByCategory("enchantment");
    expect(ctx.target.knockdownRemaining).toBe(4);
  });
});

describe("a knocked-down character can't block (#610)", () => {
  it("blocks again on the tick its knockdown ends: that counts down before any blow", () => {
    const match = new MatchSimulation({
      seed: "rising-block",
      participants: [hammerer("a", vec2(0, 0)), caster("v", vec2(40, 0))],
    });
    const v = get(match, "v").combatant;
    v.statuses.apply("guardian", 60, "monk", NO_RANKS);
    v.knockdownRemaining = DT;
    expect(blockChanceOf(v, "melee", false)).toBe(0);
    match.step(DT);
    expect(v.knockdownRemaining).toBe(0);
    expect(blockChanceOf(v, "melee", false)).toBe(0.5);
  });
});

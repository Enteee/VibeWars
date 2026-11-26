import { describe, expect, it } from "vitest";

import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { skillDamage, effectiveArmor } from "../skills/damage.js";
import { applyEffects } from "../skills/effects.js";
import { chargeAdrenaline, withStatusDefinitions } from "../skills/testing.js";
import type { Combatant } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const HEALING_SIGNET = "warrior.healing-signet";
const WATCH_YOURSELF = "warrior.watch-yourself";
const FIREBALL = "elementalist.fireball";

const swordsman: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function warrior(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [HEALING_SIGNET, WATCH_YOURSELF, FIREBALL],
    attributeRanks: new Map([
      ["warrior.tactics", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: swordsman,
    maxHealth: 1000,
    startHealthFraction: 0.5,
    spawn,
    facing: 0,
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

const armorOf = (combatant: Combatant) =>
  effectiveArmor(combatant, skillDamage(1, "typeless", 0), "chest");

describe("Healing Signet (#524)", () => {
  function signetter(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "signet",
      participants: [warrior("w", 0, vec2(0, 0)), warrior("foe", 1, vec2(300, 0))],
    });
    get(match, "w").combatant.energy = 0;
    return match;
  }

  it("costs nothing, so it activates at 0 energy, and heals at its rank-12 number", () => {
    const match = signetter();
    const w = get(match, "w").combatant;
    expect(match.requestSkill("w", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2.1);
    expect(w.health).toBeCloseTo(500 + 154);
  });

  it("takes 40 armor while activating and gives it back when it goes off", () => {
    const match = signetter();
    const w = get(match, "w").combatant;
    const before = armorOf(w);
    match.requestSkill("w", 0);
    stepFor(match, 1);
    expect(armorOf(w)).toBe(before - 40);
    stepFor(match, 1.1);
    expect(w.cast.isCasting).toBe(false);
    expect(armorOf(w)).toBe(before);
    expect(w.statuses.has("healing-signet-armor")).toBe(false);
  });

  it("gives the armor back when interrupted, and recharges as any interrupted skill", () => {
    const match = signetter();
    const w = get(match, "w").combatant;
    const before = armorOf(w);
    match.requestSkill("w", 0);
    stepFor(match, 1);
    applyEffects([{ kind: "interrupt" }], {
      surroundings: new Map(),
      caster: get(match, "foe").combatant,
      target: w,
      rng: createRng(524),
      rules: RULES.combat,
    });
    expect(armorOf(w)).toBe(before);
    expect(w.cast.rechargeRemaining.get(HEALING_SIGNET)).toBeGreaterThan(0);
    expect(w.health).toBe(500);
  });

  it("gives the armor back when cancelled or knocked down", () => {
    const match = signetter();
    const w = get(match, "w").combatant;
    const before = armorOf(w);
    match.requestSkill("w", 0);
    stepFor(match, 0.5);
    match.cancelAction("w");
    expect(armorOf(w)).toBe(before);

    match.requestSkill("w", 0);
    stepFor(match, 0.5);
    applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
      surroundings: new Map(),
      caster: get(match, "foe").combatant,
      target: w,
      rng: createRng(524),
      rules: RULES.combat,
    });
    expect(armorOf(w)).toBe(before);
  });
});

describe("dazed slows spells only (#524)", () => {
  it("doubles Fireball's cast and leaves Healing Signet's alone", () => {
    const match = new MatchSimulation({
      seed: "dazed",
      participants: [warrior("w", 0, vec2(0, 0)), warrior("foe", 1, vec2(300, 0))],
    });
    const w = get(match, "w").combatant;
    w.statuses.apply("dazed", 60, "foe", NO_RANKS);

    match.requestSkill("w", 0);
    expect(w.cast.activeCast?.totalSeconds).toBe(2);
    match.cancelAction("w");

    match.setTarget("w", "foe");
    match.requestSkill("w", 2);
    expect(w.cast.activeCast?.totalSeconds).toBe(2);
  });
});

describe('"Watch Yourself!" (#524)', () => {
  /** The shouter, allies just inside and outside earshot, and a foe beside it. */
  function shoutMatch(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "shout",
      participants: [
        warrior("w", 0, vec2(0, 0)),
        warrior("inside", 0, vec2(AREA_EARSHOT - 10, 0)),
        warrior("outside", 0, vec2(0, AREA_EARSHOT + 10)),
        warrior("foe", 1, vec2(40, 0)),
      ],
    });
    chargeAdrenaline(get(match, "w").combatant);
    return match;
  }

  it("reaches the shouter and every living ally in earshot at once, no cast bar", () => {
    const match = shoutMatch();
    expect(match.requestSkill("w", 1)?.check).toEqual({ ok: true });
    stepFor(match, DT);
    expect(get(match, "w").combatant.statuses.has("watch-yourself")).toBe(true);
    expect(get(match, "inside").combatant.statuses.has("watch-yourself")).toBe(true);
    expect(get(match, "outside").combatant.statuses.has("watch-yourself")).toBe(false);
    expect(get(match, "foe").combatant.statuses.has("watch-yourself")).toBe(false);
    expect(get(match, "w").combatant.cast.inAftercast).toBe(false);
  });

  it("does not reach a dead ally", () => {
    const match = shoutMatch();
    get(match, "inside").combatant.dead = true;
    match.requestSkill("w", 1);
    // The shout resolves on the shouter's turn, before the ally's respawn.
    match.step(DT);
    expect(get(match, "inside").combatant.statuses.has("watch-yourself")).toBe(false);
  });

  it("gives +21 armor, which enchantment removal leaves", () => {
    const match = shoutMatch();
    const inside = get(match, "inside").combatant;
    const before = armorOf(inside);
    match.requestSkill("w", 1);
    stepFor(match, DT);
    expect(armorOf(inside)).toBe(before + 21);
    expect(inside.statuses.removeByCategory("enchantment")).toEqual([]);
    expect(inside.statuses.has("watch-yourself")).toBe(true);
  });

  it("ends on an ally after its third incoming attack, and only on that ally", () => {
    const match = shoutMatch();
    match.requestSkill("w", 1);
    stepFor(match, DT);
    match.setTarget("foe", "w");
    expect(match.requestAttack("foe", "w")).toEqual({ ok: true });

    let hits = 0;
    for (let i = 0; i < 200 && get(match, "w").combatant.statuses.has("watch-yourself"); i += 1) {
      hits += events(match.step(DT).log).filter(
        (event) => event.kind === "damage" && event.targetId === "w",
      ).length;
    }
    expect(hits).toBe(3);
    expect(get(match, "w").combatant.statuses.has("watch-yourself")).toBe(false);
    expect(get(match, "inside").combatant.statuses.has("watch-yourself")).toBe(true);
  });

  it("does not count an attack that misses", () => {
    const match = shoutMatch();
    match.requestSkill("w", 1);
    stepFor(match, DT);
    match.setTarget("foe", "w");
    get(match, "foe").combatant.statuses.apply("blind", 60, "w", NO_RANKS);
    match.requestAttack("foe", "w");
    const log = withStatusDefinitions({ blind: { attackMissChance: 1 } }, () => stepFor(match, 5));
    expect(events(log).some((event) => event.kind === "attack-missed")).toBe(true);
    expect(get(match, "w").combatant.statuses.has("watch-yourself")).toBe(true);
  });
});

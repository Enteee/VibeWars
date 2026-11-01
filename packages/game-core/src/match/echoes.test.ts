import { describe, expect, it } from "vitest";

import {
  unarmedResolvedEquipment,
  type ResolvedEquipment,
  type ResolvedWeaponSet,
} from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { copyKey, slotSkill } from "../skills/cast-state.js";
import { describeStatus } from "../skills/describe.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Arcane Echo and Echo (#469, #1126): the next skill used stands in the
 * echo's slot for 20 s, under a key of its own, then the echo is back.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARCANE_ECHO = "mesmer.arcane-echo";
const ECHO = "mesmer.echo";
const FIREBALL = "elementalist.fireball";
const SEARING_FLAMES = "elementalist.searing-flames";
const HEALING_SIGNET = "warrior.healing-signet";
const SWIFT_CHOP = "warrior.swift-chop";
const EXECUTIONERS_STRIKE = "warrior.executioners-strike";
const POWER_SPIKE = "mesmer.power-spike";
const POWER_BLOCK = "mesmer.power-block";

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

const SWORD: ResolvedWeaponSet = {
  equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
  maxEnergy: 1000,
};

/** The echoer: both echoes, two fire spells, a signet and two axe attacks. */
function echoer(): ParticipantSpec {
  return {
    id: "a",
    team: 0,
    skillBar: [
      ARCANE_ECHO,
      ECHO,
      FIREBALL,
      HEALING_SIGNET,
      SWIFT_CHOP,
      SEARING_FLAMES,
      EXECUTIONERS_STRIKE,
    ],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    spareWeaponSets: [SWORD, null, null],
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn: vec2(0, 0),
    facing: 0,
  };
}

/** The foe beside it, with interrupts. */
function mesmer(): ParticipantSpec {
  return {
    id: "m",
    team: 1,
    skillBar: [POWER_SPIKE, POWER_BLOCK],
    attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn: vec2(40, 0),
    facing: 0,
  };
}

function sim(): MatchSimulation {
  const match = new MatchSimulation({ seed: "echoes", participants: [echoer(), mesmer()] });
  match.setTarget("a", "m");
  match.setTarget("m", "a");
  return match;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** Step until `done`, at most 10 s; how long it took. */
function stepUntil(match: MatchSimulation, done: () => boolean): number {
  for (let ticks = 0; ticks < 10 / DT; ticks += 1) {
    if (done()) {
      return ticks * DT;
    }
    match.step(DT);
  }
  throw new Error("never happened");
}

/** What `a`'s `slot` holds now. */
function held(match: MatchSimulation, slot: number) {
  const a = get(match, "a");
  return slotSkill(a.skillBar, a.cast, slot);
}

/** `a` uses `slot`, which is allowed, and its cast and aftercast run out. */
function use(match: MatchSimulation, slot: number): CombatLogEntry[] {
  expect(match.requestSkill("a", slot)?.check).toEqual({ ok: true });
  return stepFor(match, 3);
}

/** `a` puts Arcane Echo (slot 0) or Echo (slot 1) up. */
function echoUp(match: MatchSimulation, slot: 0 | 1): void {
  use(match, slot);
  expect(get(match, "a").statuses.has(slot === 0 ? "arcane-echo" : "echo")).toBe(true);
}

describe("Arcane Echo (#1126)", () => {
  it("is a 20 s self-enchantment that copies the next spell", () => {
    const match = sim();
    echoUp(match, 0);
    expect(get(match, "a").statuses.get("arcane-echo")?.remainingSeconds).toBeGreaterThan(16);
    expect(describeStatus("arcane-echo")).toBe(
      "the next time it uses a skill: if a spell, it takes this skill's slot for 20 seconds",
    );
  });

  it("the next spell stands in its slot for 20 s, ready while the original recharges", () => {
    const match = sim();
    echoUp(match, 0);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    stepUntil(match, () => held(match, 0)?.skillId === FIREBALL);
    const a = get(match, "a");
    expect(held(match, 0)).toEqual({ skillId: FIREBALL, key: copyKey(FIREBALL, 0) });
    expect(a.statuses.has("arcane-echo")).toBe(false);
    expect(a.cast.rechargeRemaining.get(FIREBALL)).toBeGreaterThan(6);
    // The build is never touched.
    expect(a.skillBar[0]).toBe(ARCANE_ECHO);

    stepFor(match, 1);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    stepFor(match, 2);
    // The copy recharges apart: under its own key, the original going on.
    expect(a.cast.rechargeRemaining.get(copyKey(FIREBALL, 0))).toBeGreaterThan(5);
    expect(a.cast.rechargeRemaining.get(FIREBALL)).toBeLessThan(5);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "still-recharging" });
  });

  it("gives the slot back after exactly 20 s, and Arcane Echo starts its 20 s recharge", () => {
    const match = sim();
    echoUp(match, 0);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    stepUntil(match, () => held(match, 0)?.skillId === FIREBALL);
    stepFor(match, 20 - 2 * DT);
    expect(held(match, 0)?.skillId).toBe(FIREBALL);
    const lasted = 20 - 2 * DT + stepUntil(match, () => held(match, 0)?.skillId === ARCANE_ECHO);
    expect(lasted).toBeCloseTo(20, 1);
    const a = get(match, "a");
    expect(a.cast.rechargeRemaining.get(ARCANE_ECHO)).toBeCloseTo(20, 1);
    expect(a.cast.rechargeRemaining.has(copyKey(FIREBALL, 0))).toBe(false);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "still-recharging" });
  });

  it("a signet ends it, with no copy", () => {
    const match = sim();
    echoUp(match, 0);
    use(match, 3);
    expect(get(match, "a").statuses.has("arcane-echo")).toBe(false);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
    expect(get(match, "a").cast.overrides.size).toBe(0);
  });

  it("an interrupted spell is not cast: Arcane Echo stays, with no copy", () => {
    const match = sim();
    echoUp(match, 0);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 1.5);
    expect(log.some(({ events }) => events.some(({ kind }) => kind === "interrupted"))).toBe(true);
    expect(get(match, "a").statuses.has("arcane-echo")).toBe(true);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
  });
});

describe("Echo (#1126)", () => {
  it("copies an attack skill too", () => {
    const match = sim();
    echoUp(match, 1);
    expect(match.requestSkill("a", 4)?.check).toEqual({ ok: true });
    stepUntil(match, () => held(match, 1)?.skillId === SWIFT_CHOP);
    expect(held(match, 1)?.key).toBe(copyKey(SWIFT_CHOP, 1));
    expect(get(match, "a").statuses.has("echo")).toBe(false);
  });

  it("a copied adrenaline skill fills its own pool, from 0, gone with the copy", () => {
    const match = sim();
    echoUp(match, 1);
    const a = get(match, "a");
    chargeAdrenaline(a, EXECUTIONERS_STRIKE);
    expect(match.requestSkill("a", 6)?.check).toEqual({ ok: true });
    stepUntil(match, () => held(match, 1)?.skillId === EXECUTIONERS_STRIKE);
    const copy = copyKey(EXECUTIONERS_STRIKE, 1);
    expect(a.adrenaline.get(copy)).toBe(0);
    expect(match.requestSkill("a", 1)?.check).toEqual({
      ok: false,
      reason: "insufficient-adrenaline",
    });
    stepFor(match, 21);
    expect(a.adrenaline.has(copy)).toBe(false);
    expect(a.adrenaline.has(EXECUTIONERS_STRIKE)).toBe(true);
  });

  it("is never copied by Arcane Echo, nor uses it up", () => {
    const match = sim();
    echoUp(match, 0);
    echoUp(match, 1);
    expect(get(match, "a").statuses.has("arcane-echo")).toBe(true);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
  });

  it("with both echoes up, one spell is copied into both slots, each under its own key", () => {
    const match = sim();
    echoUp(match, 0);
    echoUp(match, 1);
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    stepFor(match, 1.5);
    expect(held(match, 0)).toEqual({ skillId: FIREBALL, key: copyKey(FIREBALL, 0) });
    expect(held(match, 1)).toEqual({ skillId: FIREBALL, key: copyKey(FIREBALL, 1) });
  });
});

describe("a copy and what reads the bar (#1126)", () => {
  /** `a` with Fireball copied into slot 0. */
  function copied(): MatchSimulation {
    const match = sim();
    echoUp(match, 0);
    use(match, 2);
    expect(held(match, 0)?.skillId).toBe(FIREBALL);
    return match;
  }

  it("Diversion lengthens the skill used, not the copy it makes; used, the copy is lengthened", () => {
    const match = sim();
    echoUp(match, 0);
    get(match, "a").statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 2);
    const a = get(match, "a");
    expect(a.cast.rechargeRemaining.get(FIREBALL)).toBeGreaterThan(47);
    expect(a.cast.rechargeRemaining.has(copyKey(FIREBALL, 0))).toBe(false);
    a.statuses.apply("diversion", 6, "m", NO_RANKS);
    use(match, 0);
    expect(a.cast.rechargeRemaining.get(copyKey(FIREBALL, 0))).toBeGreaterThan(47);
  });

  it("Power Block on the copy disables it and its attribute's skills; that goes with the copy", () => {
    const match = copied();
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(match.requestSkill("m", 1)?.check).toEqual({ ok: true });
    const log = stepFor(match, 1);
    const disabled = log.flatMap(({ events }) =>
      events.flatMap((event) => (event.kind === "skill-disabled" ? [event.skillId] : [])),
    );
    expect(disabled).toEqual([FIREBALL, FIREBALL, SEARING_FLAMES]);
    const a = get(match, "a");
    expect(a.cast.rechargeRemaining.get(copyKey(FIREBALL, 0))).toBeGreaterThan(8);
    expect(a.cast.rechargeRemaining.get(SEARING_FLAMES)).toBeGreaterThan(8);
    expect(a.cast.rechargeRemaining.has(ARCANE_ECHO)).toBe(true);
    stepFor(match, 20);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
    expect(a.cast.rechargeRemaining.has(copyKey(FIREBALL, 0))).toBe(false);
  });

  it("a weapon swap keeps the copy", () => {
    const match = copied();
    expect(match.requestWeaponSet("a", 1)).toEqual({ kind: "swapped" });
    expect(held(match, 0)?.skillId).toBe(FIREBALL);
  });

  it("death clears every copy, restoring no recharge", () => {
    const match = copied();
    const a = get(match, "a");
    const echoRecharge = a.cast.rechargeRemaining.get(ARCANE_ECHO) ?? 0;
    a.health = 1;
    a.statuses.apply("bleeding", 10, "m", NO_RANKS);
    stepUntil(match, () => a.dead);
    expect(a.cast.overrides.size).toBe(0);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
    expect(a.cast.rechargeRemaining.get(ARCANE_ECHO) ?? 0).toBeLessThan(echoRecharge);
  });

  it("a reset clears every copy", () => {
    const match = copied();
    match.resetParticipant("a");
    expect(get(match, "a").cast.overrides.size).toBe(0);
    expect(held(match, 0)?.skillId).toBe(ARCANE_ECHO);
  });
});

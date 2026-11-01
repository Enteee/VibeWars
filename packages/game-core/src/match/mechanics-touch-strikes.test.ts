import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { interruptOnHit, type CombatEvent } from "../skills/effects.js";
import { rankOf } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Touch and trap riders (#1966): Strike as One sends the pet, Trapper's
 * Focus and Trapper's Speed change the Ranger's traps, and "Can't Touch
 * This!" fails foes' touch skills.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const STRIKE = "ranger.strike-as-one";
const FOCUS = "ranger.trappers-focus";
const SPEED = "ranger.trappers-speed";
const DUST_TRAP = "ranger.dust-trap";
const CANT_TOUCH = "paragon.cant-touch-this";
const VAMPIRIC_TOUCH = "necromancer.vampiric-touch";
const HEALING_TOUCH = "monk.healing-touch";

const BOW: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

const RANKS = new Map([
  ["ranger.beast-mastery", 12],
  ["ranger.expertise", 12],
  ["ranger.wilderness-survival", 12],
  ["ranger.marksmanship", 12],
  ["paragon.command", 12],
  ["necromancer.blood-magic", 12],
  ["monk.healing-prayers", 12],
]);

function spec(id: string, team: number, spawn: Vec2, skillBar: string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: RANKS,
    equipment: BOW,
    maxHealth: 480,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin with `bar`, `h` its ally beside it, foe `a` at `foeAt`. */
function match(bar: string[], foeAt = vec2(300, 0), foeBar: string[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "touch-strikes",
    participants: [
      spec("r", 0, vec2(0, 0), bar),
      spec("h", 0, vec2(0, 100), [HEALING_TOUCH]),
      spec("a", 1, foeAt, foeBar),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function pet(sim: MatchSimulation): Participant {
  const found = [...sim.participants()].find((other) => other.creature?.ownerId === "r");
  if (found === undefined) {
    throw new Error("r has no pet");
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `id` uses `skillId` from its bar at `targetId`. */
function press(sim: MatchSimulation, id: string, skillId: string, targetId?: string) {
  if (targetId !== undefined) {
    sim.setTarget(id, targetId);
  }
  return sim.requestSkill(id, get(sim, id).skillBar.indexOf(skillId))?.check;
}

/** Steps until `done` holds, at most `seconds`; whether it did. */
function stepUntil(sim: MatchSimulation, seconds: number, done: () => boolean): boolean {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
    if (done()) {
      return true;
    }
  }
  return false;
}

describe("Strike as One (#1966)", () => {
  it("lands the pet beside a foe 800 off; its next attack bleeds 13 s, then no more", () => {
    const sim = match([CHARM, STRIKE]);
    const wolf = pet(sim);
    const a = get(sim, "a");
    wolf.position = vec2(-500, 0);
    expect(distance(wolf.position, a.position)).toBeCloseTo(800, 6);
    expect(press(sim, "r", STRIKE, "a")).toEqual({ ok: true });
    stepFor(sim, 2 * DT);
    expect(distance(wolf.position, a.position)).toBeLessThanOrEqual(
      2 * RULES.collision.playerRadius + 1e-6,
    );
    expect(wolf.combatant.statuses.has("strike-as-one-pet")).toBe(true);
    expect(stepUntil(sim, 5, () => !wolf.combatant.statuses.has("strike-as-one-pet"))).toBe(true);
    expect(a.combatant.statuses.get("bleeding")?.remainingSeconds).toBeGreaterThan(12.5);
    a.combatant.statuses.remove("bleeding");
    stepFor(sim, 4);
    expect(a.combatant.statuses.has("bleeding")).toBe(false);
  });

  it("the owner's next hit Cripples 13 s, and spends it", () => {
    const sim = match([CHARM, STRIKE]);
    const r = get(sim, "r").combatant;
    const a = get(sim, "a").combatant;
    expect(press(sim, "r", STRIKE, "a")).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(r.statuses.has("strike-as-one")).toBe(true);
    expect(sim.requestAttack("r", "a")).toEqual({ ok: true });
    expect(stepUntil(sim, 6, () => !r.statuses.has("strike-as-one"))).toBe(true);
    expect(a.statuses.get("crippled")?.remainingSeconds).toBeGreaterThan(12.5);
  });

  it("without a pet, the owner's Cripple still comes", () => {
    const sim = match([STRIKE]);
    expect(press(sim, "r", STRIKE, "a")).toEqual({ ok: true });
    const log = stepFor(sim, DT);
    expect(log.flatMap((entry) => entry.events).map(({ kind }) => kind)).not.toContain(
      "companion-stepped",
    );
    expect(get(sim, "r").combatant.statuses.has("strike-as-one")).toBe(true);
  });
});

describe("Trapper's Focus and Trapper's Speed (#1966)", () => {
  /** Whether a landed blow interrupts `r` setting Dust Trap, with `boost` up first. */
  function interrupted(boost: string | undefined): boolean {
    const sim = match([FOCUS, SPEED, DUST_TRAP]);
    const r = get(sim, "r").combatant;
    if (boost !== undefined) {
      expect(press(sim, "r", boost)).toEqual({ ok: true });
      stepFor(sim, skillOf(boost).activationSeconds + 1);
    }
    expect(press(sim, "r", DUST_TRAP)).toEqual({ ok: true });
    stepFor(sim, 0.5);
    expect(r.cast.activeCast?.skillId).toBe(DUST_TRAP);
    const events: CombatEvent[] = [];
    interruptOnHit(r, "a", events);
    return r.cast.activeCast === undefined;
  }

  it("a trap is easily interrupted; under Trapper's Focus it is not", () => {
    expect(interrupted(undefined)).toBe(true);
    expect(interrupted(FOCUS)).toBe(false);
  });

  it("Trapper's Focus raises Wilderness Survival by 3", () => {
    const sim = match([FOCUS]);
    const r = get(sim, "r").combatant;
    expect(rankOf(r, "ranger.wilderness-survival")).toBe(12);
    expect(press(sim, "r", FOCUS)).toEqual({ ok: true });
    stepFor(sim, 3);
    expect(rankOf(r, "ranger.wilderness-survival")).toBe(15);
  });

  it("Trapper's Speed: a 2 s trap sets in 1.5 s and recharges in 22.5 s", () => {
    const sim = match([SPEED, DUST_TRAP]);
    const r = get(sim, "r").combatant;
    expect(press(sim, "r", SPEED)).toEqual({ ok: true });
    stepFor(sim, 1);
    expect(press(sim, "r", DUST_TRAP)).toEqual({ ok: true });
    expect(r.cast.activeCast?.totalSeconds).toBeCloseTo(1.5, 6);
    stepFor(sim, 2);
    expect([...r.cast.rechargeTotal.values()]).toContainEqual(expect.closeTo(22.5, 6));
  });

  it("Trapper's Speed ends when its bearer hits with an attack", () => {
    const sim = match([SPEED]);
    const r = get(sim, "r").combatant;
    expect(press(sim, "r", SPEED)).toEqual({ ok: true });
    stepFor(sim, 1);
    expect(r.statuses.has("trappers-speed")).toBe(true);
    expect(sim.requestAttack("r", "a")).toEqual({ ok: true });
    expect(stepUntil(sim, 6, () => !r.statuses.has("trappers-speed"))).toBe(true);
  });
});

describe('"Can\'t Touch This!" (#1966)', () => {
  it("fails a foe's next 4 touch skills; the 5th lands, and an ally's touch always does", () => {
    const sim = match([CANT_TOUCH], vec2(60, 0), [VAMPIRIC_TOUCH]);
    const r = get(sim, "r").combatant;
    expect(press(sim, "r", CANT_TOUCH)).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(r.statuses.has("cant-touch-this")).toBe(true);

    // An ally's Healing Touch lands and spends nothing.
    r.health = 200;
    expect(press(sim, "h", HEALING_TOUCH, "r")).toEqual({ ok: true });
    stepFor(sim, 2);
    expect(r.health).toBeGreaterThan(200);
    expect(r.statuses.get("cant-touch-this")?.touchFailsLeft).toBe(4);

    const touches = (): { failed: number; landed: number } => {
      const before = r.health;
      expect(press(sim, "a", VAMPIRIC_TOUCH, "r")).toEqual({ ok: true });
      const events = stepFor(sim, 3.5).flatMap((entry) => entry.events);
      return {
        failed: events.filter((event) => event.kind === "spell-failed").length,
        landed: before - r.health > 20 ? 1 : 0,
      };
    };
    for (let i = 0; i < 4; i += 1) {
      expect(touches()).toEqual({ failed: 1, landed: 0 });
    }
    expect(r.statuses.has("cant-touch-this")).toBe(false);
    expect(touches()).toEqual({ failed: 0, landed: 1 });
  });
});

describe("tooltips (#1966)", () => {
  const lines = (id: string): string[] =>
    describeSkill(skillOf(id), RANKS).effects.map(({ text }) => text);

  it("say what each does", () => {
    expect(lines(STRIKE)).toContain("Your pet moves to your target and attacks it");
    expect(lines(FOCUS).join(" ")).toContain("your traps are not easily interrupted");
    expect(lines(CANT_TOUCH).join(" ")).toContain("the next 4 touch skills used against you fail");
  });
});

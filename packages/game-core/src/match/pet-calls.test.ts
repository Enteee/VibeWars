import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyDamage } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Calls and bonds on a Ranger's pet (#1046 child 3, #1108): Call of
 * Haste, Call of Protection, Symbiotic Bond and Revive Animal.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const HASTE = "ranger.call-of-haste";
const PROTECTION = "ranger.call-of-protection";
const BOND = "ranger.symbiotic-bond";
const REVIVE = "ranger.revive-animal";
const BAR = [CHARM, HASTE, PROTECTION, BOND, REVIVE];
/** Revive Animal's 0.25 s activation, the aftercast, and a tick to spare. */
const REVIVE_SECONDS = 0.25 + RULES.combat.aftercastSeconds + 2 * DT;

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** A Ranger with `BAR` at Beast Mastery 12. */
function ranger(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return spec(id, team, spawn, {
    skillBar: BAR,
    attributeRanks: new Map([["ranger.beast-mastery", 12]]),
  });
}

/** A hammer at Hammer Mastery 12: blows well above Call of Protection's 17. */
function hammer(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.hammer,
      attributeId: "warrior.hammer-mastery",
      damageType: WEAPONS.hammer.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** Ranger `r` at the origin, foe `a` 60 off; `more` besides. */
function match(more: readonly ParticipantSpec[] = [], seed = "pet-calls"): MatchSimulation {
  return new MatchSimulation({
    seed,
    participants: [ranger("r", 0, vec2(0, 0)), spec("a", 1, vec2(60, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function wolf(sim: MatchSimulation, owner = "r"): Participant {
  const pet = [...sim.participants()].find((other) => other.creature?.ownerId === owner);
  if (pet === undefined) {
    throw new Error(`${owner} has no pet`);
  }
  return pet;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `owner` presses `skillId` from its bar. */
function press(sim: MatchSimulation, skillId: string, owner = "r") {
  return sim.requestSkill(owner, get(sim, owner).skillBar.indexOf(skillId));
}

/** Kill `victim` as burning would. */
function kill(sim: MatchSimulation, victim: Participant): void {
  victim.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** Every hit `log` lands on `targetId` from `sourceId`, in order. */
function hits(log: readonly CombatLogEntry[], sourceId: string, targetId: string): number[] {
  return log
    .filter((entry) => entry.sourceId === sourceId)
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
      ),
    );
}

describe("calls on your living pet (#1108)", () => {
  it("land on the wolf whatever is selected, and pay", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    sim.setTarget("r", "a");
    expect(press(sim, HASTE)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(pet.combatant.statuses.has("call-of-haste")).toBe(true);
    expect(get(sim, "a").combatant.statuses.has("call-of-haste")).toBe(false);
    expect(owner.combatant.energy).toBeLessThanOrEqual(90);
  });

  it("are refused on a dead wolf, and nothing is paid", () => {
    const sim = match();
    const owner = get(sim, "r");
    kill(sim, wolf(sim));
    // Past its 4 s bar disable, so only the corpse refuses it.
    stepFor(sim, 5);
    const before = owner.combatant.energy;
    for (const call of [HASTE, PROTECTION, BOND]) {
      expect(press(sim, call)?.check).toEqual({ ok: false, reason: "invalid-target-dead" });
    }
    expect(owner.combatant.energy).toBe(before);
  });

  it("Call of Haste: the wolf bites every 1.61 s and moves 25% faster, for 30 s", () => {
    const sim = match();
    const pet = wolf(sim);
    expect(press(sim, HASTE)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(aggregateModifiers(pet.combatant.statuses.active).moveSpeedMultiplier).toBe(1.25);
    expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
    const log = stepFor(sim, 8);
    const bites = log
      .filter((entry) => entry.cause === "weapon" && entry.sourceId === pet.id)
      .map((entry) => entry.atSeconds);
    expect(bites.length).toBeGreaterThan(3);
    for (let i = 1; i < bites.length; i += 1) {
      expect(Math.abs((bites[i] ?? 0) - (bites[i - 1] ?? 0) - 2.15 * 0.75)).toBeLessThanOrEqual(DT);
    }
    stepFor(sim, 23);
    expect(pet.combatant.statuses.has("call-of-haste")).toBe(false);
  });

  it("Call of Protection: each blow on the wolf is 17 lower", () => {
    const blows = (call: boolean): number[] => {
      const sim = match([
        spec("w", 1, vec2(-60, 0), {
          equipment: hammer(),
          attributeRanks: new Map([["warrior.hammer-mastery", 12]]),
        }),
      ]);
      const pet = wolf(sim);
      if (call) {
        expect(press(sim, PROTECTION)?.check).toEqual({ ok: true });
      }
      stepFor(sim, DT);
      expect(sim.requestAttack("w", pet.id)).toEqual({ ok: true });
      return hits(stepFor(sim, 6), "w", pet.id);
    };
    const plain = blows(false);
    expect(Math.max(...plain)).toBeGreaterThan(17);
    expect(blows(true)).toEqual(plain.map((amount) => Math.max(0, amount - 17)));
  });
});

describe("Symbiotic Bond (#1108)", () => {
  /** A match with `r`'s wolf bonded. */
  function bonded(more: readonly ParticipantSpec[] = []) {
    const sim = match(more);
    const pet = wolf(sim);
    expect(press(sim, BOND)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(pet.combatant.statuses.has("symbiotic-bond")).toBe(true);
    return { sim, owner: get(sim, "r"), pet };
  }

  it("sends its owner 12 of a 25 slashing hit, typeless: armor ignored", () => {
    const { sim, owner, pet } = bonded();
    owner.combatant.equipment = unarmedResolvedEquipment(200);
    const ownerBefore = owner.combatant.health;
    const petBefore = pet.combatant.health;
    applyDamage(pet.combatant, 25, "slashing", false, [], undefined);
    stepFor(sim, DT);
    expect(petBefore - pet.combatant.health).toBeCloseTo(13, 0);
    expect(ownerBefore - owner.combatant.health).toBeCloseTo(12, 0);
  });

  it("lands the half on the wolf when its owner is dead", () => {
    const { sim, owner, pet } = bonded();
    kill(sim, owner);
    const before = pet.combatant.health;
    applyDamage(pet.combatant, 25, "slashing", false, [], undefined);
    stepFor(sim, DT);
    expect(before - pet.combatant.health).toBeCloseTo(25, 0);
  });

  it("does not chain: two bonded wolves of one owner's team each send theirs once", () => {
    const { sim, owner, pet } = bonded([ranger("s", 0, vec2(0, 40))]);
    const other = wolf(sim, "s");
    expect(press(sim, BOND, "s")?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    const ownerBefore = owner.combatant.health;
    const otherOwnerBefore = get(sim, "s").combatant.health;
    applyDamage(pet.combatant, 20, "piercing", false, [], undefined);
    applyDamage(other.combatant, 20, "piercing", false, [], undefined);
    stepFor(sim, DT);
    expect(ownerBefore - owner.combatant.health).toBeCloseTo(10, 0);
    expect(otherOwnerBefore - get(sim, "s").combatant.health).toBeCloseTo(10, 0);
  });
});

describe("Revive Animal (#1108)", () => {
  it("raises every dead allied pet within 81 at 77%, skipping one at 82 and a foe's", () => {
    const sim = match([
      ranger("s", 0, vec2(0, 0)),
      ranger("t", 0, vec2(0, 0)),
      ranger("e", 1, vec2(0, 0)),
    ]);
    const mine = wolf(sim, "r");
    const theirs = wolf(sim, "s");
    const far = wolf(sim, "t");
    const foes = wolf(sim, "e");
    for (const [pet, x] of [
      [mine, 40],
      [theirs, -81],
      [far, 82],
      [foes, 20],
    ] as const) {
      pet.position = vec2(x, 0);
      kill(sim, pet);
    }
    // Past the 4 s bar disable the wolves' deaths brought.
    stepFor(sim, 5);
    expect(press(sim, REVIVE)?.check).toEqual({ ok: true });
    stepFor(sim, REVIVE_SECONDS);
    for (const pet of [mine, theirs]) {
      expect(pet.combatant.dead).toBe(false);
      expect(pet.combatant.health).toBe(Math.floor(pet.combatant.maxHealth * 0.77));
    }
    expect(far.combatant.dead).toBe(true);
    expect(foes.combatant.dead).toBe(true);
  });

  it("is spent with no dead pet near", () => {
    const sim = match();
    const owner = get(sim, "r");
    expect(press(sim, REVIVE)?.check).toEqual({ ok: true });
    stepFor(sim, REVIVE_SECONDS);
    expect(owner.combatant.energy).toBeLessThanOrEqual(95);
    expect(owner.combatant.cast.rechargeRemaining.get(REVIVE)).toBeGreaterThan(0);
  });

  it("starts the 15 s grace: the wolf dying 10 s later costs its owner nothing", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    kill(sim, pet);
    stepFor(sim, 5);
    expect(press(sim, REVIVE)?.check).toEqual({ ok: true });
    stepFor(sim, REVIVE_SECONDS);
    expect(pet.combatant.dead).toBe(false);
    stepFor(sim, 10);
    kill(sim, pet);
    expect(owner.combatant.cast.rechargeRemaining.get(CHARM) ?? 0).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import type { SimulationRng } from "../rng.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS } from "../skills/status.js";
import { netPips } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { blocks } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Elementalist auras (#2095): Magnetic Aura, Swirling Aura, Magnetic
 * Surge and Sliver Armor, at rank 12. A block roll is forced through
 * `blocks` where its chance is under 1; nothing crits.
 */

const RULES: Ruleset = {
  ...MINIMAL_GW_INSPIRED_PVP_V1,
  combat: {
    ...MINIMAL_GW_INSPIRED_PVP_V1.combat,
    criticalBaseChance: 0,
    criticalChancePerRank: 0,
  },
};
const DT = 1 / RULES.tickRateHz;

const MAGNETIC_AURA = "elementalist.magnetic-aura";
const SWIRLING_AURA = "elementalist.swirling-aura";
const MAGNETIC_SURGE = "elementalist.magnetic-surge";
const SLIVER_ARMOR = "elementalist.sliver-armor";
const ARC_LIGHTNING = "elementalist.arc-lightning";
const FIREBALL = "elementalist.fireball";
const BAR = [MAGNETIC_AURA, SWIRLING_AURA, MAGNETIC_SURGE, SLIVER_ARMOR, ARC_LIGHTNING, FIREBALL];
const RANKS = new Map([
  ["elementalist.earth-magic", 12],
  ["elementalist.water-magic", 12],
  ["elementalist.air-magic", 12],
  ["elementalist.fire-magic", 12],
  ["warrior.swordsmanship", 12],
]);

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
      weapon: { ...weapon, damageMin: weapon.damageMax },
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");

/** A body that neither regenerates nor dies. */
function body(
  id: string,
  team: number,
  spawn: Vec2,
  equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...BAR],
    attributeRanks: RANKS,
    equipment,
    maxHealth: 1e6,
    maxEnergy: 1000,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

/**
 * The Elementalist `c` at the origin; its party: `a` in earshot, `out`
 * beyond it. The swordsman `f` at `fAt`, in melee of `c` unless moved;
 * the caster `n` far from `c`, beyond nearby.
 */
function match(fAt = vec2(RANGE_MELEE / 2, 0)): MatchSimulation {
  return new MatchSimulation({
    seed: "ele-auras",
    ruleset: RULES,
    participants: [
      body("c", 0, vec2(0, 0)),
      body("a", 0, vec2(0, 30)),
      body("out", 0, vec2(0, AREA_EARSHOT + 50)),
      body("f", 1, fAt, SWORD),
      body("n", 1, vec2(-350, 0)),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
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

/** `casterId` uses `skillId` on `targetId`, stepped until it landed: the log. */
function cast(sim: MatchSimulation, skillId: string, targetId = "c", casterId = "c") {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  return stepFor(sim, skill(skillId).activationSeconds + 0.25);
}

/** `attackerId` attacks `targetId`, stepped until `done` holds; the ticks' log. */
function attackUntil(
  sim: MatchSimulation,
  attackerId: string,
  targetId: string,
  done: (log: readonly CombatLogEntry[]) => boolean,
): CombatLogEntry[] {
  expect(sim.requestAttack(attackerId, targetId)).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < 30 / DT; tick += 1) {
    log.push(...sim.step(DT).log);
    if (done(log)) {
      return log;
    }
  }
  throw new Error("never done in 30 s");
}

function events(log: readonly CombatLogEntry[], skillId?: string): CombatEvent[] {
  return log
    .filter((entry) => skillId === undefined || entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

/** The damage `skillId` dealt, as `[target, amount]`. */
function damageBy(log: readonly CombatLogEntry[], skillId: string): [string, number][] {
  return events(log, skillId).flatMap((event) =>
    event.kind === "damage" ? [[event.targetId, event.amount] as [string, number]] : [],
  );
}

function blocksOn(log: readonly CombatLogEntry[], targetId: string): number {
  return events(log).filter(
    (event) => event.kind === "attack-blocked" && event.targetId === targetId,
  ).length;
}

/** The blows `f` resolved on `c`: hits, misses and blocks. */
function blowsOnC(log: readonly CombatLogEntry[]): number {
  return log
    .filter((entry) => entry.sourceId === "f" && entry.skillId === undefined)
    .flatMap((entry) => entry.events)
    .filter(
      (event) =>
        event.targetId === "c" &&
        (event.kind === "damage" ||
          event.kind === "attack-blocked" ||
          event.kind === "attack-missed"),
    ).length;
}

/** A random stream whose every float is `roll`. */
function rolling(roll: number): SimulationRng {
  return {
    nextFloat: () => roll,
    nextUint32: () => 0,
    nextInt: (min) => min,
    getState: () => 0,
    setState: () => undefined,
  };
}

describe("the four are the corpus's (#2095)", () => {
  it.each([
    [MAGNETIC_AURA, 168, "earth-magic", 12, "self"],
    [SWIRLING_AURA, 233, "water-magic", 15, "self"],
    [MAGNETIC_SURGE, 2190, "earth-magic", 15, "single-enemy"],
    [SLIVER_ARMOR, 1084, "earth-magic", 30, "self"],
  ] as const)(
    "%s: gwId %i, %s, 10 energy, 1 s, %i s recharge, %s",
    (id, gwId, attribute, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type: "enchantment",
        attributeId: `elementalist.${attribute}`,
        cost: { kind: "energy", amount: 10 },
        activationSeconds: 1,
        rechargeSeconds: recharge,
        target,
      });
    },
  );
});

describe("Magnetic Aura (#2095)", () => {
  it("blocks the first swing, strikes the attacker for 42, and ends", () => {
    const sim = match();
    cast(sim, MAGNETIC_AURA);
    expect(get(sim, "c").statuses.get("magnetic-aura")?.durationSeconds).toBeCloseTo(7, 1);
    const log = attackUntil(sim, "f", "c", (entries) => blocksOn(entries, "c") === 1);
    expect(damageBy(log, MAGNETIC_AURA)).toEqual([["f", 42]]);
    expect(get(sim, "c").statuses.has("magnetic-aura")).toBe(false);
  });

  it("not Overcast, enchants the caster alone", () => {
    const sim = match();
    cast(sim, MAGNETIC_AURA);
    expect(get(sim, "c").statuses.has("magnetic-aura")).toBe(true);
    expect(get(sim, "a").statuses.has("magnetic-aura")).toBe(false);
  });

  it("Overcast, also enchants the party in earshot, and a copy strikes for the caster's 42", () => {
    const sim = match();
    get(sim, "c").overcast = 5;
    cast(sim, MAGNETIC_AURA);
    expect(get(sim, "c").statuses.active.filter(({ id }) => id === "magnetic-aura")).toHaveLength(
      1,
    );
    expect(get(sim, "a").statuses.has("magnetic-aura")).toBe(true);
    expect(get(sim, "out").statuses.has("magnetic-aura")).toBe(false);
    const log = attackUntil(sim, "f", "a", (entries) => blocksOn(entries, "a") === 1);
    expect(damageBy(log, MAGNETIC_AURA)).toEqual([["f", 42]]);
  });
});

describe("Swirling Aura (#2095)", () => {
  it("regenerates 5 pips, and blocks half of the projectiles, never a blow", () => {
    const sim = match();
    cast(sim, SWIRLING_AURA);
    const c = get(sim, "c");
    expect(c.statuses.get("swirling-aura")?.durationSeconds).toBeCloseTo(6, 1);
    expect(netPips(c, 0, 0).health).toBe(5);
    expect(blocks(c, "f", [], "projectile", false, rolling(0.4))).toBe(true);
    expect(blocks(c, "f", [], "projectile", false, rolling(0.6))).toBe(false);
    expect(blocks(c, "f", [], "melee", false, rolling(0))).toBe(false);
  });
});

describe("Magnetic Surge (#2095)", () => {
  it("not Overcast, strikes its target for 63 and enchants nobody", () => {
    const sim = match();
    const log = cast(sim, MAGNETIC_SURGE, "f");
    expect(damageBy(log, MAGNETIC_SURGE)).toEqual([["f", 63]]);
    for (const id of ["c", "a", "f"]) {
      expect(get(sim, id).statuses.has("magnetic-surge"), id).toBe(false);
    }
  });

  it("Overcast, the caster and an ally in earshot each block one attack, for 4 s", () => {
    const sim = match();
    get(sim, "c").overcast = 5;
    cast(sim, MAGNETIC_SURGE, "f");
    expect(get(sim, "c").statuses.get("magnetic-surge")?.durationSeconds).toBeCloseTo(4, 1);
    expect(get(sim, "a").statuses.has("magnetic-surge")).toBe(true);
    expect(get(sim, "out").statuses.has("magnetic-surge")).toBe(false);
    expect(get(sim, "f").statuses.has("magnetic-surge")).toBe(false);
    // The first swing is blocked; the second lands.
    const log = attackUntil(sim, "f", "c", (entries) => blowsOnC(entries) === 2);
    expect(blocksOn(log, "c")).toBe(1);
    expect(get(sim, "c").statuses.has("magnetic-surge")).toBe(false);
  });
});

describe("Sliver Armor (#2095)", () => {
  /** `c` under Sliver Armor, cast at rank 12. */
  function armored(fAt?: Vec2): MatchSimulation {
    const sim = match(fAt);
    cast(sim, SLIVER_ARMOR);
    expect(get(sim, "c").statuses.get("sliver-armor")?.durationSeconds).toBeCloseTo(10, 1);
    return sim;
  }

  it("blocks 45% of attacks", () => {
    const c = get(armored(), "c");
    expect(blocks(c, "f", [], "melee", false, rolling(0.44))).toBe(true);
    expect(blocks(c, "f", [], "projectile", false, rolling(0.44))).toBe(true);
    expect(blocks(c, "f", [], "melee", false, rolling(0.46))).toBe(false);
  });

  it("each swing at its bearer, hit or blocked, strikes the nearest foe", () => {
    const sim = armored();
    const log = attackUntil(sim, "f", "c", (entries) => blowsOnC(entries) === 6);
    const struck = damageBy(log, SLIVER_ARMOR);
    expect(struck.map(([target]) => target)).toEqual(Array.from({ length: 6 }, () => "f"));
    expect(blocksOn(log, "c")).toBeGreaterThan(0);
  });

  it("a blind swordsman's miss strikes it too", () => {
    const sim = armored();
    get(sim, "f").statuses.apply("blind", 1000, "n", NO_RANKS);
    const log = attackUntil(sim, "f", "c", (entries) => blowsOnC(entries) === 1);
    expect(events(log).some((event) => event.kind === "attack-missed")).toBe(true);
    expect(damageBy(log, SLIVER_ARMOR)).toHaveLength(1);
  });

  it("a foe's spell at its bearer strikes the nearest foe for 29 earth; an area spell at an ally does not", () => {
    const sim = armored();
    const spell = cast(sim, ARC_LIGHTNING, "c", "n");
    expect(damageBy(spell, ARC_LIGHTNING).map(([target]) => target)).toEqual(["c"]);
    expect(damageBy(spell, SLIVER_ARMOR)).toEqual([["f", 29]]);
    // Fireball flies to `a`, and its blast reaches `c` beside it.
    stepFor(sim, 1);
    const area = [...cast(sim, FIREBALL, "a", "n"), ...stepFor(sim, 2)];
    expect(damageBy(area, FIREBALL).map(([target]) => target)).toContain("c");
    expect(damageBy(area, SLIVER_ARMOR)).toEqual([]);
  });

  it("with no foe nearby strikes nobody", () => {
    const sim = armored(vec2(AREA_NEARBY + 100, 0));
    const log = cast(sim, ARC_LIGHTNING, "c", "n");
    expect(damageBy(log, ARC_LIGHTNING).map(([target]) => target)).toEqual(["c"]);
    expect(damageBy(log, SLIVER_ARMOR)).toEqual([]);
  });
});

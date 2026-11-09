import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applyEffects, resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers, getStatusDefinition } from "./status.js";
import { attackDamageDeltaOf } from "./tick.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, SkillEffect } from "./types.js";
import { resolveSwing } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Ranger staples (#2317): Choking Gas, Dryder's Defenses, Healing Spring,
 * Snare, Bestial Fury, Scavenger's Focus, Piercing Trap and Feral
 * Aggression, on today's primitives. Every
 * scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["ranger.wilderness-survival", rank],
    ["ranger.beast-mastery", rank],
    ["ranger.marksmanship", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

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

const BOW = wielding(WEAPONS.flatbow, "ranger.marksmanship");

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** An archer at `ranks` with `bar`. */
const ranger = (ranks = RANK_12, bar: readonly string[] = []): Combatant =>
  makeCombatant({
    id: "r",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    equipment: BOW,
    attributeRanks: ranks,
    skillBar: [...bar],
  });

const foe = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** `caster`'s non-attack skill `skillId` on itself. */
function cast(skillId: string, caster: Combatant) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [caster],
    rng: steady(),
    rules: RULES.combat,
    surroundings: new Map(),
  });
}

const at = (combatant: Combatant, x: number) =>
  [
    combatant.id,
    {
      combatant,
      position: vec2(x, 0),
      floors: 1,
      layer: 0,
      creature: undefined,
      corpseExploited: false,
    },
  ] as const;

/** `archer` shoots `target`, at 400, with `others` standing at their x. */
function shoot(archer: Combatant, target: Combatant, others: readonly [Combatant, number][] = []) {
  return resolveSwing({
    attacker: archer,
    target: { combatant: target, position: vec2(400, 0), floors: 1, layer: 0, creature: undefined },
    surroundings: new Map([
      at(archer, 0),
      at(target, 400),
      ...others.map(([other, x]) => at(other, x)),
    ]),
    rng: steady(),
    rules: RULES.combat,
    exposed: () => false,
  });
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number =>
  events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );

const energyGained = (events: readonly CombatEvent[]): number =>
  events.reduce((sum, event) => (event.kind === "energy-gain" ? sum + event.amount : sum), 0);

/** What a shot's status riders did. */
const fired = (outcome: ReturnType<typeof shoot>): CombatEvent[] =>
  outcome.fired.flatMap(({ events }) => events);

/** A foe with `skillId` under way. */
function casting(id: string, skillId: string): Combatant {
  const body = foe(id);
  body.cast.beginCast(skillId, body.id, 3, undefined);
  return body;
}

describe("the nine are the corpus's (#2317)", () => {
  it.each([
    ["ranger.choking-gas", 434, "preparation", false, "wilderness-survival", 15, 2, 24],
    ["ranger.dryders-defenses", 452, "stance", false, "wilderness-survival", 5, 0, 60],
    ["ranger.healing-spring", 460, "trap", false, "wilderness-survival", 10, 2, 20],
    ["ranger.snare", 854, "trap", false, "wilderness-survival", 5, 1.5, 15],
    ["ranger.bestial-fury", 1209, "stance", false, "beast-mastery", 10, 0, 10],
    ["ranger.scavengers-focus", 1471, "skill", true, "wilderness-survival", 5, 0, 12],
    ["ranger.piercing-trap", 2140, "trap", false, "wilderness-survival", 10, 2, 30],
    ["ranger.feral-aggression", 2142, "skill", false, "beast-mastery", 15, 0, 20],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      const [profession = ""] = id.split(".");
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target: "self",
      });
    },
  );
});

describe("Choking Gas (#2317)", () => {
  it.each([
    [RANK_12, 10],
    [RANK_0, 1],
  ] as const)("lasts 1...12 seconds (%#)", (ranks, seconds) => {
    const archer = ranger(ranks);
    cast("ranger.choking-gas", archer);
    expect(archer.statuses.get("choking-gas")?.remainingSeconds).toBeCloseTo(seconds, 5);
  });

  it.each([
    [RANK_12, 7],
    [RANK_0, 1],
  ] as const)("adds 1...8 to an arrow (%#)", (ranks, more) => {
    const plain = damageTo(shoot(ranger(ranks), foe("f")).events, "f");
    const archer = ranger(ranks);
    cast("ranger.choking-gas", archer);
    expect(damageTo(shoot(archer, foe("f")).events, "f")).toBe(plain + more);
  });

  it("interrupts the struck foe and adjacent foes casting a spell; a signet, or a foe further off, goes on", () => {
    const archer = ranger();
    cast("ranger.choking-gas", archer);
    const struck = casting("f", "elementalist.fireball");
    const beside = casting("g", "elementalist.fireball");
    const signet = casting("h", "warrior.signet-of-stamina");
    const beyond = casting("i", "elementalist.fireball");
    shoot(archer, struck, [
      [beside, 400 + AREA_ADJACENT - 1],
      [signet, 400 - AREA_ADJACENT + 1],
      [beyond, 400 + AREA_ADJACENT + 1],
    ]);
    expect(struck.cast.isCasting).toBe(false);
    expect(beside.cast.isCasting).toBe(false);
    expect(signet.cast.isCasting).toBe(true);
    expect(beyond.cast.isCasting).toBe(true);
  });

  it("without it, an arrow interrupts no one", () => {
    const struck = casting("f", "elementalist.fireball");
    shoot(ranger(), struck);
    expect(struck.cast.isCasting).toBe(true);
  });
});

describe("Dryder's Defenses (#2317)", () => {
  /** What a 1000 of `type` does to a foe bearing it from a caster at `ranks`. */
  function taken(type: "fire" | "slashing", ranks: ReadonlyMap<string, number> | undefined) {
    const bearer = foe("b");
    if (ranks !== undefined) {
      bearer.statuses.apply("dryders-defenses", 10, "r", ranks);
    }
    const hit: SkillEffect = { kind: "damage", amount: { flat: 1000 }, type, armorPenetration: 0 };
    return damageTo(
      applyEffects([hit], {
        surroundings: new Map(),
        caster: foe("x"),
        target: bearer,
        rng: steady(),
        rules: RULES.combat,
      }),
      "b",
    );
  }

  it("blocks 75% of attacks", () => {
    expect(getStatusDefinition("dryders-defenses").block).toEqual({ chance: 0.75, against: "all" });
  });

  it.each([
    [RANK_12, 54.8],
    [RANK_0, 34],
  ] as const)(
    "adds 34...60 armor against elemental damage, none against physical (%#)",
    (ranks, armor) => {
      expect(taken("fire", ranks)).toBeCloseTo(taken("fire", undefined) * 2 ** (-armor / 40), -1);
      expect(taken("slashing", ranks)).toBe(taken("slashing", undefined));
    },
  );

  it.each([
    [RANK_12, 10],
    [RANK_0, 5],
  ] as const)("lasts 5...11 seconds (%#)", (ranks, seconds) => {
    const archer = ranger(ranks);
    cast("ranger.dryders-defenses", archer);
    expect(archer.statuses.get("dryders-defenses")?.remainingSeconds).toBeCloseTo(seconds, 5);
  });
});

describe("Bestial Fury (#2317)", () => {
  it.each([
    [RANK_12, 10],
    [RANK_0, 5],
  ] as const)("attacks 25% faster for 5...11 seconds (%#)", (ranks, seconds) => {
    const archer = ranger(ranks);
    cast("ranger.bestial-fury", archer);
    expect(archer.statuses.get("bestial-fury")?.remainingSeconds).toBeCloseTo(seconds, 5);
    expect(aggregateModifiers(archer.statuses.active).attackDurationMultiplier).toBe(0.75);
  });

  it("disables every non-attack skill for 5 seconds, no attack", () => {
    const archer = ranger(RANK_12, [
      "ranger.bestial-fury",
      "ranger.choking-gas",
      "ranger.power-shot",
    ]);
    const disabled = cast("ranger.bestial-fury", archer).events.flatMap((event) =>
      event.kind === "skill-disabled" ? [[event.skillId, event.seconds]] : [],
    );
    expect(disabled).toContainEqual(["ranger.choking-gas", 5]);
    expect(disabled.map(([id]) => id)).not.toContain("ranger.power-shot");
  });
});

describe("Scavenger's Focus (#2317)", () => {
  it.each([
    [RANK_12, 10],
    [RANK_0, 3],
  ] as const)(
    "gives 3...12 Energy for a hit on a foe suffering a condition (%#)",
    (ranks, energy) => {
      const archer = ranger(ranks);
      cast("ranger.scavengers-focus", archer);
      expect(archer.statuses.get("scavengers-focus")?.remainingSeconds).toBe(10);
      const bleeding = foe("f");
      bleeding.statuses.apply("bleeding", 10, "x", NO_RANKS);
      expect(energyGained(fired(shoot(archer, bleeding)))).toBeCloseTo(energy, 5);
    },
  );

  it("gives none for a foe with no condition, nor without it", () => {
    const archer = ranger();
    cast("ranger.scavengers-focus", archer);
    expect(energyGained(fired(shoot(archer, foe("f"))))).toBe(0);
    const bleeding = foe("f");
    bleeding.statuses.apply("bleeding", 10, "x", NO_RANKS);
    expect(energyGained(fired(shoot(ranger(), bleeding)))).toBe(0);
  });
});

/** A match: `r` on team 0 at the origin with `bar` at `ranks`, and `others`. */
function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

function match(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "staples-ranger-a",
    participants: [spec("r", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks }), ...others],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e4;
    participant.combatant.health = 1e4;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
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

/** `r` uses `skillId`, the first of its bar by default. */
function press(sim: MatchSimulation, skillId: string): void {
  expect(sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
}

/** What `skillId`'s rows of `log` did to `targetId`, of `kind`. */
function amounts(
  log: readonly CombatLogEntry[],
  skillId: string,
  kind: "heal" | "damage",
  targetId: string,
): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === kind && event.targetId === targetId ? [event.amount] : []));
}

describe("Healing Spring (#2317)", () => {
  const SPRING = "ranger.healing-spring";

  it("reads as healing you and allies, not foes", () => {
    const texts = describeSkill(skill(SPRING), RANK_12, EN_WORDS, EN_NAMES).effects.map(
      ({ text }) => text,
    );
    expect(texts).toContain("Every 2s for 10s, you and allies adjacent: heals for 51");
  });

  it.each([
    [RANK_12, 51],
    [RANK_0, 15],
  ] as const)(
    "heals you and adjacent allies 15...60 every 2 seconds for 10 seconds, with no foe near (%#)",
    (ranks, heal) => {
      const sim = match(
        [SPRING],
        ranks,
        spec("b", 0, vec2(AREA_ADJACENT - 5, 0)),
        spec("c", 0, vec2(AREA_ADJACENT + 40, 0)),
        spec("a", 1, vec2(2000, 0)),
      );
      for (const id of ["r", "b", "c"]) {
        get(sim, id).combatant.health = 5000;
      }
      press(sim, SPRING);
      const log = stepFor(sim, 14);
      expect(amounts(log, SPRING, "heal", "b")).toEqual([heal, heal, heal, heal, heal]);
      expect(amounts(log, SPRING, "heal", "r")).toHaveLength(5);
      expect(amounts(log, SPRING, "heal", "c")).toEqual([]);
    },
  );
});

describe("Snare (#2317)", () => {
  it.each([
    [RANK_12, 13],
    [RANK_0, 3],
  ] as const)(
    "cripples nearby foes 3...15 seconds when a foe springs it (%#)",
    (ranks, seconds) => {
      const sim = match(["ranger.snare"], ranks, spec("a", 1, vec2(AREA_ADJACENT - 5, 0)));
      press(sim, "ranger.snare");
      stepFor(sim, 1.5 + 4 * DT);
      const crippled = get(sim, "a").combatant.statuses.get("crippled");
      expect(crippled?.remainingSeconds).toBeGreaterThan(seconds - 0.5);
      expect(crippled?.remainingSeconds).toBeLessThanOrEqual(seconds);
    },
  );
});

describe("Piercing Trap (#2317)", () => {
  const PIERCING = "ranger.piercing-trap";

  /** Its spring's damage to `a`, Cracked Armor on it or not. */
  function sprung(ranks: ReadonlyMap<string, number>, cracked: boolean): number[] {
    const sim = match([PIERCING], ranks, spec("a", 1, vec2(AREA_ADJACENT - 5, 0)));
    if (cracked) {
      get(sim, "a").combatant.statuses.apply("cracked-armor", 60, "x", NO_RANKS);
    }
    press(sim, PIERCING);
    return amounts(stepFor(sim, 2 + 4 * DT), PIERCING, "damage", "a");
  }

  it.each([
    [RANK_12, 41, 51],
    [RANK_0, 5, 15],
  ] as const)("strikes for 5...50, and 15...60 more on Cracked Armor (%#)", (ranks, base, more) => {
    const [plain] = sprung(ranks, false);
    expect(sprung(ranks, false)).toHaveLength(1);
    const [first = 0, second = 0] = sprung(ranks, true);
    expect(first).toBe(plain);
    expect(plain).toBeGreaterThan(0);
    expect(second / first).toBeCloseTo(more / base, 1);
  });
});

describe("Feral Aggression (#2317)", () => {
  const FERAL = "ranger.feral-aggression";

  it.each([
    [RANK_12, 17, 9],
    [RANK_0, 5, 3],
  ] as const)(
    "speeds your pet's attacks 33% and adds 3...10 damage for 5...20 seconds (%#)",
    (ranks, seconds, more) => {
      const sim = match(["ranger.charm-animal", FERAL], ranks);
      const pet = [...sim.participants()].find((other) => other.creature?.ownerId === "r");
      press(sim, FERAL);
      stepFor(sim, DT);
      const status = pet?.combatant.statuses.get("feral-aggression");
      expect(status?.remainingSeconds).toBeGreaterThan(seconds - 0.1);
      const modifiers = aggregateModifiers(pet?.combatant.statuses.active ?? []);
      expect(modifiers.attackDurationMultiplier).toBe(0.67);
      expect(pet === undefined ? 0 : attackDamageDeltaOf(pet.combatant)).toBeCloseTo(more, 5);
      expect(get(sim, "r").combatant.statuses.has("feral-aggression")).toBe(false);
    },
  );

  it("with no pet, does nothing", () => {
    const sim = match([FERAL], RANK_12);
    press(sim, FERAL);
    stepFor(sim, DT);
    for (const participant of sim.participants()) {
      expect(participant.combatant.statuses.has("feral-aggression")).toBe(false);
    }
  });
});

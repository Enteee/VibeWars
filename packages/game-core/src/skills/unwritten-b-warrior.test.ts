import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant, strikesOf } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Unwritten corpus skills, Warrior (#2500): Drunken Blow, Yeti Smash,
 * Grapple, "I Meant to Do That!", Distracting Strike and Symbolic Strike,
 * on today's primitives. Each the corpus's record, each scaled number at
 * ranks 0 and 12, and one behaviour each.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const ATTRIBUTES = ["warrior.tactics", "warrior.hammer-mastery", "warrior.strength"];
const ranksAt = (rank: number): ReadonlyMap<string, number> =>
  new Map(ATTRIBUTES.map((id) => [id, rank]));

const DRUNKEN_BLOW = "warrior.drunken-blow";
const YETI_SMASH = "warrior.yeti-smash";
const GRAPPLE = "warrior.grapple";
const I_MEANT_TO = "warrior.i-meant-to-do-that";
const DISTRACTING_STRIKE = "warrior.distracting-strike";
const SYMBOLIC_STRIKE = "warrior.symbolic-strike";

function wielding(weapon: "hammer" | "sword"): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId: weapon === "hammer" ? "warrior.hammer-mastery" : "warrior.swordsmanship",
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A float stream of 0.9: no crit, no block, no blind miss, no failure. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** As `steady`, but every pick in a range is its last: Bleeding of Drunken Blow's four. */
const pickingLast = (): SimulationRng =>
  Object.assign(createRng(1), {
    nextInt: (_min: number, max: number) => Math.min(10, max - 1),
    nextFloat: () => 0.9,
  });

/** A float stream of 0.5: a 75% block blocks. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

/** A float stream of 0: a 50% failure chance fails. */
const failing = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A Warrior at `rank` in every attribute here, wielding `weapon`. */
function warrior(
  rank: number,
  weapon: "hammer" | "sword" = "sword",
  bar: string[] = [],
): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    health: 480,
    maxHealth: 480,
    equipment: wielding(weapon),
    attributeRanks: ranksAt(rank),
    skillBar: bar,
    adrenaline: new Map(bar.map((id) => [id, 0])),
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

function attack(skillId: string, caster: Combatant, targets: Combatant[], rng = steady()) {
  return resolveAttackSkillOutcome(
    { skill: skill(skillId), caster, targets, rng, rules: RULES, surroundings: new Map() },
    () => false,
    [],
  );
}

function use(skillId: string, caster: Combatant, targets: Combatant[]): CombatEvent[] {
  return applySkillEffects({
    skill: skill(skillId),
    caster,
    targets,
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  });
}

/** `caster`'s plain swing at a fresh body under `steady`: what an attack skill adds to. */
function plainBlow(caster: Combatant): number {
  const target = body("plain");
  resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: steady(),
    rules: RULES,
    exposed: () => false,
  });
  return 1e6 - target.health;
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

/** The corpus's record: cost, activation, recharge, attribute, elite. */
function expectCorpus(
  id: string,
  gwId: number,
  type: Skill["type"],
  attributeId: string | undefined,
  cost: Skill["cost"],
  activation: number,
  recharge: number,
  range: number,
): void {
  expect(skill(id)).toMatchObject({
    gwId,
    type,
    elite: false,
    profession: "warrior",
    attributeId,
    cost,
    activationSeconds: activation,
    rechargeSeconds: recharge,
    range,
  });
}

describe("Drunken Blow (#2500)", () => {
  it("is the corpus's: 1133, Tactics, 5 energy, 0 s, 7 s recharge", () => {
    expectCorpus(
      DRUNKEN_BLOW,
      1133,
      "attack",
      "warrior.tactics",
      { kind: "energy", amount: 5 },
      0,
      7,
      RANGE_MELEE,
    );
  });

  it.each([
    [12, 34],
    [0, 10],
  ])(
    "at Tactics %i strikes for +%i, gives one condition, and knocks its user down",
    (rank, bonus) => {
      const caster = warrior(rank);
      const foe = body("f");
      const { events } = attack(DRUNKEN_BLOW, caster, [foe], pickingLast());
      expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
      const given = (
        ["deep-wound", "weakness", "bleeding", "crippled"] as const satisfies readonly StatusId[]
      ).filter((id) => foe.statuses.has(id));
      expect(given).toEqual(["crippled"]);
      expect(foe.statuses.active.find((status) => status.id === "crippled")?.remainingSeconds).toBe(
        15,
      );
      expect(caster.knockdownRemaining).toBeGreaterThan(0);
    },
  );

  it("knocks its user down when it is blocked too, and gives no condition", () => {
    const caster = warrior(12);
    const foe = body("f");
    foe.statuses.apply("critical-defenses", 10, foe.id, NO_RANKS);
    attack(DRUNKEN_BLOW, caster, [foe], blocking());
    expect(caster.knockdownRemaining).toBeGreaterThan(0);
    expect(foe.statuses.has("bleeding")).toBe(false);
    expect(foe.statuses.has("crippled")).toBe(false);
  });

  it("says its knockdown once, hit or miss", () => {
    expect(
      describeSkill(skill(DRUNKEN_BLOW), ranksAt(12), EN_WORDS, EN_NAMES).effects.map(
        ({ text }) => text,
      ),
    ).toEqual([
      "+34 damage",
      "Applies one of, at random: Deep Wound (20s), Weakness (20s), Bleeding (25s), Crippled (15s)",
      "You are knocked down for 2s, hit or miss",
    ]);
  });
});

describe("Yeti Smash (#2500)", () => {
  it("is the corpus's: 1137, Hammer Mastery, 6 adrenaline, 0 s, no recharge, loses all adrenaline", () => {
    expectCorpus(
      YETI_SMASH,
      1137,
      "attack",
      "warrior.hammer-mastery",
      { kind: "adrenaline", amount: 6 },
      0,
      0,
      RANGE_MELEE,
    );
    expect(skill(YETI_SMASH)).toMatchObject({
      losesAllAdrenaline: true,
      area: { radius: AREA_ADJACENT, origin: "caster", affects: "enemies" },
      attack: {
        weapon: "hammer",
        missChanceAtOrBelowRank: { attributeId: "warrior.hammer-mastery", rank: 4, chance: 0.5 },
      },
    });
  });

  it("knocks down each struck foe that suffers a condition, and only that one", () => {
    const caster = warrior(12, "hammer");
    const bleeding = body("bleeding");
    bleeding.statuses.apply("bleeding", 10, caster.id, NO_RANKS);
    const clean = body("clean");
    const { events } = attack(YETI_SMASH, caster, [bleeding, clean]);
    expect(damageTo(events, "bleeding")).toHaveLength(1);
    expect(damageTo(events, "clean")).toHaveLength(1);
    expect(bleeding.knockdownRemaining).toBeGreaterThan(0);
    expect(clean.knockdownRemaining).toBe(0);
  });

  it.each([
    [4, 0],
    [5, 1],
  ])("at Hammer Mastery %i, a failing roll lands %i blows", (rank, blows) => {
    const { events } = attack(YETI_SMASH, warrior(rank, "hammer"), [body("f")], failing());
    expect(damageTo(events, "f")).toHaveLength(blows);
  });
});

describe("Grapple (#2500)", () => {
  it("is the corpus's: 2011, no attribute, 5 energy, 0.75 s, 8 s recharge, a touch skill", () => {
    expectCorpus(
      GRAPPLE,
      2011,
      "skill",
      undefined,
      { kind: "energy", amount: 5 },
      0.75,
      8,
      RANGE_MELEE,
    );
    expect(skill(GRAPPLE)).toMatchObject({ touch: true, target: "single-enemy" });
  });

  it("knocks down its user and the foe, and ends its user's stance", () => {
    const caster = warrior(12);
    caster.statuses.apply("sprint", 10, caster.id, NO_RANKS);
    const foe = body("f");
    use(GRAPPLE, caster, [foe]);
    expect(foe.knockdownRemaining).toBeGreaterThan(0);
    expect(caster.knockdownRemaining).toBeGreaterThan(0);
    expect(caster.statuses.has("sprint")).toBe(false);
  });

  it("knocks both down with no stance to lose", () => {
    const caster = warrior(12);
    const foe = body("f");
    use(GRAPPLE, caster, [foe]);
    expect(foe.knockdownRemaining).toBeGreaterThan(0);
    expect(caster.knockdownRemaining).toBeGreaterThan(0);
  });
});

describe('"I Meant to Do That!" (#2500)', () => {
  it("is the corpus's: 2067, Strength, 5 energy, 0 s, 8 s recharge", () => {
    expectCorpus(
      I_MEANT_TO,
      2067,
      "shout",
      "warrior.strength",
      { kind: "energy", amount: 5 },
      0,
      8,
      RANGE_SPELL,
    );
    expect(skill(I_MEANT_TO).target).toBe("self");
  });

  it.each([
    [12, 5],
    [0, 1],
  ])("at Strength %i a knocked-down user gains %i strikes", (rank, strikes) => {
    const caster = warrior(rank, "sword", [I_MEANT_TO, YETI_SMASH]);
    caster.knockdownRemaining = 2;
    use(I_MEANT_TO, caster, [caster]);
    expect(strikesOf(caster, YETI_SMASH)).toBe(strikes);
  });

  it("gives a standing user nothing", () => {
    const caster = warrior(12, "sword", [I_MEANT_TO, YETI_SMASH]);
    use(I_MEANT_TO, caster, [caster]);
    expect(strikesOf(caster, YETI_SMASH)).toBe(0);
  });

  it("says its user is the one knocked down", () => {
    expect(
      describeSkill(skill(I_MEANT_TO), ranksAt(12), EN_WORDS, EN_NAMES).effects.map(
        ({ text }) => text,
      ),
    ).toEqual(["If you are knocked down: gain 5 strikes of adrenaline"]);
  });
});

describe("Distracting Strike (#2500)", () => {
  it("is the corpus's: 2194, no attribute, 5 energy, 0.5 s, 15 s recharge", () => {
    expectCorpus(
      DISTRACTING_STRIKE,
      2194,
      "attack",
      undefined,
      { kind: "energy", amount: 5 },
      0.5,
      15,
      RANGE_MELEE,
    );
  });

  function casting(cracked: boolean): Combatant {
    const foe = makeCombatant({ id: "foe", team: 1, skillBar: ["elementalist.fireball"] });
    foe.cast.beginCast("elementalist.fireball", foe.id, 3, undefined);
    if (cracked) {
      foe.statuses.apply("cracked-armor", 10, "w", NO_RANKS);
    }
    return foe;
  }

  it("deals no damage, interrupts, and disables the skill 30 s on Cracked Armor", () => {
    const foe = casting(true);
    const { events } = attack(DISTRACTING_STRIKE, warrior(12), [foe]);
    expect(foe.health).toBe(foe.maxHealth);
    expect(foe.cast.isCasting).toBe(false);
    expect(events.filter((event) => event.kind === "skill-disabled")).toEqual([
      { kind: "skill-disabled", targetId: "foe", skillId: "elementalist.fireball", seconds: 30 },
    ]);
  });

  it("interrupts and disables nothing without Cracked Armor", () => {
    const foe = casting(false);
    const { events } = attack(DISTRACTING_STRIKE, warrior(12), [foe]);
    expect(foe.cast.isCasting).toBe(false);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });
});

describe("Symbolic Strike (#2500)", () => {
  it("is the corpus's: 2195, no attribute, 4 adrenaline, 0 s, no recharge", () => {
    expectCorpus(
      SYMBOLIC_STRIKE,
      2195,
      "attack",
      undefined,
      { kind: "adrenaline", amount: 4 },
      0,
      0,
      RANGE_MELEE,
    );
  });

  const SIGNETS = [
    "warrior.signet-of-strength",
    "monk.signet-of-devotion",
    "mesmer.signet-of-distraction",
    "ritualist.death-pact-signet",
    "monk.blessed-signet",
    "mesmer.signet-of-midnight",
  ];

  it.each([
    [0, 0],
    [2, 24],
    [5, 60],
    [6, 70],
  ])("with %i signets on the bar strikes for +%i", (signets, bonus) => {
    const bar = [SYMBOLIC_STRIKE, ...SIGNETS.slice(0, signets)];
    for (const id of bar) {
      expect(getSkill(id)?.type).toBe(id === SYMBOLIC_STRIKE ? "attack" : "signet");
    }
    const caster = warrior(12, "sword", bar);
    const { events } = attack(SYMBOLIC_STRIKE, caster, [body("f")]);
    expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
  });
});

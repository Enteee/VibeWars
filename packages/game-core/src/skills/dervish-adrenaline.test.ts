import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { fillPools, gainUnits } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { chargeAdrenaline, makeCombatant, strikesOf } from "./testing.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { cleaveVictims, resolveAttackSkill } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * A scythe's attack skill cleaves (#977), Zealous Sweep pays out for each
 * foe it hits, and Mystic Twister is an adrenaline spell whose enchanted
 * bonus joins its one packet. Every combatant wears reference armor, so a
 * spell lands for exactly its stated amount.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const NOWHERE = (): boolean => false;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.wind-prayers", 12],
  ["dervish.mysticism", 12],
  ["warrior.swordsmanship", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A stream that rolls `roll` and floats `float`: 0.95 never blocks, 0.1 always does. */
const steady = (roll = 10, float = 0.95): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

function wielding(weapon: Weapon): ResolvedEquipment {
  const attributeId =
    weapon === WEAPONS.scythe ? "dervish.scythe-mastery" : "warrior.swordsmanship";
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function dervish(weapon: Weapon = WEAPONS.scythe, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({
    id: "dervish",
    attributeRanks: RANKS,
    equipment: wielding(weapon),
    adrenaline: new Map([["dervish.heart-of-fury", 0]]),
    ...overrides,
  });
}

function foe(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000, ...overrides });
}

function around(...placed: readonly [Combatant, Vec2][]): Surroundings {
  return new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

/**
 * The dervish at the origin, its target a step away, and four more foes
 * adjacent to the target at rising distances: `near1`, `near2`, `near3`,
 * then `far`, out of reach of a cleave.
 */
function crowd(self: Combatant): {
  readonly foes: Combatant[];
  readonly surroundings: Surroundings;
} {
  const foes = ["target", "near1", "near2", "near3", "far"].map((id) => foe(id));
  const [target, near1, near2, near3, far] = foes as [
    Combatant,
    Combatant,
    Combatant,
    Combatant,
    Combatant,
  ];
  return {
    foes,
    surroundings: around(
      [self, vec2(0, 0)],
      [target, vec2(30, 0)],
      [near1, vec2(30, 10)],
      [near2, vec2(30, -20)],
      [near3, vec2(60, 0)],
      [far, vec2(30 + AREA_ADJACENT + 1, 0)],
    ),
  };
}

/** `id`, an attack skill, at `target`, as the simulation resolves it at the hit. */
function attack(
  self: Combatant,
  id: string,
  target: Combatant,
  surroundings: Surroundings,
  rng = steady(),
): CombatEvent[] {
  return resolveAttackSkill(
    { surroundings, skill: skill(id), caster: self, targets: [target], rng, rules: RULES },
    NOWHERE,
    [],
  );
}

const struck = (events: readonly CombatEvent[]): string[] => [
  ...new Set(events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : []))),
];

describe("a scythe's attack skill cleaves (#977)", () => {
  it("strikes the target and the 2 foes nearest it, not one further off", () => {
    const self = dervish();
    const { surroundings } = crowd(self);
    const target = surroundings.get("target")?.combatant ?? foe("missing");
    expect(struck(attack(self, "dervish.zealous-sweep", target, surroundings))).toEqual([
      "target",
      "near1",
      "near2",
    ]);
  });

  it("finds its victims as `cleaveVictims` does, and a sword finds none", () => {
    const self = dervish();
    const { surroundings } = crowd(self);
    const at = surroundings.get("target");
    if (at === undefined) {
      throw new Error("no target");
    }
    expect(
      cleaveVictims(self, at, surroundings, WEAPONS.scythe, WEAPONS.scythe.cleaveTargets).map(
        (combatant) => combatant.id,
      ),
    ).toEqual(["near1", "near2"]);
    expect(cleaveVictims(self, at, surroundings, WEAPONS.sword, Number.POSITIVE_INFINITY)).toEqual(
      [],
    );
  });

  it("with a sword, an attack skill strikes only its target", () => {
    const self = dervish(WEAPONS.sword);
    const { foes, surroundings } = crowd(self);
    const [target] = foes as [Combatant];
    expect(struck(attack(self, "dervish.victorious-sweep", target, surroundings))).toEqual([
      "target",
    ]);
  });

  it("an attack skill with its own area strikes its area's victims, and cleaves none in", () => {
    const self = dervish();
    const { foes, surroundings } = crowd(self);
    const [target, near1] = foes as [Combatant, Combatant];
    const swept: Skill = {
      ...skill("dervish.zealous-sweep"),
      area: {
        radius: AREA_ADJACENT,
        origin: "caster",
        affects: "enemies",
        maxTargets: undefined,
        includesCaster: false,
      },
    };
    const events = resolveAttackSkill(
      {
        surroundings,
        skill: swept,
        caster: self,
        targets: [target, near1],
        rng: steady(),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
    expect(struck(events)).toEqual(["target", "near1"]);
  });

  it("Wounding Strike on 3 bleeds and deep-wounds each, and costs one enchantment", () => {
    const self = dervish();
    self.statuses.apply("mystic-regeneration", 10, "dervish", NO_RANKS);
    self.statuses.apply("fleeting-stability", 10, "dervish", NO_RANKS);
    const { foes, surroundings } = crowd(self);
    const [target, near1, near2] = foes as [Combatant, Combatant, Combatant];
    attack(self, "dervish.wounding-strike", target, surroundings);
    expect(self.statuses.active.map((status) => status.id)).toEqual(["mystic-regeneration"]);
    for (const victim of [target, near1, near2]) {
      expect(victim.statuses.has("bleeding")).toBe(true);
      expect(victim.statuses.has("deep-wound")).toBe(true);
    }
  });

  it("Victorious Sweep on 3 weaker foes heals 70 for each: 210", () => {
    const self = dervish(WEAPONS.scythe, { maxHealth: 1000, health: 500 });
    const { foes, surroundings } = crowd(self);
    for (const victim of foes) {
      victim.health = 300;
    }
    const [target] = foes as [Combatant];
    attack(self, "dervish.victorious-sweep", target, surroundings);
    expect(self.health).toBe(710);
  });
});

describe("Zealous Sweep (#977)", () => {
  it("gains 3 energy and a strike for each foe it hits: 9 and 3 for a cleave into 3", () => {
    const self = dervish(WEAPONS.scythe, { energy: 10 });
    const { foes, surroundings } = crowd(self);
    attack(self, "dervish.zealous-sweep", foes[0] ?? foe("missing"), surroundings);
    expect(self.energy).toBe(19);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(3);
  });

  it("hits one foe alone: 3 energy and 1 strike", () => {
    const self = dervish(WEAPONS.scythe, { energy: 10 });
    const target = foe("target");
    attack(
      self,
      "dervish.zealous-sweep",
      target,
      around([self, vec2(0, 0)], [target, vec2(30, 0)]),
    );
    expect(self.energy).toBe(13);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(1);
  });

  it("counts no foe that blocks, nor one it misses", () => {
    const self = dervish(WEAPONS.scythe, { energy: 10 });
    const { foes, surroundings } = crowd(self);
    for (const victim of foes) {
      victim.statuses.apply("guardian", 10, "monk", NO_RANKS);
    }
    attack(self, "dervish.zealous-sweep", foes[0] ?? foe("missing"), surroundings, steady(10, 0.1));
    expect(self.energy).toBe(10);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(0);
  });

  it("fills no pool past its cost, and none that is recharging", () => {
    const self = dervish(WEAPONS.scythe, {
      adrenaline: new Map([
        ["dervish.heart-of-fury", 0],
        ["warrior.backbreaker", 0],
      ]),
    });
    chargeAdrenaline(self, "dervish.heart-of-fury");
    self.cast.startRecharge("warrior.backbreaker", 10);
    const { foes, surroundings } = crowd(self);
    attack(self, "dervish.zealous-sweep", foes[0] ?? foe("missing"), surroundings);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(4);
    expect(strikesOf(self, "warrior.backbreaker")).toBe(0);
  });

  it("with the blow's own strike, a cleave into 3 charges Heart of Fury from 0 to 4 in a match", () => {
    const spec = (id: string, team: number, spawn: Vec2): ParticipantSpec => ({
      id,
      team,
      skillBar: team === 0 ? ["dervish.zealous-sweep", "dervish.heart-of-fury"] : [],
      attributeRanks: RANKS,
      equipment:
        team === 0 ? wielding(WEAPONS.scythe) : unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn,
      facing: 0,
    });
    const match = new MatchSimulation({
      seed: "zealous",
      participants: [
        spec("d", 0, vec2(0, 0)),
        spec("target", 1, vec2(30, 0)),
        spec("near1", 1, vec2(30, 10)),
        spec("near2", 1, vec2(30, -20)),
      ],
    });
    const self = match.get("d")?.combatant;
    if (self === undefined) {
      throw new Error("no dervish");
    }
    match.setTarget("d", "target");
    self.energy = 20;
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log: CombatEvent[] = [];
    for (let i = 0; i < 40 && !log.some((event) => event.kind === "damage"); i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    expect(struck(log).sort()).toEqual(["near1", "near2", "target"]);
    expect(self.energy).toBe(20 - 5 + 9);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(4);
  });
});

describe("Mystic Twister (#977)", () => {
  /** Mystic Twister lands on `targets`. */
  function twist(self: Combatant, ...targets: Combatant[]): CombatEvent[] {
    return applySkillEffects({
      surroundings: new Map(),
      skill: skill("dervish.mystic-twister"),
      caster: self,
      targets,
      rng: createRng(1),
      rules: RULES,
    });
  }

  it("deals 50 to each foe, unenchanted", () => {
    const self = dervish();
    const events = twist(self, foe("a"), foe("b"));
    expect(events.filter((event) => event.kind === "damage")).toEqual([
      expect.objectContaining({ targetId: "a", amount: 50 }),
      expect.objectContaining({ targetId: "b", amount: 50 }),
    ]);
  });

  it("deals 100 in one packet while you are enchanted", () => {
    const self = dervish();
    self.statuses.apply("vow-of-strength", 15, "dervish", NO_RANKS);
    const events = twist(self, foe("a"));
    expect(events.filter((event) => event.kind === "damage")).toEqual([
      expect.objectContaining({ targetId: "a", amount: 100 }),
    ]);
  });

  it("in a match: hits the foes nearby, not one further off, and empties its pool", () => {
    const spec = (id: string, team: number, spawn: Vec2): ParticipantSpec => ({
      id,
      team,
      skillBar: team === 0 ? ["dervish.mystic-twister"] : [],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn,
      facing: 0,
    });
    const match = new MatchSimulation({
      seed: "twister",
      participants: [
        spec("d", 0, vec2(0, 0)),
        spec("a", 1, vec2(40, 0)),
        spec("b", 1, vec2(0, -60)),
        spec("away", 1, vec2(AREA_NEARBY + 20, 0)),
      ],
    });
    const self = match.get("d")?.combatant;
    if (self === undefined) {
      throw new Error("no dervish");
    }
    chargeAdrenaline(self, "dervish.mystic-twister");
    expect(match.requestSkill("d", 0)?.check).toEqual({ ok: true });
    const log: CombatEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      log.push(...match.step(DT).log.flatMap((entry) => entry.events));
    }
    const damage = log.filter((event) => event.kind === "damage");
    expect(damage.map((event) => [event.targetId, event.amount])).toEqual([
      ["a", 50],
      ["b", 50],
    ]);
    expect(strikesOf(self, "dervish.mystic-twister")).toBe(0);
  });

  it("reads its bonus on its card", () => {
    expect(describeSkill(skill("dervish.mystic-twister"), RANKS).effects[0]?.text).toBe(
      "Deals 50 cold damage; if you have an enchantment: +50",
    );
  });
});

describe("Zealous Sweep's card (#977)", () => {
  it("says it cleaves, and what it gains per foe hit", () => {
    expect(
      describeSkill(skill("dervish.zealous-sweep"), RANKS).effects.map(({ text }) => text),
    ).toEqual([
      "+17 damage",
      "Hits up to 2 adjacent foes too",
      "Gain 3 energy per foe hit",
      "Gain 1 strike of adrenaline per foe hit",
    ]);
  });
});

describe("fillPools (#977)", () => {
  it("fills the pools without stamping combat; gainUnits stamps it", () => {
    const self = dervish(WEAPONS.scythe, { lastCombatAt: 3 });
    fillPools(self, 25);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(1);
    expect(self.lastCombatAt).toBe(3);
    gainUnits(self, 25, 9);
    expect(strikesOf(self, "dervish.heart-of-fury")).toBe(2);
    expect(self.lastCombatAt).toBe(9);
  });
});

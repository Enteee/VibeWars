import { describe, expect, it } from "vitest";

import {
  AREA_EARSHOT,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_NATURE_RITUAL,
  RANGE_SPELL,
} from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, SurroundingBody, Surroundings } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Paragon, Dervish, Assassin and Ritualist staples (#2413): Inspirational
 * Speech, Meditation, Radiant Scythe, Sharpen Daggers, Wielder's Strike,
 * Offering of Spirit and Binding Chains, on today's primitives. Every
 * scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["paragon.motivation", rank],
    ["dervish.mysticism", rank],
    ["dervish.scythe-mastery", rank],
    ["assassin.critical-strikes", rank],
    ["assassin.dagger-mastery", rank],
    ["ritualist.channeling-magic", rank],
    ["ritualist.communing", rank],
    ["warrior.swordsmanship", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

const SPEECH = "paragon.inspirational-speech";
const MEDITATION = "dervish.meditation";
const RADIANT = "dervish.radiant-scythe";
const SHARPEN = "assassin.sharpen-daggers";
const WIELDERS = "ritualist.wielders-strike";
const OFFERING = "ritualist.offering-of-spirit";
const BINDING = "ritualist.binding-chains";

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

const DAGGERS = wielding(WEAPONS.daggers, "assassin.dagger-mastery");
const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");
const SCYTHE = wielding(WEAPONS.scythe, "dervish.scythe-mastery");

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** A float stream of 0.3: no crit, a 75% block holds. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.3 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the seven are the corpus's (#2413)", () => {
  const FOE = "single-enemy";

  it.each([
    [
      SPEECH,
      2207,
      "skill",
      false,
      "motivation",
      "energy",
      5,
      0,
      10,
      RANGE_SPELL,
      "single-other-ally",
    ],
    [
      MEDITATION,
      1523,
      "enchantment",
      false,
      "mysticism",
      "energy",
      10,
      0.25,
      15,
      RANGE_SPELL,
      "self",
    ],
    [RADIANT, 2012, "attack", false, "scythe-mastery", "adrenaline", 6, 0, 0, RANGE_MELEE, FOE],
    [
      SHARPEN,
      926,
      "enchantment",
      false,
      "critical-strikes",
      "energy",
      5,
      0.5,
      20,
      RANGE_SPELL,
      "self",
    ],
    [WIELDERS, 1733, "spell", false, "channeling-magic", "energy", 5, 1, 6, RANGE_SPELL, FOE],
    [OFFERING, 1479, "spell", true, "channeling-magic", "energy", 3, 0.25, 15, RANGE_SPELL, "self"],
    [BINDING, 1236, "hex", false, "communing", "energy", 10, 1, 15, RANGE_SPELL, FOE],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, costKind, amount, activation, recharge, range, target) => {
      const [profession = ""] = id.split(".");
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: costKind, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );

  it("Inspirational Speech and Meditation lose all adrenaline", () => {
    expect(skill(SPEECH).losesAllAdrenaline).toBe(true);
    expect(skill(MEDITATION).losesAllAdrenaline).toBe(true);
  });
});

/** A participant at `spawn`; `r` is team 0 at the origin. */
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
  equipment: ResolvedEquipment,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "staples-pdra-d",
    participants: [
      spec("r", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks, equipment }),
      ...others,
    ],
  });
  for (const participant of sim.participants()) {
    participant.combatant.maxHealth = 1e4;
    participant.combatant.health = 1e4;
    // Room for every Energy gain to show in full.
    participant.combatant.energy = 50;
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

/** `r` uses `skillId` on `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId?: string): CombatLogEntry[] {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `remaining` is `seconds`, less the steps since it landed. */
function lasts(remaining: number | undefined, seconds: number): void {
  expect(remaining).toBeGreaterThan(seconds - 0.3);
  expect(remaining).toBeLessThanOrEqual(seconds);
}

/** The events `skillId` caused in `log`. */
const of = (log: readonly CombatLogEntry[], skillId: string): CombatEvent[] =>
  log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const energyTo = (events: readonly CombatEvent[], targetId = "r"): number[] =>
  events.flatMap((event) =>
    event.kind === "energy-gain" && event.targetId === targetId ? [event.amount] : [],
  );

const strikesTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "adrenaline-gained" && event.targetId === targetId ? [event.strikes] : [],
  );

const sacrificed = (events: readonly CombatEvent[]): number[] =>
  events.flatMap((event) => (event.kind === "sacrifice" ? [event.amount] : []));

const EVISCERATE = "warrior.eviscerate";
const SEVER = "warrior.sever-artery";

describe("Inspirational Speech (#2413)", () => {
  /** `r` a Paragon with a full adrenal pool of its own; `a` an ally with `bar`. */
  function speech(ranks: ReadonlyMap<string, number>, bar: readonly string[]) {
    const sim = match(
      [SPEECH, RADIANT],
      ranks,
      SCYTHE,
      spec("a", 0, vec2(200, 0), { skillBar: [...bar] }),
    );
    get(sim, "r").combatant.adrenaline.set(RADIANT, 6 * ADRENALINE_PER_STRIKE);
    for (const id of bar) {
      get(sim, "a").combatant.adrenaline.set(id, 0);
    }
    return sim;
  }

  it.each([
    [RANK_12, 7],
    [RANK_0, 1],
  ] as const)(
    "the ally gains 1...8 strikes, and the Paragon loses all its adrenaline (%#)",
    (ranks, strikes) => {
      const sim = speech(ranks, [EVISCERATE]);
      const events = of(cast(sim, SPEECH, "a"), SPEECH);
      expect(strikesTo(events, "a")).toEqual([strikes]);
      expect(strikesTo(events, "r")).toEqual([]);
      expect(get(sim, "a").combatant.adrenaline.get(EVISCERATE)).toBe(
        strikes * ADRENALINE_PER_STRIKE,
      );
      expect(get(sim, "r").combatant.adrenaline.get(RADIANT)).toBe(0);
    },
  );

  it("each of the ally's adrenal skills caps at its cost", () => {
    const sim = speech(RANK_12, [EVISCERATE, SEVER]);
    cast(sim, SPEECH, "a");
    const a = get(sim, "a").combatant.adrenaline;
    expect(a.get(EVISCERATE)).toBe(7 * ADRENALINE_PER_STRIKE);
    expect(a.get(SEVER)).toBe(4 * ADRENALINE_PER_STRIKE);
  });

  it("an ally with no adrenal skill gains nothing", () => {
    const sim = speech(RANK_12, []);
    expect(strikesTo(of(cast(sim, SPEECH, "a"), SPEECH), "a")).toEqual([]);
  });

  it("cannot target the Paragon itself", () => {
    const sim = speech(RANK_12, [EVISCERATE]);
    sim.setTarget("r", "r");
    expect(sim.requestSkill("r", 0)?.check).toMatchObject({ ok: false });
  });
});

describe("Meditation (#2413)", () => {
  /** `r` a Dervish at `ranks`, under Meditation, low on Energy. */
  function meditating(ranks: ReadonlyMap<string, number>) {
    const sim = match([MEDITATION, RADIANT], ranks, SCYTHE);
    const r = get(sim, "r").combatant;
    r.adrenaline.set(RADIANT, 6 * ADRENALINE_PER_STRIKE);
    cast(sim, MEDITATION);
    r.energy = 10;
    return { sim, r };
  }

  it("lasts 20 seconds and loses all adrenaline", () => {
    const { r } = meditating(RANK_12);
    lasts(r.statuses.get("meditation")?.remainingSeconds, 20);
    expect(r.adrenaline.get(RADIANT)).toBe(0);
  });

  it.each([
    [RANK_12, 3],
    [RANK_0, 1],
  ] as const)("an enchantment that expires gives 1...4 Energy (%#)", (ranks, energy) => {
    const { sim, r } = meditating(ranks);
    r.statuses.apply("enchanted-haste", 0.2, "r", NO_RANKS);
    expect(energyTo(of(stepFor(sim, 0.5), MEDITATION))).toEqual([energy]);
  });

  it("a stripped enchantment gives Energy once", () => {
    const { sim, r } = meditating(RANK_12);
    r.statuses.apply("spirit-channeling", 30, "r", NO_RANKS);
    r.statuses.removeByCategory("enchantment", 1);
    // The newest goes first: Spirit Channeling, not Meditation.
    expect(r.statuses.has("spirit-channeling")).toBe(false);
    expect(r.statuses.has("meditation")).toBe(true);
    expect(energyTo(of(stepFor(sim, 0.5), MEDITATION))).toEqual([3]);
  });

  it("a flash enchantment's end gives Energy once", () => {
    const { sim, r } = meditating(RANK_12);
    r.statuses.apply("mystic-corruption", 0.2, "r", NO_RANKS);
    expect(energyTo(of(stepFor(sim, 0.5), MEDITATION))).toEqual([3]);
  });

  it("its own end gives nothing, expired or stripped", () => {
    const expired = meditating(RANK_12);
    expect(energyTo(of(stepFor(expired.sim, 21), MEDITATION))).toEqual([]);
    expect(expired.r.statuses.has("meditation")).toBe(false);

    const stripped = meditating(RANK_12);
    stripped.r.statuses.removeByCategory("enchantment", 1);
    expect(stripped.r.statuses.has("meditation")).toBe(false);
    expect(energyTo(of(stepFor(stripped.sim, 0.5), MEDITATION))).toEqual([]);
  });

  it("without Meditation, an enchantment's end gives nothing", () => {
    const sim = match([MEDITATION], RANK_12, SCYTHE);
    const r = get(sim, "r").combatant;
    r.energy = 10;
    r.statuses.apply("enchanted-haste", 0.2, "r", NO_RANKS);
    expect(energyTo(of(stepFor(sim, 0.5), MEDITATION))).toEqual([]);
  });
});

/** A combatant `id` of team 0 with `equipment`, at `ranks`. */
function fighter(id: string, equipment: ResolvedEquipment, ranks: ReadonlyMap<string, number>) {
  return makeCombatant({
    id,
    team: 0,
    energy: 10,
    maxEnergy: 100,
    health: 500,
    maxHealth: 500,
    equipment,
    attributeRanks: ranks,
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** A foe in Bonetti's Defense: 75% block against all attacks. */
function guarded(): Combatant {
  const foe = body("f");
  foe.statuses.apply("bonettis-defense", 10, "f", NO_RANKS);
  return foe;
}

function strike(skillId: string, caster: Combatant, target: Combatant, rng = steady()) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng,
      rules: RULES.combat,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

describe("Radiant Scythe (#2413)", () => {
  /** A Dervish at `ranks` with `energy`, and the blow it lands on a foe. */
  function blow(ranks: ReadonlyMap<string, number>, energy: number) {
    const caster = fighter("d", SCYTHE, ranks);
    caster.energy = energy;
    const { events } = strike(RADIANT, caster, body("f"));
    const [hit = 0] = damageTo(events, "f");
    return { hit, events };
  }

  it.each([
    [RANK_12, 25, 6],
    [RANK_0, 5, 1],
  ] as const)(
    "+1 damage for each point of Energy, at most 5...30, and gains 1...7 Energy on a hit (%#)",
    (ranks, cap, energy) => {
      const plain = blow(ranks, 0).hit;
      const { hit, events } = blow(ranks, 40);
      expect(hit - plain).toBe(cap);
      expect(energyTo(events, "d")).toEqual([energy]);
    },
  );

  it("under its cap, adds the Energy read before its own gain", () => {
    const plain = blow(RANK_12, 0).hit;
    expect(blow(RANK_12, 4).hit - plain).toBe(4);
    expect(blow(RANK_12, 10).hit - plain).toBe(10);
  });

  it("blocked, gains no Energy", () => {
    const caster = fighter("d", SCYTHE, RANK_12);
    const { events } = strike(RADIANT, caster, guarded(), blocking());
    expect(events.some(({ kind }) => kind === "attack-blocked")).toBe(true);
    expect(energyTo(events, "d")).toEqual([]);
  });

  it("gains its Energy once however many foes the scythe cleaves", () => {
    const sim = match(
      [RADIANT],
      // No Critical Strikes, so a critical blow gives no Energy of its own.
      new Map([["dervish.scythe-mastery", 12]]),
      SCYTHE,
      spec("f", 1, vec2(RANGE_MELEE - 5, 0)),
      spec("g", 1, vec2(RANGE_MELEE - 5, 20)),
    );
    const r = get(sim, "r").combatant;
    r.adrenaline.set(RADIANT, 6 * ADRENALINE_PER_STRIKE);
    r.energy = 20;
    const events = of(cast(sim, RADIANT, "f"), RADIANT);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(damageTo(events, "g")).toHaveLength(1);
    expect(energyTo(events)).toEqual([6]);
  });
});

function swing(caster: Combatant, target: Combatant, rng = steady()) {
  return resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng,
    rules: RULES.combat,
    exposed: () => false,
  });
}

describe("Sharpen Daggers (#2413)", () => {
  it.each([
    [RANK_12, 25],
    [RANK_0, 5],
  ] as const)("lasts 5...30 seconds (%#)", (ranks, seconds) => {
    const sim = match([SHARPEN], ranks, DAGGERS);
    cast(sim, SHARPEN);
    lasts(get(sim, "r").combatant.statuses.get("sharpen-daggers")?.remainingSeconds, seconds);
  });

  /** An Assassin with `equipment` under Sharpen Daggers at `ranks`. */
  function sharpened(equipment: ResolvedEquipment, ranks = RANK_12): Combatant {
    const caster = fighter("a", equipment, ranks);
    caster.statuses.apply("sharpen-daggers", 30, "a", ranks);
    return caster;
  }

  it.each([
    [RANK_12, 13],
    [RANK_0, 5],
  ] as const)("a plain dagger swing Bleeds 5...15 seconds (%#)", (ranks, seconds) => {
    const foe = body("f");
    swing(sharpened(DAGGERS, ranks), foe);
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBe(seconds);
  });

  it("a dagger attack skill Bleeds too", () => {
    const foe = body("f");
    strike("assassin.golden-skull-strike", sharpened(DAGGERS), foe);
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBe(13);
  });

  it("a sword swing Bleeds nothing", () => {
    const foe = body("f");
    swing(sharpened(SWORD), foe);
    expect(foe.statuses.has("bleeding")).toBe(false);
  });

  it("a blocked dagger swing Bleeds nothing", () => {
    const foe = guarded();
    const { events } = swing(sharpened(DAGGERS), foe, blocking());
    expect(events.some(({ kind }) => kind === "attack-blocked")).toBe(true);
    expect(foe.statuses.has("bleeding")).toBe(false);
  });

  it("without it, a dagger swing Bleeds nothing", () => {
    const foe = body("f");
    swing(fighter("a", DAGGERS, RANK_12), foe);
    expect(foe.statuses.has("bleeding")).toBe(false);
  });
});

describe("Wielder's Strike (#2413)", () => {
  it.each([
    [RANK_12, 50],
    [RANK_0, 10],
  ] as const)(
    "strikes for 10...60 lightning, with no weapon spell on the caster (%#)",
    (ranks, damage) => {
      const sim = match([WIELDERS], ranks, DAGGERS, spec("f", 1, vec2(300, 0)));
      const hits = damageTo(of(cast(sim, WIELDERS, "f"), WIELDERS), "f");
      expect(hits).toHaveLength(1);
      expect(hits[0]).toBeCloseTo(damage, 0);
    },
  );

  it.each([
    [RANK_12, 50, 42],
    [RANK_0, 10, 10],
  ] as const)(
    "strikes 10...50 more, in the same hit, under a weapon spell on the caster (%#)",
    (ranks, damage, more) => {
      const sim = match([WIELDERS], ranks, DAGGERS, spec("f", 1, vec2(300, 0)));
      get(sim, "r").combatant.statuses.apply("weapon-of-warding", 30, "r", NO_RANKS);
      const hits = damageTo(of(cast(sim, WIELDERS, "f"), WIELDERS), "f");
      expect(hits).toHaveLength(1);
      expect(hits[0]).toBeCloseTo(damage + more, 0);
    },
  );

  it("a weapon spell on the target adds nothing", () => {
    const sim = match([WIELDERS], RANK_12, DAGGERS, spec("f", 1, vec2(300, 0)));
    get(sim, "f").combatant.statuses.apply("weapon-of-warding", 30, "f", NO_RANKS);
    expect(damageTo(of(cast(sim, WIELDERS, "f"), WIELDERS), "f")).toHaveLength(1);
  });
});

describe("Offering of Spirit (#2413)", () => {
  /** `caster` at the origin, and a spirit of the other team's at each of `spirits`. */
  function around(caster: Combatant, spirits: readonly Vec2[]): Surroundings {
    return new Map<string, SurroundingBody>([
      [
        caster.id,
        { combatant: caster, position: vec2(0, 0), creature: undefined, corpseExploited: false },
      ],
      ...spirits.map((position, index): [string, SurroundingBody] => {
        const id = `spirit${String(index)}`;
        return [
          id,
          {
            combatant: makeCombatant({ id, team: 1 }),
            position,
            creature: {
              ownerId: "f",
              kind: "spirit",
              look: "spirit",
              name: "Winnowing",
              expiresInSeconds: Infinity,
              ageSeconds: 0,
              summonedAtTick: 0,
              skillId: "ranger.winnowing",
              aura: { statusId: "winnowing", affects: "all", radius: RANGE_NATURE_RITUAL },
              onDeath: "vanish",
              ownerDisableSeconds: 0,
              deathBurst: undefined,
              onDeathInRange: undefined,
              pulse: undefined,
              replacedBy: undefined,
              corpsesLeft: 0,
              companionSkillId: undefined,
              leaderId: undefined,
              bondStatusId: undefined,
              mode: "guard",
            },
            corpseExploited: false,
          },
        ];
      }),
    ]);
  }

  function offer(ranks: ReadonlyMap<string, number>, spirits: readonly Vec2[] = []) {
    const caster = fighter("r", DAGGERS, ranks);
    return resolveSkillEffects({
      skill: skill(OFFERING),
      caster,
      targets: [caster],
      rng: steady(),
      rules: RULES.combat,
      surroundings: around(caster, spirits),
    }).events;
  }

  it.each([
    [RANK_12, 15],
    [RANK_0, 8],
  ] as const)(
    "gains 8...17 Energy and sacrifices 17% with no spirit near (%#)",
    (ranks, energy) => {
      const events = offer(ranks);
      expect(energyTo(events)).toEqual([energy]);
      expect(sacrificed(events)).toEqual([85]);
    },
  );

  it("any team's spirit in earshot spares the sacrifice; one past it does not", () => {
    const near = offer(RANK_12, [vec2(0, AREA_EARSHOT - 10)]);
    expect(sacrificed(near)).toEqual([]);
    expect(energyTo(near)).toEqual([15]);
    const far = offer(RANK_12, [vec2(0, AREA_EARSHOT + 50)]);
    expect(sacrificed(far)).toEqual([85]);
    expect(energyTo(far)).toEqual([15]);
  });
});

describe("Binding Chains (#2413)", () => {
  /** `f` the target, `g` nearby it, `h` past nearby. */
  const foes = () => [
    spec("f", 1, vec2(300, 0)),
    spec("g", 1, vec2(300 + AREA_NEARBY - 10, 0)),
    spec("h", 1, vec2(300 + AREA_NEARBY + 60, 0)),
  ];

  it.each([
    [RANK_12, 24.2],
    [RANK_0, 1],
  ] as const)(
    "hexes the target and nearby foes for 3 seconds; each second moving, 1...30 damage (%#)",
    (ranks, damage) => {
      const sim = match([BINDING], ranks, DAGGERS, ...foes());
      const log = cast(sim, BINDING, "f");
      for (const id of ["f", "g"]) {
        lasts(get(sim, id).combatant.statuses.get("binding-chains")?.remainingSeconds, 3);
      }
      expect(get(sim, "h").combatant.statuses.has("binding-chains")).toBe(false);
      for (const id of ["f", "g", "h"]) {
        sim.setInputDirection(id, vec2(0, 1));
      }
      const events = of([...log, ...stepFor(sim, 4)], BINDING);
      for (const id of ["f", "g"]) {
        const hits = damageTo(events, id);
        expect(hits, id).toHaveLength(3);
        for (const hit of hits) {
          expect(hit).toBeCloseTo(damage, 0);
        }
      }
      expect(damageTo(events, "h")).toEqual([]);
    },
  );

  it("a foe that stands still takes nothing", () => {
    const sim = match([BINDING], RANK_12, DAGGERS, ...foes());
    const log = cast(sim, BINDING, "f");
    expect(damageTo(of([...log, ...stepFor(sim, 4)], BINDING), "f")).toEqual([]);
  });

  it("moves 90% slower", () => {
    expect(
      aggregateModifiers([{ id: "binding-chains", ranks: NO_RANKS }]).moveSpeedMultiplier,
    ).toBeCloseTo(0.1);
  });
});

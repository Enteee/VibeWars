import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { blockChanceOf } from "./tick.js";
import type { Skill } from "./types.js";
import { skillBlow } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Narrower filters (#2432): Blades of Steel counts recharging dagger
 * attacks, Release Enchantments Monk enchantments lost, Pensive Guardian
 * blocks enchanted foes only, Way of the Lotus answers a dual attack's
 * hit only. Numbers are the corpus's, at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DAGGER = "assassin.dagger-mastery";
const SHADOW = "assassin.shadow-arts";
const FAVOR = "monk.divine-favor";
const PROTECTION = "monk.protection-prayers";
const BLADES = "assassin.blades-of-steel";
const LOTUS = "assassin.way-of-the-lotus";
const RELEASE = "monk.release-enchantments";
const PENSIVE = "monk.pensive-guardian";
const JAGGED = "assassin.jagged-strike";
const FOX = "assassin.fox-fangs";
const FANGS = "assassin.twisting-fangs";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const daggers: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.daggers,
    attributeId: DAGGER,
    damageType: WEAPONS.daggers.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: daggers,
    maxHealth: 1e4,
    maxEnergy: 1000,
    startHealthFraction: 0.5,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `caster` uses the skill in `slot` on `target`, and the steps until it has landed. */
function use(sim: MatchSimulation, caster: string, slot: number, target: string) {
  sim.setTarget(caster, target);
  expect(sim.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  const id = get(sim, caster).skillBar[slot] ?? "";
  return stepFor(sim, skill(id).activationSeconds + 1);
}

function amounts(log: readonly CombatLogEntry[], skillId: string, kind: "heal" | "energy-gain") {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === kind ? [[event.targetId, event.amount] as const] : []));
}

describe("#2432's data", () => {
  it.each([
    [BLADES, 1020, "attack", DAGGER, 0, 8, RANGE_MELEE, "single-enemy"],
    [RELEASE, 960, "spell", FAVOR, 0.25, 5, RANGE_SPELL, "self"],
    [PENSIVE, 1683, "enchantment", PROTECTION, 1, 5, RANGE_SPELL, "single-ally"],
    [LOTUS, 977, "enchantment", SHADOW, 0.25, 20, RANGE_SPELL, "self"],
  ] as const)(
    "%s: gwId %i, %s, %s, 5 energy, %d s, %i s recharge",
    (id, gwId, type, attributeId, activation, recharge, range, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite: false,
        attributeId,
        cost: { kind: "energy", amount: 5 },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );

  it("Blades of Steel is a dual attack with daggers after an off-hand attack", () => {
    expect(skill(BLADES).attack).toMatchObject({
      weapon: "daggers",
      chain: { role: "dual", follows: "off-hand" },
    });
  });
});

describe("Blades of Steel (#2432)", () => {
  const caster = (rank: number, recharging: readonly string[]) => {
    const combatant = makeCombatant({
      id: "c",
      skillBar: [BLADES, ...recharging, "assassin.dash"],
      attributeRanks: new Map([[DAGGER, rank]]),
    });
    for (const id of [...recharging, "assassin.dash"]) {
      combatant.cast.startRecharge(id, 30);
    }
    return combatant;
  };

  it.each([
    [0, 10],
    [12, 28],
  ])(
    "at Dagger Mastery %i: +%i, whole, for itself and Twisting Fangs, not the stance",
    (rank, bonus) => {
      expect(skillBlow(skill(BLADES), caster(rank, [FANGS]), new Map()).bonus).toBe(bonus);
    },
  );

  it("counts itself alone with nothing else recharging", () => {
    expect(skillBlow(skill(BLADES), caster(12, []), new Map()).bonus).toBe(14);
  });

  it("caps at 60", () => {
    const bonus = skillBlow(
      skill(BLADES),
      caster(12, [FANGS, JAGGED, FOX, "assassin.wild-strike"]),
      new Map(),
    ).bonus;
    expect(bonus).toBe(60);
  });

  it("says what it counts", () => {
    expect(
      describeSkill(skill(BLADES), new Map([[DAGGER, 12]]), EN_WORDS, EN_NAMES)
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("recharging dagger attacks");
  });
});

describe("Release Enchantments (#2432)", () => {
  /** A Monk under Guardian, Mending and Way of the Lotus, its ally far off, a foe beside. */
  function party(rank: number, statuses: readonly StatusId[]) {
    const sim = new MatchSimulation({
      seed: "release",
      participants: [
        spec("c", 0, vec2(0, 0), [RELEASE], new Map([[FAVOR, rank]])),
        spec("a", 0, vec2(-800, 0), [], new Map()),
        spec("foe", 1, vec2(600, 0), [], new Map()),
      ],
    });
    for (const id of statuses) {
      get(sim, "c").statuses.apply(id, 60, "c", NO_RANKS);
    }
    return sim;
  }

  // Divine Favor's own heal of a Monk spell's target, 3.2 per rank, follows.
  it.each([
    [0, 10, []],
    [12, 58, [["c", 38]]],
  ] as const)(
    "at Divine Favor %i: loses all three, and each party member heals %i for the two Monk ones",
    (rank, healed, favor) => {
      const sim = party(rank, ["guardian", "mending", "way-of-the-lotus"]);
      const log = use(sim, "c", 0, "c");
      expect(get(sim, "c").statuses.countByCategory("enchantment")).toBe(0);
      expect(amounts(log, RELEASE, "heal")).toEqual([["c", healed], ["a", healed], ...favor]);
    },
  );

  it("with no Monk enchantment lost heals no one but by Divine Favor", () => {
    const sim = party(12, ["way-of-the-lotus"]);
    const log = use(sim, "c", 0, "c");
    expect(get(sim, "c").statuses.has("way-of-the-lotus")).toBe(false);
    expect(amounts(log, RELEASE, "heal")).toEqual([["c", 38]]);
  });

  it("says what it counts", () => {
    expect(
      describeSkill(skill(RELEASE), new Map([[FAVOR, 12]]), EN_WORDS, EN_NAMES)
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("All party members gain 29 Health for each Monk enchantment lost");
  });
});

describe("Pensive Guardian (#2432)", () => {
  it.each([
    [0, 5],
    [12, 9.8],
  ])(
    "at Protection Prayers %i: %d s of 50% block against an enchanted foe only",
    (rank, seconds) => {
      const sim = new MatchSimulation({
        seed: "pensive",
        participants: [
          spec("c", 0, vec2(0, 0), [PENSIVE], new Map([[PROTECTION, rank]])),
          spec("a", 0, vec2(-30, 0), [], new Map()),
          spec("foe", 1, vec2(600, 0), [], new Map()),
        ],
      });
      use(sim, "c", 0, "a");
      const ally = get(sim, "a");
      const left = ally.statuses.get("pensive-guardian")?.remainingSeconds ?? 0;
      expect(left).toBeLessThanOrEqual(seconds);
      expect(left).toBeGreaterThan(seconds - 1.5);
      const foe = get(sim, "foe");
      expect(blockChanceOf(ally, "melee", false, foe.statuses.active)).toBe(0);
      foe.statuses.apply("guardian", 60, "foe", NO_RANKS);
      expect(blockChanceOf(ally, "melee", false, foe.statuses.active)).toBe(0.5);
      expect(blockChanceOf(ally, "projectile", true, foe.statuses.active)).toBe(0.5);
    },
  );

  it("says whom it blocks", () => {
    expect(
      describeSkill(skill(PENSIVE), new Map([[PROTECTION, 12]]), EN_WORDS, EN_NAMES)
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("from foes under an enchantment");
  });
});

describe("Way of the Lotus (#2432)", () => {
  /** An Assassin with daggers and a lead, off-hand and dual chain, a foe in touch. */
  function chain(rank: number) {
    return new MatchSimulation({
      seed: "lotus",
      participants: [
        spec(
          "c",
          0,
          vec2(0, 0),
          [LOTUS, JAGGED, FOX, BLADES],
          new Map([
            [SHADOW, rank],
            [DAGGER, 12],
          ]),
        ),
        { ...spec("foe", 1, vec2(30, 0), [], new Map()), maxHealth: 1e6 },
      ],
    });
  }

  it.each([
    [0, 5],
    [12, 17],
  ])(
    "at Shadow Arts %i: the lead and off-hand hits spend nothing; the dual gives %i and ends it",
    (rank, gain) => {
      const sim = chain(rank);
      use(sim, "c", 0, "c");
      const lead = use(sim, "c", 1, "foe");
      const offHand = use(sim, "c", 2, "foe");
      expect(amounts([...lead, ...offHand], LOTUS, "energy-gain")).toEqual([]);
      expect(get(sim, "c").statuses.has("way-of-the-lotus")).toBe(true);
      const dual = use(sim, "c", 3, "foe");
      expect(amounts(dual, LOTUS, "energy-gain")).toEqual([["c", gain]]);
      expect(get(sim, "c").statuses.has("way-of-the-lotus")).toBe(false);
    },
  );

  it("says what answers it", () => {
    expect(
      describeSkill(skill(LOTUS), new Map([[SHADOW, 12]]), EN_WORDS, EN_NAMES)
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("hit with a dual attack");
  });
});

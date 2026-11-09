import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { FiredTrigger } from "./triggers.js";
import type { Skill } from "./types.js";
import { attackHitRiders } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Counts and charges (#2438): Mantra of Signets' armor per signet on the
 * bar, Farmer's Scythe's foes hit, Harrier's Grasp's rank-scaled Cripple
 * charges, Pious Renewal's end that recharges itself, and Glyph of
 * Restoration's next two spells. Numbers are the corpus's (PvP where
 * split), at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const INSPIRATION = "mesmer.inspiration-magic";
const SCYTHE_MASTERY = "dervish.scythe-mastery";
const WIND = "dervish.wind-prayers";
const MYSTICISM = "dervish.mysticism";
const ENERGY_STORAGE = "elementalist.energy-storage";
const MANTRA = "mesmer.mantra-of-signets";
const FARMERS = "dervish.farmers-scythe";
const GRASP = "dervish.harriers-grasp";
const PIOUS = "dervish.pious-renewal";
const GLYPH = "elementalist.glyph-of-restoration";
const ILLUSIONS = "mesmer.signet-of-illusions";
const HUMILITY = "mesmer.signet-of-humility";
const DISRUPTION = "mesmer.signet-of-disruption";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: SCYTHE_MASTERY,
    damageType: weaponDamageType(WEAPONS.scythe, SCYTHE_MASTERY),
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
    equipment: SCYTHE,
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
    .flatMap((event) => (event.kind === kind ? [event.amount] : []));
}

function text(id: string, ranks: ReadonlyMap<string, number>): string {
  return describeSkill(skill(id), ranks, EN_WORDS, EN_NAMES)
    .effects.map(({ text: line }) => line)
    .join(" ");
}

describe("#2438's data", () => {
  it.each([
    [MANTRA, 18, "stance", false, INSPIRATION, 5, 0, 20, RANGE_SPELL, "self"],
    [FARMERS, 2015, "attack", false, SCYTHE_MASTERY, 5, 0, 20, RANGE_MELEE, "single-enemy"],
    [GRASP, 1758, "enchantment", false, WIND, 10, 0, 15, RANGE_SPELL, "self"],
    [PIOUS, 1499, "enchantment", true, MYSTICISM, 5, 0, 8, RANGE_SPELL, "self"],
    [GLYPH, 1376, "glyph", false, ENERGY_STORAGE, 5, 1, 8, RANGE_SPELL, "self"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, range, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );

  it("Harrier's Grasp and Pious Renewal are flash enchantments, Farmer's Scythe a scythe attack", () => {
    expect(skill(GRASP).flash).toBe(true);
    expect(skill(PIOUS).flash).toBe(true);
    expect(skill(FARMERS).attack?.weapon).toBe("scythe");
  });
});

describe("Mantra of Signets (#2438)", () => {
  function mesmer(rank: number, signets: readonly string[]) {
    return new MatchSimulation({
      seed: "mantra",
      participants: [
        spec("m", 0, vec2(0, 0), [MANTRA, ...signets], new Map([[INSPIRATION, rank]])),
        spec("foe", 1, vec2(600, 0), [], new Map()),
      ],
    });
  }

  it.each([
    [[], 0],
    [[ILLUSIONS], 3],
    [[ILLUSIONS, HUMILITY, DISRUPTION], 9],
  ] as const)("with %j on the bar: +%i armor", (signets, armor) => {
    const sim = mesmer(12, signets);
    use(sim, "m", 0, "m");
    const self = get(sim, "m");
    expect(self.statuses.has("mantra-of-signets")).toBe(true);
    expect(aggregateModifiers(self.statuses.active).armorModifier).toBe(armor);
  });

  it.each([
    [0, 10, 5],
    [12, 34, 49],
  ])("at Inspiration Magic %i: %i s, and a signet used heals %i", (rank, seconds, heal) => {
    const sim = mesmer(rank, [ILLUSIONS]);
    use(sim, "m", 0, "m");
    const left = get(sim, "m").statuses.get("mantra-of-signets")?.remainingSeconds ?? 0;
    expect(left).toBeLessThanOrEqual(seconds);
    expect(left).toBeGreaterThan(seconds - 1.5);
    expect(amounts(use(sim, "m", 1, "m"), MANTRA, "heal")).toEqual([heal]);
  });

  it("says what it counts", () => {
    expect(
      describeStatus("mantra-of-signets", new Map([[INSPIRATION, 12]]), EN_WORDS, EN_NAMES),
    ).toContain("armor");
    expect(text(MANTRA, new Map([[INSPIRATION, 12]]))).toContain(
      "Stacks once for each signet you have equipped",
    );
  });
});

describe("Farmer's Scythe (#2438)", () => {
  function dervish(rank: number, foes: readonly Vec2[]) {
    return new MatchSimulation({
      seed: "farmers",
      participants: [
        spec("d", 0, vec2(0, 0), [FARMERS], new Map([[SCYTHE_MASTERY, rank]])),
        ...foes.map((at, i) => spec(`f${String(i)}`, 1, at, [], new Map())),
      ],
    });
  }

  it("hitting two foes recharges it instantly", () => {
    const sim = dervish(12, [vec2(40, 0), vec2(40, 30)]);
    use(sim, "d", 0, "f0");
    expect(get(sim, "d").cast.isRecharging(FARMERS)).toBe(false);
  });

  it("hitting one foe recharges it as usual", () => {
    const sim = dervish(12, [vec2(40, 0)]);
    use(sim, "d", 0, "f0");
    expect(get(sim, "d").cast.isRecharging(FARMERS)).toBe(true);
  });

  it("says when it recharges", () => {
    expect(text(FARMERS, new Map([[SCYTHE_MASTERY, 12]]))).toContain(
      "If you hit 2 or more foes: this skill recharges instantly",
    );
  });

  it.each([
    [0, 5],
    [12, 29],
  ])("at Scythe Mastery %i: +%i damage", (rank, bonus) => {
    expect(skill(FARMERS).attack?.bonusDamage).toMatchObject({
      scaling: { attributeId: SCYTHE_MASTERY, atZero: 5, atTwelve: 29 },
    });
    expect(text(FARMERS, new Map([[SCYTHE_MASTERY, rank]]))).toContain(String(bonus));
  });
});

describe("Harrier's Grasp (#2438)", () => {
  /** A Dervish under Harrier's Grasp at Wind Prayers `rank`, with a fresh foe for each hit. */
  function grasp(rank: number) {
    const self = makeCombatant({
      id: "d",
      equipment: SCYTHE,
      attributeRanks: new Map([[WIND, rank]]),
    });
    self.statuses.apply("harriers-grasp", 17, "d", new Map([[WIND, rank]]));
    const hit = (moving: boolean): FiredTrigger[] => {
      const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
      victim.moving = moving;
      const fired: FiredTrigger[] = [];
      attackHitRiders(
        self,
        victim,
        SCYTHE.mainHand,
        false,
        0,
        createRng(1),
        RULES.combat,
        new Map(),
        fired,
        [],
      );
      return fired;
    };
    return { self, hit };
  }

  const crippled = (fired: readonly FiredTrigger[]) =>
    fired
      .flatMap(({ events }) => events)
      .flatMap((event) =>
        event.kind === "status-applied" && event.statusId === "crippled"
          ? [event.durationSeconds]
          : [],
      );

  it.each([
    [0, 1, 2],
    // Durations land whole: 7.6 s is 8.
    [12, 3, 8],
  ])(
    "at Wind Prayers %i: ends after %i Cripples of %d s; a standing foe spends none",
    (rank, times, seconds) => {
      const { self, hit } = grasp(rank);
      expect(hit(false)).toEqual([]);
      for (let i = 0; i < times; i += 1) {
        expect(self.statuses.has("harriers-grasp")).toBe(true);
        expect(crippled(hit(true))).toEqual([seconds]);
      }
      expect(self.statuses.has("harriers-grasp")).toBe(false);
    },
  );

  it("on cast relieves Cripple and one other condition", () => {
    const sim = new MatchSimulation({
      seed: "grasp",
      participants: [
        spec("d", 0, vec2(0, 0), [GRASP], new Map([[WIND, 12]])),
        spec("foe", 1, vec2(600, 0), [], new Map()),
      ],
    });
    const self = get(sim, "d");
    for (const id of ["crippled", "bleeding", "poison"] as const) {
      self.statuses.apply(id, 30, "foe", new Map());
    }
    use(sim, "d", 0, "d");
    expect(self.statuses.has("crippled")).toBe(false);
    expect(self.statuses.countByCategory("condition")).toBe(1);
    expect(self.statuses.has("harriers-grasp")).toBe(true);
  });

  it("says how often it takes effect", () => {
    expect(describeStatus("harriers-grasp", new Map([[WIND, 0]]), EN_WORDS, EN_NAMES)).toContain(
      "ends after it takes effect once",
    );
    expect(describeStatus("harriers-grasp", new Map([[WIND, 12]]), EN_WORDS, EN_NAMES)).toContain(
      "ends after it takes effect 3 times",
    );
  });
});

describe("Pious Renewal (#2438)", () => {
  function dervish(rank: number) {
    const sim = new MatchSimulation({
      seed: "pious",
      participants: [
        spec("d", 0, vec2(0, 0), [PIOUS], new Map([[MYSTICISM, rank]])),
        spec("foe", 1, vec2(600, 0), [], new Map()),
      ],
    });
    get(sim, "d").energy = 10;
    return sim;
  }

  it.each([
    [0, [], [0]],
    [12, [4], [24]],
  ] as const)(
    "at Mysticism %i: as it runs out, energy %j and Health %j",
    (rank, energy, health) => {
      const sim = dervish(rank);
      const log = [...use(sim, "d", 0, "d"), ...stepFor(sim, 8)];
      expect(get(sim, "d").statuses.has("pious-renewal")).toBe(false);
      expect(amounts(log, PIOUS, "energy-gain")).toEqual(energy);
      expect(amounts(log, PIOUS, "heal").filter((amount) => amount > 0)).toEqual(
        health.filter((amount) => amount > 0),
      );
    },
  );

  it("removed early, it still recharges itself and pays", () => {
    const sim = dervish(12);
    use(sim, "d", 0, "d");
    const self = get(sim, "d");
    expect(self.cast.isRecharging(PIOUS)).toBe(true);
    self.statuses.end("pious-renewal");
    const log = stepFor(sim, DT);
    expect(self.cast.isRecharging(PIOUS)).toBe(false);
    expect(amounts(log, PIOUS, "energy-gain")).toEqual([4]);
    expect(amounts(log, PIOUS, "heal")).toEqual([24]);
  });
});

describe("Glyph of Restoration (#2438)", () => {
  it.each([
    [0, "150%"],
    [12, "350%"],
  ])("at Energy Storage %i says %s of the spell's cost", (rank, share) => {
    expect(
      describeStatus("glyph-of-restoration", new Map([[ENERGY_STORAGE, rank]]), EN_WORDS, EN_NAMES),
    ).toContain(`healed for ${share} of that skill's energy cost`);
  });

  const SPELLS = [
    "elementalist.armor-of-earth",
    "elementalist.windborne-speed",
    "elementalist.armor-of-frost",
  ];

  it.each([
    [0, [30, 15]],
    [12, [90, 35]],
  ] as const)(
    "at Energy Storage %i: the next 2 spells heal %j each, a third nothing",
    (rank, heals) => {
      const sim = new MatchSimulation({
        seed: "glyph",
        participants: [
          spec("e", 0, vec2(0, 0), [GLYPH, ...SPELLS], new Map([[ENERGY_STORAGE, rank]])),
          spec("foe", 1, vec2(600, 0), [], new Map()),
        ],
      });
      use(sim, "e", 0, "e");
      expect(get(sim, "e").statuses.has("glyph-of-restoration")).toBe(true);
      expect(amounts(use(sim, "e", 1, "e"), GLYPH, "heal")).toEqual(heals);
      expect(amounts(use(sim, "e", 2, "e"), GLYPH, "heal")).toEqual(heals);
      expect(get(sim, "e").statuses.has("glyph-of-restoration")).toBe(false);
      expect(amounts(use(sim, "e", 3, "e"), GLYPH, "heal")).toEqual([]);
    },
  );
});

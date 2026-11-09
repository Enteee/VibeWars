import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { NO_RANKS, aggregateModifiers, ownSkillBoost, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Dropped leftovers (#2446): Healer's Boon spares the Divine Favor
 * bonus, Augury of Death's trigger moves its caster, Light of Dwayna
 * raises every dead party member in the area, Symbolic Celerity lends
 * Fast Casting to every signet, and Storm Djinn's Haste costs Energy
 * while moving. Numbers are the corpus's, at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};
const HEALING = "monk.healing-prayers";
const FAVOR = "monk.divine-favor";
const DEADLY = "assassin.deadly-arts";
const FAST = "mesmer.fast-casting";
const AIR = "elementalist.air-magic";
const BOON = "monk.healers-boon";
const AUGURY = "assassin.augury-of-death";
const LIGHT = "monk.light-of-dwayna";
const CELERITY = "mesmer.symbolic-celerity";
const DJINN = "elementalist.storm-djinns-haste";
const ORISON = "monk.orison-of-healing";
const HEALING_SIGNET = "warrior.healing-signet";

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
    attributeId: "assassin.dagger-mastery",
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
  health = 0.5,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: daggers,
    maxHealth: 1e4,
    maxEnergy: 100,
    startHealthFraction: health,
    spawn,
    facing: 0,
  };
}

function get(sim: MatchSimulation, id: string) {
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

/** `caster` uses the skill in `slot` on `target`, and the steps until it has landed. */
function use(sim: MatchSimulation, caster: string, slot: number, target: string) {
  sim.setTarget(caster, target);
  expect(sim.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  const id = get(sim, caster).combatant.skillBar[slot] ?? "";
  return stepFor(sim, skill(id).activationSeconds + DT * 2);
}

/** The Health `skillId` healed `targetId` for in `log`, every heal summed. */
function healed(log: readonly CombatLogEntry[], skillId: string, targetId: string): number {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .reduce(
      (sum, event) =>
        event.kind === "heal" && event.targetId === targetId ? sum + event.amount : sum,
      0,
    );
}

function lines(id: string, ranks: ReadonlyMap<string, number>): string {
  return describeSkill(skill(id), ranks, EN_WORDS, EN_NAMES)
    .effects.map(({ text }) => text)
    .join(" ");
}

describe("#2446's data", () => {
  it.each([
    [BOON, 1393, "enchantment", true, FAVOR, 5, 0.25, 10, RANGE_SPELL, "self"],
    [AUGURY, 1646, "hex", false, DEADLY, 5, 1, 20, RANGE_SPELL / 2, "single-enemy"],
    [LIGHT, 304, "spell", false, undefined, 25, 4, 20, RANGE_SPELL, "self"],
    [CELERITY, 1340, "enchantment", false, FAST, 15, 1, 30, RANGE_SPELL, "self"],
    [DJINN, 1370, "enchantment", false, AIR, 5, 0.25, 10, RANGE_SPELL, "self"],
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

  it.each([
    [BOON, FAVOR, 0, 10, "healers-boon"],
    [BOON, FAVOR, 12, 46, "healers-boon"],
    [AUGURY, DEADLY, 0, 5, "augury-of-death"],
    [AUGURY, DEADLY, 12, 29, "augury-of-death"],
    [CELERITY, FAST, 0, 36, "symbolic-celerity"],
    // 55.2, whole as every scaled number is.
    [CELERITY, FAST, 12, 55, "symbolic-celerity"],
    [DJINN, AIR, 0, 10, "storm-djinns-haste"],
    [DJINN, AIR, 12, 22, "storm-djinns-haste"],
  ] as const)("%s at %s %i lasts %d s", (id, attributeId, rank, seconds, statusId) => {
    const sim = new MatchSimulation({
      seed: "durations",
      participants: [
        spec("c", 0, vec2(0, 0), [id], new Map([[attributeId, rank]])),
        spec("foe", 1, vec2(200, 0), [], new Map()),
      ],
    });
    const on = statusId === "augury-of-death" ? "foe" : "c";
    sim.setTarget("c", on);
    expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
    // Read as it lands: Fast Casting shortens Symbolic Celerity's own cast.
    const bearer = get(sim, on).combatant;
    for (let i = 0; i < 100 && !bearer.statuses.has(statusId); i += 1) {
      sim.step(DT);
    }
    expect(bearer.statuses.get(statusId)?.remainingSeconds).toBeCloseTo(seconds, 0);
  });
});

describe("Healer's Boon (#2446)", () => {
  const boost = (statuses: readonly StatusId[]) => {
    const caster = makeCombatant({ id: "c" });
    for (const id of statuses) {
      caster.statuses.apply(id, 60, "c", NO_RANKS);
    }
    return ownSkillBoost(caster.statuses.active, skill(ORISON));
  };

  it("halves a Healing Prayers spell's activation, heals 50% more, not the favor bonus", () => {
    expect(boost(["healers-boon"])).toMatchObject({
      activationMultiplier: 0.5,
      healMultiplier: 1.5,
      favorHealMultiplier: 1,
    });
  });

  it("leaves Healer's Covenant's 20% less on the favor bonus", () => {
    const both = boost(["healers-boon", "healers-covenant"]);
    expect(both.healMultiplier).toBeCloseTo(1.2);
    expect(both.favorHealMultiplier).toBe(0.8);
  });

  /** Orison of Healing's Health on `a`, its favor bonus with it, at Divine Favor `favor`. */
  function orison(favor: number, statuses: readonly StatusId[]): number {
    const sim = new MatchSimulation({
      seed: "boon",
      participants: [
        spec(
          "c",
          0,
          vec2(0, 0),
          [ORISON],
          new Map([
            [HEALING, 12],
            [FAVOR, favor],
          ]),
        ),
        spec("a", 0, vec2(60, 0), [], new Map()),
      ],
    });
    for (const id of statuses) {
      get(sim, "c").combatant.statuses.apply(id, 60, "c", NO_RANKS);
    }
    return healed(use(sim, "c", 0, "a"), ORISON, "a");
  }

  it("boosts the spell's heal by half and its Divine Favor bonus not at all", () => {
    const base = orison(0, []);
    const bonus = orison(12, []) - base;
    expect(bonus).toBeGreaterThan(0);
    expect(orison(12, ["healers-boon"])).toBe(Math.round(base * 1.5) + bonus);
    expect(orison(12, ["healers-boon", "healers-covenant"])).toBe(
      Math.round(base * 1.5 * 0.8) + Math.round(bonus * 0.8),
    );
  });
});

describe("Augury of Death (#2446)", () => {
  /** The assassin `a` hexes `foe` 150 off; ally `x` stands beside the foe. */
  function hexed(rank: number) {
    const sim = new MatchSimulation({
      seed: "augury",
      participants: [
        spec("a", 0, vec2(0, 0), [AUGURY], new Map([[DEADLY, rank]])),
        spec("x", 0, vec2(150, 60), [], new Map()),
        spec("foe", 1, vec2(150, 0), [], new Map(), 0.5001),
      ],
    });
    use(sim, "a", 0, "foe");
    expect(get(sim, "foe").combatant.statuses.has("augury-of-death")).toBe(true);
    return sim;
  }

  /** `x` hits the foe until the hex goes, a few seconds at most. */
  function strike(sim: MatchSimulation): void {
    sim.requestAttack("x", "foe");
    const foe = get(sim, "foe").combatant;
    for (let i = 0; i < Math.round(4 / DT) && foe.statuses.has("augury-of-death"); i += 1) {
      sim.step(DT);
    }
  }

  it.each([
    [0, 5],
    [12, 17],
  ])(
    "at Deadly Arts %i: below half Health, a %i s Deep Wound and a step to the foe",
    (rank, seconds) => {
      const sim = hexed(rank);
      const assassin = get(sim, "a");
      const foe = get(sim, "foe");
      const from = assassin.position;
      strike(sim);
      expect(foe.combatant.statuses.has("augury-of-death")).toBe(false);
      expect(foe.combatant.statuses.get("deep-wound")?.remainingSeconds).toBeCloseTo(seconds, 0);
      expect(distance(assassin.position, from)).toBeGreaterThan(50);
      expect(distance(assassin.position, foe.position)).toBeLessThan(
        2 * RULES.collision.playerRadius + 1,
      );
    },
  );

  it("with its caster dead, moves no one", () => {
    const sim = hexed(12);
    const assassin = get(sim, "a");
    assassin.combatant.statuses.apply("burning", 10, "foe", NO_RANKS);
    assassin.combatant.health = 0.2;
    stepFor(sim, DT);
    expect(assassin.combatant.dead).toBe(true);
    const from = assassin.position;
    strike(sim);
    expect(assassin.position).toEqual(from);
  });
});

describe("Light of Dwayna (#2446)", () => {
  /** Monk `m`; allies `near` and `far` and foe `foe`, all dead. */
  function field() {
    const sim = new MatchSimulation({
      seed: "light",
      matchRules: MATCH,
      participants: [
        spec("m", 0, vec2(0, 0), [LIGHT], new Map(), 1),
        spec("near", 0, vec2(AREA_IN_THE_AREA - 20, 0), [], new Map()),
        spec("far", 0, vec2(0, AREA_IN_THE_AREA + 80), [], new Map()),
        spec("foe", 1, vec2(-60, 0), [], new Map()),
      ],
    });
    for (const id of ["near", "far", "foe"]) {
      const victim = get(sim, id).combatant;
      victim.statuses.apply("burning", 10, "m", NO_RANKS);
      victim.health = 0.2;
    }
    stepFor(sim, DT);
    return sim;
  }

  it("raises the dead party members in the area at 25% Health and no Energy", () => {
    const sim = field();
    const log = use(sim, "m", 0, "m");
    const raised = log
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "resurrected");
    expect(raised).toEqual([
      { kind: "resurrected", targetId: "near", healthFraction: 0.25, energyFraction: 0 },
    ]);
    expect(get(sim, "near").combatant.health).toBe(Math.floor(1e4 * 0.25));
    expect(get(sim, "near").combatant.energy).toBe(0);
    expect(get(sim, "far").combatant.dead).toBe(true);
    expect(get(sim, "foe").combatant.dead).toBe(true);
  });

  it("with no one to raise, still completes and costs its Energy", () => {
    const sim = new MatchSimulation({
      seed: "light-alone",
      participants: [spec("m", 0, vec2(0, 0), [LIGHT], new Map(), 1)],
    });
    use(sim, "m", 0, "m");
    expect(get(sim, "m").combatant.energy).toBeLessThanOrEqual(100 - 25 + 2);
    expect(get(sim, "m").combatant.cast.isRecharging(LIGHT)).toBe(true);
  });
});

describe("Symbolic Celerity (#2446)", () => {
  /** A Mesmer at Fast Casting `fast`, Tactics 0, with Healing Signet and Orison. */
  function mesmer(fast: number, enchanted: boolean) {
    const sim = new MatchSimulation({
      seed: "celerity",
      participants: [spec("m", 0, vec2(0, 0), [HEALING_SIGNET, ORISON], new Map([[FAST, fast]]))],
    });
    if (enchanted) {
      get(sim, "m").combatant.statuses.apply("symbolic-celerity", 60, "m", NO_RANKS);
    }
    return sim;
  }

  it.each([
    [false, 12, 82],
    [true, 12, 154],
    [true, 0, 82],
  ])(
    "under it %s at Fast Casting %i: Healing Signet heals %i, every use",
    (enchanted, fast, health) => {
      const sim = mesmer(fast, enchanted);
      expect(healed(use(sim, "m", 0, "m"), HEALING_SIGNET, "m")).toBe(health);
      stepFor(sim, skill(HEALING_SIGNET).rechargeSeconds);
      expect(healed(use(sim, "m", 0, "m"), HEALING_SIGNET, "m")).toBe(health);
      expect(get(sim, "m").combatant.statuses.has("symbolic-celerity")).toBe(enchanted);
    },
  );

  it("lends nothing to a spell", () => {
    expect(healed(use(mesmer(12, true), "m", 1, "m"), ORISON, "m")).toBe(
      healed(use(mesmer(12, false), "m", 1, "m"), ORISON, "m"),
    );
  });

  it("says what it lends", () => {
    expect(lines(CELERITY, new Map([[FAST, 12]]))).toContain("signets use Fast Casting");
  });
});

describe("Storm Djinn's Haste (#2446)", () => {
  function hasted(energy: number) {
    const sim = new MatchSimulation({
      seed: "djinn",
      participants: [spec("e", 0, vec2(0, 0), [], new Map())],
    });
    const e = get(sim, "e").combatant;
    e.statuses.apply("storm-djinns-haste", 30, "e", NO_RANKS);
    e.energy = energy;
    return sim;
  }

  it("is 25% faster", () => {
    const e = hasted(50).get("e")?.combatant;
    expect(aggregateModifiers(e?.statuses.active ?? []).moveSpeedMultiplier).toBe(1.25);
  });

  it("costs 1 Energy a second while moving, none standing", () => {
    const standing = hasted(50);
    stepFor(standing, 3);
    const still = get(standing, "e").combatant.energy;

    const moving = hasted(50);
    moving.setInputDirection("e", vec2(1, 0));
    stepFor(moving, 3);
    expect(still - get(moving, "e").combatant.energy).toBeCloseTo(3, 0);
  });

  it("keeps running at 0 Energy", () => {
    const sim = hasted(0);
    sim.setInputDirection("e", vec2(1, 0));
    stepFor(sim, 2);
    const e = get(sim, "e").combatant;
    expect(e.energy).toBeLessThan(1);
    expect(e.statuses.has("storm-djinns-haste")).toBe(true);
  });
});

describe("#2446's tooltips", () => {
  it("Healer's Boon spares the favor bonus", () => {
    expect(lines(BOON, new Map([[FAVOR, 12]]))).toContain(
      "heal 50% more, not the Divine Favor bonus",
    );
  });

  it("Light of Dwayna raises the dead", () => {
    expect(lines(LIGHT, new Map())).toBe(
      "Dead party members in the area around you are returned to life with 25% health and 0% energy",
    );
  });
});

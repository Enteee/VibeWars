import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { effectiveArmor, type DamagePacket } from "./damage.js";
import { describeSkill } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import {
  landBlow,
  PLAIN_BLOW,
  resolveSwing,
  weaponSnapshotOf,
  type BlowRule,
} from "./weapon-attack.js";

/**
 * Refusals, crit immunity and faster expiry (#2373): Frigid Armor's
 * "cannot be set on fire", Stone Sheath's "immune to critical hits", and
 * the enchantments and stances that Air of Disenchantment and Mark of
 * Insecurity run out early.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FRIGID = "elementalist.frigid-armor";
const SHEATH = "elementalist.stone-sheath";
const AIR = "mesmer.air-of-disenchantment";
const MARK = "assassin.mark-of-insecurity";
const BAR = [FRIGID, SHEATH, AIR, MARK, "assassin.shadow-refuge"];

const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["elementalist.water-magic", rank],
    ["elementalist.earth-magic", rank],
    ["mesmer.illusion-magic", rank],
    ["assassin.deadly-arts", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, ranks = RANK_12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: team === 0 ? BAR : [],
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `c` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[], ranks = RANK_12): MatchSimulation {
  return new MatchSimulation({
    seed: "refuse-crit-expire",
    participants: [spec("c", 0, vec2(0, 0), ranks), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` casts `skillId` at `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId: string | undefined): CombatEvent[] {
  sim.setTarget("c", targetId);
  const slot = get(sim, "c").skillBar.indexOf(skillId);
  expect(sim.requestSkill("c", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.skillId === skillId); i += 1) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

const remaining = (sim: MatchSimulation, id: string, statusId: StatusId): number | undefined =>
  get(sim, id).combatant.statuses.get(statusId)?.remainingSeconds;

function lines(skillId: string, ranks: ReadonlyMap<string, number> | undefined): string[] {
  return describeSkill(skillOf(skillId), ranks).effects.map(({ text }) => text);
}

describe("the four are the corpus's (#2373)", () => {
  it.each([
    [FRIGID, 1261, "enchantment", false, "elementalist", "elementalist.water-magic", 5, 20],
    [SHEATH, 1373, "enchantment", true, "elementalist", "elementalist.earth-magic", 10, 15],
    [AIR, 1656, "hex", true, "mesmer", "mesmer.illusion-magic", 10, 10],
    [MARK, 570, "hex", true, "assassin", "assassin.deadly-arts", 5, 10],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, profession, attributeId, energy, recharge) => {
      expect(skillOf(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: 1,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
      });
    },
  );
});

describe("Frigid Armor (#2373)", () => {
  const packet = (type: DamagePacket["type"]): DamagePacket => ({
    armored: 50,
    armorIgnoring: 0,
    type,
    source: "weapon",
    armorPenetration: 0,
  });

  it.each([
    [RANK_12, 22, 34],
    [RANK_0, 10, 10],
  ] as const)("lasts %#: %i s, +%i armor against physical damage only", (ranks, seconds, armor) => {
    const sim = match([], ranks);
    const bearer = get(sim, "c").combatant;
    const bare = effectiveArmor(bearer, packet("blunt"), null);
    const fire = effectiveArmor(bearer, packet("fire"), null);
    cast(sim, FRIGID, undefined);
    expect(remaining(sim, "c", "frigid-armor")).toBeCloseTo(seconds, 0);
    expect(effectiveArmor(bearer, packet("blunt"), null)).toBe(bare + armor);
    expect(effectiveArmor(bearer, packet("fire"), null)).toBe(fire);
  });

  it("leaves a Burning on, and keeps a new one off", () => {
    const sim = match([]);
    const bearer = get(sim, "c").combatant;
    bearer.statuses.apply("burning", 5, "f", NO_RANKS);
    cast(sim, FRIGID, undefined);
    expect(bearer.statuses.has("burning")).toBe(true);
    bearer.statuses.remove("burning");
    expect(bearer.statuses.apply("burning", 5, "f", NO_RANKS)).toBe(false);
    expect(bearer.statuses.has("burning")).toBe(false);
  });

  it("reads as GW1 words it", () => {
    expect(lines(FRIGID, RANK_12)).toEqual([
      "Applies Frigid Armor for 22s (+34 physical armor, cannot be set on fire)",
    ]);
  });
});

describe("Stone Sheath (#2373)", () => {
  /** `c` at the origin, ally `a` at 120; foes near `c`, near `a`, near both, and far. */
  function arena(ranks = RANK_12): MatchSimulation {
    return match(
      [
        spec("a", 0, vec2(120, 0), ranks),
        spec("near-c", 1, vec2(-60, 0)),
        spec("both", 1, vec2(60, 0)),
        spec("near-a", 1, vec2(180, 0)),
        spec("far", 1, vec2(400, 0)),
      ],
      ranks,
    );
  }

  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)("sheathes you and your ally %#: %i s", (ranks, seconds) => {
    const sim = arena(ranks);
    cast(sim, SHEATH, "a");
    expect(remaining(sim, "c", "stone-sheath")).toBeCloseTo(seconds, 0);
    expect(remaining(sim, "a", "stone-sheath")).toBeCloseTo(seconds, 0);
  });

  it("strikes each foe near either of you once and Weakens it, the far one not at all", () => {
    const sim = arena();
    const events = cast(sim, SHEATH, "a");
    for (const id of ["near-c", "both", "near-a"]) {
      const hits = events.filter((event) => event.kind === "damage" && event.targetId === id);
      expect(hits, id).toHaveLength(1);
      expect(remaining(sim, id, "weakness"), id).toBeCloseTo(17, 0);
    }
    expect(get(sim, "far").combatant.statuses.has("weakness")).toBe(false);
  });

  it("strikes for 59 at rank 12 and 15 at rank 0, before armor", () => {
    const dealt = (ranks: ReadonlyMap<string, number>): number => {
      const sim = arena(ranks);
      const events = cast(sim, SHEATH, "a");
      return events.reduce(
        (sum, event) =>
          event.kind === "damage" && event.targetId === "both" ? sum + event.amount : sum,
        0,
      );
    };
    expect(dealt(RANK_12) / dealt(RANK_0)).toBeCloseTo(59 / 15, 0);
    expect(remaining(arenaCast(RANK_0), "both", "weakness")).toBeCloseTo(5, 0);
  });

  function arenaCast(ranks: ReadonlyMap<string, number>): MatchSimulation {
    const sim = arena(ranks);
    cast(sim, SHEATH, "a");
    return sim;
  }

  it("gives +24 armor at rank 12 and +1 at rank 0", () => {
    const hit: DamagePacket = {
      armored: 50,
      armorIgnoring: 0,
      type: "fire",
      source: "skill",
      armorPenetration: 0,
    };
    for (const [ranks, armor] of [
      [RANK_12, 24],
      [RANK_0, 1],
    ] as const) {
      const sim = arena(ranks);
      const ally = get(sim, "a").combatant;
      const bare = effectiveArmor(ally, hit, null);
      cast(sim, SHEATH, "a");
      expect(effectiveArmor(ally, hit, null)).toBeCloseTo(bare + armor, 0);
    }
  });

  /** A stream whose damage rolls are `roll` and whose float rolls are `float`. */
  const stream = (roll: number, float: number): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

  function blow(sheathed: boolean, rule: BlowRule, exposed: boolean, rng: SimulationRng): boolean {
    const attacker = makeCombatant({ id: "x", team: 1 });
    const victim = makeCombatant({ id: "v", team: 0, maxHealth: 1000, health: 1000 });
    if (sheathed) {
      victim.statuses.apply("stone-sheath", 17, "c", RANK_12);
    }
    return landBlow(
      weaponSnapshotOf(attacker),
      attacker,
      victim,
      rule,
      exposed,
      rng,
      RULES.combat,
      [],
      new Map(),
    );
  }

  it("lets no blow on its bearer crit: rolled, always, or on an exposed foe", () => {
    const always: BlowRule = { ...PLAIN_BLOW, criticalWhen: "always" };
    const crits = (sheathed: boolean): boolean[] => [
      blow(sheathed, PLAIN_BLOW, false, stream(10, 0)),
      blow(sheathed, always, false, stream(10, 0.99)),
      blow(sheathed, PLAIN_BLOW, true, stream(10, 0.99)),
    ];
    expect(crits(false)).toEqual([true, true, true]);
    expect(crits(true)).toEqual([false, false, false]);
  });

  it("still draws the crit roll, so the stream does not move", () => {
    const counted = (sheathed: boolean): number => {
      let floats = 0;
      const rng = createRng(7);
      const next = rng.nextFloat.bind(rng);
      blow(
        sheathed,
        PLAIN_BLOW,
        false,
        Object.assign(rng, {
          nextFloat: () => {
            floats += 1;
            return Math.max(next(), 0.99);
          },
        }),
      );
      return floats;
    };
    expect(counted(true)).toBe(counted(false));
    expect(counted(true)).toBeGreaterThan(0);
  });

  it("fires nothing that rides a crit: Critical Eye's Energy is not gained", () => {
    const energyAfter = (sheathed: boolean): number => {
      const attacker: Combatant = makeCombatant({ id: "x", team: 1, energy: 0, maxEnergy: 50 });
      attacker.statuses.apply("critical-eye", 30, "x", NO_RANKS);
      const victim = makeCombatant({ id: "v", team: 0, maxHealth: 1000, health: 1000 });
      if (sheathed) {
        victim.statuses.apply("stone-sheath", 17, "c", RANK_12);
      }
      resolveSwing({
        attacker,
        target: { combatant: victim, position: vec2(40, 0), creature: undefined },
        surroundings: new Map(),
        rng: stream(10, 0),
        rules: RULES.combat,
        exposed: () => false,
      });
      return attacker.energy;
    };
    expect(energyAfter(false)).toBeGreaterThan(0);
    expect(energyAfter(true)).toBe(0);
  });

  it("reads as GW1 words it", () => {
    expect(lines(SHEATH, RANK_12)[0]).toBe(
      "Applies Stone Sheath for 17s (+24 armor, immune to critical hits)",
    );
  });
});

describe("Air of Disenchantment (#2373)", () => {
  /** Foe `t` at 300, `n` beside it, `far` well away: each enchanted twice. */
  function arena(ranks = RANK_12): MatchSimulation {
    const sim = match(
      [spec("t", 1, vec2(300, 0)), spec("n", 1, vec2(340, 0)), spec("far", 1, vec2(600, 0))],
      ranks,
    );
    for (const id of ["t", "n", "far"]) {
      const { statuses } = get(sim, id).combatant;
      statuses.apply("gust", 60, id, NO_RANKS);
      statuses.apply("frigid-armor", 60, id, NO_RANKS);
    }
    return sim;
  }
  const enchantments = (sim: MatchSimulation, id: string): number =>
    get(sim, id).combatant.statuses.active.filter(({ id: statusId }) =>
      ["gust", "frigid-armor"].includes(statusId),
    ).length;

  it.each([
    [RANK_12, 17],
    [RANK_0, 5],
  ] as const)(
    "takes one enchantment off its target and the foes near it, and hexes them %#: %i s",
    (ranks, seconds) => {
      const sim = arena(ranks);
      cast(sim, AIR, "t");
      for (const id of ["t", "n"]) {
        expect(enchantments(sim, id), id).toBe(1);
        expect(remaining(sim, id, "air-of-disenchantment"), id).toBeCloseTo(seconds, 0);
      }
      expect(enchantments(sim, "far")).toBe(2);
      expect(get(sim, "far").combatant.statuses.has("air-of-disenchantment")).toBe(false);
    },
  );

  it("reads as GW1 words it", () => {
    expect(lines(AIR, RANK_12).join(" | ")).toContain(
      "enchantments on the bearer expire 270% faster",
    );
  });
});

describe("Mark of Insecurity (#2373)", () => {
  function arena(ranks = RANK_12): MatchSimulation {
    const sim = match([spec("t", 1, vec2(300, 0))], ranks);
    cast(sim, MARK, "t");
    return sim;
  }

  it.each([
    [RANK_12, 21],
    [RANK_0, 5],
  ] as const)("hexes its target %#: %i s", (ranks, seconds) => {
    expect(remaining(arena(ranks), "t", "mark-of-insecurity")).toBeCloseTo(seconds, 0);
  });

  it("disables the caster's non-Assassin skills for 5 s, its Assassin ones not", () => {
    const sim = arena();
    const { rechargeRemaining } = get(sim, "c").combatant.cast;
    for (const id of [FRIGID, SHEATH, AIR]) {
      expect(rechargeRemaining.get(id), id).toBeCloseTo(5, 0);
    }
    expect(rechargeRemaining.has("assassin.shadow-refuge")).toBe(false);
  });

  it("reads as GW1 words it", () => {
    expect(lines(MARK, RANK_12).join(" | ")).toContain(
      "enchantments and stances on the bearer expire 52% faster",
    );
  });
});

describe("pulses keep real time while a status runs out faster (#2373)", () => {
  const CONDITIONS: readonly StatusId[] = ["bleeding", "poison", "blind", "weakness", "dazed"];

  /** A clock from now: steps `sim` on to `seconds` from now, a tick at a time. */
  function clock(sim: MatchSimulation, log: CombatLogEntry[] = []): (seconds: number) => void {
    let ticks = 0;
    return (seconds) => {
      for (; ticks < Math.round(seconds / DT); ticks += 1) {
        log.push(...sim.step(DT).log);
      }
    };
  }

  it("Spotless Soul under Air of Disenchantment: one condition at 3 s, gone by 4.05 s", () => {
    const sim = match([spec("t", 1, vec2(300, 0))]);
    cast(sim, AIR, "t");
    const { statuses } = get(sim, "t").combatant;
    for (const id of CONDITIONS) {
      statuses.apply(id, 60, "c", RANK_12);
    }
    statuses.apply("spotless-soul", 15, "t", RANK_12);
    const stepTo = clock(sim);
    const conditions = (): number =>
      statuses.active.filter(({ id }) => CONDITIONS.includes(id)).length;

    stepTo(2.9);
    expect(conditions()).toBe(5);
    stepTo(3.1);
    expect(conditions()).toBe(4);
    // 15 s at 370%.
    stepTo(4);
    expect(statuses.has("spotless-soul")).toBe(true);
    stepTo(4.1);
    expect(statuses.has("spotless-soul")).toBe(false);
    expect(conditions()).toBe(4);
  });

  it("Illusion of Pain under Peace and Harmony: a pulse each real second, none past its end", () => {
    const sim = match([spec("t", 1, vec2(300, 0))]);
    const { statuses } = get(sim, "t").combatant;
    statuses.apply("peace-and-harmony", 60, "t", RANK_12);
    statuses.apply("illusion-of-pain", 10, "c", RANK_12);
    const log: CombatLogEntry[] = [];
    // 10 s at 190% is 5.26 s: pulses at 1 to 5.
    clock(sim, log)(6);
    expect(statuses.has("illusion-of-pain")).toBe(false);
    const pulses = log.filter(
      (entry) =>
        entry.skillId === "mesmer.illusion-of-pain" &&
        entry.events.some((event) => event.kind === "damage" && event.targetId === "t"),
    );
    expect(pulses).toHaveLength(5);
  });
});

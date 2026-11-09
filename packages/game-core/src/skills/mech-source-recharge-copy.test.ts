import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { energyCostOf } from "./activation.js";
import { copyKey, slotSkill } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { resolveMagnitudeAtRanks, statAt } from "./scaling.js";
import { aggregateModifiers, getStatusDefinition, ownSkillBoost, StatusSet } from "./status.js";
import { makeCombatant } from "./testing.js";
import { attackDamageDeltaOf } from "./tick.js";
import type { Combatant, Magnitude, Skill } from "./types.js";
import { sourceAttacksOn } from "./weapon-attack.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Mechanics (#2502): hexes that favour their source's attacks, recharging
 * by skill type and profession, reclaiming your own spirits, a next-spell
 * rule's scaled recharge and Energy, a scaled copy-elite and an elite
 * borrowing. Each skill's corpus numbers, its scaled numbers at rank 0
 * and rank 12, and one behaviour.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SIPHON = "assassin.siphon-strength";
const BURDEN = "assassin.shadowy-burden";
const LINGWAH = "ritualist.anguished-was-lingwah";
const RECLAIM = "ritualist.reclaim-essence";
const AUSPICIOUS = "mesmer.auspicious-incantation";
const SYMBOLS = "mesmer.symbols-of-inspiration";

const DULLED = "ritualist.dulled-weapon";
const BLOODSONG = "ritualist.bloodsong";
const FIREBALL = "elementalist.fireball";
const SURGE = "elementalist.lightning-surge";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the six are the corpus's (#2502)", () => {
  it.each([
    [SIPHON, 827, "hex", true, "assassin.deadly-arts", 10, 1, 10, "single-enemy"],
    [BURDEN, 950, "hex", false, "assassin.shadow-arts", 10, 0.25, 15, "single-enemy"],
    [LINGWAH, 1223, "item-spell", false, "ritualist.spawning-power", 5, 1.5, 30, "self"],
    [RECLAIM, 1482, "spell", true, "ritualist.spawning-power", 5, 1, 30, "self"],
    [AUSPICIOUS, 930, "enchantment", false, "mesmer.inspiration-magic", 5, 1, 20, "self"],
    [SYMBOLS, 1339, "skill", true, "mesmer.fast-casting", 5, 1, 10, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

/** Ranks of one attribute at `rank`. */
function at(attributeId: string, rank: number): ReadonlyMap<string, number> {
  return new Map([[attributeId, rank]]);
}

const deadly = (rank: number) => at("assassin.deadly-arts", rank);
const shadow = (rank: number) => at("assassin.shadow-arts", rank);
const spawning = (rank: number) => at("ritualist.spawning-power", rank);
const inspiration = (rank: number) => at("mesmer.inspiration-magic", rank);
const fast = (rank: number) => at("mesmer.fast-casting", rank);

/** The first `apply-status` of `id`'s: its duration magnitude. */
function duration(id: string): Magnitude {
  const apply = skill(id).effects.find((effect) => effect.kind === "apply-status");
  if (apply?.kind !== "apply-status") {
    throw new Error(`${id} applies no status`);
  }
  return apply.durationSeconds;
}

describe("scaled numbers at rank 0 and rank 12 (#2502)", () => {
  it.each([
    [SIPHON, deadly, 5, 17],
    [BURDEN, shadow, 3, 13],
    [LINGWAH, spawning, 10, 50],
    [AUSPICIOUS, inspiration, 20, 20],
    [SYMBOLS, fast, 6, 33],
  ] as const)("%s lasts %i s at 0, %i s at 12", (id, ranks, zero, twelve) => {
    expect(resolveMagnitudeAtRanks(duration(id), ranks(0))).toBe(zero);
    expect(resolveMagnitudeAtRanks(duration(id), ranks(12))).toBe(twelve);
  });

  it("Siphon Strength: -5 damage at 0, -41 at 12, and its source's crits 50% likelier", () => {
    for (const [rank, delta] of [
      [0, -5],
      [12, -41],
    ] as const) {
      const foe = makeCombatant({ id: "f", team: 1 });
      foe.statuses.apply("siphon-strength", 17, "a", deadly(rank));
      expect(attackDamageDeltaOf(foe)).toBe(delta);
      expect(sourceAttacksOn(foe, "a").criticalChanceBonus).toBe(0.5);
    }
  });

  it("Shadowy Burden: 25% slower, and 20 less armor against its source at 0, 28 at 12", () => {
    for (const [rank, armor] of [
      [0, -20],
      [12, -28],
    ] as const) {
      const foe = makeCombatant({ id: "f", team: 1 });
      foe.statuses.apply("shadowy-burden", 13, "a", shadow(rank));
      expect(sourceAttacksOn(foe, "a").armorModifier).toBe(armor);
      expect(aggregateModifiers(foe.statuses.active).moveSpeedMultiplier).toBeCloseTo(0.75);
    }
  });

  it("Lingwah: Ritualist hexes 1 Energy cheaper at 0, 4 at 12, and 50% longer", () => {
    const dulled = skill(DULLED);
    for (const [rank, cost] of [
      [0, 14],
      [12, 11],
    ] as const) {
      const holder = makeCombatant({ id: "r", attributeRanks: spawning(rank) });
      holder.statuses.apply("anguished-was-lingwah", 50, "r", spawning(rank));
      expect(energyCostOf(dulled, holder)).toBe(cost);
      expect(ownSkillBoost(holder.statuses.active, dulled).durationMultiplier).toBe(1.5);
      // A Mesmer hex is no Ritualist hex.
      expect(energyCostOf(skill("mesmer.empathy"), holder)).toBe(
        skill("mesmer.empathy").cost?.amount,
      );
    }
  });

  it("Reclaim Essence: 5 Energy at 0, 17 at 12", () => {
    const gain = skill(RECLAIM).effects.flatMap((effect) =>
      effect.kind === "if" ? effect.effects.filter((inner) => inner.kind === "energy-gain") : [],
    );
    expect(gain).toHaveLength(1);
    const [energy] = gain;
    if (energy?.kind !== "energy-gain") {
      throw new Error("no gain");
    }
    expect(resolveMagnitudeAtRanks(energy.amount, spawning(0))).toBe(5);
    expect(resolveMagnitudeAtRanks(energy.amount, spawning(12))).toBe(17);
  });

  it("Auspicious Incantation: 10 s longer and 110% at 0, 6 s and 182% at 12", () => {
    const rule = getStatusDefinition("auspicious-incantation").nextSkillRule;
    if (rule === undefined) {
      throw new Error("no rule");
    }
    expect(statAt(rule.extraRechargeSeconds, inspiration(0))).toBe(10);
    expect(statAt(rule.extraRechargeSeconds, inspiration(12))).toBe(6);
    expect(statAt(rule.energyGainOfCost, inspiration(0))).toBeCloseTo(1.1);
    expect(statAt(rule.energyGainOfCost, inspiration(12))).toBeCloseTo(1.82);
  });

  it("Symbols of Inspiration: the copy lasts 6 s at 0, 33 s at 12", () => {
    const [copy] = skill(SYMBOLS).effects;
    if (copy?.kind !== "copy-elite") {
      throw new Error("no copy");
    }
    expect(resolveMagnitudeAtRanks(copy.seconds, fast(0))).toBe(6);
    expect(resolveMagnitudeAtRanks(copy.seconds, fast(12))).toBe(33);
  });
});

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  ranks: [string, number][] = [],
): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map(ranks),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A spirit of `ownerId`'s already standing, as `#summon` would make it. */
function spirit(id: string, ownerId: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...spec(id, team, spawn, []),
    creature: {
      ownerId,
      kind: "spirit",
      look: "spirit",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
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
  };
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

/** `id` uses `skillId` at `targetId`, through its cast and aftercast: everything logged. */
function use(
  sim: MatchSimulation,
  id: string,
  skillId: string,
  targetId: string | undefined,
): CombatLogEntry[] {
  sim.setTarget(id, targetId);
  const slot = get(sim, id).skillBar.indexOf(skillId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, 3);
}

function eventsOf(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

describe("Siphon Strength and Shadowy Burden (#2502)", () => {
  it("Siphon Strength gives only its own source the crit chance", () => {
    const foe = makeCombatant({ id: "f", team: 1 });
    foe.statuses.apply("siphon-strength", 17, "a", deadly(12));
    expect(sourceAttacksOn(foe, "b").criticalChanceBonus).toBe(0);
  });

  it("Shadowy Burden's armor penalty is back once the other hex ends", () => {
    const set = new StatusSet();
    const foe: Combatant = makeCombatant({ id: "f", team: 1, statuses: set });
    set.apply("shadowy-burden", 13, "a", shadow(12));
    set.apply("dulled-weapon", 2, "c", spawning(12));
    expect(sourceAttacksOn(foe, "a").armorModifier).toBe(0);
    for (let i = 0; i < 30; i += 1) {
      set.advance(0.1, false);
    }
    expect(set.has("dulled-weapon")).toBe(false);
    expect(set.has("shadowy-burden")).toBe(true);
    expect(sourceAttacksOn(foe, "a").armorModifier).toBe(-28);
  });
});

describe("Anguished Was Lingwah (#2502)", () => {
  it("dropped early, recharges every Ritualist hex, and no other skill", () => {
    const sim = new MatchSimulation({
      seed: "lingwah",
      participants: [
        spec(
          "r",
          0,
          vec2(0, 0),
          [LINGWAH, DULLED, BLOODSONG],
          [
            ["ritualist.spawning-power", 12],
            ["ritualist.communing", 12],
          ],
        ),
        spec("x", 1, vec2(300, 0), []),
      ],
    });
    use(sim, "r", LINGWAH, undefined);
    use(sim, "r", DULLED, "x");
    const r = get(sim, "r").combatant;
    r.cast.startRecharge(BLOODSONG, 30);
    expect(r.cast.isRecharging(DULLED)).toBe(true);
    // The hex lasts 50% longer: 17 s of Dulled Weapon held for 25.5.
    expect(get(sim, "x").combatant.statuses.get("dulled-weapon")?.durationSeconds).toBeCloseTo(
      25.5,
    );
    sim.dropBundle("r");
    stepFor(sim, 0.1);
    expect(r.statuses.has("anguished-was-lingwah")).toBe(false);
    expect(r.cast.isRecharging(DULLED)).toBe(false);
    expect(r.cast.isRecharging(BLOODSONG)).toBe(true);
  });
});

describe("Reclaim Essence (#2502)", () => {
  function reclaim(spirits: readonly ParticipantSpec[]): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "reclaim-essence",
      participants: [
        spec("r", 0, vec2(0, 0), [RECLAIM, BLOODSONG], [["ritualist.spawning-power", 12]]),
        spec("a", 0, vec2(0, 200), []),
        ...spirits,
      ],
    });
    const r = get(sim, "r").combatant;
    r.energy = 20;
    r.cast.startRecharge(BLOODSONG, 30);
    return sim;
  }

  it("with a spirit of its own killed: 17 Energy, and every binding ritual recharged", () => {
    const sim = reclaim([
      spirit("mine", "r", 0, vec2(4000, 0)),
      spirit("allys", "a", 0, vec2(50, 0)),
    ]);
    const events = eventsOf(use(sim, "r", RECLAIM, undefined), RECLAIM);
    expect(events).toContainEqual({ kind: "creature-destroyed", targetId: "mine" });
    expect(sim.get("allys")).toBeDefined();
    expect(events).toContainEqual({ kind: "energy-gain", targetId: "r", amount: 17 });
    expect(get(sim, "r").combatant.cast.isRecharging(BLOODSONG)).toBe(false);
  });

  it("with none: no Energy, no recharge, but it is cast and recharges", () => {
    const sim = reclaim([spirit("allys", "a", 0, vec2(50, 0))]);
    const events = eventsOf(use(sim, "r", RECLAIM, undefined), RECLAIM);
    expect(events.filter((event) => event.kind === "energy-gain")).toEqual([]);
    const r = get(sim, "r").combatant;
    expect(r.cast.isRecharging(BLOODSONG)).toBe(true);
    expect(r.cast.isRecharging(RECLAIM)).toBe(true);
  });
});

describe("Auspicious Incantation (#2502)", () => {
  it("the next spell gives 182% of its cost back and recharges 6 s longer, at 12", () => {
    const sim = new MatchSimulation({
      seed: "auspicious",
      participants: [
        spec(
          "m",
          0,
          vec2(0, 0),
          [AUSPICIOUS, FIREBALL],
          [
            ["mesmer.inspiration-magic", 12],
            ["elementalist.fire-magic", 12],
          ],
        ),
        spec("x", 1, vec2(300, 0), []),
      ],
    });
    use(sim, "m", AUSPICIOUS, undefined);
    const m = get(sim, "m").combatant;
    m.energy = 30;
    const log = use(sim, "m", FIREBALL, "x");
    // Fireball's 10: 18.2, 18 back.
    expect(eventsOf(log, AUSPICIOUS)).toContainEqual({
      kind: "energy-gain",
      targetId: "m",
      amount: 18,
    });
    expect(m.cast.rechargeTotal.get(FIREBALL)).toBe(skill(FIREBALL).rechargeSeconds + 6);
    expect(m.statuses.has("auspicious-incantation")).toBe(false);
  });
});

describe("Symbols of Inspiration (#2502)", () => {
  it("becomes the foe's elite, and lends Fast Casting to elites used after it", () => {
    const sim = new MatchSimulation({
      seed: "symbols",
      participants: [
        spec("m", 0, vec2(0, 0), [SYMBOLS], [["mesmer.fast-casting", 12]]),
        spec("x", 1, vec2(300, 0), [SURGE]),
      ],
    });
    const m = get(sim, "m").combatant;
    // Symbols is elite but of Fast Casting: it borrows nothing for itself.
    m.statuses.apply("symbols-of-inspiration", 30, "m", fast(12));
    expect(m.statuses.borrowedFor(skill(SYMBOLS))).toBeUndefined();
    m.statuses.remove("symbols-of-inspiration");
    use(sim, "m", SYMBOLS, "x");
    expect(slotSkill(m.skillBar, m.cast, 0)).toEqual({ skillId: SURGE, key: copyKey(SURGE, 0) });
    expect(m.statuses.has("symbols-of-inspiration")).toBe(true);
    expect(m.statuses.borrowedFor(skill(SURGE))).toBe("symbols-of-inspiration");
  });
});

describe("the tooltips say it (#2502)", () => {
  it.each([
    ["siphon-strength", deadly(12), "your attacks against it have +50% critical chance"],
    ["shadowy-burden", shadow(12), "−28 armor against your attacks while it has no other hexes"],
    ["anguished-was-lingwah", spawning(12), "Ritualist hexes cost 4 less Energy"],
    ["auspicious-incantation", inspiration(12), "takes 6s longer to recharge"],
    ["auspicious-incantation", inspiration(12), "you gain 182% of its Energy cost"],
  ] as const)("%s: %s", (id, ranks, text) => {
    expect(describeStatus(id, ranks, EN_WORDS, EN_NAMES)).toContain(text);
  });

  it("Reclaim Essence and Lingwah's drop name what they recharge", () => {
    expect(
      describeSkill(skill(RECLAIM), undefined, EN_WORDS, EN_NAMES)
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("recharges all your binding rituals");
    expect(describeStatus("anguished-was-lingwah", undefined, EN_WORDS, EN_NAMES)).toContain(
      "Ritualist hexes",
    );
  });
});

import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { energyCostOf } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import {
  aggregateModifiers,
  getStatusDefinition,
  NO_RANKS,
  ownSkillBoost,
  StatusSet,
  type StatusId,
} from "./status.js";
import { makeCombatant } from "./testing.js";
import { attackDamageDeltaOf, effectiveActivationSeconds } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mechanics (#2501): statuses renewed by an event or reapplied while
 * another hex holds, `whileUnder` damage and speed, a share of the base
 * cost off, and own-skill filters for half range, self target and no
 * flash. Each skill's corpus numbers, its scaled numbers at rank 0 and
 * rank 12, and one behaviour.
 */

const RECURRING = "mesmer.recurring-insecurity";
const STORMS = "ranger.storms-embrace";
const VOW = "dervish.vow-of-piety";
const SPIRITS = "ritualist.spirits-strength";
const SOLDIERS = "warrior.soldiers-speed";
const SONGKAI = "ritualist.attuned-was-songkai";
const MEMORIES = "ritualist.renewing-memories";
const DEADLY = "assassin.deadly-haste";
const MYSTIC = "dervish.signet-of-mystic-speed";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the nine are the corpus's (#2501)", () => {
  it.each([
    [RECURRING, 1055, "hex", true, "mesmer.illusion-magic", 10, 1, 3, "single-enemy"],
    [STORMS, 1474, "stance", false, undefined, 5, 0, 30, "self"],
    [VOW, 1505, "enchantment", false, "dervish.wind-prayers", 15, 0.25, 45, "self"],
    [SPIRITS, 1736, "enchantment", true, "ritualist.spawning-power", 5, 1, 20, "self"],
    [SOLDIERS, 2196, "stance", false, "warrior.tactics", 5, 0, 12, "self"],
    [SONGKAI, 1220, "item-spell", true, "ritualist.spawning-power", 10, 1.5, 30, "self"],
    [MEMORIES, 1739, "enchantment", false, "ritualist.spawning-power", 5, 1, 20, "self"],
    [DEADLY, 1638, "enchantment", false, "assassin.critical-strikes", 5, 1, 20, "self"],
    [MYSTIC, 2200, "signet", false, "dervish.wind-prayers", 0, 1, 20, "self"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

/** `id`'s scaled numbers name one attribute: its ranks at `rank`. */
function at(attributeId: string, rank: number): ReadonlyMap<string, number> {
  return new Map([[attributeId, rank]]);
}

const illusion = (rank: number) => at("mesmer.illusion-magic", rank);
const wind = (rank: number) => at("dervish.wind-prayers", rank);
const spawning = (rank: number) => at("ritualist.spawning-power", rank);
const critical = (rank: number) => at("assassin.critical-strikes", rank);

/** Seconds `id` has left on `set`. */
function left(set: StatusSet, id: StatusId): number | undefined {
  return set.get(id)?.remainingSeconds;
}

/** Advance `set` by `seconds`, in 0.1 s ticks, standing still. */
function advance(set: StatusSet, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 10); i += 1) {
    set.advance(0.1, false);
  }
}

describe("Recurring Insecurity (#2501)", () => {
  it("degenerates 1 Health pip at rank 0 and 5 at rank 12", () => {
    for (const [rank, pips] of [
      [0, -1],
      [12, -5],
    ] as const) {
      const set = new StatusSet();
      set.apply("recurring-insecurity", 5, "m", illusion(rank));
      expect(aggregateModifiers(set.active).healthPips).toBe(pips);
    }
  });

  it("is reapplied while the foe has another hex, and ends once it has none", () => {
    const set = new StatusSet();
    set.apply("recurring-insecurity", 5, "m", illusion(12));
    set.apply("images-of-remorse", 12, "m", illusion(12));
    advance(set, 11);
    expect(left(set, "recurring-insecurity")).toBeGreaterThan(0);
    advance(set, 5);
    expect(set.has("images-of-remorse")).toBe(false);
    expect(set.has("recurring-insecurity")).toBe(false);
  });

  it("is reapplied when the other hex ends in the same tick", () => {
    const set = new StatusSet();
    set.apply("recurring-insecurity", 5, "m", illusion(12));
    set.apply("images-of-remorse", 5, "m", illusion(12));
    advance(set, 5.05);
    expect(set.has("images-of-remorse")).toBe(false);
    expect(left(set, "recurring-insecurity")).toBeGreaterThan(4.5);
  });

  it("ends for good when it is removed", () => {
    const set = new StatusSet();
    set.apply("recurring-insecurity", 5, "m", illusion(12));
    set.apply("images-of-remorse", 20, "m", illusion(12));
    set.remove("recurring-insecurity");
    advance(set, 6);
    expect(set.has("recurring-insecurity")).toBe(false);
  });
});

describe("Storm's Embrace (#2501)", () => {
  it("moves 25% faster and is refreshed by elemental damage above 0", () => {
    const set = new StatusSet();
    set.apply("storms-embrace", 10, "r", NO_RANKS);
    expect(aggregateModifiers(set.active).moveSpeedMultiplier).toBeCloseTo(1.25);
    advance(set, 6);
    set.recordElementalDamage(0);
    expect(left(set, "storms-embrace")).toBeCloseTo(4);
    set.recordElementalDamage(12);
    expect(left(set, "storms-embrace")).toBe(10);
  });
});

describe("Vow of Piety (#2501)", () => {
  it("gives +24 armor and 1 Health pip at rank 0, 3 at rank 12", () => {
    for (const [rank, pips] of [
      [0, 1],
      [12, 3],
    ] as const) {
      const set = new StatusSet();
      set.apply("vow-of-piety", 20, "d", wind(rank));
      expect(aggregateModifiers(set.active)).toMatchObject({ armorModifier: 24, healthPips: pips });
    }
  });

  it("renews whenever another enchantment on the bearer ends, once for several at once", () => {
    const set = new StatusSet();
    set.apply("vow-of-piety", 20, "d", wind(12));
    set.apply("kinetic-armor", 5, "d", NO_RANKS);
    set.apply("lyssas-haste", 5, "d", NO_RANKS);
    advance(set, 10);
    expect(set.has("kinetic-armor")).toBe(false);
    expect(left(set, "vow-of-piety")).toBeCloseTo(15, 0);
    set.remove("vow-of-piety");
    expect(set.has("vow-of-piety")).toBe(false);
  });
});

/** A Ritualist at Spawning Power `rank`, wearing `statuses` at that rank. */
function ritualist(rank: number, ...statuses: StatusId[]): Combatant {
  const caster = makeCombatant({ id: "r", team: 0, attributeRanks: spawning(rank) });
  caster.energy = 50;
  for (const id of statuses) {
    caster.statuses.apply(id, 30, "r", spawning(rank));
  }
  return caster;
}

describe("Spirit's Strength (#2501)", () => {
  it("adds 5 damage to attacks at rank 0 and 29 at rank 12, only under a weapon spell", () => {
    for (const [rank, more] of [
      [0, 5],
      [12, 29],
    ] as const) {
      const bare = ritualist(rank, "splinter-weapon");
      const strong = ritualist(rank, "splinter-weapon", "spirits-strength");
      expect(attackDamageDeltaOf(strong) - attackDamageDeltaOf(bare)).toBe(more);
    }
    expect(attackDamageDeltaOf(ritualist(12, "spirits-strength"))).toBe(0);
  });
});

describe("Soldier's Speed (#2501)", () => {
  it("moves 15% faster, and 15% more again under a shout", () => {
    const set = new StatusSet();
    set.apply("soldiers-speed", 15, "w", NO_RANKS);
    expect(aggregateModifiers(set.active).moveSpeedMultiplier).toBeCloseTo(1.15);
    const shout = new StatusSet();
    shout.apply("call-of-protection", 15, "w", NO_RANKS);
    set.apply("call-of-protection", 15, "w", NO_RANKS);
    expect(
      aggregateModifiers(set.active).moveSpeedMultiplier /
        aggregateModifiers(shout.active).moveSpeedMultiplier,
    ).toBeCloseTo(1.15 * 1.15);
  });

  it("lasts 3 s at Tactics 0 and 15 s at 12", () => {
    const [apply] = skill(SOLDIERS).effects;
    expect(apply).toMatchObject({
      durationSeconds: { scaling: { attributeId: "warrior.tactics", atZero: 3, atTwelve: 15 } },
    });
  });
});

describe("Attuned Was Songkai and Renewing Memories (#2501)", () => {
  const flare = skill("elementalist.flare");
  const searing = skill("elementalist.searing-heat");
  const empowerment = skill("ritualist.empowerment");
  const warding = skill("ritualist.weapon-of-warding");
  const kaolai = skill("ritualist.protective-was-kaolai");

  it("Songkai takes 5% of the base cost off spells and binding rituals at rank 0, 41% at 12", () => {
    expect(energyCostOf(searing, ritualist(0, "attuned-was-songkai"))).toBe(14);
    expect(energyCostOf(searing, ritualist(12, "attuned-was-songkai"))).toBe(9);
    expect(energyCostOf(empowerment, ritualist(12, "attuned-was-songkai"))).toBe(3);
    // 41% of 5 is 2.05: 2 off, never below 1.
    expect(energyCostOf(flare, ritualist(12, "attuned-was-songkai"))).toBe(3);
  });

  it("Renewing Memories cuts weapon and item spells 5% at rank 0, 29% at 12, only holding an item", () => {
    expect(energyCostOf(warding, ritualist(12, "renewing-memories"))).toBe(10);
    expect(energyCostOf(warding, ritualist(12, "renewing-memories", "attuned-was-songkai"))).toBe(
      3,
    );
    expect(energyCostOf(kaolai, ritualist(12, "renewing-memories", "protective-was-kaolai"))).toBe(
      7,
    );
    // 5% of 10 is 0.5: rounded half up, 1 off.
    expect(energyCostOf(kaolai, ritualist(0, "renewing-memories", "protective-was-kaolai"))).toBe(
      9,
    );
    expect(energyCostOf(searing, ritualist(12, "renewing-memories", "protective-was-kaolai"))).toBe(
      15,
    );
  });
});

describe("Deadly Haste (#2501)", () => {
  const daggers = skill("assassin.dancing-daggers");
  const flare = skill("elementalist.flare");

  function hasted(rank: number): Combatant {
    const caster = makeCombatant({ id: "a", team: 0, attributeRanks: critical(rank) });
    caster.statuses.apply("deadly-haste", 30, "a", critical(rank));
    return caster;
  }

  it("half-ranged spells cast 5% and recharge 5% faster at rank 0, 41% and 49% at 12", () => {
    expect(daggers.range).toBe(RANGE_SPELL / 2);
    for (const [rank, activation, recharge] of [
      [0, 0.95, 0.05],
      [12, 0.59, 0.49],
    ] as const) {
      const caster = hasted(rank);
      expect(effectiveActivationSeconds(daggers, caster)).toBeCloseTo(activation);
      expect(ownSkillBoost(caster.statuses.active, daggers).rechargeFaster).toBeCloseTo(recharge);
    }
    expect(effectiveActivationSeconds(flare, hasted(12))).toBe(flare.activationSeconds);
  });
});

describe("Signet of Mystic Speed (#2501)", () => {
  const kinetic = skill("elementalist.kinetic-armor");
  const guardian = skill("monk.guardian");
  const lyssas = skill("dervish.lyssas-haste");

  it("the next 1 self-targeting enchantment at rank 0, 3 at rank 12, cast instantly", () => {
    for (const [rank, uses] of [
      [0, 1],
      [12, 3],
    ] as const) {
      const caster = makeCombatant({ id: "d", team: 0 });
      caster.statuses.apply("signet-of-mystic-speed", 30, "d", wind(rank));
      expect(effectiveActivationSeconds(kinetic, caster)).toBe(0);
      expect(effectiveActivationSeconds(guardian, caster)).toBe(guardian.activationSeconds);
      // A flash enchantment uses none of them up.
      caster.statuses.useOwnSkillModifiers(lyssas);
      for (let i = 0; i < uses; i += 1) {
        expect(caster.statuses.has("signet-of-mystic-speed")).toBe(true);
        caster.statuses.useOwnSkillModifiers(kinetic);
      }
      expect(caster.statuses.has("signet-of-mystic-speed")).toBe(false);
    }
  });
});

describe("the tooltips say it (#2501)", () => {
  it.each([
    ["recurring-insecurity", illusion(12), "reapplied as it would end while it has another hex"],
    ["storms-embrace", NO_RANKS, "renewed whenever you take elemental damage"],
    ["vow-of-piety", wind(12), "renewed whenever an enchantment on you ends"],
    ["spirits-strength", spawning(12), "while under a weapon-spell: attacks deal 29 more damage"],
    ["soldiers-speed", NO_RANKS, "while under a chant or shout: moves 15% faster"],
    ["attuned-was-songkai", spawning(12), "your spells cost 41% less Energy"],
    ["renewing-memories", spawning(12), "while holding an item, your weapon spells cost 29%"],
    ["deadly-haste", critical(12), "your half-ranged spells cast 41% faster"],
    ["signet-of-mystic-speed", wind(12), "your next 3 enchantments that target you"],
  ] as const)("%s", (id, ranks, text) => {
    expect(getStatusDefinition(id).name).not.toBe("");
    expect(describeStatus(id, ranks)).toContain(text);
  });
});

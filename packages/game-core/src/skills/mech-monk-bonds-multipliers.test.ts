import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { applyAttackDamage, applyDamage, applyEffects, type CombatEvent } from "./effects.js";
import { aggregateModifiers, getStatusDefinition, ownSkillBoost, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { healingMultiplierOf } from "./tick.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * Life Bond, Life Attunement, Aura of Faith, Enchanter's Conundrum and
 * Peace and Harmony (#2291): a bond on attacks less a reduction, healing
 * and activation multipliers by rank, and hexes that run out faster. The
 * corpus's numbers, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const ATTRIBUTES = [
  "monk.protection-prayers",
  "monk.divine-favor",
  "monk.smiting-prayers",
  "mesmer.domination-magic",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, floors: 1, layer: 0, creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `statusId` on a fresh ally, put there by a monk at `rank`. */
function bearing(statusId: StatusId, rank: number): Combatant {
  const ally = makeCombatant({ id: "a", team: 0, health: 1000, maxHealth: 1000 });
  ally.statuses.apply(statusId, 30, "monk", ranked(rank));
  ally.statuses.drainChanges();
  return ally;
}

function redirected(bearer: Combatant): unknown[] {
  return bearer.statuses.drainChanges().filter((change) => change.kind === "redirected-damage");
}

describe("the five are the corpus's (#2291)", () => {
  it.each([
    ["monk.life-bond", 241, "enchantment", "monk.protection-prayers", 10, 2, 0, false],
    ["monk.life-attunement", 244, "enchantment", "monk.protection-prayers", 10, 2, 0, false],
    ["monk.aura-of-faith", 260, "enchantment", "monk.protection-prayers", 5, 0.25, 8, true],
    ["mesmer.enchanters-conundrum", 1345, "hex", "mesmer.domination-magic", 10, 2, 20, true],
    ["monk.peace-and-harmony", 266, "enchantment", "monk.divine-favor", 5, 0.25, 15, true],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
      });
    },
  );

  it("Life Bond cannot target its caster; the bonds are maintained", () => {
    expect(skill("monk.life-bond").target).toBe("single-other-ally");
    expect(skill("monk.life-bond").effects[0]?.kind).toBe("maintain-status");
    expect(skill("monk.life-attunement").effects[0]?.kind).toBe("maintain-status");
  });
});

describe("Life Bond (#2291)", () => {
  it.each([
    [12, 25],
    [0, 47],
  ])("at rank %i, half an attack goes to the monk, %i of it after the reduction", (rank, taken) => {
    const ally = bearing("life-bond", rank);
    const events: CombatEvent[] = [];
    applyAttackDamage(ally, 100, "slashing", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "a", amount: 50, critical: false }]);
    expect(redirected(ally)).toEqual([
      { kind: "redirected-damage", toId: "monk", amount: taken, toClosestMinion: false },
    ]);
  });

  it("an attack of any type is one: fire from a weapon splits too", () => {
    const ally = bearing("life-bond", 12);
    const events: CombatEvent[] = [];
    applyAttackDamage(ally, 100, "fire", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "a", amount: 50, critical: false }]);
  });

  it("a reduction above the share sends nothing, and never heals; the ally is still spared it", () => {
    const ally = bearing("life-bond", 12);
    const events: CombatEvent[] = [];
    applyAttackDamage(ally, 40, "slashing", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "a", amount: 20, critical: false }]);
    expect(redirected(ally)).toEqual([]);
  });

  it("spell damage, physical or not, is not redirected", () => {
    const ally = bearing("life-bond", 12);
    const events: CombatEvent[] = [];
    applyDamage(ally, 100, "piercing", false, events, undefined);
    expect(events).toEqual([{ kind: "damage", targetId: "a", amount: 100, critical: false }]);
    expect(redirected(ally)).toEqual([]);
  });

  it("Symbiotic Bond still splits a physical spell hit, with no reduction", () => {
    expect(getStatusDefinition("symbiotic-bond").redirectsDamage).toEqual({
      share: 0.5,
      from: "physical",
      reduction: 0,
    });
  });
});

describe("Life Attunement and Aura of Faith: healing by rank (#2291)", () => {
  it.each([
    ["life-attunement", 12, 1.428],
    ["life-attunement", 0, 1.14],
    ["aura-of-faith", 12, 1.9],
    ["aura-of-faith", 0, 1.5],
  ] as const)("%s at rank %i heals ×%d", (statusId, rank, multiplier) => {
    expect(healingMultiplierOf(bearing(statusId, rank))).toBeCloseTo(multiplier, 6);
  });

  it("Life Attunement's −30% on attacks is flat", () => {
    expect(aggregateModifiers(bearing("life-attunement", 0).statuses.active)).toMatchObject({
      weaponDamageMultiplier: 0.7,
    });
    expect(aggregateModifiers(bearing("life-attunement", 12).statuses.active)).toMatchObject({
      weaponDamageMultiplier: 0.7,
    });
  });

  it.each([
    [12, 0.59],
    [0, 0.95],
  ])("Aura of Faith at rank %i takes ×%d damage", (rank, multiplier) => {
    expect(
      aggregateModifiers(bearing("aura-of-faith", rank).statuses.active).damageTakenMultiplier,
    ).toBeCloseTo(multiplier, 6);
  });

  it("lasts 3 seconds", () => {
    const monk = makeCombatant({ id: "monk", attributeRanks: ranked(12) });
    const ally = makeCombatant({ id: "a", team: 0 });
    applyEffects(skill("monk.aura-of-faith").effects, {
      caster: monk,
      target: ally,
      rng: steady(),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    });
    expect(ally.statuses.get("aura-of-faith")?.remainingSeconds).toBe(3);
  });
});

describe("Enchanter's Conundrum (#2291)", () => {
  function hex(rank: number, enchanted: boolean) {
    const mesmer = makeCombatant({ id: "m", team: 1, attributeRanks: ranked(rank) });
    const foe = makeCombatant({ id: "f", team: 0, health: 500, maxHealth: 500 });
    const near = makeCombatant({ id: "g", team: 0, health: 500, maxHealth: 500 });
    if (enchanted) {
      foe.statuses.apply("aura-of-faith", 30, "x", ranked(0));
    }
    const events = applyEffects(skill("mesmer.enchanters-conundrum").effects, {
      caster: mesmer,
      target: foe,
      rng: steady(),
      rules: RULES.combat,
      surroundings: placed(
        [mesmer, vec2(0, 0)],
        [foe, vec2(500, 0)],
        [near, vec2(500 + AREA_ADJACENT / 2, 0)],
      ),
      usedSkill: undefined,
    });
    return { foe, events };
  }

  const damageTo = (events: readonly CombatEvent[], id: string): number[] =>
    events.flatMap((event) =>
      event.kind === "damage" && event.targetId === id ? [event.amount] : [],
    );

  it.each([
    [12, 82, 61],
    [0, 10, 7],
  ])("at rank %i, an unenchanted foe takes %i and the adjacent %i", (rank, hit, splash) => {
    const { foe, events } = hex(rank, false);
    expect(damageTo(events, "f")).toEqual([hit]);
    expect(damageTo(events, "g")).toEqual([splash]);
    expect(foe.statuses.get("enchanters-conundrum")?.remainingSeconds).toBe(10);
  });

  it("an enchanted foe takes nothing, and is hexed all the same", () => {
    const { foe, events } = hex(12, true);
    expect(events.some((event) => event.kind === "damage")).toBe(false);
    expect(foe.statuses.has("enchanters-conundrum")).toBe(true);
  });

  it.each([
    [12, 2.8],
    [0, 2],
  ])("at rank %i, the foe's enchantments take ×%d to cast; other skills do not", (rank, times) => {
    const { foe } = hex(rank, true);
    expect(
      ownSkillBoost(foe.statuses.active, skill("monk.aura-of-faith")).activationMultiplier,
    ).toBeCloseTo(times, 6);
    expect(
      ownSkillBoost(foe.statuses.active, skill("mesmer.enchanters-conundrum")).activationMultiplier,
    ).toBe(1);
  });
});

describe("Peace and Harmony (#2291)", () => {
  function cast(rank: number) {
    const monk = makeCombatant({
      id: "monk",
      attributeRanks: ranked(rank),
      skillBar: ["monk.peace-and-harmony", "monk.signet-of-mystic-wrath", "monk.aura-of-faith"],
    });
    const ally = makeCombatant({ id: "a", team: 0 });
    for (const statusId of ["bleeding", "poison", "crippled"] as const) {
      ally.statuses.apply(statusId, 10, "x", ranked(0));
    }
    ally.statuses.apply("enchanters-conundrum", 10, "x", ranked(0));
    const events = applyEffects(skill("monk.peace-and-harmony").effects, {
      caster: monk,
      target: ally,
      rng: steady(),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    });
    return { monk, ally, events };
  }

  const removed = (events: readonly CombatEvent[]): string[] =>
    events.flatMap((event) => (event.kind === "status-removed" ? [event.statusId] : []));

  it("at rank 12, loses 3 conditions and hexes out of one count, the newest first", () => {
    const { ally, events } = cast(12);
    expect(removed(events)).toEqual(["enchanters-conundrum", "crippled", "poison"]);
    expect(ally.statuses.has("bleeding")).toBe(true);
    expect(ally.statuses.get("peace-and-harmony")?.remainingSeconds).toBe(3);
  });

  it("at rank 0, removes nothing, and still speeds expiry for 1 second", () => {
    const { ally, events } = cast(0);
    expect(removed(events)).toEqual([]);
    expect(ally.statuses.get("peace-and-harmony")?.remainingSeconds).toBe(1);
  });

  it("conditions and hexes run out 90% faster; enchantments keep their rate", () => {
    const { ally } = cast(0);
    ally.statuses.advance(0.5, false);
    expect(ally.statuses.get("enchanters-conundrum")?.remainingSeconds).toBeCloseTo(9.05, 6);
    expect(ally.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(9.05, 6);
    expect(ally.statuses.get("peace-and-harmony")?.remainingSeconds).toBeCloseTo(0.5, 6);
  });

  it("disables the monk's Smiting Prayers for 20 seconds, at rank 0 too", () => {
    const { events } = cast(0);
    expect(events.filter((event) => event.kind === "skill-disabled")).toEqual([
      {
        kind: "skill-disabled",
        targetId: "monk",
        skillId: "monk.signet-of-mystic-wrath",
        seconds: 20,
      },
    ]);
  });
});

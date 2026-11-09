import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { applyDamage, applyEffect, applySkillEffects, type CombatEvent } from "./effects.js";
import { resolveMagnitude, statAt } from "./scaling.js";
import {
  damageDealtAsOf,
  damageTypeDealt,
  damageTypeTaken,
  getStatusDefinition,
  NO_RANKS,
  StatusSet,
  type StatusId,
  type StatusStat,
} from "./status.js";
import { makeCombatant } from "./testing.js";
import { raisedMaxHealth } from "./tick.js";
import type {
  Combatant,
  Magnitude,
  Skill,
  Surroundings,
  TransferConditionsToAreaEffect,
} from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Mechanics (#2503), mostly defensive: damage-type conversion both ways,
 * a cut to spells' damage, a flat cut from conditioned foes, a cap on
 * damage kept per second, a stopped knockdown turned on its foe, an
 * interrupt guard that costs a Dervish enchantment, maximum Health by
 * maximum Energy, and conditions moved onto every nearby foe. Each skill's
 * corpus numbers, its scaled numbers at rank 0 and rank 12, and one
 * behaviour.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const STONE = "elementalist.stone-striker";
const VEIL = "dervish.veil-of-thorns";
const SANCTITY = "dervish.armor-of-sanctity";
const ANGELIC = "paragon.angelic-protection";
const PENDULUM = "monk.balthazars-pendulum";
const PIOUS = "dervish.pious-concentration";
const BOON = "elementalist.energy-boon";
const GRENTH = "dervish.grenths-fingers";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the eight are the corpus's (#2503)", () => {
  it.each([
    [STONE, 1371, "enchantment", false, false, "elementalist.earth-magic", 5, 0.25, 20, "self"],
    [VEIL, 1757, "enchantment", false, true, "dervish.earth-prayers", 10, 0, 15, "self"],
    [SANCTITY, 1515, "enchantment", false, false, "dervish.earth-prayers", 5, 0.25, 15, "self"],
    [ANGELIC, 1586, "skill", false, false, "paragon.leadership", 5, 0, 30, "single-other-ally"],
    [PENDULUM, 1395, "enchantment", true, false, "monk.smiting-prayers", 5, 0.25, 5, "single-ally"],
    [PIOUS, 1542, "stance", false, false, "dervish.earth-prayers", 10, 0, 10, "self"],
    [
      BOON,
      837,
      "enchantment",
      true,
      false,
      "elementalist.energy-storage",
      10,
      1,
      12,
      "single-ally",
    ],
    [GRENTH, 1493, "enchantment", false, true, "dervish.wind-prayers", 5, 0, 10, "self"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, flash %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, flash, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        flash,
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

/** A caster with `rank` in `attributeId`. */
function ranked(attributeId: string, rank: number): Combatant {
  return makeCombatant({ id: "c", attributeRanks: new Map([[attributeId, rank]]) });
}

/** `magnitude` at rank 0 and rank 12 of `attributeId`. */
function ends(magnitude: Magnitude, attributeId: string): readonly [number, number] {
  return [
    resolveMagnitude(magnitude, ranked(attributeId, 0)),
    resolveMagnitude(magnitude, ranked(attributeId, 12)),
  ];
}

/** `stat` at rank 0 and rank 12 of `attributeId`. */
function statEnds(stat: StatusStat, attributeId: string): readonly [number, number] {
  return [statAt(stat, at(attributeId, 0)), statAt(stat, at(attributeId, 12))];
}

/** The `index`th effect of `id`, which must be of `kind`. */
function effect<K extends Skill["effects"][number]["kind"]>(
  id: string,
  index: number,
  kind: K,
): Extract<Skill["effects"][number], { kind: K }> {
  const found = skill(id).effects[index];
  if (found?.kind !== kind) {
    throw new Error(`${id} effect ${String(index)} is not ${kind}`);
  }
  return found as Extract<Skill["effects"][number], { kind: K }>;
}

describe("scaled numbers at rank 0 and rank 12 (#2503)", () => {
  const EARTH = "elementalist.earth-magic";
  const EP = "dervish.earth-prayers";
  const WP = "dervish.wind-prayers";
  const ES = "elementalist.energy-storage";

  it("Stone Striker lasts 5...25 s", () => {
    expect(ends(effect(STONE, 0, "apply-status").durationSeconds, EARTH)).toEqual([5, 25]);
  });

  it("Veil of Thorns strikes for 5...41, lasts 5...21 s, and spells deal 95%...71%", () => {
    const splash = effect(VEIL, 1, "splash").effects[0];
    expect(splash?.kind === "damage" ? ends(splash.amount, EP) : undefined).toEqual([5, 41]);
    expect(ends(effect(VEIL, 0, "apply-status").durationSeconds, EP)).toEqual([5, 21]);
    expect(statEnds(getStatusDefinition("veil-of-thorns").spellDamageTakenMultiplier, EP)).toEqual([
      0.95, 0.71,
    ]);
  });

  it("Armor of Sanctity weakens for 5...13 s, and takes 5...17 off", () => {
    const splash = effect(SANCTITY, 1, "splash").effects[0];
    expect(splash?.kind === "apply-status" ? ends(splash.durationSeconds, EP) : undefined).toEqual([
      5, 13,
    ]);
    expect(
      statEnds(getStatusDefinition("armor-of-sanctity").damageReductionFromConditionedFoe, EP),
    ).toEqual([5, 17]);
  });

  it("Angelic Protection's cap falls from 250 to 114", () => {
    const cap = getStatusDefinition("angelic-protection").damagePerSecondCap;
    expect(cap === undefined ? undefined : statEnds(cap, "paragon.leadership")).toEqual([250, 114]);
  });

  it("Balthazar's Pendulum and Pious Concentration last 5...21 s and 5...17 s", () => {
    expect(
      ends(effect(PENDULUM, 0, "apply-status").durationSeconds, "monk.smiting-prayers"),
    ).toEqual([5, 21]);
    expect(ends(effect(PIOUS, 0, "apply-status").durationSeconds, EP)).toEqual([5, 17]);
  });

  it("Energy Boon lasts 36...55 s, gives 1...2.6 Health a point, and 1...10 Energy", () => {
    expect(ends(effect(BOON, 0, "apply-status").durationSeconds, ES)).toEqual([36, 55]);
    expect(statEnds(getStatusDefinition("energy-boon").maxHealthPerMaxEnergy, ES)).toEqual([
      1, 2.6,
    ]);
    expect(ends(effect(BOON, 2, "energy-gain").amount, ES)).toEqual([1, 10]);
  });

  it("Energy Boon's caster gains 1 more for every 2 points of Energy Storage", () => {
    const extra = effect(BOON, 4, "energy-gain").amount;
    for (let rank = 1; rank <= 16; rank += 1) {
      expect(resolveMagnitude(extra, ranked(ES, rank)), `rank ${String(rank)}`).toBe(
        Math.floor(rank / 2),
      );
    }
  });

  it("Grenth's Fingers strikes for 10...34 and moves 1...2 conditions", () => {
    const splash = effect(GRENTH, 1, "splash").effects[0];
    expect(splash?.kind === "damage" ? ends(splash.amount, WP) : undefined).toEqual([10, 34]);
    const [ending] = getStatusDefinition("grenths-fingers").triggers;
    const transfer = ending?.effects[0];
    expect(ending?.on).toBe("ends");
    expect(
      transfer?.kind === "transfer-conditions-to-area" ? ends(transfer.count, WP) : undefined,
    ).toEqual([1, 2]);
  });
});

function foe(id: string): Combatant {
  return makeCombatant({ id, team: 1, health: 1000, maxHealth: 1000 });
}

function around(...placed: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    placed.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, floors: 1, layer: 0, creature: undefined, corpseExploited: false },
    ]),
  );
}

function bearing(id: StatusId, ranks: ReadonlyMap<string, number> = NO_RANKS): Combatant {
  const bearer = makeCombatant({ id: "b", health: 1000, maxHealth: 1000 });
  bearer.statuses.apply(id, 30, "b", ranks);
  return bearer;
}

describe("Stone Striker (#2503)", () => {
  it("turns physical and elemental damage dealt and taken into earth", () => {
    const set = new StatusSet();
    set.apply("stone-striker", 25, "b", NO_RANKS);
    const dealtAs = damageDealtAsOf(set.active);
    expect(damageTypeDealt("slashing", dealtAs)).toBe("earth");
    expect(damageTypeDealt("fire", dealtAs)).toBe("earth");
    expect(damageTypeTaken("piercing", set.active)).toBe("earth");
    expect(damageTypeTaken("cold", set.active)).toBe("earth");
  });

  it("leaves armor-ignoring damage as it is", () => {
    const set = new StatusSet();
    set.apply("stone-striker", 25, "b", NO_RANKS);
    expect(damageTypeDealt("chaos", damageDealtAsOf(set.active))).toBe("chaos");
    expect(damageTypeTaken("holy", set.active)).toBe("holy");
  });
});

describe("Veil of Thorns (#2503)", () => {
  const veiled = () => bearing("veil-of-thorns", at("dervish.earth-prayers", 12));

  it("cuts a spell's damage to 71% at rank 12", () => {
    const lost = (target: Combatant) => {
      applySkillEffects({
        surroundings: new Map(),
        skill: skill("elementalist.flare"),
        caster: makeCombatant({ id: "e", team: 1 }),
        targets: [target],
        rng: createRng(1),
        rules: RULES.combat,
      });
      return 1000 - target.health;
    };
    const plain = lost(makeCombatant({ id: "b", health: 1000, maxHealth: 1000 }));
    expect(plain).toBeGreaterThan(0);
    expect(lost(veiled())).toBe(Math.round(plain * 0.71));
  });

  it("does not cut damage that is no spell's own, as a status's trigger", () => {
    const lost = (target: Combatant) => {
      applyEffect(
        { kind: "damage", amount: { flat: 100 }, type: "fire", armorPenetration: 0 },
        {
          caster: foe("e"),
          target,
          rng: createRng(1),
          rules: RULES.combat,
          surroundings: new Map(),
        },
      );
      return 1000 - target.health;
    };
    expect(lost(veiled())).toBe(lost(makeCombatant({ id: "b", health: 1000, maxHealth: 1000 })));
  });

  it("does not cut a hex spell's ends trigger: Shatterstone bursts in full", () => {
    // An ends trigger carries its skill's id, a spell's here.
    const burst = (veil: boolean): number => {
      const match = sim([body("m", 0, vec2(0, 0)), body("e", 1, vec2(0, 900))]);
      const { statuses } = get(match, "m").combatant;
      if (veil) {
        statuses.apply("veil-of-thorns", 30, "m", at("dervish.earth-prayers", 12));
      }
      statuses.apply("shatterstone", 0.5, "e", NO_RANKS);
      return events(stepFor(match, 1))
        .filter((event) => event.kind === "damage" && event.targetId === "m")
        .reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);
    };
    expect(burst(false)).toBeGreaterThan(0);
    expect(burst(true)).toBe(burst(false));
  });
});

describe("Armor of Sanctity (#2503)", () => {
  const armored = () => bearing("armor-of-sanctity", at("dervish.earth-prayers", 12));

  it("takes 17 off a conditioned foe's hit at rank 12, never below 0", () => {
    const dealer = foe("e");
    dealer.statuses.apply("weakness", 10, "x", NO_RANKS);
    const target = armored();
    applyDamage(target, 50, "slashing", false, [], dealer);
    expect(target.health).toBe(1000 - 33);
    applyDamage(target, 10, "slashing", false, [], dealer);
    expect(target.health).toBe(1000 - 33);
  });

  it("takes nothing off an unconditioned foe's, or a conditioned ally's", () => {
    const target = armored();
    applyDamage(target, 50, "slashing", false, [], foe("e"));
    expect(target.health).toBe(950);
    const ally = makeCombatant({ id: "a" });
    ally.statuses.apply("weakness", 10, "x", NO_RANKS);
    applyDamage(target, 50, "slashing", false, [], ally);
    expect(target.health).toBe(900);
  });
});

describe("Angelic Protection (#2503)", () => {
  it("heals what goes over 114 in a second at rank 12, and the window rolls", () => {
    const target = bearing("angelic-protection", at("paragon.leadership", 12));
    const events: CombatEvent[] = [];
    applyDamage(target, 100, "slashing", false, events, foe("e"));
    expect(target.health).toBe(900);
    applyDamage(target, 100, "slashing", false, events, foe("e"));
    expect(target.health).toBe(886);
    expect(events).toContainEqual({ kind: "heal", targetId: "b", amount: 86 });

    for (let i = 0; i < RULES.tickRateHz; i += 1) {
      target.statuses.advance(DT, false);
    }
    applyDamage(target, 100, "slashing", false, events, foe("e"));
    expect(target.health).toBe(786);
  });

  it("empties its window when it ends", () => {
    const target = bearing("angelic-protection", at("paragon.leadership", 12));
    applyDamage(target, 100, "slashing", false, [], foe("e"));
    target.statuses.end("angelic-protection");
    target.statuses.apply("angelic-protection", 10, "b", at("paragon.leadership", 12));
    applyDamage(target, 100, "slashing", false, [], foe("e"));
    expect(target.health).toBe(800);
  });
});

describe("Energy Boon (#2503)", () => {
  it("raises maximum Health by 2.6 a point of the bearer's own maximum Energy", () => {
    const bearer = makeCombatant({ id: "b", maxHealth: 480, maxEnergy: 30 });
    bearer.statuses.apply("energy-boon", 55, "c", at("elementalist.energy-storage", 12));
    expect(raisedMaxHealth(bearer)).toBe(480 + 78);
    bearer.maxEnergy = 50;
    expect(raisedMaxHealth(bearer)).toBe(480 + 130);
  });

  it("moves Health with a weapon swap's Energy, both ways, and logs no damage", () => {
    const spare = {
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxEnergy: 50,
      maxHealth: 480,
      baseEnergyPips: 0,
    };
    const match = sim([
      { ...body("m", 0, vec2(0, 0)), maxEnergy: 30, spareWeaponSets: [spare, null, null] },
      body("e", 1, vec2(0, 900)),
    ]);
    const { combatant } = get(match, "m");
    combatant.statuses.apply("energy-boon", 55, "m", at("elementalist.energy-storage", 12));
    combatant.health = raisedMaxHealth(combatant);
    expect(combatant.health).toBe(480 + 78);

    for (const [set, health] of [
      [1, 480 + 130],
      [0, 480 + 78],
      [1, 480 + 130],
    ] as const) {
      expect(match.requestWeaponSet("m", set)?.kind).toBe("swapped");
      expect(combatant.health).toBe(health);
      const hurt = events(match.step(DT).log).filter(
        (event) => event.kind === "damage" && event.targetId === "m",
      );
      expect(hurt).toEqual([]);
    }
  });

  it("enchants caster and ally; each gains 10 Energy, the caster 6 more at rank 12", () => {
    const caster = makeCombatant({
      id: "c",
      energy: 0,
      attributeRanks: new Map([["elementalist.energy-storage", 12]]),
    });
    const ally = makeCombatant({ id: "a", energy: 0 });
    applySkillEffects({
      surroundings: new Map(),
      skill: skill(BOON),
      caster,
      targets: [ally],
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(caster.statuses.has("energy-boon")).toBe(true);
    expect(ally.statuses.has("energy-boon")).toBe(true);
    expect(ally.energy).toBe(10);
    expect(caster.energy).toBe(16);
  });
});

describe("Grenth's Fingers (#2503)", () => {
  const transfer: TransferConditionsToAreaEffect = {
    kind: "transfer-conditions-to-area",
    count: { flat: 2 },
    radius: AREA_NEARBY,
  };

  it("moves the caster's two newest conditions onto every nearby foe", () => {
    const caster = makeCombatant({ id: "c" });
    caster.statuses.apply("bleeding", 10, "x", NO_RANKS);
    caster.statuses.apply("poison", 8, "x", NO_RANKS);
    caster.statuses.apply("weakness", 6, "x", NO_RANKS);
    const near = foe("n");
    const also = foe("m");
    const far = foe("f");
    applyEffect(transfer, {
      caster,
      target: caster,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: around(
        [caster, vec2(0, 0)],
        [near, vec2(AREA_NEARBY - 1, 0)],
        [also, vec2(0, 10)],
        [far, vec2(AREA_NEARBY + 1, 0)],
      ),
    });
    expect(caster.statuses.has("bleeding")).toBe(true);
    expect(caster.statuses.has("poison")).toBe(false);
    expect(caster.statuses.has("weakness")).toBe(false);
    for (const each of [near, also]) {
      expect(each.statuses.has("poison")).toBe(true);
      expect(each.statuses.has("weakness")).toBe(true);
      expect(each.statuses.has("bleeding")).toBe(false);
    }
    expect(far.statuses.active).toEqual([]);
  });

  it("moves nothing with no foe in reach", () => {
    const caster = makeCombatant({ id: "c" });
    caster.statuses.apply("poison", 8, "x", NO_RANKS);
    applyEffect(transfer, {
      caster,
      target: caster,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: around([caster, vec2(0, 0)]),
    });
    expect(caster.statuses.has("poison")).toBe(true);
  });
});

describe("Balthazar's Pendulum (#2503)", () => {
  it("stops a foe's knockdown, is spent, and knocks the foe down", () => {
    const match = sim([body("m", 0, vec2(0, 0)), body("e", 1, vec2(100, 0))]);
    put(match, "m", "balthazars-pendulum", 21);
    const events = knock(match, "e");
    expect(get(match, "m").combatant.knockdownRemaining).toBe(0);
    expect(get(match, "m").combatant.statuses.has("balthazars-pendulum")).toBe(false);
    expect(get(match, "e").combatant.knockdownRemaining).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ kind: "knocked-down", targetId: "e" }));
  });

  it("lets an ally's knockdown land, and stays", () => {
    const match = sim([body("m", 0, vec2(0, 0)), body("a", 0, vec2(100, 0))]);
    put(match, "m", "balthazars-pendulum", 21);
    knock(match, "a");
    expect(get(match, "m").combatant.knockdownRemaining).toBeGreaterThan(0);
    expect(get(match, "m").combatant.statuses.has("balthazars-pendulum")).toBe(true);
  });
});

describe("Pious Concentration (#2503)", () => {
  const KINETIC_ARMOR = "elementalist.kinetic-armor";

  it("costs the newest Dervish enchantment for each interrupt, then ends and lets one land", () => {
    const match = sim([
      body("m", 0, vec2(0, 0), [KINETIC_ARMOR]),
      body("e", 1, vec2(300, 0), ["mesmer.power-spike", "mesmer.power-leak"]),
    ]);
    put(match, "m", "armor-of-sanctity", 15);
    put(match, "m", "pious-concentration", 17);
    expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(match, 0.25);
    expect(get(match, "m").combatant.cast.activeCast?.skillId).toBe(KINETIC_ARMOR);

    const first = events(interrupt(match, 0));
    expect(first.some((event) => event.kind === "interrupted")).toBe(false);
    expect(first).toContainEqual({
      kind: "status-removed",
      targetId: "m",
      statusId: "armor-of-sanctity",
    });
    expect(get(match, "m").combatant.statuses.has("pious-concentration")).toBe(true);

    const second = events(interrupt(match, 1));
    expect(second).toContainEqual({ kind: "interrupted", targetId: "m", skillId: KINETIC_ARMOR });
    expect(get(match, "m").combatant.statuses.has("pious-concentration")).toBe(false);
  });
});

describe("tooltips (#2503)", () => {
  it.each([
    ["stone-striker", "physical damage dealt is earth damage"],
    ["stone-striker", "elemental damage taken is earth damage"],
    ["veil-of-thorns", "29% less damage from spells"],
    ["armor-of-sanctity", "−17 damage taken from foes with a condition"],
    ["angelic-protection", "damage over 114 in a second is healed"],
    ["balthazars-pendulum", "cannot be knocked down by a foe"],
    ["pious-concentration", "lose 1 Dervish enchantment or this ends"],
    ["energy-boon", "+2.6 maximum Health per point of maximum Energy"],
  ] as const)("%s says %s", (id, text) => {
    const ranks = new Map([
      ["dervish.earth-prayers", 12],
      ["paragon.leadership", 12],
      ["elementalist.energy-storage", 12],
    ]);
    expect(describeStatus(id, ranks, EN_WORDS, EN_NAMES)).toContain(text);
  });
});

function sim(participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "defence-singles", participants });
}

function body(id: string, team: number, spawn: Vec2, bar: string[] = []): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 480,
    maxEnergy: 200,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

function put(match: MatchSimulation, id: string, status: StatusId, seconds: number): void {
  get(match, id).combatant.statuses.apply(status, seconds, id, NO_RANKS);
}

/** `by` knocks `m` down, and the tick after it. */
function knock(match: MatchSimulation, by: string): CombatEvent[] {
  const landed = applyEffect(
    { kind: "knockdown", durationSeconds: 2 },
    {
      caster: get(match, by).combatant,
      target: get(match, "m").combatant,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    },
  );
  return [...landed, ...events(match.step(DT).log)];
}

/** `e` uses the interrupt in `slot` at `m`, until it resolves. */
function interrupt(match: MatchSimulation, slot: number): CombatLogEntry[] {
  match.setTarget("e", "m");
  expect(match.requestSkill("e", slot)?.check).toEqual({ ok: true });
  const skillId = ["mesmer.power-spike", "mesmer.power-leak"][slot];
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 60 && !log.some((entry) => entry.skillId === skillId); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

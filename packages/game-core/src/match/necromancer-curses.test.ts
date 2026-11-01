import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { AREA_NEARBY } from "../distances.js";
import { applyEffects } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { attackMissChanceOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const PRICE_OF_FAILURE = "necromancer.price-of-failure";
const CURSES = [
  "necromancer.barbs",
  PRICE_OF_FAILURE,
  "necromancer.suffering",
  "necromancer.defile-flesh",
  "necromancer.rigor-mortis",
  "necromancer.lingering-curse",
];

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A rank-12 axe fighter of team 0 with Fireball. */
function fighter(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: AXE,
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A rank-12 Necromancer of team 1 with the six Curses hexes. */
function necromancer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: CURSES,
    attributeRanks: new Map([["necromancer.curses", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** Fighter `a` next to Necromancer `n`, and whoever else is asked for. */
function sim(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "necromancer-curses",
    participants: [fighter("a", vec2(0, 0)), necromancer("n", vec2(40, 0)), ...more],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function damageTo(entries: readonly CombatLogEntry[], id: string): number[] {
  return entries.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "damage" && event.targetId === id ? [event.amount] : [],
    ),
  );
}

/** `a`'s swings at `n`, `seconds` of them. */
function swings(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  expect(match.requestAttack("a", "n")).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function weaponEntries(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.cause === "weapon" && entry.sourceId === "a");
}

function count(log: readonly CombatLogEntry[], kind: "attack-missed" | "attack-blocked"): number {
  return weaponEntries(log).flatMap((entry) => entry.events.filter((event) => event.kind === kind))
    .length;
}

/** `n` casts the hex in `slot` on `a`, and it lands. */
function hex(match: MatchSimulation, slot: number): void {
  match.setTarget("n", "a");
  expect(match.requestSkill("n", slot)?.check).toEqual({ ok: true });
  stepFor(match, 2.5);
}

/** What a 100 heal on a bearer of `statuses` gives. */
function healed(statuses: readonly StatusId[]): number {
  const target = makeCombatant({ id: "t", health: 100 });
  for (const id of statuses) {
    target.statuses.apply(id, 30, "n", NO_RANKS);
  }
  const events = applyEffects([{ kind: "heal", amount: { flat: 100 } }], {
    caster: makeCombatant({ id: "c" }),
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
  });
  return events.flatMap((event) => (event.kind === "heal" ? [event.amount] : []))[0] ?? 0;
}

const CURSES_12: ReadonlyMap<string, number> = new Map([["necromancer.curses", 12]]);

describe("Barbs (#1332)", () => {
  it("is cast as the barbs hex", () => {
    const match = sim();
    hex(match, 0);
    expect(get(match, "a").statuses.get("barbs")?.sourceId).toBe("n");
    expect(describeStatus("barbs", CURSES_12)).toBe("take +14 from physical damage");
  });

  it("a weapon hit deals 14 more, a spell no more", () => {
    const plain = sim();
    const barbed = sim();
    get(barbed, "n").statuses.apply("barbs", 30, "a", CURSES_12);
    const without = damageTo(weaponEntries(swings(plain, 3)), "n");
    const withBarbs = damageTo(weaponEntries(swings(barbed, 3)), "n");
    expect(without.length).toBeGreaterThan(0);
    expect(withBarbs).toEqual(without.map((amount) => amount + 14));

    const spell = (match: MatchSimulation): number[] => {
      match.setTarget("a", "n");
      expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
      return damageTo(stepFor(match, 4), "n");
    };
    const unbarbed = sim();
    const barbedSpell = sim();
    get(barbedSpell, "n").statuses.apply("barbs", 30, "a", NO_RANKS);
    const fireball = spell(unbarbed);
    expect(fireball.length).toBeGreaterThan(0);
    expect(spell(barbedSpell)).toEqual(fireball);
  });
});

describe("Price of Failure (#1332)", () => {
  it("is cast as the price-of-failure hex", () => {
    const match = sim();
    hex(match, 1);
    expect(get(match, "a").statuses.get("price-of-failure")?.sourceId).toBe("n");
    expect(describeStatus("price-of-failure")).toBe(
      "25% of attacks miss, takes 37 damage whenever it fails to hit",
    );
  });

  it("each missed or blocked blow costs its attacker 37, a landed one nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("price-of-failure", 30, "n", NO_RANKS);
    get(match, "n").statuses.apply("guardian", 30, "n", NO_RANKS);
    const log = swings(match, 20);
    const misses = count(log, "attack-missed");
    const blocks = count(log, "attack-blocked");
    expect(misses).toBeGreaterThan(0);
    expect(blocks).toBeGreaterThan(0);
    expect(damageTo(weaponEntries(log), "n").length).toBeGreaterThan(0);
    const price = log.filter((entry) => entry.skillId === PRICE_OF_FAILURE);
    expect(damageTo(price, "a")).toEqual(Array.from({ length: misses + blocks }, () => 37));
    expect(price.every((entry) => entry.sourceId === "n")).toBe(true);
  });

  it("on a Blinded foe misses at the blind rate", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.statuses.apply("blind", 30, "n", NO_RANKS);
    const blind = attackMissChanceOf(bearer);
    bearer.statuses.apply("price-of-failure", 30, "n", NO_RANKS);
    expect(attackMissChanceOf(bearer)).toBe(blind);
  });

  it("can kill its bearer, the kill the Necromancer's", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.health = 30;
    bearer.statuses.apply("price-of-failure", 30, "n", NO_RANKS);
    bearer.statuses.apply("blind", 30, "n", NO_RANKS);
    const log = swings(match, 5);
    expect(bearer.dead).toBe(true);
    const death = log.find((entry) =>
      entry.events.some((event) => event.kind === "death" && event.targetId === "a"),
    );
    expect(death?.skillId).toBe(PRICE_OF_FAILURE);
  });
});

describe("Suffering and Lingering Curse (#1332)", () => {
  it.each([
    [2, "suffering", -2],
    [5, "lingering-curse", -3],
  ] as const)("slot %i hexes the target and its nearby foes with %s", (slot, id, pips) => {
    const match = sim(
      fighter("near", vec2(0, AREA_NEARBY - 10)),
      fighter("far", vec2(0, -(AREA_NEARBY + 40))),
      { ...necromancer("ally", vec2(-20, 0)), skillBar: [] },
    );
    hex(match, slot);
    for (const each of ["a", "near"]) {
      expect(get(match, each).statuses.has(id), each).toBe(true);
      expect(aggregateModifiers(get(match, each).statuses.active).healthPips).toBe(pips);
    }
    expect(get(match, "far").statuses.has(id)).toBe(false);
    expect(get(match, "ally").statuses.has(id)).toBe(false);
    expect(get(match, "n").statuses.has(id)).toBe(false);
    get(match, "a").statuses.remove(id);
    expect(get(match, "near").statuses.has(id)).toBe(true);
  });

  it("describes them", () => {
    expect(describeStatus("suffering")).toBe("−2 Health degeneration");
    expect(describeStatus("lingering-curse")).toBe("−3 Health degeneration, −25% healing");
  });
});

describe("Defile Flesh (#1332)", () => {
  it("is cast as the defile-flesh hex", () => {
    const match = sim();
    hex(match, 3);
    expect(get(match, "a").statuses.get("defile-flesh")?.sourceId).toBe("n");
    expect(describeStatus("defile-flesh")).toBe("−33% healing");
  });

  it("turns a 100 heal into two-thirds of it, and with Lingering Curse floors it at 60", () => {
    expect(healed([])).toBe(100);
    expect(healed(["defile-flesh"])).toBeCloseTo((100 * 2) / 3);
    expect(healed(["defile-flesh", "lingering-curse"])).toBe(60);
  });
});

describe("Rigor Mortis (#1332)", () => {
  it("is cast as the rigor-mortis hex", () => {
    const match = sim();
    hex(match, 4);
    expect(get(match, "a").statuses.get("rigor-mortis")?.sourceId).toBe("n");
    expect(describeStatus("rigor-mortis")).toBe("cannot block");
  });

  it("a bearer in a blocking stance takes every hit", () => {
    const guarded = sim();
    get(guarded, "n").statuses.apply("guardian", 30, "n", NO_RANKS);
    expect(count(swings(guarded, 10), "attack-blocked")).toBeGreaterThan(0);

    const stiff = sim();
    get(stiff, "n").statuses.apply("guardian", 30, "n", NO_RANKS);
    get(stiff, "n").statuses.apply("rigor-mortis", 30, "a", NO_RANKS);
    const log = swings(stiff, 10);
    expect(weaponEntries(log).length).toBeGreaterThan(3);
    expect(count(log, "attack-blocked")).toBe(0);
  });
});

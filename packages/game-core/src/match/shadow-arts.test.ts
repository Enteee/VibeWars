import { describe, expect, it } from "vitest";

import {
  AREA_ADJACENT,
  AREA_NEARBY,
  RANGE_SPELL,
  SHADOW_STEP_AWAY_DISTANCE,
} from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { Segment } from "../geometry.js";
import { criticalStrikesEnergy } from "../primary-attributes.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { landedCritical } from "../skills/weapon-attack.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Assassin's Shadow Arts staples (#1326): Heart of Shadow and Viper's
 * Defense step away from the selection, Death's Retreat steps to an ally
 * and heals if it has more Health, Feigned Neutrality armors until its
 * bearer hits or uses a skill, Way of Perfection gives health on each
 * critical hit, Caltrops cripples and bleeds a foe and those beside it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;
const HEART_OF_SHADOW = 0;
const VIPERS_DEFENSE = 1;
const DEATHS_RETREAT = 2;
const FEIGNED_NEUTRALITY = 3;
const WAY_OF_PERFECTION = 4;
const CALTROPS = 5;

function armed(weapon: Weapon, attributeId: string): ResolvedEquipment {
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

/** A rank-12 dagger assassin with the six, Shadow Arts 12. */
function assassin(spawn: Vec2): ParticipantSpec {
  return {
    id: "sin",
    team: 0,
    skillBar: [
      "assassin.heart-of-shadow",
      "assassin.vipers-defense",
      "assassin.deaths-retreat",
      "assassin.feigned-neutrality",
      "assassin.way-of-perfection",
      "assassin.caltrops",
    ],
    attributeRanks: new Map([
      ["assassin.dagger-mastery", 12],
      ["assassin.shadow-arts", 12],
      ["assassin.critical-strikes", 12],
    ]),
    equipment: armed(WEAPONS.daggers, "assassin.dagger-mastery"),
    maxEnergy: 60,
    spawn,
    facing: 0,
  };
}

/** Someone who does nothing it is not told to, a foe by default. */
function body(id: string, spawn: Vec2, overrides: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    spawn,
    facing: Math.PI,
    ...overrides,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `slot` used with `targetId` selected, stepped until it resolves; its log entry. */
function use(match: MatchSimulation, slot: number, targetId: string | undefined): CombatLogEntry {
  const skillId = get(match, "sin").skillBar[slot] ?? "";
  match.setTarget("sin", targetId);
  expect(match.requestSkill("sin", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100; i += 1) {
    const entry = match.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

/** What `events` healed or gave `id`, summed. */
function healed(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => sum + (event.kind === "heal" && event.targetId === id ? event.amount : 0),
    0,
  );
}

describe("Heart of Shadow (#1326)", () => {
  /** The assassin at 200 Health at the origin, `others` about, `selected` selected; it casts. */
  function heart(
    others: readonly ParticipantSpec[],
    selected: string | undefined,
    walls: Segment[] = [],
  ): { match: MatchSimulation; entry: CombatLogEntry } {
    const match = new MatchSimulation({
      seed: "heart",
      walls,
      participants: [assassin(vec2(0, 0)), ...others],
    });
    get(match, "sin").combatant.health = 200;
    return { match, entry: use(match, HEART_OF_SHADOW, selected) };
  }

  it("heals 126 and steps directly away from a selected foe, keeping its facing", () => {
    const { match, entry } = heart([body("foe", vec2(0, 100))], "foe");
    expect(healed(entry.events, "sin")).toBe(126);
    expect(entry.events).toContainEqual({ kind: "shadow-stepped-away", targetId: "sin" });
    const sin = get(match, "sin");
    expect(sin.position.x).toBeCloseTo(0, 6);
    expect(sin.position.y).toBeCloseTo(-SHADOW_STEP_AWAY_DISTANCE, 6);
    expect(sin.facing).toBeCloseTo(0, 6);
  });

  it("steps away from a selected ally too, and from a foe beyond its range", () => {
    const fromAlly = heart([body("pal", vec2(100, 0), { team: 0 })], "pal").match;
    expect(get(fromAlly, "sin").position.x).toBeCloseTo(-SHADOW_STEP_AWAY_DISTANCE, 6);
    const fromFar = heart([body("foe", vec2(0, 2000))], "foe").match;
    expect(get(fromFar, "sin").position.y).toBeCloseTo(-SHADOW_STEP_AWAY_DISTANCE, 6);
  });

  it("steps away from a selection that has died", () => {
    const match = new MatchSimulation({
      seed: "heart",
      participants: [assassin(vec2(0, 0)), body("foe", vec2(100, 0))],
    });
    const foe = get(match, "foe").combatant;
    foe.health = 0;
    foe.dead = true;
    use(match, HEART_OF_SHADOW, "foe");
    expect(get(match, "sin").position.x).toBeCloseTo(-SHADOW_STEP_AWAY_DISTANCE, 6);
  });

  it("with nothing selected, or itself, heals and stays", () => {
    for (const selected of [undefined, "sin"]) {
      const { match, entry } = heart([body("foe", vec2(0, 100))], selected);
      expect(healed(entry.events, "sin")).toBe(126);
      expect(distance(get(match, "sin").position, vec2(0, 0))).toBeCloseTo(0, 6);
    }
  });

  it("stops short of a wall behind it, on its own side", () => {
    const wall: Segment = { a: vec2(-200, -100), b: vec2(200, -100) };
    const { match } = heart([body("foe", vec2(0, 100))], "foe", [wall]);
    const at = get(match, "sin").position;
    expect(at.y).toBeGreaterThanOrEqual(-100 + RADIUS - 1e-6);
    expect(at.y).toBeLessThan(-50);
  });
});

describe("Viper's Defense (#1326)", () => {
  it("poisons the foes adjacent to it for 17 s, not one nearby, and steps away", () => {
    const match = new MatchSimulation({
      seed: "viper",
      participants: [
        assassin(vec2(0, 0)),
        body("foe", vec2(2 * RADIUS, 0)),
        body("flank", vec2(0, 2 * RADIUS)),
        body("near", vec2(0, -AREA_NEARBY)),
      ],
    });
    const entry = use(match, VIPERS_DEFENSE, "foe");
    const poisoned = entry.events.flatMap((event) =>
      event.kind === "status-applied" && event.statusId === "poison"
        ? [[event.targetId, event.durationSeconds]]
        : [],
    );
    expect(poisoned.sort()).toEqual([
      ["flank", 17],
      ["foe", 17],
    ]);
    expect(get(match, "near").combatant.statuses.has("poison")).toBe(false);
    expect(get(match, "sin").combatant.statuses.has("poison")).toBe(false);
    expect(get(match, "sin").position.x).toBeLessThan(-SHADOW_STEP_AWAY_DISTANCE + 1);
  });
});

describe("Death's Retreat (#1326)", () => {
  /** The assassin at `sinHealth`, its ally at `palHealth` 300 away; the cast's heal on it. */
  function retreat(sinHealth: number, palHealth: number): { match: MatchSimulation; heal: number } {
    const match = new MatchSimulation({
      seed: "retreat",
      participants: [assassin(vec2(0, 0)), body("pal", vec2(300, 0), { team: 0 })],
    });
    get(match, "sin").combatant.health = sinHealth;
    get(match, "pal").combatant.health = palHealth;
    return { match, heal: healed(use(match, DEATHS_RETREAT, "pal").events, "sin") };
  }

  it("is a ¼ s spell at another ally, 5 energy, 20 s", () => {
    expect(getSkill("assassin.deaths-retreat")).toMatchObject({
      type: "spell",
      target: "single-other-ally",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 20,
    });
  });

  it("steps beside the ally, and heals 112 below its Health, nothing at as much", () => {
    const below = retreat(300, 480);
    expect(distance(get(below.match, "sin").position, vec2(300, 0))).toBeCloseTo(2 * RADIUS, 6);
    expect(below.heal).toBe(112);
    expect(retreat(400, 400).heal).toBe(0);
    expect(retreat(480, 300).heal).toBe(0);
  });
});

describe("Feigned Neutrality (#1326)", () => {
  /** The assassin beside a sturdy foe, Feigned Neutrality up. */
  function feigned(seed = "feign"): MatchSimulation {
    const spec = assassin(vec2(0, 0));
    const match = new MatchSimulation({
      seed,
      participants: [spec, body("foe", vec2(2 * RADIUS + 10, 0), { maxHealth: 1e6 })],
    });
    use(match, FEIGNED_NEUTRALITY, "sin");
    return match;
  }

  it("gives +80 armor and +7 Health regeneration for 9 s", () => {
    const match = feigned();
    const sin = get(match, "sin");
    expect(sin.combatant.statuses.get("feigned-neutrality")?.remainingSeconds).toBe(9);
    expect(aggregateModifiers(sin.combatant.statuses.active).armorModifier).toBe(80);
    expect(match.pips(sin).health).toBeGreaterThanOrEqual(7);
  });

  it("ends on the bearer's first hit", () => {
    const match = feigned();
    match.requestAttack("sin", "foe");
    for (let i = 0; i < 200; i += 1) {
      const blows = match
        .step(DT)
        .log.filter((entry) => entry.sourceId === "sin" && entry.cause === "weapon");
      if (blows.some((entry) => entry.events.some((event) => event.kind === "damage"))) {
        break;
      }
    }
    expect(get(match, "sin").combatant.statuses.has("feigned-neutrality")).toBe(false);
  });

  it("stays through a missed blow", () => {
    // A seed whose first blind blow misses: one that hits ends it first.
    const match = feigned("a");
    get(match, "sin").combatant.statuses.apply("blind", 30, "foe", NO_RANKS);
    match.requestAttack("sin", "foe");
    let missed = false;
    for (let i = 0; i < 200 && !missed; i += 1) {
      const events = match
        .step(DT)
        .log.filter((entry) => entry.sourceId === "sin" && entry.cause === "weapon")
        .flatMap((entry) => entry.events);
      if (events.some((event) => event.kind === "damage")) {
        throw new Error("the blind blow hit: pick another seed");
      }
      missed = events.some((event) => event.kind === "attack-missed");
    }
    expect(missed).toBe(true);
    expect(get(match, "sin").combatant.statuses.has("feigned-neutrality")).toBe(true);
  });

  it("ends when the bearer uses a skill", () => {
    const match = feigned();
    use(match, WAY_OF_PERFECTION, "sin");
    expect(get(match, "sin").combatant.statuses.has("feigned-neutrality")).toBe(false);
  });
});

describe("Way of Perfection (#1326)", () => {
  it("gains 34 Health on a critical hit, beside Critical Eye's energy", () => {
    const attacker = makeCombatant({ id: "a", health: 300, energy: 0 });
    attacker.statuses.apply("way-of-perfection", 60, "a", NO_RANKS);
    attacker.statuses.apply("critical-eye", 30, "a", NO_RANKS);
    const events: CombatEvent[] = [];
    landedCritical(attacker, 12, events);
    expect(events).toEqual([
      { kind: "energy-gain", targetId: "a", amount: criticalStrikesEnergy(12) + 1 },
      { kind: "heal", targetId: "a", amount: 34 },
    ]);
  });

  it("gains nothing at full Health, and nothing when dead", () => {
    const full = makeCombatant({ id: "a", energy: 60 });
    full.statuses.apply("way-of-perfection", 60, "a", NO_RANKS);
    const events: CombatEvent[] = [];
    landedCritical(full, 0, events);
    expect(events).toEqual([]);
  });

  /** Health the assassin gains from its blows over 3 s, every blow a crit or none. */
  function gained(crits: boolean): number {
    const ruleset: Ruleset = {
      ...RULES,
      combat: {
        ...RULES.combat,
        criticalBaseChance: crits ? 1 : 0,
        criticalChancePerRank: crits ? RULES.combat.criticalChancePerRank : 0,
      },
    };
    const spec = assassin(vec2(0, 0));
    const match = new MatchSimulation({
      seed: "perfection",
      ruleset,
      participants: [
        crits
          ? spec
          : {
              ...spec,
              attributeRanks: new Map([
                ["assassin.dagger-mastery", 12],
                ["assassin.shadow-arts", 12],
              ]),
            },
        body("foe", vec2(2 * RADIUS + 10, 0), { maxHealth: 1e6 }),
      ],
    });
    get(match, "sin").combatant.health = 100;
    use(match, WAY_OF_PERFECTION, "sin");
    match.requestAttack("sin", "foe");
    return healed(
      stepFor(match, 3)
        .filter((entry) => entry.sourceId === "sin" && entry.cause === "weapon")
        .flatMap((entry) => entry.events),
      "sin",
    );
  }

  it("in a match, every crit gains 34 and a blow that is no crit none", () => {
    const withCrits = gained(true);
    expect(withCrits).toBeGreaterThan(0);
    expect(withCrits % 34).toBe(0);
    expect(gained(false)).toBe(0);
  });
});

describe("Caltrops (#1326)", () => {
  it("has half the normal range", () => {
    expect(getSkill("assassin.caltrops")?.range).toBe(RANGE_SPELL / 2);
  });

  it("cripples and bleeds its foe and those adjacent for 13 s, not one twice as far", () => {
    const at = vec2(150, 0);
    const match = new MatchSimulation({
      seed: "caltrops",
      participants: [
        assassin(vec2(0, 0)),
        body("foe", at),
        body("beside", vec2(at.x, AREA_ADJACENT)),
        body("far", vec2(at.x, -2 * AREA_ADJACENT - 1)),
      ],
    });
    const entry = use(match, CALTROPS, "foe");
    const applied = entry.events.flatMap((event) =>
      event.kind === "status-applied"
        ? [`${event.targetId} ${event.statusId} ${String(event.durationSeconds)}`]
        : [],
    );
    expect(applied.sort()).toEqual([
      "beside bleeding 13",
      "beside crippled 13",
      "foe bleeding 13",
      "foe crippled 13",
    ]);
  });
});

describe("the six's descriptions (#1326)", () => {
  const lines = (id: string): string[] => {
    const skill = getSkill(id);
    if (skill === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(skill).effects.map((line) => line.text);
  };
  const AWAY = "Shadow Step to a nearby location directly away from your target";

  it("say what each does", () => {
    expect(lines("assassin.heart-of-shadow")).toContain(AWAY);
    expect(lines("assassin.vipers-defense")).toContain(AWAY);
    expect(lines("assassin.deaths-retreat")).toContain("Shadow steps to the target");
    expect(lines("assassin.caltrops")).toContain("Half the normal range");
    expect(lines("assassin.feigned-neutrality").join(" ")).toMatch(
      /ends if the bearer hits with an attack/,
    );
    expect(lines("assassin.way-of-perfection").join(" ")).toMatch(
      /whenever you successfully land a critical hit, you gain 34 Health/,
    );
  });
});

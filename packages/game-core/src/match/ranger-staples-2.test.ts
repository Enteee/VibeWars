import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import { stateHolds, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import type { Skill, StateCondition } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The Ranger staples 2 (#1539): an `any-of` condition, a status that
 * shortens every skill's recharge, and the seven Ranger skills on them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const DUAL_SHOT = "ranger.dual-shot";
const MELANDRUS_SHOT = "ranger.melandrus-shot";
const ZOJUNS_SHOT = "ranger.zojuns-shot";
const POINT_BLANK_SHOT = "ranger.point-blank-shot";
const WHIRLING_DEFENSE = "ranger.whirling-defense";
const SERPENTS_QUICKNESS = "ranger.serpents-quickness";
const DODGE = "ranger.dodge";
/** A spell, to read the spells' share beside Serpent's Quickness's. */
const CRY = "mesmer.cry-of-frustration";
/** A signet: another stance would end Serpent's Quickness before its recharge is read. */
const SIGNET = "warrior.healing-signet";
const BAR = [
  DUAL_SHOT,
  MELANDRUS_SHOT,
  ZOJUNS_SHOT,
  POINT_BLANK_SHOT,
  WHIRLING_DEFENSE,
  SERPENTS_QUICKNESS,
  DODGE,
  CRY,
  SIGNET,
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
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

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `r`, a rank-12 Ranger with a longbow and `BAR`, at the origin. */
function ranger(extra: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["ranger.expertise", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    ...extra,
  });
}

/** `r` and `more`; `f`, its foe, 200 east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], seed = "ranger-staples-2") {
  const participants = [ranger(), ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(200, 0)));
  }
  return new MatchSimulation({ seed, ruleset: NO_CRIT, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `r` uses `skillId` on `targetId`: what its skill logged until it landed. */
function used(sim: MatchSimulation, skillId: string, targetId = "f"): CombatEvent[] {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    events.push(...logged);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error(`${skillId} never landed`);
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("the any-of condition (#1539)", () => {
  const MOVING_OR_DOWN: StateCondition = {
    kind: "any-of",
    conditions: [{ kind: "target-moving" }, { kind: "target-knocked-down" }],
  };
  const holds = (condition: StateCondition, moving: boolean, knockedDown: boolean) => {
    const target = makeCombatant({ id: "t", team: 1 });
    target.moving = moving;
    target.knockdownRemaining = knockedDown ? 2 : 0;
    return stateHolds(condition, makeCombatant({ id: "c" }), target, new Map());
  };

  it("holds when one of its conditions does, and not when none does", () => {
    expect(holds(MOVING_OR_DOWN, true, false)).toBe(true);
    expect(holds(MOVING_OR_DOWN, false, true)).toBe(true);
    expect(holds(MOVING_OR_DOWN, true, true)).toBe(true);
    expect(holds(MOVING_OR_DOWN, false, false)).toBe(false);
  });

  it("never holds with no conditions", () => {
    expect(holds({ kind: "any-of", conditions: [] }, true, true)).toBe(false);
  });
});

describe("Serpent's Quickness and skillRechargeFaster (#1539)", () => {
  /** `skillId`'s recharge, used by `r` at `f` under `statuses`. */
  function recharge(skillId: string, statuses: readonly StatusId[]): number | undefined {
    const sim = match();
    // Below full, so Healing Signet heals and logs.
    get(sim, "r").combatant.health -= 500;
    for (const statusId of statuses) {
      get(sim, "r").combatant.statuses.apply(statusId, 1000, "r", NO_RANKS);
    }
    used(sim, skillId, skill(skillId).target === "self" ? "r" : "f");
    return get(sim, "r").combatant.cast.rechargeTotal.get(skillId);
  }

  it("takes 33% off an attack's and a signet's recharge", () => {
    expect(recharge(ZOJUNS_SHOT, [])).toBe(3);
    expect(recharge(ZOJUNS_SHOT, ["serpents-quickness"])).toBeCloseTo(3 * 0.67, 9);
    expect(recharge(SIGNET, [])).toBe(4);
    expect(recharge(SIGNET, ["serpents-quickness"])).toBeCloseTo(4 * 0.67, 9);
  });

  it("shortens its own: a 45 s recharge starts at 30.15 s", () => {
    expect(recharge(SERPENTS_QUICKNESS, [])).toBeCloseTo(45 * 0.67, 9);
  });

  it("with Mantra of Recovery, a spell takes the larger share, not both", () => {
    expect(recharge(CRY, ["mantra-of-recovery"])).toBeCloseTo(20 * 0.67, 9);
    expect(recharge(CRY, ["serpents-quickness"])).toBeCloseTo(20 * 0.67, 9);
    const sim = match();
    const statuses = get(sim, "r").combatant.statuses;
    statuses.apply("serpents-quickness", 1000, "r", NO_RANKS);
    statuses.apply("mantra-of-recovery", 1000, "r", NO_RANKS);
    used(sim, CRY);
    expect(get(sim, "r").combatant.cast.rechargeTotal.get(CRY)).toBeCloseTo(20 * 0.67, 9);
  });

  it("ends when a foe's damage leaves its bearer below half health, not before", () => {
    const sim = match([
      spec("f", 1, vec2(RANGE_MELEE / 2, 0), {
        equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
      }),
    ]);
    const bearer = get(sim, "r").combatant;
    bearer.statuses.apply("serpents-quickness", 27, "r", NO_RANKS);
    bearer.health = bearer.maxHealth * 0.5 + 1;
    expect(sim.requestAttack("f", "r")).toEqual({ ok: true });
    for (let i = 0; i < 10 / DT && bearer.health >= bearer.maxHealth * 0.5; i += 1) {
      sim.step(DT);
      if (bearer.health >= bearer.maxHealth * 0.5) {
        expect(bearer.statuses.has("serpents-quickness")).toBe(true);
      }
    }
    expect(bearer.health).toBeLessThan(bearer.maxHealth * 0.5);
    expect(bearer.statuses.has("serpents-quickness")).toBe(false);
  });

  it("does not end on Bleeding below half, until a foe damages its bearer", () => {
    const sim = match();
    const bearer = get(sim, "r").combatant;
    bearer.statuses.apply("serpents-quickness", 27, "r", NO_RANKS);
    bearer.statuses.apply("bleeding", 100, "f", NO_RANKS);
    bearer.health = bearer.maxHealth * 0.5 + 1;
    stepFor(sim, 2);
    expect(bearer.health).toBeLessThan(bearer.maxHealth * 0.5);
    expect(bearer.statuses.has("serpents-quickness")).toBe(true);
  });
});

describe("Dual Shot (#1539)", () => {
  it("is two blows from one arrow, each 25% weaker", () => {
    expect(skill(DUAL_SHOT)).toMatchObject({
      attributeId: undefined,
      cost: { kind: "energy", amount: 10 },
      rechargeSeconds: 10,
      attack: { weapon: "bow", weaponDamage: 0.75, strikes: 2 },
    });
    expect(damageTo(used(match(), DUAL_SHOT), "f")).toHaveLength(2);
  });

  it("rolls each blow's block on its own: against 75% block, sometimes just one lands", () => {
    const landed = new Set<number>();
    for (let n = 0; n < 40; n += 1) {
      const sim = match([], `dual-${String(n)}`);
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      landed.add(damageTo(used(sim, DUAL_SHOT), "f").length);
    }
    expect([...landed].sort()).toEqual([0, 1, 2]);
  });
});

describe("Melandru's Shot (#1539)", () => {
  /** What one shot does to `f`, knocked down or walking when `state` says. */
  function shot(state: "still" | "knocked-down" | "moving") {
    const sim = match([], "melandru");
    const foe = get(sim, "f").combatant;
    if (state === "knocked-down") {
      foe.knockdownRemaining = 1000;
    }
    if (state === "moving") {
      // Walking at the archer: it never sidesteps the arrow.
      sim.setInputDirection("f", vec2(-1, 0));
    }
    const events = used(sim, MELANDRUS_SHOT);
    return {
      damage: damageTo(events, "f"),
      bleeding: foe.statuses.get("bleeding")?.durationSeconds,
      crippled: foe.statuses.get("crippled")?.durationSeconds,
    };
  }

  it("on a foe standing still, Bleeding for 21 s only", () => {
    const still = shot("still");
    expect(still.damage).toHaveLength(1);
    expect(still.bleeding).toBe(21);
    expect(still.crippled).toBeUndefined();
  });

  it("on a foe knocked down or walking, +22 damage and Crippled for 13 s too", () => {
    const [still] = shot("still").damage;
    for (const state of ["knocked-down", "moving"] as const) {
      const hit = shot(state);
      expect(hit.damage, state).toEqual([(still ?? 0) + 22]);
      expect(hit.bleeding, state).toBe(21);
      expect(hit.crippled, state).toBe(13);
    }
  });
});

describe("Zojun's Shot and Point Blank Shot (#1539)", () => {
  it("reach half a bow's range and strike for +34", () => {
    for (const id of [ZOJUNS_SHOT, POINT_BLANK_SHOT]) {
      expect(skill(id), id).toMatchObject({
        attributeId: "ranger.expertise",
        cost: { kind: "energy", amount: 5 },
        rechargeSeconds: 3,
        range: 260,
        attack: { weapon: "bow", bonusDamage: { scaling: { atTwelve: 34 } } },
      });
    }
  });

  it("at a foe 300 away, the archer walks in to 260 first", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    const events = used(sim, ZOJUNS_SHOT);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(get(sim, "r").position.x).toBeGreaterThanOrEqual(40 - 1e-6);
  });
});

describe("Whirling Defense (#1539)", () => {
  it("blocks 75% of attacks, melee and projectile", () => {
    const bearer = makeCombatant({ id: "r" });
    bearer.statuses.apply("whirling-defense", 18, "r", NO_RANKS);
    expect(blockChanceOf(bearer, "melee")).toBe(0.75);
    expect(blockChanceOf(bearer, "projectile")).toBe(0.75);
  });

  it("a blocked arrow deals 10 to the foes adjacent to its bearer, not the archer", () => {
    const sim = match([
      spec("f", 1, vec2(500, 0), { equipment: wielding(WEAPONS.longbow, "ranger.marksmanship") }),
      spec("east", 1, vec2(AREA_ADJACENT / 2, 0)),
    ]);
    get(sim, "r").combatant.statuses.apply("whirling-defense", 1000, "r", NO_RANKS);
    expect(sim.requestAttack("f", "r")).toEqual({ ok: true });
    let splash: CombatEvent[] = [];
    for (let i = 0; i < 20 / DT && splash.length === 0; i += 1) {
      splash = sim
        .step(DT)
        .log.filter((entry) => entry.skillId === WHIRLING_DEFENSE)
        .flatMap((entry) => entry.events);
    }
    expect(damageTo(splash, "east")).toEqual([10]);
    expect(damageTo(splash, "f")).toEqual([]);
  });
});

describe("Dodge (#1539)", () => {
  it("moves 33% faster and blocks 65% of projectiles, no melee blow", () => {
    const bearer = makeCombatant({ id: "r" });
    bearer.statuses.apply("dodge", 10, "r", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).moveSpeedMultiplier).toBe(1.33);
    expect(blockChanceOf(bearer, "projectile")).toBe(0.65);
    expect(blockChanceOf(bearer, "melee")).toBe(0);
  });

  it("ends as its bearer releases a shot", () => {
    const sim = match();
    get(sim, "r").combatant.statuses.apply("dodge", 10, "r", NO_RANKS);
    used(sim, ZOJUNS_SHOT);
    expect(get(sim, "r").combatant.statuses.has("dodge")).toBe(false);
  });
});

describe("the texts (#1539)", () => {
  const ranks = ranger().attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what each does", () => {
    expect(text(DUAL_SHOT)).toEqual(["Shoots 2 arrows at once, each dealing 25% less damage"]);
    expect(text(MELANDRUS_SHOT)).toEqual([
      "If target is moving or target is knocked down: +22 damage",
      "Applies Bleeding for 21s (−3 Health degeneration)",
      "If target is moving or target is knocked down: applies Crippled for 13s (moves at 50% speed)",
    ]);
    expect(text(ZOJUNS_SHOT)).toEqual(["+34 damage"]);
    expect(describeStatus("whirling-defense", ranks)).toBe(
      "75% chance to block attacks. If you block a projectile attack, adjacent foes: deals 10 damage",
    );
    expect(describeStatus("serpents-quickness", ranks)).toBe(
      "skills recharge 33% faster. Whenever it takes damage or life steal from a foe, if it is below 50% Health: ends the target's stance",
    );
    expect(describeStatus("dodge", ranks)).toBe(
      "moves at 133% speed, 65% chance to block projectiles, ends if the bearer attacks",
    );
  });
});

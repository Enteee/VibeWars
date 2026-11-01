import { describe, expect, it } from "vitest";

import {
  ONE_ELITE_PER_BAR,
  defaultBuildEquipment,
  validatePlayerBuild,
  type PlayerBuild,
} from "../build.js";
import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { effectiveArmor, mitigate, skillDamage } from "../skills/damage.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { chargeAdrenaline, makeCombatant } from "../skills/testing.js";
import { advanceStatuses } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveAttackSkill, resolveSwing, skillBlow } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FALL_BACK = "paragon.fall-back";
const STAND = "paragon.stand-your-ground";
const CRUEL_SPEAR = "paragon.cruel-spear";
const NEVER_SURRENDER = "paragon.never-surrender";
const LEADERS_COMFORT = "paragon.leaders-comfort";
const INCOMING = "paragon.incoming";
const MAKE_HASTE = "paragon.make-haste";
const DEFENSIVE_ANTHEM = "paragon.defensive-anthem";
const SPEAR_OF_LIGHTNING = "paragon.spear-of-lightning";
const SWIFT_CHOP = "warrior.swift-chop";

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

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    spawn,
    facing: 0,
    ...extra,
  };
}

/** A rank-12 Command and Spear Mastery paragon: the two shouts, then Cruel Spear. */
const commander = (spawn: Vec2): ParticipantSpec =>
  spec("p", 0, spawn, {
    skillBar: [FALL_BACK, STAND, CRUEL_SPEAR],
    attributeRanks: new Map([
      ["paragon.command", 12],
      ["paragon.spear-mastery", 12],
    ]),
    equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
    maxEnergy: 100,
  });

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

/** A rank-12 axe warrior. */
const axeman = (): Combatant =>
  makeCombatant({
    id: "a",
    team: 0,
    equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    attributeRanks: new Map([["warrior.axe-mastery", 12]]),
  });

const victim = (): Combatant => makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });

function swing(attacker: Combatant, target: Combatant, seed = 1): CombatEvent[] {
  return resolveSwing({
    attacker,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: createRng(seed),
    rules: RULES.combat,
    exposed: () => false,
  }).events;
}

function bystander(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    spawn,
    facing: 0,
  };
}

/** A rank-12 Paragon at the origin with `skillId` in slot 0. */
function paragon(skillId: string): ParticipantSpec {
  return {
    ...bystander("p", 0, vec2(0, 0)),
    skillBar: [skillId],
    attributeRanks: new Map([
      ["paragon.command", 12],
      ["paragon.leadership", 12],
    ]),
  };
}

/** Steps until `skillId` has resolved, and returns the events it logged. */
function useSkill(match: MatchSimulation, skillId: string) {
  expect(match.requestSkill("p", 0)?.check).toEqual({ ok: true });
  for (let tick = 0; tick < 5 * RULES.tickRateHz; tick++) {
    const entry = match.step(DT).log.find((row) => row.skillId === skillId);
    if (entry !== undefined) {
      return entry.events;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

describe("who is moving (#921)", () => {
  it("one holding a direction is moving the tick after; one standing is not", () => {
    const match = new MatchSimulation({
      seed: "moving",
      participants: [spec("walker", 0, vec2(0, 0)), spec("still", 0, vec2(0, 200))],
    });
    match.setInputDirection("walker", vec2(1, 0));
    match.step(DT);
    expect(get(match, "walker").combatant.moving).toBe(true);
    expect(get(match, "still").combatant.moving).toBe(false);
    match.setInputDirection("walker", vec2(0, 0));
    match.step(DT);
    expect(get(match, "walker").combatant.moving).toBe(false);
  });

  it("knocked down, or walking into the arena's edge, is not moving", () => {
    const radius = RULES.collision.playerRadius;
    const match = new MatchSimulation({
      seed: "moving",
      bounds: { width: 600, height: 600 },
      participants: [spec("down", 0, vec2(300, 300)), spec("edge", 0, vec2(radius, 100))],
    });
    get(match, "down").combatant.knockdownRemaining = 2;
    match.setInputDirection("down", vec2(1, 0));
    match.setInputDirection("edge", vec2(-1, 0));
    stepFor(match, 0.5);
    expect(get(match, "down").combatant.moving).toBe(false);
    expect(get(match, "edge").combatant.moving).toBe(false);
  });

  it("a reset puts it back at its spawn standing still", () => {
    const match = new MatchSimulation({
      seed: "moving",
      participants: [spec("walker", 0, vec2(0, 0))],
    });
    match.setInputDirection("walker", vec2(1, 0));
    stepFor(match, 0.5);
    expect(get(match, "walker").combatant.moving).toBe(true);
    match.resetParticipant("walker");
    expect(get(match, "walker").combatant.moving).toBe(false);
  });
});

describe('"Fall Back!" (#921)', () => {
  it("reaches every ally in earshot, the paragon too, for 9 s", () => {
    const match = new MatchSimulation({
      seed: "fall-back",
      participants: [
        commander(vec2(0, 0)),
        spec("near", 0, vec2(AREA_EARSHOT - 10, 0)),
        spec("far", 0, vec2(0, -2 * AREA_EARSHOT)),
        spec("foe", 1, vec2(40, 0)),
      ],
    });
    expect(match.requestSkill("p", 0)?.check).toEqual({ ok: true });
    match.step(DT);
    for (const id of ["p", "near"]) {
      expect(get(match, id).combatant.statuses.get("fall-back")?.remainingSeconds).toBeCloseTo(
        9,
        0,
      );
    }
    expect(get(match, "far").combatant.statuses.has("fall-back")).toBe(false);
    expect(get(match, "foe").combatant.statuses.has("fall-back")).toBe(false);
  });

  it("moves its bearer 33% faster", () => {
    const walked = (fallBack: boolean): number => {
      const match = new MatchSimulation({
        seed: "fall-back",
        participants: [spec("a", 0, vec2(0, 0))],
      });
      if (fallBack) {
        get(match, "a").combatant.statuses.apply("fall-back", 9, "p", NO_RANKS);
      }
      match.setInputDirection("a", vec2(1, 0));
      stepFor(match, 1);
      return get(match, "a").position.x;
    };
    expect(walked(true)).toBeCloseTo(walked(false) * 1.33);
  });

  it("heals a moving bearer 13 a second and a still one nothing", () => {
    const healed = (walking: boolean): number => {
      const match = new MatchSimulation({
        seed: "fall-back",
        participants: [spec("a", 0, vec2(0, 0), { maxHealth: 500, startHealthFraction: 0.5 })],
      });
      get(match, "a").combatant.statuses.apply("fall-back", 9, "p", NO_RANKS);
      match.setInputDirection("a", walking ? vec2(1, 0) : vec2(0, 0));
      // The first tick only starts it moving.
      match.step(DT);
      const before = get(match, "a").combatant.health;
      stepFor(match, 1);
      return get(match, "a").combatant.health - before;
    };
    expect(healed(true)).toBeCloseTo(13);
    expect(healed(false)).toBe(0);
  });

  it("is a heal: Deep Wound cuts it, and it stops at full health", () => {
    const bearer = makeCombatant({ id: "a", health: 100, maxHealth: 500, moving: true });
    bearer.statuses.apply("fall-back", 9, "p", NO_RANKS);
    bearer.statuses.apply("deep-wound", 9, "foe", NO_RANKS);
    const reduced = 13 * aggregateModifiers(bearer.statuses.active).healingMultiplier;
    expect(reduced).toBeLessThan(13);
    advanceStatuses(bearer, 1, 0);
    expect(bearer.health).toBeCloseTo(100 + reduced);

    const full = makeCombatant({ id: "b", health: 495, maxHealth: 500, moving: true });
    full.statuses.apply("fall-back", 9, "p", NO_RANKS);
    expect(advanceStatuses(full, 1, 0)).toEqual([{ kind: "heal", targetId: "b", amount: 5 }]);
    expect(full.health).toBe(500);
  });

  it("ends on its bearer's hit, not on a miss or a block", () => {
    const hitter = axeman();
    hitter.statuses.apply("fall-back", 9, "p", NO_RANKS);
    expect(swing(hitter, victim())).toContainEqual({
      kind: "status-expired",
      targetId: "a",
      statusId: "fall-back",
    });
    expect(hitter.statuses.has("fall-back")).toBe(false);

    let seenMiss = false;
    let seenBlock = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const attacker = axeman();
      attacker.statuses.apply("blind", 10, "foe", NO_RANKS);
      attacker.statuses.apply("fall-back", 9, "p", NO_RANKS);
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      const events = swing(attacker, target, seed);
      const hit = events.some((event) => event.kind === "damage");
      seenMiss ||= events.some((event) => event.kind === "attack-missed");
      seenBlock ||= events.some((event) => event.kind === "attack-blocked");
      expect(attacker.statuses.has("fall-back")).toBe(!hit);
    }
    expect(seenMiss).toBe(true);
    expect(seenBlock).toBe(true);
  });
});

describe('"Stand Your Ground!" (#921)', () => {
  it("reaches every ally in earshot for 17 s", () => {
    const match = new MatchSimulation({
      seed: "stand",
      participants: [
        commander(vec2(0, 0)),
        spec("near", 0, vec2(AREA_EARSHOT - 10, 0)),
        spec("far", 0, vec2(0, -2 * AREA_EARSHOT)),
      ],
    });
    expect(match.requestSkill("p", 1)?.check).toEqual({ ok: true });
    match.step(DT);
    for (const id of ["p", "near"]) {
      expect(
        get(match, id).combatant.statuses.get("stand-your-ground")?.remainingSeconds,
      ).toBeCloseTo(17, 0);
    }
    expect(get(match, "far").combatant.statuses.has("stand-your-ground")).toBe(false);
  });

  it("+24 armor while still: a still bearer takes less than a moving one", () => {
    const bearer = makeCombatant({ id: "a" });
    bearer.statuses.apply("stand-your-ground", 17, "p", NO_RANKS);
    const blow = skillDamage(100, "piercing", 0);
    const still = effectiveArmor(bearer, blow, "chest");
    const stillDamage = mitigate(blow, bearer, RULES.combat, "chest");
    bearer.moving = true;
    expect(still - effectiveArmor(bearer, blow, "chest")).toBe(24);
    expect(stillDamage).toBeLessThan(mitigate(blow, bearer, RULES.combat, "chest"));
  });

  it("starts and stops a tick after its bearer does", () => {
    const match = new MatchSimulation({
      seed: "stand",
      participants: [spec("a", 0, vec2(0, 0))],
    });
    const bearer = get(match, "a").combatant;
    bearer.statuses.apply("stand-your-ground", 17, "p", NO_RANKS);
    const blow = skillDamage(100, "piercing", 0);
    const armored = (): number => effectiveArmor(bearer, blow, "chest");
    match.step(DT);
    const standing = armored();
    match.setInputDirection("a", vec2(1, 0));
    match.step(DT);
    expect(armored()).toBe(standing - 24);
    match.setInputDirection("a", vec2(0, 0));
    match.step(DT);
    expect(armored()).toBe(standing);
  });

  it("ends when its bearer attacks, hit or miss", () => {
    const attacker = axeman();
    attacker.statuses.apply("stand-your-ground", 17, "p", NO_RANKS);
    attacker.statuses.apply("blind", 10, "foe", NO_RANKS);
    swing(attacker, victim());
    expect(attacker.statuses.has("stand-your-ground")).toBe(false);
  });
});

describe("Cruel Spear (#921)", () => {
  /** Cruel Spear thrown from the paragon at a foe 300 away; the foe's statuses after. */
  function thrown(foeWalks: boolean): CombatLogEntry[] {
    const match = new MatchSimulation({
      seed: "cruel",
      participants: [commander(vec2(0, 0)), spec("foe", 1, vec2(300, 0))],
    });
    chargeAdrenaline(get(match, "p").combatant);
    match.setTarget("p", "foe");
    if (foeWalks) {
      match.setInputDirection("foe", vec2(0, 1));
    }
    expect(match.requestSkill("p", 2)?.check).toEqual({ ok: true });
    return stepFor(match, 2).filter((entry) => entry.skillId === CRUEL_SPEAR);
  }

  const statusesOn = (log: readonly CombatLogEntry[]): string[] =>
    log.flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "status-applied" ? [`${event.targetId}:${event.statusId}`] : [],
      ),
    );

  it("an elite spear attack, +42 at rank 12", () => {
    const spear = skill(CRUEL_SPEAR);
    expect(spear.elite).toBe(true);
    expect(spear.attack?.weapon).toBe("spear");
    const caster = makeCombatant({
      id: "p",
      attributeRanks: new Map([["paragon.spear-mastery", 12]]),
    });
    expect(skillBlow(spear, caster, new Map()).bonus).toBe(42);
  });

  it("deep wounds a still target for 17 s", () => {
    const log = thrown(false);
    expect(log.flatMap((entry) => entry.events.map((event) => event.kind))).toContain("damage");
    expect(statusesOn(log)).toEqual(["foe:deep-wound"]);
  });

  it("does not wound a moving one", () => {
    const log = thrown(true);
    expect(log.flatMap((entry) => entry.events.map((event) => event.kind))).toContain("damage");
    expect(statusesOn(log)).toEqual([]);
  });
});

describe("the Paragon shouts read as what they do (#921)", () => {
  const text = (id: string): string[] =>
    describeSkill(skill(id)).effects.map((effect) => effect.text);

  it("Fall Back!, Stand Your Ground! and Cruel Spear", () => {
    expect(text(FALL_BACK)).toEqual([
      "Applies Fall Back! for 9s (13 Health per second while moving, moves at 133% speed, " +
        "ends if the bearer hits with an attack)",
    ]);
    expect(text(STAND)).toEqual([
      "Applies Stand Your Ground! for 17s (+24 armor while not moving, ends if the bearer attacks)",
    ]);
    expect(text(CRUEL_SPEAR)).toEqual([
      "+10 damage",
      "If target is not moving: applies Deep Wound for 17s " +
        "(−20% maximum health (at most 100), −20% healing)",
    ]);
  });
});

describe('"Never Surrender!" (#923)', () => {
  it("gives +4 pips for 10 s to allies in earshot below 75% Health only", () => {
    const match = new MatchSimulation({
      seed: "never-surrender",
      participants: [
        paragon(NEVER_SURRENDER),
        bystander("hurt", 0, vec2(100, 0)),
        bystander("healthy", 0, vec2(0, 100)),
        bystander("exactly", 0, vec2(-100, 0)),
        bystander("far", 0, vec2(0, -(AREA_EARSHOT + 10))),
        bystander("foe", 1, vec2(40, 0)),
      ],
    });
    get(match, "hurt").combatant.health = 500;
    get(match, "healthy").combatant.health = 800;
    get(match, "exactly").combatant.health = 750;
    get(match, "far").combatant.health = 500;
    get(match, "foe").combatant.health = 500;

    const events = useSkill(match, NEVER_SURRENDER);

    expect(events.filter((event) => event.kind === "status-applied")).toEqual([
      {
        kind: "status-applied",
        targetId: "hurt",
        statusId: "never-surrender",
        durationSeconds: 10,
      },
    ]);
    for (const id of ["p", "healthy", "exactly", "far", "foe"]) {
      expect(get(match, id).combatant.statuses.has("never-surrender"), id).toBe(false);
    }
  });

  it("regenerates 8 Health a second, and stays on once healed above 75%", () => {
    const match = new MatchSimulation({
      seed: "never-surrender",
      participants: [paragon(NEVER_SURRENDER), bystander("hurt", 0, vec2(100, 0))],
    });
    const hurt = get(match, "hurt").combatant;
    hurt.health = 500;
    useSkill(match, NEVER_SURRENDER);
    hurt.health = 900;
    for (let tick = 0; tick < RULES.tickRateHz; tick++) {
      match.step(DT);
    }
    expect(hurt.statuses.has("never-surrender")).toBe(true);
    expect(hurt.health).toBeCloseTo(908, 0);
  });
});

describe("Leader's Comfort (#923)", () => {
  /** The Paragon at 100 Health uses it among `others`; what it healed itself for. */
  function comfort(others: readonly ParticipantSpec[], prepare?: (match: MatchSimulation) => void) {
    const match = new MatchSimulation({
      seed: "leaders-comfort",
      participants: [paragon(LEADERS_COMFORT), ...others],
    });
    get(match, "p").combatant.health = 100;
    prepare?.(match);
    const events = useSkill(match, LEADERS_COMFORT);
    return events.flatMap((event) =>
      event.kind === "heal" && event.targetId === "p" ? [event.amount] : [],
    );
  }

  const allies = (count: number): ParticipantSpec[] =>
    Array.from({ length: count }, (_, i) => bystander(`a${String(i)}`, 0, vec2(50 * (i + 1), 0)));

  it("heals 66 + 18 per ally in earshot, itself included: 84 alone, 102 with one", () => {
    expect(comfort([])).toEqual([84]);
    expect(comfort(allies(1))).toEqual([102]);
    expect(comfort(allies(3))).toEqual([138]);
  });

  it("heals at most 140", () => {
    expect(comfort(allies(4))).toEqual([140]);
    expect(comfort(allies(5))).toEqual([140]);
  });

  it("counts no foe and no ally outside earshot", () => {
    expect(
      comfort([bystander("foe", 1, vec2(0, 50)), bystander("far", 0, vec2(AREA_EARSHOT + 10, 0))]),
    ).toEqual([84]);
  });

  it("counts no dead ally", () => {
    let dead: Combatant | undefined;
    const heals = comfort([bystander("dead", 0, vec2(50, 0))], (match) => {
      // Burning at 0.2 Health kills on the first tick, as a death does.
      dead = get(match, "dead").combatant;
      dead.statuses.apply("burning", 10, "foe", NO_RANKS);
      dead.health = 0.2;
    });
    expect(dead?.dead).toBe(true);
    expect(heals).toEqual([84]);
  });

  it("caps before a Deep Wound's −20% healing", () => {
    const heals = comfort(allies(5), (match) => {
      get(match, "p").combatant.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    });
    expect(heals).toEqual([140 * 0.8]);
  });
});

describe('"Incoming!" (#956)', () => {
  it("an elite shout that reaches every ally in earshot, the paragon too, for 9 s", () => {
    expect(skill(INCOMING).elite).toBe(true);
    const match = new MatchSimulation({
      seed: "incoming",
      participants: [
        paragon(INCOMING),
        bystander("near", 0, vec2(AREA_EARSHOT - 10, 0)),
        bystander("far", 0, vec2(0, -2 * AREA_EARSHOT)),
        bystander("foe", 1, vec2(40, 0)),
      ],
    });
    useSkill(match, INCOMING);
    for (const id of ["p", "near"]) {
      expect(get(match, id).combatant.statuses.get("incoming")?.remainingSeconds).toBeCloseTo(9, 0);
    }
    expect(get(match, "far").combatant.statuses.has("incoming")).toBe(false);
    expect(get(match, "foe").combatant.statuses.has("incoming")).toBe(false);
  });

  it("moves a bearer 33% faster and heals it 13 a second while it moves, nothing standing", () => {
    const run = (incoming: boolean, walking: boolean): { x: number; healed: number } => {
      const match = new MatchSimulation({
        seed: "incoming",
        participants: [spec("a", 0, vec2(0, 0), { maxHealth: 500, startHealthFraction: 0.5 })],
      });
      if (incoming) {
        get(match, "a").combatant.statuses.apply("incoming", 9, "p", NO_RANKS);
      }
      match.setInputDirection("a", walking ? vec2(1, 0) : vec2(0, 0));
      // The first tick only starts it moving.
      match.step(DT);
      const before = get(match, "a").combatant.health;
      stepFor(match, 1);
      return { x: get(match, "a").position.x, healed: get(match, "a").combatant.health - before };
    };
    const hurried = run(true, true);
    expect(hurried.healed).toBeCloseTo(13);
    expect(hurried.x).toBeCloseTo(run(false, true).x * 1.33);
    expect(run(true, false).healed).toBe(0);
  });

  it("does not end on its bearer's hit, as Fall Back! does", () => {
    const hitter = axeman();
    hitter.statuses.apply("incoming", 9, "p", NO_RANKS);
    expect(swing(hitter, victim()).some((event) => event.kind === "damage")).toBe(true);
    expect(hitter.statuses.has("incoming")).toBe(true);
  });
});

describe('"Make Haste!" (#956)', () => {
  it("hurries another ally for 17 s, never the shouter", () => {
    const match = new MatchSimulation({
      seed: "make-haste",
      participants: [paragon(MAKE_HASTE), bystander("ally", 0, vec2(200, 0))],
    });
    match.setTarget("p", "p");
    expect(match.requestSkill("p", 0)?.check.ok).toBe(false);
    match.setTarget("p", "ally");
    useSkill(match, MAKE_HASTE);
    expect(get(match, "ally").combatant.statuses.get("make-haste")?.remainingSeconds).toBeCloseTo(
      17,
      0,
    );
    expect(get(match, "p").combatant.statuses.has("make-haste")).toBe(false);
  });

  it("ends on its bearer's landed swing, not on a miss or a block", () => {
    const hitter = axeman();
    hitter.statuses.apply("make-haste", 17, "p", NO_RANKS);
    expect(swing(hitter, victim())).toContainEqual({
      kind: "status-expired",
      targetId: "a",
      statusId: "make-haste",
    });

    let seenMiss = false;
    let seenBlock = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const attacker = axeman();
      attacker.statuses.apply("blind", 10, "foe", NO_RANKS);
      attacker.statuses.apply("make-haste", 17, "p", NO_RANKS);
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      const events = swing(attacker, target, seed);
      const hit = events.some((event) => event.kind === "damage");
      seenMiss ||= events.some((event) => event.kind === "attack-missed");
      seenBlock ||= events.some((event) => event.kind === "attack-blocked");
      expect(attacker.statuses.has("make-haste")).toBe(!hit);
    }
    expect([seenMiss, seenBlock]).toEqual([true, true]);
  });
});

describe("Defensive Anthem (#956)", () => {
  /** A rank-12 spear paragon wearing Defensive Anthem, Spear of Lightning in slot 0, a foe 300 away. */
  function spearman(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "defensive-anthem",
      participants: [
        spec("p", 0, vec2(0, 0), {
          skillBar: [SPEAR_OF_LIGHTNING],
          attributeRanks: new Map([["paragon.spear-mastery", 12]]),
          equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
          maxEnergy: 100,
        }),
        spec("foe", 1, vec2(300, 0)),
      ],
    });
    get(match, "p").combatant.statuses.apply("defensive-anthem", 9, "p", NO_RANKS);
    return match;
  }

  const damaged = (log: readonly CombatLogEntry[]): boolean =>
    log.some((entry) => entry.events.some((event) => event.kind === "damage"));

  it("an elite chant that reaches every ally in earshot, the chanter too, for 9 s", () => {
    expect(skill(DEFENSIVE_ANTHEM).elite).toBe(true);
    const match = new MatchSimulation({
      seed: "defensive-anthem",
      participants: [
        paragon(DEFENSIVE_ANTHEM),
        bystander("near", 0, vec2(AREA_EARSHOT - 10, 0)),
        bystander("far", 0, vec2(0, -2 * AREA_EARSHOT)),
      ],
    });
    useSkill(match, DEFENSIVE_ANTHEM);
    for (const id of ["p", "near"]) {
      expect(
        get(match, id).combatant.statuses.get("defensive-anthem")?.remainingSeconds,
      ).toBeCloseTo(9, 0);
    }
    expect(get(match, "far").combatant.statuses.has("defensive-anthem")).toBe(false);
  });

  it("blocks about half the attacks on its bearer", () => {
    let blocked = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const target = victim();
      target.statuses.apply("defensive-anthem", 9, "p", NO_RANKS);
      if (swing(axeman(), target, seed).some((event) => event.kind === "attack-blocked")) {
        blocked += 1;
      }
    }
    expect(blocked).toBeGreaterThan(70);
    expect(blocked).toBeLessThan(130);
  });

  it("survives its bearer's landed swing", () => {
    const hitter = axeman();
    hitter.statuses.apply("defensive-anthem", 9, "p", NO_RANKS);
    expect(swing(hitter, victim()).some((event) => event.kind === "damage")).toBe(true);
    expect(hitter.statuses.has("defensive-anthem")).toBe(true);
  });

  it("ends on a landed melee attack skill, not on a blocked one", () => {
    let seenHit = false;
    let seenBlock = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const attacker = axeman();
      attacker.energy = 20;
      attacker.statuses.apply("defensive-anthem", 9, "p", NO_RANKS);
      const target = victim();
      target.statuses.apply("guardian", 10, "ally", NO_RANKS);
      const events = resolveAttackSkill(
        {
          skill: skill(SWIFT_CHOP),
          caster: attacker,
          targets: [target],
          rng: createRng(seed),
          rules: RULES.combat,
          surroundings: new Map(),
        },
        () => false,
        [],
      );
      // A blocked Swift Chop still deals its damage: a block, not a hit.
      const blocked = events.some((event) => event.kind === "attack-blocked");
      const hit = !blocked && events.some((event) => event.kind === "damage");
      seenHit ||= hit;
      seenBlock ||= blocked;
      expect(attacker.statuses.has("defensive-anthem")).toBe(!hit);
    }
    expect([seenHit, seenBlock]).toEqual([true, true]);
  });

  it("survives a plain spear that lands, and ends when Spear of Lightning lands", () => {
    const plain = spearman();
    expect(plain.requestAttack("p", "foe")?.ok).toBe(true);
    expect(damaged(stepFor(plain, 2))).toBe(true);
    expect(get(plain, "p").combatant.statuses.has("defensive-anthem")).toBe(true);

    const thrown = spearman();
    thrown.setTarget("p", "foe");
    expect(thrown.requestSkill("p", 0)?.check).toEqual({ ok: true });
    const log = stepFor(thrown, 2).filter((entry) => entry.skillId === SPEAR_OF_LIGHTNING);
    expect(damaged(log)).toBe(true);
    expect(get(thrown, "p").combatant.statuses.has("defensive-anthem")).toBe(false);
  });
});

describe("the #956 Paragon skills read as what they do", () => {
  const text = (id: string): string[] =>
    describeSkill(skill(id)).effects.map((effect) => effect.text);

  it('"Incoming!", "Make Haste!" and Defensive Anthem', () => {
    expect(text(INCOMING)).toEqual([
      "Applies Incoming! for 9s (13 Health per second while moving, moves at 133% speed)",
    ]);
    expect(text(MAKE_HASTE)).toEqual([
      "Applies Make Haste! for 17s (moves at 133% speed, ends if the bearer hits with an attack)",
    ]);
    expect(text(DEFENSIVE_ANTHEM)).toEqual([
      "Applies Defensive Anthem for 9s " +
        "(50% chance to block attacks, ends if the bearer hits with an attack skill)",
    ]);
  });
});

describe("Song of Restoration (#999)", () => {
  const SONG = "paragon.song-of-restoration";
  const FIREBALL = "elementalist.fireball";
  const GLYPH = "elementalist.glyph-of-lesser-energy";

  /** Half-health, so a heal shows. */
  const wounded = (id: string, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    spec(id, 0, spawn, { maxHealth: 1000, startHealthFraction: 0.5, maxEnergy: 100, ...extra });

  /**
   * A Motivation paragon with the song and a glyph, two spear allies in
   * earshot with Fireball and Spear of Lightning, one ally out of it, and
   * a foe in range of them all. The song has been chanted.
   */
  function sung(motivation = 12, setup?: (match: MatchSimulation) => void) {
    const ally = { skillBar: [FIREBALL, SPEAR_OF_LIGHTNING], ...speared };
    const match = new MatchSimulation({
      seed: "song-of-restoration",
      participants: [
        wounded("p", vec2(0, 0), {
          skillBar: [SONG, GLYPH],
          attributeRanks: new Map([["paragon.motivation", motivation]]),
        }),
        wounded("near", vec2(AREA_EARSHOT - 10, 0), ally),
        wounded("near2", vec2(0, AREA_EARSHOT - 10), ally),
        wounded("far", vec2(0, -2 * AREA_EARSHOT)),
        spec("foe", 1, vec2(200, 200)),
      ],
    });
    setup?.(match);
    useSkill(match, SONG);
    return match;
  }

  const speared = {
    attributeRanks: new Map([["paragon.spear-mastery", 12]]),
    equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
  };

  const health = (match: MatchSimulation, id: string): number => get(match, id).combatant.health;
  const singing = (match: MatchSimulation, id: string): boolean =>
    get(match, id).combatant.statuses.has("song-of-restoration");

  /** What the song healed `id` for in `log`. */
  const songHealed = (log: readonly CombatLogEntry[], id: string): number =>
    log
      .filter((entry) => entry.skillId === SONG && entry.sourceId === "p")
      .flatMap((entry) => entry.events)
      .reduce(
        (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
        0,
      );

  /** `id` uses its skill in `slot` on the foe; returns what the song healed it for. */
  function uses(match: MatchSimulation, id: string, slot: number): number {
    match.setTarget(id, "foe");
    expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
    return songHealed(stepFor(match, 3), id);
  }

  it("is an elite Motivation chant: 10 energy, 1 s, 20 s, the corpus's", () => {
    const song = skill(SONG);
    expect([song.elite, song.type, song.attributeId]).toEqual([
      true,
      "chant",
      "paragon.motivation",
    ]);
    expect(song.cost).toEqual({ kind: "energy", amount: 10 });
    expect([song.activationSeconds, song.rechargeSeconds]).toEqual([1, 20]);
  });

  it("reaches every ally in earshot, the chanter too, and its own chant uses none of it", () => {
    const match = sung();
    for (const id of ["p", "near", "near2"]) {
      expect(
        get(match, id).combatant.statuses.get("song-of-restoration")?.remainingSeconds,
      ).toBeCloseTo(10, 0);
    }
    expect(singing(match, "far")).toBe(false);
    expect(health(match, "p")).toBe(500);
  });

  it("heals a member 97 on its next skill, then is gone: a second skill heals nothing", () => {
    const match = sung();
    expect(uses(match, "near", 0)).toBe(97);
    expect(singing(match, "near")).toBe(false);
    expect(singing(match, "near2")).toBe(true);
    expect(uses(match, "near", 1)).toBe(0);
  });

  it("heals the chanter on its next skill", () => {
    const match = sung();
    expect(uses(match, "p", 1)).toBe(97);
    expect(singing(match, "p")).toBe(false);
  });

  it("is a heal, so a Deep Wound cuts it by 20%", () => {
    const match = sung(12, (m) => {
      get(m, "near").combatant.statuses.apply("deep-wound", 20, "foe", NO_RANKS);
    });
    expect(uses(match, "near", 0)).toBeCloseTo(97 * 0.8);
  });

  it("heals once for an attack skill, though it is an attack too", () => {
    const match = sung();
    expect(uses(match, "near", 1)).toBe(97);
  });

  it("stays through a skill cancelled before it is used, and through a plain swing", () => {
    const match = sung();
    match.setTarget("near", "foe");
    expect(match.requestSkill("near", 0)?.check).toEqual({ ok: true });
    const cancelled = stepFor(match, 0.5);
    match.cancelAction("near");
    cancelled.push(...stepFor(match, 3));
    expect(
      cancelled.filter((entry) => entry.skillId === FIREBALL).flatMap((entry) => entry.events),
    ).toEqual([{ kind: "cancelled", targetId: "near", skillId: FIREBALL }]);
    expect(singing(match, "near")).toBe(true);
    expect(songHealed(cancelled, "near")).toBe(0);

    expect(match.requestAttack("near2", "foe")?.ok).toBe(true);
    const log = stepFor(match, 3);
    expect(log.some((entry) => entry.sourceId === "near2" && entry.weaponId !== undefined)).toBe(
      true,
    );
    expect(singing(match, "near2")).toBe(true);
    expect(songHealed(log, "near2")).toBe(0);
  });

  it("runs out after 10 s without a skill and heals nobody", () => {
    const match = sung();
    const log = stepFor(match, 10.5);
    for (const id of ["p", "near", "near2"]) {
      expect(singing(match, id)).toBe(false);
    }
    expect(log.some((entry) => entry.skillId === SONG)).toBe(false);
  });

  it("heals 45 at Motivation 0", () => {
    expect(uses(sung(0), "near", 0)).toBe(45);
  });

  it("reads as what it does", () => {
    const ranks = new Map([["paragon.motivation", 12]]);
    expect(describeSkill(skill(SONG), ranks).effects.map((effect) => effect.text)).toEqual([
      "Applies Song of Restoration for 10s (the next time it uses a skill: heals for 97)",
    ]);
  });
});

describe("spear attacks (#1030)", () => {
  const BARBED = "paragon.barbed-spear";
  const MAIMING = "paragon.maiming-spear";
  const MERCILESS = "paragon.merciless-spear";
  const STUNNING = "paragon.stunning-strike";
  const HARRIERS = "paragon.harriers-toss";

  /** A rank-12 spear Paragon `p` at the origin, its foe `foe` 300 away. */
  function arena(seed = "spears", foeHealth = 1e6): MatchSimulation {
    const match = new MatchSimulation({
      seed,
      participants: [
        spec("p", 0, vec2(0, 0), {
          skillBar: [BARBED, MAIMING, MERCILESS, STUNNING, HARRIERS],
          attributeRanks: new Map([["paragon.spear-mastery", 12]]),
          equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
          maxEnergy: 100,
        }),
        spec("foe", 1, vec2(300, 0), { maxHealth: foeHealth }),
      ],
    });
    chargeAdrenaline(get(match, "p").combatant);
    match.setTarget("p", "foe");
    return match;
  }

  /** Throw the spear in `slot` and step until it has landed: its log entry. */
  function thrown(match: MatchSimulation, slot: number): CombatLogEntry {
    expect(match.requestSkill("p", slot)?.check).toEqual({ ok: true });
    let released = false;
    for (let i = 0; i < 400; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.cause === "skill" && logged.sourceId === "p");
      released ||= match.projectiles.length > 0;
      if (entry !== undefined && released && match.projectiles.length === 0) {
        return entry;
      }
    }
    throw new Error("no spear landed");
  }

  const kinds = (entry: CombatLogEntry): string[] => entry.events.map((event) => event.kind);
  const damageOf = (entry: CombatLogEntry): number =>
    entry.events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);
  const foe = (match: MatchSimulation): Combatant => get(match, "foe").combatant;
  const durationOn = (match: MatchSimulation, statusId: StatusId): number | undefined =>
    foe(match).statuses.get(statusId)?.durationSeconds;

  it("cost, activate and recharge as the PvP corpus says, all needing a spear", () => {
    const rows = [BARBED, MAIMING, MERCILESS, STUNNING, HARRIERS].map((id) => {
      const found = skill(id);
      return [id, found.cost, found.activationSeconds, found.rechargeSeconds, found.elite];
    });
    expect(rows).toEqual([
      [BARBED, { kind: "adrenaline", amount: 2 }, 0, 0, false],
      [MAIMING, { kind: "energy", amount: 5 }, 0, 5, false],
      [MERCILESS, { kind: "adrenaline", amount: 6 }, 0, 0, false],
      [STUNNING, { kind: "adrenaline", amount: 8 }, 0, 0, true],
      [HARRIERS, { kind: "energy", amount: 10 }, 1, 10, false],
    ]);
    for (const id of [BARBED, MAIMING, MERCILESS, STUNNING, HARRIERS]) {
      expect(skill(id).attack?.weapon).toBe("spear");
    }
  });

  it("Barbed Spear bleeds for 17 s when it hits", () => {
    const match = arena();
    expect(kinds(thrown(match, 0))).toEqual(["damage", "status-applied", "adrenaline-gained"]);
    expect(durationOn(match, "bleeding")).toBe(17);
  });

  it("Barbed Spear bleeds nobody when it is blocked", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = arena(`block-${String(seed)}`);
      foe(match).statuses.apply("guardian", 1000, "foe", NO_RANKS);
      const landed = thrown(match, 0);
      if (!kinds(landed).includes("attack-blocked")) {
        continue;
      }
      expect(kinds(landed)).toEqual(["attack-blocked"]);
      expect(foe(match).statuses.has("bleeding")).toBe(false);
      return;
    }
    throw new Error("no seed blocked the spear");
  });

  it("Maiming Spear cripples a Bleeding foe for 17 s, and a clean one not at all", () => {
    const clean = arena();
    expect(kinds(thrown(clean, 1))).toEqual(["damage"]);
    expect(foe(clean).statuses.has("crippled")).toBe(false);

    const barbed = arena();
    thrown(barbed, 0);
    expect(kinds(thrown(barbed, 1))).toEqual(["damage", "status-applied", "adrenaline-gained"]);
    expect(durationOn(barbed, "crippled")).toBe(17);
  });

  it("Merciless Spear deep-wounds a foe below half Health, read after its own hit", () => {
    const healthy = arena("merciless", 1000);
    foe(healthy).health = 800;
    thrown(healthy, 2);
    expect(foe(healthy).statuses.has("deep-wound")).toBe(false);

    const low = arena("merciless", 1000);
    foe(low).health = 400;
    thrown(low, 2);
    expect(durationOn(low, "deep-wound")).toBe(17);

    const pushed = arena("merciless", 1000);
    foe(pushed).health = 505;
    const landed = thrown(pushed, 2);
    expect(damageOf(landed)).toBeGreaterThan(5);
    expect(durationOn(pushed, "deep-wound")).toBe(17);
  });

  it("Stunning Strike hits 42 harder than a plain spear on the same roll", () => {
    expect(damageOf(thrown(arena(), 3)) - damageOf(thrown(arena(), 0))).toBe(42);
  });

  it("Stunning Strike dazes a foe with a condition for 9 s, not a clean or a hexed one", () => {
    const clean = arena();
    thrown(clean, 3);
    expect(foe(clean).statuses.has("dazed")).toBe(false);

    const hexed = arena();
    foe(hexed).statuses.apply("faintheartedness", 1000, "p", NO_RANKS);
    thrown(hexed, 3);
    expect(foe(hexed).statuses.has("dazed")).toBe(false);

    const bleeding = arena();
    thrown(bleeding, 0);
    thrown(bleeding, 3);
    expect(durationOn(bleeding, "dazed")).toBe(9);
  });

  it("Harrier's Toss: +17 on a standing foe, 33 more on a moving one", () => {
    const plain = damageOf(thrown(arena(), 0));
    expect(damageOf(thrown(arena(), 4)) - plain).toBe(17);
    const walking = arena();
    walking.setInputDirection("foe", vec2(0, 1));
    expect(damageOf(thrown(walking, 4)) - plain).toBe(50);
  });

  it("Stunning Strike shares a bar with Cruel Spear only illegally: one elite", () => {
    const bar = (...ids: string[]): PlayerBuild["skillBar"] => [
      ...ids,
      ...Array<null>(8 - ids.length).fill(null),
    ];
    const build = (...ids: string[]): PlayerBuild => ({
      name: "Spear Tester",
      primaryProfession: "paragon",
      secondaryProfession: "warrior",
      attributes: [],
      skillBar: bar(...ids),
      equipment: defaultBuildEquipment("paragon"),
    });
    const problems = (...ids: string[]): string[] =>
      validatePlayerBuild(build(...ids), RULES.attributes).map((problem) => problem.message);
    expect(problems(BARBED, MAIMING, MERCILESS, STUNNING, HARRIERS)).toEqual([]);
    expect(problems(STUNNING, CRUEL_SPEAR)).toEqual([ONE_ELITE_PER_BAR]);
  });
});

describe("the #1030 spear attacks read as what they do", () => {
  const text = (id: string): string[] =>
    describeSkill(skill(id)).effects.map((effect) => effect.text);

  it("Barbed, Maiming and Merciless Spear, Stunning Strike and Harrier's Toss", () => {
    expect(
      [
        "paragon.barbed-spear",
        "paragon.maiming-spear",
        "paragon.merciless-spear",
        "paragon.stunning-strike",
        "paragon.harriers-toss",
      ].map(text),
    ).toEqual([
      ["Applies Bleeding for 17s (−3 Health degeneration)"],
      ["If target has Bleeding: applies Crippled for 17s (moves at 50% speed)"],
      [
        "If target is below 50% Health: applies Deep Wound for 17s " +
          "(−20% maximum health (at most 100), −20% healing)",
      ],
      [
        "+10 damage",
        "If target has a condition: applies Dazed for 9s " +
          "(spells take 2× as long to cast, spells are interrupted by attacks)",
      ],
      ["+5 damage", "If target is moving: +5 damage"],
    ]);
  });
});

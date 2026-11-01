import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPEED = RULES.movement.maxSpeedUnitsPerSecond;
const RADIUS = RULES.collision.playerRadius;
const FIREBALL = "elementalist.fireball";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
const SWIFT_CHOP = "warrior.swift-chop";

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

/** A swordsman with a cast-time spell, a cast-time self-enchant and an instant attack skill. */
function hero(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL, ARMOR_OF_EARTH, SWIFT_CHOP],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
      ["elementalist.earth-magic", 12],
    ]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A body that does nothing, on `team`. */
function body(id: string, spawn: Vec2, team = 1): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** Arena Alpha's three walls (packages/game-maps/maps/arena-alpha). */
const WALLS = [...rect(440, 0, 24, 260), ...rect(440, 380, 24, 260), ...rect(300, 300, 120, 24)];

function arena(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "walk",
    walls: WALLS,
    bounds: { width: 960, height: 640 },
    participants,
  });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function eventKinds(log: readonly CombatLogEntry[]): string[] {
  return log.flatMap((entry) => entry.events.map((event) => event.kind));
}

describe("walkTo (#310)", () => {
  it("walks round a wall and stops on the goal", () => {
    // Either side of the top wall: a straight line goes through it.
    const match = arena(hero("a", vec2(400, 150)));
    match.walkTo("a", vec2(520, 150));

    // Round the bottom of the wall, by hand, at full speed, and a second to spare.
    const allowed = (Math.hypot(40, 125) * 2 + 24) / SPEED + 1;
    let seconds = 0;
    while (get(match, "a").walkGoal !== undefined) {
      match.step(DT);
      seconds += DT;
      expect(seconds).toBeLessThanOrEqual(allowed);
    }
    expect(distance(get(match, "a").position, vec2(520, 150))).toBeLessThanOrEqual(1);

    // Arrived means stopped.
    const there = get(match, "a").position;
    stepFor(match, 1);
    expect(get(match, "a").position).toEqual(there);
  });

  it("never moves faster than the speed cap, crippled or not", () => {
    // An open field: a wall's push-out, which any move gets, is not the walk's.
    const match = new MatchSimulation({ seed: "open", participants: [hero("a", vec2(0, 0))] });
    match.walkTo("a", vec2(800, 300));
    for (let i = 0; i < 40; i += 1) {
      const before = get(match, "a").position;
      match.step(DT);
      expect(distance(before, get(match, "a").position)).toBeLessThanOrEqual(SPEED * DT + 1e-9);
    }

    get(match, "a").combatant.statuses.apply("crippled", 10, "a", NO_RANKS);
    for (let i = 0; i < 40; i += 1) {
      const before = get(match, "a").position;
      match.step(DT);
      expect(distance(before, get(match, "a").position)).toBeLessThan(SPEED * DT);
    }
  });

  it("faces along the path, so it turns at the corner", () => {
    const match = arena(hero("a", vec2(400, 150)));
    match.walkTo("a", vec2(520, 150));
    match.step(DT);
    // Down and right first, toward the corner below the wall.
    const first = get(match, "a").facing;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(Math.PI / 2);
    stepFor(match, 1.5);
    // Up and right after it.
    const later = get(match, "a").facing;
    expect(later).toBeLessThan(0);
    expect(later).toBeGreaterThan(-Math.PI / 2);
  });

  it("a click inside a wall walks to the wall's nearest edge", () => {
    const match = arena(hero("a", vec2(300, 150)));
    // Inside the top wall, 4 units from its left side.
    match.walkTo("a", vec2(444, 100));
    match.step(DT);
    const goal = get(match, "a").walkGoal;
    expect(goal).toEqual(vec2(440 - RADIUS - 1, 100));
    stepFor(match, 3);
    expect(get(match, "a").walkGoal).toBeUndefined();
    expect(distance(get(match, "a").position, vec2(440 - RADIUS - 1, 100))).toBeLessThanOrEqual(1);
  });

  it("a click off the map walks to its edge", () => {
    const match = arena(hero("a", vec2(300, 150)));
    match.walkTo("a", vec2(-50, 150));
    match.step(DT);
    expect(get(match, "a").walkGoal).toEqual(vec2(RADIUS, 150));
  });

  it("a click with no way there walks nowhere", () => {
    // Walled in on every side, and the click is outside.
    const box = [...rect(100, 100, 100, 4), ...rect(100, 196, 100, 4)];
    const sides = [...rect(100, 100, 4, 100), ...rect(196, 100, 4, 100)];
    const match = new MatchSimulation({
      seed: "boxed",
      walls: [...box, ...sides],
      bounds: { width: 960, height: 640 },
      participants: [hero("a", vec2(150, 150))],
    });
    match.walkTo("a", vec2(500, 150));
    match.step(DT);
    expect(get(match, "a").walkGoal).toBeUndefined();
    stepFor(match, 1);
    expect(get(match, "a").position).toEqual(vec2(150, 150));
  });

  it("settles only the last click before a step, however many came", () => {
    const match = arena(hero("a", vec2(300, 150)));
    for (let i = 0; i < 300; i += 1) {
      match.walkTo("a", vec2(444, 100 + i));
    }
    match.walkTo("a", vec2(-50, 150));
    expect(get(match, "a").walkGoal).toEqual(vec2(-50, 150));
    match.step(DT);
    expect(get(match, "a").walkGoal).toEqual(vec2(RADIUS, 150));
  });

  it("a direct move ends it, and so does stop", () => {
    const match = arena(hero("a", vec2(80, 200)));
    match.walkTo("a", vec2(400, 200));
    stepFor(match, 0.5);
    match.setInputDirection("a", vec2(0, 1));
    expect(get(match, "a").walkGoal).toBeUndefined();

    match.walkTo("a", vec2(400, 200));
    stepFor(match, 0.5);
    match.setInputDirection("a", vec2(0, 0));
    expect(get(match, "a").walkGoal).toBeUndefined();
    const stopped = get(match, "a").position;
    stepFor(match, 0.5);
    expect(get(match, "a").position).toEqual(stopped);
  });

  it("Esc, cancel action, ends it where the hero stands (#300)", () => {
    const match = arena(hero("a", vec2(80, 200)));
    match.walkTo("a", vec2(400, 200));
    stepFor(match, 0.5);
    match.cancelAction("a");
    expect(get(match, "a").walkGoal).toBeUndefined();
    const stopped = get(match, "a").position;
    stepFor(match, 0.5);
    expect(get(match, "a").position).toEqual(stopped);
  });

  it("an attack replaces it, and its approach takes over", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(80, 500)));
    match.walkTo("a", vec2(400, 200));
    stepFor(match, 0.5);
    match.requestAttack("a", "d");
    expect(get(match, "a").walkGoal).toBeUndefined();
    stepFor(match, 0.5);
    // Toward the target below, not on toward the goal to the right.
    const at = get(match, "a").position;
    expect(at.y).toBeGreaterThan(200);
  });

  it("a refused attack leaves it going", () => {
    const match = arena(hero("a", vec2(80, 200)), body("ally", vec2(80, 500), 0));
    match.walkTo("a", vec2(400, 200));
    expect(match.requestAttack("a", "ally")?.ok).toBe(false);
    expect(get(match, "a").walkGoal).toEqual(vec2(400, 200));
  });

  it("a skill with a cast time stops it; an instant one does not", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(110, 200)));
    match.setTarget("a", "d");
    match.walkTo("a", vec2(80, 40));
    match.requestSkill("a", 2);
    expect(get(match, "a").walkGoal).toEqual(vec2(80, 40));
    stepFor(match, 0.5);
    // The instant attack skill turned on the target with the weapon, and
    // the walk cancelled that, as a held direction would.
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(get(match, "a").position.y).toBeLessThan(200 - SPEED * 0.4);

    match.requestSkill("a", 1);
    expect(get(match, "a").walkGoal).toBeUndefined();
    const casting = get(match, "a").position;
    stepFor(match, 0.25);
    expect(get(match, "a").position).toEqual(casting);
  });

  it("a refused skill leaves it going", () => {
    // Swift Chop is melee: a target across the map is out of range.
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(880, 200)));
    match.setTarget("a", "d");
    match.walkTo("a", vec2(80, 40));
    expect(match.requestSkill("a", 2)?.check.ok).toBe(false);
    expect(get(match, "a").walkGoal).toEqual(vec2(80, 40));
  });

  it("starting one cancels a cast in progress (#279) and the attack", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(300, 200)));
    match.setTarget("a", "d");
    match.requestAttack("a", "d");
    match.requestSkill("a", 0);
    expect(get(match, "a").combatant.cast.isCasting).toBe(true);

    match.walkTo("a", vec2(80, 40));
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(eventKinds(match.step(DT).log)).toContain("cancelled");
  });

  it("death ends it", () => {
    const match = arena(hero("a", vec2(80, 200)));
    match.walkTo("a", vec2(880, 200));
    const a = get(match, "a");
    a.combatant.statuses.apply("bleeding", 1000, "a", NO_RANKS);
    a.combatant.health = 0.1;
    stepFor(match, 1);
    expect(a.combatant.dead).toBe(true);
    expect(a.walkGoal).toBeUndefined();
  });

  it("ends, without a word, when a body in a doorway stops it", () => {
    // A gap of one body's width between two walls, and a body in it.
    const walls = [...rect(200, 0, 20, 300), ...rect(200, 300 + 2 * RADIUS + 2, 20, 300)];
    const match = new MatchSimulation({
      seed: "doorway",
      walls,
      bounds: { width: 600, height: 640 },
      participants: [hero("a", vec2(100, 315)), body("b", vec2(210, 315))],
    });
    match.walkTo("a", vec2(400, 315));
    expect(get(match, "a").walkGoal).toBeDefined();

    const log = stepFor(match, 4);
    expect(get(match, "a").walkGoal).toBeUndefined();
    expect(get(match, "a").position.x).toBeLessThan(200);
    expect(eventKinds(log)).not.toContain("attack-unreachable");
  });

  it("ends when it cannot move at all", () => {
    const still = { ...RULES, movement: { ...RULES.movement, maxSpeedUnitsPerSecond: 0 } };
    const match = new MatchSimulation({
      seed: "still",
      ruleset: still,
      participants: [hero("a", vec2(0, 0))],
    });
    match.walkTo("a", vec2(300, 0));
    stepFor(match, RULES.combat.unreachableAfterSeconds + 2 * DT);
    expect(get(match, "a").walkGoal).toBeUndefined();
  });
});

describe("walking keeps the target; Space resumes the attack (#310)", () => {
  it("a walk pauses the attack and keeps the target", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(110, 200)));
    match.setTarget("a", "d");
    match.requestAttack("a", "d");
    match.walkTo("a", vec2(80, 40));
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(get(match, "a").targetId).toBe("d");
  });

  it("an attack in reach ends the walk and swings from where it stands", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(80 + 2 * RADIUS + 4, 200)));
    match.setTarget("a", "d");
    match.walkTo("a", vec2(80, 40));
    match.step(DT);
    const standing = get(match, "a").position;
    match.requestAttack("a", "d");
    expect(get(match, "a").walkGoal).toBeUndefined();

    const log = stepFor(match, WEAPONS.sword.attackIntervalSeconds + DT);
    expect(get(match, "a").position).toEqual(standing);
    expect(eventKinds(log)).toContain("damage");
  });

  it("an attack out of reach runs to the target and swings on arrival", () => {
    const match = arena(hero("a", vec2(80, 200)), body("d", vec2(300, 200)));
    match.setTarget("a", "d");
    match.walkTo("a", vec2(80, 40));
    match.step(DT);
    match.requestAttack("a", "d");
    expect(get(match, "a").walkGoal).toBeUndefined();

    const log = stepFor(match, 220 / SPEED + WEAPONS.sword.attackIntervalSeconds + 1);
    expect(distance(get(match, "a").position, vec2(300, 200))).toBeLessThanOrEqual(
      WEAPONS.sword.range,
    );
    expect(eventKinds(log)).toContain("damage");
  });
});

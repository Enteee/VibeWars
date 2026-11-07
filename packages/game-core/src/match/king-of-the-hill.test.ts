import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import {
  KING_OF_THE_HILL_MATCH_RULES,
  POINT_TICK_SECONDS,
  PRIEST_WAVE_SECONDS,
  SHRINE_INVULNERABLE_SECONDS,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { CLAIM_SKILL_ID, GHOST_HEALTH, ghostId, type HillField } from "./ghost.js";
import { ALTAR_REACH_UNITS } from "./relics.js";
import { priestId, type Shrine } from "./priest.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * King of the Hill in the simulation (#1377), on The Courtyard (#2552): each
 * team's Ghostly Hero follows or stays at Space, claims the altar by
 * itself in 5 s through the cast path, and its team scores for holding
 * it; at 8 minutes the most points win, and a wipe ends it before.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CLAIM_SECONDS = 5;

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** A polygon's sides, closed back to its first point, as a map's polygon wall becomes. */
function polygon(points: readonly Vec2[]): Segment[] {
  return points.map((point, index) => segment(point, points[(index + 1) % points.length] ?? point));
}

/** The Courtyard's walls (packages/game-maps/maps/the-courtyard). */
const WALLS = [
  ...rect(60, 520, 260, 40),
  ...rect(2680, 1240, 260, 40),
  ...rect(480, 520, 60, 240),
  ...rect(2460, 1040, 60, 240),
  ...rect(480, 1040, 60, 240),
  ...rect(2460, 520, 60, 240),
  ...rect(1210, 820, 60, 160),
  ...rect(1730, 820, 60, 160),
  ...rect(1120, 710, 50, 50),
  ...rect(1830, 1040, 50, 50),
  ...rect(1120, 1040, 50, 50),
  ...rect(1830, 710, 50, 50),
  ...rect(1420, 610, 160, 60),
  ...rect(1420, 1130, 160, 60),
  ...rect(1640, 520, 50, 50),
  ...rect(1310, 1230, 50, 50),
  ...rect(1310, 520, 50, 50),
  ...rect(1640, 1230, 50, 50),
  ...rect(1300, 240, 400, 60),
  ...rect(1300, 1500, 400, 60),
  ...rect(820, 620, 60, 200),
  ...rect(2120, 980, 60, 200),
];
const BOUNDS = { width: 3000, height: 1800 };
const FIELD: HillField = {
  altar: vec2(1500, 900),
  spawns: [
    { team: 0, position: vec2(120, 900) },
    { team: 1, position: vec2(2880, 900) },
  ],
};
const GHOST_0 = ghostId(0);
const GHOST_1 = ghostId(1);

function fighter(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
  };
}

/** Two players a team at the map's spawns, and each team's ghost at its own. */
function kingOfTheHill(): MatchSimulation {
  return new MatchSimulation({
    seed: "king-of-the-hill",
    matchRules: KING_OF_THE_HILL_MATCH_RULES,
    walls: WALLS,
    bounds: BOUNDS,
    hillField: FIELD,
    participants: [
      fighter("a", 0, vec2(240, 780)),
      fighter("b", 0, vec2(240, 1020)),
      fighter("x", 1, vec2(2760, 1020)),
      fighter("y", 1, vec2(2760, 780)),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function points(sim: MatchSimulation): [number, number] {
  return [sim.score.byTeam.get(0) ?? 0, sim.score.byTeam.get(1) ?? 0];
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** Step until `done`, or fail after `seconds`. */
function stepUntil(sim: MatchSimulation, done: () => boolean, seconds: number): void {
  for (let tick = 0; tick < seconds / DT && !done(); tick += 1) {
    sim.step(DT);
  }
  expect(done()).toBe(true);
}

/** `id` dies this tick, where it stands. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "nobody", NO_RANKS);
  combatant.health = 0.2;
}

function claiming(sim: MatchSimulation, id: string): boolean {
  return get(sim, id).combatant.cast.activeCast?.skillId === CLAIM_SKILL_ID;
}

/** `team`'s ghost set down on the altar, claiming it from the next tick. */
function onAltar(sim: MatchSimulation, team: number, offsetX = 0): void {
  get(sim, ghostId(team)).position = vec2(FIELD.altar.x + offsetX, FIELD.altar.y);
}

/** Team 0's ghost claims the altar, and walks back to its post. */
function held(): MatchSimulation {
  const sim = kingOfTheHill();
  onAltar(sim, 0);
  stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
  return sim;
}

describe("a Ghostly Hero (#1377)", () => {
  it("stands at its team's ghost spawn from the start, a creature of 600 Health", () => {
    const sim = kingOfTheHill();
    const ghost = get(sim, GHOST_0);
    expect(ghost.position).toEqual(vec2(120, 900));
    expect(ghost.combatant.team).toBe(0);
    expect(ghost.combatant.maxHealth).toBe(GHOST_HEALTH);
    expect(ghost.creature?.kind).toBe("ghostly-hero");
    expect(ghost.creature?.name).toBe("Ghostly Hero");
    expect(get(sim, GHOST_1).position).toEqual(vec2(2880, 900));
  });

  it("follows the ally whose Space reaches it, and stays where it is at the next", () => {
    const sim = kingOfTheHill();
    expect(applyIntent(sim, "a", { kind: "target", targetSessionId: GHOST_0 })).toBeNull();
    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepFor(sim, 1);
    applyIntent(sim, "a", { kind: "walk-to", x: 1000, y: 900 });
    expect(get(sim, GHOST_0).creature?.leaderId).toBe("a");
    stepFor(sim, 4);
    // At its leader's heel, far from its spawn.
    expect(distance(get(sim, GHOST_0).position, get(sim, "a").position)).toBeLessThan(150);
    expect(get(sim, GHOST_0).position.x).toBeGreaterThan(600);

    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepFor(sim, 1);
    const stayed = get(sim, GHOST_0).position;
    expect(get(sim, GHOST_0).creature?.leaderId).toBeUndefined();
    applyIntent(sim, "a", { kind: "walk-to", x: 240, y: 780 });
    stepFor(sim, 4);
    expect(get(sim, GHOST_0).position).toEqual(stayed);
    expect(distance(get(sim, "a").position, stayed)).toBeGreaterThan(300);
  });

  it("led to the altar by walking alone, steps onto it and claims it", () => {
    const sim = kingOfTheHill();
    applyIntent(sim, "a", { kind: "target", targetSessionId: GHOST_0 });
    applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 });
    stepFor(sim, 1);
    applyIntent(sim, "a", { kind: "walk-to", x: FIELD.altar.x, y: FIELD.altar.y });
    stepUntil(sim, () => claiming(sim, GHOST_0), 20);
    stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
  });

  it("led past the altar, still steps onto it rather than heel", () => {
    const sim = kingOfTheHill();
    applyIntent(sim, "a", { kind: "target", targetSessionId: GHOST_0 });
    applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 });
    stepFor(sim, 1);
    applyIntent(sim, "a", { kind: "walk-to", x: FIELD.altar.x + 110, y: FIELD.altar.y });
    stepUntil(sim, () => claiming(sim, GHOST_0), 20);
  });

  it("led onto the altar, fights a foe's ghost adjacent to it, and stays on it", () => {
    const sim = held();
    get(sim, "a").position = vec2(FIELD.altar.x - 70, FIELD.altar.y);
    get(sim, "x").position = vec2(FIELD.altar.x + 70, FIELD.altar.y);
    onAltar(sim, 0, -15);
    onAltar(sim, 1, 15);
    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    expect(applyIntent(sim, "x", { kind: "attack", targetId: GHOST_1 })).toBeNull();
    stepFor(sim, 4);
    for (const id of [GHOST_0, GHOST_1]) {
      const ghost = get(sim, id);
      expect(ghost.combatant.attack?.targetId).toBe(id === GHOST_0 ? GHOST_1 : GHOST_0);
      expect(ghost.combatant.health).toBeLessThan(GHOST_HEALTH);
      expect(distance(ghost.position, FIELD.altar)).toBeLessThanOrEqual(ALTAR_REACH_UNITS);
    }
  });

  it("is attacked, never led, by a foe's Space", () => {
    const sim = kingOfTheHill();
    get(sim, "x").position = vec2(200, 900);
    expect(applyIntent(sim, "x", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    expect(get(sim, "x").combatant.attack?.targetId).toBe(GHOST_0);
    applyIntent(sim, "x", { kind: "walk-to", x: 1000, y: 900 });
    stepFor(sim, 3);
    expect(distance(get(sim, GHOST_0).position, vec2(120, 900))).toBeLessThan(150);
  });

  it("stays put when its leader dies", () => {
    const sim = kingOfTheHill();
    applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 });
    stepFor(sim, 1);
    kill(sim, "a");
    stepFor(sim, 0.5);
    expect(get(sim, "a").combatant.dead).toBe(true);
    const where = get(sim, GHOST_0).position;
    // Space by another ally leads it again: it was staying.
    applyIntent(sim, "b", { kind: "attack", targetId: GHOST_0 });
    stepFor(sim, 2);
    applyIntent(sim, "b", { kind: "walk-to", x: 1000, y: 1000 });
    stepFor(sim, 4);
    expect(distance(get(sim, GHOST_0).position, where)).toBeGreaterThan(200);
  });

  it("rises at its spawn after PRIEST_WAVE_SECONDS, staying put, and costs its team nothing", () => {
    const sim = kingOfTheHill();
    get(sim, GHOST_0).position = vec2(800, 900);
    kill(sim, GHOST_0);
    sim.step(DT);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    expect(get(sim, GHOST_0).combatant.morale).toBe(0);
    expect(sim.phase).toBe("active");
    stepFor(sim, PRIEST_WAVE_SECONDS - 1);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    stepUntil(sim, () => !get(sim, GHOST_0).combatant.dead, 2);
    expect(get(sim, GHOST_0).position).toEqual(vec2(120, 900));
    expect(get(sim, GHOST_0).combatant.health).toBe(GHOST_HEALTH);
    stepFor(sim, 2);
    expect(get(sim, GHOST_0).position).toEqual(vec2(120, 900));
  });
});

describe("claiming the altar (#1377)", () => {
  it("takes a ghost on the altar 5 s, standing still, and gives its team the altar", () => {
    const sim = kingOfTheHill();
    onAltar(sim, 0);
    sim.step(DT);
    expect(claiming(sim, GHOST_0)).toBe(true);
    stepFor(sim, CLAIM_SECONDS - 0.2);
    expect(get(sim, GHOST_0).position).toEqual(FIELD.altar);
    expect(sim.altarState.holder).toBeNull();
    stepUntil(sim, () => sim.altarState.holder === 0, 0.3);
    expect(sim.altarState.heldSeconds).toBe(0);
    expect(sim.elapsedSeconds).toBeCloseTo(CLAIM_SECONDS, 0);
  });

  it("is cut short by a knockdown at 3 s, and begun again once the ghost is up", () => {
    const sim = kingOfTheHill();
    sim.add({
      id: "h",
      team: 1,
      skillBar: ["warrior.backbreaker"],
      attributeRanks: new Map([["warrior.hammer-mastery", 12]]),
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.hammer,
          attributeId: "warrior.hammer-mastery",
          damageType: WEAPONS.hammer.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
      spawn: vec2(FIELD.altar.x + 40, FIELD.altar.y),
      facing: Math.PI,
    });
    onAltar(sim, 0);
    stepFor(sim, 2);
    expect(claiming(sim, GHOST_0)).toBe(true);
    chargeAdrenaline(get(sim, "h").combatant, "warrior.backbreaker");
    sim.setTarget("h", GHOST_0);
    expect(sim.requestSkill("h", 0)?.check).toEqual({ ok: true });
    stepUntil(sim, () => get(sim, GHOST_0).combatant.knockdownRemaining > 0, 1.5);
    expect(sim.elapsedSeconds).toBeLessThan(CLAIM_SECONDS);
    expect(claiming(sim, GHOST_0)).toBe(false);
    stepFor(sim, CLAIM_SECONDS - sim.elapsedSeconds + 0.5);
    expect(sim.altarState.holder).toBeNull();
    // Up again and still on the altar, it claims anew.
    stepUntil(sim, () => sim.altarState.holder === 0, 4 + CLAIM_SECONDS + 1);
  });

  it("never begins against a holder whose ghost lives", () => {
    const sim = held();
    onAltar(sim, 1);
    for (let tick = 0; tick < (2 * CLAIM_SECONDS) / DT; tick += 1) {
      sim.step(DT);
      expect(claiming(sim, GHOST_1)).toBe(false);
    }
    expect(sim.altarState.holder).toBe(0);
  });

  it("takes the altar from a holder whose ghost is dead, its clock from 0", () => {
    const sim = held();
    kill(sim, GHOST_0);
    stepFor(sim, 1);
    onAltar(sim, 1);
    stepUntil(sim, () => sim.altarState.holder === 1, CLAIM_SECONDS + 1);
    expect(sim.altarState.heldSeconds).toBe(0);
  });

  it("stops a foe's claim the moment the holder's ghost rises", () => {
    const sim = held();
    kill(sim, GHOST_0);
    sim.step(DT);
    get(sim, GHOST_0).respawnInSeconds = 2;
    onAltar(sim, 1);
    stepFor(sim, 1);
    expect(claiming(sim, GHOST_1)).toBe(true);
    stepUntil(sim, () => !get(sim, GHOST_0).combatant.dead, 1.5);
    sim.step(DT);
    expect(claiming(sim, GHOST_1)).toBe(false);
    stepFor(sim, CLAIM_SECONDS);
    expect(sim.altarState.holder).toBe(0);
  });

  it("is lost by both when two ghosts finish in the same tick, and both begin again", () => {
    const sim = kingOfTheHill();
    onAltar(sim, 0, -30);
    onAltar(sim, 1, 30);
    stepFor(sim, CLAIM_SECONDS + 0.2);
    expect(sim.altarState.holder).toBeNull();
    stepFor(sim, 1);
    expect(claiming(sim, GHOST_0)).toBe(true);
    expect(claiming(sim, GHOST_1)).toBe(true);
  });
});

describe("a King of the Hill match (#1377)", () => {
  it("scores the holder a point for every 30 s held, its ghost dead or alive", () => {
    const sim = held();
    stepFor(sim, POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([1, 0]);
    kill(sim, GHOST_0);
    stepFor(sim, POINT_TICK_SECONDS);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    expect(points(sim)).toEqual([2, 0]);
  });

  it("scores no kills: the score is points for the altar", () => {
    const sim = kingOfTheHill();
    kill(sim, "y");
    sim.step(DT);
    expect(get(sim, "y").combatant.dead).toBe(true);
    expect(points(sim)).toEqual([0, 0]);
  });

  it("is won at time by the team with more points", () => {
    const sim = held();
    stepUntil(sim, () => sim.phase === "finished", KING_OF_THE_HILL_MATCH_RULES.timeLimitSeconds);
    expect(sim.elapsedSeconds).toBeCloseTo(KING_OF_THE_HILL_MATCH_RULES.timeLimitSeconds, 3);
    expect(points(sim)[0]).toBe(
      Math.floor(
        (KING_OF_THE_HILL_MATCH_RULES.timeLimitSeconds - CLAIM_SECONDS) / POINT_TICK_SECONDS,
      ),
    );
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "time" });
  });

  it("is ended at once by a wipe: a living ghost is no player", () => {
    const sim = held();
    kill(sim, "x");
    kill(sim, "y");
    sim.step(DT);
    expect(get(sim, GHOST_1).combatant.dead).toBe(false);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });
});

/** Hall of Heroes (#1995, rebuilt by #2552): packages/game-maps/maps/hall-of-heroes. */
const HALL_WALLS = [
  ...rect(60, 720, 260, 40),
  ...rect(2880, 1440, 260, 40),
  ...rect(480, 720, 60, 240),
  ...rect(2660, 1240, 60, 240),
  ...rect(480, 1240, 60, 240),
  ...rect(2660, 720, 60, 240),
  ...polygon([
    vec2(1480, 840),
    vec2(1340, 840),
    vec2(1340, 1360),
    vec2(1480, 1360),
    vec2(1480, 1320),
    vec2(1380, 1320),
    vec2(1380, 880),
    vec2(1480, 880),
  ]),
  ...polygon([
    vec2(1720, 1360),
    vec2(1860, 1360),
    vec2(1860, 840),
    vec2(1720, 840),
    vec2(1720, 880),
    vec2(1820, 880),
    vec2(1820, 1320),
    vec2(1720, 1320),
  ]),
  ...rect(1050, 700, 60, 60),
  ...rect(2090, 1440, 60, 60),
  ...rect(1370, 700, 60, 60),
  ...rect(1770, 1440, 60, 60),
  ...rect(1770, 700, 60, 60),
  ...rect(1370, 1440, 60, 60),
  ...rect(2050, 700, 60, 60),
  ...rect(1090, 1440, 60, 60),
  ...rect(860, 980, 60, 240),
  ...rect(2280, 980, 60, 240),
  ...rect(760, 300, 60, 220),
  ...rect(2380, 1680, 60, 220),
];

describe("on the Hall of Heroes (#1995)", () => {
  it("lets a Ghostly Hero step onto the altar, claim it and score for its team", () => {
    const altar = vec2(1600, 1100);
    const sim = new MatchSimulation({
      seed: "hall-of-heroes",
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      walls: HALL_WALLS,
      bounds: { width: 3200, height: 2200 },
      hillField: {
        altar,
        spawns: [
          { team: 0, position: vec2(120, 1100) },
          { team: 1, position: vec2(3080, 1100) },
        ],
      },
      participants: [fighter("a", 0, vec2(360, 1040)), fighter("x", 1, vec2(2840, 1160))],
    });
    get(sim, GHOST_0).position = altar;
    stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
    stepFor(sim, POINT_TICK_SECONDS * 2 + 1);
    expect(points(sim)[0]).toBeGreaterThan(0);
    expect(points(sim)[1]).toBe(0);
  });
});

describe("King of the Hill with three teams (#2682)", () => {
  const THREE: HillField = {
    ...FIELD,
    spawns: [...FIELD.spawns, { team: 2, position: vec2(1500, 120) }],
  };

  /** `kingOfTheHill` with a third team at the top edge, and its ghost. */
  function threeWay(
    shrines: readonly Shrine[] = [],
    matchRules = KING_OF_THE_HILL_MATCH_RULES,
  ): MatchSimulation {
    return new MatchSimulation({
      seed: "king-of-the-hill-3",
      matchRules,
      teamCount: 3,
      walls: WALLS,
      bounds: BOUNDS,
      hillField: THREE,
      shrines,
      participants: [
        fighter("a", 0, vec2(240, 780)),
        fighter("x", 1, vec2(2760, 1020)),
        fighter("p", 2, vec2(1400, 120)),
      ],
    });
  }

  it("has one holder, and a third team takes the altar once the holder's ghost dies", () => {
    const sim = threeWay();
    onAltar(sim, 0);
    stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
    onAltar(sim, 2, 30);
    for (let tick = 0; tick < (2 * CLAIM_SECONDS) / DT; tick += 1) {
      sim.step(DT);
      expect(claiming(sim, ghostId(2))).toBe(false);
    }
    expect(sim.altarState.holder).toBe(0);
    kill(sim, GHOST_0);
    stepFor(sim, 1);
    onAltar(sim, 2);
    stepUntil(sim, () => sim.altarState.holder === 2, CLAIM_SECONDS + 1);
    // Held by the third team's living ghost, it is nobody else's to begin.
    onAltar(sim, 1, -30);
    stepFor(sim, 1);
    expect(claiming(sim, GHOST_1)).toBe(false);
    expect([...sim.score.byTeam.keys()]).toEqual([0, 1, 2]);
  });

  it("scores the third team for holding it", () => {
    const sim = threeWay();
    onAltar(sim, 2);
    stepUntil(sim, () => sim.altarState.holder === 2, CLAIM_SECONDS + 1);
    stepFor(sim, POINT_TICK_SECONDS + DT);
    expect(sim.score.byTeam.get(2)).toBe(1);
  });

  it("wipes a team out only once its priest is dead too, and an out team's points win nothing", () => {
    // Five minutes: past the first wave, without eight minutes of steps.
    const SHORT = { ...KING_OF_THE_HILL_MATCH_RULES, timeLimitSeconds: 300 };
    const sim = threeWay(
      [
        { team: 0, position: vec2(240, 600) },
        { team: 1, position: vec2(2760, 1200) },
        { team: 2, position: vec2(1600, 120) },
      ],
      SHORT,
    );
    onAltar(sim, 0);
    stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
    stepFor(sim, POINT_TICK_SECONDS * 3 + 1);
    expect(sim.score.byTeam.get(0)).toBeGreaterThan(0);
    // Wiped, with its priest alive: not out, and the wave raises it.
    kill(sim, "a");
    stepUntil(sim, () => get(sim, "a").combatant.dead, 2);
    expect(sim.phase).toBe("active");
    stepUntil(sim, () => !get(sim, "a").combatant.dead, PRIEST_WAVE_SECONDS);
    // Wiped with its priest: out, while teams 1 and 2 fight on.
    stepFor(sim, SHRINE_INVULNERABLE_SECONDS + 1);
    kill(sim, priestId(0));
    kill(sim, "a");
    stepUntil(sim, () => get(sim, "a").combatant.dead, 2);
    expect(sim.get(priestId(0))).toBeUndefined();
    expect(sim.phase).toBe("active");
    stepUntil(sim, () => sim.phase === "finished", SHORT.timeLimitSeconds);
    // Neither 1 nor 2 scored: a draw, not team 0's win.
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: undefined, reason: "time" });
  });
});

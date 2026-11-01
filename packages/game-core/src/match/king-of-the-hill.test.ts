import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import {
  KING_OF_THE_HILL_MATCH_RULES,
  POINT_TICK_SECONDS,
  PRIEST_WAVE_SECONDS,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { CLAIM_SKILL_ID, GHOST_HEALTH, ghostId, type HillField } from "./ghost.js";
import { ALTAR_REACH_UNITS } from "./relics.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * King of the Hill in the simulation (#1377), on Hill Courtyard: each
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

/** Hill Courtyard's walls (packages/game-maps/maps/hill-courtyard). */
const WALLS = [
  ...rect(840, 560, 40, 280),
  ...rect(1120, 560, 40, 280),
  ...rect(440, 300, 120, 120),
  ...rect(1440, 980, 120, 120),
  ...rect(440, 980, 120, 120),
  ...rect(1440, 300, 120, 120),
  ...rect(960, 200, 80, 80),
  ...rect(960, 1120, 80, 80),
];
const BOUNDS = { width: 2000, height: 1400 };
const FIELD: HillField = {
  altar: vec2(1000, 700),
  spawns: [
    { team: 0, position: vec2(200, 700) },
    { team: 1, position: vec2(1800, 700) },
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
      fighter("a", 0, vec2(290, 560)),
      fighter("b", 0, vec2(290, 840)),
      fighter("x", 1, vec2(1710, 840)),
      fighter("y", 1, vec2(1710, 560)),
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
    expect(ghost.position).toEqual(vec2(200, 700));
    expect(ghost.combatant.team).toBe(0);
    expect(ghost.combatant.maxHealth).toBe(GHOST_HEALTH);
    expect(ghost.creature?.kind).toBe("ghostly-hero");
    expect(ghost.creature?.name).toBe("Ghostly Hero");
    expect(get(sim, GHOST_1).position).toEqual(vec2(1800, 700));
  });

  it("follows the ally whose Space reaches it, and stays where it is at the next", () => {
    const sim = kingOfTheHill();
    expect(applyIntent(sim, "a", { kind: "target", targetSessionId: GHOST_0 })).toBeNull();
    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepFor(sim, 1);
    applyIntent(sim, "a", { kind: "walk-to", x: 700, y: 700 });
    expect(get(sim, GHOST_0).creature?.leaderId).toBe("a");
    stepFor(sim, 4);
    // At its leader's heel, far from its spawn.
    expect(distance(get(sim, GHOST_0).position, get(sim, "a").position)).toBeLessThan(150);
    expect(get(sim, GHOST_0).position.x).toBeGreaterThan(450);

    expect(applyIntent(sim, "a", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    stepFor(sim, 1);
    const stayed = get(sim, GHOST_0).position;
    expect(get(sim, GHOST_0).creature?.leaderId).toBeUndefined();
    applyIntent(sim, "a", { kind: "walk-to", x: 290, y: 560 });
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
    get(sim, "x").position = vec2(260, 700);
    expect(applyIntent(sim, "x", { kind: "attack", targetId: GHOST_0 })).toBeNull();
    expect(get(sim, "x").combatant.attack?.targetId).toBe(GHOST_0);
    applyIntent(sim, "x", { kind: "walk-to", x: 700, y: 700 });
    stepFor(sim, 3);
    expect(distance(get(sim, GHOST_0).position, vec2(200, 700))).toBeLessThan(150);
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
    applyIntent(sim, "b", { kind: "walk-to", x: 700, y: 840 });
    stepFor(sim, 4);
    expect(distance(get(sim, GHOST_0).position, where)).toBeGreaterThan(200);
  });

  it("rises at its spawn after PRIEST_WAVE_SECONDS, staying put, and costs its team nothing", () => {
    const sim = kingOfTheHill();
    get(sim, GHOST_0).position = vec2(600, 700);
    kill(sim, GHOST_0);
    sim.step(DT);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    expect(get(sim, GHOST_0).combatant.morale).toBe(0);
    expect(sim.phase).toBe("active");
    stepFor(sim, PRIEST_WAVE_SECONDS - 1);
    expect(get(sim, GHOST_0).combatant.dead).toBe(true);
    stepUntil(sim, () => !get(sim, GHOST_0).combatant.dead, 2);
    expect(get(sim, GHOST_0).position).toEqual(vec2(200, 700));
    expect(get(sim, GHOST_0).combatant.health).toBe(GHOST_HEALTH);
    stepFor(sim, 2);
    expect(get(sim, GHOST_0).position).toEqual(vec2(200, 700));
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

/** Hall of Heroes (#1995): packages/game-maps/maps/hall-of-heroes, walls as [x, y, width, height]. */
const HALL_WALLS: readonly (readonly [number, number, number, number])[] = [
  [420, 380, 40, 240],
  [420, 980, 40, 240],
  [1940, 380, 40, 240],
  [1940, 980, 40, 240],
  [700, 300, 120, 120],
  [700, 1180, 120, 120],
  [1580, 300, 120, 120],
  [1580, 1180, 120, 120],
  [700, 500, 50, 50],
  [700, 1050, 50, 50],
  [1650, 500, 50, 50],
  [1650, 1050, 50, 50],
  [820, 500, 50, 50],
  [820, 1050, 50, 50],
  [1530, 500, 50, 50],
  [1530, 1050, 50, 50],
  [1005, 605, 50, 50],
  [1005, 945, 50, 50],
  [1345, 605, 50, 50],
  [1345, 945, 50, 50],
  [1160, 200, 80, 80],
  [1160, 1320, 80, 80],
];

describe("on the Hall of Heroes (#1995)", () => {
  it("lets a Ghostly Hero step onto the altar, claim it and score for its team", () => {
    const altar = vec2(1200, 800);
    const sim = new MatchSimulation({
      seed: "hall-of-heroes",
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      walls: HALL_WALLS.flatMap(([x, y, width, height]) => rect(x, y, width, height)),
      bounds: { width: 2400, height: 1600 },
      hillField: {
        altar,
        spawns: [
          { team: 0, position: vec2(200, 800) },
          { team: 1, position: vec2(2200, 800) },
        ],
      },
      participants: [fighter("a", 0, vec2(250, 720)), fighter("x", 1, vec2(2150, 720))],
    });
    get(sim, GHOST_0).position = altar;
    stepUntil(sim, () => sim.altarState.holder === 0, CLAIM_SECONDS + 1);
    stepFor(sim, POINT_TICK_SECONDS * 2 + 1);
    expect(points(sim)[0]).toBeGreaterThan(0);
    expect(points(sim)[1]).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { Projectile } from "../skills/projectile.js";
import { vec2, ZERO, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const LONGBOW = WEAPONS.longbow;
const SPEED = LONGBOW.projectileSpeed ?? 0;
const UP = vec2(0, 1);
const DOWN = vec2(0, -1);

/** A longbow at rank 12 Marksmanship. */
function archer(spawn: Vec2, weapon: Weapon = LONGBOW): ParticipantSpec {
  return {
    id: "archer",
    team: 0,
    skillBar: [],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: { weapon, attributeId: "ranger.marksmanship", requirementMet: true },
    },
    spawn,
    facing: 0,
  };
}

/** A 60-armor target that walks only when told to. */
function target(spawn: Vec2): ParticipantSpec {
  return {
    id: "target",
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

interface Shot {
  readonly projectile: Readonly<Projectile>;
  readonly releasedAt: number;
}

/**
 * Attack, with the target walking `walking` for the last second before
 * the release: longer than the tracking window, so the shot leads the
 * walk exactly.
 */
function fire(match: MatchSimulation, walking: Vec2 = ZERO): Shot {
  match.requestAttack("archer", "target");
  const walkFrom = LONGBOW.attackIntervalSeconds - 1;
  for (let i = 0; i < 200; i += 1) {
    if (match.elapsedSeconds >= walkFrom) {
      match.setInputDirection("target", walking);
    }
    const result = match.step(DT);
    const projectile = match.projectiles[0];
    if (projectile !== undefined) {
      return { projectile, releasedAt: result.elapsedSeconds };
    }
  }
  throw new Error("nothing was released");
}

/** Step until the shot in flight lands, and return what it did. */
function land(match: MatchSimulation): CombatLogEntry {
  for (let i = 0; i < 200; i += 1) {
    const entry = match.step(DT).log.find((logged) => logged.cause === "weapon");
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error("nothing landed");
}

/** Dead, and staying dead: a corpse with no respawn due revives next tick. */
function kill(match: MatchSimulation, id: string): void {
  const participant = get(match, id);
  participant.combatant.health = 0;
  participant.combatant.dead = true;
  participant.respawnInSeconds = Number.POSITIVE_INFINITY;
}

function sim(targetAt: Vec2 = vec2(300, 0)): MatchSimulation {
  return new MatchSimulation({
    seed: "arrow",
    participants: [archer(vec2(0, 0)), target(targetAt)],
  });
}

describe("ranged weapons fire projectiles", () => {
  it("a longbow at 300 units hits a stationary target after 300 / speed s", () => {
    const match = sim();
    const { projectile, releasedAt } = fire(match);
    expect(projectile).toMatchObject({
      id: 1,
      attackerId: "archer",
      targetId: "target",
      from: vec2(0, 0),
      aimPoint: vec2(300, 0),
      speed: SPEED,
      elapsed: 0,
    });
    expect(projectile.flightSeconds).toBeCloseTo(300 / SPEED, 9);

    const entry = land(match);
    expect(entry.sourceId).toBe("archer");
    expect(entry.events[0]?.kind).toBe("damage");
    expect(Math.abs(entry.atSeconds - releasedAt - 300 / SPEED)).toBeLessThanOrEqual(DT);
    expect(match.projectiles).toHaveLength(0);
  });

  it("leads a target walking sideways that keeps walking: a hit", () => {
    const match = sim();
    const { projectile } = fire(match, UP);
    expect(projectile.aimPoint.y).toBeGreaterThan(20);
    expect(land(match).events[0]?.kind).toBe("damage");
  });

  it("a target that reverses right after the release dodges", () => {
    const match = sim();
    fire(match, UP);
    match.setInputDirection("target", DOWN);
    expect(land(match).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);
  });

  it("a target that stops right after the release dodges", () => {
    const match = sim();
    fire(match, UP);
    match.setInputDirection("target", ZERO);
    expect(land(match).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);
  });

  it("a standing target that starts walking dodges at 300 units, not at point blank", () => {
    const far = sim();
    fire(far);
    far.setInputDirection("target", UP);
    expect(land(far).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);

    const near = sim(vec2(40, 0));
    fire(near);
    near.setInputDirection("target", UP);
    expect(land(near).events[0]?.kind).toBe("damage");
  });

  it("a target walking straight at the archer is hit", () => {
    const match = sim();
    fire(match, vec2(-1, 0));
    expect(land(match).events[0]?.kind).toBe("damage");
  });

  it("still hits after the archer dies in flight, and earns the corpse nothing", () => {
    const match = sim();
    fire(match);
    const shooter = get(match, "archer").combatant;
    shooter.adrenaline = 0;
    kill(match, "archer");
    expect(land(match).events[0]?.kind).toBe("damage");
    expect(shooter.adrenaline).toBe(0);
  });

  it("does nothing to a target that died in flight", () => {
    const match = sim();
    fire(match);
    kill(match, "target");
    for (let i = 0; i < 20; i += 1) {
      expect(match.step(DT).log).toEqual([]);
    }
    expect(match.projectiles).toHaveLength(0);
  });

  it("lands with the weapon it was released with", () => {
    const match = sim();
    fire(match);
    match.rearm(
      "archer",
      {
        maxHealth: RULES.combat.baseHealth,
        maxEnergy: RULES.combat.baseEnergy,
        attributeRanks: new Map(),
        equipment: unarmedResolvedEquipment(60),
      },
      [],
    );
    const hit = land(match).events[0];
    // Fists deal at most 5.
    expect(hit?.kind === "damage" && hit.amount > 5).toBe(true);
  });

  it("a blinded release misses at once, and nothing flies", () => {
    const match = sim();
    get(match, "archer").combatant.statuses.apply("blind", 60, "target");
    match.requestAttack("archer", "target");
    const misses: CombatLogEntry[] = [];
    for (let i = 0; i < 20 * 30; i += 1) {
      for (const entry of match.step(DT).log) {
        if (entry.events[0]?.kind === "attack-missed") {
          misses.push(entry);
          expect(match.projectiles).toHaveLength(0);
        }
      }
    }
    // 90% of about twelve releases.
    expect(misses.length).toBeGreaterThan(5);
  });

  it("a respawned target is aimed at where it stands, not where it walked before", () => {
    const match = sim();
    match.requestAttack("archer", "target");
    match.setInputDirection("target", UP);
    // Two ticks before the release: it has walked 2.3 s, then is back at spawn.
    while (match.elapsedSeconds < LONGBOW.attackIntervalSeconds - 2 * DT - 1e-9) {
      match.step(DT);
    }
    match.resetParticipant("target");
    for (let i = 0; i < 5 && match.projectiles.length === 0; i += 1) {
      match.step(DT);
    }
    expect(match.projectiles[0]?.aimPoint).toEqual(vec2(300, 0));
  });

  it("is the same twice from one seed", () => {
    const run = (): CombatLogEntry[] => {
      const match = sim();
      fire(match, UP);
      const log: CombatLogEntry[] = [];
      for (let i = 0; i < 20 * 10; i += 1) {
        if (i === 3) {
          match.setInputDirection("target", DOWN);
        }
        log.push(...match.step(DT).log);
      }
      return log;
    };
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });
});

/**
 * Hits out of `shots` on a target tapping W and S, `flipSeconds` each,
 * at 300 units, from five starting phases spread over the wobble.
 */
function jitterHitRate(weapon: Weapon, flipSeconds: number, shots: number): number {
  const flipTicks = Math.round(flipSeconds / DT);
  let hits = 0;
  let landed = 0;
  for (let phase = 0; phase < 5; phase += 1) {
    const offset = Math.round((phase * 2 * flipTicks) / 5);
    const match = new MatchSimulation({
      seed: `jitter-${String(phase)}`,
      participants: [archer(vec2(0, 0), weapon), target(vec2(300, 0))],
    });
    match.requestAttack("archer", "target");
    let counted = 0;
    for (let tick = 0; counted < shots; tick += 1) {
      const up = Math.floor((tick + offset) / flipTicks) % 2 === 0;
      match.setInputDirection("target", up ? UP : DOWN);
      for (const entry of match.step(DT).log) {
        const kind = entry.events[0]?.kind;
        if (kind === "damage" || kind === "attack-dodged") {
          counted += 1;
          hits += kind === "damage" ? 1 : 0;
        }
      }
    }
    landed += counted;
  }
  return hits / landed;
}

describe("tapping back and forth", () => {
  // Leading by the last tick's step missed every one of these (#159).
  it.each([
    { name: "longbow", weapon: WEAPONS.longbow },
    { name: "wand", weapon: WEAPONS.wand },
  ])("does not dodge a $name: at least 75% of shots hit a 0.25 s W/S jitter", ({ weapon }) => {
    expect(jitterHitRate(weapon, 0.25, 20)).toBeGreaterThanOrEqual(0.75);
  });
});

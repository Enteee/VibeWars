import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { hasLineOfSight, type Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { mitigate, skillDamage } from "../skills/damage.js";
import type { Projectile } from "../skills/projectile.js";
import { strikesOf } from "../skills/testing.js";
import { vec2, ZERO, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const LONGBOW = WEAPONS.longbow;
const SPEED = LONGBOW.projectileSpeed ?? 0;
const UP = vec2(0, 1);
const DOWN = vec2(0, -1);
const BACKBREAKER = "warrior.backbreaker";

/**
 * A longbow at rank 12 Marksmanship. Backbreaker is on the bar only so a
 * test can watch adrenaline fill (#463): a bow cannot use it.
 */
function archer(spawn: Vec2, weapon: Weapon = LONGBOW): ParticipantSpec {
  return {
    id: "archer",
    team: 0,
    skillBar: [BACKBREAKER],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon,
        attributeId: "ranger.marksmanship",
        damageType: weapon.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
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

  it("a landed arrow gives every adrenaline skill one strike (#463)", () => {
    const match = sim();
    fire(match);
    expect(land(match).events[0]?.kind).toBe("damage");
    expect(strikesOf(get(match, "archer").combatant, BACKBREAKER)).toBe(1);
  });

  it("still hits after the archer dies in flight, and earns the corpse nothing", () => {
    const match = sim();
    fire(match);
    const shooter = get(match, "archer").combatant;
    kill(match, "archer");
    expect(land(match).events[0]?.kind).toBe("damage");
    expect(strikesOf(shooter, BACKBREAKER)).toBe(0);
  });

  describe("Critical Strikes (#606)", () => {
    /** Critical Strikes 13, under rules where every arrow crits. */
    function critter(): MatchSimulation {
      return new MatchSimulation({
        seed: "arrow",
        ruleset: {
          ...MINIMAL_GW_INSPIRED_PVP_V1,
          combat: { ...MINIMAL_GW_INSPIRED_PVP_V1.combat, criticalBaseChance: 1 },
        },
        participants: [
          {
            ...archer(vec2(0, 0)),
            attributeRanks: new Map([["assassin.critical-strikes", 13]]),
          },
          target(vec2(300, 0)),
        ],
      });
    }

    it("a critical arrow gives its archer 3 energy", () => {
      const match = critter();
      fire(match);
      const shooter = get(match, "archer").combatant;
      shooter.energy = 0;
      expect(land(match).events).toMatchObject([
        { kind: "damage", critical: true },
        { kind: "energy-gain", targetId: "archer", amount: 3 },
        { kind: "adrenaline-gained", targetId: "archer", strikes: 1 },
      ]);
    });

    it("gives an archer who died in flight none", () => {
      const match = critter();
      fire(match);
      kill(match, "archer");
      const { events } = land(match);
      expect(events).toMatchObject([{ kind: "damage", critical: true }]);
      expect(events.some((event) => event.kind === "energy-gain")).toBe(false);
    });
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
        baseEnergyPips: 0,
        attributeRanks: new Map(),
        weaponSets: [
          { equipment: unarmedResolvedEquipment(60), maxEnergy: RULES.combat.baseEnergy },
          null,
          null,
          null,
        ],
      },
      [],
    );
    const hit = land(match).events[0];
    // Fists deal at most 5.
    expect(hit?.kind === "damage" && hit.amount > 5).toBe(true);
  });

  it("a blinded release misses at once, and nothing flies", () => {
    const match = sim();
    get(match, "archer").combatant.statuses.apply("blind", 60, "target", NO_RANKS);
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

describe("line of sight (#211)", () => {
  /** A wall across the line from the archer at (0, 0) to anyone at x = 300 near y = 0. */
  const WALL = { a: vec2(150, -50), b: vec2(150, 50) };

  function walled(archerAt: Vec2, targetAt: Vec2, weapon: Weapon = LONGBOW): MatchSimulation {
    return new MatchSimulation({
      seed: "obstructed",
      walls: [WALL],
      participants: [archer(archerAt, weapon), target(targetAt)],
    });
  }

  function weaponEvents(match: MatchSimulation, seconds: number): string[] {
    const kinds: string[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of match.step(DT).log) {
        if (entry.cause === "weapon") {
          kinds.push(...entry.events.map((event) => event.kind));
        }
      }
    }
    return kinds;
  }

  /** Step until a shot is in flight, at most `seconds`; whether one is. */
  function untilAShotFlies(match: MatchSimulation, seconds: number): boolean {
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      match.step(DT);
      if (match.projectiles.length > 0) {
        return true;
      }
    }
    return false;
  }

  it("a longbow in range behind a wall walks until it sees, then shoots, never obstructed", () => {
    const match = walled(vec2(0, 0), vec2(300, 0));
    expect(match.requestAttack("archer", "target")).toEqual({ ok: true });

    expect(untilAShotFlies(match, 4)).toBe(true);
    const at = get(match, "archer").position;
    expect(Math.abs(at.y)).toBeGreaterThan(0);
    expect(hasLineOfSight(at, vec2(300, 0), [WALL])).toBe(true);
    expect(weaponEvents(match, LONGBOW.attackIntervalSeconds * 3)).not.toContain(
      "attack-obstructed",
    );
  });

  it("follows a target that steps behind cover, rather than shooting the wall", () => {
    const match = walled(vec2(0, 0), vec2(300, 200));
    match.requestAttack("archer", "target");
    expect(untilAShotFlies(match, 4)).toBe(true);

    // Behind the wall, as seen from where the archer stands.
    const from = get(match, "archer").position;
    get(match, "target").position = vec2(300, 0);
    expect(hasLineOfSight(from, vec2(300, 0), [WALL])).toBe(false);
    expect(weaponEvents(match, LONGBOW.attackIntervalSeconds * 3)).not.toContain(
      "attack-obstructed",
    );
    expect(get(match, "archer").position).not.toEqual(from);
  });

  it("a sword across a thin wall walks round it and hits", () => {
    const sword = WEAPONS.sword;
    const match = walled(vec2(136, 0), vec2(164, 0), sword);
    match.requestAttack("archer", "target");
    expect(weaponEvents(match, sword.attackIntervalSeconds * 2 + 2)).toContain("damage");
  });
});

describe("walls along the flight (#215)", () => {
  /** A rect wall's sides, just above the archer's line to the target at release. */
  const WALL = [
    { a: vec2(200, 5), b: vec2(220, 5) },
    { a: vec2(220, 5), b: vec2(220, 100) },
    { a: vec2(220, 100), b: vec2(200, 100) },
    { a: vec2(200, 100), b: vec2(200, 5) },
  ];

  /** The target walks down the screen into cover: in sight at release, led behind the wall. */
  function pillarDance(walls: typeof WALL | []): MatchSimulation {
    return new MatchSimulation({
      seed: "pillar",
      walls,
      participants: [archer(vec2(0, 0)), target(vec2(300, -200))],
    });
  }

  it("stops a shot led behind a wall at the wall: obstructed, no damage", () => {
    const match = pillarDance(WALL);
    const { projectile } = fire(match, UP);
    expect(projectile.obstructed).toBe(true);
    // On the near side of the wall, short of x = 200.
    expect(projectile.aimPoint.x).toBeLessThan(200);
    expect(projectile.aimPoint.x).toBeGreaterThan(195);

    const landed = land(match);
    expect(landed.events).toEqual([{ kind: "attack-obstructed", targetId: "target" }]);
    expect(strikesOf(get(match, "archer").combatant, BACKBREAKER)).toBe(0);
  });

  it("hits, as before, with no wall in the way", () => {
    const match = pillarDance([]);
    const { projectile } = fire(match, UP);
    expect(projectile.obstructed).toBe(false);
    expect(land(match).events.some((event) => event.kind === "damage")).toBe(true);
  });
});

describe("a landing arrow and daze (#546)", () => {
  it("interrupts a dazed target casting a spell, before the damage", () => {
    const match = sim();
    fire(match);
    const victim = get(match, "target").combatant;
    victim.statuses.apply("dazed", 1000, "archer", NO_RANKS);
    victim.cast.beginCast("elementalist.fireball", "archer", 10, undefined);
    expect(
      land(match)
        .events.map((event) => event.kind)
        .slice(0, 2),
    ).toEqual(["interrupted", "damage"]);
    expect(victim.cast.isCasting).toBe(false);
  });

  it("leaves a dazed target that steps aside casting", () => {
    const match = sim();
    fire(match, UP);
    match.setInputDirection("target", DOWN);
    const victim = get(match, "target").combatant;
    victim.statuses.apply("dazed", 1000, "archer", NO_RANKS);
    victim.cast.beginCast("elementalist.fireball", "archer", 10, undefined);
    expect(land(match).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);
    expect(victim.cast.isCasting).toBe(true);
  });
});

describe("ranged attack skills fly (#416)", () => {
  const BROAD_HEAD = "ranger.broad-head-arrow";
  const BARRAGE = "ranger.barrage";

  /** The archer with Broad Head Arrow and Barrage, and the energy for them. */
  function skilled(spawn: Vec2): ParticipantSpec {
    return { ...archer(spawn), skillBar: [BROAD_HEAD, BARRAGE, BACKBREAKER], maxEnergy: 1000 };
  }

  function foe(id: string, spawn: Vec2): ParticipantSpec {
    return { ...target(spawn), id };
  }

  function skillSim(...foes: ParticipantSpec[]): MatchSimulation {
    return new MatchSimulation({
      seed: "skill-arrow",
      participants: [skilled(vec2(0, 0)), ...foes],
    });
  }

  /**
   * Use the skill in `slot` at `target`, with the target walking `walking`
   * for the last second before the release, and return the entry its
   * release logged.
   */
  function shoot(match: MatchSimulation, slot: number, walking: Vec2 = ZERO): CombatLogEntry {
    match.setTarget("archer", "target");
    expect(match.requestSkill("archer", slot)?.check).toEqual({ ok: true });
    const walkFrom = match.elapsedSeconds + LONGBOW.attackIntervalSeconds / 2 - 1;
    for (let i = 0; i < 200; i += 1) {
      if (match.elapsedSeconds >= walkFrom) {
        match.setInputDirection("target", walking);
      }
      const released = match.step(DT).log.find((entry) => entry.cause === "skill");
      if (released !== undefined) {
        return released;
      }
    }
    throw new Error("nothing was released");
  }

  /** Step until a skill's shot lands, and return what it did. */
  function landSkill(match: MatchSimulation): CombatLogEntry {
    for (let i = 0; i < 200; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.cause === "skill" && logged.sourceId === "archer");
      if (entry !== undefined) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  const kinds = (entry: CombatLogEntry) => entry.events.map((event) => event.kind);

  it("Broad Head Arrow flies: nothing lands at the release, the blow and Daze land with the arrow", () => {
    const match = skillSim(target(vec2(300, 0)));
    const released = shoot(match, 0);
    expect(kinds(released)).toEqual(["skill-used"]);
    expect(match.projectiles).toHaveLength(1);
    expect(match.projectiles[0]?.skillHit?.skill.id).toBe(BROAD_HEAD);
    expect(get(match, "archer").combatant.cast.rechargeRemaining.has(BROAD_HEAD)).toBe(true);
    expect(get(match, "target").combatant.statuses.has("dazed")).toBe(false);

    const landed = landSkill(match);
    expect(landed).toMatchObject({ cause: "skill", skillId: BROAD_HEAD, sourceId: "archer" });
    expect(kinds(landed)).toEqual(["damage", "status-applied", "adrenaline-gained"]);
    expect(get(match, "target").combatant.statuses.has("dazed")).toBe(true);
  });

  it("interrupts a cast still going when the arrow lands", () => {
    const match = skillSim(target(vec2(300, 0)));
    shoot(match, 0);
    get(match, "target").combatant.cast.beginCast("elementalist.fireball", "archer", 2, undefined);
    expect(kinds(landSkill(match))).toContain("interrupted");
    expect(get(match, "target").combatant.cast.isCasting).toBe(false);
  });

  it("does not interrupt a cast that finished before the arrow arrived", () => {
    const match = skillSim(target(vec2(300, 0)));
    shoot(match, 0);
    get(match, "target").combatant.cast.beginCast(
      "elementalist.fireball",
      "archer",
      2 * DT,
      undefined,
    );
    const landed = landSkill(match);
    expect(kinds(landed)).not.toContain("interrupted");
    expect(kinds(landed)).toContain("status-applied");
  });

  it("a target that steps aside dodges it: no blow and no Daze", () => {
    const match = skillSim(target(vec2(300, 0)));
    shoot(match, 0, UP);
    match.setInputDirection("target", DOWN);
    expect(landSkill(match).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);
    expect(get(match, "target").combatant.statuses.has("dazed")).toBe(false);
  });

  it("a wall along the flight stops it: obstructed, no Daze", () => {
    const match = new MatchSimulation({
      seed: "pillar",
      walls: [
        { a: vec2(200, 5), b: vec2(220, 5) },
        { a: vec2(220, 5), b: vec2(220, 100) },
        { a: vec2(220, 100), b: vec2(200, 100) },
        { a: vec2(200, 100), b: vec2(200, 5) },
      ],
      participants: [skilled(vec2(0, 0)), target(vec2(300, -200))],
    });
    shoot(match, 0, UP);
    expect(match.projectiles[0]?.obstructed).toBe(true);
    expect(landSkill(match).events).toEqual([{ kind: "attack-obstructed", targetId: "target" }]);
    expect(get(match, "target").combatant.statuses.has("dazed")).toBe(false);
  });

  it("Barrage releases an arrow at each adjacent foe, each flying and landing on its own", () => {
    const match = skillSim(
      target(vec2(300, 0)),
      foe("north", vec2(300, 30)),
      foe("south", vec2(300, -30)),
    );
    shoot(match, 1);
    expect(match.projectiles.map((projectile) => projectile.targetId).sort()).toEqual([
      "north",
      "south",
      "target",
    ]);
    // "north" steps away and dodges; the other two are hit.
    match.setInputDirection("north", UP);
    const landed: CombatLogEntry[] = [];
    for (let i = 0; i < 200 && landed.length < 3; i += 1) {
      landed.push(...match.step(DT).log.filter((entry) => entry.skillId === BARRAGE));
    }
    const outcome = Object.fromEntries(
      landed.flatMap((entry) =>
        entry.events
          .filter(({ kind }) => kind !== "adrenaline-gained")
          .map((event) => [event.targetId, event.kind]),
      ),
    );
    expect(outcome).toEqual({ north: "attack-dodged", south: "damage", target: "damage" });
  });

  it("blocked, it lands no riders and earns no adrenaline", () => {
    // The first seed whose arrow is blocked: half are.
    for (let seed = 0; seed < 20; seed += 1) {
      const match = new MatchSimulation({
        seed: `block-${String(seed)}`,
        participants: [skilled(vec2(0, 0)), target(vec2(300, 0))],
      });
      get(match, "target").combatant.statuses.apply("guardian", 1000, "target", NO_RANKS);
      shoot(match, 0);
      const landed = landSkill(match);
      if (!kinds(landed).includes("attack-blocked")) {
        continue;
      }
      expect(kinds(landed)).toEqual(["attack-blocked"]);
      expect(get(match, "target").combatant.statuses.has("dazed")).toBe(false);
      expect(strikesOf(get(match, "archer").combatant, BACKBREAKER)).toBe(0);
      return;
    }
    throw new Error("no seed blocked the arrow");
  });
});

describe("Fireball flies (#535)", () => {
  const FIREBALL = "elementalist.fireball";
  const FIREBALL_SPEED = getSkill(FIREBALL)?.projectile?.speed ?? 0;

  /** An Elementalist at rank 12 Fire Magic with Fireball, and the energy for it. */
  function elementalist(spawn: Vec2): ParticipantSpec {
    return {
      id: "caster",
      team: 0,
      skillBar: [FIREBALL],
      attributeRanks: new Map([["elementalist.fire-magic", 12]]),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  function fireSim(
    foes: readonly ParticipantSpec[] = [target(vec2(300, 0))],
    walls: readonly Segment[] = [],
  ): MatchSimulation {
    return new MatchSimulation({
      seed: "fireball",
      walls,
      participants: [elementalist(vec2(0, 0)), ...foes],
    });
  }

  /**
   * Cast Fireball at `target`, with the target walking `walking` from the
   * start of the cast, and return the entry its completion logged.
   */
  function cast(match: MatchSimulation, walking: Vec2 = ZERO): CombatLogEntry {
    match.setTarget("caster", "target");
    match.setInputDirection("target", walking);
    expect(match.requestSkill("caster", 0)?.check).toEqual({ ok: true });
    for (let i = 0; i < 100; i += 1) {
      const completed = match.step(DT).log.find((entry) => entry.skillId === FIREBALL);
      if (completed !== undefined) {
        return completed;
      }
    }
    throw new Error("the cast never completed");
  }

  /** Step until the Fireball lands, and return what it did. */
  function landFireball(match: MatchSimulation): CombatLogEntry {
    for (let i = 0; i < 200; i += 1) {
      const entry = match.step(DT).log.find((logged) => logged.skillId === FIREBALL);
      if (entry !== undefined) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  const health = (match: MatchSimulation, id: string) => get(match, id).combatant.health;

  it("lands its damage and splash when it arrives, not at cast completion", () => {
    const match = fireSim([target(vec2(300, 0)), { ...target(vec2(330, 0)), id: "beside" }]);
    const completed = cast(match);
    expect(completed.events.map((event) => event.kind)).toEqual(["skill-used"]);
    expect(completed.area).toBeUndefined();
    expect(match.projectiles).toHaveLength(1);
    expect(match.projectiles[0]?.skillHit).toMatchObject({
      kind: "spell",
      caster: { id: "caster" },
    });
    expect(match.projectiles[0]?.flightSeconds).toBeCloseTo(300 / FIREBALL_SPEED, 9);
    expect(health(match, "target")).toBe(1e6);
    expect(get(match, "caster").combatant.cast.rechargeRemaining.has(FIREBALL)).toBe(true);

    const landed = landFireball(match);
    expect(landed.atSeconds - completed.atSeconds).toBeGreaterThanOrEqual(
      300 / FIREBALL_SPEED - DT,
    );
    expect(landed.events.map((event) => [event.kind, event.targetId])).toEqual([
      ["damage", "target"],
      ["damage", "beside"],
    ]);
    expect(landed.area).toMatchObject({ x: 300, y: 0 });
    expect(health(match, "target")).toBeLessThan(1e6);
    expect(health(match, "beside")).toBeLessThan(1e6);
  });

  it("a target that sidesteps takes nothing, and nobody where it lands is splashed", () => {
    const match = fireSim([target(vec2(300, 0)), { ...target(vec2(300, -300)), id: "beside" }]);
    cast(match, UP);
    match.setInputDirection("target", DOWN);
    // Someone standing exactly where it lands is not caught: a miss splashes nobody.
    const aimPoint = match.projectiles[0]?.aimPoint;
    expect(aimPoint).toBeDefined();
    get(match, "beside").position = aimPoint ?? ZERO;

    expect(landFireball(match).events).toEqual([{ kind: "attack-dodged", targetId: "target" }]);
    expect(health(match, "target")).toBe(1e6);
    expect(health(match, "beside")).toBe(1e6);
  });

  it("a wall along the flight stops it: obstructed, no damage", () => {
    const match = fireSim(
      [target(vec2(300, -200))],
      [
        { a: vec2(200, 5), b: vec2(220, 5) },
        { a: vec2(220, 5), b: vec2(220, 100) },
        { a: vec2(220, 100), b: vec2(200, 100) },
        { a: vec2(200, 100), b: vec2(200, 5) },
      ],
    );
    cast(match, UP);
    expect(match.projectiles[0]?.obstructed).toBe(true);
    expect(landFireball(match).events).toEqual([{ kind: "attack-obstructed", targetId: "target" }]);
    expect(health(match, "target")).toBe(1e6);
  });

  it("still lands if its caster dies in flight", () => {
    const match = fireSim();
    cast(match);
    kill(match, "caster");
    expect(landFireball(match).events.map((event) => event.kind)).toEqual(["damage"]);
    expect(health(match, "target")).toBeLessThan(1e6);
  });

  it("does nothing if its target dies in flight", () => {
    const match = fireSim();
    cast(match);
    kill(match, "target");
    for (let i = 0; i < Math.ceil(1 / DT); i += 1) {
      expect(match.step(DT).log.filter((entry) => entry.skillId === FIREBALL)).toEqual([]);
    }
    expect(match.projectiles).toHaveLength(0);
  });

  it("is not blinded: a blind caster's Fireball still flies", () => {
    const match = fireSim();
    get(match, "caster").combatant.statuses.apply("blind", 1000, "target", NO_RANKS);
    cast(match);
    expect(match.projectiles).toHaveLength(1);
    expect(landFireball(match).events.map((event) => event.kind)).toEqual(["damage"]);
  });

  it("interrupted before it completes, nothing flies", () => {
    const match = fireSim();
    match.setTarget("caster", "target");
    expect(match.requestSkill("caster", 0)?.check).toEqual({ ok: true });
    match.step(DT);
    get(match, "caster").combatant.cast.cancelCast();
    for (let i = 0; i < Math.ceil(2 / DT); i += 1) {
      match.step(DT);
      expect(match.projectiles).toHaveLength(0);
    }
    expect(health(match, "target")).toBe(1e6);
  });
});

describe("Lightning Orb flies (#761)", () => {
  const ORB = "elementalist.lightning-orb";
  const ORB_SPEED = getSkill(ORB)?.projectile?.speed ?? 0;

  function orbSim(): MatchSimulation {
    return new MatchSimulation({
      seed: "lightning-orb",
      participants: [
        {
          id: "caster",
          team: 0,
          skillBar: [ORB],
          attributeRanks: new Map([["elementalist.air-magic", 12]]),
          equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          maxEnergy: 1000,
          spawn: vec2(0, 0),
          facing: 0,
        },
        target(vec2(300, 0)),
      ],
    });
  }

  /** Cast at the target, walking `walking` from the start, and step until it lands. */
  function castAndLand(match: MatchSimulation, walking: Vec2 = ZERO, then: Vec2 = walking) {
    match.setTarget("caster", "target");
    match.setInputDirection("target", walking);
    expect(match.requestSkill("caster", 0)?.check).toEqual({ ok: true });
    let completed: CombatLogEntry | undefined;
    for (let i = 0; i < 300; i += 1) {
      const entry = match.step(DT).log.find((logged) => logged.skillId === ORB);
      if (entry === undefined) {
        continue;
      }
      if (completed !== undefined) {
        return { completed, landed: entry };
      }
      completed = entry;
      match.setInputDirection("target", then);
    }
    throw new Error("nothing landed");
  }

  it("flies faster than Fireball and lands 82 lightning at 25% armor penetration", () => {
    const fireballSpeed = getSkill("elementalist.fireball")?.projectile?.speed ?? 0;
    expect(ORB_SPEED).toBe(1.5 * fireballSpeed);
    const match = orbSim();
    const { completed, landed } = castAndLand(match);
    expect(completed.events.map((event) => event.kind)).toEqual(["skill-used"]);
    expect(landed.atSeconds - completed.atSeconds).toBeGreaterThanOrEqual(300 / ORB_SPEED - DT);
    const victim = get(match, "target").combatant;
    const expected = mitigate(skillDamage(82, "lightning", 0.25), victim, RULES.combat, "chest");
    expect(expected).toBeGreaterThan(
      mitigate(skillDamage(82, "lightning", 0), victim, RULES.combat, "chest"),
    );
    expect(landed.events).toEqual([
      expect.objectContaining({ kind: "damage", targetId: "target", amount: expected }),
    ]);
    expect(victim.health).toBe(1e6 - expected);
  });

  it("a target that sidesteps takes nothing", () => {
    const match = orbSim();
    expect(castAndLand(match, UP, DOWN).landed.events).toEqual([
      { kind: "attack-dodged", targetId: "target" },
    ]);
    expect(get(match, "target").combatant.health).toBe(1e6);
  });
});

describe("Shard Storm flies (#918)", () => {
  const SHARD = "elementalist.shard-storm";

  function shardSim(): MatchSimulation {
    return new MatchSimulation({
      seed: "shard-storm",
      participants: [
        {
          id: "caster",
          team: 0,
          skillBar: [SHARD],
          attributeRanks: new Map([["elementalist.water-magic", 12]]),
          equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          maxEnergy: 1000,
          spawn: vec2(0, 0),
          facing: 0,
        },
        target(vec2(300, 0)),
      ],
    });
  }

  /** Cast at the target, walking `walking`, then `then` once it flies; step until it lands. */
  function castAndLand(match: MatchSimulation, walking: Vec2, then: Vec2): CombatLogEntry {
    match.setTarget("caster", "target");
    match.setInputDirection("target", walking);
    expect(match.requestSkill("caster", 0)?.check).toEqual({ ok: true });
    let flying = false;
    for (let i = 0; i < 300; i += 1) {
      const entry = match.step(DT).log.find((logged) => logged.skillId === SHARD);
      if (entry === undefined) {
        continue;
      }
      if (flying) {
        return entry;
      }
      flying = true;
      match.setInputDirection("target", then);
    }
    throw new Error("nothing landed");
  }

  it("lands its damage and its slow when it hits", () => {
    const match = shardSim();
    const landed = castAndLand(match, ZERO, ZERO);
    expect(landed.events.map((event) => event.kind)).toEqual(["damage", "status-applied"]);
    expect(get(match, "target").combatant.statuses.has("shard-storm")).toBe(true);
  });

  it("a target that sidesteps takes nothing and is not slowed", () => {
    const match = shardSim();
    expect(castAndLand(match, UP, DOWN).events).toEqual([
      { kind: "attack-dodged", targetId: "target" },
    ]);
    const victim = get(match, "target").combatant;
    expect(victim.health).toBe(1e6);
    expect(victim.statuses.has("shard-storm")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { tallyCombat, type CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
const SWIFT_CHOP = "warrior.swift-chop";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: { weapon, attributeId, requirementMet: true },
  };
}

/** A swordsman at rank 12 who also knows a little fire, and Swift Chop. */
function swordsman(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL, ARMOR_OF_EARTH, SWIFT_CHOP],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
      ["elementalist.earth-magic", 12],
    ]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A 60-armor punching bag that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

function sim(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "swing", participants });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function swings(log: readonly CombatLogEntry[]): CombatLogEntry[] {
  return log.filter((entry) => entry.cause === "weapon");
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

describe("requestAttack", () => {
  it("refuses anything but a living enemy, and a dead attacker", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      swordsman("ally", vec2(0, 50)),
      dummy("d", vec2(40, 0)),
    );
    expect(match.requestAttack("a", "a")).toEqual({ ok: false, reason: "invalid-target-self" });
    expect(match.requestAttack("a", "ally")).toEqual({ ok: false, reason: "invalid-target-ally" });
    expect(match.requestAttack("a", "nobody")).toEqual({ ok: false, reason: "no-target" });
    expect(match.requestAttack("nobody", "d")).toBeUndefined();
    get(match, "d").combatant.dead = true;
    expect(match.requestAttack("a", "d")).toEqual({ ok: false, reason: "invalid-target-dead" });
    get(match, "d").combatant.dead = false;
    get(match, "a").combatant.dead = true;
    expect(match.requestAttack("a", "d")).toEqual({ ok: false, reason: "caster-dead" });
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });
});

describe("the swing", () => {
  it("a sword at 40 units hits every 1.33 s, for its range at 60 armor", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    expect(match.requestAttack("a", "d")).toEqual({ ok: true });
    const hits = swings(stepFor(match, 14));

    expect(hits).toHaveLength(10);
    const times = hits.map((entry) => entry.atSeconds);
    expect(times[0]).toBeCloseTo(1.35, 6);
    for (let i = 1; i < times.length; i += 1) {
      expect(Math.abs((times[i] ?? 0) - (times[i - 1] ?? 0) - 1.33)).toBeLessThanOrEqual(DT);
    }
    // Remainders carried, not zeroed: ten swings take ten intervals.
    expect((times[9] ?? 0) - (times[0] ?? 0)).toBeCloseTo(9 * 1.33, 1);

    for (const entry of hits) {
      expect(entry).toMatchObject({ sourceId: "a", skillId: undefined, area: undefined });
      for (const event of entry.events) {
        expect(event.kind).toBe("damage");
        if (event.kind === "damage") {
          expect(event.amount).toBeGreaterThanOrEqual(15);
          expect(event.amount).toBeLessThanOrEqual(22);
        }
      }
    }
    // +3 per landed swing, capped.
    expect(get(match, "a").combatant.adrenaline).toBe(RULES.resources.maxAdrenaline);
  });

  it("walks into reach first; the first hit lands one interval after arriving", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(200, 0)));
    match.requestAttack("a", "d");
    let arrived: number | undefined;
    let firstHit: number | undefined;
    for (let i = 0; i < 100 && firstHit === undefined; i += 1) {
      const result = match.step(DT);
      const near =
        distance(get(match, "a").position, get(match, "d").position) <= WEAPONS.sword.range;
      if (near && arrived === undefined) {
        arrived = result.elapsedSeconds;
      }
      if (swings(result.log).length > 0) {
        firstHit = result.elapsedSeconds;
      }
    }
    expect(arrived).toBeDefined();
    // 160 units at 180/s.
    expect(arrived ?? 0).toBeCloseTo(0.9, 6);
    expect(Math.abs((firstHit ?? 0) - (arrived ?? 0) - 1.33)).toBeLessThanOrEqual(DT);
  });

  it("a direction input cancels it; no direction does not", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(200, 0)));
    match.requestAttack("a", "d");
    match.setInputDirection("a", vec2(0, 0));
    expect(get(match, "a").combatant.attack).toBeDefined();
    stepFor(match, 0.5);
    match.setInputDirection("a", vec2(0, 1));
    expect(get(match, "a").combatant.attack).toBeUndefined();
    match.setInputDirection("a", vec2(0, 0));
    const x = get(match, "a").position.x;
    expect(swings(stepFor(match, 5))).toEqual([]);
    expect(get(match, "a").position.x).toBe(x);
  });

  it("stops when the target dies, and a corpse does not swing", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    get(match, "d").combatant.health = 1;
    const log = stepFor(match, 3);
    expect(swings(log)).toHaveLength(1);
    expect(swings(log)[0]?.events.map((event) => event.kind)).toEqual(["damage", "death"]);
    expect(get(match, "a").combatant.attack).toBeUndefined();

    const again = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    again.requestAttack("a", "d");
    get(again, "a").combatant.health = 0;
    get(again, "a").combatant.dead = true;
    expect(swings(stepFor(again, 3))).toEqual([]);
  });

  it("asking again for the same target keeps the swing; a new target restarts it", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)), dummy("e", vec2(0, 40)));
    match.requestAttack("a", "d");
    stepFor(match, 1);
    match.requestAttack("a", "d");
    expect(get(match, "a").combatant.attack?.swingElapsed).toBeCloseTo(1, 6);
    match.requestAttack("a", "e");
    expect(get(match, "a").combatant.attack).toEqual({ targetId: "e", swingElapsed: 0 });
  });
});

describe("skills and the swing", () => {
  it("a Fireball mid-swing loses the swing; the attack resumes once it lands", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    stepFor(match, 1);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(get(match, "a").combatant.attack?.swingElapsed).toBe(0);

    const log = stepFor(match, 3);
    const fireball = log.find((entry) => entry.cause === "skill");
    const hit = swings(log)[0];
    // Fireball lands 1 s in; no swing while it was cast, then a full one.
    expect(fireball?.atSeconds).toBeCloseTo(2, 6);
    expect(Math.abs((hit?.atSeconds ?? 0) - 2 - 1.33)).toBeLessThanOrEqual(DT);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a self-enchant keeps the attack target", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(match, 1);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a skill at another enemy switches the attack to them once it lands", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(0, 300)),
    );
    match.requestAttack("a", "d");
    match.setTarget("a", "e");
    match.requestSkill("a", 0);
    // Still on d while the Fireball is in the air: a cast only pauses.
    stepFor(match, 0.5);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    stepFor(match, 0.6);
    expect(get(match, "a").combatant.attack).toEqual({
      targetId: "e",
      swingElapsed: expect.any(Number) as number,
    });
  });

  it("a skill at an enemy starts an attack on them, and the swordsman walks in", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 0.9);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    stepFor(match, 0.2);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    stepFor(match, 1);
    expect(get(match, "a").position.x).toBeGreaterThan(0);
  });

  it("an interrupted cast at an enemy starts nothing, and resumes the attack in progress", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(0, 300)),
    );
    match.setTarget("a", "e");
    match.requestSkill("a", 0);
    get(match, "a").combatant.cast.cancelCast();
    stepFor(match, 1.1);
    expect(get(match, "a").combatant.attack).toBeUndefined();

    match.requestAttack("a", "d");
    match.requestSkill("a", 0);
    get(match, "a").combatant.cast.cancelCast();
    stepFor(match, 1.1);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });
});

describe("moving", () => {
  it("an attack asked for mid-walk is dropped, and never doubles the walking speed", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(0, 300)));
    match.setInputDirection("a", vec2(1, 0));
    expect(match.requestAttack("a", "d")).toEqual({ ok: true });
    const step = RULES.movement.maxSpeedUnitsPerSecond * DT;
    for (let i = 0; i < 20; i += 1) {
      const before = get(match, "a").position;
      match.step(DT);
      const after = get(match, "a").position;
      expect(distance(before, after)).toBeCloseTo(step, 9);
      expect(after.y).toBe(0);
    }
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });
});

describe("adrenaline", () => {
  it("a landed swing gives +3, as a damaging attack skill does", () => {
    const hit = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    hit.requestAttack("a", "d");
    stepFor(hit, 1.4);
    expect(get(hit, "a").combatant.adrenaline).toBe(RULES.resources.adrenalinePerHit);

    const chop = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    chop.setTarget("a", "d");
    expect(chop.requestSkill("a", 2)?.check).toEqual({ ok: true });
    stepFor(chop, DT);
    expect(get(chop, "a").combatant.adrenaline).toBe(RULES.resources.adrenalinePerHit);
  });

  it("a damaging spell gives none (Q19)", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 1.1);
    expect(
      log.some((entry) => entry.cause === "skill" && entry.events.some((e) => e.kind === "damage")),
    ).toBe(true);
    expect(get(match, "a").combatant.adrenaline).toBe(0);
  });
});

describe("the log", () => {
  it("a double strike is one entry with two hits, both credited to the attacker", () => {
    const always: Weapon = {
      ...WEAPONS.daggers,
      doubleStrike: { attributeId: "assassin.dagger-mastery", baseChance: 1, perRank: 0 },
    };
    const match = sim(
      { ...swordsman("a", vec2(0, 0)), equipment: wielding(always, "assassin.dagger-mastery") },
      dummy("d", vec2(40, 0)),
    );
    match.requestAttack("a", "d");
    const [entry] = swings(stepFor(match, 1.4));
    expect(entry?.events.map((event) => event.kind)).toEqual(["damage", "damage"]);
    const total = (entry?.events ?? []).reduce(
      (sum, event) => sum + (event.kind === "damage" ? event.amount : 0),
      0,
    );
    expect(tallyCombat(entry === undefined ? [] : [entry]).damageByActor.get("a")).toBe(total);
    // Two hits, one swing: adrenaline once.
    expect(get(match, "a").combatant.adrenaline).toBe(3);
  });

  it("two runs from one seed write the same log", () => {
    const run = (): CombatLogEntry[] => {
      const match = sim(
        {
          ...swordsman("a", vec2(0, 0)),
          equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery"),
        },
        dummy("d", vec2(200, 0)),
        dummy("e", vec2(220, 20)),
        dummy("f", vec2(220, -20)),
      );
      get(match, "a").combatant.statuses.apply("blind", 5, "d");
      match.requestAttack("a", "d");
      return stepFor(match, 20);
    };
    const first = run();
    expect(swings(first).length).toBeGreaterThan(5);
    expect(run()).toEqual(first);
  });
});

describe("the approach on Arena Alpha (#211)", () => {
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

  function arena(walls: readonly Segment[], ...participants: ParticipantSpec[]): MatchSimulation {
    return new MatchSimulation({
      seed: "arena",
      walls,
      bounds: { width: 960, height: 640 },
      participants,
    });
  }

  function archer(id: string, spawn: Vec2): ParticipantSpec {
    return {
      ...swordsman(id, spawn),
      skillBar: [],
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    };
  }

  it("walks a sword from one spawn round the walls to the other, and hits", () => {
    const match = arena(WALLS, swordsman("a", vec2(80, 320)), dummy("d", vec2(880, 320)));
    match.requestAttack("a", "d");

    // The shortest way round, by hand (pathing.test.ts), at full speed.
    const pathLength = Math.hypot(205, 19) + 150 + Math.hypot(445, 19);
    const allowed = pathLength / RULES.movement.maxSpeedUnitsPerSecond + 1;
    let seconds = 0;
    while (distance(get(match, "a").position, vec2(880, 320)) > WEAPONS.sword.range) {
      match.step(DT);
      seconds += DT;
      expect(seconds).toBeLessThanOrEqual(allowed);
    }
    const hits = swings(stepFor(match, WEAPONS.sword.attackIntervalSeconds * 2 + DT));
    expect(hits.some((entry) => entry.events.some((event) => event.kind === "damage"))).toBe(true);
  });

  it("walks a bow out from behind the central wall until it sees, then shoots", () => {
    // In range already, but the wall is in the way.
    const match = arena(WALLS, archer("a", vec2(400, 150)), dummy("d", vec2(520, 150)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 6);
    const kinds = swings(log).flatMap((entry) => entry.events.map((event) => event.kind));
    expect(kinds).not.toContain("attack-obstructed");
    expect(kinds).toContain("damage");
    expect(get(match, "a").position).not.toEqual(vec2(400, 150));
  });

  it("gives up on a target walled in, once, and says so", () => {
    const boxed = [...WALLS, ...rect(600, 400, 120, 120)];
    const match = arena(boxed, swordsman("a", vec2(80, 320)), dummy("d", vec2(660, 460)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    const unreachable = swings(log).filter((entry) =>
      entry.events.some((event) => event.kind === "attack-unreachable"),
    );
    expect(unreachable).toHaveLength(1);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(get(match, "a").position).toEqual(vec2(80, 320));
  });
});

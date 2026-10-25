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
    expect(get(match, "a").combatant.attack).toEqual({
      targetId: "e",
      swingElapsed: 0,
      unreachableSeconds: 0,
    });
  });
});

describe("skills and the swing", () => {
  it("a Fireball mid-swing loses the swing; the attack resumes after its aftercast", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    stepFor(match, 1);
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(get(match, "a").combatant.attack?.swingElapsed).toBe(0);

    const log = stepFor(match, 4);
    const fireball = log.find((entry) => entry.cause === "skill");
    const hit = swings(log)[0];
    // Fireball lands 1 s in; no swing while it was cast or in the 0.75 s
    // aftercast (#317), then a full one.
    expect(fireball?.atSeconds).toBeCloseTo(2, 6);
    const aftercastEnds = 2 + RULES.combat.aftercastSeconds;
    expect(Math.abs((hit?.atSeconds ?? 0) - aftercastEnds - 1.33)).toBeLessThanOrEqual(DT);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a self-enchant keeps the attack target", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(match, 1);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });

  it("a spell at another enemy leaves the attack on the first, and the target on them (#317)", () => {
    const match = sim(
      swordsman("a", vec2(0, 0)),
      dummy("d", vec2(40, 0)),
      dummy("e", vec2(0, 300)),
    );
    match.requestAttack("a", "d");
    match.setTarget("a", "e");
    match.requestSkill("a", 0);
    const log = stepFor(match, 1 + RULES.combat.aftercastSeconds + 1.5);

    expect(log.find((entry) => entry.cause === "skill")?.events[0]?.targetId).toBe("e");
    expect(swings(log)[0]?.events[0]?.targetId).toBe("d");
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(get(match, "a").targetId).toBe("e");
  });

  it("a spell at an enemy starts no attack (#317)", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 1 + RULES.combat.aftercastSeconds + 1);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(get(match, "a").position).toEqual(vec2(0, 0));
  });

  it("an attack skill at an enemy starts an attack on them, and swings follow", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: true });
    const log = stepFor(match, 2);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(swings(log).length).toBeGreaterThan(0);
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
    // Not on the first failing tick: it has to last (#218).
    expect(unreachable[0]?.atSeconds).toBeCloseTo(RULES.combat.unreachableAfterSeconds, 5);
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });

  it("walks out of a notch it was squeezed into, rather than giving up (#218)", () => {
    // Two walls meeting at 60 degrees, opening to the left, and the
    // attacker pressed 20 units into the apex: 10 from each wall, well
    // inside its 14 of clearance, so no path leaves from where it stands.
    const apex = vec2(300, 300);
    const arm = 200;
    const notch = [
      segment(apex, vec2(300 - arm * Math.cos(Math.PI / 6), 300 - arm * Math.sin(Math.PI / 6))),
      segment(apex, vec2(300 - arm * Math.cos(Math.PI / 6), 300 + arm * Math.sin(Math.PI / 6))),
    ];
    const match = new MatchSimulation({
      seed: "notch",
      walls: notch,
      participants: [swordsman("a", vec2(280, 300)), dummy("d", vec2(100, 300))],
    });
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    expect(
      swings(log).some((entry) =>
        entry.events.some((event) => event.kind === "attack-unreachable"),
      ),
    ).toBe(false);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
    expect(distance(get(match, "a").position, vec2(100, 300))).toBeLessThanOrEqual(
      WEAPONS.sword.range,
    );
  });
});

describe("the auto-attack behaviour (#162)", () => {
  it("attacks the nearest enemy, and asks again once its target is back", () => {
    const attacker: ParticipantSpec = {
      ...swordsman("bot", vec2(0, 0)),
      team: 1,
      behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" } },
    };
    const victim: ParticipantSpec = {
      ...dummy("v", vec2(30, 0)),
      team: 0,
      reset: { kind: "on-death", afterSeconds: 1 },
    };
    const match = sim(attacker, victim);
    match.step(DT);
    expect(get(match, "bot").combatant.attack?.targetId).toBe("v");

    // Dead: the attack drops. Back: the behaviour attacks again, unasked.
    get(match, "v").combatant.health = 0;
    get(match, "v").combatant.dead = true;
    match.step(DT);
    expect(get(match, "bot").combatant.attack).toBeUndefined();
    stepFor(match, 1.5);
    expect(get(match, "v").combatant.dead).toBe(false);
    expect(get(match, "bot").combatant.attack?.targetId).toBe("v");
  });
});

describe("the approach round bodies (#277)", () => {
  function unreachable(log: readonly CombatLogEntry[]): CombatLogEntry[] {
    return swings(log).filter((entry) =>
      entry.events.some((event) => event.kind === "attack-unreachable"),
    );
  }

  it("steers round a body between it and its target, and hits", () => {
    // Weapon DPS as it stands: the spawn, the melee dummy just in front,
    // and the bow-range dummy behind it on the same line (#277's repro).
    const match = sim(
      swordsman("a", vec2(100, 210)),
      dummy("melee", vec2(136, 210)),
      dummy("ranged", vec2(480, 210)),
    );
    match.requestAttack("a", "ranged");

    const log = stepFor(match, 5);
    expect(unreachable(log)).toEqual([]);
    expect(distance(get(match, "a").position, vec2(480, 210))).toBeLessThanOrEqual(
      WEAPONS.sword.range,
    );
    const hits = swings(log).filter((entry) => entry.events.some((e) => e.kind === "damage"));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((entry) => entry.events.some((e) => e.targetId === "ranged"))).toBe(true);
  });

  it("gives up, once, when bodies box it in and it cannot move", () => {
    // Six bodies round it, each touching the next: there is a path, and
    // no way along it.
    const ring = [0, 1, 2, 3, 4, 5].map((k) =>
      dummy(
        `r${String(k)}`,
        vec2(200 + 28 * Math.cos((k * Math.PI) / 3), 200 + 28 * Math.sin((k * Math.PI) / 3)),
      ),
    );
    const match = sim(swordsman("a", vec2(200, 200)), ...ring, dummy("d", vec2(500, 200)));
    match.requestAttack("a", "d");

    const log = stepFor(match, 2);
    const ended = unreachable(log);
    expect(ended).toHaveLength(1);
    // Half a second of no progress (#218). Since #291 refuses a move deeper
    // into a body there is no jostling first, so it can land on 0.5 s exactly.
    const at = ended[0]?.atSeconds ?? 0;
    expect(at).toBeGreaterThanOrEqual(RULES.combat.unreachableAfterSeconds - 1e-9);
    expect(at).toBeLessThanOrEqual(RULES.combat.unreachableAfterSeconds + 3 * DT + 1e-9);
    expect(get(match, "a").combatant.attack).toBeUndefined();
  });

  it("is held, not lost, when it cannot move at all", () => {
    // No speed: every step asks for nothing, so no step is a stall.
    const still = { ...RULES, movement: { ...RULES.movement, maxSpeedUnitsPerSecond: 0 } };
    const match = new MatchSimulation({
      seed: "held",
      ruleset: still,
      participants: [swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0))],
    });
    match.requestAttack("a", "d");

    const log = stepFor(match, 3);
    expect(unreachable(log)).toEqual([]);
    expect(get(match, "a").combatant.attack?.targetId).toBe("d");
  });
});

describe("aftercast (#317)", () => {
  const AFTERCAST = RULES.combat.aftercastSeconds;

  it("attacking, a cast at the foe: no swing in the cast or the aftercast, then one full interval", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.requestAttack("a", "d");
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    const log = stepFor(match, 1 + AFTERCAST + 2);

    const first = swings(log)[0]?.atSeconds ?? 0;
    expect(first).toBeGreaterThan(1 + AFTERCAST);
    expect(
      Math.abs(first - (1 + AFTERCAST) - WEAPONS.sword.attackIntervalSeconds),
    ).toBeLessThanOrEqual(DT);
  });

  it("an attack skill has none: the next skill can be used at once", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 2);
    match.step(DT);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(false);
    expect(match.requestSkill("a", 1)).toEqual({ skillId: ARMOR_OF_EARTH, check: { ok: true } });
  });

  it("a cancelled or interrupted cast has none", () => {
    const moved = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    moved.setTarget("a", "d");
    moved.requestSkill("a", 0);
    stepFor(moved, 0.5);
    moved.setInputDirection("a", vec2(0, 1));
    moved.step(DT);
    expect(get(moved, "a").combatant.cast.inAftercast).toBe(false);

    const cut = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    cut.setTarget("a", "d");
    cut.requestSkill("a", 0);
    get(cut, "a").combatant.cast.cancelCast();
    stepFor(cut, 1.1);
    expect(get(cut, "a").combatant.cast.inAftercast).toBe(false);
  });

  it("holds a walking hero still, who walks the first tick after it ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(true);
    match.setInputDirection("a", vec2(0, 1));

    let ticks = 0;
    while (get(match, "a").combatant.cast.inAftercast) {
      match.step(DT);
      ticks += 1;
      expect(get(match, "a").position).toEqual(vec2(0, 0));
    }
    expect(ticks * DT).toBeCloseTo(AFTERCAST, 6);
    // Armor of Earth's own slow still applies; the body moves, that is all.
    match.step(DT);
    expect(get(match, "a").position.y).toBeGreaterThan(0);
  });

  it("a skill with an activation time pressed in it is queued, and starts the tick it ends", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    const energy = get(match, "a").combatant.energy;
    expect(match.requestSkill("a", 0)).toEqual({
      skillId: FIREBALL,
      check: { ok: true },
      queued: true,
    });
    // Nothing paid, nothing cast, until the aftercast ends.
    expect(get(match, "a").combatant.energy).toBe(energy);

    let ticks = 0;
    while (get(match, "a").combatant.cast.inAftercast) {
      expect(get(match, "a").combatant.cast.isCasting).toBe(false);
      match.step(DT);
      ticks += 1;
    }
    expect(ticks * DT).toBeCloseTo(AFTERCAST, 6);
    expect(get(match, "a").combatant.cast.activeCast).toMatchObject({
      skillId: FIREBALL,
      remainingSeconds: 1,
    });
    const log = stepFor(match, 1);
    expect(log.map((entry) => entry.skillId)).toEqual([FIREBALL]);
  });

  it("a second press replaces the queued skill", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 1);
    match.requestSkill("a", 0);
    match.requestSkill("a", 1);
    expect(get(match, "a").combatant.cast.queuedSlot).toBe(1);
    stepFor(match, AFTERCAST);
    expect(get(match, "a").combatant.cast.activeCast?.skillId).toBe(ARMOR_OF_EARTH);
  });

  it("an attack skill pressed in it goes off at once", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    get(match, "a").combatant.adrenaline = 25;
    expect(match.requestSkill("a", 2)).toEqual({ skillId: SWIFT_CHOP, check: { ok: true } });
    const log = stepFor(match, DT);
    expect(log.map((entry) => entry.skillId)).toEqual([SWIFT_CHOP]);
    expect(get(match, "a").combatant.cast.inAftercast).toBe(true);
  });

  it("a skill that could not go off is refused at the press, not queued", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    get(match, "a").combatant.energy = 0;
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "insufficient-energy" });
    expect(get(match, "a").combatant.cast.queuedSlot).toBeUndefined();
  });

  it("cancelling the attack drops the queue", () => {
    const match = sim(swordsman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 1);
    stepFor(match, 0.75);
    match.requestSkill("a", 0);
    match.cancelAttack("a");
    stepFor(match, AFTERCAST + DT);
    expect(get(match, "a").combatant.cast.isCasting).toBe(false);
  });
});

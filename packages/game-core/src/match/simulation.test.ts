import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedLoadout } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment } from "../geometry.js";
import { ANNIHILATION_MATCH_RULES, type MatchRules } from "../match-rules.js";
import { BASE_ENERGY_PIPS_BY_PROFESSION } from "../equipment/armor.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { NO_RANKS, ENERGY_PER_PIP } from "../skills/status.js";
import { chargeAdrenaline, strikesOf } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ORISON = "monk.orison-of-healing";
const BARRAGE = "ranger.barrage";
const BACKBREAKER = "warrior.backbreaker";
/** An elementalist's energy regeneration, per second. */
const CASTER_REGEN = BASE_ENERGY_PIPS_BY_PROFESSION.elementalist * ENERGY_PER_PIP;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 2,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 8,
  deathPenalty: false,
};

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    // Backbreaker only so a test can watch adrenaline (#463): unarmed, it
    // cannot be used.
    skillBar: [FIREBALL, BACKBREAKER],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.elementalist,
    ...extra,
  };
}

/** Two players 200 units apart, a and b, on opposite teams. */
function duel(matchRules?: MatchRules): MatchSimulation {
  return new MatchSimulation({
    seed: "duel",
    matchRules,
    participants: [spec("a", 0, vec2(0, 0)), spec("b", 1, vec2(200, 0))],
  });
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/**
 * How long a Fireball flies over `units`, in whole ticks: it lands this
 * long after its cast resolves (#535).
 */
function fireballFlight(units: number): number {
  const speed = getSkill(FIREBALL)?.projectile?.speed;
  if (speed === undefined) {
    throw new Error("Fireball does not fly");
  }
  return Math.ceil(units / speed / DT) * DT;
}

/** A Fireball's flight across the duel's 200 units. */
const FIREBALL_FLIGHT = fireballFlight(200);

function participant(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

describe("MatchSimulation step", () => {
  it.each([
    ["warrior", 2],
    ["ranger", 3],
    ["monk", 4],
  ] as const)(
    "regenerates a %s's %i energy pips, a third of an energy each a second",
    (profession, pips) => {
      expect(BASE_ENERGY_PIPS_BY_PROFESSION[profession]).toBe(pips);
      const sim = new MatchSimulation({
        seed: "regen",
        participants: [
          spec("a", 0, vec2(0, 0), { baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION[profession] }),
        ],
      });
      const a = participant(sim, "a");
      a.combatant.energy = 0;
      stepFor(sim, 3);
      expect(a.combatant.energy).toBeCloseTo(pips, 6);
    },
  );

  it("regenerates up to max energy and no further, and never below 0", () => {
    const sim = new MatchSimulation({
      seed: "regen",
      participants: [
        spec("up", 0, vec2(0, 0)),
        spec("down", 1, vec2(200, 0), { baseEnergyPips: -2 }),
      ],
    });
    const up = participant(sim, "up");
    const down = participant(sim, "down");
    up.combatant.energy = up.combatant.maxEnergy - 0.1;
    down.combatant.energy = 0.1;
    stepFor(sim, 2);
    expect(up.combatant.energy).toBe(up.combatant.maxEnergy);
    expect(down.combatant.energy).toBe(0);
  });

  it.each([
    ["Blood Ritual", ["blood-ritual"], 3 + 3],
    ["Malaise", ["malaise"], 3 - 1],
    ["both, which sum", ["blood-ritual", "malaise"], 3 + 3 - 1],
  ] as const)(
    "under %s, a ranger regenerates its pips plus the statuses' over 3 s",
    (_, ids, pips) => {
      const sim = new MatchSimulation({
        seed: "regen",
        participants: [
          spec("a", 0, vec2(0, 0), { baseEnergyPips: BASE_ENERGY_PIPS_BY_PROFESSION.ranger }),
        ],
      });
      const a = participant(sim, "a");
      for (const id of ids) {
        a.combatant.statuses.apply(id, 10, "a", NO_RANKS);
      }
      a.combatant.energy = 0;
      stepFor(sim, 3);
      expect(a.combatant.energy).toBeCloseTo(pips, 6);
    },
  );

  it("drains no energy below 0 under Malaise", () => {
    const sim = new MatchSimulation({
      seed: "regen",
      participants: [spec("a", 0, vec2(0, 0), { baseEnergyPips: 0 })],
    });
    const a = participant(sim, "a");
    a.combatant.statuses.apply("malaise", 10, "a", NO_RANKS);
    a.combatant.energy = 0.1;
    stepFor(sim, 2);
    expect(a.combatant.energy).toBe(0);
  });

  it("clamps the energy pips to 10", () => {
    const sim = new MatchSimulation({
      seed: "regen",
      participants: [spec("a", 0, vec2(0, 0), { baseEnergyPips: 14 })],
    });
    const a = participant(sim, "a");
    a.combatant.energy = 0;
    stepFor(sim, 3);
    expect(a.combatant.energy).toBeCloseTo(10, 6);
  });

  it("casts through requestSkill, resolves after the activation time, and logs it", () => {
    const sim = duel();
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)).toEqual({ skillId: FIREBALL, check: { ok: true } });

    const log = stepFor(sim, 1);
    // The cast resolves and the Fireball leaves the hand: only the use (#1735).
    expect(log).toEqual([
      {
        tick: 20,
        atSeconds: expect.closeTo(1, 6) as number,
        cause: "skill",
        sourceId: "a",
        skillId: FIREBALL,
        weaponId: undefined,
        area: undefined,
        doubleStrike: false,
        events: [{ kind: "skill-used", casterId: "a", skillId: FIREBALL, targetId: "b" }],
      },
    ]);
    expect(stepFor(sim, FIREBALL_FLIGHT)).toEqual([
      {
        tick: 30,
        atSeconds: expect.closeTo(1.5, 6) as number,
        cause: "skill",
        sourceId: "a",
        skillId: FIREBALL,
        weaponId: undefined,
        // Fireball's splash, centred on b, who stands alone in it.
        area: { x: 200, y: 0, radius: 81 },
        doubleStrike: false,
        events: [{ kind: "damage", targetId: "b", amount: 91, critical: false }],
      },
    ]);
    // A spell earns no adrenaline, whatever it hits; only attacks do.
    expect(strikesOf(participant(sim, "a").combatant, BACKBREAKER)).toBe(0);
  });

  it("says why a cast was refused, and nothing for an empty slot", () => {
    const sim = duel();
    participant(sim, "b").combatant.dead = true;
    expect(sim.requestSkill("a", 0)).toEqual({
      skillId: FIREBALL,
      check: { ok: false, reason: "no-target" },
    });
    expect(sim.requestSkill("a", 5)).toBeUndefined();
    expect(sim.requestSkill("nobody", 0)).toBeUndefined();
  });

  it("keeps a bar's gaps: an empty slot does nothing, the next slot casts its own skill (#347)", () => {
    const sim = new MatchSimulation({
      seed: "gap",
      participants: [
        spec("a", 0, vec2(0, 0), { skillBar: [ORISON, null, FIREBALL] }),
        spec("b", 1, vec2(200, 0)),
      ],
    });
    sim.setTarget("a", "b");
    const energy = participant(sim, "a").combatant.energy;

    expect(sim.requestSkill("a", 1)).toBeUndefined();
    expect(participant(sim, "a").combatant.cast.isCasting).toBe(false);
    expect(participant(sim, "a").combatant.energy).toBe(energy);

    expect(sim.requestSkill("a", 2)).toEqual({ skillId: FIREBALL, check: { ok: true } });
  });

  it("with no target, an enemy skill targets the nearest living enemy, and keeps it", () => {
    const sim = new MatchSimulation({
      seed: "auto",
      participants: [
        spec("a", 0, vec2(0, 0)),
        spec("ally", 0, vec2(50, 0)),
        spec("dead", 1, vec2(100, 0)),
        spec("far", 1, vec2(400, 0)),
        spec("near", 1, vec2(0, 300)),
        spec("tie", 1, vec2(300, 0)),
      ],
    });
    participant(sim, "dead").combatant.dead = true;
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    // 300 away both ways: the tie goes to the first added.
    expect(participant(sim, "a").targetId).toBe("near");

    // A target already chosen is never replaced, even a farther one.
    sim.setTarget("ally", "far");
    sim.requestSkill("ally", 0);
    expect(participant(sim, "ally").targetId).toBe("far");
  });

  it("an ally skill with an enemy or nothing selected heals the caster (#52)", () => {
    const monk = (id: string, team: number, spawn: Vec2) =>
      spec(id, team, spawn, {
        skillBar: [ORISON],
        attributeRanks: new Map([["monk.healing-prayers", 12]]),
      });
    const sim = new MatchSimulation({
      seed: "orison",
      participants: [
        monk("a", 0, vec2(0, 0)),
        monk("ally", 0, vec2(50, 0)),
        monk("b", 1, vec2(200, 0)),
      ],
    });
    // The skill's heals: by now, natural regeneration heals them all too.
    const healed = (log: CombatLogEntry[]) =>
      log
        .filter((entry) => entry.cause === "skill")
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "heal");
    for (const id of ["a", "ally", "b"]) {
      participant(sim, id).combatant.health = 100;
    }

    // An enemy selected: the heal is the caster's, and the enemy stays selected.
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(healed(stepFor(sim, 3.5)).map((event) => event.targetId)).toEqual(["a"]);
    expect(participant(sim, "a").targetId).toBe("b");

    // Nothing selected: still the caster, and nothing gets selected.
    sim.setTarget("a", undefined);
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(healed(stepFor(sim, 3.5)).map((event) => event.targetId)).toEqual(["a"]);
    expect(participant(sim, "a").targetId).toBeUndefined();

    // An ally selected: the ally, as before.
    sim.setTarget("a", "ally");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(healed(stepFor(sim, 3.5)).map((event) => event.targetId)).toEqual(["ally"]);
  });

  it("removing a participant clears every target that pointed at them", () => {
    const sim = duel();
    sim.setTarget("a", "b");
    sim.remove("b");
    expect(participant(sim, "a").targetId).toBeUndefined();
    expect(sim.setTarget("a", "b")).toBe(false);
  });
});

// The next three branches had no test at all before the tick moved here
// from MatchRoom (#3): every server test passed with any of them broken.
describe("previously uncovered branches", () => {
  it("respawns the dead after respawnSeconds: full health and energy, no statuses, at spawn", () => {
    const sim = duel(MATCH);
    const b = participant(sim, "b");
    b.combatant.statuses.apply("weakness", 60, "a", NO_RANKS);
    b.combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 1 + FIREBALL_FLIGHT);
    expect(b.combatant.dead).toBe(true);
    b.position = vec2(300, 300);
    chargeAdrenaline(b.combatant);
    expect(b.respawnInSeconds).toBeGreaterThan(MATCH.respawnSeconds - 0.1);

    stepFor(sim, MATCH.respawnSeconds - 0.5);
    expect(b.combatant.dead).toBe(true);
    stepFor(sim, 0.5);
    expect(b.combatant.dead).toBe(false);
    expect(b.combatant.health).toBe(b.combatant.maxHealth);
    expect(b.combatant.energy).toBe(b.combatant.maxEnergy);
    expect(strikesOf(b.combatant, BACKBREAKER)).toBe(0);
    expect(b.combatant.statuses.active).toEqual([]);
    expect(b.position).toEqual(vec2(200, 0));
  });

  it("a degeneration death cancels the cast, credits the other team and schedules a respawn", () => {
    const sim = duel(MATCH);
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    a.combatant.statuses.apply("burning", 10, "b", NO_RANKS);
    a.combatant.health = 0.2;

    const log = stepFor(sim, DT);
    expect(a.combatant.dead).toBe(true);
    expect(a.combatant.cast.isCasting).toBe(false);
    expect(a.respawnInSeconds).toBe(MATCH.respawnSeconds);
    expect(sim.score.byTeam.get(1)).toBe(1);
    expect(log).toEqual([
      {
        tick: 1,
        atSeconds: DT,
        cause: "degeneration",
        sourceId: "b",
        skillId: undefined,
        doubleStrike: false,
        events: [
          {
            kind: "damage",
            targetId: "a",
            amount: expect.closeTo(0.2, 9) as number,
            critical: false,
          },
          { kind: "death", targetId: "a" },
        ],
      },
    ]);

    // And the cancelled fireball never lands.
    expect(stepFor(sim, 2).filter((entry) => entry.cause === "skill")).toEqual([]);
  });

  it("living bodies block, corpses do not", () => {
    const sim = duel();
    const a = participant(sim, "a");
    const b = participant(sim, "b");
    sim.setInputDirection("a", vec2(1, 0));
    stepFor(sim, 2);
    // Walked straight into b and stopped against it.
    expect(b.position.x - a.position.x).toBeCloseTo(2 * RULES.collision.playerRadius, 6);

    b.combatant.dead = true;
    b.respawnInSeconds = Number.POSITIVE_INFINITY;
    stepFor(sim, 1);
    expect(a.position.x).toBeGreaterThan(b.position.x);
  });
});

describe("status modifiers in the match", () => {
  /** Two walkers on the same team, far from each other and from anyone. */
  function walkers(): MatchSimulation {
    return new MatchSimulation({
      seed: "walkers",
      participants: [spec("fast", 0, vec2(0, 0)), spec("slow", 0, vec2(0, 500))],
    });
  }

  it("a crippled player covers half the ground in the same time", () => {
    const sim = walkers();
    participant(sim, "slow").combatant.statuses.apply("crippled", 10, "foe", NO_RANKS);
    for (const id of ["fast", "slow"]) {
      sim.setInputDirection(id, vec2(1, 0));
    }
    stepFor(sim, 1);
    expect(participant(sim, "fast").position.x).toBeCloseTo(
      RULES.movement.maxSpeedUnitsPerSecond,
      6,
    );
    expect(participant(sim, "slow").position.x).toBeCloseTo(
      RULES.movement.maxSpeedUnitsPerSecond / 2,
      6,
    );
  });

  it("a dazed Fireball takes twice as long to land", () => {
    const sim = duel();
    participant(sim, "a").combatant.statuses.apply("dazed", 10, "b", NO_RANKS);
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    expect(participant(sim, "a").combatant.cast.activeCast?.totalSeconds).toBe(2);
    expect(stepFor(sim, 1.5)).toEqual([]);
    expect(stepFor(sim, 0.5).map((entry) => entry.skillId)).toEqual([FIREBALL]);
  });

  it("a Mesmer with Fast Casting 12 lands a 2 s Malaise in 1.15 s (#527)", () => {
    const malaise = "necromancer.malaise";
    const sim = new MatchSimulation({
      seed: "fast-casting",
      participants: [
        spec("a", 0, vec2(0, 0), {
          skillBar: [malaise],
          attributeRanks: new Map([["mesmer.fast-casting", 12]]),
        }),
        spec("b", 1, vec2(200, 0)),
      ],
    });
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    expect(participant(sim, "a").combatant.cast.activeCast?.totalSeconds).toBeCloseTo(1.149, 3);
    expect(stepFor(sim, 1.1)).toEqual([]);
    expect(stepFor(sim, 0.1).map((entry) => entry.skillId)).toEqual([malaise]);
  });
});

describe("walls", () => {
  it("stop movement and block line of sight", () => {
    const sim = new MatchSimulation({
      seed: "walls",
      walls: [segment(vec2(100, -500), vec2(100, 500))],
      participants: [spec("a", 0, vec2(0, 0)), spec("b", 1, vec2(200, 0))],
    });
    sim.setTarget("a", "b");
    // Out of sight, the skill is not refused: it walks round to see (#499).
    expect(sim.requestSkill("a", 0)).toMatchObject({ check: { ok: true }, queued: true });
    expect(participant(sim, "a").pendingSkill).toBeDefined();
    sim.cancelAction("a");

    sim.setInputDirection("a", vec2(1, 0));
    stepFor(sim, 2);
    expect(participant(sim, "a").position.x).toBeLessThanOrEqual(
      100 - RULES.collision.playerRadius + 1e-6,
    );
  });
});

describe("body blocking at a doorway (#291)", () => {
  const R = RULES.collision.playerRadius;
  const BLOCKER_X = 200;
  /**
   * A corridor `width` units wide between two walls along x, a blocker
   * standing still in its middle, and a mover hugging the lower wall to
   * its left.
   */
  function doorway(width: number): MatchSimulation {
    return new MatchSimulation({
      seed: "doorway",
      walls: [segment(vec2(-500, 0), vec2(900, 0)), segment(vec2(-500, width), vec2(900, width))],
      participants: [
        spec("mover", 0, vec2(100, R)),
        spec("blocker", 1, vec2(BLOCKER_X, width / 2)),
      ],
    });
  }
  const gap = (sim: MatchSimulation) =>
    Math.hypot(
      participant(sim, "mover").position.x - participant(sim, "blocker").position.x,
      participant(sim, "mover").position.y - participant(sim, "blocker").position.y,
    );

  // Along the wall, and pressed into it: both used to squeeze through.
  for (const direction of [vec2(1, 0), vec2(1, -1)]) {
    it(`holds a 60-unit corridor against a mover pushing (${String(direction.x)}, ${String(direction.y)})`, () => {
      const sim = doorway(60);
      sim.setInputDirection("mover", direction);
      for (let tick = 0; tick < 120; tick += 1) {
        sim.step(DT);
        expect(gap(sim)).toBeGreaterThanOrEqual(2 * R - 1e-6);
      }
      expect(participant(sim, "mover").position.x).toBeLessThan(BLOCKER_X - R);
      expect(participant(sim, "blocker").position).toEqual(vec2(BLOCKER_X, 30));
    });
  }

  it("lets a mover past along the wall where the gap is wider than a body", () => {
    const sim = doorway(90);
    sim.setInputDirection("mover", vec2(1, 0));
    stepFor(sim, 120 * DT);
    expect(participant(sim, "mover").position.x).toBeGreaterThan(BLOCKER_X + 2 * R);
  });

  it("lets a corpse in the doorway be walked past", () => {
    const sim = doorway(60);
    const blocker = participant(sim, "blocker");
    blocker.combatant.dead = true;
    blocker.respawnInSeconds = Number.POSITIVE_INFINITY;
    sim.setInputDirection("mover", vec2(1, 0));
    stepFor(sim, 120 * DT);
    expect(participant(sim, "mover").position.x).toBeGreaterThan(BLOCKER_X + 2 * R);
  });

  it("lets two bodies on the same point move apart", () => {
    const sim = new MatchSimulation({
      seed: "stacked",
      participants: [spec("a", 0, vec2(100, 100)), spec("b", 0, vec2(100, 100))],
    });
    sim.setInputDirection("a", vec2(-1, 0));
    stepFor(sim, 10 * DT);
    const a = participant(sim, "a").position;
    const b = participant(sim, "b").position;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * R - 1e-6);
  });
});

describe("the map's edge (#244)", () => {
  const R = RULES.collision.playerRadius;
  // Arena Alpha's size, no walls.
  const bounds = { width: 960, height: 640 };
  const walker = (bounded: boolean) =>
    new MatchSimulation({
      seed: "edge",
      bounds: bounded ? bounds : undefined,
      participants: [spec("a", 0, vec2(480, 320))],
    });
  const walk = (sim: MatchSimulation, direction: Vec2, seconds: number) => {
    sim.setInputDirection("a", direction);
    stepFor(sim, seconds);
    return participant(sim, "a").position;
  };

  it("stops a body at each of the four edges, the other axis unchanged", () => {
    expect(walk(walker(true), vec2(-1, 0), 5)).toEqual(vec2(R, 320));
    expect(walk(walker(true), vec2(1, 0), 5)).toEqual(vec2(960 - R, 320));
    expect(walk(walker(true), vec2(0, -1), 5)).toEqual(vec2(480, R));
    expect(walk(walker(true), vec2(0, 1), 5)).toEqual(vec2(480, 640 - R));
  });

  it("stops a body walking into a corner in the corner", () => {
    expect(walk(walker(true), vec2(-1, -1), 5)).toEqual(vec2(R, R));
  });

  it("lets a body wander off with no bounds, as the headless tools want", () => {
    const position = walk(walker(false), vec2(-1, 0), 5);
    expect(position.x).toBeLessThan(0);
  });
});

describe("match end", () => {
  it("finishes once on the deciding kill, then stops stepping", () => {
    const sim = duel({ ...MATCH, scoreToWin: 1 });
    participant(sim, "b").combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    // The cast's 20 ticks, then the Fireball's 10 in flight.
    const results = Array.from({ length: 30 }, () => sim.step(DT));
    expect(results.map((r) => r.phase).indexOf("finished")).toBe(29);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "score" });

    const after = sim.step(DT);
    expect(after).toEqual({
      tick: 30,
      elapsedSeconds: results[29]?.elapsedSeconds,
      phase: "finished",
      log: [],
    });
  });

  it("under the default annihilation, keeps the dead down and ends on the wipe (#846)", () => {
    const sim = new MatchSimulation({
      seed: "annihilation",
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [
        spec("a", 0, vec2(0, 0)),
        spec("b", 1, vec2(200, 0)),
        spec("c", 1, vec2(0, 200)),
      ],
    });
    participant(sim, "b").combatant.health = 1;
    participant(sim, "c").combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    // Past kill-count's 8 s respawn, and past Fireball's recharge.
    stepFor(sim, 10);
    expect(participant(sim, "b").combatant.dead).toBe(true);
    expect(sim.phase).toBe("active");

    sim.setTarget("a", "c");
    sim.requestSkill("a", 0);
    stepFor(sim, 2);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
    expect(participant(sim, "b").combatant.dead).toBe(true);
  });

  it("counts a team whose members all left as wiped (#846)", () => {
    const sim = duel(ANNIHILATION_MATCH_RULES);
    sim.step(DT);
    sim.remove("b");
    sim.step(DT);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });

  it("never ends, and nobody respawns, without match rules", () => {
    const sim = duel();
    participant(sim, "b").combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 700);
    expect(sim.phase).toBe("active");
    expect(participant(sim, "b").combatant.dead).toBe(true);
  });
});

describe("reset policies", () => {
  /** A dummy on `reset` at 400/500, 200 units from a, who can burn it. */
  function dummy(reset: ParticipantSpec["reset"], matchRules?: MatchRules) {
    const sim = new MatchSimulation({
      seed: "reset",
      matchRules,
      participants: [
        spec("a", 0, vec2(0, 0)),
        spec("d", 1, vec2(200, 0), { maxHealth: 500, startHealthFraction: 0.8, reset }),
      ],
    });
    return { sim, d: participant(sim, "d") };
  }

  /** Dirty everything a reset must put back, and move the dummy off spawn. */
  function dirty(d: ReturnType<typeof participant>): void {
    d.combatant.statuses.apply("burning", 60, "a", NO_RANKS);
    d.combatant.statuses.apply("armor-boost", 60, "d", NO_RANKS);
    d.combatant.energy = 0;
    chargeAdrenaline(d.combatant);
    d.position = vec2(250, 50);
  }

  function expectReset(d: ReturnType<typeof participant>): void {
    expect(d.combatant.dead).toBe(false);
    expect(d.combatant.health).toBe(400);
    expect(d.combatant.energy).toBe(d.combatant.maxEnergy);
    expect(strikesOf(d.combatant, BACKBREAKER)).toBe(0);
    expect(d.combatant.statuses.active).toEqual([]);
    expect(d.combatant.cast.isCasting).toBe(false);
    expect(d.position).toEqual(vec2(200, 0));
  }

  it("starts at startHealthFraction", () => {
    expect(dummy(undefined).d.combatant.health).toBe(400);
  });

  it("never: the dead stay dead without match rules, and the damaged stay damaged", () => {
    const { sim, d } = dummy({ kind: "never" });
    d.combatant.health = 10;
    // Short of natural regeneration's 5 s, which would heal it (#460).
    stepFor(sim, 4.5);
    expect(d.combatant.health).toBe(10);
    d.combatant.health = 1;
    dirty(d);
    stepFor(sim, 30);
    expect(d.combatant.dead).toBe(true);
  });

  it("on-death: back afterSeconds after dying, even with no match rules", () => {
    const { sim, d } = dummy({ kind: "on-death", afterSeconds: 2 });
    dirty(d);
    d.combatant.health = 1.5;
    // Burning, 0.7 a tick, kills it in its third tick, at 0.15 s.
    stepFor(sim, 1);
    expect(d.combatant.dead).toBe(true);
    stepFor(sim, 1.1);
    expect(d.combatant.dead).toBe(true);
    stepFor(sim, 0.1);
    expectReset(d);
  });

  it("on-death overrides the match rules' respawn time", () => {
    const { sim, d } = dummy({ kind: "on-death", afterSeconds: 2 }, MATCH);
    d.combatant.health = 1;
    stepFor(sim, 3.2);
    expect(d.combatant.dead).toBe(false);
  });

  it("on-interval: every everySeconds, alive or not", () => {
    const { sim, d } = dummy({ kind: "on-interval", everySeconds: 5 });
    stepFor(sim, 1);
    dirty(d);
    d.combatant.health = 100;
    stepFor(sim, 3.9);
    expect(d.combatant.health).toBeLessThan(100);
    stepFor(sim, 0.2);
    expectReset(d);
  });

  it("below-health: the tick it drops under the fraction, and from death too", () => {
    const { sim, d } = dummy({ kind: "below-health", fraction: 0.5 });
    d.combatant.health = 260;
    sim.setTarget("a", "d");
    sim.requestSkill("a", 0);
    stepFor(sim, 1.05 + FIREBALL_FLIGHT);
    expectReset(d);

    d.combatant.health = 0;
    d.combatant.dead = true;
    stepFor(sim, DT);
    expectReset(d);
  });

  it("refuses a policy that would reset every tick", () => {
    // d starts at 0.8 of its health.
    expect(() => dummy({ kind: "below-health", fraction: 0.8 })).toThrow(/every tick/);
    expect(() => dummy({ kind: "on-interval", everySeconds: 0 })).toThrow(/above 0/);
    expect(() => dummy({ kind: "below-health", fraction: 0.79 })).not.toThrow();
  });

  it("resetParticipant is the same reset", () => {
    const { sim, d } = dummy(undefined);
    dirty(d);
    d.combatant.health = 3;
    sim.resetParticipant("d");
    expectReset(d);
  });
});

describe("rearm", () => {
  const loadout = (maxHealth: number): ResolvedLoadout => ({
    attributeRanks: new Map([["elementalist.fire-magic", 9]]),
    weaponSets: [
      { equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel), maxEnergy: 30 },
      null,
      null,
      null,
    ],
    maxHealth,
    baseEnergyPips: 4,
  });

  it("keeps the health fraction, not the health: more max health is no free heal", () => {
    const sim = duel();
    const a = participant(sim, "a");
    a.combatant.health = a.combatant.maxHealth / 2;
    a.position = vec2(40, 0);

    sim.rearm("a", loadout(600), []);

    const after = participant(sim, "a");
    expect(after.combatant.maxHealth).toBe(600);
    expect(after.combatant.health).toBe(300);
    expect(after.combatant.attributeRanks.get("elementalist.fire-magic")).toBe(9);
    expect(after.skillBar).toEqual([]);
    expect(after.position).toEqual(vec2(40, 0));
  });

  it("leaves a corpse dead", () => {
    const sim = duel();
    const a = participant(sim, "a");
    a.combatant.health = 0;
    a.combatant.dead = true;

    sim.rearm("a", loadout(600), [FIREBALL]);

    expect(participant(sim, "a").combatant.dead).toBe(true);
    expect(participant(sim, "a").combatant.health).toBe(0);
  });
});

describe("a dummy's status on a rune wearer (#464)", () => {
  it("is shortened by the wearer's condition-duration rune, as a skill's is", () => {
    const sim = new MatchSimulation({
      seed: "rune",
      participants: [
        spec("a", 0, vec2(0, 0), {
          equipment: {
            ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
            statusDurationScale: new Map([["bleeding", 0.8]]),
          },
        }),
        spec("b", 1, vec2(200, 0), {
          behaviour: {
            kind: "apply-status-cadence",
            statusId: "bleeding",
            durationSeconds: 10,
            everySeconds: 60,
            targeting: { kind: "nearest-enemy" },
          },
        }),
      ],
    });

    sim.step(DT);

    // Intents act after this tick has counted statuses down.
    expect(participant(sim, "a").combatant.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(
      8,
      9,
    );
  });
});

describe("a dummy's deep wound (#764, #800)", () => {
  it("logs the health it takes as health lost, from the dummy, not as damage", () => {
    const sim = new MatchSimulation({
      seed: "deep-wound",
      participants: [
        spec("a", 0, vec2(0, 0)),
        spec("b", 1, vec2(200, 0), {
          behaviour: {
            kind: "apply-status-cadence",
            statusId: "deep-wound",
            durationSeconds: 10,
            everySeconds: 60,
            targeting: { kind: "nearest-enemy" },
          },
        }),
      ],
    });
    const before = participant(sim, "a").combatant.health;

    const log = sim.step(DT).log;

    const lost = log.filter((entry) => entry.events.some((event) => event.kind === "health-lost"));
    expect(lost).toHaveLength(1);
    expect(lost[0]?.sourceId).toBe("b");
    expect(lost[0]?.events).toEqual([
      { kind: "health-lost", targetId: "a", amount: 100, statusId: "deep-wound" },
    ]);
    expect(log.some((entry) => entry.events.some((event) => event.kind === "damage"))).toBe(false);
    expect(participant(sim, "a").combatant.health).toBe(before - 100);
  });
});

describe("determinism", () => {
  it("two sims with the same seed and the same inputs write the same log", () => {
    const run = (): { log: CombatLogEntry[]; positions: Vec2[] } => {
      const sim = new MatchSimulation({
        seed: "repeat",
        matchRules: MATCH,
        participants: [
          spec("a", 0, vec2(0, 0), { skillBar: [FIREBALL, "monk.orison-of-healing"] }),
          spec("b", 1, vec2(300, 0), {
            behaviour: {
              kind: "parallel",
              behaviours: [
                { kind: "keep-away", targeting: { kind: "nearest-enemy" }, distanceUnits: 250 },
                {
                  kind: "cast-loop",
                  skillIds: [FIREBALL],
                  targeting: { kind: "nearest-enemy" },
                  gapSeconds: 0.5,
                  firstLegal: true,
                },
                {
                  kind: "apply-status-cadence",
                  statusId: "burning",
                  durationSeconds: 3,
                  everySeconds: 7,
                  targeting: { kind: "nearest-enemy" },
                },
              ],
            },
            reset: { kind: "below-health", fraction: 0.5 },
          }),
          spec("c", 1, vec2(300, 200), {
            behaviour: { kind: "patrol", waypoints: [vec2(0, 200), vec2(300, 200)], loop: true },
          }),
        ],
      });
      const log: CombatLogEntry[] = [];
      for (let tick = 0; tick < 1200; tick += 1) {
        // A scripted player: walks in, targets, alternates its two skills.
        if (tick === 0) {
          sim.setInputDirection("a", vec2(1, 0));
          sim.setTarget("a", "b");
        }
        if (tick === 30) {
          sim.setInputDirection("a", vec2(0, 0));
        }
        if (tick % 40 === 0) {
          sim.requestSkill("a", (tick / 40) % 2);
        }
        log.push(...sim.step(DT).log);
      }
      return { log, positions: [...sim.participants()].map((p) => p.position) };
    };
    const first = run();
    expect(first.log.length).toBeGreaterThan(10);
    expect(run()).toEqual(first);
  });
});

describe("moving cancels a cast (#279)", () => {
  it("a new move mid-cast cancels it: still paid for, no effect, no recharge, logged", () => {
    const sim = duel();
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 0.5);

    sim.setInputDirection("a", vec2(0, 1));
    expect(a.combatant.cast.isCasting).toBe(false);
    const log = stepFor(sim, 2);

    expect(log).toEqual([
      {
        tick: 10,
        atSeconds: expect.closeTo(0.5, 6) as number,
        cause: "skill",
        sourceId: "a",
        skillId: FIREBALL,
        weaponId: undefined,
        area: undefined,
        doubleStrike: false,
        events: [{ kind: "cancelled", targetId: "a", skillId: FIREBALL }],
      },
    ]);
    expect(participant(sim, "b").combatant.health).toBe(participant(sim, "b").combatant.maxHealth);
    expect(a.combatant.cast.rechargeRemaining.has(FIREBALL)).toBe(false);
    // Fireball's 10 energy stays spent; 2.5 s of regeneration since.
    expect(a.combatant.energy).toBeCloseTo(a.combatant.maxEnergy - 10 + CASTER_REGEN * 2.5, 6);
    // Not recharging, so it can be cast again at once.
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
  });

  it("a direction held as the cast begins stops the body, and the cast resolves", () => {
    const sim = duel();
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.setInputDirection("a", vec2(0, 1));
    stepFor(sim, 0.25);
    const before = a.position;

    sim.requestSkill("a", 0);
    // Up to the tick before it lands: resolving starts an attack on b,
    // whose approach walks.
    const log = stepFor(sim, 1 - DT);
    expect(a.position).toEqual(before);
    log.push(...stepFor(sim, DT + FIREBALL_FLIGHT));

    // Its release, then the Fireball landing.
    expect(log.map((entry) => entry.events.map((event) => event.kind))).toEqual([
      ["skill-used"],
      ["damage"],
    ]);
    expect(a.combatant.cast.rechargeRemaining.has(FIREBALL)).toBe(true);
  });

  it("an attack skill winds up like a cast: it stops a held walk, and a move cancels it (ADR-0029)", () => {
    const archer = () =>
      new MatchSimulation({
        seed: "instant",
        participants: [
          spec("a", 0, vec2(0, 0), {
            skillBar: [BARRAGE],
            equipment: {
              ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
              mainHand: {
                weapon: WEAPONS.longbow,
                attributeId: "ranger.marksmanship",
                damageType: WEAPONS.longbow.damageType,
                requirementMet: true,
                creatureDamageScale: undefined,
              },
            },
          }),
          spec("b", 1, vec2(200, 0)),
        ],
      });

    const held = archer();
    held.setTarget("a", "b");
    held.setInputDirection("a", vec2(0, 1));
    expect(held.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const log = stepFor(held, WEAPONS.longbow.attackIntervalSeconds);
    // Its release, then its arrow landing (#416): Barrage alone either way.
    expect([...new Set(log.map((entry) => entry.skillId))]).toEqual([BARRAGE]);
    expect(participant(held, "a").position).toEqual(vec2(0, 0));

    const moved = archer();
    moved.setTarget("a", "b");
    moved.requestSkill("a", 0);
    moved.setInputDirection("a", vec2(0, 1));
    const movedLog = stepFor(moved, WEAPONS.longbow.attackIntervalSeconds);
    expect(movedLog.flatMap((entry) => entry.events.map((event) => event.kind))).not.toContain(
      "damage",
    );
  });

  it("a stop mid-cast cancels nothing", () => {
    const sim = duel();
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 0.5);

    sim.setInputDirection("a", vec2(0, 0));
    const log = stepFor(sim, 0.5 + FIREBALL_FLIGHT);

    expect(log.map((entry) => entry.events.map((event) => event.kind))).toEqual([
      ["skill-used"],
      ["damage"],
    ]);
  });

  it("being pushed out of another body mid-cast cancels nothing", () => {
    // An ally spawned on top of a: collision pushes the two apart.
    const sim = new MatchSimulation({
      seed: "push",
      participants: [
        spec("a", 0, vec2(0, 0)),
        spec("ally", 0, vec2(5, 0)),
        spec("b", 1, vec2(200, 0)),
      ],
    });
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    const log = stepFor(sim, 1);
    // Pushed off, a throws from further than the duel's 200 units.
    const b = participant(sim, "b");
    log.push(...stepFor(sim, fireballFlight(distance(a.position, b.position))));

    expect(a.position).not.toEqual(vec2(0, 0));
    expect(log.map((entry) => entry.events.map((event) => event.kind))).toEqual([
      ["skill-used"],
      ["damage"],
    ]);
  });
});

describe("Cancel Action cancels the cast and the attack (#300)", () => {
  it("mid-cast it cancels as moving does: paid for, no effect, no recharge, logged", () => {
    const sim = duel();
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 0.5);

    sim.cancelAction("a");
    expect(a.combatant.cast.isCasting).toBe(false);
    const log = stepFor(sim, 2);

    expect(log).toEqual([
      {
        tick: 10,
        atSeconds: expect.closeTo(0.5, 6) as number,
        cause: "skill",
        sourceId: "a",
        skillId: FIREBALL,
        weaponId: undefined,
        area: undefined,
        doubleStrike: false,
        events: [{ kind: "cancelled", targetId: "a", skillId: FIREBALL }],
      },
    ]);
    expect(participant(sim, "b").combatant.health).toBe(participant(sim, "b").combatant.maxHealth);
    expect(a.combatant.cast.rechargeRemaining.has(FIREBALL)).toBe(false);
    expect(a.combatant.energy).toBeCloseTo(a.combatant.maxEnergy - 10 + CASTER_REGEN * 2.5, 6);
  });

  it("one press clears a cast and an attack together", () => {
    const sim = duel();
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    expect(sim.requestAttack("a", "b")).toEqual({ ok: true });
    sim.requestSkill("a", 0);
    stepFor(sim, 0.25);
    expect(a.combatant.cast.isCasting).toBe(true);
    expect(a.combatant.attack).toBeDefined();

    sim.cancelAction("a");

    expect(a.combatant.cast.isCasting).toBe(false);
    expect(a.combatant.attack).toBeUndefined();
  });

  it("with nothing running it does nothing and logs nothing", () => {
    const sim = duel();
    const a = participant(sim, "a");
    stepFor(sim, 0.25);
    const energy = a.combatant.energy;

    sim.cancelAction("a");

    expect(stepFor(sim, DT)).toEqual([]);
    expect(a.combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(a.combatant.attack).toBeUndefined();
  });
});

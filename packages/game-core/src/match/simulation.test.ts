import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment } from "../geometry.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const MATCH: MatchRules = { scoreToWin: 2, timeLimitSeconds: 600, respawnSeconds: 8 };

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [FIREBALL],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
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

function participant(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

describe("MatchSimulation step", () => {
  it("regenerates energy at the ruleset's rate", () => {
    const sim = duel();
    const a = participant(sim, "a");
    a.combatant.energy = 0;
    stepFor(sim, 1);
    expect(a.combatant.energy).toBeCloseTo(RULES.resources.energyRegenPerSecond, 6);
  });

  it("casts through requestSkill, resolves after the activation time, and logs it", () => {
    const sim = duel();
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)).toEqual({ skillId: FIREBALL, check: { ok: true } });

    const log = stepFor(sim, 1);
    expect(log).toEqual([
      {
        tick: 20,
        atSeconds: expect.closeTo(1, 6) as number,
        cause: "skill",
        sourceId: "a",
        skillId: FIREBALL,
        // Fireball's splash, centred on b, who stands alone in it.
        area: { x: 200, y: 0, radius: 81 },
        events: [{ kind: "damage", targetId: "b", amount: 91 }],
      },
    ]);
    // Adrenaline only for damage to someone else.
    expect(participant(sim, "a").combatant.adrenaline).toBe(RULES.resources.adrenalinePerHit);
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
    b.combatant.statuses.apply("weakness", 60, "a");
    b.combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    stepFor(sim, 1);
    expect(b.combatant.dead).toBe(true);
    b.position = vec2(300, 300);
    expect(b.respawnInSeconds).toBeGreaterThan(MATCH.respawnSeconds - 0.1);

    stepFor(sim, MATCH.respawnSeconds - 0.5);
    expect(b.combatant.dead).toBe(true);
    stepFor(sim, 0.5);
    expect(b.combatant.dead).toBe(false);
    expect(b.combatant.health).toBe(b.combatant.maxHealth);
    expect(b.combatant.energy).toBe(b.combatant.maxEnergy);
    expect(b.combatant.adrenaline).toBe(0);
    expect(b.combatant.statuses.active).toEqual([]);
    expect(b.position).toEqual(vec2(200, 0));
  });

  it("a degeneration death cancels the cast, credits the other team and schedules a respawn", () => {
    const sim = duel(MATCH);
    const a = participant(sim, "a");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    a.combatant.statuses.apply("burning", 10, "b");
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
        events: [
          { kind: "damage", targetId: "a", amount: expect.closeTo(0.2, 9) as number },
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
    participant(sim, "slow").combatant.statuses.apply("crippled", 10, "foe");
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
    participant(sim, "a").combatant.statuses.apply("dazed", 10, "b");
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    expect(participant(sim, "a").combatant.cast.activeCast?.totalSeconds).toBe(2);
    expect(stepFor(sim, 1.5)).toEqual([]);
    expect(stepFor(sim, 0.5).map((entry) => entry.skillId)).toEqual([FIREBALL]);
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
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: false, reason: "no-line-of-sight" });

    sim.setInputDirection("a", vec2(1, 0));
    stepFor(sim, 2);
    expect(participant(sim, "a").position.x).toBeLessThanOrEqual(
      100 - RULES.collision.playerRadius + 1e-6,
    );
  });
});

describe("match end", () => {
  it("finishes once on the deciding kill, then stops stepping", () => {
    const sim = duel({ ...MATCH, scoreToWin: 1 });
    participant(sim, "b").combatant.health = 1;
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    const results = Array.from({ length: 20 }, () => sim.step(DT));
    expect(results.map((r) => r.phase).indexOf("finished")).toBe(19);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "score" });

    const after = sim.step(DT);
    expect(after).toEqual({
      tick: 20,
      elapsedSeconds: results[19]?.elapsedSeconds,
      phase: "finished",
      log: [],
    });
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
    d.combatant.statuses.apply("burning", 60, "a");
    d.combatant.statuses.apply("armor-boost", 60, "d");
    d.combatant.energy = 0;
    d.combatant.adrenaline = 3;
    d.position = vec2(250, 50);
  }

  function expectReset(d: ReturnType<typeof participant>): void {
    expect(d.combatant.dead).toBe(false);
    expect(d.combatant.health).toBe(400);
    expect(d.combatant.energy).toBe(d.combatant.maxEnergy);
    expect(d.combatant.adrenaline).toBe(0);
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
    stepFor(sim, 30);
    expect(d.combatant.health).toBe(10);
    d.combatant.health = 1;
    dirty(d);
    stepFor(sim, 30);
    expect(d.combatant.dead).toBe(true);
  });

  it("on-death: back afterSeconds after dying, even with no match rules", () => {
    const { sim, d } = dummy({ kind: "on-death", afterSeconds: 2 });
    dirty(d);
    d.combatant.health = 1;
    // Burning kills it in its third tick, at 0.15 s.
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
    stepFor(sim, 1.05);
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
  const loadout = (maxHealth: number) => ({
    attributeRanks: new Map([["elementalist.fire-magic", 9]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth,
    maxEnergy: 30,
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

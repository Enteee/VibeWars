import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Triggers on a change to the bearer's statuses (#887): Contagion answers
 * a condition gained, Parasitic Bond its own ending.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CONTAGION = "necromancer.contagion";
const PARASITIC_BOND = "necromancer.parasitic-bond";
const ENFEEBLE = "necromancer.enfeeble";

/** A rank-12 Necromancer with Contagion, Parasitic Bond and Enfeeble, 500 health. */
function necro(id: string, team: number, spawn: Vec2, startHealthFraction = 1): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [CONTAGION, PARASITIC_BOND, ENFEEBLE],
    attributeRanks: new Map([
      ["necromancer.death-magic", 12],
      ["necromancer.curses", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 1000,
    startHealthFraction,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string): Participant {
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

/** `casterId` uses its skill in `slot` on `targetId`, and the cast finishes. */
function cast(match: MatchSimulation, casterId: string, slot: number, targetId: string): void {
  match.setTarget(casterId, targetId);
  expect(match.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
}

function firedBy(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
  return log.filter((entry) => entry.skillId === skillId && entry.cause === "skill");
}

describe("Contagion (#887)", () => {
  /**
   * Contagion necro `n` at the origin; foe `e` 100 away, who casts
   * Enfeeble; foe `far` 200 away; ally `ally` 50 away.
   */
  function contagious(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "contagion",
      participants: [
        necro("n", 0, vec2(0, 0)),
        necro("e", 1, vec2(100, 0)),
        necro("far", 1, vec2(0, 200)),
        necro("ally", 0, vec2(0, -50)),
      ],
    });
    cast(match, "n", 0, "n");
    stepFor(match, 1.5);
    expect(get(match, "n").combatant.statuses.get("contagion")?.sourceId).toBe("n");
    return match;
  }

  it("hands a new condition to the foes in the area, and costs 6% of maximum health", () => {
    const match = contagious();
    cast(match, "e", 2, "n");
    const log = stepFor(match, 1);

    expect(get(match, "n").combatant.statuses.has("weakness")).toBe(true);
    expect(get(match, "e").combatant.statuses.get("weakness")?.sourceId).toBe("n");
    expect(get(match, "far").combatant.statuses.has("weakness")).toBe(false);
    expect(get(match, "ally").combatant.statuses.has("weakness")).toBe(false);
    const fired = firedBy(log, CONTAGION);
    expect(fired.map((entry) => entry.sourceId)).toEqual(["n"]);
    expect(fired[0]?.events).toEqual([
      { kind: "status-applied", targetId: "e", statusId: "weakness", durationSeconds: 26 },
      { kind: "sacrifice", targetId: "n", amount: 30 },
    ]);
    expect(describeStatus("contagion")).toBe(
      "whenever it gains a new condition: foes in the area suffer it too. " +
        "Whenever it gains a new condition: you sacrifice 6% of your maximum health",
    );
  });

  it("sacrifices with no foe in the area, and does nothing for a condition already on", () => {
    const match = contagious();
    const n = get(match, "n");
    n.position = vec2(-1000, 0);
    n.combatant.statuses.apply("bleeding", 10, "e", NO_RANKS);
    const first = firedBy(stepFor(match, DT), CONTAGION);
    n.combatant.statuses.apply("bleeding", 20, "e", NO_RANKS);
    const again = firedBy(stepFor(match, DT), CONTAGION);

    expect(first.flatMap((entry) => entry.events)).toEqual([
      { kind: "sacrifice", targetId: "n", amount: 30 },
    ]);
    expect(again).toEqual([]);
  });

  it("fires once for each condition gained in one tick, in the order gained", () => {
    const match = contagious();
    const n = get(match, "n").combatant;
    n.statuses.apply("bleeding", 10, "e", NO_RANKS);
    n.statuses.apply("crippled", 10, "e", NO_RANKS);
    const fired = firedBy(stepFor(match, DT), CONTAGION);

    expect(
      fired.map((entry) =>
        entry.events.flatMap((event) => (event.kind === "status-applied" ? [event.statusId] : [])),
      ),
    ).toEqual([["bleeding"], ["crippled"]]);
    expect(get(match, "e").combatant.statuses.has("crippled")).toBe(true);
  });

  it("never echoes between two Contagions", () => {
    const match = contagious();
    get(match, "e").combatant.statuses.apply("contagion", 60, "e", NO_RANKS);
    get(match, "n").combatant.statuses.apply("poison", 10, "e", NO_RANKS);
    const fired = firedBy(stepFor(match, 1), CONTAGION);

    expect(fired.map((entry) => entry.sourceId)).toEqual(["n"]);
    expect(get(match, "e").combatant.statuses.has("poison")).toBe(true);
    expect(get(match, "n").combatant.health).toBeLessThan(500);
    expect(
      fired.flatMap((entry) => entry.events).filter((event) => event.kind === "sacrifice"),
    ).toEqual([{ kind: "sacrifice", targetId: "n", amount: 30 }]);
  });

  it("fires nothing when Contagion itself ends", () => {
    const match = contagious();
    get(match, "n").combatant.statuses.remove("contagion");
    expect(firedBy(stepFor(match, DT), CONTAGION)).toEqual([]);
  });

  it("kills its bearer when the sacrifice takes the last of its health", () => {
    const match = contagious();
    const n = get(match, "n").combatant;
    n.health = 20;
    n.statuses.apply("bleeding", 10, "e", NO_RANKS);
    const log = stepFor(match, DT);

    expect(n.dead).toBe(true);
    expect(log.flatMap((entry) => entry.events)).toContainEqual({
      kind: "death",
      targetId: "n",
    });
  });
});

describe("Parasitic Bond (#887)", () => {
  /** Necro `n` at a fifth of its health bonds foe `e`, 100 away. */
  function bonded(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "parasitic-bond",
      participants: [necro("n", 0, vec2(0, 0), 0.2), necro("e", 1, vec2(100, 0))],
    });
    cast(match, "n", 1, "e");
    stepFor(match, 1.5);
    expect(get(match, "e").combatant.statuses.get("parasitic-bond")?.sourceId).toBe("n");
    return match;
  }

  /** The heals Parasitic Bond logged: its cast logs a row of its own, with none. */
  const heals = (log: readonly CombatLogEntry[]) =>
    firedBy(log, PARASITIC_BOND)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "heal");

  it("degenerates its bearer by 1 and heals its caster 102 when it runs out", () => {
    const match = bonded();
    expect(match.pips(get(match, "e")).health).toBe(-1);
    expect(heals(stepFor(match, 17))).toEqual([]);
    const log = stepFor(match, 3);

    expect(get(match, "e").combatant.statuses.has("parasitic-bond")).toBe(false);
    expect(heals(log)).toEqual([{ kind: "heal", targetId: "n", amount: 102 }]);
    expect(firedBy(log, PARASITIC_BOND)[0]?.sourceId).toBe("n");
    expect(describeStatus("parasitic-bond")).toBe(
      "−1 Health degeneration, heals its caster for 102 when it ends",
    );
  });

  it("heals at once when it is removed", () => {
    const match = bonded();
    get(match, "e").combatant.statuses.removeByCategory("hex");
    expect(heals(stepFor(match, DT))).toEqual([{ kind: "heal", targetId: "n", amount: 102 }]);
  });

  it("heals nothing when it is refreshed, only when the refreshed one ends", () => {
    const match = bonded();
    stepFor(match, 2.5);
    cast(match, "n", 1, "e");
    expect(heals(stepFor(match, 1.5))).toEqual([]);
    expect(heals(stepFor(match, 25))).toHaveLength(1);
  });

  it("heals nothing when its caster is dead or gone at the end", () => {
    const dead = bonded();
    const n = get(dead, "n");
    n.combatant.health = 0;
    n.combatant.dead = true;
    n.respawnInSeconds = 1000;
    expect(heals(stepFor(dead, 20))).toEqual([]);

    const gone = bonded();
    gone.remove("n");
    expect(heals(stepFor(gone, 20))).toEqual([]);
  });

  it("heals its caster 102 the tick its bearer is killed, which keeps no statuses (#940)", () => {
    const match = bonded();
    const e = get(match, "e");
    expect(match.requestAttack("n", "e")?.ok).toBe(true);
    let log: readonly CombatLogEntry[] = [];
    for (let tick = 0; tick < 10 / DT && !e.combatant.dead; tick += 1) {
      // At 1 health, which the bond's degeneration cannot take in a tick: the
      // swing is what kills.
      e.combatant.health = 1;
      log = match.step(DT).log;
    }

    expect(e.combatant.dead).toBe(true);
    expect(log.some((entry) => entry.cause === "weapon")).toBe(true);
    expect(heals(log)).toEqual([{ kind: "heal", targetId: "n", amount: 102 }]);
    expect(e.combatant.statuses.active).toEqual([]);
  });

  it("heals nothing when its bearer is killed after its caster (#940)", () => {
    const match = bonded();
    const n = get(match, "n");
    n.combatant.health = 0;
    n.combatant.dead = true;
    n.respawnInSeconds = 1000;
    const e = get(match, "e");
    e.combatant.health = 0.01;
    const log = stepFor(match, DT);

    expect(e.combatant.dead).toBe(true);
    expect(heals(log)).toEqual([]);
    expect(e.combatant.statuses.active).toEqual([]);
  });

  it("heals nothing on a reset", () => {
    const match = bonded();
    match.resetParticipant("e");
    expect(heals(stepFor(match, 20))).toEqual([]);
  });
});

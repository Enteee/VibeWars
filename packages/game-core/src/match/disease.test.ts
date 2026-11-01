import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ROTTING_FLESH = "necromancer.rotting-flesh";

/** A sturdy body that does nothing; a Necromancer when it has a skill bar. */
function body(id: string, team: number, spawn: Vec2, skillBar: string[] = []): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([["necromancer.death-magic", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 50,
    spawn,
    facing: 0,
  };
}

/**
 * A diseased Warrior `w` with an ally `a` and a foe `f` adjacent to it,
 * `b` adjacent to `a` alone, and `x` out of everyone's reach. Bodies are
 * 14 in radius, so 30 apart is touching but not pushing.
 */
function melee(): MatchSimulation {
  return new MatchSimulation({
    seed: "disease",
    participants: [
      body("w", 1, vec2(300, 0)),
      body("a", 1, vec2(330, 0)),
      body("f", 0, vec2(270, 0)),
      body("b", 1, vec2(360, 0)),
      body("x", 0, vec2(300, 100)),
      body("necro", 0, vec2(0, 0), [ROTTING_FLESH]),
    ],
    matchRules: {
      victory: "kill-count",
      scoreToWin: 10,
      timeLimitSeconds: 600,
      deathRule: "respawn",
      respawnSeconds: 100,
      deathPenalty: false,
    },
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

const diseased = (match: MatchSimulation): string[] =>
  ["w", "a", "f", "b", "x", "necro"].filter((id) => get(match, id).statuses.has("disease"));

const spreads = (log: readonly CombatLogEntry[]): CombatEvent[] =>
  log.flatMap((entry) => entry.events.filter((event) => event.kind === "status-spread"));

/** Dies this step, of burning: a corpse kept on the ground by a long respawn. */
function dying(match: MatchSimulation, id: string): void {
  const combatant = get(match, id);
  combatant.statuses.apply("burning", 10, "f", NO_RANKS);
  combatant.health = 0.01;
}

describe("Disease spreads (#765)", () => {
  it("a diseased Warrior infects an adjacent ally and foe in one step, not one out of reach", () => {
    const match = melee();
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    const log = stepFor(match, DT);
    expect(diseased(match)).toEqual(["w", "a", "f"]);
    expect(spreads(log)).toEqual([
      { kind: "status-spread", targetId: "a", fromId: "w", statusId: "disease" },
      { kind: "status-spread", targetId: "f", fromId: "w", statusId: "disease" },
    ]);
    expect(log.filter((entry) => spreads([entry]).length > 0)).toMatchObject([
      { cause: "degeneration", sourceId: "necro" },
      { cause: "degeneration", sourceId: "necro" },
    ]);
  });

  it("a caught copy lasts as long as its source has left, and keeps the caster as its source", () => {
    const match = melee();
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    const source = get(match, "w").statuses.get("disease");
    expect(source?.remainingSeconds).toBeCloseTo(10 - DT, 9);
    expect(get(match, "a").statuses.get("disease")).toMatchObject({
      remainingSeconds: source?.remainingSeconds,
      sourceId: "necro",
      outbreak: source?.outbreak,
    });
  });

  it("one caught this step spreads from the next", () => {
    const match = melee();
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    expect(get(match, "b").statuses.has("disease")).toBe(false);
    const log = stepFor(match, DT);
    expect(spreads(log)).toEqual([
      { kind: "status-spread", targetId: "b", fromId: "a", statusId: "disease" },
    ]);
  });

  it("a cured combatant next to a carrier of the same outbreak is not caught again; a new cast is", () => {
    const match = melee();
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    get(match, "a").statuses.removeByCategory("condition");
    get(match, "w").statuses.remove("disease");
    stepFor(match, 1);
    expect(get(match, "a").statuses.has("disease")).toBe(false);
    expect(get(match, "w").statuses.has("disease")).toBe(false);
    // `f` still carries it, beside `w`, who is in the same outbreak.
    expect(diseased(match)).toEqual(["f"]);

    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    expect(get(match, "a").statuses.has("disease")).toBe(true);
  });

  it("a new cast on a carrier is a new outbreak, even when it lasts no longer", () => {
    const match = melee();
    const w = get(match, "w");
    w.statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    get(match, "a").statuses.remove("disease");
    w.statuses.apply("disease", 2, "necro", NO_RANKS);
    stepFor(match, DT);
    expect(get(match, "a").statuses.has("disease")).toBe(true);
    expect(w.statuses.get("disease")?.remainingSeconds).toBeCloseTo(10 - 2 * DT, 9);
  });

  it("two outbreaks meeting: one Disease, the longer duration, the outbreak it had", () => {
    const match = melee();
    get(match, "w").statuses.apply("disease", 5, "necro", NO_RANKS);
    get(match, "b").statuses.apply("disease", 20, "necro", NO_RANKS);
    stepFor(match, DT);
    const a = get(match, "a").statuses.get("disease");
    // Caught from `w` first, in the participants' order; `b`'s is longer.
    expect(a?.outbreak).toBe(get(match, "w").statuses.get("disease")?.outbreak);
    expect(a?.remainingSeconds).toBeCloseTo(20 - DT, 9);
    // In both outbreaks: cured, it catches neither again.
    get(match, "a").statuses.remove("disease");
    stepFor(match, 1);
    expect(get(match, "a").statuses.has("disease")).toBe(false);
  });

  it("a corpse neither catches it nor carries it", () => {
    const match = melee();
    dying(match, "a");
    stepFor(match, DT);
    expect(get(match, "a").dead).toBe(true);
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    stepFor(match, DT);
    expect(get(match, "a").statuses.has("disease")).toBe(false);

    const second = melee();
    get(second, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    dying(second, "w");
    stepFor(second, 1);
    expect(get(second, "w").dead).toBe(true);
    // The death ends w's own disease (#940), so there is nothing left to spread.
    expect(diseased(second)).toEqual([]);
  });

  it("an invulnerable body says so once an outbreak, not every step, and catches it after (#1233)", () => {
    const match = melee();
    get(match, "a").invulnerableRemaining = 0.5;
    get(match, "w").statuses.apply("disease", 10, "necro", NO_RANKS);
    const log = stepFor(match, 0.25);
    const refused = log.filter((entry) =>
      entry.events.some((event) => event.kind === "invulnerable"),
    );
    expect(refused).toMatchObject([
      {
        cause: "degeneration",
        sourceId: "necro",
        events: [{ kind: "invulnerable", targetId: "a" }],
      },
    ]);
    expect(get(match, "a").statuses.has("disease")).toBe(false);
    stepFor(match, 0.5);
    expect(get(match, "a").statuses.has("disease")).toBe(true);
  });

  it("is −4 health pips, like poison", () => {
    const match = melee();
    const x = get(match, "x");
    x.statuses.apply("disease", 10, "necro", NO_RANKS);
    const before = x.health;
    stepFor(match, 1);
    expect(before - x.health).toBeCloseTo(8, 6);
    expect(describeStatus("disease")).toBe(
      "−4 Health degeneration, spreads to adjacent combatants",
    );
  });
});

describe("Rotting Flesh (#765)", () => {
  it("diseases a foe for 22 s, and the caster's own side next to it catches it", () => {
    const match = melee();
    match.setTarget("necro", "w");
    expect(match.requestSkill("necro", 0)?.check).toEqual({ ok: true });
    const log = stepFor(match, 3.2);
    const applied = log.flatMap((entry) =>
      entry.events.filter((event) => event.kind === "status-applied"),
    );
    expect(applied).toEqual([
      { kind: "status-applied", targetId: "w", statusId: "disease", durationSeconds: 22 },
    ]);
    // And on through the ball: `b` from `a`.
    expect(diseased(match)).toEqual(["w", "a", "f", "b"]);
  });

  it("is a 15 energy, 3 s Death Magic spell with a 3 s recharge, at spell range", () => {
    expect(getSkill(ROTTING_FLESH)).toMatchObject({
      type: "spell",
      attributeId: "necromancer.death-magic",
      cost: { kind: "energy", amount: 15 },
      activationSeconds: 3,
      rechargeSeconds: 3,
      target: "single-enemy",
    });
  });
});

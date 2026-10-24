import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { tallyCombat, type CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";

/**
 * A headless match runner (brief §15, §28).
 *
 * Runs real combat with no server, no socket and no browser, which makes
 * it the tool for answering balance questions ("how long does this fight
 * actually take?") and for reproducing a bug from a seed.
 *
 * It runs the same `MatchSimulation` the live server does, so a result
 * from this runner is a result about the real game, not about a
 * simplified copy of it.
 */

export interface HeadlessFighter {
  readonly id: string;
  readonly team: number;
  readonly skillBar: readonly string[];
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly position: Vec2;
}

export interface HeadlessMatchOptions {
  readonly fighters: readonly HeadlessFighter[];
  /** Match seed; the same seed always produces the same match. */
  readonly seed: string;
  /** Simulated seconds to run before giving up. */
  readonly maxSeconds?: number;
  readonly tickRateHz?: number;
}

export interface HeadlessMatchResult {
  readonly seconds: number;
  readonly ticks: number;
  /** Fighters still alive when the run ended. */
  readonly survivors: readonly string[];
  readonly events: readonly CombatEvent[];
  /** Total damage dealt per fighter id. */
  readonly damageDealt: ReadonlyMap<string, number>;
}

export function runHeadlessMatch(options: HeadlessMatchOptions): HeadlessMatchResult {
  const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
  const tickRate = options.tickRateHz ?? ruleset.tickRateHz;
  const dt = 1 / tickRate;
  const maxTicks = Math.ceil((options.maxSeconds ?? 120) * tickRate);

  // No walls and no match rules: an open field, fought to elimination.
  // Every fighter casts the first skill it legally can at the nearest
  // living enemy. Deliberately simple-minded: the runner is a measurement
  // tool, not an AI. A cleverer chooser would make results depend on the
  // AI's quality rather than on the numbers under test.
  const sim = new MatchSimulation({
    seed: options.seed,
    ruleset,
    walls: [],
    matchRules: undefined,
    participants: options.fighters.map((fighter) => ({
      id: fighter.id,
      team: fighter.team,
      skillBar: fighter.skillBar,
      attributeRanks: fighter.attributeRanks,
      // Armor at the reference level, so damage lands at its stated amount.
      equipment: unarmedResolvedEquipment(ruleset.combat.armorReferenceLevel),
      spawn: fighter.position,
      behaviour: {
        kind: "cast-loop",
        skillIds: fighter.skillBar,
        targeting: { kind: "nearest-enemy" },
        gapSeconds: 0,
        firstLegal: true,
      },
    })),
  });

  const livingTeams = (): Set<number> => {
    const teams = new Set<number>();
    for (const participant of sim.participants()) {
      if (!participant.combatant.dead) {
        teams.add(participant.combatant.team);
      }
    }
    return teams;
  };

  const log: CombatLogEntry[] = [];
  while (sim.tick < maxTicks && livingTeams().size > 1) {
    log.push(...sim.step(dt).log);
  }

  const survivors = [...sim.participants()]
    .filter((participant) => !participant.combatant.dead)
    .map((participant) => participant.id);

  return {
    seconds: sim.tick * dt,
    ticks: sim.tick,
    survivors,
    events: log.flatMap((entry) => entry.events),
    damageDealt: tallyCombat(log).damageByActor,
  };
}

/** Build a fighter with sensible defaults for quick experiments. */
export function fighter(
  id: string,
  team: number,
  skillBar: readonly string[],
  overrides: Partial<HeadlessFighter> = {},
): HeadlessFighter {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map(),
    position: vec2(team === 0 ? 0 : 100, 0),
    ...overrides,
  };
}

import { resolveLoadout } from "../equipment/resolve.js";
import { loadoutOf } from "../join-loadout.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { STARTER_BUILDS } from "../starter-builds.js";
import { vec2 } from "../vec2.js";

/**
 * The bot bench (#2545): all-bot fights on an open field, and how many
 * players die in them. Fewer deaths than on `main` means bots that stall
 * rather than commit to kills, so every bot change is measured against
 * `main` with it. Deterministic: the same options give the same count.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** The open field the teams fight on, as wide as a small arena. */
const BOUNDS = { width: 1600, height: 800 };

export interface BotBenchOptions {
  /** Players a side. */
  readonly size: number;
  /**
   * One fight per character, each its match seed. A seed's first
   * character also rotates which built-in builds the sides play.
   */
  readonly seeds: string;
  /** Simulated seconds each fight runs. */
  readonly seconds: number;
}

/** Players who died, across every fight; each counted once a fight. */
export function runBotBench({ size, seeds, seconds }: BotBenchOptions): number {
  let deaths = 0;
  for (const seed of seeds) {
    deaths += fight(size, seed, seconds);
  }
  return deaths;
}

function fight(size: number, seed: string, seconds: number): number {
  const participants: ParticipantSpec[] = [];
  for (const team of [0, 1]) {
    for (let i = 0; i < size; i += 1) {
      const build = STARTER_BUILDS[(i + team + seed.charCodeAt(0)) % STARTER_BUILDS.length];
      if (build === undefined) {
        throw new Error("no built-in builds");
      }
      const loadout = loadoutOf(build);
      const resolved = resolveLoadout(
        {
          primaryProfession: loadout.primaryProfession,
          secondaryProfession: loadout.secondaryProfession,
          allocatedRanks: loadout.attributeRanks,
          equipment: loadout.equipment,
        },
        RULESET.combat,
      );
      participants.push({
        id: `${String(team)}-${String(i)}`,
        team,
        skillBar: loadout.skillBar,
        ...loadoutSpec(resolved),
        spawn: vec2(team === 0 ? 200 : 1400, 100 + (600 * i) / Math.max(1, size - 1)),
        facing: 0,
        behaviour: { kind: "play-build", thinkSeconds: 0.25 },
      });
    }
  }
  const sim = new MatchSimulation({ seed, ruleset: RULESET, bounds: BOUNDS, participants });
  const dead = new Set<string>();
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
    for (const participant of sim.participants()) {
      if (participant.creature === undefined && participant.combatant.dead) {
        dead.add(participant.id);
      }
    }
  }
  return dead.size;
}

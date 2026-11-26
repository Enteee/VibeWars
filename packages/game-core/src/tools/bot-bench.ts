import { resolveLoadout } from "../equipment/resolve.js";
import { loadoutOf } from "../join-loadout.js";
import { BOT_REACTION } from "../match/behaviour.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { STARTER_BUILDS } from "../starter-builds.js";
import { vec2 } from "../vec2.js";

/**
 * The bot bench (#2545): all-bot fights on an open field, and how many
 * players die in them. Fewer deaths than on `main` means bots that stall
 * rather than commit to kills, so every bot change is measured against
 * `main` with it. Deterministic: the same options give the same count.
 * Mirror fights (#2624), the same builds on both sides, count each team's
 * wins: on a field that is the same for both, about as many either way.
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
    const [team0, team1] = fight(size, seed, seconds, false);
    deaths += team0 + team1;
  }
  return deaths;
}

/**
 * Of the mirror fights, one a seed, those team 0 won and those team 1 won:
 * the winner lost fewer players. The rest are draws.
 */
export function runMirrorBench({
  size,
  seeds,
  seconds,
}: BotBenchOptions): readonly [number, number] {
  const wins: [number, number] = [0, 0];
  for (const seed of seeds) {
    const [team0, team1] = fight(size, seed, seconds, true);
    if (team0 !== team1) {
      wins[team0 < team1 ? 0 : 1] += 1;
    }
  }
  return wins;
}

/** Each team's players who died; with `mirror`, both sides play the same builds. */
function fight(
  size: number,
  seed: string,
  seconds: number,
  mirror: boolean,
): readonly [number, number] {
  const participants: ParticipantSpec[] = [];
  for (const team of [0, 1]) {
    for (let i = 0; i < size; i += 1) {
      const shift = mirror ? 0 : team;
      const build = STARTER_BUILDS[(i + shift + seed.charCodeAt(0)) % STARTER_BUILDS.length];
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
        // Each side facing the other.
        facing: team === 0 ? 0 : Math.PI,
        behaviour: { kind: "play-build", reaction: BOT_REACTION },
      });
    }
  }
  const sim = new MatchSimulation({ seed, ruleset: RULESET, bounds: BOUNDS, participants });
  const dead = new Set<string>();
  const deaths: [number, number] = [0, 0];
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
    for (const participant of sim.participants()) {
      if (
        participant.creature === undefined &&
        participant.combatant.dead &&
        !dead.has(participant.id)
      ) {
        dead.add(participant.id);
        deaths[participant.combatant.team === 0 ? 0 : 1] += 1;
      }
    }
  }
  return deaths;
}

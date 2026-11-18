import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  ZERO,
  applyIntent,
  type MatchOutcome,
  type MatchRules,
} from "@vibewars/game-core";

import type { HostMap } from "./match-host.js";
import { createMatchSimulation, participantSpec } from "./match-setup.js";
import type { MatchReplay, ReplayInput } from "./replay.js";

const TICK_SECONDS = 1 / RULESET.tickRateHz;

/** What a rerun ends with: enough to tell it from the match it replays. */
export interface Rerun {
  readonly outcome: MatchOutcome;
  readonly ticks: number;
  /** Each participant's health at the end, by id. */
  readonly health: ReadonlyMap<string, number>;
}

/**
 * Runs `replay` again on `map` under `matchRules` (#3572): the host's
 * simulation, built alike, given every input at its tick, stepped to the
 * tick the match finished at. The same build gets the same outcome; any
 * wall clock or `Math.random` in the simulation would not.
 */
export function rerun(replay: MatchReplay, map: HostMap, matchRules: MatchRules): Rerun {
  const sim = createMatchSimulation(map, replay.seed, matchRules);
  const apply = (input: ReplayInput): void => {
    switch (input[1]) {
      case "intent":
        applyIntent(sim, input[2], input[3]);
        return;
      case "add":
        sim.add(participantSpec(map, input[2]));
        return;
      case "remove":
        sim.remove(input[2]);
        return;
      case "drop":
        sim.setInputDirection(input[2], ZERO);
        sim.get(input[2])?.combatant.cast.cancelCast();
        return;
      case "forfeit":
        sim.forfeit(input[2], new Set(input[3]));
        return;
      case "awaited":
        sim.setAwaitedTeams(new Set(input[2]));
        return;
      case "called":
        sim.setCalledTarget(input[2], input[3] ?? undefined);
        return;
    }
  };
  let next = 0;
  const applyDue = (): void => {
    for (let input = replay.inputs[next]; input !== undefined && input[0] <= sim.tick;) {
      next += 1;
      apply(input);
      input = replay.inputs[next];
    }
  };
  while (sim.tick < replay.ticks) {
    applyDue();
    sim.step(TICK_SECONDS);
  }
  applyDue();
  return {
    outcome: sim.outcome,
    ticks: sim.tick,
    health: new Map(
      [...sim.participants()].map((participant) => [participant.id, participant.combatant.health]),
    ),
  };
}

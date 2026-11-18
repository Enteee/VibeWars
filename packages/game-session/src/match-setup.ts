import {
  BOT_REACTION,
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  spawnFacing,
  type MatchRules,
  type ParticipantSpec,
  type PlayerBuild,
} from "@vibewars/game-core";
import type { WireTeam } from "@vibewars/game-protocol";

import type { HostMap } from "./match-host.js";
import { spawnPoint } from "./spawn-points.js";

/**
 * A host's simulation of `map` (#3572): the one place it is built, so a
 * replay's rerun builds the very same one.
 */
export function createMatchSimulation(
  map: HostMap,
  seed: string,
  matchRules: MatchRules,
): MatchSimulation {
  return new MatchSimulation({
    seed,
    ruleset: RULESET,
    matchRules,
    teamCount: map.descriptor.teamCount,
    walls: map.walls,
    gates: map.gates,
    switches: map.switches,
    teleports: map.teleports,
    breakables: map.breakables,
    switchedDecks: map.switchedDecks,
    bounds: map.bounds,
    layers: map.layers,
    zones: map.zones,
    shrines: map.shrines,
    guildLords: map.guildLords,
    flagField: map.flagField,
    relicField: map.relicField,
    ghostField: map.ghostField,
    capturePoints: map.capturePoints,
    startLine: map.startLine,
    guards: map.guards,
  });
}

/** Who a seat is, as a replay keeps it (#3572): enough to seat it again alike. */
export interface SeatSetup {
  readonly id: string;
  readonly team: WireTeam;
  readonly build: PlayerBuild;
  /** Its team's seats before it, which picks its spawn point. */
  readonly teammates: number;
  readonly bot: boolean;
  readonly startMorale: number;
}

/** The participant a seat plays on `map`. */
export function participantSpec(map: HostMap, seat: SeatSetup): ParticipantSpec {
  const loadout = loadoutOf(seat.build);
  // Gear becomes numbers exactly once, before the combatant exists (ADR-0012).
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULESET.combat,
  );
  const spawn = spawnPoint(map.spawns, seat.team, seat.teammates);
  return {
    id: seat.id,
    team: seat.team,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn: spawn.position,
    layer: spawn.layer,
    facing: spawnFacing(
      spawn.position,
      map.spawns.filter((point) => point.team !== seat.team).map((point) => point.position),
      map.spawns.map((point) => point.position),
    ),
    startMorale: seat.startMorale,
    // A human-like moment to react, not the same tick (#2606).
    behaviour: seat.bot ? { kind: "play-build", reaction: BOT_REACTION } : undefined,
  };
}

import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  parsePlayerBuild,
  validatePlayerBuild,
  type MatchEndReason,
  type PlayerBuild,
} from "@vibewars/game-core";
import { LOBBY_MODES, MAX_WIRE_STRING, type LobbyMode } from "@vibewars/game-protocol";

import { sanitizeGuildTag } from "./names.js";

/**
 * What one finished match looked like (#2528), as its host reports it:
 * published on Nostr for anyone to read, and so public. A host can lie
 * about any of it; the event's signature proves only that the record
 * arrived intact. Nothing in it identifies a player beyond the in-game
 * name and guild tag they played under: no peer id, no address, no
 * lobby key or room.
 */

/** Rejects a record of another shape, never adapts one. */
export const MATCH_RECORD_VERSION = 1;

/** A team holds 1 to this many players, bots included. */
export const MAX_RECORD_TEAM = 8;

/** The longest match a record may claim, in seconds. */
export const MAX_RECORD_DURATION_SECONDS = 7200;

/** How far ahead of the reader's clock `endedAt` may be, in seconds. */
export const RECORD_CLOCK_SKEW_SECONDS = 300;

export interface MatchRecordPlayer {
  readonly name: string;
  readonly guildTag: string | null;
  readonly bot: boolean;
  /** As played: the lobby's, or the hello's once the host accepted it. */
  readonly build: Omit<PlayerBuild, "name">;
}

export interface MatchRecordTeam {
  readonly players: readonly MatchRecordPlayer[];
}

export interface MatchRecord {
  readonly v: typeof MATCH_RECORD_VERSION;
  readonly mode: LobbyMode;
  /** The map's id. */
  readonly map: string;
  /** Unix seconds. */
  readonly endedAt: number;
  readonly durationSeconds: number;
  /** `null` for a draw. */
  readonly winningTeam: 0 | 1 | null;
  readonly endReason: MatchEndReason;
  readonly teams: readonly [MatchRecordTeam, MatchRecordTeam];
}

const END_REASONS: Readonly<Record<MatchEndReason, true>> = {
  score: true,
  time: true,
  annihilation: true,
  morale: true,
  "guild-lord": true,
  aggression: true,
};

function isEndReason(value: unknown): value is MatchEndReason {
  return typeof value === "string" && Object.hasOwn(END_REASONS, value);
}

function isLobbyMode(value: unknown): value is LobbyMode {
  return (LOBBY_MODES as readonly unknown[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parsePlayer(value: unknown): MatchRecordPlayer | undefined {
  if (!isRecord(value) || typeof value.bot !== "boolean") {
    return undefined;
  }
  const { name, guildTag } = value;
  if (typeof name !== "string" || name.trim() === "" || name.length > MAX_WIRE_STRING) {
    return undefined;
  }
  if (
    guildTag !== null &&
    (typeof guildTag !== "string" || sanitizeGuildTag(guildTag) !== guildTag)
  ) {
    return undefined;
  }
  // The record keeps the name on the player, not the build: lent back,
  // the build parses and validates as any other.
  const build = isRecord(value.build) ? parsePlayerBuild({ ...value.build, name }) : undefined;
  if (
    build === undefined ||
    validatePlayerBuild(build, MINIMAL_GW_INSPIRED_PVP_V1.attributes).length > 0
  ) {
    return undefined;
  }
  const { primaryProfession, secondaryProfession, attributes, skillBar, equipment } = build;
  return {
    name,
    guildTag,
    bot: value.bot,
    build: { primaryProfession, secondaryProfession, attributes, skillBar, equipment },
  };
}

function parseTeam(value: unknown): MatchRecordTeam | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.players) ||
    value.players.length < 1 ||
    value.players.length > MAX_RECORD_TEAM
  ) {
    return undefined;
  }
  const players: MatchRecordPlayer[] = [];
  for (const entry of value.players as readonly unknown[]) {
    const player = parsePlayer(entry);
    if (player === undefined) {
      return undefined;
    }
    players.push(player);
  }
  return { players };
}

/**
 * `value` as a match record, or `undefined` for anything else. Strict:
 * a record comes off a public relay, from anyone. `mapIds` are the maps
 * this build knows; `nowSeconds` is the reader's clock, unix seconds.
 */
export function validateMatchRecord(
  value: unknown,
  mapIds: ReadonlySet<string>,
  nowSeconds: number,
): MatchRecord | undefined {
  if (!isRecord(value) || value.v !== MATCH_RECORD_VERSION) {
    return undefined;
  }
  const { mode, map, endedAt, durationSeconds, winningTeam, endReason } = value;
  if (
    !isLobbyMode(mode) ||
    typeof map !== "string" ||
    !mapIds.has(map) ||
    !isEndReason(endReason) ||
    (winningTeam !== 0 && winningTeam !== 1 && winningTeam !== null)
  ) {
    return undefined;
  }
  if (
    !isWholeIn(endedAt, 0, nowSeconds + RECORD_CLOCK_SKEW_SECONDS) ||
    !isWholeIn(durationSeconds, 0, MAX_RECORD_DURATION_SECONDS)
  ) {
    return undefined;
  }
  if (!Array.isArray(value.teams) || value.teams.length !== 2) {
    return undefined;
  }
  const [first, second] = (value.teams as readonly unknown[]).map(parseTeam);
  if (first === undefined || second === undefined) {
    return undefined;
  }
  return {
    v: MATCH_RECORD_VERSION,
    mode,
    map,
    endedAt,
    durationSeconds,
    winningTeam,
    endReason,
    teams: [first, second],
  };
}

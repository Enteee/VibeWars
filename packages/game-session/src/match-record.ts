import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  decodeTemplateCode,
  defaultEquipmentFor,
  encodeTemplateCode,
  getSkill,
  validatePlayerBuild,
  type MatchEndReason,
  type PlayerBuild,
} from "@vibewars/game-core";
import { LOBBY_MODES, isTicketId, type LobbyMode } from "@vibewars/game-protocol";

import { sanitizeCharacterName, sanitizeGuildTag, sanitizeName } from "./names.js";

/**
 * What one finished match looked like (#2528), as its host reports it:
 * published on Nostr for anyone to read, and so public. A host can lie
 * about any of it; the event's signature proves only that the record
 * arrived intact. Nothing in it identifies a player beyond the in-game
 * name and guild tag they played under and their public player key
 * (#2739): no peer id, no address, no lobby key or room.
 */

/** Rejects a record of another shape, never adapts one. */
export const MATCH_RECORD_VERSION = 3;

/** A team holds 1 to this many players, bots included. */
export const MAX_RECORD_TEAM = 8;

/** The longest match a record may claim, in seconds. */
export const MAX_RECORD_DURATION_SECONDS = 7200;

/** The longest template code a record may hold: GW1's longest is 64 characters. */
const MAX_TEMPLATE_LENGTH = 64;

/** How far ahead of the reader's clock `endedAt` may be, in seconds. */
export const RECORD_CLOCK_SKEW_SECONDS = 300;

export interface MatchRecordPlayer {
  readonly name: string;
  readonly guildTag: string | null;
  readonly bot: boolean;
  /**
   * The public player key the host reports for this seat (#2739), which
   * draws the player's signet; `null` exactly for a bot. A host can
   * attach any key to a name, so it proves nothing.
   */
  readonly pubkey: string | null;
  /**
   * The build as played (the lobby's, or the hello's once the host
   * accepted it) as a GW1 template code: professions, ranks and bar in
   * about 40 bytes, where the whole build takes over a kilobyte.
   */
  readonly template: string;
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
  /** An index into `teams`; `null` for a draw. */
  readonly winningTeam: number | null;
  readonly endReason: MatchEndReason;
  /** Two or three (#2684), by team id. */
  readonly teams: readonly MatchRecordTeam[];
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
  // Held to what the game shows anywhere else, as the tag is: no bidi,
  // control or zero-width characters, at most MAX_NAME_LENGTH graphemes;
  // a bot is named after its build, so up to MAX_CHARACTER_NAME_LENGTH (#2636).
  const sanitize = value.bot ? sanitizeCharacterName : sanitizeName;
  if (typeof name !== "string" || name === "" || sanitize(name, "") !== name) {
    return undefined;
  }
  if (
    guildTag !== null &&
    (typeof guildTag !== "string" || sanitizeGuildTag(guildTag) !== guildTag)
  ) {
    return undefined;
  }
  const { pubkey } = value;
  if ((pubkey !== null && !isTicketId(pubkey)) || (pubkey === null) !== value.bot) {
    return undefined;
  }
  const { template } = value;
  if (typeof template !== "string" || template.length > MAX_TEMPLATE_LENGTH) {
    return undefined;
  }
  // Every skill one this game has, and written as this game writes it:
  // no padding or wider fields to carry anything else.
  const decoded = decodeTemplateCode(template);
  if (!decoded.ok || decoded.missingSkills.length > 0) {
    return undefined;
  }
  const written = encodeTemplateCode(decoded.build);
  if (!written.ok || written.code !== template) {
    return undefined;
  }
  // Lent the name and the primary's own equipment, the build validates
  // as any other.
  const build: PlayerBuild = {
    name,
    ...decoded.build,
    equipment: defaultEquipmentFor(decoded.build.primaryProfession),
  };
  if (validatePlayerBuild(build, MINIMAL_GW_INSPIRED_PVP_V1.attributes).length > 0) {
    return undefined;
  }
  return { name, guildTag, bot: value.bot, pubkey, template };
}

/**
 * `build` as a record holds it: its template code, with any skill GW1
 * does not have left out, as the code cannot name it.
 */
export function recordTemplate(build: PlayerBuild): string {
  const skillBar = build.skillBar.map((id) =>
    id !== null && getSkill(id)?.gwId === undefined ? null : id,
  );
  const encoded = encodeTemplateCode({ ...build, skillBar });
  if (!encoded.ok) {
    throw new Error(`no template code for a GW1 bar: ${encoded.problem}`);
  }
  return encoded.code;
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
    !isEndReason(endReason)
  ) {
    return undefined;
  }
  if (
    !isWholeIn(endedAt, 0, nowSeconds + RECORD_CLOCK_SKEW_SECONDS) ||
    !isWholeIn(durationSeconds, 0, MAX_RECORD_DURATION_SECONDS)
  ) {
    return undefined;
  }
  if (!Array.isArray(value.teams) || (value.teams.length !== 2 && value.teams.length !== 3)) {
    return undefined;
  }
  const teams = (value.teams as readonly unknown[]).map(parseTeam);
  if (
    teams.some((team) => team === undefined) ||
    (winningTeam !== null && !isWholeIn(winningTeam, 0, teams.length - 1))
  ) {
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
    teams: teams.filter((team) => team !== undefined),
  };
}

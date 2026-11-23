import { MORALE_CEILING, MORALE_FLOOR, parsePlayerBuild } from "@vibewars/game-core";
import {
  LOBBY_MODES,
  parseClientIntent,
  type ClientIntent,
  type WireMatchReplayPart,
  type LobbyMode,
  type WireTeam,
  type WireTeamCount,
} from "@vibewars/game-protocol";

import type { SeatSetup } from "./match-setup.js";
import { messageBytes } from "./transport.js";

/**
 * One thing the host did to its simulation between two ticks (#3572),
 * `tick` the simulation's tick when it did. Intents are what players sent;
 * the rest is the host seating, freezing and removing them, forfeiting a
 * team and passing on its calls. A rerun does them all, in this order.
 */
export type ReplayInput =
  | readonly [tick: number, kind: "intent", seat: string, intent: ClientIntent]
  | readonly [tick: number, kind: "add", seat: SeatSetup]
  | readonly [tick: number, kind: "remove", seat: string]
  /** Dropped: frozen in place and its cast cancelled, until it is back or removed. */
  | readonly [tick: number, kind: "drop", seat: string]
  | readonly [tick: number, kind: "forfeit", team: WireTeam, teams: readonly WireTeam[]]
  | readonly [tick: number, kind: "awaited", teams: readonly WireTeam[]]
  | readonly [tick: number, kind: "called", team: WireTeam, target: string | null]
  /** The match starts (#3818): ticks before it were held, every one after is the match's own. */
  | readonly [tick: number, kind: "start"];

/**
 * A match as its host ran it (#3572, ADR-0054): enough to run it again
 * and get the same outcome. The map and its rules are the build's, by
 * `map` and `mode`.
 */
export interface MatchReplay {
  /** The build that played it: a rerun under another is meaningless. */
  readonly buildHash: string;
  readonly seed: string;
  readonly map: string;
  readonly teamCount: WireTeamCount;
  readonly mode: LobbyMode;
  /**
   * The tick the match finished at; or, when a player overran its share
   * of the replay, the tick it did, where the recording stops.
   */
  readonly ticks: number;
  /** The player whose input overran its share (`ReplayBudget`), or `null`: the whole match. */
  readonly overrunBy: string | null;
  readonly inputs: readonly ReplayInput[];
}

/**
 * The longest a replay's encoding is, in characters: what a client takes.
 * A lobby match's host never records more: `ReplayBudget` shares it out
 * among the players, whatever they send. It fits 16 players at
 * `REPLAY_INPUTS_PER_SEAT_SECOND` for a whole Guild Battle.
 */
export const MAX_REPLAY_CHARS = 32_000_000;

/** The most inputs a replay holds: none encodes in fewer than 16 characters. */
export const MAX_REPLAY_INPUTS = MAX_REPLAY_CHARS / 16;

/** Sorted keys at every depth, so one replay has one encoding. */
function sortKeys(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

/** `replay` as canonical JSON: what is hashed, sent and stored. */
export function encodeReplay(replay: MatchReplay): string {
  return JSON.stringify(replay, sortKeys);
}

/** SHA-256, injected: `crypto.subtle` in a page, `node:crypto` in a test. */
export type Sha256 = (bytes: Uint8Array<ArrayBuffer>) => Promise<Uint8Array>;

/** The sha256 of `text`, as hex, by `sha256` (injected: `crypto.subtle` in a page). */
export async function textHash(text: string, sha256: Sha256): Promise<string> {
  const digest = await sha256(new Uint8Array(new TextEncoder().encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A replay's hash: the sha256 of its encoding, as hex. */
export function replayHash(replay: MatchReplay, sha256: Sha256): Promise<string> {
  return textHash(encodeReplay(replay), sha256);
}

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isMode(value: unknown): value is LobbyMode {
  return LOBBY_MODES.some((mode) => mode === value);
}

function teamOf(value: unknown, teamCount: WireTeamCount): WireTeam | undefined {
  return value === 0 || value === 1 || (value === 2 && teamCount === 3) ? value : undefined;
}

function teamsOf(value: unknown, teamCount: WireTeamCount): WireTeam[] | undefined {
  if (!Array.isArray(value) || value.length > teamCount) {
    return undefined;
  }
  const teams = value.map((item) => teamOf(item, teamCount));
  return teams.every((team) => team !== undefined) ? teams : undefined;
}

function parseSeatSetup(value: unknown, teamCount: WireTeamCount): SeatSetup | undefined {
  const raw = fields(value);
  if (raw === undefined) {
    return undefined;
  }
  const team = teamOf(raw.team, teamCount);
  const build = parsePlayerBuild(raw.build);
  const morale = raw.startMorale;
  return isText(raw.id) &&
    team !== undefined &&
    build !== undefined &&
    isCount(raw.teammates) &&
    typeof raw.bot === "boolean" &&
    typeof morale === "number" &&
    Number.isInteger(morale) &&
    morale >= MORALE_FLOOR &&
    morale <= MORALE_CEILING
    ? { id: raw.id, team, build, teammates: raw.teammates, bot: raw.bot, startMorale: morale }
    : undefined;
}

function parseInput(value: unknown, teamCount: WireTeamCount): ReplayInput | undefined {
  if (!Array.isArray(value) || !isCount(value[0])) {
    return undefined;
  }
  const [tick, kind, a, b] = value as [number, unknown, unknown, unknown];
  const arity = (n: number): boolean => value.length === n;
  switch (kind) {
    case "intent": {
      const intent = parseClientIntent(b);
      return arity(4) && isText(a) && intent !== undefined
        ? [tick, "intent", a, intent]
        : undefined;
    }
    case "add": {
      const seat = parseSeatSetup(a, teamCount);
      return arity(3) && seat !== undefined ? [tick, "add", seat] : undefined;
    }
    case "remove":
    case "drop":
      return arity(3) && isText(a) ? [tick, kind, a] : undefined;
    case "forfeit": {
      const team = teamOf(a, teamCount);
      const teams = teamsOf(b, teamCount);
      return arity(4) && team !== undefined && teams !== undefined
        ? [tick, "forfeit", team, teams]
        : undefined;
    }
    case "awaited": {
      const teams = teamsOf(a, teamCount);
      return arity(3) && teams !== undefined ? [tick, "awaited", teams] : undefined;
    }
    case "start":
      return arity(2) ? [tick, "start"] : undefined;
    case "called": {
      const team = teamOf(a, teamCount);
      return arity(4) && team !== undefined && (b === null || isText(b))
        ? [tick, "called", team, b]
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * A replay from untrusted JSON, or `undefined` for anything not exactly
 * one: a field missing or wrong, an input out of tick order or past the
 * end, or more than `MAX_REPLAY_INPUTS` of them.
 */
export function parseReplay(value: unknown): MatchReplay | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isText(raw.buildHash) ||
    !isText(raw.seed) ||
    !isText(raw.map) ||
    (raw.teamCount !== 2 && raw.teamCount !== 3) ||
    !isMode(raw.mode) ||
    !isCount(raw.ticks) ||
    (raw.overrunBy !== null && !isText(raw.overrunBy)) ||
    !Array.isArray(raw.inputs) ||
    raw.inputs.length > MAX_REPLAY_INPUTS
  ) {
    return undefined;
  }
  const teamCount: WireTeamCount = raw.teamCount;
  const ticks = raw.ticks;
  const inputs: ReplayInput[] = [];
  for (const item of raw.inputs as unknown[]) {
    const input = parseInput(item, teamCount);
    const previous = inputs.at(-1)?.[0] ?? 0;
    if (input === undefined || input[0] < previous || input[0] > ticks) {
      return undefined;
    }
    inputs.push(input);
  }
  return {
    buildHash: raw.buildHash,
    seed: raw.seed,
    map: raw.map,
    teamCount,
    mode: raw.mode,
    ticks,
    overrunBy: isText(raw.overrunBy) ? raw.overrunBy : null,
    inputs,
  };
}

/** A replay and its hash, as a host and its players keep it. */
export interface RecordedReplay {
  readonly hash: string;
  readonly replay: MatchReplay;
}

/**
 * The most characters a part's slice holds. A character is at most 3 bytes
 * in a message, so 5000 always fit one, and `MAX_REPLAY_CHARS` always fits
 * `MAX_REPLAY_PARTS` parts.
 */
export const REPLAY_SLICE = 5000;

/**
 * `text`, a replay's encoding with hash `hash`, as messages of at most
 * `maxBytes` each: slices of it, in order.
 */
export function packReplay(text: string, hash: string, maxBytes: number): WireMatchReplayPart[] {
  const slices: string[] = [];
  for (let start = 0; start < text.length;) {
    let length = Math.min(REPLAY_SLICE, text.length - start);
    // The part numbers are not known yet: this many digits is their most.
    while (
      length > 1 &&
      messageBytes({ hash, part: 9999, of: 9999, text: text.slice(start, start + length) }) >
        maxBytes
    ) {
      length = Math.floor(length / 2);
    }
    slices.push(text.slice(start, start + length));
    start += length;
  }
  return slices.map((slice, part) => ({ hash, part, of: slices.length, text: slice }));
}

/**
 * The replay `parts` hold (#3572), all of them, in any order: `undefined`
 * if one is missing or twice, they disagree on the hash, the text does
 * not hash to it, or it is not exactly a replay's encoding.
 */
export async function joinReplay(
  parts: readonly WireMatchReplayPart[],
  sha256: Sha256,
): Promise<RecordedReplay | undefined> {
  const first = parts[0];
  if (
    parts.length !== first?.of ||
    parts.some((part) => part.hash !== first.hash || part.of !== first.of) ||
    new Set(parts.map(({ part }) => part)).size !== parts.length
  ) {
    return undefined;
  }
  const text = [...parts]
    .sort((a, b) => a.part - b.part)
    .map((part) => part.text)
    .join("");
  if (text.length > MAX_REPLAY_CHARS || (await textHash(text, sha256)) !== first.hash) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const replay = parseReplay(value);
  return replay !== undefined && encodeReplay(replay) === text
    ? { hash: first.hash, replay }
    : undefined;
}

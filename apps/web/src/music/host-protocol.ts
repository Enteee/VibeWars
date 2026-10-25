/**
 * The messages between the game and the music host (#366 §3.1, ADR-0028).
 *
 * The host runs player-written Strudel in a sandboxed, opaque-origin
 * iframe, and a pattern can navigate its own frame, so neither side trusts
 * the other's messages: each is checked here, field by field, and anything
 * malformed is `null` and dropped. This is the only file both sides import.
 */

/** The intensity levels a track can respond to (`layer(n, …)`). */
export type MusicLevel = 0 | 1 | 2 | 3;

/** A track as the host needs it: an id to report back, and its source. */
export interface HostTrack {
  readonly trackId: string;
  readonly source: string;
  /** Where the next switch away from this track may land. */
  readonly phraseCycles: number;
}

export type GameToHost =
  /** Play this track now, replacing whatever plays. */
  | ({ readonly type: "load" } & HostTrack)
  /** Switch to this track on the playing one's next phrase boundary, fading over `cycles`. */
  | ({ readonly type: "crossfadeTo"; readonly cycles: number } & HostTrack)
  /** Start again what `stop` stopped. */
  | { readonly type: "play" }
  | { readonly type: "stop" }
  | { readonly type: "setIntensity"; readonly level: MusicLevel }
  | { readonly type: "setVolume"; readonly gain: number; readonly rampSeconds: number }
  /** Replace the playing track's pattern with this source, at once (the beat editor). */
  | { readonly type: "evaluate"; readonly source: string }
  /** The watchdog's heartbeat; the host answers `pong` with the same `seq`. */
  | { readonly type: "ping"; readonly seq: number };

export type HostToGame =
  | { readonly type: "ready" }
  | {
      readonly type: "playing";
      readonly trackId: string;
      readonly cycle: number;
      readonly cps: number;
    }
  | { readonly type: "evaluated" }
  | { readonly type: "error"; readonly message: string; readonly line?: number }
  | { readonly type: "pong"; readonly seq: number };

/** Longer sources are refused: a track is a few kilobytes. */
export const MAX_SOURCE_LENGTH = 100_000;
/** Longer ids and error messages are refused or cut. */
const MAX_TEXT_LENGTH = 500;

type Fields = Readonly<Record<string, unknown>>;

function fields(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function level(value: unknown): value is MusicLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function track(message: Fields): HostTrack | null {
  const { trackId, source, phraseCycles } = message;
  return text(trackId, MAX_TEXT_LENGTH) &&
    trackId !== "" &&
    text(source, MAX_SOURCE_LENGTH) &&
    Number.isInteger(phraseCycles) &&
    finite(phraseCycles, 1, 64)
    ? { trackId, source, phraseCycles }
    : null;
}

/** A message the host may act on, or `null`. */
export function parseGameToHost(data: unknown): GameToHost | null {
  const message = fields(data);
  switch (message?.type) {
    case "load":
    case "crossfadeTo": {
      const parsed = track(message);
      if (parsed === null) {
        return null;
      }
      if (message.type === "load") {
        return { type: "load", ...parsed };
      }
      return finite(message.cycles, 0, 16)
        ? { type: "crossfadeTo", cycles: message.cycles, ...parsed }
        : null;
    }
    case "play":
    case "stop":
      return { type: message.type };
    case "setIntensity":
      return level(message.level) ? { type: "setIntensity", level: message.level } : null;
    case "setVolume":
      return finite(message.gain, 0, 1) && finite(message.rampSeconds, 0, 10)
        ? { type: "setVolume", gain: message.gain, rampSeconds: message.rampSeconds }
        : null;
    case "evaluate":
      return text(message.source, MAX_SOURCE_LENGTH)
        ? { type: "evaluate", source: message.source }
        : null;
    case "ping":
      return Number.isSafeInteger(message.seq)
        ? { type: "ping", seq: message.seq as number }
        : null;
    default:
      return null;
  }
}

/** A message the game may act on, or `null`. */
export function parseHostToGame(data: unknown): HostToGame | null {
  const message = fields(data);
  switch (message?.type) {
    case "ready":
    case "evaluated":
      return { type: message.type };
    case "playing": {
      const { trackId, cycle, cps } = message;
      return text(trackId, MAX_TEXT_LENGTH) &&
        finite(cycle, 0, Number.MAX_SAFE_INTEGER) &&
        finite(cps, 0, 100)
        ? { type: "playing", trackId, cycle, cps }
        : null;
    }
    case "error": {
      const { message: said, line } = message;
      if (!text(said, MAX_TEXT_LENGTH)) {
        return null;
      }
      if (line === undefined) {
        return { type: "error", message: said };
      }
      return Number.isInteger(line) && finite(line, 1, 100_000)
        ? { type: "error", message: said, line }
        : null;
    }
    case "pong":
      return Number.isSafeInteger(message.seq)
        ? { type: "pong", seq: message.seq as number }
        : null;
    default:
      return null;
  }
}

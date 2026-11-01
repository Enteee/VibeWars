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
  /**
   * Replace the playing track's pattern with this source, at once (the beat
   * editor). The host answers `evaluated` or `error` with the same `seq`.
   */
  | { readonly type: "evaluate"; readonly seq: number; readonly source: string }
  /** The watchdog's heartbeat; the host answers `pong` with the same `seq`. */
  | { readonly type: "ping"; readonly seq: number }
  /** Count what the music costs and report it every second (`?musicstats`, #420). */
  | { readonly type: "measure" }
  /** Busy-wait this many ms in every render quantum of the music audio thread (`?audiostress=`, #519). */
  | { readonly type: "audioStress"; readonly ms: number };

/**
 * One second of the music's timing (#420), counted only after `measure`.
 * Gaps show as `skippedMs` and `droppedEvents`, crackle as `underrunMs` in
 * every browser and `glitches` in Chromium, clipping as `maxReductionDb`.
 */
export interface MusicStats {
  /** Scheduler ticks this second. */
  readonly ticks: number;
  /** Ticks that came more than 1.5 intervals after the one before. */
  readonly lateTicks: number;
  /** The longest wait between two ticks this second. */
  readonly maxTickGapMs: number;
  /** The longest a tick itself took: querying the pattern and starting its sounds. */
  readonly maxTickWorkMs: number;
  /** Music the scheduler never queried, because a tick came too late for it. */
  readonly skippedMs: number;
  /** Events handed to superdough this second. */
  readonly events: number;
  /** Events left out, not handed over, because their onset was too near or past (#1991). */
  readonly droppedEvents: number;
  /** `AudioContext.baseLatency` and `outputLatency`, in milliseconds. */
  readonly baseLatencyMs: number;
  readonly outputLatencyMs: number;
  /**
   * Chromium's `playoutStats`, since the context started: how often and for
   * how long the audio thread had nothing to play. `null` where it is missing.
   */
  readonly glitches: number | null;
  readonly glitchMs: number | null;
  /**
   * Seconds in which the audio clock fell behind the wall clock (0 or 1),
   * and by how many milliseconds (#507): the audio thread running dry.
   * `null` where the browser cannot say.
   */
  readonly underruns: number | null;
  readonly underrunMs: number | null;
  /** The deepest the bus limiter pulled the mix down this second, in dB (0 or less). */
  readonly maxReductionDb: number;
}

export type HostToGame =
  | { readonly type: "ready" }
  | {
      readonly type: "playing";
      readonly trackId: string;
      readonly cycle: number;
      readonly cps: number;
    }
  | { readonly type: "evaluated"; readonly seq: number }
  /**
   * `seq` is the `evaluate` it answers; a load, or a pattern failing as it
   * plays, has none.
   */
  | {
      readonly type: "error";
      readonly message: string;
      readonly line?: number;
      readonly seq?: number;
    }
  | { readonly type: "pong"; readonly seq: number }
  | ({ readonly type: "stats" } & MusicStats);

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
      return Number.isSafeInteger(message.seq) && text(message.source, MAX_SOURCE_LENGTH)
        ? { type: "evaluate", seq: message.seq as number, source: message.source }
        : null;
    case "ping":
      return Number.isSafeInteger(message.seq)
        ? { type: "ping", seq: message.seq as number }
        : null;
    case "measure":
      return { type: "measure" };
    case "audioStress":
      return finite(message.ms, 0, 5) ? { type: "audioStress", ms: message.ms } : null;
    default:
      return null;
  }
}

/** A message the game may act on, or `null`. */
export function parseHostToGame(data: unknown): HostToGame | null {
  const message = fields(data);
  switch (message?.type) {
    case "ready":
      return { type: message.type };
    case "evaluated":
      return Number.isSafeInteger(message.seq)
        ? { type: "evaluated", seq: message.seq as number }
        : null;
    case "playing": {
      const { trackId, cycle, cps } = message;
      return text(trackId, MAX_TEXT_LENGTH) &&
        finite(cycle, 0, Number.MAX_SAFE_INTEGER) &&
        finite(cps, 0, 100)
        ? { type: "playing", trackId, cycle, cps }
        : null;
    }
    case "error": {
      const { message: said, line, seq } = message;
      if (
        !text(said, MAX_TEXT_LENGTH) ||
        (line !== undefined && !(Number.isInteger(line) && finite(line, 1, 100_000))) ||
        (seq !== undefined && !Number.isSafeInteger(seq))
      ) {
        return null;
      }
      return {
        type: "error",
        message: said,
        ...(line === undefined ? {} : { line }),
        ...(seq === undefined ? {} : { seq: seq as number }),
      };
    }
    case "pong":
      return Number.isSafeInteger(message.seq)
        ? { type: "pong", seq: message.seq as number }
        : null;
    case "stats":
      return stats(message);
    default:
      return null;
  }
}

/** The largest count or duration a second of stats can carry. */
const MAX_STAT = 1e9;

function stat(value: unknown): value is number {
  return finite(value, 0, MAX_STAT);
}

function optionalStat(value: unknown): value is number | null {
  return value === null || stat(value);
}

function stats(message: Fields): HostToGame | null {
  const { ticks, lateTicks, maxTickGapMs, maxTickWorkMs, skippedMs, events, droppedEvents } =
    message;
  const { baseLatencyMs, outputLatencyMs, glitches, glitchMs } = message;
  const { underruns, underrunMs, maxReductionDb } = message;
  return stat(ticks) &&
    stat(lateTicks) &&
    stat(maxTickGapMs) &&
    stat(maxTickWorkMs) &&
    stat(skippedMs) &&
    stat(events) &&
    stat(droppedEvents) &&
    stat(baseLatencyMs) &&
    stat(outputLatencyMs) &&
    optionalStat(glitches) &&
    optionalStat(glitchMs) &&
    optionalStat(underruns) &&
    optionalStat(underrunMs) &&
    finite(maxReductionDb, -MAX_STAT, 0)
    ? {
        type: "stats",
        ticks,
        lateTicks,
        maxTickGapMs,
        maxTickWorkMs,
        skippedMs,
        events,
        droppedEvents,
        baseLatencyMs,
        outputLatencyMs,
        glitches,
        glitchMs,
        underruns,
        underrunMs,
        maxReductionDb,
      }
    : null;
}

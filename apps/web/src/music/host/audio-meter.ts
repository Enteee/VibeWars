import type { MusicStats } from "../host-protocol.js";
import type { UnderrunProbe } from "./underruns.js";

/**
 * What the music costs, second by second (#420): counted in the host only
 * once the game asks with `measure`, which it does only under
 * `?musicstats`. Until then there is no meter, so a player's game counts
 * nothing and sends nothing.
 */

/** What the audio context says about itself, read once a second. */
export type AudioReadings = Pick<
  MusicStats,
  "baseLatencyMs" | "outputLatencyMs" | "glitches" | "glitchMs" | "underruns" | "underrunMs"
>;

/** Counts one second's ticks and events. */
export interface StatsMeter {
  /** A scheduler tick at `atMs`; ticks are due every `intervalMs`. */
  tick(atMs: number, intervalMs: number): void;
  /** A tick's own work took `ms`. */
  worked(ms: number): void;
  /** `ms` of music the scheduler skipped. */
  skipped(ms: number): void;
  /** An event handed to superdough. */
  event(): void;
  /** An event left out because its onset was too near or past (#1991). */
  dropped(): void;
  /** The limiter pulled the mix down by `db` (0 or less) just now. */
  reduced(db: number): void;
  /** The counts since the last take, which starts the next second. */
  take(audio: AudioReadings): MusicStats;
}

/** A tick this much later than its interval is late. */
const LATE_TICK = 1.5;

export function createMeter(): StatsMeter {
  let lastTickMs: number | undefined;
  let ticks = 0;
  let lateTicks = 0;
  let maxTickGapMs = 0;
  let maxTickWorkMs = 0;
  let skippedMs = 0;
  let events = 0;
  let droppedEvents = 0;
  let maxReductionDb = 0;
  return {
    tick(atMs, intervalMs) {
      ticks += 1;
      if (lastTickMs !== undefined) {
        const gap = atMs - lastTickMs;
        maxTickGapMs = Math.max(maxTickGapMs, gap);
        if (gap > LATE_TICK * intervalMs) {
          lateTicks += 1;
        }
      }
      lastTickMs = atMs;
    },
    worked(ms) {
      maxTickWorkMs = Math.max(maxTickWorkMs, ms);
    },
    skipped(ms) {
      skippedMs += ms;
    },
    event() {
      events += 1;
    },
    dropped() {
      droppedEvents += 1;
    },
    reduced(db) {
      maxReductionDb = Math.min(maxReductionDb, db);
    },
    take(audio) {
      const taken = {
        ticks,
        lateTicks,
        maxTickGapMs,
        maxTickWorkMs,
        skippedMs,
        events,
        droppedEvents,
        maxReductionDb,
        ...audio,
      };
      ticks = 0;
      lateTicks = 0;
      maxTickGapMs = 0;
      maxTickWorkMs = 0;
      skippedMs = 0;
      events = 0;
      droppedEvents = 0;
      maxReductionDb = 0;
      return taken;
    },
  };
}

/** How often a measuring host reports. */
export const STATS_INTERVAL_MS = 1_000;

export interface Measurement {
  /** The meter, once `start` has run; until then nothing is counted. */
  readonly meter: StatsMeter | undefined;
  /** Start counting, and report every second. Idempotent. */
  start(): void;
}

export function createMeasurement(
  report: (stats: MusicStats) => void,
  audio: () => AudioReadings,
  every: (callback: () => void, ms: number) => void,
): Measurement {
  let meter: StatsMeter | undefined;
  return {
    get meter() {
      return meter;
    },
    start() {
      if (meter !== undefined) {
        return;
      }
      const started = createMeter();
      meter = started;
      every(() => {
        report(started.take(audio()));
      }, STATS_INTERVAL_MS);
    },
  };
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Seconds in milliseconds, and 0 for what a browser does not report. */
function ms(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/**
 * `context`'s latencies, and Chromium's `playoutStats` where it has them:
 * fallback frames are the audio thread running dry, which is a crackle.
 */
export function readAudio(context: AudioContext, underruns: UnderrunProbe): AudioReadings {
  const playout = record((context as unknown as Record<string, unknown>).playoutStats);
  const glitches = playout?.fallbackFramesEvents;
  // A DOMHighResTimeStamp: milliseconds already.
  const fallback = playout?.fallbackDuration;
  return {
    baseLatencyMs: ms(context.baseLatency),
    outputLatencyMs: ms(context.outputLatency),
    glitches: typeof glitches === "number" ? glitches : null,
    glitchMs: typeof fallback === "number" ? fallback : null,
    ...underruns.take(),
  };
}

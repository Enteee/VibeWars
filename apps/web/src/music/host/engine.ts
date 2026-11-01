import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { evaluate, transpiler } from "@strudel/transpiler";
import {
  getSuperdoughAudioController,
  initAudio,
  registerSynthSounds,
  samples,
  webaudioOutput,
  webaudioRepl,
  type Output,
} from "@strudel/webaudio";

import {
  parseGameToHost,
  type GameToHost,
  type HostToGame,
  type HostTrack,
} from "../host-protocol.js";
import { samplesBaseUrl } from "../music-urls.js";
import {
  levelAt,
  nextBoundary,
  nextCycle,
  scheduleLevel,
  type LevelChange,
} from "./transitions.js";
import { busGate, type BusGate } from "./bus-gate.js";
import { crossfade, isTempoMark } from "./crossfade.js";
import { dropLate } from "./late-notes.js";
import { catchUpTick, leadClock } from "./lead-clock.js";
import { makeLayer, type TrackClock } from "./layer.js";
import { reverbPins } from "./reverb-pins.js";
import { startAudioStress } from "./audio-stress.js";
import { createMeasurement, readAudio } from "./stats.js";
import { createUnderrunProbe } from "./underruns.js";
import { suspendWhileHidden } from "./visibility.js";
import { within } from "./within.js";
import { workerTimers } from "./worker-timers.js";

/**
 * The Strudel engine inside the music host (ADR-0028, #366 §3.1). Loaded
 * only once `guard.ts` has passed. Wired by hand: no `initStrudel()`, no
 * `@strudel/web`, no `miniAllStrings`, and every sound from our own
 * palette or Strudel's synths.
 *
 * A track's source is evaluated here, never played straight through the
 * REPL, so that a switch can be planned: the new pattern starts on the
 * playing track's next phrase boundary, the two crossfade, and only then
 * does the new one play alone. A source that fails to evaluate, or to
 * query, leaves what was playing alone and reports `error`.
 */

/** The limiter's ceiling, in dBFS. */
const LIMITER_DB = -1;
/** How often the host checks whether a planned switch has landed. */
const SWITCH_POLL_MS = 100;
/** Longer error messages are cut; the protocol refuses very long ones. */
const MAX_ERROR_LENGTH = 300;
/** How long the audio context may take to start before the host gives up on it. */
const AUDIO_START_MS = 3_000;
/**
 * How far ahead of the audio clock the scheduler works (#446). A note is
 * queried and handed to Web Audio at least this long before it plays, so a
 * stall of the main thread this long costs no note. Changes of intensity,
 * of track and of source are heard this much later. Not above 1 s.
 */
const LEAD_SECONDS = 0.75;
/** The cyclist's own lookahead (interval plus overlap): the most its clock may move on at once. */
const CYCLIST_LOOKAHEAD_SECONDS = 0.2;
/**
 * A note due to start sooner than this after the audio clock is left out
 * rather than started with its attack cut off (#1991): about a render
 * quantum's worth of time and Firefox's scheduling slack.
 */
const LATE_MARGIN_SECONDS = 0.01;
/**
 * The output buffer the music context asks for, in seconds (#2023,
 * ADR-0028 §12). Music needs no low latency, and every second of buffer is
 * slack for an audio thread the OS schedules late on a busy machine.
 */
const MUSIC_LATENCY_SECONDS = 0.5;
/** A track as it plays: its pattern, unshifted, and where it started. */
interface Playing {
  readonly trackId: string;
  readonly pattern: core.Pattern;
  readonly phraseCycles: number;
  readonly cps: number;
  /** The cycle its cycle 0 plays on. */
  readonly clock: TrackClock;
}

/** A switch to `next`, landing at `next.clock.origin` and fading until `until`. */
interface Switch {
  readonly next: Playing;
  readonly until: number;
  announced: boolean;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** An error as the protocol carries it. */
function describe(error: unknown): Extract<HostToGame, { type: "error" }> {
  const message = (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
  const line = record(record(error)?.loc)?.line;
  return typeof line === "number" && Number.isInteger(line) && line >= 1
    ? { type: "error", message, line }
    : { type: "error", message };
}

/**
 * How long after it was asked for a change is heard (#509), posted only
 * while measuring. Not part of the protocol: scripts/music-stress.mjs
 * reads it off the window, and the game drops it.
 */
interface Heard {
  readonly type: "heard";
  readonly change: "load" | "switch" | "evaluate" | "intensity";
  readonly delayMs: number;
}

export async function startEngine(): Promise<void> {
  const post = (message: HostToGame | Heard): void => {
    // The parent's origin cannot be named from an opaque origin; the
    // parent checks `event.source` instead.
    parent.postMessage(message, "*");
  };

  // A big output buffer keeps a busy machine's audio thread from running
  // dry (#420, #2023). The sound effects have a context of their own.
  const context = new AudioContext({ latencyHint: MUSIC_LATENCY_SECONDS });
  suspendWhileHidden(document, context, (error) => {
    post(describe(error));
  });
  const timers = workerTimers();
  const underruns = createUnderrunProbe(context);
  /** The bus limiter, made with the bus once the first track plays. */
  let limiter: DynamicsCompressorNode | undefined;
  const measurement = createMeasurement(
    (stats) => {
      post({ type: "stats", ...stats });
    },
    () => readAudio(context, underruns),
    (callback, ms) => timers.setInterval(callback, ms),
  );
  const pins = reverbPins();
  const pinned: Output = (hap, deadline, duration, cps, t) =>
    webaudioOutput(
      hap.withValue((value) => pins.pin(value)),
      deadline,
      duration,
      cps,
      t,
    );
  const output = dropLate(
    pinned,
    () => context.currentTime,
    LATE_MARGIN_SECONDS,
    () => measurement.meter,
  );
  const schedulerTime = leadClock(
    () => context.currentTime,
    LEAD_SECONDS,
    CYCLIST_LOOKAHEAD_SECONDS,
  );
  const repl = webaudioRepl({
    audioContext: context,
    getTime: schedulerTime,
    transpiler,
    // The scheduler's own ticks, timed and checked for music they skip (#420).
    setInterval: (callback, ms) =>
      timers.setInterval(() => {
        const meter = measurement.meter;
        if (meter === undefined) {
          catchUpTick(schedulerTime, CYCLIST_LOOKAHEAD_SECONDS, callback);
          return;
        }
        const began = performance.now();
        meter.tick(began, ms);
        if (limiter !== undefined) {
          meter.reduced(limiter.reduction);
        }
        // A slot's time is its time in the audio context, so one behind
        // `currentTime` is a note the audio thread never plays: a gap.
        const behind = context.currentTime - scheduler.clock.getPhase();
        if (scheduler.started && behind > 0) {
          meter.skipped(
            Math.ceil(behind / scheduler.clock.duration) * scheduler.clock.duration * 1000,
          );
        }
        catchUpTick(schedulerTime, CYCLIST_LOOKAHEAD_SECONDS, callback);
        meter.worked(performance.now() - began);
      }, ms),
    clearInterval: (id) => {
      timers.clearInterval(id);
    },
    defaultOutput: (hap, deadline, duration, cps, t) =>
      isTempoMark(hap.value) ? undefined : output(hap, deadline, duration, cps, t),
  });
  const scheduler = repl.scheduler;
  /** The end of what the scheduler has queried. Nothing before it can change. */
  const position = (): number => scheduler.lastEnd;

  let levels: LevelChange[] = [];
  /** What the last evaluated source asked for with `setcpm`. */
  let requestedCps: number | undefined;
  // Read through a function: the source sets it, which the compiler cannot see.
  const askedCps = (): number | undefined => requestedCps;
  let playing: Playing | undefined;
  let switching: Switch | undefined;
  /** What the scheduler plays: `playing`, or a crossfade into a switch. */
  let scheduled: core.Pattern = core.silence;
  let volume = 1;
  let bus: GainNode | undefined;
  let gate: BusGate | undefined;

  /** The clock of the source being evaluated, which its `layer` calls keep. */
  let compiling: TrackClock = { origin: 0 };
  const layer = makeLayer(
    () => levels,
    () => compiling,
  );
  Object.defineProperty(globalThis, "INTENSITY", {
    get: () => levelAt(levels, position()),
  });
  await core.evalScope(core, mini, tonal, {
    layer,
    // Recorded, not applied: a track's tempo starts when the track does.
    setcpm: (cpm: number) => {
      requestedCps = cpm / 60;
    },
    setcps: (cps: number) => {
      requestedCps = cps;
    },
  });
  registerSynthSounds();
  const base = samplesBaseUrl(import.meta.env.BASE_URL, location.href);
  await samples(`${base}strudel.json`, base);

  /**
   * A pattern that reports its first failure to query, and then plays
   * nothing rather than stopping the scheduler.
   */
  const guarded = (pattern: core.Pattern): core.Pattern => {
    let failed = false;
    return new core.Pattern((state) => {
      if (failed) {
        return [];
      }
      try {
        return pattern.query(state);
      } catch (error) {
        failed = true;
        post(describe(error));
        return [];
      }
    });
  };

  /**
   * A source's pattern and tempo. Queried once over a phrase at every
   * level before it is used, so a pattern that throws is refused here
   * rather than going silent mid-fight.
   */
  const compile = async (
    source: string,
    phraseCycles: number,
  ): Promise<{ pattern: core.Pattern; cps: number; clock: TrackClock }> => {
    requestedCps = undefined;
    // Placed by the caller, once it knows where the track starts.
    const clock: TrackClock = { origin: 0 };
    compiling = clock;
    const { pattern } = await evaluate(source);
    if (!core.isPattern(pattern)) {
      throw new Error("the source does not end in a pattern");
    }
    const saved = levels;
    levels = [{ from: 0, level: 3 }];
    try {
      pattern.queryArc(0, phraseCycles);
    } finally {
      levels = saved;
    }
    return { pattern, cps: askedCps() ?? scheduler.cps, clock };
  };

  /** Music needs a running context, made after a gesture, and our bus. */
  const ensureAudio = async (): Promise<void> => {
    if (bus !== undefined) {
      return;
    }
    // Without audio activation in this frame these never settle; bounded,
    // the message fails with `error` and the next one tries again.
    await within(
      initAudio().then(() => context.resume()),
      AUDIO_START_MS,
      "the browser did not let music start",
    );
    // superdough → music bus → limiter → speakers (#366 §3.1).
    bus = context.createGain();
    bus.gain.value = volume;
    gate = busGate(bus.gain, () => context.currentTime, LEAD_SECONDS, volume);
    limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    bus.connect(limiter).connect(context.destination);
    const out = getSuperdoughAudioController().output.destinationGain;
    out.disconnect();
    out.connect(bus);
  };

  const announce = (track: Playing): void => {
    post({ type: "playing", trackId: track.trackId, cycle: track.clock.origin, cps: track.cps });
  };

  /** What a scheduler that is about to start needs: a clock `LEAD_SECONDS` ahead, and the bus open. */
  const startScheduler = (): void => {
    if (!scheduler.started) {
      schedulerTime.reset();
      gate?.open();
    }
  };

  const schedule = async (pattern: core.Pattern): Promise<void> => {
    scheduled = pattern;
    startScheduler();
    await repl.setPattern(guarded(pattern), true);
  };

  /**
   * When the live engine will be heard to make a change asked for at
   * `askedAt`: `ahead` seconds of music past what it has queried, which is
   * itself about `LEAD_SECONDS` ahead of the audio clock. Reported only
   * while measuring (#509).
   */
  const heard = (change: Heard["change"], askedAt: number, ahead: number): void => {
    if (measurement.meter !== undefined) {
      post({
        type: "heard",
        change,
        delayMs: (context.currentTime - askedAt + LEAD_SECONDS + ahead) * 1000,
      });
    }
  };

  /** Play `track` now, in place of anything playing or planned. */
  const load = async (track: HostTrack, askedAt: number): Promise<void> => {
    const { pattern, cps, clock } = await compile(track.source, track.phraseCycles);
    await ensureAudio();
    clock.origin = scheduler.started ? Math.floor(position()) : 0;
    switching = undefined;
    playing = { trackId: track.trackId, pattern, phraseCycles: track.phraseCycles, cps, clock };
    pins.reset();
    scheduler.setCps(cps);
    await schedule(pattern.late(clock.origin));
    announce(playing);
    heard("load", askedAt, 0);
  };

  /**
   * Switch to `track` on the playing track's next phrase boundary, with
   * both playing for `cycles` while one fades out and the other in.
   */
  const crossfadeTo = async (track: HostTrack, cycles: number, askedAt: number): Promise<void> => {
    if (playing === undefined || !scheduler.started) {
      await load(track, askedAt);
      return;
    }
    const { pattern, cps, clock } = await compile(track.source, track.phraseCycles);
    // A switch still planned is replaced: this one lands where it would have.
    const current = switching?.next ?? playing;
    const from = nextBoundary(position(), current.clock.origin, current.phraseCycles);
    clock.origin = from;
    const next: Playing = {
      trackId: track.trackId,
      pattern,
      phraseCycles: track.phraseCycles,
      cps,
      clock,
    };
    const until = from + cycles;
    switching = { next, until, announced: false };
    // What plays fades out, even if that is a crossfade still under way.
    heard("switch", askedAt, (from - position()) / scheduler.cps);
    await schedule(crossfade(scheduled, pattern, from, cycles, cps));
  };

  /** Land a planned switch: announce it on its boundary, then play the new track alone. */
  timers.setInterval(() => {
    const planned = switching;
    if (planned === undefined) {
      return;
    }
    if (!planned.announced && position() >= planned.next.clock.origin) {
      planned.announced = true;
      announce(planned.next);
    }
    if (position() >= planned.until) {
      switching = undefined;
      playing = planned.next;
      pins.reset();
      void schedule(planned.next.pattern.late(planned.next.clock.origin));
    }
  }, SWITCH_POLL_MS);

  const handle = async (message: GameToHost, askedAt: number): Promise<void> => {
    switch (message.type) {
      case "load":
        await load(message, askedAt);
        return;
      case "crossfadeTo":
        await crossfadeTo(message, message.cycles, askedAt);
        return;
      case "play":
        // From the top: a stopped scheduler counts cycles from 0 again.
        if (playing !== undefined && !scheduler.started) {
          playing.clock.origin = 0;
          scheduler.setCps(playing.cps);
          await schedule(playing.pattern);
        }
        return;
      case "stop":
        // Cycles start again from 0, and so does the intensity schedule.
        levels = [{ from: 0, level: levelAt(levels, position()) }];
        if (switching !== undefined) {
          playing = switching.next;
          switching = undefined;
        }
        scheduler.stop();
        gate?.stop();
        return;
      case "setIntensity":
        levels = scheduleLevel(levels, message.level, nextCycle(position()));
        heard("intensity", askedAt, (nextCycle(position()) - position()) / scheduler.cps);
        return;
      case "setVolume": {
        volume = message.gain;
        gate?.setVolume(message.gain, message.rampSeconds);
        return;
      }
      case "evaluate": {
        // The track the player hears; a switch not yet heard is dropped.
        const track = switching?.announced === true ? switching.next : playing;
        try {
          if (track === undefined) {
            throw new Error("nothing is playing to change");
          }
          const { pattern, cps, clock } = await compile(message.source, track.phraseCycles);
          clock.origin = track.clock.origin;
          switching = undefined;
          playing = { ...track, pattern, cps, clock };
          pins.reset();
          scheduler.setCps(cps);
          await schedule(pattern.late(clock.origin));
        } catch (error) {
          post({ ...describe(error), seq: message.seq });
          return;
        }
        heard("evaluate", askedAt, 0);
        post({ type: "evaluated", seq: message.seq });
        return;
      }
      case "ping":
        return;
      case "measure":
        measurement.start();
        return;
      case "audioStress":
        await startAudioStress(context, message.ms);
        return;
    }
  };

  // One message at a time, in order: a switch must not race the load
  // before it. The heartbeat is answered at once, outside the queue, so
  // the watchdog sees a hung thread and not a slow sample.
  let queue = Promise.resolve();
  addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent) {
      return;
    }
    const message = parseGameToHost(event.data);
    if (message === null) {
      return;
    }
    if (message.type === "ping") {
      post({ type: "pong", seq: message.seq });
      return;
    }
    // When it came in, not when its turn in the queue came: for `heard`.
    const askedAt = context.currentTime;
    queue = queue
      .then(() => handle(message, askedAt))
      .catch((error: unknown) => {
        post(describe(error));
      });
  });
  post({ type: "ready" });
}

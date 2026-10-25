import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { evaluate, transpiler } from "@strudel/transpiler";
import {
  getAudioContext,
  getSuperdoughAudioController,
  initAudio,
  registerSynthSounds,
  samples,
  webaudioRepl,
} from "@strudel/webaudio";

import {
  parseGameToHost,
  type GameToHost,
  type HostToGame,
  type HostTrack,
} from "../host-protocol.js";
import { samplesBaseUrl } from "../music-urls.js";
import {
  fadeGain,
  levelAt,
  nextBoundary,
  nextCycle,
  scheduleLevel,
  type LevelChange,
} from "./transitions.js";
import { makeLayer, type TrackClock } from "./layer.js";
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

export async function startEngine(): Promise<void> {
  const post = (message: HostToGame): void => {
    // The parent's origin cannot be named from an opaque origin; the
    // parent checks `event.source` instead.
    parent.postMessage(message, "*");
  };

  const timers = workerTimers();
  const repl = webaudioRepl({ transpiler, ...timers });
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
      initAudio().then(() => getAudioContext().resume()),
      AUDIO_START_MS,
      "the browser did not let music start",
    );
    const context = getAudioContext();
    // superdough → music bus → limiter → speakers (#366 §3.1).
    bus = context.createGain();
    bus.gain.value = volume;
    const limiter = context.createDynamicsCompressor();
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

  const schedule = async (pattern: core.Pattern): Promise<void> => {
    scheduled = pattern;
    await repl.setPattern(guarded(pattern), true);
  };

  /** Play `track` now, in place of anything playing or planned. */
  const load = async (track: HostTrack): Promise<void> => {
    const { pattern, cps, clock } = await compile(track.source, track.phraseCycles);
    await ensureAudio();
    clock.origin = scheduler.started ? Math.floor(position()) : 0;
    switching = undefined;
    playing = { trackId: track.trackId, pattern, phraseCycles: track.phraseCycles, cps, clock };
    scheduler.setCps(cps);
    await schedule(pattern.late(clock.origin));
    announce(playing);
  };

  /** A side of a crossfade: louder or quieter by cycle, and at the new tempo from `from`. */
  const faded = (
    pattern: core.Pattern,
    from: number,
    cycles: number,
    side: "in" | "out",
    cps: number,
  ): core.Pattern =>
    pattern.withHap((hap) => {
      const begin = hap.wholeOrPart().begin.valueOf();
      return hap.withValue((value) => {
        const fields = record(value);
        if (fields === null) {
          return value;
        }
        const velocity = typeof fields.velocity === "number" ? fields.velocity : 1;
        // A `cps` on an event changes the scheduler's tempo on its onset,
        // so the new tempo starts exactly on the boundary.
        return {
          ...fields,
          velocity: velocity * fadeGain(begin, from, cycles, side),
          ...(begin >= from ? { cps } : {}),
        };
      });
    });

  /**
   * Switch to `track` on the playing track's next phrase boundary, with
   * both playing for `cycles` while one fades out and the other in.
   */
  const crossfadeTo = async (track: HostTrack, cycles: number): Promise<void> => {
    if (playing === undefined || !scheduler.started) {
      await load(track);
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
    // What plays fades out, even if that is a crossfade still under way.
    const stacked = core.stack(
      faded(
        scheduled.filterHaps((hap) => hap.wholeOrPart().begin.valueOf() < until),
        from,
        cycles,
        "out",
        cps,
      ),
      faded(
        pattern.late(from).filterHaps((hap) => hap.wholeOrPart().begin.valueOf() >= from),
        from,
        cycles,
        "in",
        cps,
      ),
    );
    switching = { next, until, announced: false };
    await schedule(stacked);
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
      void schedule(planned.next.pattern.late(planned.next.clock.origin));
    }
  }, SWITCH_POLL_MS);

  const handle = async (message: GameToHost): Promise<void> => {
    switch (message.type) {
      case "load":
        await load(message);
        return;
      case "crossfadeTo":
        await crossfadeTo(message, message.cycles);
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
        return;
      case "setIntensity":
        levels = scheduleLevel(levels, message.level, nextCycle(position()));
        return;
      case "setVolume": {
        volume = message.gain;
        if (bus !== undefined) {
          const now = bus.context.currentTime;
          bus.gain.cancelScheduledValues(now);
          bus.gain.setValueAtTime(bus.gain.value, now);
          bus.gain.linearRampToValueAtTime(volume, now + message.rampSeconds);
        }
        return;
      }
      case "evaluate": {
        // The track the player hears; a switch not yet heard is dropped.
        const track = switching?.announced === true ? switching.next : playing;
        if (track === undefined) {
          throw new Error("nothing is playing to change");
        }
        const { pattern, cps, clock } = await compile(message.source, track.phraseCycles);
        clock.origin = track.clock.origin;
        switching = undefined;
        playing = { ...track, pattern, cps, clock };
        scheduler.setCps(cps);
        await schedule(pattern.late(clock.origin));
        post({ type: "evaluated" });
        return;
      }
      case "ping":
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
    queue = queue
      .then(() => handle(message))
      .catch((error: unknown) => {
        post(describe(error));
      });
  });
  post({ type: "ready" });
}

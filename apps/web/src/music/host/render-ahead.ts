import type * as core from "@strudel/core";
import {
  getAudioContext,
  getSuperdoughAudioController,
  initAudio,
  setAudioContext,
  setSuperdoughAudioController,
  superdough,
} from "@strudel/webaudio";

import type { MusicLevel } from "../host-protocol.js";
import { isTempoMark } from "./crossfade.js";
import {
  chunkOf,
  jobKey,
  nextRender,
  stale,
  type RenderJob,
  type RenderPlan,
} from "./render-plan.js";
import { nextBoundary, nextCycle } from "./transitions.js";

/**
 * Render-ahead (#509, spike, ADR-0028): the music rendered ahead of the
 * audio clock in an `OfflineAudioContext`, which has no deadline, and
 * played live as buffers. The live graph is then a few
 * `AudioBufferSourceNode`s, gains and the bus limiter, however heavy the
 * track. Only behind `?musicrender=ahead` in a stress build: if adopted it
 * replaces the live engine, it does not sit beside it.
 */

/** Cycles per chunk: the unit one render covers. */
const CHUNK_CYCLES = 4;
/** What a chunk renders past its slot: the 6 s room (`MUSIC_ROOMS`), and a release. */
const TAIL_SECONDS = 7;
/** How long a level or voice change ramps, so it does not click. */
const RAMP_SECONDS = 0.05;
/** How soon a buffer that is ready late may start: never in the past. */
const START_MARGIN_SECONDS = 0.02;
/*
 * superdough 1.3.0 pools filters, compressors and supersaws module-wide,
 * not per context, so an event may be handed a node from an earlier
 * render, and connecting it throws `InvalidAccessError`. The voice it
 * started is silent, connected to nothing that sounds, and the failed try
 * took the stale node out of the pool. So before a render, silent probes
 * empty the pools our tracks use; an earlier render may still release
 * nodes after it has ended, so an event that meets one empties them again
 * and is tried again. Not a patch
 * to Strudel, which ADR-0028 rules out.
 */
/** One silent event per pool our tracks draw from: a filter, a supersaw. */
const PROBES = [
  { s: "sine", cutoff: 1000, gain: 0 },
  { s: "supersaw", gain: 0 },
] as const;
/** Tries per probe: a pool holds about one node per voice a render played. */
const MAX_PROBES = 4096;
/** Tries per event, each after emptying the pools again. */
const MAX_TRIES = 8;
/** The worker clock's beat the main-thread stall is measured against. */
const STALL_BEAT_MS = 20;
/** How often the player looks for work when there is none. */
const POLL_MS = 100;

const PLAN: RenderPlan = { chunkCycles: CHUNK_CYCLES, aheadChunks: 3, neighbourChunks: 2 };

/**
 * What the spike reports, beside the protocol: the game ignores these, and
 * scripts/music-stress.mjs reads them off the window.
 */
export type RenderReport =
  /** One chunk rendered, and the audio buffers alive after it. */
  | {
      readonly type: "rendered";
      readonly trackId: string;
      readonly chunk: number;
      readonly level: MusicLevel;
      readonly audioSeconds: number;
      readonly wallMs: number;
      readonly liveBytes: number;
      readonly peakBytes: number;
      /** The longest the main thread was held at once since the last chunk. */
      readonly maxStallMs: number;
      /** Stale pooled nodes the probes and the events took (`PROBES`, `MAX_TRIES`). */
      readonly retries: number;
      /** Events that still failed, and are missing from the chunk. */
      readonly failed: number;
    }
  /** How long after it was asked for a change is heard. */
  | {
      readonly type: "heard";
      readonly change: "load" | "switch" | "evaluate" | "intensity";
      readonly delayMs: number;
    };

/** A compiled track, as the engine hands it over. */
export interface RenderTrack {
  readonly trackId: string;
  readonly pattern: core.Pattern;
  readonly cps: number;
  readonly phraseCycles: number;
}

export interface RenderAheadDeps {
  readonly context: AudioContext;
  /** The music bus, before the limiter: made once audio has started. */
  readonly bus: () => GainNode;
  /** Run `query` with `INTENSITY` and `layer()` reading `level`. */
  readonly withLevel: <T>(level: MusicLevel, query: () => T) => T;
  /** The reverb pin the live path applies to every event (`reverb-pins.ts`). */
  readonly pin: (value: unknown) => unknown;
  readonly report: (report: RenderReport) => void;
  readonly setTimeout: (callback: () => void, ms: number) => void;
  /** Call `callback` every `ms`, on a clock the main thread does not hold up. */
  readonly every: (callback: () => void, ms: number) => void;
}

interface Chunk {
  readonly job: RenderJob;
  /** `undefined` for a chunk that was ready only after its slot and tail had passed. */
  readonly source: AudioBufferSourceNode | undefined;
  readonly bytes: number;
}

/** One track as it plays from rendered chunks. */
interface Voice {
  readonly track: RenderTrack;
  /** Context time of the track's cycle 0; unset until its first chunk is ready. */
  start: number | undefined;
  /** Where its start is placed once the first chunk is ready. */
  readonly place: () => number;
  /** The track cycle it is first heard from: earlier chunks are not rendered. */
  from: number;
  /** The track cycle it is no longer heard after, once a switch replaces it. */
  until: number;
  readonly output: GainNode;
  readonly levels: readonly GainNode[];
  readonly chunks: Map<string, Chunk>;
  /** The change it was made for, and when that was asked for (context time). */
  readonly heard: { readonly change: "load" | "switch" | "evaluate"; readonly askedAt: number };
}

export interface RenderAheadPlayer {
  // `askedAt`: the context time the message came in, for `heard`.
  load(track: RenderTrack, askedAt: number): void;
  crossfadeTo(track: RenderTrack, cycles: number, askedAt: number): void;
  evaluate(track: RenderTrack, askedAt: number): void;
  setLevel(level: MusicLevel, askedAt: number): void;
  stop(): void;
  /** The cycle of the voice heard last, as `playing` reports it. */
  position(): number;
}

function staleNode(error: unknown): boolean {
  return error instanceof DOMException && error.name === "InvalidAccessError";
}

/** Empty superdough's pools of nodes from earlier renders; how many it took. */
async function drainPools(cps: number): Promise<number> {
  let taken = 0;
  for (const probe of PROBES) {
    for (let tries = 1; tries <= MAX_PROBES; tries += 1) {
      try {
        await superdough({ ...probe }, 0, 0.01, cps, 0);
        break;
      } catch (error) {
        if (!staleNode(error)) {
          throw error;
        }
        taken += 1;
      }
    }
  }
  return taken;
}

export function renderAhead(deps: RenderAheadDeps): RenderAheadPlayer {
  const { context } = deps;
  let voices: Voice[] = [];
  let level: MusicLevel = 0;
  /** A level change not yet heard: applied once its chunk is rendered. */
  let pendingLevel: { readonly level: MusicLevel; readonly askedAt: number } | undefined;
  let rendering = false;
  let peakBytes = 0;
  // How long the main thread was held at a time: the gap between beats of a
  // worker clock, less its period. Firefox has no long-task observer.
  let maxStallMs = 0;
  let lastBeat = performance.now();
  deps.every(() => {
    const now = performance.now();
    maxStallMs = Math.max(maxStallMs, now - lastBeat - STALL_BEAT_MS);
    lastBeat = now;
  }, STALL_BEAT_MS);

  const playhead = (voice: Voice): number =>
    voice.start === undefined
      ? voice.from - 1
      : (context.currentTime - voice.start) * voice.track.cps;
  const timeOf = (voice: Voice, cycle: number): number =>
    (voice.start ?? context.currentTime) + cycle / voice.track.cps;
  const liveBytes = (): number =>
    voices.reduce(
      (sum, voice) => sum + [...voice.chunks.values()].reduce((n, chunk) => n + chunk.bytes, 0),
      0,
    );

  const makeVoice = (
    track: RenderTrack,
    heard: Voice["heard"],
    place: () => number,
    from: number,
    gain: number,
  ): Voice => {
    const output = context.createGain();
    output.gain.value = gain;
    output.connect(deps.bus());
    const levels = [0, 1, 2, 3].map((n) => {
      const node = context.createGain();
      node.gain.value = n === level ? 1 : 0;
      node.connect(output);
      return node;
    });
    return {
      track,
      start: undefined,
      place,
      from,
      until: Number.POSITIVE_INFINITY,
      output,
      levels,
      chunks: new Map(),
      heard,
    };
  };

  const drop = (voice: Voice): void => {
    for (const chunk of voice.chunks.values()) {
      chunk.source?.stop();
      chunk.source?.disconnect();
    }
    voice.chunks.clear();
    voice.output.disconnect();
  };

  /** One chunk of `track` at `job.level`, rendered offline, onsets in order as superdough wants for `cut`. */
  const render = async (
    track: RenderTrack,
    job: RenderJob,
  ): Promise<{ buffer: AudioBuffer; retries: number; failed: number }> => {
    const begin = job.chunk * CHUNK_CYCLES;
    const end = begin + CHUNK_CYCLES;
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(((end - begin) / track.cps + TAIL_SECONDS) * context.sampleRate),
      context.sampleRate,
    );
    const live = getAudioContext();
    const liveController = getSuperdoughAudioController();
    setAudioContext(offline);
    setSuperdoughAudioController(null);
    try {
      await initAudio();
      let retries = await drainPools(track.cps);
      const haps = deps
        .withLevel(job.level, () => track.pattern.queryArc(begin, end, { _cps: track.cps }))
        .filter((hap) => hap.hasOnset() && !isTempoMark(hap.value))
        .sort((a, b) => a.wholeOrPart().begin.valueOf() - b.wholeOrPart().begin.valueOf());
      let failed = 0;
      for (const hap of haps) {
        const onset = (hap.wholeOrPart().begin.valueOf() - begin) / track.cps;
        hap.ensureObjectValue();
        const value = deps.pin(hap.value);
        for (let tries = 1; ; tries += 1) {
          try {
            await superdough(value, onset, hap.duration.valueOf() / track.cps, track.cps, onset);
            break;
          } catch (error) {
            if (!staleNode(error) || tries >= MAX_TRIES) {
              failed += 1;
              console.warn(
                `render-ahead: an event failed after ${String(tries)} tries: ${String(error)}`,
              );
              break;
            }
            // More of an earlier render's nodes came back: empty the pools again.
            retries += 1 + (await drainPools(track.cps));
          }
        }
      }
      return { buffer: await offline.startRendering(), retries, failed };
    } finally {
      setAudioContext(live);
      setSuperdoughAudioController(liveController);
    }
  };

  /** Play a rendered chunk where its slot falls, or from where the clock is if that has passed. */
  const play = (voice: Voice, job: RenderJob, buffer: AudioBuffer): void => {
    voice.start ??= voice.place();
    const when = timeOf(voice, job.chunk * CHUNK_CYCLES);
    const earliest = Math.max(
      context.currentTime + START_MARGIN_SECONDS,
      timeOf(voice, voice.from),
    );
    const at = Math.max(when, earliest);
    let source: AudioBufferSourceNode | undefined;
    if (at - when < buffer.duration) {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(voice.levels[job.level] ?? voice.output);
      source.start(at, at - when);
      if (Number.isFinite(voice.until)) {
        source.stop(timeOf(voice, voice.until) + RAMP_SECONDS);
      }
    }
    voice.chunks.set(jobKey(job), {
      job,
      source,
      bytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
    });
  };

  /** Hear `pendingLevel` on the next cycle of every voice whose chunk for it is ready. */
  const applyLevel = (): void => {
    const asked = pendingLevel;
    const voice = voices.at(-1);
    if (asked === undefined || voice?.start === undefined) {
      return;
    }
    const cycle = nextCycle(playhead(voice));
    if (!voice.chunks.has(jobKey({ chunk: chunkOf(cycle, CHUNK_CYCLES), level: asked.level }))) {
      return;
    }
    pendingLevel = undefined;
    for (const each of voices) {
      const at =
        each.start === undefined ? context.currentTime : timeOf(each, nextCycle(playhead(each)));
      each.levels.forEach((node, n) => {
        node.gain.setValueAtTime(node.gain.value, at);
        node.gain.linearRampToValueAtTime(n === asked.level ? 1 : 0, at + RAMP_SECONDS);
      });
    }
    deps.report({
      type: "heard",
      change: "intensity",
      delayMs: (timeOf(voice, cycle) - asked.askedAt) * 1000,
    });
  };

  const tailCycles = (voice: Voice): number => TAIL_SECONDS * voice.track.cps;

  /** Render what is wanted next, one chunk at a time, the newest voice first. */
  const pump = async (): Promise<void> => {
    if (rendering) {
      return;
    }
    rendering = true;
    try {
      for (;;) {
        for (const voice of voices) {
          for (const [key, chunk] of voice.chunks) {
            if (stale(PLAN, chunk.job, playhead(voice), tailCycles(voice))) {
              chunk.source?.disconnect();
              voice.chunks.delete(key);
            }
          }
        }
        const wanted = pendingLevel?.level ?? level;
        const work = [...voices]
          .reverse()
          .map((voice) => {
            const job = nextRender(
              PLAN,
              Math.max(playhead(voice), voice.from),
              wanted,
              new Set(voice.chunks.keys()),
            );
            return { voice, job };
          })
          .find(({ voice, job }) => job !== undefined && job.chunk * CHUNK_CYCLES < voice.until);
        if (work?.job === undefined) {
          return;
        }
        const { voice, job } = work;
        const began = performance.now();
        const { buffer, retries, failed } = await render(voice.track, job);
        const wallMs = performance.now() - began;
        if (!voices.includes(voice)) {
          continue;
        }
        const first = voice.start === undefined;
        play(voice, job, buffer);
        peakBytes = Math.max(peakBytes, liveBytes());
        deps.report({
          type: "rendered",
          trackId: voice.track.trackId,
          chunk: job.chunk,
          level: job.level,
          audioSeconds: buffer.duration,
          wallMs,
          liveBytes: liveBytes(),
          peakBytes,
          maxStallMs,
          retries,
          failed,
        });
        maxStallMs = 0;
        if (first) {
          deps.report({
            type: "heard",
            change: voice.heard.change,
            delayMs: (timeOf(voice, voice.from) - voice.heard.askedAt) * 1000,
          });
        }
        applyLevel();
      }
    } finally {
      rendering = false;
    }
  };

  const loop = (): void => {
    void pump().finally(() => {
      deps.setTimeout(loop, POLL_MS);
    });
  };
  loop();

  return {
    load(track, askedAt) {
      voices.forEach(drop);
      voices = [makeVoice(track, { change: "load", askedAt }, () => context.currentTime, 0, 1)];
    },
    crossfadeTo(track, cycles, askedAt) {
      const current = voices.at(-1);
      if (current?.start === undefined) {
        this.load(track, askedAt);
        return;
      }
      const boundary = nextBoundary(playhead(current), 0, current.track.phraseCycles);
      const at = timeOf(current, boundary);
      const fade = cycles / track.cps;
      current.until = boundary + cycles;
      current.output.gain.setValueAtTime(1, at);
      current.output.gain.linearRampToValueAtTime(0, at + Math.max(fade, RAMP_SECONDS));
      const next = makeVoice(track, { change: "switch", askedAt }, () => at, 0, 0);
      next.output.gain.setValueAtTime(0, at);
      next.output.gain.linearRampToValueAtTime(1, at + Math.max(fade, RAMP_SECONDS));
      // Older voices still fading are cut where this one lands.
      voices = [...voices.filter((voice) => voice === current), next];
      deps.setTimeout(
        () => {
          voices = voices.filter((voice) => {
            if (voice === current) {
              drop(voice);
              return false;
            }
            return true;
          });
        },
        (at + fade - context.currentTime) * 1000 + TAIL_SECONDS * 1000,
      );
    },
    evaluate(track, askedAt) {
      const current = voices.at(-1);
      if (current?.start === undefined) {
        this.load(track, askedAt);
        return;
      }
      const start = current.start;
      // The same clock: heard from the cycle after the first chunk is ready.
      const next = makeVoice(
        track,
        { change: "evaluate", askedAt },
        () => {
          const from = nextCycle((context.currentTime - start) * track.cps);
          next.from = from;
          current.until = from;
          const at = start + from / track.cps;
          current.output.gain.setValueAtTime(1, at);
          current.output.gain.linearRampToValueAtTime(0, at + RAMP_SECONDS);
          for (const chunk of current.chunks.values()) {
            chunk.source?.stop(at + RAMP_SECONDS);
          }
          deps.setTimeout(
            () => {
              drop(current);
              voices = voices.filter((voice) => voice !== current);
            },
            (at - context.currentTime + RAMP_SECONDS) * 1000 + POLL_MS,
          );
          return start;
        },
        nextCycle(playhead(current)),
        1,
      );
      voices = [current, next];
    },
    setLevel(next, askedAt) {
      level = next;
      pendingLevel = { level: next, askedAt };
      applyLevel();
    },
    stop() {
      voices.forEach(drop);
      voices = [];
      pendingLevel = undefined;
    },
    position() {
      const voice = voices.at(-1);
      return voice === undefined ? 0 : Math.max(0, playhead(voice));
    },
  };
}

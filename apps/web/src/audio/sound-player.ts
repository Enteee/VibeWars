import { CAST_VOICE_LIMIT, type CastVoice } from "./combat-sounds.js";
import { loadMuted } from "./mute-preference.js";
import { loadSfxVolume } from "./sfx-volume-preference.js";
import { SOUND_IDS, type SoundId } from "./sound-ids.js";
import { VOLUME_RAMP_SECONDS } from "./volume-ramp.js";

/**
 * Plays the combat sounds (#104, #112) through Web Audio, each buffer
 * decoded once, so a hit starts within a frame of its damage number rather
 * than whenever an `<audio>` element gets round to it (art-direction §Sound).
 *
 * The page has one, `soundPlayer()`: the context and the decoded buffers
 * outlive any one match, so a second match neither decodes everything
 * again nor opens a second AudioContext, of which a browser allows only a
 * few. It is never closed.
 */

export interface SoundPlayer {
  /** Play one sound now. Silent while muted, and until its buffer has decoded. */
  play(id: SoundId): void;
  /**
   * Play one cast's two layers together (#3298). At most `CAST_VOICE_LIMIT`
   * sound at once: past it, a voice that matters more cuts the one that
   * matters least, with a short fade, and one that matters less is dropped.
   */
  playCast(voice: CastVoice): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** 0 to 1, the player's sound effects volume (#424); a change ramps to it. */
  setVolume(volume: number): void;
  readonly volume: number;
}

/** One id plays at most this often, so a Barrage hitting five is one thwack (#54). */
export const SOUND_THROTTLE_MS = 60;

/** How long a cut cast voice fades out over, so it does not click. */
export const CAST_CUT_SECONDS = 0.03;

/** The output gain at full volume. */
export const MASTER_GAIN = 0.5;

/** Anything a node can be connected to. */
export type SoundSink = object;

/** The slice of Web Audio the player uses, so a test can hand it a fake. */
export interface SoundContext {
  readonly destination: SoundSink;
  readonly state: string;
  readonly currentTime: number;
  resume(): Promise<void>;
  createGain(): { readonly gain: SoundGain; connect(sink: SoundSink): unknown };
  createBufferSource(): {
    buffer: AudioBuffer | null;
    readonly playbackRate: { value: number };
    connect(sink: SoundSink): unknown;
    start(): void;
    stop(when?: number): void;
  };
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer>;
}

/** The slice of an `AudioParam` the volume ramps. */
export interface SoundGain {
  value: number;
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface SoundPlayerDeps {
  /** Called once, on the first user gesture: autoplay policy blocks a context made earlier. */
  readonly createContext: () => SoundContext;
  readonly fetch: (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
  /** Milliseconds, for the throttle. */
  readonly now: () => number;
  /** Where the first gesture is heard: `window`. */
  readonly gestures: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** Whether a gesture already happened before this player existed. */
  readonly hasBeenActive: boolean;
  /** Where the sfx live, `import.meta.env.BASE_URL`, so a Pages subpath works (#103). */
  readonly baseUrl: string;
  readonly muted: boolean;
  /** 0 to 1. */
  readonly volume: number;
}

export function createWebAudioPlayer(deps: SoundPlayerDeps): SoundPlayer {
  let muted = deps.muted;
  let volume = deps.volume;
  let broken = false;
  let output: { context: SoundContext; sink: SoundSink; gain: SoundGain } | undefined;
  const buffers = new Map<SoundId, AudioBuffer>();
  const lastPlayed = new Map<SoundId, number>();
  /** The cast voices sounding, until `ends`, in context time. */
  let voices: {
    readonly priority: number;
    readonly ends: number;
    readonly gain: SoundGain;
    readonly sources: readonly { stop(when?: number): void }[];
  }[] = [];

  // Sound is a nicety: the first thing to go wrong says so once, and the
  // game carries on in silence rather than warning on every hit.
  const fail = (error: unknown): void => {
    if (!broken) {
      broken = true;
      console.warn("[sound] combat sounds are off:", error);
    }
  };

  const open = (): void => {
    if (output !== undefined || broken) {
      return;
    }
    try {
      const context = deps.createContext();
      const gain = context.createGain();
      gain.gain.value = MASTER_GAIN * volume;
      gain.connect(context.destination);
      output = { context, sink: gain, gain: gain.gain };
      for (const id of SOUND_IDS) {
        void load(context, id).catch(fail);
      }
    } catch (error) {
      fail(error);
    }
  };

  const load = async (context: SoundContext, id: SoundId): Promise<void> => {
    const response = await deps.fetch(`${deps.baseUrl}sfx/${id}.mp3`);
    if (!response.ok) {
      throw new Error(`sfx/${id}.mp3 did not load`);
    }
    buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()));
  };

  // A context opened outside a gesture can start suspended (Safari), so
  // each gesture resumes it until it runs; then there is no need to listen.
  const onGesture = (): void => {
    open();
    if (output === undefined || output.context.state === "running") {
      deps.gestures.removeEventListener("pointerdown", onGesture);
      deps.gestures.removeEventListener("keydown", onGesture);
      return;
    }
    output.context.resume().catch(fail);
  };

  if (deps.hasBeenActive) {
    open();
  }
  deps.gestures.addEventListener("pointerdown", onGesture);
  deps.gestures.addEventListener("keydown", onGesture);

  return {
    play(id) {
      const buffer = buffers.get(id);
      if (muted || broken || output === undefined || buffer === undefined) {
        return;
      }
      const now = deps.now();
      const last = lastPlayed.get(id);
      if (last !== undefined && now - last < SOUND_THROTTLE_MS) {
        return;
      }
      lastPlayed.set(id, now);
      try {
        const source = output.context.createBufferSource();
        source.buffer = buffer;
        source.connect(output.sink);
        source.start();
      } catch (error) {
        fail(error);
      }
    },
    playCast(voice) {
      const base = buffers.get(voice.base);
      const motif = buffers.get(voice.motif);
      if (muted || broken || output === undefined || base === undefined || motif === undefined) {
        return;
      }
      try {
        const { context, sink } = output;
        const now = context.currentTime;
        voices = voices.filter(({ ends }) => ends > now);
        if (voices.length >= CAST_VOICE_LIMIT) {
          const least = voices.reduce((a, b) => (b.priority > a.priority ? b : a));
          if (least.priority <= voice.priority) {
            return;
          }
          least.gain.cancelScheduledValues(now);
          least.gain.setValueAtTime(least.gain.value, now);
          least.gain.linearRampToValueAtTime(0, now + CAST_CUT_SECONDS);
          for (const source of least.sources) {
            source.stop(now + CAST_CUT_SECONDS);
          }
          voices = voices.filter((other) => other !== least);
        }
        const gain = context.createGain();
        gain.gain.value = voice.gain;
        gain.connect(sink);
        const sources = [
          { buffer: base, rate: 1 },
          { buffer: motif, rate: voice.rate },
        ].map(({ buffer, rate }) => {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = rate;
          source.connect(gain);
          source.start();
          return source;
        });
        const ends = now + Math.max(base.duration, motif.duration / voice.rate);
        voices.push({ priority: voice.priority, ends, gain: gain.gain, sources });
      } catch (error) {
        fail(error);
      }
    },
    setMuted(next) {
      muted = next;
    },
    get muted() {
      return muted;
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      if (output === undefined) {
        return;
      }
      try {
        // From where it is now, so a slider dragged mid-ramp does not jump.
        const { gain, context } = output;
        const now = context.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(MASTER_GAIN * volume, now + VOLUME_RAMP_SECONDS);
      } catch (error) {
        fail(error);
      }
    },
    get volume() {
      return volume;
    },
  };
}

let shared: SoundPlayer | undefined;

/** The page's one sound player, with the muting and volume the player chose last time. */
export function soundPlayer(): SoundPlayer {
  shared ??= createWebAudioPlayer({
    createContext: () => new AudioContext(),
    fetch: (url) => fetch(url),
    now: () => performance.now(),
    gestures: window,
    // Joining a match is a click, usually made before this first runs.
    hasBeenActive: "userActivation" in navigator && navigator.userActivation.hasBeenActive,
    baseUrl: import.meta.env.BASE_URL,
    muted: loadMuted(),
    volume: loadSfxVolume(),
  });
  return shared;
}

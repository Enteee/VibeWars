import { loadMuted } from "./mute-preference.js";
import { SOUND_IDS, type SoundId } from "./sound-ids.js";

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
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

/** One id plays at most this often, so a Barrage hitting five is one thwack (#54). */
export const SOUND_THROTTLE_MS = 60;

const MASTER_GAIN = 0.5;

/** Anything a node can be connected to. */
export type SoundSink = object;

/** The slice of Web Audio the player uses, so a test can hand it a fake. */
export interface SoundContext {
  readonly destination: SoundSink;
  createGain(): { readonly gain: { value: number }; connect(sink: SoundSink): unknown };
  createBufferSource(): {
    buffer: AudioBuffer | null;
    connect(sink: SoundSink): unknown;
    start(): void;
  };
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer>;
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
}

export function createWebAudioPlayer(deps: SoundPlayerDeps): SoundPlayer {
  let muted = deps.muted;
  let broken = false;
  let output: { context: SoundContext; sink: SoundSink } | undefined;
  const buffers = new Map<SoundId, AudioBuffer>();
  const lastPlayed = new Map<SoundId, number>();

  // Sound is a nicety: the first thing to go wrong says so once, and the
  // game carries on in silence rather than warning on every hit.
  const fail = (error: unknown): void => {
    if (!broken) {
      broken = true;
      console.warn("[sound] combat sounds are off:", error);
    }
  };

  const open = (): void => {
    deps.gestures.removeEventListener("pointerdown", open);
    deps.gestures.removeEventListener("keydown", open);
    if (output !== undefined || broken) {
      return;
    }
    try {
      const context = deps.createContext();
      const gain = context.createGain();
      gain.gain.value = MASTER_GAIN;
      gain.connect(context.destination);
      output = { context, sink: gain };
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

  if (deps.hasBeenActive) {
    open();
  } else {
    deps.gestures.addEventListener("pointerdown", open);
    deps.gestures.addEventListener("keydown", open);
  }

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
    setMuted(next) {
      muted = next;
    },
    get muted() {
      return muted;
    },
  };
}

let shared: SoundPlayer | undefined;

/** The page's one sound player, with the muting the player chose last time. */
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
  });
  return shared;
}

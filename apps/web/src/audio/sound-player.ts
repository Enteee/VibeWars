import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { SOUND_IDS, type SoundId } from "./sound-ids.js";

/**
 * Plays the combat sounds (#112) through Web Audio, each buffer decoded
 * once, so a hit starts within a frame of its damage number rather than
 * whenever an `<audio>` element gets round to it (art-direction §Sound).
 *
 * One per page, like the skill tooltip: the context and the decoded
 * buffers outlive any one match, so entering a second match neither
 * decodes everything again nor opens a second AudioContext, of which a
 * browser allows only a few.
 */

export interface SoundPlayer {
  /** Play one sound now, unless muted. Silent until its buffer has loaded. */
  play(id: SoundId): void;
  isMuted(): boolean;
  /** Mute or unmute, remembered for this deploy. */
  setMuted(muted: boolean): void;
}

const MUTED_KEY = `${STORAGE_NAMESPACE}.soundMuted`;

/** Whether the player muted the game last time. Unreadable storage means not muted. */
function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // A convenience: the toggle still works for this session.
  }
}

function createSoundPlayer(): SoundPlayer {
  let muted = loadMuted();
  const buffers = new Map<SoundId, AudioBuffer>();
  // A browser without Web Audio still plays the game, in silence.
  const context = typeof AudioContext === "undefined" ? undefined : new AudioContext();

  if (context !== undefined) {
    for (const id of SOUND_IDS) {
      void fetch(`${import.meta.env.BASE_URL}sfx/${id}.mp3`)
        .then((response) => response.arrayBuffer())
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          buffers.set(id, buffer);
        })
        .catch((error: unknown) => {
          console.warn(`[sound] ${id} did not load:`, error);
        });
    }
  }

  return {
    play(id) {
      const buffer = buffers.get(id);
      if (muted || context === undefined || buffer === undefined) {
        return;
      }
      // Created before the player clicked anything, a context starts
      // suspended; by the time a match plays a sound, they have.
      if (context.state === "suspended") {
        void context.resume();
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    },
    isMuted() {
      return muted;
    },
    setMuted(next) {
      muted = next;
      saveMuted(next);
    },
  };
}

let shared: SoundPlayer | undefined;

/** The page's one sound player, created on first use. */
export function soundPlayer(): SoundPlayer {
  shared ??= createSoundPlayer();
  return shared;
}

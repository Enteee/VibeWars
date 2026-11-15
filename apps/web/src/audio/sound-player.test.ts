import { afterEach, describe, expect, it, vi } from "vitest";

import { CAST_VOICE_LIMIT, type CastVoice } from "./combat-sounds.js";
import { SOUND_IDS } from "./sound-ids.js";
import { VOLUME_RAMP_SECONDS } from "./volume-ramp.js";
import {
  CAST_CUT_SECONDS,
  MASTER_GAIN,
  SOUND_THROTTLE_MS,
  createWebAudioPlayer,
  type SoundContext,
  type SoundGain,
  type SoundPlayerDeps,
} from "./sound-player.js";

/** A gain that records its ramps as `[value, time]`. */
function fakeGain(): SoundGain & { ramps: [number, number][] } {
  const gain = {
    value: 1,
    ramps: [] as [number, number][],
    cancelScheduledValues: () => undefined,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: (value: number, time: number) => {
      gain.ramps.push([value, time]);
    },
  };
  return gain;
}

/**
 * A context that counts the sounds started and resumes, and decodes or
 * fails on demand. Its first gain is the output; each cast voice's after
 * it is in `voices`, and `stopped` counts the sources stopped.
 */
function fakeContext(decode: () => Promise<AudioBuffer>): SoundContext & {
  started: number;
  stopped: number;
  resumed: number;
  state: string;
  currentTime: number;
  output: ReturnType<typeof fakeGain>;
  voices: ReturnType<typeof fakeGain>[];
} {
  const output = fakeGain();
  const context = {
    started: 0,
    stopped: 0,
    resumed: 0,
    state: "running",
    currentTime: 3,
    output,
    voices: [] as ReturnType<typeof fakeGain>[],
    outputMade: false,
    resume: () => {
      context.resumed += 1;
      context.state = "running";
      return Promise.resolve();
    },
    destination: {},
    createGain: () => {
      const gain = context.outputMade ? fakeGain() : output;
      if (context.outputMade) {
        context.voices.push(gain);
      }
      context.outputMade = true;
      return { gain, connect: () => undefined };
    },
    createBufferSource: () => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect: () => undefined,
      start: () => {
        context.started += 1;
      },
      stop: () => {
        context.stopped += 1;
      },
    }),
    decodeAudioData: decode,
  };
  return context;
}

const decoded = (): Promise<AudioBuffer> => Promise.resolve({ duration: 0.1 } as AudioBuffer);

const fetched = (): ReturnType<SoundPlayerDeps["fetch"]> =>
  Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });

/** Every pending fetch and decode, settled. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<SoundPlayerDeps> = {}, decode = decoded) {
  const context = fakeContext(decode);
  let now = 1000;
  const gestures = new EventTarget();
  const createContext = vi.fn(() => context);
  const player = createWebAudioPlayer({
    createContext,
    fetch: fetched,
    now: () => now,
    gestures,
    hasBeenActive: true,
    baseUrl: "/",
    muted: false,
    volume: 1,
    ...overrides,
  });
  return {
    player,
    context,
    gestures,
    createContext,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createWebAudioPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays one sound per id within the throttle window, and the next after it", async () => {
    const { player, context, advance } = setup();
    await settle();

    player.play("hit-dealt");
    advance(SOUND_THROTTLE_MS - 1);
    player.play("hit-dealt");
    expect(context.started).toBe(1);

    advance(1);
    player.play("hit-dealt");
    expect(context.started).toBe(2);
  });

  it("throttles each id on its own", async () => {
    const { player, context } = setup();
    await settle();
    player.play("hit-dealt");
    player.play("death");
    expect(context.started).toBe(2);
  });

  it("plays a cast's two layers as one voice, and past the limit cuts the voice that matters least (#3298)", async () => {
    const { player, context } = setup();
    await settle();
    const voice = (priority: number): CastVoice => ({
      base: "cast-base-monk",
      motif: "cast-motif-spell",
      rate: 1.1,
      gain: 0.5,
      priority,
    });
    for (const priority of [3, 2, 2.5]) {
      player.playCast(voice(priority));
    }
    expect(context.started).toBe(2 * CAST_VOICE_LIMIT);

    player.playCast(voice(4));
    expect(context.started).toBe(2 * CAST_VOICE_LIMIT);

    player.playCast(voice(0));
    expect(context.started).toBe(2 * CAST_VOICE_LIMIT + 2);
    expect(context.stopped).toBe(2);
    expect(context.voices[0]?.ramps).toEqual([[0, context.currentTime + CAST_CUT_SECONDS]]);
  });

  it("frees a cast voice once it has played out", async () => {
    const { player, context } = setup();
    await settle();
    const voice: CastVoice = {
      base: "cast-base-monk",
      motif: "cast-motif-spell",
      rate: 1,
      gain: 1,
      priority: 2,
    };
    for (let at = 0; at < CAST_VOICE_LIMIT; at += 1) {
      player.playCast(voice);
    }
    context.currentTime += 0.2;
    player.playCast({ ...voice, priority: 3 });
    expect(context.started).toBe(2 * (CAST_VOICE_LIMIT + 1));
    expect(context.stopped).toBe(0);
  });

  it("starts no sound while muted, and plays again once unmuted", async () => {
    const { player, context } = setup({ muted: true });
    await settle();
    expect(player.muted).toBe(true);
    player.play("heal");
    expect(context.started).toBe(0);

    player.setMuted(false);
    player.play("heal");
    expect(context.started).toBe(1);
  });

  it("opens at the saved volume, and ramps the gain to each new one", () => {
    const { player, context } = setup({ volume: 0.4 });
    expect(player.volume).toBe(0.4);
    expect(context.output.value).toBeCloseTo(MASTER_GAIN * 0.4);

    player.setVolume(0.8);
    player.setVolume(0);
    expect(player.volume).toBe(0);
    expect(context.output.ramps).toEqual([
      [MASTER_GAIN * 0.8, 3 + VOLUME_RAMP_SECONDS],
      [0, 3 + VOLUME_RAMP_SECONDS],
    ]);
  });

  it("keeps a volume set before the first gesture for when the context opens", () => {
    const { player, context, gestures } = setup({ hasBeenActive: false });
    player.setVolume(0.25);
    gestures.dispatchEvent(new Event("pointerdown"));
    expect(context.output.value).toBeCloseTo(MASTER_GAIN * 0.25);
    expect(context.output.ramps).toEqual([]);
  });

  it("drops a sound asked for before its buffer has decoded", async () => {
    const { player, context } = setup();
    player.play("heal");
    await settle();
    expect(context.started).toBe(0);
  });

  it("decodes every sound once, from the base path", async () => {
    const urls: string[] = [];
    setup({
      baseUrl: "/VibeWars/next/",
      fetch: (url) => {
        urls.push(url);
        return fetched();
      },
    });
    await settle();
    expect(urls).toEqual(SOUND_IDS.map((id) => `/VibeWars/next/sfx/${id}.mp3`));
  });

  it("waits for the first gesture before it opens a context", async () => {
    const { player, context, gestures, createContext } = setup({ hasBeenActive: false });
    await settle();
    player.play("heal");
    expect(createContext).not.toHaveBeenCalled();

    gestures.dispatchEvent(new Event("keydown"));
    gestures.dispatchEvent(new Event("pointerdown"));
    await settle();
    player.play("heal");
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.started).toBe(1);
  });

  it("resumes a context that opened suspended on the next gesture", async () => {
    const { context, gestures } = setup();
    context.state = "suspended";
    gestures.dispatchEvent(new Event("pointerdown"));
    expect(context.resumed).toBe(1);
    gestures.dispatchEvent(new Event("pointerdown"));
    gestures.dispatchEvent(new Event("keydown"));
    expect(context.resumed).toBe(1);
    await settle();
  });

  it("warns once when decoding fails, and stays silent after", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { player, context } = setup({}, () => Promise.reject(new Error("not an mp3")));
    await settle();
    for (const id of SOUND_IDS) {
      player.play(id);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(context.started).toBe(0);
  });

  it("warns once and stays silent without Web Audio", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { player } = setup({
      createContext: () => {
        throw new Error("no AudioContext");
      },
    });
    await settle();
    player.play("heal");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { SOUND_IDS } from "./sound-ids.js";
import {
  SOUND_THROTTLE_MS,
  createWebAudioPlayer,
  type SoundContext,
  type SoundPlayerDeps,
} from "./sound-player.js";

/** A context that counts the sounds started, and decodes or fails on demand. */
function fakeContext(decode: () => Promise<AudioBuffer>): SoundContext & { started: number } {
  const context = {
    started: 0,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => undefined,
      start: () => {
        context.started += 1;
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

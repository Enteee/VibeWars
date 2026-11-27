import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WEAPON_MOTION } from "../render/weapon-pose.js";
import {
  createCosmeticsPreview,
  nextBeat,
  swingFrame,
  type Beat,
  type PreviewHost,
} from "./cosmetics-preview.js";
import { FakeElement } from "./fake-dom.test-support.js";
import { professionIcon } from "./icons.js";

/** A repeatable stream in [0, 1) from `seed` (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A page whose frames run only when the test says, and are counted. */
function fakeHost(): PreviewHost & {
  readonly pending: Map<number, (now: number) => void>;
  tick(now: number): void;
  hidden: boolean;
  readonly visibility: (() => void)[];
} {
  const pending = new Map<number, (now: number) => void>();
  const visibility: (() => void)[] = [];
  let next = 1;
  const host = {
    pending,
    visibility,
    hidden: false,
    requestFrame: (callback: (now: number) => void) => {
      pending.set(next, callback);
      next += 1;
      return next - 1;
    },
    cancelFrame: (handle: number) => {
      pending.delete(handle);
    },
    reducedMotion: () => false,
    random: seeded(1),
    visible: () => !host.hidden,
    onVisibility: (listener: () => void) => {
      visibility.push(listener);
      return () => {
        visibility.splice(visibility.indexOf(listener), 1);
      };
    },
    tick: (now: number) => {
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) {
        callback(now);
      }
    },
  };
  return host;
}

describe("the cosmetics preview (#3989)", () => {
  beforeEach(() => {
    // A canvas with no 2D context: the loop runs, and paints nothing.
    vi.stubGlobal("document", {
      createElement: () => Object.assign(new FakeElement(), { getContext: () => null }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const preview = (host: PreviewHost) =>
    createCosmeticsPreview(
      () => ({}),
      Promise.resolve(undefined),
      () => ({ name: "Aria", guildTag: null }),
      host,
    );

  it("asks for a frame after each frame while started, and none once stopped", () => {
    const host = fakeHost();
    const shown = preview(host);
    expect(host.pending.size).toBe(0);
    shown.start();
    expect(host.pending.size).toBe(1);
    host.tick(16);
    host.tick(32);
    expect(host.pending.size).toBe(1);
    shown.stop();
    expect(host.pending.size).toBe(0);
    expect(host.visibility).toHaveLength(0);
  });

  it("sleeps while the page is hidden and wakes when it is shown", () => {
    const host = fakeHost();
    const shown = preview(host);
    shown.start();
    host.hidden = true;
    for (const listener of host.visibility) {
      listener();
    }
    expect(host.pending.size).toBe(0);
    host.hidden = false;
    for (const listener of host.visibility) {
      listener();
    }
    expect(host.pending.size).toBe(1);
    shown.stop();
  });

  it("names the player on its nameplate", () => {
    const host = fakeHost();
    const shown = preview(host);
    shown.start();
    host.tick(16);
    const plate = (shown.element as unknown as FakeElement).all("cosmetics-preview-plate")[0];
    expect(plate?.all("player-label-name")[0]?.textContent).toBe("Aria");
    shown.stop();
  });

  it("wanders: never one kind twice running, an attack every four beats, turning about", () => {
    const random = seeded(7);
    const beats: Beat[] = [];
    for (let i = 0; i < 20; i += 1) {
      beats.push(nextBeat(beats, random, 0.6));
    }
    expect(new Set(beats.map((beat) => beat.facing)).size).toBeGreaterThanOrEqual(3);
    beats.slice(1).forEach((beat, i) => {
      expect(beat.kind).not.toBe(beats[i]?.kind);
    });
    for (let i = 0; i + 4 <= beats.length; i += 1) {
      expect(
        beats.slice(i, i + 4).some((beat) => beat.kind === "swing" || beat.kind === "cast"),
      ).toBe(true);
    }
    expect(beats.some((beat) => beat.kind === "swing")).toBe(true);
  });

  it("never swings with no weapon, and still casts every four beats", () => {
    const random = seeded(11);
    const beats: Beat[] = [];
    for (let i = 0; i < 40; i += 1) {
      beats.push(nextBeat(beats, random, 0));
    }
    expect(beats.some((beat) => beat.kind === "swing")).toBe(false);
    for (let i = 0; i + 4 <= beats.length; i += 1) {
      expect(beats.slice(i, i + 4).some((beat) => beat.kind === "cast")).toBe(true);
    }
  });

  it("swings through wind-up, strike, hold and recovery, then rests", () => {
    const m = WEAPON_MOTION.sword;
    expect(swingFrame(m, m.windUp / 2).clip.phase).toBe("wind-up");
    expect(swingFrame(m, m.windUp + m.strike / 2).clip.phase).toBe("strike");
    expect(swingFrame(m, m.windUp + m.strike + m.hold / 2).clip.phase).toBe("hold");
    expect(swingFrame(m, m.windUp + m.strike + m.hold + m.recover / 2).clip.phase).toBe("recover");
    expect(swingFrame(m, m.windUp + m.strike + m.hold + m.recover + 0.01).clip.phase).toBe("rest");
  });
});

describe("the cosmetics preview, painted (#4177)", () => {
  /** Where the trail was drawn from each frame: the body's walked position, negated. */
  let origins: string[];
  beforeEach(() => {
    origins = [];
    // A 2D context that takes every call; `translate` noted, as the trail is laid by it.
    const context: object = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "translate"
            ? (x: number, y: number) => {
                origins.push(`${x.toFixed(3)},${y.toFixed(3)}`);
              }
            : () => context,
        set: () => true,
      },
    );
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("document", {
      createElement: () =>
        Object.assign(new FakeElement(), {
          getContext: () => context,
          clientWidth: 160,
          clientHeight: 200,
          width: 0,
          height: 0,
        }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const run = (reducedMotion: boolean): { readonly drawn: number } => {
    let drawn = 0;
    const host = {
      ...fakeHost(),
      reducedMotion: () => reducedMotion,
      random: () => {
        drawn += 1;
        return 0.3;
      },
    };
    const shown = createCosmeticsPreview(
      () => ({}),
      Promise.resolve(undefined),
      () => ({ name: "Aria", guildTag: null }),
      host,
    );
    shown.start();
    for (let now = 0; now < 6000; now += 50) {
      host.tick(now);
    }
    shown.stop();
    return { drawn };
  };

  it("walks about, its trail falling behind", () => {
    expect(run(false).drawn).toBeGreaterThan(0);
    expect(new Set(origins).size).toBeGreaterThan(1);
  });

  it("stands still under reduced motion: no beat drawn, never moving", () => {
    expect(run(true).drawn).toBe(0);
    expect(origins.length).toBeGreaterThan(0);
    expect(new Set(origins)).toEqual(new Set(["0.000,0.000"]));
  });

  it("wears the profession set on it", async () => {
    const loaded: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(value: string) {
          loaded.push(value);
        }
        decode(): Promise<void> {
          return Promise.resolve();
        }
      },
    );
    const shown = createCosmeticsPreview(
      () => ({}),
      Promise.resolve(undefined),
      () => ({ name: "Aria", guildTag: null }),
      fakeHost(),
    );
    shown.setProfessions("monk", "warrior");
    await Promise.resolve();
    expect(loaded).toEqual([professionIcon("monk")]);
  });
});

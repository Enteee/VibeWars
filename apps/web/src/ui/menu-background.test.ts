import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RANDOM_MAP } from "./menu-background-choice.js";
import { FIRST_FRAME_CAP_MS, MENU_FADE_MS, createMenuBackground } from "./menu-background.js";
import type { SplashFight, SplashFightOptions } from "./splash-fight.js";

/** The menu background's layer: only its test hooks are read, and its fade durations set. */
const layer = (): HTMLElement =>
  ({ dataset: {}, style: { setProperty: () => undefined } }) as unknown as HTMLElement;

/** Whether the player asks for reduced motion; read through the query the code keeps. */
let reducedMotion = false;
const matchMedia = (): { readonly matches: boolean } => ({
  get matches() {
    return reducedMotion;
  },
});

/** A canvas that is only listened to. */
const canvas = (): HTMLCanvasElement =>
  ({
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as HTMLCanvasElement;

/** A fight that draws at once, logging every start and stop. */
const fights = (): {
  readonly log: string[];
  readonly start: (parent: HTMLElement, fight: SplashFightOptions) => Promise<SplashFight>;
} => {
  const log: string[] = [];
  return {
    log,
    start: (_parent, fight) => {
      const name = `${fight.mapId}@${String(fight.teamSize)}`;
      log.push(`start ${name}`);
      return Promise.resolve({
        canvas: canvas(),
        stop: () => {
          log.push(`stop ${name}`);
          return Promise.resolve();
        },
        firstFrame: Promise.resolve(),
      });
    },
  };
};

describe("the menu background (#3119)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { matchMedia });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not start until resumed, then fights Random at 8v8", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    expect(log).toEqual([]);
    expect(await background.resume("away")).toBe(true);
    expect(log).toHaveLength(1);
    expect(root.dataset.teamSize).toBe("8");
  });

  it("keeps the fight for the same choice, and restarts it for another map or size", async () => {
    const { log, start } = fights();
    const background = createMenuBackground(layer(), start);
    await background.resume("away");
    background.setChoice({ mapId: RANDOM_MAP, teamSize: 8 });
    await background.resume("away");
    expect(log).toHaveLength(1);

    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume("away");
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);

    background.setChoice({ mapId: "jungle-ruins", teamSize: 8 });
    await background.resume("away");
    expect(log.slice(3)).toEqual(["stop jungle-ruins@4", "start jungle-ruins@8"]);
  });

  it("stops the old fight before the next starts, and starts only the last of a burst", async () => {
    const { log, start } = fights();
    const background = createMenuBackground(layer(), start);
    await background.resume("away");
    background.setChoice({ mapId: "jungle-ruins", teamSize: 1 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 2 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume("away");
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);
  });

  it("is gone for a match and back after it, on the same choice", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume("away");
    background.suspend("away");
    await vi.waitFor(() => {
      expect(root.dataset.map).toBeUndefined();
    });
    expect(await background.resume("away")).toBe(true);
    expect(log).toEqual(["start jungle-ruins@4", "stop jungle-ruins@4", "start jungle-ruins@4"]);
    expect(root.dataset.map).toBe("jungle-ruins");
  });

  it("stays gone until every reason is over, and a new fight has a new id", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume("away");
    expect(root.dataset.fight).toBe("1");
    background.suspend("training");
    background.suspend("away");
    expect(await background.resume("away")).toBe(false);
    expect(root.dataset.fight).toBeUndefined();
    expect(await background.resume("training")).toBe(true);
    expect(root.dataset.fight).toBe("2");
    expect(log).toEqual(["start jungle-ruins@4", "stop jungle-ruins@4", "start jungle-ruins@4"]);
  });

  it("starts the next fight only once the old one's context is released", async () => {
    const log: string[] = [];
    let release: (() => void) | undefined;
    const start = (_parent: HTMLElement, fight: SplashFightOptions): Promise<SplashFight> => {
      log.push(`start ${fight.mapId}`);
      return Promise.resolve({
        canvas: canvas(),
        stop: () =>
          new Promise<void>((resolve) => {
            release = () => {
              log.push("released");
              resolve();
            };
          }),
        firstFrame: Promise.resolve(),
      });
    };
    const background = createMenuBackground(layer(), start);
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume("away");
    background.setChoice({ mapId: "ember-pits", teamSize: 4 });
    const restarted = background.resume("away");
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    expect(log).toEqual(["start jungle-ruins"]);
    release?.();
    expect(await restarted).toBe(true);
    expect(log).toEqual(["start jungle-ruins", "released", "start ember-pits"]);
  });

  it("says nothing and draws nothing where the fight cannot start, and does not retry it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const start = vi.fn(() => Promise.reject(new Error("no WebGL")));
    const root = layer();
    const background = createMenuBackground(root, start);
    expect(await background.resume("away")).toBe(false);
    expect(await background.resume("away")).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    expect(root.dataset.map).toBeUndefined();
  });
});

describe("the menu background's fades (#3131)", () => {
  /** Fights whose first frame is drawn only when `draw` is called. */
  const slowFights = (): {
    readonly log: string[];
    readonly draw: () => void;
    readonly start: (parent: HTMLElement, fight: SplashFightOptions) => Promise<SplashFight>;
  } => {
    const log: string[] = [];
    let drawn: () => void = () => undefined;
    return {
      log,
      draw: () => {
        drawn();
      },
      start: (_parent, fight) => {
        const name = `${fight.mapId}@${String(fight.teamSize)}`;
        log.push(`start ${name}`);
        return Promise.resolve({
          canvas: canvas(),
          stop: () => {
            log.push(`stop ${name}`);
            return Promise.resolve();
          },
          firstFrame: new Promise<void>((resolve) => {
            drawn = resolve;
          }),
        });
      },
    };
  };

  beforeEach(() => {
    reducedMotion = false;
    vi.useFakeTimers();
    vi.stubGlobal("window", { matchMedia });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays hidden until its first frame is drawn", async () => {
    const { draw, start } = slowFights();
    const root = layer();
    const background = createMenuBackground(root, start);
    const resumed = background.resume("away");
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_CAP_MS - 1);
    expect(root.dataset.map).toBeDefined();
    expect(root.dataset.shown).toBeUndefined();
    draw();
    expect(await resumed).toBe(true);
    expect(root.dataset.shown).toBe("");
  });

  it("shows a fight that never draws after the cap", async () => {
    const { start } = slowFights();
    const root = layer();
    const background = createMenuBackground(root, start);
    const resumed = background.resume("away");
    await vi.advanceTimersByTimeAsync(FIRST_FRAME_CAP_MS);
    expect(await resumed).toBe(true);
    expect(root.dataset.shown).toBe("");
  });

  it("fades the old fight out before it stops it", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    await background.resume("away");
    expect(root.dataset.shown).toBe("");
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.dataset.shown).toBeUndefined();
    expect(log).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MENU_FADE_MS.out - 1);
    expect(log).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);
    expect(root.dataset.shown).toBe("");
  });

  it("starts only the last of a burst, each start after a stop", async () => {
    const { log, draw, start } = slowFights();
    const root = layer();
    const background = createMenuBackground(root, start);
    const first = background.resume("away");
    await vi.advanceTimersByTimeAsync(0);
    draw();
    await first;
    background.setChoice({ mapId: "jungle-ruins", teamSize: 1 });
    await vi.advanceTimersByTimeAsync(MENU_FADE_MS.out);
    background.setChoice({ mapId: "jungle-ruins", teamSize: 2 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await vi.advanceTimersByTimeAsync(0);
    draw();
    await vi.advanceTimersByTimeAsync(MENU_FADE_MS.out);
    expect(log.filter((line) => line.startsWith("start ")).slice(1)).toEqual([
      expect.stringMatching(/@1$/),
      "start jungle-ruins@4",
    ]);
    log.forEach((line, at) => {
      if (at > 0 && line.startsWith("start ")) {
        expect(log[at - 1]).toMatch(/^stop /);
      }
    });
    expect(root.dataset.teamSize).toBe("4");
    expect(root.dataset.shown).toBe("");
  });

  it("does not wait to fade under reduced motion", async () => {
    reducedMotion = true;
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    await background.resume("away");
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    expect(await background.resume("away")).toBe(true);
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);
    expect(root.dataset.shown).toBe("");
  });
});

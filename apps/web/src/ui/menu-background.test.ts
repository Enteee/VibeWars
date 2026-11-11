import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RANDOM_MAP } from "./menu-background-choice.js";
import { createMenuBackground } from "./menu-background.js";
import type { SplashFightOptions } from "./splash-fight.js";

/** The menu background's layer: only its test hooks are read. */
const layer = (): HTMLElement =>
  ({ dataset: {}, querySelector: () => null }) as unknown as HTMLElement;

/** A fight that draws at once, logging every start and stop. */
const fights = (): {
  readonly log: string[];
  readonly start: (parent: HTMLElement, fight: SplashFightOptions) => Promise<() => void>;
} => {
  const log: string[] = [];
  return {
    log,
    start: (_parent, fight) => {
      const name = `${fight.mapId}@${String(fight.teamSize)}`;
      log.push(`start ${name}`);
      return Promise.resolve(() => {
        log.push(`stop ${name}`);
      });
    },
  };
};

describe("the menu background (#3119)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not start until resumed, then fights Random at 8v8", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    expect(log).toEqual([]);
    expect(await background.resume()).toBe(true);
    expect(log).toHaveLength(1);
    expect(root.dataset.teamSize).toBe("8");
  });

  it("keeps the fight for the same choice, and restarts it for another map or size", async () => {
    const { log, start } = fights();
    const background = createMenuBackground(layer(), start);
    await background.resume();
    background.setChoice({ mapId: RANDOM_MAP, teamSize: 8 });
    await background.resume();
    expect(log).toHaveLength(1);

    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume();
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);

    background.setChoice({ mapId: "jungle-ruins", teamSize: 8 });
    await background.resume();
    expect(log.slice(3)).toEqual(["stop jungle-ruins@4", "start jungle-ruins@8"]);
  });

  it("stops the old fight before the next starts, and starts only the last of a burst", async () => {
    const { log, start } = fights();
    const background = createMenuBackground(layer(), start);
    await background.resume();
    background.setChoice({ mapId: "jungle-ruins", teamSize: 1 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 2 });
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume();
    expect(log.slice(1)).toEqual([expect.stringMatching(/^stop /), "start jungle-ruins@4"]);
  });

  it("is gone for a match and back after it, on the same choice", async () => {
    const { log, start } = fights();
    const root = layer();
    const background = createMenuBackground(root, start);
    background.setChoice({ mapId: "jungle-ruins", teamSize: 4 });
    await background.resume();
    background.suspend();
    await vi.waitFor(() => {
      expect(root.dataset.map).toBeUndefined();
    });
    expect(await background.resume()).toBe(true);
    expect(log).toEqual(["start jungle-ruins@4", "stop jungle-ruins@4", "start jungle-ruins@4"]);
    expect(root.dataset.map).toBe("jungle-ruins");
  });

  it("says nothing and draws nothing where the fight cannot start, and does not retry it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const start = vi.fn(() => Promise.reject(new Error("no WebGL")));
    const root = layer();
    const background = createMenuBackground(root, start);
    expect(await background.resume()).toBe(false);
    expect(await background.resume()).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    expect(root.dataset.map).toBeUndefined();
  });
});

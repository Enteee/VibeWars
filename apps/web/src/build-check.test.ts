import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RELOAD_COUNTDOWN_SECONDS,
  createBuildWatch,
  isStaleChunkError,
  parseBuildFile,
  type BuildBanner,
  type BuildWatchOptions,
  type ReloadMemory,
} from "./build-check.js";

/** A session store the watch reads, or one that throws as a denied one does. */
function memory(denied = false): ReloadMemory & { value: string | undefined } {
  const store = {
    value: undefined as string | undefined,
    load() {
      if (denied) {
        throw new Error("denied");
      }
      return store.value;
    },
    save(id: string) {
      if (denied) {
        throw new Error("denied");
      }
      store.value = id;
    },
  };
  return store;
}

interface Harness {
  readonly shown: (BuildBanner | undefined)[];
  readonly reloads: number[];
  served: string | undefined;
  idle: boolean;
  readonly options: BuildWatchOptions;
}

function harness(reloadedFor: ReloadMemory = memory()): Harness {
  const h: Harness = {
    shown: [],
    reloads: [],
    served: "abc",
    idle: true,
    options: {
      current: "abc",
      fetchLatest: () => Promise.resolve(h.served),
      idle: () => h.idle,
      reloadedFor,
      reload: () => {
        h.reloads.push(Date.now());
      },
      show: (banner) => {
        h.shown.push(banner);
      },
    },
  };
  return h;
}

const last = (h: Harness): BuildBanner | undefined => h.shown.at(-1);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the served build file (#1268)", () => {
  it("reads the id, and nothing else as one", () => {
    expect(parseBuildFile({ build: "f00d" })).toBe("f00d");
    expect(parseBuildFile({ build: "" })).toBeUndefined();
    expect(parseBuildFile({ build: 3 })).toBeUndefined();
    expect(parseBuildFile("<!doctype html>")).toBeUndefined();
    expect(parseBuildFile(null)).toBeUndefined();
  });
});

describe("a lazy import that failed (#1268)", () => {
  it("is told apart in each browser's words", () => {
    for (const message of [
      "error loading dynamically imported module: https://x/assets/arena-scene-BD7V1erG.js",
      "Failed to fetch dynamically imported module: https://x/assets/phaser-1.js",
      "Importing a module script failed.",
    ]) {
      expect(isStaleChunkError(new TypeError(message))).toBe(true);
    }
    expect(isStaleChunkError(new Error("no WebGL"))).toBe(false);
    expect(isStaleChunkError("dynamically imported module")).toBe(false);
  });
});

describe("watching for a newer build (#1268)", () => {
  it("shows nothing while the served id is this one", async () => {
    const h = harness();
    await createBuildWatch(h.options).check();
    expect(h.shown).toEqual([]);
  });

  it("takes a build file it cannot read for no news, not a newer build", async () => {
    const h = harness();
    h.served = undefined;
    await createBuildWatch(h.options).check();
    vi.advanceTimersByTime(60_000);
    expect(h.shown).toEqual([]);
    expect(h.reloads).toEqual([]);
  });

  it("counts down on an idle screen and reloads at 0, remembering the id", async () => {
    const reloadedFor = memory();
    const h = harness(reloadedFor);
    h.served = "def";
    await createBuildWatch(h.options).check();
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });
    vi.advanceTimersByTime((RELOAD_COUNTDOWN_SECONDS - 1) * 1000);
    expect(last(h)).toEqual({ kind: "countdown", seconds: 1 });
    expect(h.reloads).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(h.reloads).toHaveLength(1);
    expect(reloadedFor.value).toBe("def");
  });

  it("only waits on a busy screen, and starts the countdown afresh on the menu", async () => {
    const h = harness();
    h.served = "def";
    h.idle = false;
    await createBuildWatch(h.options).check();
    vi.advanceTimersByTime(5 * 60_000);
    expect(last(h)).toEqual({ kind: "waiting" });
    expect(h.reloads).toEqual([]);
    h.idle = true;
    vi.advanceTimersByTime(1000);
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });
    vi.advanceTimersByTime(10_000);
    h.idle = false;
    vi.advanceTimersByTime(1000);
    h.idle = true;
    vi.advanceTimersByTime(1000);
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });
  });

  it("reloads by itself at most once per id: after that, only Reload now", async () => {
    const reloadedFor = memory();
    reloadedFor.value = "def";
    const h = harness(reloadedFor);
    h.served = "def";
    await createBuildWatch(h.options).check();
    vi.advanceTimersByTime(5 * 60_000);
    expect(h.shown).toEqual([{ kind: "manual" }]);
    expect(h.reloads).toEqual([]);
  });

  it("counts down again for a newer id than the one it reloaded for", async () => {
    const reloadedFor = memory();
    reloadedFor.value = "def";
    const h = harness(reloadedFor);
    h.served = "ghi";
    await createBuildWatch(h.options).check();
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });
  });

  it("never reloads by itself when it cannot remember that it did", async () => {
    const h = harness(memory(true));
    h.served = "def";
    await createBuildWatch(h.options).check();
    vi.advanceTimersByTime(5 * 60_000);
    expect(h.shown).toEqual([{ kind: "manual" }]);
    expect(h.reloads).toEqual([]);
  });

  it("stays quiet for the id Not now was pressed on, until a newer one or a failed chunk", async () => {
    const h = harness();
    h.served = "def";
    const watch = createBuildWatch(h.options);
    await watch.check();
    watch.dismiss();
    expect(last(h)).toBeUndefined();
    await watch.check();
    vi.advanceTimersByTime(5 * 60_000);
    expect(last(h)).toBeUndefined();
    expect(h.reloads).toEqual([]);

    await watch.chunkFailed();
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });

    watch.dismiss();
    h.served = "ghi";
    await watch.check();
    expect(last(h)).toEqual({ kind: "countdown", seconds: RELOAD_COUNTDOWN_SECONDS });
  });

  it("remembers a Reload now as a reload for the id", async () => {
    const reloadedFor = memory();
    const h = harness(reloadedFor);
    h.served = "def";
    const watch = createBuildWatch(h.options);
    await watch.check();
    watch.reloadNow();
    expect(h.reloads).toHaveLength(1);
    expect(reloadedFor.value).toBe("def");
  });
});

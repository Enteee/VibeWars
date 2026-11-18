import type { MatchReplay } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { KEPT_REPLAYS, ReplayStore } from "./replays.js";
import {
  REPLAY_DATE_STORE,
  REPLAY_STORE,
  createMemoryStore,
  type KeyValueStore,
} from "./repository.js";

function replay(seed: string): MatchReplay {
  return {
    buildHash: "test-build",
    seed,
    map: "Test Arena",
    teamCount: 2,
    mode: "random-arena",
    ticks: 2,
    inputs: [[1, "intent", "player-1", { kind: "stop" }]],
  };
}

describe("ReplayStore (#3572)", () => {
  it("keeps the newest 50: the 51st prunes the oldest", async () => {
    let now = 0;
    const replays = new ReplayStore(createMemoryStore(), () => (now += 1));
    for (let i = 0; i <= KEPT_REPLAYS; i += 1) {
      await replays.keep({ hash: `hash-${String(i)}`, replay: replay(`seed-${String(i)}`) });
    }
    const kept = await replays.list();
    expect(KEPT_REPLAYS).toBe(50);
    expect(kept).toHaveLength(50);
    expect(kept[0]).toEqual({ hash: "hash-50", replay: replay("seed-50") });
    expect(kept.map(({ hash }) => hash)).not.toContain("hash-0");
    expect(kept.map(({ hash }) => hash)).toContain("hash-1");
  });

  it("keeps one replay once, however often it comes", async () => {
    const replays = new ReplayStore(createMemoryStore());
    await replays.keep({ hash: "same", replay: replay("seed") });
    await replays.keep({ hash: "same", replay: replay("seed") });
    expect(await replays.list()).toHaveLength(1);
  });

  it("deletes a record that is not a replay, or has no date (ADR-0016)", async () => {
    const store = createMemoryStore();
    const replays = new ReplayStore(store);
    await store.put(REPLAY_STORE, "no-date", replay("seed"));
    await store.put(REPLAY_STORE, "not-a-replay", { seed: 3 });
    await store.put(REPLAY_DATE_STORE, "not-a-replay", 1);
    await store.put(REPLAY_DATE_STORE, "bad-date", "yesterday");
    await replays.keep({ hash: "good", replay: replay("seed") });
    expect(await replays.list()).toEqual([{ hash: "good", replay: replay("seed") }]);
    expect((await store.list(REPLAY_STORE)).map(({ key }) => key)).toEqual(["good"]);
    expect((await store.list(REPLAY_DATE_STORE)).map(({ key }) => key)).toEqual(["good"]);
  });

  it("prunes by the dates alone, never reading a replay (perf-sec-qa on #3592)", async () => {
    const store = createMemoryStore();
    const read: string[] = [];
    const watched: KeyValueStore = {
      ...store,
      get: (name, key) => {
        read.push(name);
        return store.get(name, key);
      },
      list: (name) => {
        read.push(name);
        return store.list(name);
      },
    };
    let now = 0;
    const replays = new ReplayStore(watched, () => (now += 1));
    for (let i = 0; i <= KEPT_REPLAYS; i += 1) {
      await replays.keep({ hash: `hash-${String(i)}`, replay: replay(`seed-${String(i)}`) });
    }
    expect(read).not.toContain(REPLAY_STORE);
    expect(await store.list(REPLAY_STORE)).toHaveLength(KEPT_REPLAYS);
  });
});

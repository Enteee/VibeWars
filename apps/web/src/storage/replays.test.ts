import type { MatchReplay } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { KEPT_REPLAYS, ReplayStore } from "./replays.js";
import { REPLAY_STORE, createMemoryStore } from "./repository.js";

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

  it("deletes a record that is not a replay (ADR-0016)", async () => {
    const store = createMemoryStore();
    const replays = new ReplayStore(store);
    await store.put(REPLAY_STORE, "no-envelope", { replay: replay("seed") });
    await store.put(REPLAY_STORE, "not-a-replay", { keptAt: 1, replay: { seed: 3 } });
    await replays.keep({ hash: "good", replay: replay("seed") });
    expect(await replays.list()).toEqual([{ hash: "good", replay: replay("seed") }]);
    expect((await store.list(REPLAY_STORE)).map(({ key }) => key)).toEqual(["good"]);
  });
});

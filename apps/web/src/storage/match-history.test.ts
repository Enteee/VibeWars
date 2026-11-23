import type { WireEnded, WireMatchChart, WireSummaryRow, WireTeam } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  KEPT_MATCHES,
  MatchHistoryStore,
  parseMatchRecord,
  type MatchRecord,
} from "./match-history.js";
import { MATCH_HISTORY_STORE, createMemoryStore } from "./repository.js";

function row(id: string, team: WireTeam): WireSummaryRow {
  return {
    id,
    name: id,
    guildTag: null,
    heroRank: 0,
    team,
    signet: null,
    damage: 100,
    healing: 20,
    taken: 80,
    kills: 1,
    deaths: 0,
    interrupts: 0,
  };
}

const ENDED: WireEnded = {
  winningTeam: 0,
  endReason: "annihilation",
  summary: [row("me", 0), row("foe", 1)],
  clearSeconds: null,
};

const CHART: WireMatchChart = {
  period: 5,
  players: ["me", "foe"].map((id) => ({
    id,
    dealt: [0, 50],
    taken: [0, 40],
    healed: [0, 10],
    health: [100, 60],
    energy: [80, 30],
  })),
  events: [{ t: 7, kind: "death", id: "foe", by: "me" }],
  dropped: 0,
};

function record(id: string, endedAt: number, playerKey = "key-a"): MatchRecord {
  return {
    id,
    endedAt,
    mapId: "ember-pits",
    mode: "hosted-game",
    teamCount: 2,
    selfId: "me",
    playerKey,
    selfTeam: 0,
    bots: ["foe"],
    ended: ENDED,
    chart: CHART,
  };
}

describe("MatchHistoryStore (#3848)", () => {
  it("lists what it keeps, newest first, as it was kept", async () => {
    const history = new MatchHistoryStore(createMemoryStore());
    await history.add(record("old", 1));
    await history.add({ ...record("new", 2, "key-b"), chart: null });
    expect(await history.list()).toEqual([
      { ...record("new", 2, "key-b"), chart: null },
      record("old", 1),
    ]);
  });

  it("keeps the newest 50: the 51st prunes the oldest", async () => {
    const history = new MatchHistoryStore(createMemoryStore());
    for (let i = 0; i <= KEPT_MATCHES; i += 1) {
      await history.add(record(`match-${String(i)}`, 1000 + i));
    }
    const kept = await history.list();
    expect(KEPT_MATCHES).toBe(50);
    expect(kept).toHaveLength(50);
    expect(kept[0]?.id).toBe("match-50");
    expect(kept.map(({ id }) => id)).not.toContain("match-0");
    expect(kept.map(({ id }) => id)).toContain("match-1");
  });

  it("deletes a record of the wrong shape on list (ADR-0016)", async () => {
    const store = createMemoryStore();
    const history = new MatchHistoryStore(store);
    await history.add(record("good", 1));
    await store.put(MATCH_HISTORY_STORE, "stale", { ...record("stale", 2), ended: { winner: 0 } });
    expect((await history.list()).map(({ id }) => id)).toEqual(["good"]);
    expect((await store.list(MATCH_HISTORY_STORE)).map(({ key }) => key)).toEqual(["good"]);
  });
});

describe("parseMatchRecord (#3848)", () => {
  it("takes a record through storage's JSON", () => {
    expect(parseMatchRecord(JSON.parse(JSON.stringify(record("a", 1))))).toEqual(record("a", 1));
  });

  it.each([
    ["an unknown mode", { mode: "chess" }],
    ["a team past the team count", { selfTeam: 2 }],
    ["no player key", { playerKey: undefined }],
    ["a bot that is no id", { bots: [3] }],
    [
      "a chart of a stranger",
      { chart: { ...CHART, players: [{ ...CHART.players[0], id: "eve" }] } },
    ],
    ["no chart field", { chart: undefined }],
  ])("refuses %s", (_, change) => {
    expect(parseMatchRecord({ ...record("a", 1), ...change })).toBeUndefined();
  });
});

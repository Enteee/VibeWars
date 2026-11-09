import { describe, expect, it, vi } from "vitest";

import type { MatchRecord } from "@vibewars/game-session";

import type { MatchRecordWatchHandlers } from "../net/transport/match-records.js";
import { hallHolderOf, vaultLines, watchHall, type HallWatch } from "./vault-screen.js";

const player = (name: string, guildTag: string | null, bot = false) => ({
  name,
  guildTag,
  bot,
  pubkey: bot ? null : "a".repeat(64),
});

function record(
  winners: readonly ReturnType<typeof player>[],
  endedAt = 2_000,
  map = "hall-of-heroes-king",
): MatchRecord {
  return {
    v: 1,
    mode: "heroes-ascent",
    map,
    endedAt,
    durationSeconds: 600,
    winningTeam: 0,
    endReason: "score",
    teams: [{ players: winners }, { players: [player("Foe", null)] }],
  } as unknown as MatchRecord;
}

describe("vaultLines", () => {
  it("counts down to the next slot", () => {
    expect(vaultLines(720_000 * 10 - 65_000, undefined).countdown).toBe("The Hall opens in 1:05");
  });

  it("names the holder, or says there is none", () => {
    expect(vaultLines(0, "Ana").holder).toBe("Ana holds the Hall of Heroes");
    expect(vaultLines(0, undefined).holder).toBe("Nobody holds the Hall of Heroes");
  });
});

describe("hallHolderOf", () => {
  it("is the guild tag when more than half the party shares it", () => {
    const three = [player("A", "VW"), player("B", "VW"), player("C", null)];
    expect(hallHolderOf(record(three))).toBe("VW");
  });

  it("is the leader when exactly half share a tag, bots not counted", () => {
    const half = [player("A", "VW"), player("B", null), player("Bot", "VW", true)];
    expect(hallHolderOf(record(half))).toBe("A");
  });

  it("is nothing for a Hosted Game on a Hall map", () => {
    expect(hallHolderOf({ ...record([player("Ana", null)]), mode: "hosted-game" })).toBeUndefined();
  });

  it("is nothing for a draw or another map", () => {
    expect(hallHolderOf({ ...record([player("A", null)]), winningTeam: null })).toBeUndefined();
    expect(hallHolderOf(record([player("A", null)], 2_000, "the-courtyard"))).toBeUndefined();
  });
});

describe("watchHall", () => {
  function watched(): {
    hear: (one: MatchRecord) => void;
    announce: ReturnType<typeof vi.fn>;
    hall: HallWatch;
    opened: MatchRecordWatchHandlers[];
    closed: () => number;
    setNow: (ms: number) => void;
  } {
    const opened: MatchRecordWatchHandlers[] = [];
    let closes = 0;
    let at = 1_000_000;
    const announce = vi.fn();
    const hall = watchHall(
      (handlers) => {
        opened.push(handlers);
        return {
          close: () => {
            closes += 1;
          },
        };
      },
      () => at,
      announce,
      () => undefined,
    );
    at = 2_500_000;
    return {
      hear: (one) => {
        opened.at(-1)?.record({ id: String(one.endedAt), record: one });
      },
      announce,
      hall,
      opened,
      closed: () => closes,
      setNow: (ms) => {
        at = ms;
      },
    };
  }

  it("toasts a new Hall win once, and takes it as the holder", () => {
    const { hear, announce, hall } = watched();
    hear(record([player("Ana", null)]));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Ana holds the Hall of Heroes");
    expect(hall.holder()).toBe("Ana");
  });

  it("does not toast replayed history, but it still names the holder", () => {
    const { hear, announce, hall } = watched();
    hear(record([player("Old", null)], 500));
    expect(announce).not.toHaveBeenCalled();
    expect(hall.holder()).toBe("Old");
  });

  it("keeps the newest holder, in whatever order records arrive", () => {
    const { hear, hall } = watched();
    hear(record([player("New", null)], 900));
    hear(record([player("Old", null)], 500));
    expect(hall.holder()).toBe("New");
  });

  it("toasts at most one win a slot, however many are heard", () => {
    const { hear, announce, hall, setNow } = watched();
    for (let endedAt = 2_000; endedAt < 2_030; endedAt += 1) {
      hear(record([player(`Fake${String(endedAt)}`, null)], endedAt));
    }
    expect(announce).toHaveBeenCalledTimes(1);
    expect(hall.holder()).toBe("Fake2029");
    setNow(2_500_000 + 720_000);
    hear(record([player("Next", null)], 3_000));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("takes no holder from a win that ends in the future", () => {
    const { hear, announce, hall } = watched();
    hear(record([player("Now", null)], 2_000));
    hear(record([player("Ahead", null)], 2_500 + 31));
    expect(hall.holder()).toBe("Now");
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("leaves a host's slightly fast clock alone", () => {
    const { hear, hall } = watched();
    hear(record([player("Fast", null)], 2_500 + 29));
    expect(hall.holder()).toBe("Fast");
  });

  it("verifies only won Halls, on a small budget of its own", () => {
    const { opened } = watched();
    const filter = opened[0]?.filter;
    expect(filter?.wants(record([player("Ana", null)]))).toBe(true);
    expect(filter?.wants(record([player("Ana", null)], 2_000, "other"))).toBe(false);
    expect(filter?.verifyBurst).toBeLessThanOrEqual(5);
    expect(filter?.verifyPerSecond).toBeLessThanOrEqual(0.1);
  });

  it("is closed during a match, and on reopening treats the replay as history", () => {
    const { hear, announce, hall, opened, closed, setNow } = watched();
    hall.pause();
    hall.pause();
    expect(closed()).toBe(1);
    setNow(3_000_000);
    hall.resume();
    hall.resume();
    expect(opened).toHaveLength(2);
    hear(record([player("Meanwhile", null)], 2_800));
    expect(hall.holder()).toBe("Meanwhile");
    expect(announce).not.toHaveBeenCalled();
  });
});

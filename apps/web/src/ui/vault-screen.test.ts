import { describe, expect, it, vi } from "vitest";

import type { MatchRecord } from "@vibewars/game-session";

import type { MatchRecordWatchHandlers } from "../net/transport/match-records.js";
import { hallHolderOf, vaultLines, watchHall } from "./vault-screen.js";

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
    mode: "king-of-the-hill",
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

  it("is nothing for a draw or another map", () => {
    expect(hallHolderOf({ ...record([player("A", null)]), winningTeam: null })).toBeUndefined();
    expect(hallHolderOf(record([player("A", null)], 2_000, "the-courtyard"))).toBeUndefined();
  });
});

describe("watchHall", () => {
  function watched(): {
    hear: (one: MatchRecord) => void;
    announce: ReturnType<typeof vi.fn>;
    holder: () => string | undefined;
  } {
    let on: MatchRecordWatchHandlers | undefined;
    const announce = vi.fn();
    const hall = watchHall(
      (handlers) => {
        on = handlers;
        return { close: () => undefined };
      },
      1_000_000,
      announce,
      () => undefined,
    );
    return {
      hear: (one) => {
        on?.record({ id: String(one.endedAt), record: one });
      },
      announce,
      holder: hall.holder,
    };
  }

  it("toasts a new Hall win once, and takes it as the holder", () => {
    const { hear, announce, holder } = watched();
    hear(record([player("Ana", null)]));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Ana holds the Hall of Heroes");
    expect(holder()).toBe("Ana");
  });

  it("does not toast replayed history, but it still names the holder", () => {
    const { hear, announce, holder } = watched();
    hear(record([player("Old", null)], 500));
    expect(announce).not.toHaveBeenCalled();
    expect(holder()).toBe("Old");
  });

  it("keeps the newest holder, in whatever order records arrive", () => {
    const { hear, holder } = watched();
    hear(record([player("New", null)], 900));
    hear(record([player("Old", null)], 500));
    expect(holder()).toBe("New");
  });
});

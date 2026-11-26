import { RECONNECT_WINDOW_SECONDS } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { clearRejoinRecord, takeRejoinRecord, writeRejoinRecord } from "./rejoin-record.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  readonly items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const seat = {
  code: "amber-fox-12",
  hostId: "host-peer",
  matchId: "match-1",
  playerId: "player-1",
  lobbyToken: "lobby-secret",
  matchToken: "match-secret",
};

const WINDOW_MS = RECONNECT_WINDOW_SECONDS * 1000;

describe("the rejoin record (#4110)", () => {
  it("comes back as written, held for the reconnect window", () => {
    const storage = memoryStorage();
    writeRejoinRecord(seat, 1000, storage);
    expect(takeRejoinRecord(1000 + WINDOW_MS - 1, storage)).toEqual({
      ...seat,
      expiresAt: 1000 + WINDOW_MS,
    });
  });

  it("is taken once: the read deletes it", () => {
    const storage = memoryStorage();
    writeRejoinRecord(seat, 0, storage);
    expect(takeRejoinRecord(1, storage)).toBeDefined();
    expect(storage.items.size).toBe(0);
    expect(takeRejoinRecord(1, storage)).toBeUndefined();
  });

  it("is expired once the window is over, to be told once, and is deleted", () => {
    const storage = memoryStorage();
    writeRejoinRecord(seat, 0, storage);
    expect(takeRejoinRecord(WINDOW_MS, storage)).toBe("expired");
    expect(storage.items.size).toBe(0);
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["a field missing", JSON.stringify({ ...seat, matchToken: undefined, expiresAt: 9e15 })],
    ["an empty field", JSON.stringify({ ...seat, code: "", expiresAt: 9e15 })],
    ["a field of the wrong type", JSON.stringify({ ...seat, expiresAt: "9e15" })],
    ["a field too many", JSON.stringify({ ...seat, expiresAt: 9e15, extra: "x" })],
  ])("is deleted when malformed: %s", (_, raw) => {
    const storage = memoryStorage();
    writeRejoinRecord(seat, 0, storage);
    const [key] = [...storage.items.keys()];
    storage.items.set(key ?? "", raw);
    expect(takeRejoinRecord(1, storage)).toBeUndefined();
    expect(storage.items.size).toBe(0);
  });

  it("is gone once cleared", () => {
    const storage = memoryStorage();
    writeRejoinRecord(seat, 0, storage);
    clearRejoinRecord(storage);
    expect(takeRejoinRecord(1, storage)).toBeUndefined();
  });
});

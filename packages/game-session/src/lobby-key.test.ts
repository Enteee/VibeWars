import { beforeAll, describe, expect, it } from "vitest";

import { deriveLobbyRoom, publicRoom, type LobbyRoom } from "./lobby-key.js";

/** A lobby key's room (#1681, #2100, ADR-0048). */

/** Bytes 0..31 as a lobby key. */
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

/**
 * Computed once, outside `deriveLobbyRoom`, with Node's `hkdfSync` and
 * `createHmac`, and pinned. A public test vector of the test key above,
 * not a secret: hence the allowlist marks for ripsecrets.
 */
const PINNED = {
  roomId: "a3c32882a2cf3cd85f649defac795621bc898c5fa68af6b7478646f0014aa463",
  password: "7f28e9b9e340202be2baf634696ee6eb3c79b88e39dace609147f57ee15e8455", // pragma: allowlist secret
  proofKey: "8eb1e4e38d2ecffea58a40ab3616c189a7e417a1dc81bbf2f2dbe142c8b127b9", // pragma: allowlist secret
};

const hex = (bytes: Uint8Array | null): string =>
  Array.from(bytes ?? [], (byte) => byte.toString(16).padStart(2, "0")).join("");

describe("deriveLobbyRoom (#2100)", () => {
  let room: LobbyRoom;
  let other: LobbyRoom;

  beforeAll(async () => {
    // The same bytes but the last: one bit apart.
    [room, other] = await Promise.all([
      deriveLobbyRoom(KEY),
      deriveLobbyRoom(`${KEY.slice(0, -1)}w`),
    ]);
  });

  it("gives a known key's pinned room, password and proof key", () => {
    expect({ roomId: room.roomId, password: room.password, proofKey: hex(room.proofKey) }).toEqual(
      PINNED,
    );
  });

  it("keeps room, password and proof key apart", () => {
    expect(room.roomId).not.toBe(room.password);
    expect(hex(room.proofKey)).not.toBe(room.roomId);
    expect(hex(room.proofKey)).not.toBe(room.password);
  });

  it("says nothing of the key in what a transport reads", () => {
    for (const value of [room.roomId, room.password]) {
      expect(value).not.toContain(KEY);
    }
  });

  it("gives two keys two rooms", () => {
    expect(other.roomId).not.toBe(room.roomId);
    expect(other.password).not.toBe(room.password);
  });
});

describe("publicRoom (#1681)", () => {
  it("is a queue room as it is named, without a proof key", () => {
    expect(publicRoom("ra-abc")).toEqual({ roomId: "ra-abc", password: "ra-abc", proofKey: null });
  });
});

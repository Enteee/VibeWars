import { beforeAll, describe, expect, it } from "vitest";

import { deriveLobbyRoom, publicRoom, type LobbyRoom } from "./lobby-key.js";

/**
 * A lobby key's room (#1681, ADR-0043). Each derivation is 600 000
 * PBKDF2 rounds, so each key is derived once per file, not per case.
 */

const KEY = "ACDEFGHJKMNP";

/**
 * Computed once, outside `deriveLobbyRoom`, with Node's WebCrypto, and pinned.
 * A public test vector of the test key above, not a secret: hence the
 * allowlist marks for ripsecrets.
 */
const PINNED = {
  roomId: "6e0db01ff80f091566361fbbefe315be14b7fda08d944a903f316af4d11e53b9",
  password: "33e632e643199c563c14d3aa0867e96bf1b236c934873f1a12185deb15e5b41c", // pragma: allowlist secret
  proofKey: "c90ede4d1dba04474a8c84e5c6c5678d9004948f0ebcba3c34b2f009ae8146a3", // pragma: allowlist secret
  relayTopic: "db1162dc13f867c31c424572ceb90ad45a9e39869d7979f9694af11bbfdcee33",
  relayKey: "e86e8426b359c0762041ccd3a9be43f528544f81406cf0600ad5a62f879da1be", // pragma: allowlist secret
};

const hex = (bytes: Uint8Array | null): string =>
  Array.from(bytes ?? [], (byte) => byte.toString(16).padStart(2, "0")).join("");

describe("deriveLobbyRoom (#1681)", () => {
  let room: LobbyRoom;
  let typed: LobbyRoom;
  let other: LobbyRoom;

  beforeAll(async () => {
    [room, typed, other] = await Promise.all([
      deriveLobbyRoom(KEY),
      deriveLobbyRoom("acde-fghj-kmnp "),
      deriveLobbyRoom("ACDEFGHJKMNQ"),
    ]);
  }, 30_000);

  it("gives a known key's pinned room, password, proof key and relay topic and key (#2091)", () => {
    expect({
      roomId: room.roomId,
      password: room.password,
      proofKey: hex(room.proofKey),
      relayTopic: room.relay?.topic,
      relayKey: hex(room.relay?.key ?? null),
    }).toEqual(PINNED);
  });

  it("is the same for the key typed with dashes, spaces and in lower case", () => {
    expect(typed).toEqual(room);
  });

  it("keeps room, password and proof key apart", () => {
    expect(room.roomId).not.toBe(room.password);
    expect(hex(room.proofKey)).not.toBe(room.roomId);
    expect(hex(room.proofKey)).not.toBe(room.password);
  });

  it("keeps the relay topic apart from its key and from the room (#2091)", () => {
    expect(room.relay?.topic).not.toBe(hex(room.relay?.key ?? null));
    expect(room.relay?.topic).not.toBe(room.roomId);
  });

  it("gives two keys two relay topics and keys (#2091)", () => {
    expect(other.relay?.topic).not.toBe(room.relay?.topic);
    expect(hex(other.relay?.key ?? null)).not.toBe(hex(room.relay?.key ?? null));
  });

  it("says nothing of the key in what a transport reads", () => {
    for (const value of [room.roomId, room.password]) {
      expect(value).not.toContain(KEY);
      expect(value.toUpperCase()).not.toContain(KEY);
    }
  });

  it("gives two keys two rooms", () => {
    expect(other.roomId).not.toBe(room.roomId);
    expect(other.password).not.toBe(room.password);
  });
});

describe("publicRoom (#1681)", () => {
  it("is a queue room as it is named, without a proof key", () => {
    expect(publicRoom("ra-abc")).toEqual({
      roomId: "ra-abc",
      password: "ra-abc",
      proofKey: null,
      relay: null,
    });
  });
});

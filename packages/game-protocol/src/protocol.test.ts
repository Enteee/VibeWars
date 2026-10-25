import { describe, expect, it } from "vitest";

import {
  ADDRESS_LIMIT,
  CLIENT_LIMIT,
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  PROTOCOL_VERSION,
  RATE_LIMIT,
  ROOM_LIMIT,
  ROOM_MATCH,
  isLobbyCode,
  normalizeLobbyCode,
  parseClientIntent,
} from "./protocol.js";

describe("protocol constants", () => {
  it("pins a protocol version", () => {
    expect(PROTOCOL_VERSION).toBe(15);
  });

  it("gives every capacity refusal its own code (#282)", () => {
    const codes = [ROOM_LIMIT, CLIENT_LIMIT, RATE_LIMIT, ADDRESS_LIMIT];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("names the match room", () => {
    expect(ROOM_MATCH).toBe("match");
  });
});

describe("lobby code alphabet", () => {
  it("omits visually ambiguous characters", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L", "2", "Z", "5", "S", "8", "B", "U", "V"]) {
      expect(LOBBY_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("contains no duplicates", () => {
    expect(new Set(LOBBY_CODE_ALPHABET).size).toBe(LOBBY_CODE_ALPHABET.length);
  });

  it("is large enough to be worth using", () => {
    // 23^4 is ~280k codes, plenty for concurrent LAN lobbies.
    expect(LOBBY_CODE_ALPHABET.length).toBeGreaterThanOrEqual(20);
  });

  it("is upper-case alphanumeric only", () => {
    expect(/^[A-Z0-9]+$/.test(LOBBY_CODE_ALPHABET)).toBe(true);
  });
});

describe("normalizeLobbyCode", () => {
  it("upper-cases", () => {
    expect(normalizeLobbyCode("a7kq")).toBe("A7KQ");
  });

  it("strips whitespace and dashes", () => {
    expect(normalizeLobbyCode(" a7 - kq ")).toBe("A7KQ");
  });

  it("leaves an already-normal code alone", () => {
    expect(normalizeLobbyCode("A7KQ")).toBe("A7KQ");
  });
});

describe("isLobbyCode", () => {
  it("accepts a well-formed code", () => {
    const code = LOBBY_CODE_ALPHABET.slice(0, LOBBY_CODE_LENGTH);
    expect(isLobbyCode(code)).toBe(true);
  });

  it("rejects wrong lengths", () => {
    expect(isLobbyCode("ACD")).toBe(false);
    expect(isLobbyCode("ACDEF")).toBe(false);
    expect(isLobbyCode("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isLobbyCode("ACD0")).toBe(false);
    expect(isLobbyCode("ACDO")).toBe(false);
    expect(isLobbyCode("acde")).toBe(false);
  });

  it("rejects codes with separators before normalisation", () => {
    expect(isLobbyCode("A-CDE")).toBe(false);
    expect(isLobbyCode(normalizeLobbyCode("a-cde"))).toBe(true);
  });

  it("is not fooled by regex metacharacters or newlines", () => {
    expect(isLobbyCode("....")).toBe(false);
    expect(isLobbyCode("ACDE\nACDE")).toBe(false);
  });
});

describe("parseClientIntent", () => {
  it("accepts a well-formed stop intent", () => {
    expect(parseClientIntent({ kind: "stop" })).toEqual({ kind: "stop" });
  });

  it("accepts a well-formed move intent", () => {
    expect(parseClientIntent({ kind: "move", dirX: 1, dirY: -0.5 })).toEqual({
      kind: "move",
      dirX: 1,
      dirY: -0.5,
    });
  });

  it("ignores extra fields on an otherwise valid payload", () => {
    expect(parseClientIntent({ kind: "stop", extra: "whatever" })).toEqual({ kind: "stop" });
  });

  it("rejects primitives and null", () => {
    expect(parseClientIntent(null)).toBeUndefined();
    expect(parseClientIntent(undefined)).toBeUndefined();
    expect(parseClientIntent("move")).toBeUndefined();
    expect(parseClientIntent(42)).toBeUndefined();
    expect(parseClientIntent(true)).toBeUndefined();
  });

  it("rejects an unrecognized kind", () => {
    expect(parseClientIntent({ kind: "teleport", x: 0, y: 0 })).toBeUndefined();
    expect(parseClientIntent({})).toBeUndefined();
  });

  it("rejects a move intent with missing or wrong-typed fields", () => {
    expect(parseClientIntent({ kind: "move" })).toBeUndefined();
    expect(parseClientIntent({ kind: "move", dirX: 1 })).toBeUndefined();
    expect(parseClientIntent({ kind: "move", dirX: "1", dirY: 0 })).toBeUndefined();
    expect(parseClientIntent({ kind: "move", dirX: null, dirY: 0 })).toBeUndefined();
  });

  it("rejects non-finite move values a malicious client could send", () => {
    expect(parseClientIntent({ kind: "move", dirX: Number.NaN, dirY: 0 })).toBeUndefined();
    expect(
      parseClientIntent({ kind: "move", dirX: Number.POSITIVE_INFINITY, dirY: 0 }),
    ).toBeUndefined();
    expect(
      parseClientIntent({ kind: "move", dirX: Number.NEGATIVE_INFINITY, dirY: 0 }),
    ).toBeUndefined();
  });

  it("does accept a very large but finite magnitude (clamping is movement's job, not parsing's)", () => {
    expect(parseClientIntent({ kind: "move", dirX: 1e9, dirY: 0 })).toEqual({
      kind: "move",
      dirX: 1e9,
      dirY: 0,
    });
  });
});

describe("parseClientIntent — target", () => {
  it("accepts a target selection", () => {
    expect(parseClientIntent({ kind: "target", targetSessionId: "abc123" })).toEqual({
      kind: "target",
      targetSessionId: "abc123",
    });
  });

  it("accepts clearing the target with null", () => {
    expect(parseClientIntent({ kind: "target", targetSessionId: null })).toEqual({
      kind: "target",
      targetSessionId: null,
    });
  });

  it("rejects a target intent with a non-string, non-null id", () => {
    expect(parseClientIntent({ kind: "target", targetSessionId: 123 })).toBeUndefined();
    expect(parseClientIntent({ kind: "target", targetSessionId: undefined })).toBeUndefined();
    expect(parseClientIntent({ kind: "target" })).toBeUndefined();
  });
});

describe("parseClientIntent — attack", () => {
  it("accepts an attack on a target, and a cancel", () => {
    expect(parseClientIntent({ kind: "attack", targetId: "abc123" })).toEqual({
      kind: "attack",
      targetId: "abc123",
    });
    expect(parseClientIntent({ kind: "cancel" })).toEqual({ kind: "cancel" });
  });

  it("rejects the cancel-attack kind that cancel replaced (#300)", () => {
    expect(parseClientIntent({ kind: "cancel-attack" })).toBeUndefined();
  });

  it("rejects an attack without a real target id", () => {
    expect(parseClientIntent({ kind: "attack" })).toBeUndefined();
    expect(parseClientIntent({ kind: "attack", targetId: "" })).toBeUndefined();
    expect(parseClientIntent({ kind: "attack", targetId: 7 })).toBeUndefined();
    expect(parseClientIntent({ kind: "attack", targetId: null })).toBeUndefined();
  });

  it("rejects either with a field it does not name", () => {
    expect(parseClientIntent({ kind: "attack", targetId: "a", slot: 0 })).toBeUndefined();
    expect(parseClientIntent({ kind: "cancel", targetId: "a" })).toBeUndefined();
  });
});

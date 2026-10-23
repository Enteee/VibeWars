import { describe, expect, it } from "vitest";

import {
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  PROTOCOL_VERSION,
  ROOM_LOBBY,
  isLobbyCode,
  normalizeLobbyCode,
} from "./protocol.js";

describe("protocol constants", () => {
  it("pins a protocol version", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("names the lobby room", () => {
    expect(ROOM_LOBBY).toBe("lobby");
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

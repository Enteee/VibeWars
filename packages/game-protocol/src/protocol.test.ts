import { describe, expect, it } from "vitest";

import {
  COMPANION_MODES,
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  isLobbyCode,
  normalizeLobbyCode,
  parseClientIntent,
} from "./protocol.js";
import { PROTOCOL_VERSION, fingerprint } from "./protocol-version.js";

describe("protocol constants", () => {
  it("derives the protocol version from the wire schema", () => {
    expect(PROTOCOL_VERSION).toMatch(/^[0-9a-f]{12}$/);
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

  it("is 12 symbols, 23¹² ≈ 2⁵⁴ keys (#1681)", () => {
    expect(LOBBY_CODE_LENGTH).toBe(12);
    expect(LOBBY_CODE_ALPHABET.length ** LOBBY_CODE_LENGTH).toBeGreaterThan(2 ** 54);
  });

  it("rejects wrong lengths", () => {
    expect(isLobbyCode("ACDEFG")).toBe(false);
    expect(isLobbyCode("ACDEFGHJKMN")).toBe(false);
    expect(isLobbyCode("ACDEFGHJKMNPQ")).toBe(false);
    expect(isLobbyCode("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isLobbyCode("ACDEFGHJKMN0")).toBe(false);
    expect(isLobbyCode("ACDEFGHJKMNO")).toBe(false);
    expect(isLobbyCode("acdefghjkmnp")).toBe(false);
  });

  it("rejects keys with separators before normalisation", () => {
    expect(isLobbyCode("ACDE-FGHJ-KMNP")).toBe(false);
    expect(isLobbyCode(normalizeLobbyCode("acde-fghj-kmnp"))).toBe(true);
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

describe("parseClientIntent — walk-to (#310)", () => {
  it("accepts any finite point, off the map included: the server pulls it on", () => {
    expect(parseClientIntent({ kind: "walk-to", x: 120.5, y: 40 })).toEqual({
      kind: "walk-to",
      x: 120.5,
      y: 40,
    });
    expect(parseClientIntent({ kind: "walk-to", x: -1e6, y: 1e6 })).toEqual({
      kind: "walk-to",
      x: -1e6,
      y: 1e6,
    });
  });

  it("rejects NaN, Infinity, strings and missing coordinates", () => {
    expect(parseClientIntent({ kind: "walk-to", x: Number.NaN, y: 0 })).toBeUndefined();
    expect(
      parseClientIntent({ kind: "walk-to", x: 0, y: Number.POSITIVE_INFINITY }),
    ).toBeUndefined();
    expect(parseClientIntent({ kind: "walk-to", x: "1", y: 0 })).toBeUndefined();
    expect(parseClientIntent({ kind: "walk-to", x: 1 })).toBeUndefined();
  });

  it("rejects a field it does not name", () => {
    expect(parseClientIntent({ kind: "walk-to", x: 1, y: 2, z: 3 })).toBeUndefined();
  });
});

describe("parseClientIntent — weapon-set (#489)", () => {
  it("accepts sets 0 to 3", () => {
    for (const set of [0, 1, 2, 3]) {
      expect(parseClientIntent({ kind: "weapon-set", set })).toEqual({ kind: "weapon-set", set });
    }
  });

  it("rejects a set out of range, fractional, a string, missing, or with a field it does not name", () => {
    for (const set of [4, -1, 1.5, "1", null, NaN]) {
      expect(parseClientIntent({ kind: "weapon-set", set })).toBeUndefined();
    }
    expect(parseClientIntent({ kind: "weapon-set" })).toBeUndefined();
    expect(parseClientIntent({ kind: "weapon-set", set: 1, slot: 2 })).toBeUndefined();
  });
});

describe("parseClientIntent — drop-bundle (#1225)", () => {
  it("accepts the bare kind, and nothing with a field it does not name", () => {
    expect(parseClientIntent({ kind: "drop-bundle" })).toEqual({ kind: "drop-bundle" });
    expect(parseClientIntent({ kind: "drop-bundle", targetId: "flag/0" })).toBeUndefined();
  });
});

describe("parseClientIntent — end-upkeep (#838)", () => {
  it("accepts a target and a status id", () => {
    expect(parseClientIntent({ kind: "end-upkeep", targetId: "p2", status: "mending" })).toEqual({
      kind: "end-upkeep",
      targetId: "p2",
      status: "mending",
    });
  });

  it("rejects non-string, empty, overlong and missing ids", () => {
    expect(
      parseClientIntent({ kind: "end-upkeep", targetId: 2, status: "mending" }),
    ).toBeUndefined();
    expect(parseClientIntent({ kind: "end-upkeep", targetId: "p2", status: null })).toBeUndefined();
    expect(
      parseClientIntent({ kind: "end-upkeep", targetId: "", status: "mending" }),
    ).toBeUndefined();
    expect(
      parseClientIntent({ kind: "end-upkeep", targetId: "x".repeat(65), status: "mending" }),
    ).toBeUndefined();
    expect(parseClientIntent({ kind: "end-upkeep", targetId: "p2" })).toBeUndefined();
  });

  it("rejects a field it does not name, a caster above all", () => {
    expect(
      parseClientIntent({ kind: "end-upkeep", targetId: "p2", status: "mending", casterId: "p3" }),
    ).toBeUndefined();
  });
});

describe("parseClientIntent — command (#1110)", () => {
  const command = (fields: Record<string, unknown>) =>
    parseClientIntent({
      kind: "command",
      creatureId: "p1/c1",
      order: { kind: "mode", mode: "heel" },
      ...fields,
    });

  it("parses each mode", () => {
    for (const mode of COMPANION_MODES) {
      expect(command({ order: { kind: "mode", mode } })).toEqual({
        kind: "command",
        creatureId: "p1/c1",
        order: { kind: "mode", mode },
      });
    }
  });

  it("rejects an extra key, on the intent or its order", () => {
    expect(command({ ownerId: "p1" })).toBeUndefined();
    expect(command({ order: { kind: "mode", mode: "heel", x: 1 } })).toBeUndefined();
  });

  it("rejects a mode or an order it does not know", () => {
    expect(command({ order: { kind: "mode", mode: "sit" } })).toBeUndefined();
    expect(command({ order: { kind: "flag", mode: "heel" } })).toBeUndefined();
    expect(command({ order: { kind: "mode" } })).toBeUndefined();
  });

  it("rejects an empty or overlong creature id", () => {
    expect(command({ creatureId: "" })).toBeUndefined();
    expect(command({ creatureId: "x".repeat(65) })).toBeUndefined();
    expect(command({ creatureId: undefined })).toBeUndefined();
  });

  it("rejects a missing or null order", () => {
    expect(command({ order: undefined })).toBeUndefined();
    expect(command({ order: null })).toBeUndefined();
  });
});

describe("fingerprint", () => {
  it("is 12 lowercase hex digits", () => {
    expect(fingerprint("")).toMatch(/^[0-9a-f]{12}$/);
    expect(fingerprint("any text, with ünïcode ✓")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is FNV-1a 64: the empty string is the offset basis, 'a' a known value", () => {
    expect(fingerprint("")).toBe("cbf29ce48422");
    expect(fingerprint("a")).toBe("af63dc4c8601");
  });

  it("differs when one character does", () => {
    expect(fingerprint("wire-a")).not.toBe(fingerprint("wire-b"));
  });
});

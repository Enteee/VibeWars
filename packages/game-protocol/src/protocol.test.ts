import { describe, expect, it } from "vitest";

import { COMPANION_MODES, LOBBY_CODE_LENGTH, isLobbyCode, parseClientIntent } from "./protocol.js";
import { PROTOCOL_VERSION, fingerprint } from "./protocol-version.js";

describe("protocol constants", () => {
  it("derives the protocol version from the wire schema", () => {
    expect(PROTOCOL_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("isLobbyCode (#2100)", () => {
  const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

  it("accepts 43 base64url characters", () => {
    expect(isLobbyCode(KEY)).toBe(true);
    expect(isLobbyCode(`${"_".repeat(21)}${"-".repeat(21)}w`)).toBe(true);
  });

  it("is a 256-bit key", () => {
    expect(LOBBY_CODE_LENGTH).toBe(43);
    // 42 characters of 6 bits, and 4 more in the last.
    expect((LOBBY_CODE_LENGTH - 1) * 6 + 4).toBeGreaterThanOrEqual(256);
  });

  it("takes a mixed-case key as it is", () => {
    const mixed = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_aBcDE";
    expect(isLobbyCode(mixed)).toBe(true);
  });

  it("refuses a wrong length", () => {
    expect(isLobbyCode(KEY.slice(0, -1))).toBe(false);
    expect(isLobbyCode(`${KEY}A`)).toBe(false);
    expect(isLobbyCode("ACDEFGHJKMNP")).toBe(false);
    expect(isLobbyCode("")).toBe(false);
  });

  it("refuses anything outside base64url, padding included", () => {
    expect(isLobbyCode(`${KEY.slice(0, -2)}+A`)).toBe(false);
    expect(isLobbyCode(`${KEY.slice(0, -2)}/A`)).toBe(false);
    expect(isLobbyCode(`${KEY.slice(0, -1)}=`)).toBe(false);
    expect(isLobbyCode(`${KEY.slice(0, -2)} A`)).toBe(false);
    expect(isLobbyCode(`${KEY.slice(0, 20)}\n${KEY.slice(21)}`)).toBe(false);
  });

  it("refuses a last character with bits past the 256th", () => {
    expect(isLobbyCode(`${KEY.slice(0, -1)}B`)).toBe(false);
    expect(isLobbyCode(`${KEY.slice(0, -1)}_`)).toBe(false);
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

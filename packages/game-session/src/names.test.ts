import { MAX_CHAT_GRAPHEMES } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  sanitizeChatText,
  sanitizeGuild,
  sanitizeGuildCape,
  sanitizeGuildTag,
  sanitizeName,
} from "./names.js";

describe("sanitizeName", () => {
  it("keeps a reasonable name as-is", () => {
    expect(sanitizeName("Ellie", "fallback")).toBe("Ellie");
  });

  it("falls back for a non-string", () => {
    expect(sanitizeName(42, "fallback")).toBe("fallback");
    expect(sanitizeName(undefined, "fallback")).toBe("fallback");
    expect(sanitizeName(null, "fallback")).toBe("fallback");
  });

  it("falls back for an empty or whitespace-only name", () => {
    expect(sanitizeName("", "fallback")).toBe("fallback");
    expect(sanitizeName("   ", "fallback")).toBe("fallback");
  });

  it("strips control characters that would corrupt logs or other clients' UI", () => {
    // A name carrying an ANSI escape and a NUL byte.
    const hostile = "ab\u001b[31mcd\u0000";
    expect(sanitizeName(hostile, "fallback")).toBe("ab[31mcd");
  });

  it("clamps a very long name so one player cannot flood the screen", () => {
    expect(sanitizeName("x".repeat(500), "fallback")).toHaveLength(16);
  });

  // #174: names are drawn over every player's head, so anything that
  // draws nothing, rearranges the line, or draws outside it goes.
  it("strips bidi controls, so a name cannot reverse itself or what follows", () => {
    expect(sanitizeName("\u202enimda", "fallback")).toBe("nimda");
    const bidi = [
      ...["\u202a", "\u202b", "\u202c", "\u202d", "\u202e"],
      ...["\u2066", "\u2067", "\u2068", "\u2069"],
      ...["\u200e", "\u200f", "\u061c"],
    ];
    for (const control of bidi) {
      expect(sanitizeName(`a${control}b`, "fallback")).toBe("ab");
    }
  });

  it("strips zero-width and other invisible characters", () => {
    // The ZWJ between two letters is kept (#192); everything else here goes.
    expect(sanitizeName("a\u200bb\u200dc\ufeff\u2060\u00ad", "fallback")).toBe("ab\u200dc");
    expect(sanitizeName("\u200b\u200c\u200d\u2060", "fallback")).toBe("fallback");
    expect(sanitizeName("a\u2028b\u2029c", "fallback")).toBe("abc");
  });

  it("strips the characters that are blank by design: Hangul fillers and the braille blank", () => {
    for (const blank of ["\u115f", "\u1160", "\u3164", "\uffa0", "\u2800"]) {
      expect(sanitizeName(`a${blank}b`, "fallback")).toBe("ab");
      expect(sanitizeName(blank.repeat(3), "fallback")).toBe("fallback");
    }
  });

  it("reads only the head of a huge name, and still cleans it", () => {
    const huge = `\u202eEllie${"\u0301".repeat(1_000_000)}`;
    expect(sanitizeName(huge, "fallback")).toBe("Elli\u00e9\u0301\u0301");
  });

  it("strips C1 controls", () => {
    expect(sanitizeName("\u0085x\u009f", "fallback")).toBe("x");
  });

  it("keeps at most two combining marks on a letter, and none with nothing to sit on", () => {
    // NFC first folds one mark into the letter: é, then two more.
    expect(sanitizeName(`e${"\u0301".repeat(15)}`, "fallback")).toBe("\u00e9\u0301\u0301");
    expect(sanitizeName("\u0301abc", "fallback")).toBe("abc");
    expect(sanitizeName(" \u0301 \u0301abc", "fallback")).toBe("abc");
  });

  it("normalises to NFC, so an accented letter is one character", () => {
    expect(sanitizeName("e\u0301", "fallback")).toBe("\u00e9");
  });

  it("collapses runs of whitespace", () => {
    expect(sanitizeName("a    b", "fallback")).toBe("a b");
    expect(sanitizeName("a\t\n b", "fallback")).toBe("a b");
  });

  it("clamps in code points, so an emoji is never cut in half", () => {
    const name = sanitizeName(`${"x".repeat(15)}\u{1f600}\u{1f600}`, "fallback");
    expect(name).toBe(`${"x".repeat(15)}\u{1f600}`);
    expect(Array.from(name)).toHaveLength(16);
    expect(name).not.toMatch(/\p{Cs}/u);
  });

  it("drops a lone surrogate the client sent", () => {
    expect(sanitizeName("a\ud800b", "fallback")).toBe("ab");
  });

  it("does not end on a space the clamp exposed", () => {
    expect(sanitizeName(`${"x".repeat(15)} y`, "fallback")).toBe("x".repeat(15));
  });

  // #192: the format characters real names need survive where they belong.
  describe("joiners and flags", () => {
    const ZWJ = String.fromCodePoint(0x200d);
    const ZWNJ = String.fromCodePoint(0x200c);
    const MAN = String.fromCodePoint(0x1f468);
    const WOMAN = String.fromCodePoint(0x1f469);
    const GIRL = String.fromCodePoint(0x1f467);
    const BOY = String.fromCodePoint(0x1f466);
    const FAMILY = [MAN, WOMAN, GIRL, BOY].join(ZWJ);
    const BLACK_FLAG = String.fromCodePoint(0x1f3f4);
    const CANCEL_TAG = String.fromCodePoint(0xe007f);
    /** Tag characters spelling `letters`, as a subdivision flag does. */
    const tags = (letters: string) =>
      Array.from(letters, (letter) =>
        String.fromCodePoint(0xe0000 + (letter.codePointAt(0) ?? 0)),
      ).join("");
    const ENGLAND = `${BLACK_FLAG}${tags("gbeng")}${CANCEL_TAG}`;
    const graphemes = (name: string) =>
      Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name));

    it("keeps a family emoji whole, as one grapheme", () => {
      expect(sanitizeName(FAMILY, "fallback")).toBe(FAMILY);
      expect(graphemes(FAMILY)).toHaveLength(1);
    });

    it("keeps the England flag", () => {
      expect(sanitizeName(ENGLAND, "fallback")).toBe(ENGLAND);
    });

    it("keeps a ZWNJ inside a Persian name, and strips one at an edge or by a space", () => {
      // می‌خواهم: mim, yeh, ZWNJ, then the rest of the word.
      const before = String.fromCodePoint(0x0645, 0x06cc);
      const after = String.fromCodePoint(0x062e, 0x0648, 0x0627, 0x0647, 0x0645);
      expect(sanitizeName(`${before}${ZWNJ}${after}`, "fallback")).toBe(`${before}${ZWNJ}${after}`);
      expect(sanitizeName(`${ZWNJ}${before}`, "fallback")).toBe(before);
      expect(sanitizeName(`${before}${ZWNJ}`, "fallback")).toBe(before);
      expect(sanitizeName(`${before} ${ZWNJ}${after}`, "fallback")).toBe(`${before} ${after}`);
    });

    it("strips a run of joiners, a stray tag, and an incomplete or overlong flag", () => {
      expect(sanitizeName(`a${ZWJ}${ZWJ}b`, "fallback")).toBe("ab");
      expect(sanitizeName(`a${tags("g")}`, "fallback")).toBe("a");
      expect(sanitizeName(`${BLACK_FLAG}${tags("gbeng")}`, "fallback")).toBe(BLACK_FLAG);
      expect(sanitizeName(`${BLACK_FLAG}${tags("abcdefg")}${CANCEL_TAG}`, "fallback")).toBe(
        BLACK_FLAG,
      );
    });

    it("cuts a chain of ten faces down to its first", () => {
      expect(sanitizeName(Array(10).fill(MAN).join(ZWJ), "fallback")).toBe(MAN);
    });

    it("cuts any grapheme of more than 12 code points down to its first", () => {
      const skinTone = String.fromCodePoint(0x1f3fb);
      expect(sanitizeName(`a${skinTone.repeat(100)}`, "fallback")).toBe("a");
      const leadingJamo = String.fromCodePoint(0x1100);
      expect(sanitizeName(leadingJamo.repeat(120), "fallback")).toBe(leadingJamo);
      // A family in four skin tones is 11 code points, and stays.
      const tones = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe].map((tone) => String.fromCodePoint(tone));
      const toned = [MAN, WOMAN, GIRL, BOY].map((face, i) => `${face}${tones[i] ?? ""}`).join(ZWJ);
      expect(sanitizeName(toned, "fallback")).toBe(toned);
    });

    it("clamps in whole graphemes, 48 code points in all: twenty families are six", () => {
      expect(sanitizeName(FAMILY.repeat(20), "fallback")).toBe(FAMILY.repeat(6));
    });

    it("bounds a name of many wide graphemes, not just each one", () => {
      // Eleven code points each, under the per-grapheme cap: four fit in 48.
      const swatches = `a${String.fromCodePoint(0x1f3fb).repeat(10)}`;
      expect(sanitizeName(swatches.repeat(11), "fallback")).toBe(swatches.repeat(4));
    });
  });
});

describe("sanitizeChatText (#479)", () => {
  it("keeps a line of text as it is, spaces and punctuation too", () => {
    expect(sanitizeChatText("spike the monk, then rez!")).toBe("spike the monk, then rez!");
  });

  it("strips what names lose: controls, bidi overrides and zero-width characters", () => {
    expect(sanitizeChatText("gg‮ wp​\u0000")).toBe("gg wp");
  });

  it("is empty when nothing drawable is left", () => {
    expect(sanitizeChatText(" ​⁦ ")).toBe("");
  });

  it("keeps MAX_CHAT_GRAPHEMES graphemes, never cutting a family apart", () => {
    expect(sanitizeChatText("x".repeat(500))).toHaveLength(MAX_CHAT_GRAPHEMES);
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467}";
    const line = sanitizeChatText(family.repeat(500));
    expect(line.length % family.length).toBe(0);
    expect(line.length).toBeGreaterThan(0);
  });
});

describe("sanitizeGuildTag (#1406)", () => {
  it("keeps a tag of 2, 3 or 4 letters or digits, case as typed", () => {
    expect(sanitizeGuildTag("Vb")).toBe("Vb");
    expect(sanitizeGuildTag("x9Z")).toBe("x9Z");
    expect(sanitizeGuildTag("VIBE")).toBe("VIBE");
  });

  it("trims the blanks around one", () => {
    expect(sanitizeGuildTag("  VIBE ")).toBe("VIBE");
  });

  it("is none for one too short, too long, or empty", () => {
    expect(sanitizeGuildTag("V")).toBeNull();
    expect(sanitizeGuildTag("VIBES")).toBeNull();
    expect(sanitizeGuildTag("")).toBeNull();
  });

  it("is none for anything but ASCII letters and digits", () => {
    for (const raw of ["VÏBE", "VI\u{1f600}", "[VB]", "V B", "VB\u0000", "V-B", "‮VB"]) {
      expect(sanitizeGuildTag(raw), raw).toBeNull();
    }
  });

  it("is none for a non-string", () => {
    for (const raw of [42, null, undefined, ["VIBE"], { tag: "VIBE" }]) {
      expect(sanitizeGuildTag(raw)).toBeNull();
    }
  });
});

describe("sanitizeGuildCape (#1422)", () => {
  const cape = { main: "teal", trim: "teal", emblem: "half-disc" } as const;

  it("keeps a cape of the palette's colours and an emblem, the same colour twice too", () => {
    expect(sanitizeGuildCape(cape)).toEqual(cape);
  });

  it("is none for anything else", () => {
    for (const raw of [
      null,
      undefined,
      "teal",
      [],
      { ...cape, main: "red" },
      { ...cape, emblem: "skull" },
      { main: "teal", trim: "teal" },
      { ...cape, extra: 1 },
    ]) {
      expect(sanitizeGuildCape(raw)).toBeNull();
    }
  });

  it("is none without a valid tag: the cape is the guild's", () => {
    expect(sanitizeGuild({ guildTag: " Vb ", guildCape: cape })).toEqual({
      guildTag: "Vb",
      guildCape: cape,
    });
    expect(sanitizeGuild({ guildTag: null, guildCape: cape })).toEqual({
      guildTag: null,
      guildCape: null,
    });
    expect(sanitizeGuild({ guildTag: "[x]", guildCape: cape }).guildCape).toBeNull();
  });
});

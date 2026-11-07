import { afterEach, describe, expect, it, vi } from "vitest";

import { en, type Catalog } from "./en.js";
import { formatList, locale, pickLanguage, setLocale, t } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("en", en);
});

describe("t (#2648)", () => {
  it("fills placeholders", () => {
    expect(t("matches.teamResult", { team: 2, result: "Won" })).toBe("Team 2: Won");
  });

  it("throws on a missing placeholder in tests", () => {
    expect(() => t("matches.teamResult", { team: 2 })).toThrow("{result}");
  });

  it("picks an English plural by count", () => {
    const table: Catalog = {
      ...en,
      "matches.minutesAgo": { one: "a minute", other: "{count} minutes" },
    };
    setLocale("en", table);
    expect(t("matches.minutesAgo", { count: 1 })).toBe("a minute");
    expect(t("matches.minutesAgo", { count: 2 })).toBe("2 minutes");
  });

  it("picks Arabic's plural categories, and other for one the table lacks", () => {
    const table: Catalog = {
      ...en,
      "matches.minutesAgo": { zero: "z", one: "o", two: "t", few: "f", other: "{count}" },
    };
    setLocale("ar", table);
    expect([0, 1, 2, 3, 11, 100].map((count) => t("matches.minutesAgo", { count }))).toEqual([
      "z",
      "o",
      "t",
      "f",
      "11",
      "100",
    ]);
    expect(locale()).toBe("ar");
  });

  it("lists the player's way", () => {
    expect(formatList(["a", "b", "c"], "or")).toBe("a, b, or c");
  });
});

describe("pickLanguage (#2648)", () => {
  it("takes the stored pick the build has", () => {
    expect(pickLanguage("de", ["fr-FR"], ["en", "de", "fr"])).toBe("de");
  });

  it("passes over a stored code the build lacks, for the browser's", () => {
    expect(pickLanguage("xx", ["fr-FR", "de"], ["en", "de", "fr"])).toBe("fr");
  });

  it("reads a region's primary subtag, else English", () => {
    expect(pickLanguage(undefined, ["de-AT"], ["en", "de"])).toBe("de");
    expect(pickLanguage(undefined, ["de-AT"], ["en"])).toBe("en");
    expect(pickLanguage(undefined, ["zh-TW"], ["en", "zh"])).toBe("zh");
    expect(pickLanguage(undefined, ["nb-NO", "no"], ["en", "de"])).toBe("en");
  });
});

describe("setLocale (#2648)", () => {
  it("sets <html lang>, and dir rtl for a right-to-left language", () => {
    const root = { lang: "", dir: "" };
    vi.stubGlobal("document", { documentElement: root });
    setLocale("he", en);
    expect(root).toEqual({ lang: "he", dir: "rtl" });
    setLocale("de", en);
    expect(root).toEqual({ lang: "de", dir: "ltr" });
  });
});

import type { DescribeWords } from "@vibewars/game-core";

import type { Catalog } from "./en.js";
import type { GameNames } from "./game-names.js";

/**
 * The 30 most written languages on the web (#2644: W3Techs, content
 * languages, 2026-11-07), each by its own name. Right-to-left ones set
 * `dir="rtl"` on the page.
 */
export const LANGUAGES = [
  { code: "en", name: "English", rtl: false },
  { code: "es", name: "Español", rtl: false },
  { code: "de", name: "Deutsch", rtl: false },
  { code: "ja", name: "日本語", rtl: false },
  { code: "fr", name: "Français", rtl: false },
  { code: "pt", name: "Português", rtl: false },
  { code: "ru", name: "Русский", rtl: false },
  { code: "it", name: "Italiano", rtl: false },
  { code: "nl", name: "Nederlands", rtl: false },
  { code: "pl", name: "Polski", rtl: false },
  { code: "tr", name: "Türkçe", rtl: false },
  { code: "id", name: "Bahasa Indonesia", rtl: false },
  { code: "zh", name: "简体中文", rtl: false },
  { code: "fa", name: "فارسی", rtl: true },
  { code: "cs", name: "Čeština", rtl: false },
  { code: "vi", name: "Tiếng Việt", rtl: false },
  { code: "ko", name: "한국어", rtl: false },
  { code: "ar", name: "العربية", rtl: true },
  { code: "uk", name: "Українська", rtl: false },
  { code: "hu", name: "Magyar", rtl: false },
  { code: "sv", name: "Svenska", rtl: false },
  { code: "ro", name: "Română", rtl: false },
  { code: "el", name: "Ελληνικά", rtl: false },
  { code: "da", name: "Dansk", rtl: false },
  { code: "fi", name: "Suomi", rtl: false },
  { code: "he", name: "עברית", rtl: true },
  { code: "sk", name: "Slovenčina", rtl: false },
  { code: "th", name: "ไทย", rtl: false },
  { code: "bg", name: "Български", rtl: false },
  { code: "hr", name: "Hrvatski", rtl: false },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** A language's tables, loaded together: its interface text, game-data names and description sentences. */
export interface LocaleTables {
  readonly ui: Catalog;
  readonly game: GameNames;
  readonly describe: DescribeWords;
}

/**
 * The translations this build has, each its own lazy chunk:
 * `async () => ({ ui: (await import("./locales/<code>/ui.js")).default,
 * game: (await import("./locales/<code>/game.js")).default,
 * describe: (await import("./locales/<code>/describe.js")).default })`.
 * A `describe.ts` is `satisfies DescribeWords`. English
 * is bundled, not here. A translation card adds its languages.
 */
export const LOCALES: Readonly<Partial<Record<LanguageCode, () => Promise<LocaleTables>>>> = {};

/** The languages the build has, English first, in `LANGUAGES` order. */
export function availableLanguages(
  locales: Readonly<Partial<Record<LanguageCode, unknown>>> = LOCALES,
): readonly LanguageCode[] {
  return LANGUAGES.map((language) => language.code).filter(
    (code) => code === "en" || locales[code] !== undefined,
  );
}

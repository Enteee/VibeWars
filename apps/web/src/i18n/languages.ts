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

/** A language's tables, loaded together: its interface text and its game-data names. */
export interface LocaleTables {
  readonly ui: Catalog;
  readonly game: GameNames;
}

/**
 * The translations this build has, each its own lazy chunk:
 * `async () => ({ ui: (await import("./locales/<code>/ui.js")).default,
 * game: (await import("./locales/<code>/game.js")).default })`. English
 * is bundled, not here. A translation card adds its languages.
 */
export const LOCALES: Readonly<Partial<Record<LanguageCode, () => Promise<LocaleTables>>>> = {
  es: async () => ({
    ui: (await import("./locales/es/ui.js")).default,
    game: (await import("./locales/es/game.js")).default,
  }),
  de: async () => ({
    ui: (await import("./locales/de/ui.js")).default,
    game: (await import("./locales/de/game.js")).default,
  }),
  fr: async () => ({
    ui: (await import("./locales/fr/ui.js")).default,
    game: (await import("./locales/fr/game.js")).default,
  }),
  pt: async () => ({
    ui: (await import("./locales/pt/ui.js")).default,
    game: (await import("./locales/pt/game.js")).default,
  }),
  it: async () => ({
    ui: (await import("./locales/it/ui.js")).default,
    game: (await import("./locales/it/game.js")).default,
  }),
  nl: async () => ({
    ui: (await import("./locales/nl/ui.js")).default,
    game: (await import("./locales/nl/game.js")).default,
  }),
  pl: async () => ({
    ui: (await import("./locales/pl/ui.js")).default,
    game: (await import("./locales/pl/game.js")).default,
  }),
  cs: async () => ({
    ui: (await import("./locales/cs/ui.js")).default,
    game: (await import("./locales/cs/game.js")).default,
  }),
  sk: async () => ({
    ui: (await import("./locales/sk/ui.js")).default,
    game: (await import("./locales/sk/game.js")).default,
  }),
  hr: async () => ({
    ui: (await import("./locales/hr/ui.js")).default,
    game: (await import("./locales/hr/game.js")).default,
  }),
  ja: async () => ({
    ui: (await import("./locales/ja/ui.js")).default,
    game: (await import("./locales/ja/game.js")).default,
  }),
  zh: async () => ({
    ui: (await import("./locales/zh/ui.js")).default,
    game: (await import("./locales/zh/game.js")).default,
  }),
  ko: async () => ({
    ui: (await import("./locales/ko/ui.js")).default,
    game: (await import("./locales/ko/game.js")).default,
  }),
  vi: async () => ({
    ui: (await import("./locales/vi/ui.js")).default,
    game: (await import("./locales/vi/game.js")).default,
  }),
  th: async () => ({
    ui: (await import("./locales/th/ui.js")).default,
    game: (await import("./locales/th/game.js")).default,
  }),
  ru: async () => ({
    ui: (await import("./locales/ru/ui.js")).default,
    game: (await import("./locales/ru/game.js")).default,
  }),
  uk: async () => ({
    ui: (await import("./locales/uk/ui.js")).default,
    game: (await import("./locales/uk/game.js")).default,
  }),
  el: async () => ({
    ui: (await import("./locales/el/ui.js")).default,
    game: (await import("./locales/el/game.js")).default,
  }),
  ro: async () => ({
    ui: (await import("./locales/ro/ui.js")).default,
    game: (await import("./locales/ro/game.js")).default,
  }),
  bg: async () => ({
    ui: (await import("./locales/bg/ui.js")).default,
    game: (await import("./locales/bg/game.js")).default,
  }),
};

/** The languages the build has, English first, in `LANGUAGES` order. */
export function availableLanguages(
  locales: Readonly<Partial<Record<LanguageCode, unknown>>> = LOCALES,
): readonly LanguageCode[] {
  return LANGUAGES.map((language) => language.code).filter(
    (code) => code === "en" || locales[code] !== undefined,
  );
}

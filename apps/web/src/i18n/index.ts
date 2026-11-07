import { en, type Catalog, type MessageKey } from "./en.js";
import { LANGUAGES, LOCALES, availableLanguages, type LanguageCode } from "./languages.js";
import { loadLanguage } from "./language-preference.js";
import type { Message } from "./message.js";

/**
 * The player's language (#2648, ADR-0050): picked once at startup, then
 * every screen reads its text through `t()` as it draws. Changing it
 * reloads the page, so nothing re-renders live.
 */

export type { MessageKey } from "./en.js";

let current: LanguageCode = "en";
let table: Catalog = en;

// Built once per language, on first use: a new one costs ~35 µs (#2711).
let pluralRules: Intl.PluralRules | undefined;
let numberFormat: Intl.NumberFormat | undefined;
const listFormats = new Map<"and" | "or", Intl.ListFormat>();

/**
 * The language to use: the stored pick, else the first of the browser's
 * whose primary subtag (`de-CH` -> `de`) the build has, else English. A
 * code the build lacks is wrong data and is passed over.
 */
export function pickLanguage(
  stored: string | undefined,
  preferred: readonly string[],
  available: readonly LanguageCode[],
): LanguageCode {
  const known = (tag: string): LanguageCode | undefined => {
    const primary = tag.toLowerCase().split("-")[0];
    return available.find((code) => code === primary);
  };
  for (const tag of [...(stored === undefined ? [] : [stored]), ...preferred]) {
    const code = known(tag);
    if (code !== undefined) {
      return code;
    }
  }
  return "en";
}

/** Use `code` and its table from now on, and say so on `<html>` if there is a page. */
export function setLocale(code: LanguageCode, catalog: Catalog): void {
  current = code;
  table = catalog;
  pluralRules = undefined;
  numberFormat = undefined;
  listFormats.clear();
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.lang = code;
  root.dir = LANGUAGES.find((language) => language.code === code)?.rtl === true ? "rtl" : "ltr";
}

/** Load the player's language before the first screen draws: `main.ts` awaits it. */
export async function loadLocale(): Promise<void> {
  const code = pickLanguage(loadLanguage(), navigator.languages, availableLanguages());
  const load = LOCALES[code];
  setLocale(code, load === undefined ? en : (await load()).default);
}

/** The language in use, for `Intl`. */
export function locale(): LanguageCode {
  return current;
}

function pluralForm(message: Exclude<Message, string>, count: number): string {
  pluralRules ??= new Intl.PluralRules(current);
  const category = pluralRules.select(count);
  return (category === "other" ? undefined : message[category]) ?? message.other;
}

/**
 * The text of `key` in the player's language, `{name}` filled from
 * `params`; a plural picks its form by `params.count`. A missing
 * parameter throws in development and tests, and stays visible as
 * `{name}` in a production build.
 */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const message = table[key];
  let text: string;
  if (typeof message === "string") {
    text = message;
  } else {
    const count = params?.count;
    if (typeof count !== "number") {
      if (import.meta.env.DEV) {
        throw new Error(`t("${key}") is a plural and needs a numeric count`);
      }
      text = message.other;
    } else {
      text = pluralForm(message, count);
    }
  }
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      if (import.meta.env.DEV) {
        throw new Error(`t("${key}") is missing {${name}}`);
      }
      return placeholder;
    }
    return String(value);
  });
}

/** `n` written the player's way: `1,234` or `1.234`. */
export function formatNumber(n: number): string {
  numberFormat ??= new Intl.NumberFormat(current);
  return numberFormat.format(n);
}

/** `items` as one list the player's way: "a, b and c", or "a, b or c". */
export function formatList(items: readonly string[], kind: "and" | "or"): string {
  let format = listFormats.get(kind);
  if (format === undefined) {
    format = new Intl.ListFormat(current, { type: kind === "and" ? "conjunction" : "disjunction" });
    listFormats.set(kind, format);
  }
  return format.format(items);
}

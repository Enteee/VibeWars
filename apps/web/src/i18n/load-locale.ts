import { en } from "./en.js";
import { setGameNames } from "./game-names.js";
import { pickLanguage, setLocale } from "./index.js";
import { LOCALES, availableLanguages, type LanguageCode, type LocaleTables } from "./languages.js";
import { loadLanguage } from "./language-preference.js";

/**
 * Load the player's language before the first screen draws: `main.ts`
 * awaits it. Kept out of `index.ts` so `t()` does not pull in storage,
 * which needs Vite's `import.meta.env`: the e2e specs import it in Node.
 */
export async function loadLocale(
  locales: Readonly<Partial<Record<LanguageCode, () => Promise<LocaleTables>>>> = LOCALES,
): Promise<void> {
  const code = pickLanguage(loadLanguage(), navigator.languages, availableLanguages(locales));
  const load = locales[code];
  if (load === undefined) {
    setLocale(code, en);
    return;
  }
  try {
    const tables = await load();
    setLocale(code, tables.ui);
    setGameNames(tables.game);
  } catch (error: unknown) {
    // Offline, or a stale deploy's chunk: English, so the boot is never blank.
    console.warn("[web] could not load the language", code, error);
    setLocale("en", en);
  }
}

import { en } from "./en.js";
import { setGameNames } from "./game-names.js";
import { pickLanguage, setLocale } from "./index.js";
import { LOCALES, availableLanguages } from "./languages.js";
import { loadLanguage } from "./language-preference.js";
import { loadPlayerDocs } from "../ui/player-docs.js";

/**
 * Load the player's language before the first screen draws: `main.ts`
 * awaits it. Kept out of `index.ts` so `t()` does not pull in storage,
 * which needs Vite's `import.meta.env`: the e2e specs import it in Node.
 */
export async function loadLocale(): Promise<void> {
  const code = pickLanguage(loadLanguage(), navigator.languages, availableLanguages());
  const load = LOCALES[code];
  if (load === undefined) {
    setLocale(code, en);
    return;
  }
  const [tables] = await Promise.all([load(), loadPlayerDocs(code)]);
  setLocale(code, tables.ui);
  setGameNames(tables.game);
}

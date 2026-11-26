import { locale, t } from "../i18n/index.js";
import { saveLanguage } from "../i18n/language-preference.js";
import { LANGUAGES, type LanguageCode } from "../i18n/languages.js";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * Options > Language (#2648): the languages the build has, each in its
 * own name. A pick is stored and reloads the page, so it is locked while
 * a reload would drop something: a lobby with others, a queue, a match.
 */

let busy: () => boolean = () => false;

/** `main.ts` says when a reload would drop the player out of something. */
export function setLanguageBusy(check: () => boolean): void {
  busy = check;
}

/** The section, offering `languages`. */
export function languageSection(
  languages: readonly LanguageCode[],
  reload: () => void = () => {
    location.reload();
  },
): OptionsSection {
  return {
    id: "language",
    get title() {
      return t("options.language");
    },
    mount: (container) => {
      const select = document.createElement("select");
      select.className = "language-select";
      for (const language of LANGUAGES.filter((entry) => languages.includes(entry.code))) {
        const option = document.createElement("option");
        option.value = language.code;
        option.textContent = language.name;
        select.appendChild(option);
      }
      select.value = locale();
      if (busy()) {
        select.disabled = true;
        select.title = t("options.languageBusy");
      }
      select.addEventListener("change", () => {
        if (busy()) {
          return;
        }
        saveLanguage(select.value);
        reload();
      });
      const field = h("label", "field");
      field.append(h("span", "field-label", t("options.languageLabel")), select);
      container.appendChild(field);
      return () => {
        // Nothing to undo: the select goes with the pane.
      };
    },
  };
}

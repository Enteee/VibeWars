import { availableLanguages, type LanguageCode } from "../i18n/languages.js";
import { controlsSection } from "./controls-section.js";
import { languageSection } from "./language-section.js";
import { playerSection } from "./player-section.js";
import { relaySection } from "./relay-section.js";

/**
 * The Options screen's sections (#423), in the order its list shows them.
 * A new option is a new section here, or a row in one; the screen itself
 * does not change.
 */

export interface OptionsSection {
  /** Stable: the DOM and the tests find a section by it. */
  readonly id: string;
  readonly title: string;
  /** Draw into `container`; returns the cleanup (listeners, focus traps). */
  readonly mount: (container: HTMLElement) => () => void;
}

/**
 * The sections for a build with `languages`: Language first (#2648),
 * and only when there is a second language to pick.
 */
export function optionsSections(languages: readonly LanguageCode[]): readonly OptionsSection[] {
  return [
    ...(languages.length > 1 ? [languageSection(languages)] : []),
    playerSection,
    controlsSection,
    relaySection,
  ];
}

export const OPTIONS_SECTIONS: readonly OptionsSection[] = optionsSections(availableLanguages());

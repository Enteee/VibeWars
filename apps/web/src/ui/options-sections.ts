import type { LanguageCode } from "../i18n/languages.js";
import { controlsSection } from "./controls-section.js";
import { displaySection } from "./display-section.js";
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
 * The sections for a build with `languages`: Language after Player, which
 * Options opens on (#1513), and only when there is a second language to pick.
 * Player shows `signet`, the player key's (#3235).
 */
export function optionsSections(
  languages: readonly LanguageCode[],
  signet: number,
): readonly OptionsSection[] {
  return [
    playerSection(signet),
    ...(languages.length > 1 ? [languageSection(languages)] : []),
    controlsSection,
    displaySection,
    relaySection,
  ];
}

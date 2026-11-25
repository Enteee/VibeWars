import { cosmeticsStore } from "../cosmetics/store.js";
import type { LanguageCode } from "../i18n/languages.js";
import type { FigureLook } from "./character-card.js";
import { controlsSection } from "./controls-section.js";
import { createCosmeticsPreview } from "./cosmetics-preview.js";
import { cosmeticsSection } from "./cosmetics-section.js";
import { languageSection } from "./language-section.js";
import { playerGuild, playerSection } from "./player-section.js";
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

/** Whose Options these are: the player key's signet (#3235), and their character's look (#3989). */
export interface OptionsOwner {
  readonly signet: number;
  /** The character Random Arena would queue as, once it is read; `undefined` for none. */
  readonly figure: () => Promise<FigureLook | undefined>;
}

/**
 * The sections for a build with `languages`: Language after Player, which
 * Options opens on (#1513), and only when there is a second language to pick.
 * Player shows `owner`'s signet, and Cosmetics wears their character (#3989).
 */
export function optionsSections(
  languages: readonly LanguageCode[],
  owner: OptionsOwner,
): readonly OptionsSection[] {
  return [
    playerSection(owner.signet),
    ...(languages.length > 1 ? [languageSection(languages)] : []),
    controlsSection,
    cosmeticsSection(cosmeticsStore, () => playerGuild().guildCape, {
      look: owner.figure,
      preview: createCosmeticsPreview,
    }),
    relaySection,
  ];
}

import { controlsSection } from "./controls-section.js";

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

export const OPTIONS_SECTIONS: readonly OptionsSection[] = [controlsSection];

import { controlsSection } from "./controls-section.js";
import { mountSoundControls, soundControlsDeps } from "./sound-controls.js";

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

/** Sound (#424): the same controls the HUD's ♪ popover shows in a match. */
export const soundSection: OptionsSection = {
  id: "sound",
  title: "sound",
  mount: (container) => mountSoundControls(container, soundControlsDeps()),
};

export const OPTIONS_SECTIONS: readonly OptionsSection[] = [soundSection, controlsSection];

import gwSkilldataLicense from "../../../../packages/game-data/raw/gw-skilldata/LICENSE?raw";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/** Third-party work the client ships to the browser, and the notice its licence asks for. */
export interface ThirdPartyLicense {
  /** Stable: the DOM and the tests find an entry by it. */
  readonly id: string;
  readonly name: string;
  /** What VibeWars uses it for, in a few words. */
  readonly use: string;
  /** SPDX identifier. */
  readonly license: string;
  /** The licence text, verbatim, read from the vendored copy at build time. */
  readonly text: string;
}

/**
 * Every third-party licence the client must show (#1235), in one place.
 * A new one is a new entry here, its text imported `?raw` from the file
 * that ships with the work, never retyped.
 */
export const THIRD_PARTY_LICENSES: readonly ThirdPartyLicense[] = [
  {
    id: "gw-skilldata",
    name: "gw-skilldata",
    use: "GW1 skill data",
    license: "MIT",
    text: gwSkilldataLicense,
  },
];

/** Licences (#1235): the third-party notices, each in full. */
export const licensesSection: OptionsSection = {
  id: "licenses",
  title: "licences",
  mount: (container) => {
    const panel = h("div", "licenses-section");
    for (const entry of THIRD_PARTY_LICENSES) {
      const item = h("section", "license-entry");
      item.dataset.license = entry.id;
      item.append(
        h("h3", "license-name", `${entry.name} (${entry.license})`),
        h("p", "screen-subtitle", entry.use),
        h("pre", "license-text", entry.text),
      );
      panel.appendChild(item);
    }
    container.appendChild(panel);
    return () => {
      panel.remove();
    };
  },
};

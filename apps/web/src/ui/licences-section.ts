import gwSkilldataLicence from "@vibewars/game-data/gw-skilldata/LICENSE?raw";
// marked's package exports no LICENSE path, so it is read from the install.
import markedLicence from "../../node_modules/marked/LICENSE?raw";

import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/** A third-party work the client ships, and the notice its licence asks for. */
export interface ThirdPartyLicence {
  readonly name: string;
  /** What VibeWars uses it for, in a few words. */
  readonly use: string;
  /** Where its source lives. */
  readonly url: string;
  /** SPDX identifier. */
  readonly spdx: string;
  /** The licence text, verbatim, from the copy vendored with the work. */
  readonly text: string;
}

/**
 * Every third-party credit and licence notice, and the only place the UI
 * shows one (ADR-0039). A new one is one more entry, its text imported
 * `?raw` from the file that ships with the work, never retyped.
 */
export const THIRD_PARTY_LICENCES: readonly ThirdPartyLicence[] = [
  {
    name: "gw-skilldata",
    use: "GW1 skill data",
    url: "https://github.com/build-wars/gw-skilldata",
    spdx: "MIT",
    text: gwSkilldataLicence,
  },
  {
    name: "marked",
    use: "renders the Help pages",
    url: "https://github.com/markedjs/marked",
    spdx: "MIT",
    text: markedLicence,
  },
];

/** Third-party licences (#1235): each work, its use, its source and its full text. */
export const licencesSection: OptionsSection = {
  id: "licences",
  title: "Third-party licences",
  mount: (container) => {
    const panel = h("div", "licences-section");
    for (const entry of THIRD_PARTY_LICENCES) {
      const item = h("section", "licence-entry");
      item.dataset.licence = entry.name;
      const source = document.createElement("a");
      source.className = "licence-source";
      source.href = entry.url;
      source.target = "_blank";
      source.rel = "noopener";
      source.textContent = entry.url;
      item.append(
        h("h3", "licence-name", `${entry.name} (${entry.spdx})`),
        h("p", "screen-subtitle", entry.use),
        source,
        h("pre", "licence-text", entry.text),
      );
      panel.appendChild(item);
    }
    container.appendChild(panel);
    return () => {
      panel.remove();
    };
  },
};

import gwSkilldataLicence from "@vibewars/game-data/gw-skilldata/LICENSE?raw";

import { h } from "./kit.js";
import { LICENCES_FILE, type BundledLicence } from "./licences-file.js";
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
 * Every hand-vendored third-party work's credit and licence notice, sorted
 * by name (ADR-0039). A new one is one more entry, its text imported `?raw`
 * from the file that ships with the work, never retyped. npm packages are
 * not here: the build lists those (`BundledLicence`).
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
    name: "VCSL",
    use: "music samples",
    url: "https://github.com/sgossner/VCSL",
    spdx: "CC0-1.0",
    // CC0 asks for no notice: a dedication, not a licence to reproduce.
    text: "Versilian Community Sample Library, dedicated to the public domain under CC0 1.0 Universal.",
  },
];

/** Said where the build's list is not: a dev server has no bundle. */
export const NO_BUNDLE_NOTE = "Built-in licences appear in a production build.";

/** `json` as the build's list, or `undefined` if it is anything else. */
export function parseBundledLicences(json: unknown): BundledLicence[] | undefined {
  if (!Array.isArray(json)) {
    return undefined;
  }
  const entries: BundledLicence[] = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) {
      return undefined;
    }
    const { name, version, spdx, url, text } = item as Record<string, unknown>;
    if (
      typeof name !== "string" ||
      typeof version !== "string" ||
      typeof spdx !== "string" ||
      typeof url !== "string" ||
      typeof text !== "string"
    ) {
      return undefined;
    }
    entries.push({ name, version, spdx, url, text });
  }
  return entries;
}

/** One work, collapsed to its name until opened: the page stays readable. */
function licenceEntry(
  key: string,
  title: string,
  use: string | undefined,
  url: string,
  text: string,
): HTMLElement {
  const item = h("details", "licence-entry");
  item.dataset.licence = key;
  const summary = h("summary", "licence-summary");
  summary.appendChild(h("h3", "licence-name", title));
  item.appendChild(summary);
  if (use !== undefined) {
    item.appendChild(h("p", "screen-subtitle", use));
  }
  const source = document.createElement("a");
  source.className = "licence-source";
  source.href = url;
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = url;
  item.append(source, h("pre", "licence-text", text));
  return item;
}

/** The build's list, or `undefined` where there is none (dev) or it cannot be read. */
async function fetchBundledLicences(): Promise<BundledLicence[] | undefined> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${LICENCES_FILE}`);
    return response.ok ? parseBundledLicences(await response.json()) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Third-party licences (#1235, #1242): the hand-vendored works, then every
 * npm package in the bundle, each with its source and its full text.
 */
export const licencesSection: OptionsSection = {
  id: "licences",
  title: "Third-party licences",
  mount: (container) => {
    const panel = h("div", "licences-section");
    for (const entry of THIRD_PARTY_LICENCES) {
      panel.appendChild(
        licenceEntry(entry.name, `${entry.name} (${entry.spdx})`, entry.use, entry.url, entry.text),
      );
    }
    const bundled = h("div", "licences-bundled");
    panel.appendChild(bundled);
    container.appendChild(panel);
    void fetchBundledLicences().then((entries) => {
      if (entries === undefined) {
        bundled.appendChild(h("p", "screen-subtitle", NO_BUNDLE_NOTE));
        return;
      }
      for (const entry of entries) {
        bundled.appendChild(
          licenceEntry(
            entry.name,
            `${entry.name} ${entry.version} (${entry.spdx})`,
            undefined,
            entry.url,
            entry.text,
          ),
        );
      }
    });
    return () => {
      panel.remove();
    };
  },
};

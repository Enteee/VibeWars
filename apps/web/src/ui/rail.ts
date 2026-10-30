import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { button, h } from "./kit.js";

/**
 * The mode rail on the left of the menu (#1525, #1522 variant C): the
 * five modes, top to bottom, then Character Builder and Team Builder at
 * its bottom. Each entry is a screen of its own; the one shown is marked.
 */

/** A screen the rail opens. */
export type RailEntry =
  "random-arena" | "team-arena" | "heroes-ascent" | "gvg" | "hosted-game" | "characters" | "teams";

export interface RailItem {
  readonly entry: RailEntry;
  /** The screen's name, as its heading and the entry's hover read. */
  readonly label: string;
  /** Under the icon, short enough for 76 px. */
  readonly short: string;
}

/** The rail, top to bottom: the modes, then the builders after a divider. */
export const RAIL: readonly RailItem[] = [
  { entry: "random-arena", label: "Random Arena", short: "Random" },
  { entry: "team-arena", label: "Team Arena", short: "Team" },
  { entry: "heroes-ascent", label: "Heroes' Ascent", short: "Ascent" },
  { entry: "gvg", label: "GvG", short: "GvG" },
  { entry: "hosted-game", label: "Hosted Game", short: "Hosted" },
  { entry: "characters", label: "Character Builder", short: "Characters" },
  { entry: "teams", label: "Team Builder", short: "Teams" },
];

/** The first builder: the divider goes above it. */
const FIRST_BUILDER: RailEntry = "characters";

const RAIL_STORAGE_KEY = `${STORAGE_NAMESPACE}.rail`;

function isRailEntry(value: string | null): value is RailEntry {
  return RAIL.some((item) => item.entry === value);
}

/** The entry last shown; Random Arena on a first start, and for anything else stored. */
export function loadRail(): RailEntry {
  try {
    const stored = localStorage.getItem(RAIL_STORAGE_KEY);
    return isRailEntry(stored) ? stored : "random-arena";
  } catch {
    // A convenience, not a requirement: the menu opens on Random Arena.
    return "random-arena";
  }
}

export function saveRail(entry: RailEntry): void {
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, entry);
  } catch {
    // Same reasoning as loading it.
  }
}

/** The name of `entry`'s screen. */
export function railLabel(entry: RailEntry): string {
  return RAIL.find((item) => item.entry === entry)?.label ?? "";
}

/** The icon of `entry`; a mask, so it takes the entry's colour (styles.css). */
export function railIconUrl(entry: RailEntry): string {
  return `${import.meta.env.BASE_URL}icons/mode/${entry}.svg`;
}

/**
 * The rail with `active` pressed; another entry stores itself and goes to
 * `onSwitch`.
 */
export function modeRail(active: RailEntry, onSwitch: (entry: RailEntry) => void): HTMLElement {
  const rail = h("nav", "mode-rail");
  rail.setAttribute("aria-label", "Modes");
  for (const { entry, label, short } of RAIL) {
    if (entry === FIRST_BUILDER) {
      rail.appendChild(h("hr", "mode-rail-divider"));
    }
    const choice = button("", "mode-rail-entry", () => {
      if (entry !== active) {
        saveRail(entry);
        onSwitch(entry);
      }
    });
    const icon = h("span", "mode-rail-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("style", `--icon: url("${railIconUrl(entry)}")`);
    choice.append(icon, h("span", "mode-rail-label", short));
    choice.setAttribute("aria-label", label);
    choice.setAttribute("aria-pressed", String(entry === active));
    choice.title = label;
    choice.setAttribute("data-entry", entry);
    rail.appendChild(choice);
  }
  return rail;
}

/**
 * A rail screen (#1525): the rail on the left, and `body` beside it, the
 * screen's own, under its heading and one line saying what it is for.
 */
export function railScreen(
  root: HTMLElement,
  active: RailEntry,
  goal: string,
  onSwitch: (entry: RailEntry) => void,
): HTMLElement {
  const panel = h("div", `screen screen-rail screen-${active}`);
  const body = h("div", "rail-body");
  body.append(h("h2", "rail-title", railLabel(active)), h("p", "rail-goal", goal));
  panel.append(modeRail(active, onSwitch), body);
  root.replaceChildren(panel);
  return body;
}

import type { LobbyMode } from "@vibewars/game-protocol";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { button, h } from "./kit.js";
import { isAlone, partyStrip, type RailParty } from "./party-strip.js";

/**
 * The mode rail on the left of the menu (#1525, #1522 variant C): the
 * five modes, top to bottom, then Character Builder and Team Builder at
 * its bottom. Each entry is a screen of its own; the one shown is marked.
 * The modes are the lobby's (#1526): a guest's follow its host, and are
 * locked; the builders are everyone's.
 */

/** A screen the rail opens: a lobby's mode, or a builder. */
export type RailEntry = LobbyMode | "characters" | "teams";

/** A guest's mode entries say why they do not open (#1526). */
export const HOST_PICKS_MODE = "The host picks the mode";

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

/** Whether `entry` is one of the lobby's modes, not a builder. */
export function isModeEntry(entry: RailEntry): entry is LobbyMode {
  return entry !== "characters" && entry !== "teams";
}

/** The lobby the rail screens show, while there is one (#1526). */
let shownParty: RailParty | undefined;

/** The lobby every rail screen drawn from now on shows; the shell sets it on every change. */
export function setRailParty(party: RailParty | undefined): void {
  shownParty = party;
}

/** The lobby the rail screens show, if there is one. */
export function railParty(): RailParty | undefined {
  return shownParty;
}

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
 * `onSwitch`. A guest's modes other than its lobby's are locked, and a
 * guest stores no mode: its own rail is its own lobby's (#1526).
 */
export function modeRail(active: RailEntry, onSwitch: (entry: RailEntry) => void): HTMLElement {
  const rail = h("nav", "mode-rail");
  rail.setAttribute("aria-label", "Modes");
  const guest = shownParty !== undefined && !shownParty.isHost;
  for (const { entry, label, short } of RAIL) {
    if (entry === FIRST_BUILDER) {
      rail.appendChild(h("hr", "mode-rail-divider"));
    }
    const mode = isModeEntry(entry);
    const locked = guest && mode && entry !== shownParty?.mode;
    const choice = button("", "mode-rail-entry", () => {
      if (entry !== active && !locked) {
        if (!(guest && mode)) {
          saveRail(entry);
        }
        onSwitch(entry);
      }
    });
    const icon = h("span", "mode-rail-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("style", `--icon: url("${railIconUrl(entry)}")`);
    choice.append(icon, h("span", "mode-rail-label", short));
    choice.setAttribute("aria-label", label);
    choice.setAttribute("aria-pressed", String(entry === active));
    choice.title = locked ? HOST_PICKS_MODE : label;
    if (locked) {
      choice.setAttribute("aria-disabled", "true");
    }
    choice.setAttribute("data-entry", entry);
    rail.appendChild(choice);
  }
  return rail;
}

/**
 * Whether a lobby change draws the rail screen for `entry` again, last
 * drawn for `drawnEntry` (#1790): a mode's screen shows the party, and
 * a guest's mode follows its host's (#1526). A builder shows the party
 * only in its rail's locks, so it keeps its screen, and what is pasted
 * into it.
 */
export function redrawsOnLobbyChange(entry: RailEntry, drawnEntry: RailEntry): boolean {
  return isModeEntry(entry) || entry !== drawnEntry;
}

/**
 * The rail of the screen in `root` drawn again for `active`, under a
 * party that changed (#1790): its locks are the party's. The entry that
 * had the focus keeps it.
 */
export function redrawModeRail(
  root: HTMLElement,
  active: RailEntry,
  onSwitch: (entry: RailEntry) => void,
): void {
  const old = root.querySelector(".mode-rail");
  if (old === null) {
    return;
  }
  const focused = document.activeElement;
  const focusedEntry =
    focused !== null && old.contains(focused) ? focused.getAttribute("data-entry") : null;
  const rail = modeRail(active, onSwitch);
  old.replaceWith(rail);
  if (focusedEntry !== null) {
    rail.querySelector<HTMLElement>(`[data-entry="${focusedEntry}"]`)?.focus();
  }
}
/**
 * A rail screen (#1525): the rail on the left, and `body` beside it, the
 * screen's own, under its heading and one line saying what it is for. A
 * mode's has the party strip on top (#1526), once someone else is in it
 * (#1782): alone, the title bar already shows all it would.
 */
export function railScreen(
  root: HTMLElement,
  active: RailEntry,
  goal: string,
  onSwitch: (entry: RailEntry) => void,
): HTMLElement {
  const panel = h("div", `screen screen-rail screen-${active}`);
  const body = h("div", "rail-body");
  if (isModeEntry(active) && shownParty !== undefined && !isAlone(shownParty)) {
    body.appendChild(partyStrip(shownParty));
  }
  body.append(h("h2", "rail-title", railLabel(active)), h("p", "rail-goal", goal));
  panel.append(modeRail(active, onSwitch), body);
  root.replaceChildren(panel);
  return body;
}

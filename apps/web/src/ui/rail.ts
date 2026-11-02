import type { LobbyMode } from "@vibewars/game-protocol";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  isTeamBuildSize,
  isTeamSize,
  TEAM_BUILD_SIZES,
  type TeamBuildSize,
  type TeamSize,
} from "../storage/schema.js";
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

export type { TeamSize };

/** The size a screen starts at when it plays it, and the one others start closest to. */
export const DEFAULT_TEAM_SIZE: TeamSize = 4;

/**
 * The sizes each rail screen plays (#2022), smallest first: Team Arena's
 * its leader picks from (#2107), Team Builder's never 1v1 (#2141). A
 * builder's empty list disables the stepper.
 */
export const TEAM_SIZES_BY_ENTRY: Readonly<Record<RailEntry, readonly TeamSize[]>> = {
  "random-arena": [1, 2, 4],
  "team-arena": [2, 4, 8],
  "heroes-ascent": [8],
  gvg: [8],
  "hosted-game": [1, 2, 4, 8],
  characters: [],
  teams: TEAM_BUILD_SIZES,
};

/** The stepper's title on a screen with no team size. */
export const NO_TEAM_SIZE_HERE = "Team size is for team modes and Team Builds";
/** A lobby guest's stepper title: the host's size is everyone's. */
export const HOST_SETS_TEAM_SIZE = "The host sets the team size";
/** A queued party's stepper title: the queue is for the size it has (#2107). */
export const LEAVE_QUEUE_FOR_TEAM_SIZE = "Leave the queue to change the team size";

/** `size` as the stepper reads it, e.g. "2v2". */
export function teamSizeLabel(size: number): string {
  return `${String(size)}v${String(size)}`;
}

/**
 * The size `entry`'s screen opens at with nothing remembered (#2141):
 * 4v4 if it plays it, else its size closest to 4, the larger on a tie.
 * A builder without sizes reads 4v4, never shown.
 */
export function defaultTeamSize(entry: RailEntry): TeamSize {
  let best: TeamSize | undefined;
  for (const size of TEAM_SIZES_BY_ENTRY[entry]) {
    const distance = Math.abs(size - DEFAULT_TEAM_SIZE);
    if (best === undefined || distance <= Math.abs(best - DEFAULT_TEAM_SIZE)) {
      best = size;
    }
  }
  return best ?? DEFAULT_TEAM_SIZE;
}

const TEAM_SIZE_STORAGE_KEY = `${STORAGE_NAMESPACE}.teamSizeByEntry`;

/** Every screen's last pick, as stored; empty for anything unreadable. */
function storedTeamSizes(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TEAM_SIZE_STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // A convenience, like the rail entry: every screen opens at its default.
    return {};
  }
}

/**
 * The size last picked in `entry`'s screen (#2141), each screen its own;
 * its default for nothing stored, or a size it does not play.
 */
export function loadTeamSize(entry: RailEntry): TeamSize {
  const stored = storedTeamSizes()[entry];
  return isTeamSize(stored) && TEAM_SIZES_BY_ENTRY[entry].includes(stored)
    ? stored
    : defaultTeamSize(entry);
}

/** Team Builder's size: a new build's, never 1v1 (#2141). */
export function loadTeamBuildSize(): TeamBuildSize {
  const size = loadTeamSize("teams");
  return isTeamBuildSize(size) ? size : 4;
}

export function saveTeamSize(entry: RailEntry, size: TeamSize): void {
  try {
    localStorage.setItem(
      TEAM_SIZE_STORAGE_KEY,
      JSON.stringify({ ...storedTeamSizes(), [entry]: size }),
    );
  } catch {
    // Same reasoning as loading it.
  }
}

/** What the shown screen does when the team size changes; each rail screen sets its own. */
let teamSizeListener: ((size: TeamSize) => void) | undefined;

/**
 * The shown screen's answer to a team size change (#2022), e.g. Random
 * Arena's Ready. Drawing a rail screen clears it, so a screen gone from
 * view hears nothing.
 */
export function onTeamSizeChange(listener: (size: TeamSize) => void): void {
  teamSizeListener = listener;
}

/**
 * The team size stepper (#2141), `‹ 4v4 ›`, showing `value`, or `—` with
 * no size: ‹ steps to the next smaller size `entry` plays, › to the next
 * larger, an end's arrow disabled. Left and Right on a focused arrow step
 * too. A step is stored as `entry`'s own, then goes to `onPick`.
 */
export function teamSizeStepper(
  entry: RailEntry,
  value: number | undefined,
  disabled: boolean,
  onPick: (size: TeamSize) => void,
): HTMLElement {
  const sizes = TEAM_SIZES_BY_ENTRY[entry];
  const stepper = h("div", "mode-rail-stepper");
  stepper.setAttribute("data-entry", "team-size");
  stepper.setAttribute("role", "group");
  stepper.setAttribute("aria-label", "Team size");
  let shown = value;
  const next = (direction: -1 | 1): TeamSize | undefined => {
    if (shown === undefined) {
      return undefined;
    }
    const from = shown;
    return direction < 0
      ? sizes.findLast((size) => size < from)
      : sizes.find((size) => size > from);
  };
  const step = (direction: -1 | 1): void => {
    const size = next(direction);
    if (size === undefined || disabled) {
      return;
    }
    shown = size;
    saveTeamSize(entry, size);
    draw();
    // An arrow that reached its end hands the keys to the other one.
    if (direction < 0 ? smaller.disabled : larger.disabled) {
      (direction < 0 ? larger : smaller).focus();
    }
    onPick(size);
  };
  const arrow = (label: string, ariaLabel: string, direction: -1 | 1): HTMLButtonElement => {
    const node = button(label, "mode-rail-step", () => {
      step(direction);
    });
    node.setAttribute("aria-label", ariaLabel);
    node.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    return node;
  };
  const smaller = arrow("‹", "Smaller team", -1);
  const larger = arrow("›", "Larger team", 1);
  const size = h("span", "mode-rail-size-value");
  size.setAttribute("aria-live", "polite");
  const draw = (): void => {
    size.textContent = shown === undefined ? "—" : teamSizeLabel(shown);
    smaller.disabled = disabled || next(-1) === undefined;
    larger.disabled = disabled || next(1) === undefined;
  };
  draw();
  stepper.append(smaller, size, larger);
  return stepper;
}

/**
 * The rail's team size field (#2022): a builder without sizes disables
 * it all. A lobby guest's is locked, as its modes are (#1526); in a
 * Hosted Game or a Team Arena it shows the lobby's size, the host's pick
 * (#2104, #2107). There, a queued party's is locked too: the queue is
 * for the size it has.
 */
function teamSizeField(active: RailEntry, party: RailParty | undefined): HTMLElement {
  const guest = party !== undefined && !party.isHost;
  const noSizes = TEAM_SIZES_BY_ENTRY[active].length === 0;
  const queued = party?.mode === active && party.queuedMs !== null;
  const lobbySize =
    (active === "hosted-game" || active === "team-arena") && party?.mode === active
      ? party.teamSize
      : undefined;
  const stepper = teamSizeStepper(
    active,
    noSizes ? undefined : (lobbySize ?? loadTeamSize(active)),
    noSizes || guest || queued,
    (size) => {
      teamSizeListener?.(size);
    },
  );
  const field = h("div", "mode-rail-size");
  field.title = noSizes
    ? NO_TEAM_SIZE_HERE
    : guest
      ? HOST_SETS_TEAM_SIZE
      : queued
        ? LEAVE_QUEUE_FOR_TEAM_SIZE
        : "Team size";
  field.append(h("span", "mode-rail-label", "Team size"), stepper);
  return field;
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
      rail.append(teamSizeField(active, shownParty), h("hr", "mode-rail-divider"));
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
  teamSizeListener = undefined;
  const panel = h("div", `screen screen-rail screen-${active}`);
  const body = h("div", "rail-body");
  // Alone, the strip has nothing to say, unless the party is queued (#1766).
  if (
    isModeEntry(active) &&
    shownParty !== undefined &&
    (!isAlone(shownParty) || shownParty.queuedMs !== null)
  ) {
    body.appendChild(partyStrip(shownParty));
  }
  body.append(h("h2", "rail-title", railLabel(active)), h("p", "rail-goal", goal));
  panel.append(modeRail(active, onSwitch), body);
  root.replaceChildren(panel);
  return body;
}

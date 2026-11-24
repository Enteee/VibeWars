import type { LobbyMode } from "@vibewars/game-protocol";

import { t, type MessageKey } from "../i18n/index.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  isTeamBuildSize,
  isTeamSize,
  TEAM_BUILD_SIZES,
  type TeamBuildSize,
  type TeamSize,
} from "../storage/schema.js";
import { button, h, PUTS_AWAY, TUCKED_BEHIND } from "./kit.js";
import type { RailParty } from "./lobby-window.js";

/**
 * The mode rail on the left of the menu (#1525, #1522 variant C): the
 * five modes, top to bottom, then Character Builder, Team Builder and
 * Matches at its bottom. Each entry is a screen of its own; the one
 * shown is marked.
 * The modes are the lobby's (#1526): a guest's follow its host, and are
 * locked; the builders are everyone's.
 */

/** A screen the rail opens: a lobby's mode, a builder, or the Matches page. */
export type RailEntry = LobbyMode | "characters" | "teams" | "matches";

export interface RailItem {
  readonly entry: RailEntry;
  /** The screen's name, as its heading and the entry's hover read. */
  readonly label: MessageKey;
  /** Under the icon, short enough for 76 px. */
  readonly short: MessageKey;
}

/** The rail, top to bottom: the modes, then the builders after a divider. */
export const RAIL: readonly RailItem[] = [
  { entry: "random-arena", label: "rail.randomArena", short: "rail.randomArenaShort" },
  { entry: "team-arena", label: "rail.teamArena", short: "rail.teamArenaShort" },
  { entry: "heroes-ascent", label: "rail.heroesAscent", short: "rail.heroesAscentShort" },
  { entry: "gvg", label: "rail.gvg", short: "rail.gvgShort" },
  { entry: "hosted-game", label: "rail.hostedGame", short: "rail.hostedGameShort" },
  { entry: "characters", label: "rail.characters", short: "rail.charactersShort" },
  { entry: "teams", label: "rail.teams", short: "rail.teamsShort" },
  { entry: "matches", label: "rail.matches", short: "rail.matchesShort" },
];

/** The first builder: the divider goes above it. */
const FIRST_BUILDER: RailEntry = "characters";

/** Whether `entry` is one of the lobby's modes, not a builder or the Matches page. */
export function isModeEntry(entry: RailEntry): entry is LobbyMode {
  return entry !== "characters" && entry !== "teams" && entry !== "matches";
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
  matches: [],
};

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
 * too. A step goes to `onPick`; with `store`, it is stored as `entry`'s
 * own first, and the menu quest may point at it. A team editor's does
 * neither: its size is the build's, not the sidebar's (#3794).
 */
export function teamSizeStepper(
  entry: RailEntry,
  value: number | undefined,
  disabled: boolean,
  store: boolean,
  onPick: (size: TeamSize) => void,
): HTMLElement {
  const sizes = TEAM_SIZES_BY_ENTRY[entry];
  const stepper = h("div", "mode-rail-stepper");
  stepper.setAttribute("data-entry", "team-size");
  if (store) {
    // Team Builder's size is the new team's (#3542, #3794), a mode's who it
    // meets (#3544): the menu quest points at either.
    stepper.setAttribute("data-tutorial", entry === "teams" ? "team-build-size" : "team-size");
  }
  stepper.setAttribute("role", "group");
  stepper.setAttribute("aria-label", t("rail.teamSize"));
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
    if (store) {
      saveTeamSize(entry, size);
    }
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
  const smaller = arrow("‹", t("rail.smallerTeam"), -1);
  const larger = arrow("›", t("rail.largerTeam"), 1);
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
 * for the size it has; and in any queue, every mode screen shows the queued
 * size, locked; Team Builder builds at any (#2781).
 */
function teamSizeField(active: RailEntry, party: RailParty | undefined): HTMLElement {
  const guest = party !== undefined && !party.isHost;
  const noSizes = TEAM_SIZES_BY_ENTRY[active].length === 0;
  const queued =
    (queuedSize !== undefined && isModeEntry(active)) ||
    (party?.mode === active && party.queuedMs !== null);
  const lobbySize =
    (active === "hosted-game" || active === "team-arena") && party?.mode === active
      ? party.teamSize
      : undefined;
  const stepper = teamSizeStepper(
    active,
    noSizes
      ? undefined
      : ((isModeEntry(active) ? queuedSize : undefined) ?? lobbySize ?? loadTeamSize(active)),
    noSizes || guest || queued,
    true,
    (size) => {
      teamSizeListener?.(size);
    },
  );
  const field = h("div", "mode-rail-size");
  // With no size here, a lobby guest's (the host's size is everyone's), and a
  // queued party's (the queue is for the size it has, #2107) each say why.
  field.title = t(
    noSizes
      ? "rail.noTeamSizeHere"
      : guest
        ? "rail.hostSetsTeamSize"
        : queued
          ? "rail.leaveQueueForTeamSize"
          : "rail.teamSize",
  );
  field.append(h("span", "mode-rail-label", t("rail.teamSize")), stepper);
  return field;
}

/** The lobby the rail screens show, while there is one (#1526). */
let shownParty: RailParty | undefined;

/** The size this tab is queued at, Random or team (#2781), while it is: no size changes it. */
let queuedSize: number | undefined;

/** The queued size every rail screen drawn from now on shows; the shell sets it. */
export function setRailQueued(size: number | undefined): void {
  queuedSize = size;
}

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
  const item = RAIL.find((each) => each.entry === entry);
  return item === undefined ? "" : t(item.label);
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
  rail.id = RAIL_ID;
  rail.setAttribute("aria-label", t("rail.modes"));
  // What the menu quest points at (#3540): the rail, and each of its entries.
  rail.setAttribute("data-tutorial", "rail");
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
    choice.append(icon, h("span", "mode-rail-label", t(short)));
    choice.setAttribute("aria-label", t(label));
    choice.setAttribute("aria-pressed", String(entry === active));
    // A guest's mode entries say why they do not open (#1526).
    choice.title = t(locked ? "rail.hostPicksMode" : label);
    if (locked) {
      choice.setAttribute("aria-disabled", "true");
    }
    choice.setAttribute("data-entry", entry);
    choice.setAttribute("data-tutorial", `rail-${entry}`);
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
  // A closed drawer's rail stays tucked behind its toggle (#3924).
  const tucked = old.getAttribute(TUCKED_BEHIND);
  if (tucked !== null) {
    rail.setAttribute(TUCKED_BEHIND, tucked);
  }
  old.replaceWith(rail);
  if (focusedEntry !== null) {
    rail.querySelector<HTMLElement>(`[data-entry="${focusedEntry}"]`)?.focus();
  }
}

/** The rail's id, which its drawer's toggle controls (#3924). */
const RAIL_ID = "mode-rail";

/** The drawer's toggle's id: what a tucked rail stands behind. */
const DRAWER_TOGGLE_ID = "rail-drawer-toggle";

/** Where the rail is a drawer (#3924): a phone held upright, as the HUD's query (styles.css). */
const DRAWER_QUERY = "(pointer: coarse) and (width <= 30rem)";

/** What happens to the drawer (#3924). */
export type DrawerEvent =
  | { readonly kind: "toggle" }
  | { readonly kind: "entry"; readonly locked: boolean }
  | { readonly kind: "escape" }
  | { readonly kind: "press-outside"; readonly onScrim: boolean }
  | { readonly kind: "focus-left" }
  | { readonly kind: "layout" };

/** Where the focus goes after a drawer event: the pressed entry, the toggle, or where it is. */
export type DrawerFocus = "entry" | "toggle" | "none";

/**
 * The drawer after `event`, `open` before it (#3924): it opens and
 * closes on its toggle; choosing an entry, Esc, a press outside it, the
 * focus leaving it or the layout changing put it away. Nothing else in
 * it does: the size stepper leaves it open, to step and look. Opening focuses the shown entry;
 * closing gives the focus back to the toggle, unless an entry was chosen
 * or the press was on something else, which takes it.
 */
export function drawerNext(
  open: boolean,
  event: DrawerEvent,
): { readonly open: boolean; readonly focus: DrawerFocus } {
  switch (event.kind) {
    case "toggle":
      return { open: !open, focus: open ? "toggle" : "entry" };
    case "entry":
      return event.locked ? { open, focus: "none" } : { open: false, focus: "none" };
    case "escape":
      return { open: false, focus: open ? "toggle" : "none" };
    case "press-outside":
      return { open: false, focus: open && event.onScrim ? "toggle" : "none" };
    case "focus-left":
    case "layout":
      return { open: false, focus: "none" };
  }
}

/** The drawn rail screen's drawer, told what happened; none before one is drawn. */
let drawerListener: ((event: DrawerEvent) => void) | undefined;
let drawerWatched = false;

/**
 * A press anywhere but the drawer and its toggle puts it away, and so
 * does a turn of the phone out of the drawer's layout. One listener of
 * each for the page, told the rail screen drawn last.
 */
function watchDrawer(): void {
  if (drawerWatched) {
    return;
  }
  drawerWatched = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || drawerListener === undefined) {
      return;
    }
    // A press that redrew what it hit, like the size stepper redrawing
    // the rail, is no press outside: its target has left the page.
    if (target.isConnected && target.closest(`#${RAIL_ID}, #${DRAWER_TOGGLE_ID}`) === null) {
      drawerListener({
        kind: "press-outside",
        onScrim: target.closest(".rail-drawer-scrim") !== null,
      });
    }
  });
  matchMedia(DRAWER_QUERY).addEventListener("change", () => {
    drawerListener?.({ kind: "layout" });
  });
}

/**
 * A rail screen (#1525): the rail on the left, and `body` beside it, the
 * screen's own, under its heading. Who is in the party is the top bar's
 * Lobby window's (#2385), and whether it is queued its queue icon's (#2743).
 * On a phone held upright the rail is a drawer (#3924), behind a toggle
 * before the heading that shows the screen's icon.
 */
export function railScreen(
  root: HTMLElement,
  active: RailEntry,
  onSwitch: (entry: RailEntry) => void,
): HTMLElement {
  teamSizeListener = undefined;
  const panel = h("div", `screen screen-rail screen-${active}`);
  const body = h("div", "rail-body");
  const head = body.appendChild(h("div", "rail-head"));
  const toggle = button("", "rail-drawer-toggle", () => {
    tell({ kind: "toggle" });
  });
  toggle.id = DRAWER_TOGGLE_ID;
  toggle.setAttribute("aria-label", t("rail.open"));
  toggle.setAttribute("aria-controls", RAIL_ID);
  const icon = h("span", "mode-rail-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("style", `--icon: url("${railIconUrl(active)}")`);
  toggle.appendChild(icon);
  const title = h("h2", "rail-title", railLabel(active));
  head.append(toggle, title);
  // What the menu quest's modes step explains a mode beside (#3543): its
  // heading, so the lock keeps the screen's own controls out of reach.
  if (isModeEntry(active)) {
    title.setAttribute("data-tutorial", `mode-${active}`);
  }
  const rail = modeRail(active, onSwitch);
  const scrim = h("div", "rail-drawer-scrim");
  scrim.setAttribute(PUTS_AWAY, "");
  panel.append(rail, scrim, body);

  let open = false;
  // `shown` is the rail drawn now: a new team size swaps one in (setTeamSize).
  const paint = (shown: Element): void => {
    panel.classList.toggle("is-drawer-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      shown.removeAttribute(TUCKED_BEHIND);
    } else {
      shown.setAttribute(TUCKED_BEHIND, DRAWER_TOGGLE_ID);
    }
  };
  const tell = (event: DrawerEvent): void => {
    // A hand slides the drawer; a turn of the phone puts it away at once.
    panel.classList.toggle("is-drawer-sliding", event.kind !== "layout");
    const next = drawerNext(open, event);
    if (next.open === open && next.focus === "none") {
      return;
    }
    open = next.open;
    paint(panel.querySelector(".mode-rail") ?? rail);
    if (next.focus === "entry") {
      panel.querySelector<HTMLElement>('.mode-rail [aria-pressed="true"]')?.focus();
    } else if (next.focus === "toggle") {
      toggle.focus();
    }
  };
  paint(rail);
  // An entry's own click switches the screen first; this one, bubbling
  // after it, puts the drawer away.
  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".mode-rail") === null) {
      return;
    }
    const entry = target.closest(".mode-rail-entry");
    if (entry !== null) {
      tell({ kind: "entry", locked: entry.getAttribute("aria-disabled") === "true" });
    }
  });
  // Esc puts it away, prevented, so the menu's own Esc (kit.ts) does not go back too.
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      tell({ kind: "escape" });
    }
  });
  // Tab off the drawer's end puts it away; onto its toggle does not.
  panel.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    const from = event.target;
    if (
      open &&
      from instanceof Element &&
      from.closest(".mode-rail") !== null &&
      to instanceof Element &&
      to.closest(`#${RAIL_ID}, #${DRAWER_TOGGLE_ID}`) === null
    ) {
      tell({ kind: "focus-left" });
    }
  });
  drawerListener = tell;
  watchDrawer();
  root.replaceChildren(panel);
  return body;
}

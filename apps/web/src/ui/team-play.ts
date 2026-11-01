import type { LobbyMode } from "@vibewars/game-protocol";

import type { StoredTeam } from "../storage/schema.js";
import { loadStarterTeamId } from "../storage/starter-team.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { lookOfCharacter, teamFigureCard } from "./character-card.js";
import { professionLabel } from "./character-preview.js";
import { button, h, listenForPaste, screenBar } from "./kit.js";
import type { LobbyPanel } from "./lobby-screen.js";
import { railScreen, type RailEntry } from "./rail.js";

/**
 * The menu's team screens (#1525, #1522 variant C): a screen per team
 * mode, each the lobby on its own maps (#1526) above the Team Build
 * cards, Hosted Game, the lobby on every map, and Team Builder, the cards
 * alone. Team Builds are proposed and voted on in the Team Lobby (#1460),
 * never picked here (#1515). There are no team queues yet.
 */

/** A rail entry that shows the lobby. */
export type HostEntry = Exclude<LobbyMode, "random-arena">;

/** What each lobby screen says it is for. */
export const HOST_GOALS: Readonly<Record<HostEntry, string>> = {
  "team-arena": "Two teams, one arena: wipe the other side out, or outscore it.",
  "heroes-ascent": "Carry the relic, hold the altar, take the points.",
  gvg: "Storm the other guild's hall and kill its Guild Lord.",
  "hosted-game": "Any map, any rules: a lobby for friends with its key.",
};

/** Whether `entry` is a screen that shows the lobby. */
export function isHostEntry(entry: RailEntry): entry is HostEntry {
  return entry in HOST_GOALS;
}

/** Where the lobby goes while this tab has none yet (#1526). */
export const OPENING_LOBBY = "Opening your lobby…";

/** Under the cards while there are no Team Builds. */
export const NO_TEAM_BUILDS = "Make a team build to propose it in the Team Lobby.";

/** What Team Builder is for, under its heading. */
export const TEAM_BUILDER_GOAL = "Make and edit the Team Builds you propose in a Team Lobby.";

export interface TeamPlayCallbacks {
  /** Show another rail entry (#1525); the rail has stored it. */
  readonly onSwitch: (entry: RailEntry) => void;
  readonly onNewTeam: () => void;
  readonly onEditTeam: (id: string) => void;
  /** The random starter team's Clone (#2036): a copy of it, to edit. */
  readonly onCloneStarterTeam: (id: string) => void;
  /** The random starter team's Reroll (#2036): another curated team in its place. */
  readonly onRerollTeam: (id: string) => void;
  /** A team code was pasted on the screen (#577). */
  readonly onPasteTeam: (text: string) => void;
}

/**
 * `teams` in the order they show: the random starter team (#2036) last,
 * as the starter character is, so a Reroll never moves it.
 */
export function teamOrder(
  teams: readonly StoredTeam[],
  starterId: string | undefined,
): StoredTeam[] {
  return [...teams.filter((t) => t.id !== starterId), ...teams.filter((t) => t.id === starterId)];
}

/** The random starter team's card (#2036): never edited, Clone and Reroll instead. */
function starterTeamCard(
  members: Parameters<typeof teamFigureCard>[0]["members"],
  team: StoredTeam,
  callbacks: TeamPlayCallbacks,
): HTMLElement {
  const clone = button("Clone", "play-card-clone", () => {
    // One copy per press: a double-click must not save two.
    clone.disabled = true;
    callbacks.onCloneStarterTeam(team.id);
  });
  const card = teamFigureCard({
    title: team.name,
    tags: [h("span", "roster-random-tag", "Random")],
    members,
    actions: [
      clone,
      button("Reroll", "play-card-reroll", () => {
        callbacks.onRerollTeam(team.id);
      }),
    ],
  });
  // Dashed, not only tagged, as the starter character's (#1426).
  card.classList.add("is-random");
  return card;
}

/**
 * Whether the starter team's Reroll has the focus: it redraws the screen
 * under its own button, so the new card's Reroll takes the focus back, as
 * on Character Builder (#1425). Read before the screen is replaced.
 */
function rerollFocused(): boolean {
  return document.activeElement?.classList.contains("play-card-reroll") === true;
}

/** The Team Build cards, each opening in the editor as its Edit does, then New team build. */
function teamCards(
  body: HTMLElement,
  teams: readonly StoredTeam[],
  callbacks: TeamPlayCallbacks,
  rerolled: boolean,
): void {
  body.appendChild(h("h3", "menu-column-title", "Team Builds"));
  const starter = loadStarterTeamId();
  const cards = h("div", "play-cards");
  for (const team of teamOrder(teams, starter)) {
    const edit = (): void => {
      callbacks.onEditTeam(team.id);
    };
    // No cape: a team's members wear none, as in the lobby.
    const members = team.members.map(({ character }) => ({
      look: lookOfCharacter(character, undefined),
      label: `${character.name}, ${professionLabel(character.primaryProfession, character.secondaryProfession)}`,
    }));
    cards.appendChild(
      team.id === starter
        ? starterTeamCard(members, team, callbacks)
        : teamFigureCard({
            title: team.name,
            members,
            onOpen: edit,
            actions: [button("Edit", "play-card-edit", edit)],
          }),
    );
  }
  cards.appendChild(button("New team build", "play-card play-card-new", callbacks.onNewTeam));
  body.appendChild(cards);
  if (teams.length === 0) {
    body.appendChild(h("p", "team-play-hint", NO_TEAM_BUILDS));
  }
  if (rerolled) {
    cards.querySelector<HTMLElement>(".play-card-reroll")?.focus();
  }

  // A team code pasted here opens that team (#577); a single build code
  // is not a team, and is ignored. The screen has no dispose, so the
  // listener stops itself once it is off screen.
  const stopPaste = listenForPaste((text) => {
    if (!body.isConnected) {
      stopPaste();
      return false;
    }
    if (!looksLikeTeam(text)) {
      return false;
    }
    callbacks.onPasteTeam(text);
    return true;
  });
}

/** The screen's bar and rail, and why the last try failed. */
function teamScreen(
  root: HTMLElement,
  entry: RailEntry,
  goal: string,
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
  panel?: LobbyPanel,
): HTMLElement {
  screenBar({
    crumbs: ["VibeWars"],
    status: panel?.status ?? [],
    actions: panel?.actions ?? [],
    join: true,
  });
  const body = railScreen(root, entry, goal, callbacks.onSwitch);
  // Why the last try failed, under the bar it was tried from.
  if (connectionNotice !== undefined) {
    body.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }
  for (const problem of problems) {
    body.appendChild(h("div", "screen-problem", problem));
  }
  return body;
}

/**
 * Render a lobby's screen (#1525, #1526): Team Arena, Heroes' Ascent and
 * GvG show the lobby on their maps above the Team Build cards; Hosted
 * Game on every map (Q188). `panel` is the lobby, once there is one.
 */
export function renderHostScreen(
  root: HTMLElement,
  entry: HostEntry,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
  panel: LobbyPanel | undefined,
): void {
  const rerolled = rerollFocused();
  const body = teamScreen(
    root,
    entry,
    HOST_GOALS[entry],
    problems,
    connectionNotice,
    callbacks,
    panel,
  );
  body.appendChild(panel?.body ?? h("p", "screen-info", OPENING_LOBBY));
  if (entry !== "hosted-game") {
    teamCards(body, teams, callbacks, rerolled);
  }
}

/** Render Team Builder (#1525): the Team Build cards, to make and edit them. */
export function renderTeamBuilder(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
): void {
  const rerolled = rerollFocused();
  const body = teamScreen(root, "teams", TEAM_BUILDER_GOAL, problems, connectionNotice, callbacks);
  teamCards(body, teams, callbacks, rerolled);
}

import type { MatchMode } from "@vibewars/game-core";

import type { StoredTeam } from "../storage/schema.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { createCharacterDot } from "./character-preview.js";
import { button, h, listenForPaste, playCard, screenBar } from "./kit.js";
import { loadPlayerName } from "./player-section.js";
import { railScreen, type RailEntry } from "./rail.js";

/**
 * The menu's team screens (#1525, #1522 variant C): a screen per team
 * mode, each hosting a Team Lobby on its own maps above the Team Build
 * cards, Hosted Game, which hosts on every map, and Team Builder, the
 * cards alone. Team Builds are proposed and voted on in the Team Lobby
 * (#1460), never picked here (#1515). There are no team queues yet.
 */

/** A rail entry that hosts a Team Lobby. */
export type HostEntry = "team-arena" | "heroes-ascent" | "gvg" | "hosted-game";

/** What a hosting screen says it is for, and the modes its lobby's maps play. */
export interface HostScreen {
  readonly goal: string;
  /** `undefined`: every map. */
  readonly modes: readonly MatchMode[] | undefined;
}

export const HOST_SCREENS: Readonly<Record<HostEntry, HostScreen>> = {
  "team-arena": {
    goal: "Two teams, one arena: wipe the other side out, or outscore it.",
    modes: ["annihilation", "kill-count", "priest-annihilation"],
  },
  "heroes-ascent": {
    goal: "Carry the relic, hold the altar, take the points.",
    modes: ["relic-run", "king-of-the-hill", "capture-points"],
  },
  gvg: {
    goal: "Storm the other guild's hall and kill its Guild Lord.",
    modes: ["guild-battle"],
  },
  "hosted-game": {
    goal: "Any map, any rules: a lobby for friends with its key.",
    modes: undefined,
  },
};

/** Whether `entry` is a screen that hosts. */
export function isHostEntry(entry: RailEntry): entry is HostEntry {
  return entry in HOST_SCREENS;
}

/** Under the cards while there are no Team Builds. */
export const NO_TEAM_BUILDS = "Make a team build to propose it in the Team Lobby.";

/** What Team Builder is for, under its heading. */
export const TEAM_BUILDER_GOAL = "Make and edit the Team Builds you propose in a Team Lobby.";

export interface TeamPlayCallbacks {
  /** Host a Team Lobby as `name` whose host picks among `modes`' maps. */
  readonly onHost: (modes: HostScreen["modes"], name: string) => void;
  /** Show another rail entry (#1525); the rail has stored it. */
  readonly onSwitch: (entry: RailEntry) => void;
  readonly onNewTeam: () => void;
  readonly onEditTeam: (id: string) => void;
  /** A team code was pasted on the screen (#577). */
  readonly onPasteTeam: (text: string) => void;
}

/** A Team Build's characters, a badge and a name each. */
function members(team: StoredTeam): HTMLElement {
  const list = h("span", "play-card-members");
  for (const { character } of team.members) {
    const member = h("span", "play-card-member");
    member.append(
      createCharacterDot(character),
      h("span", "play-card-member-name", character.name),
    );
    list.appendChild(member);
  }
  return list;
}

/** The Team Build cards, each opening in the editor as its Edit does, then New team build. */
function teamCards(
  body: HTMLElement,
  teams: readonly StoredTeam[],
  callbacks: TeamPlayCallbacks,
): void {
  body.appendChild(h("h3", "menu-column-title", "Team Builds"));
  const cards = h("div", "play-cards");
  for (const team of teams) {
    const edit = (): void => {
      callbacks.onEditTeam(team.id);
    };
    cards.appendChild(
      playCard({
        name: team.name,
        content: [members(team)],
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
): HTMLElement {
  screenBar({ crumbs: ["VibeWars"], actions: [], join: true });
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
 * Render a hosting screen (#1525): Team Arena, Heroes' Ascent and GvG
 * host a Team Lobby on their maps above the Team Build cards; Hosted
 * Game hosts one on every map (Q188).
 */
export function renderHostScreen(
  root: HTMLElement,
  entry: HostEntry,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
): void {
  const { goal, modes } = HOST_SCREENS[entry];
  const body = teamScreen(root, entry, goal, problems, connectionNotice, callbacks);
  const host = h("div", "menu-row");
  host.appendChild(
    button(entry === "hosted-game" ? "Host a game" : "Host a Team Lobby", "primary", () => {
      callbacks.onHost(modes, loadPlayerName());
    }),
  );
  body.appendChild(host);
  if (entry !== "hosted-game") {
    teamCards(body, teams, callbacks);
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
  const body = teamScreen(root, "teams", TEAM_BUILDER_GOAL, problems, connectionNotice, callbacks);
  teamCards(body, teams, callbacks);
}

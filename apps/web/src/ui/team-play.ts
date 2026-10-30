import type { MatchMode } from "@vibewars/game-core";

import type { StoredTeam } from "../storage/schema.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { createCharacterDot } from "./character-preview.js";
import { button, h, listenForPaste, screenBar } from "./kit.js";
import { joinControls, loadPlayerName, playTabs, type PlayTab } from "./menu.js";

/**
 * Team Play (#1453, #1449 variant B, the card table): four mode tiles
 * across the top, each hosting a lobby on its own maps, and the Team
 * Build cards below, to make and edit them. A tile's lobby opens the
 * Team Lobby (#1460) once everyone is ready: Team Builds are proposed and
 * voted on there, never picked here (#1515).
 */

/** A mode tile: what it reads, and the modes its lobby's maps play. */
export interface TeamPlayTile {
  readonly label: string;
  /** `undefined`: every map. */
  readonly modes: readonly MatchMode[] | undefined;
}

/** The four tiles, as the study has them. There are no team queues yet: each hosts a lobby. */
export const TEAM_PLAY_TILES: readonly TeamPlayTile[] = [
  { label: "Hosted Lobby", modes: undefined },
  { label: "Team Arena", modes: ["annihilation", "kill-count", "priest-annihilation"] },
  { label: "Heroes' Ascent", modes: ["relic-run", "king-of-the-hill", "capture-points"] },
  { label: "GvG", modes: ["guild-battle"] },
];

/** Under the cards while there are no Team Builds. */
export const NO_TEAM_BUILDS = "Make a team build to propose it in the Team Lobby.";

export interface TeamPlayCallbacks {
  /** Host a lobby as `name` whose host picks among `tile`'s maps. */
  readonly onHostTile: (tile: TeamPlayTile, name: string) => void;
  readonly onJoinLobby: (code: string, name: string) => void;
  readonly onSwitchTab: (tab: PlayTab) => void;
  readonly onNewTeam: () => void;
  readonly onEditTeam: (id: string) => void;
  /** A team code was pasted on the screen (#577). */
  readonly onPasteTeam: (text: string) => void;
}

/** One Team Build card: a button that opens it in the editor, and its Edit beside. */
function teamCard(team: StoredTeam, onEdit: () => void): HTMLElement {
  const card = h("div", "team-play-card");
  const open = button("", "team-play-card-open", onEdit);
  const title = h("span", "team-play-card-name", team.name);
  title.title = team.name;
  open.append(title, members(team));
  card.append(open, button("Edit", "team-play-card-edit", onEdit));
  return card;
}

/** A Team Build's characters, a badge and a name each. */
function members(team: StoredTeam): HTMLElement {
  const list = h("span", "team-play-card-members");
  for (const { character } of team.members) {
    const member = h("span", "team-play-card-member");
    member.append(
      createCharacterDot(character),
      h("span", "team-play-card-member-name", character.name),
    );
    list.appendChild(member);
  }
  return list;
}

export function renderTeamPlay(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-team-play");
  screenBar({
    crumbs: ["VibeWars"],
    status: [playTabs("team", callbacks.onSwitchTab)],
    actions: [],
  });

  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  const tiles = h("div", "team-play-tiles");
  for (const tile of TEAM_PLAY_TILES) {
    tiles.appendChild(
      button(tile.label, "team-play-tile", () => {
        callbacks.onHostTile(tile, loadPlayerName());
      }),
    );
  }
  panel.appendChild(tiles);

  // Why the last try failed, right by the ways to try again.
  if (connectionNotice !== undefined) {
    panel.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }
  panel.append(...joinControls(panel, loadPlayerName, callbacks.onJoinLobby));

  panel.appendChild(h("h2", "menu-column-title", "Team Builds"));
  const cards = h("div", "team-play-cards");
  for (const team of teams) {
    cards.appendChild(
      teamCard(team, () => {
        callbacks.onEditTeam(team.id);
      }),
    );
  }
  cards.appendChild(button("New team build", "team-play-card team-play-new", callbacks.onNewTeam));
  panel.appendChild(cards);
  if (teams.length === 0) {
    panel.appendChild(h("p", "team-play-hint", NO_TEAM_BUILDS));
  }

  root.appendChild(panel);

  // A team code pasted here opens that team (#577); a single build code
  // is not a team, and is ignored. The screen has no dispose, so the
  // listener stops itself once it is off screen.
  const stopPaste = listenForPaste((text) => {
    if (!panel.isConnected) {
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

import type { MatchMode } from "@vibewars/game-core";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredTeam } from "../storage/schema.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { createCharacterDot } from "./character-preview.js";
import { button, h, listenForPaste, screenBar } from "./kit.js";
import { joinControls, loadPlayerName, playTabs, type PlayTab } from "./menu.js";

/**
 * Team Play (#1453, #1449 variant B, the card table): four mode tiles
 * across the top, each hosting a lobby on its own maps, and the Team
 * Build cards below, "None" first. A tile's lobby opens the Team Lobby
 * (#1460) once everyone is ready, and proposes the pick there.
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

const TEAM_BUILD_STORAGE_KEY = `${STORAGE_NAMESPACE}.activeTeamBuildId`;

/**
 * The Team Build picked, if it is one of `teams`; `undefined` is None,
 * "the team decides", and so is a pick of one since deleted.
 */
export function loadActiveTeamBuildId(teams: readonly StoredTeam[]): string | undefined {
  let stored: string | null;
  try {
    stored = localStorage.getItem(TEAM_BUILD_STORAGE_KEY);
  } catch {
    // Private browsing can throw on localStorage access: None.
    return undefined;
  }
  return teams.some((team) => team.id === stored) ? (stored ?? undefined) : undefined;
}

/** Pick `id`, or None for `undefined`. */
export function saveActiveTeamBuildId(id: string | undefined): void {
  try {
    if (id === undefined) {
      localStorage.removeItem(TEAM_BUILD_STORAGE_KEY);
    } else {
      localStorage.setItem(TEAM_BUILD_STORAGE_KEY, id);
    }
  } catch {
    // A convenience, not a requirement.
  }
}

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

/** One Team Build card, or None's: a button that picks it, and its Edit beside. */
function teamCard(
  name: string,
  detail: HTMLElement,
  picked: boolean,
  onPick: () => void,
  edit: HTMLButtonElement | undefined,
): HTMLElement {
  const card = h("div", "team-play-card");
  card.classList.toggle("is-picked", picked);
  const choose = button("", "team-play-card-choose", onPick);
  choose.setAttribute("aria-pressed", String(picked));
  const title = h("span", "team-play-card-name", name);
  title.title = name;
  choose.append(title, detail);
  card.appendChild(choose);
  if (edit !== undefined) {
    card.appendChild(edit);
  }
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

  panel.appendChild(h("h2", "menu-column-title", "Team Build"));
  const cards = h("div", "team-play-cards");
  // Picking repaints the cards in place: nothing else on the screen changes.
  const paint = (picked: string | undefined): void => {
    const pick = (id: string | undefined): void => {
      saveActiveTeamBuildId(id);
      paint(id);
      cards.querySelector<HTMLElement>(".is-picked .team-play-card-choose")?.focus();
    };
    const none = teamCard(
      "None",
      h("span", "team-play-card-detail", "the team decides"),
      picked === undefined,
      () => {
        pick(undefined);
      },
      undefined,
    );
    none.classList.add("is-none");
    const built = teams.map((team) =>
      teamCard(
        team.name,
        members(team),
        team.id === picked,
        () => {
          pick(team.id);
        },
        button("Edit", "team-play-card-edit", () => {
          callbacks.onEditTeam(team.id);
        }),
      ),
    );
    const add = button("New team build", "team-play-card team-play-new", callbacks.onNewTeam);
    cards.replaceChildren(none, ...built, add);
  };
  paint(loadActiveTeamBuildId(teams));
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

import { LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

/**
 * The lobby screen (brief §21's lobby layout): the shareable code, both
 * team rosters, ready state, map, and the host's start button.
 */

export interface LobbyScreenCallbacks {
  readonly onSelectMap: (mapId: string) => void;
  readonly onChooseTeam: (team: 0 | 1 | null) => void;
  readonly onToggleReady: () => void;
  readonly onStart: () => void;
  readonly onLeave: () => void;
}

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

/** The teams a player can pick. Two for now; the map decides capacity. */
export const SELECTABLE_TEAMS = [0, 1] as const;

export const MATCH_RUNNING_NOTICE = "A match is still running. The lobby opens again when it ends.";

/** A lobby code as it is read aloud: `ABCDEF` as `ABC-DEF` (#379). */
export function displayLobbyCode(code: string): string {
  const half = LOBBY_CODE_LENGTH / 2;
  return code.length === LOBBY_CODE_LENGTH ? `${code.slice(0, half)}-${code.slice(half)}` : code;
}

/**
 * Which lobby controls work right now. Apart from the DOM so the rules
 * can be tested without one.
 *
 * Outside "waiting" the server refuses every change but leaving (#44),
 * so those controls are disabled. While the lobby's match runs, a line
 * also says why: a player who quit early would otherwise face a lobby
 * that looks open and ignores them. It goes once the phase is back to
 * "waiting". "starting" gets no line, because no match is running yet.
 */
export interface LobbyControls {
  readonly running: string | undefined;
  readonly mapDisabled: boolean;
  readonly teamsDisabled: boolean;
  readonly readyDisabled: boolean;
  readonly startDisabled: boolean;
}

export function lobbyControls(snapshot: LobbySnapshot): LobbyControls {
  const waiting = snapshot.phase === "waiting";
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const assigned = snapshot.players.filter((p) => p.team !== null);
  return {
    running: snapshot.phase === "in-match" ? MATCH_RUNNING_NOTICE : undefined,
    mapDisabled: !waiting,
    teamsDisabled: !waiting,
    // Readiness is meaningless without a team, so the control is disabled
    // rather than silently doing nothing when pressed.
    readyDisabled: !waiting || self === undefined || self.team === null,
    startDisabled: !waiting || assigned.length === 0 || !assigned.every((p) => p.ready),
  };
}

export function renderLobbyScreen(
  root: HTMLElement,
  snapshot: LobbySnapshot,
  callbacks: LobbyScreenCallbacks,
  notice: string | undefined,
  availableMaps: readonly { readonly id: string; readonly name: string }[] = [],
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-lobby");
  const controls = lobbyControls(snapshot);

  const header = h("div", "lobby-header");
  header.appendChild(h("span", "lobby-code-label", "lobby code"));
  // The code is the one thing a host reads aloud, so it gets the most
  // visual weight on the screen.
  header.appendChild(h("span", "lobby-code", displayLobbyCode(snapshot.code)));
  panel.appendChild(header);

  // Only the host may change the map, so everyone else sees it as a
  // label rather than a control they would be refused on clicking.
  if (snapshot.isHost && availableMaps.length > 1) {
    const mapRow = h("label", "lobby-map");
    mapRow.appendChild(h("span", "field-label", "map"));
    const select = document.createElement("select");
    for (const map of availableMaps) {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = map.name;
      select.appendChild(option);
    }
    select.value = snapshot.mapId;
    select.disabled = controls.mapDisabled;
    select.addEventListener("change", () => {
      callbacks.onSelectMap(select.value);
    });
    mapRow.appendChild(select);
    panel.appendChild(mapRow);
  } else {
    const current = availableMaps.find((map) => map.id === snapshot.mapId);
    panel.appendChild(h("div", "lobby-map", `map: ${current?.name ?? snapshot.mapId}`));
  }

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);

  const teams = h("div", "lobby-teams");
  for (const team of SELECTABLE_TEAMS) {
    const column = h("div", "lobby-team");
    column.appendChild(h("h3", "lobby-team-title", `team ${String(team + 1)}`));

    const members = snapshot.players.filter((p) => p.team === team);
    if (members.length === 0) {
      column.appendChild(h("div", "lobby-slot-empty", "empty"));
    }
    for (const member of members) {
      const row = h("div", "lobby-slot");
      row.appendChild(
        h(
          "span",
          member.ready ? "lobby-player is-ready" : "lobby-player",
          `${member.name}${member.isHost ? " (host)" : ""}`,
        ),
      );
      row.appendChild(h("span", "lobby-ready", member.ready ? "ready" : "…"));
      column.appendChild(row);
    }

    const join = button(`join team ${String(team + 1)}`, "", () => {
      callbacks.onChooseTeam(team);
    });
    join.disabled = controls.teamsDisabled;
    column.appendChild(join);
    teams.appendChild(column);
  }
  panel.appendChild(teams);

  const spectators = snapshot.players.filter((p) => p.team === null);
  if (spectators.length > 0) {
    panel.appendChild(
      h("div", "lobby-spectators", `spectating: ${spectators.map((p) => p.name).join(", ")}`),
    );
  }

  // Nothing went wrong, so this is not a `screen-problem`.
  if (controls.running !== undefined) {
    panel.appendChild(h("div", "screen-info lobby-running", controls.running));
  }

  const actions = h("div", "menu-row");

  const readyLabel = self?.ready === true ? "not ready" : "ready";
  const readyButton = button(readyLabel, "", callbacks.onToggleReady);
  readyButton.disabled = controls.readyDisabled;
  actions.appendChild(readyButton);

  if (snapshot.isHost) {
    const start = button("start match", "primary", callbacks.onStart);
    start.disabled = controls.startDisabled;
    actions.appendChild(start);
  }

  actions.appendChild(button("leave", "", callbacks.onLeave));
  panel.appendChild(actions);

  root.appendChild(panel);
}

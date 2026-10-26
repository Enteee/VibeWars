import { LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

import { button, h, screenBar } from "./kit.js";

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

/** An arena the host may pick, and how big it plays (#444). */
export interface LobbyMap {
  readonly id: string;
  readonly name: string;
  readonly size: string;
}

/** The arena as the picker names it: its name, then its size class, e.g. "Long Hall (large)". */
export function mapLabel(map: LobbyMap): string {
  return `${map.name} (${map.size})`;
}

export function renderLobbyScreen(
  root: HTMLElement,
  snapshot: LobbySnapshot,
  callbacks: LobbyScreenCallbacks,
  notice: string | undefined,
  availableMaps: readonly LobbyMap[] = [],
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-lobby");
  const controls = lobbyControls(snapshot);

  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);

  const header = h("div", "lobby-header");
  header.appendChild(h("span", "lobby-code-label", "Lobby code"));
  // The code is the one thing a host reads aloud, so it gets the most
  // visual weight on the screen.
  header.appendChild(h("span", "lobby-code", displayLobbyCode(snapshot.code)));

  const readyLabel = self?.ready === true ? "Not ready" : "Ready";
  const readyButton = button(readyLabel, "", callbacks.onToggleReady);
  readyButton.disabled = controls.readyDisabled;
  const actions: HTMLElement[] = [readyButton];
  if (snapshot.isHost) {
    const start = button("Start match", "primary", callbacks.onStart);
    start.disabled = controls.startDisabled;
    actions.push(start);
  }
  panel.appendChild(
    screenBar({
      back: { label: "Leave", onBack: callbacks.onLeave },
      title: [header],
      actions,
    }).element,
  );

  // Only the host may change the map, so everyone else sees it as a
  // label rather than a control they would be refused on clicking.
  if (snapshot.isHost && availableMaps.length > 1) {
    const mapRow = h("label", "lobby-map");
    mapRow.appendChild(h("span", "field-label", "Map"));
    const select = document.createElement("select");
    for (const map of availableMaps) {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = mapLabel(map);
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
    panel.appendChild(
      h("div", "lobby-map", `Map: ${current === undefined ? snapshot.mapId : mapLabel(current)}`),
    );
  }

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  const teams = h("div", "lobby-teams");
  for (const team of SELECTABLE_TEAMS) {
    const column = h("div", "lobby-team");
    column.appendChild(h("h3", "lobby-team-title", `Team ${String(team + 1)}`));

    const members = snapshot.players.filter((p) => p.team === team);
    if (members.length === 0) {
      column.appendChild(h("div", "lobby-slot-empty", "Empty"));
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
      row.appendChild(h("span", "lobby-ready", member.ready ? "Ready" : "…"));
      column.appendChild(row);
    }

    const join = button(`Join team ${String(team + 1)}`, "", () => {
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
      h("div", "lobby-spectators", `Spectating: ${spectators.map((p) => p.name).join(", ")}`),
    );
  }

  // Nothing went wrong, so this is not a `screen-problem`.
  if (controls.running !== undefined) {
    panel.appendChild(h("div", "screen-info lobby-running", controls.running));
  }

  root.appendChild(panel);
}

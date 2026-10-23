import type { LobbySnapshot } from "../net/lobby-client.js";

/**
 * The lobby screen (brief §21's lobby layout): the shareable code, both
 * team rosters, ready state, map, and the host's start button.
 */

export interface LobbyScreenCallbacks {
  readonly onSelectMap: (mapId: string) => void;
  readonly onChooseTeam: (team: number | null) => void;
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

export function renderLobbyScreen(
  root: HTMLElement,
  snapshot: LobbySnapshot,
  callbacks: LobbyScreenCallbacks,
  notice: string | undefined,
  availableMaps: readonly { readonly id: string; readonly name: string }[] = [],
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-lobby");

  const header = h("div", "lobby-header");
  header.appendChild(h("span", "lobby-code-label", "lobby code"));
  // The code is the one thing a host reads aloud, so it gets the most
  // visual weight on the screen.
  header.appendChild(h("span", "lobby-code", snapshot.code));
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

    column.appendChild(
      button(`join team ${String(team + 1)}`, "", () => {
        callbacks.onChooseTeam(team);
      }),
    );
    teams.appendChild(column);
  }
  panel.appendChild(teams);

  const spectators = snapshot.players.filter((p) => p.team < 0);
  if (spectators.length > 0) {
    panel.appendChild(
      h("div", "lobby-spectators", `spectating: ${spectators.map((p) => p.name).join(", ")}`),
    );
  }

  const actions = h("div", "menu-row");

  const readyLabel = self?.ready === true ? "not ready" : "ready";
  const readyButton = button(readyLabel, "", callbacks.onToggleReady);
  // Readiness is meaningless without a team, so the control is disabled
  // rather than silently doing nothing when pressed.
  readyButton.disabled = self === undefined || self.team < 0;
  actions.appendChild(readyButton);

  if (snapshot.isHost) {
    const assigned = snapshot.players.filter((p) => p.team >= 0);
    const start = button("start match", "primary", callbacks.onStart);
    start.disabled = assigned.length === 0 || !assigned.every((p) => p.ready);
    actions.appendChild(start);
  }

  actions.appendChild(button("leave", "", callbacks.onLeave));
  panel.appendChild(actions);

  root.appendChild(panel);
}

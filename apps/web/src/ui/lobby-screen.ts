import type { MatchMode } from "@vibewars/game-core";
import { LOBBY_CODE_LENGTH } from "@vibewars/game-protocol";
import type { LobbyCharacter, LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import type { RenderableActor } from "../render/arena-snapshot.js";
import { createProfessionDot, professionLabel } from "./character-preview.js";
import { button, h, inlineConfirm, screenBar, toast, type InlineConfirm } from "./kit.js";
import { relayLine } from "./relay-section.js";

/**
 * The lobby screen (brief §21's lobby layout, #580): the bar holds Leave,
 * the shareable code with Copy, the map and Start; below it, both team
 * rosters with each player's character and ready state, and who Start is
 * waiting for.
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

/**
 * Why Start is disabled while the lobby waits (#580), naming the players
 * it waits for; `undefined` when it is not waiting on anyone.
 */
export function waitingFor(snapshot: LobbySnapshot): string | undefined {
  if (snapshot.phase !== "waiting") {
    return undefined;
  }
  const assigned = snapshot.players.filter((p) => p.team !== null);
  if (assigned.length === 0) {
    return "Waiting for someone to join a team";
  }
  const notReady = assigned.filter((p) => !p.ready).map((p) => p.name);
  return notReady.length === 0 ? undefined : `Waiting for ${notReady.join(", ")} to ready up`;
}

/** "Mhenlo · Monk / Elementalist", or "Random starter build" without a usable one (#580, #853). */
export function characterLine(character: LobbyCharacter | null): string {
  if (character === null) {
    return RANDOM_STARTER;
  }
  const professions = professionLabel(character.primary, character.secondary ?? undefined);
  return `${character.name} · ${professions}`;
}

export const RANDOM_STARTER = "Random starter build";
export const COPIED = "Copied";
export const COPY_BY_HAND = "Could not copy: the code is selected, copy it by hand";

/**
 * Copy the code to the clipboard, and say so. A browser may refuse the
 * clipboard, or not offer one off https: the code is then selected, so
 * the player's own copy takes it, and the toast says to.
 */
async function copyCode(code: string, shown: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    toast(COPIED);
  } catch {
    const selection = window.getSelection();
    selection?.selectAllChildren(shown);
    toast(COPY_BY_HAND);
  }
}

/** How the arena will paint `player` for whoever is looking: you, your side, or theirs. */
function dotTeam(
  player: LobbyPlayerSnapshot,
  self: LobbyPlayerSnapshot | undefined,
): RenderableActor["team"] {
  if (player.sessionId === self?.sessionId) {
    return "self";
  }
  // A spectator watches team 1 as its own side, so the two still differ.
  return player.team === (self?.team ?? 0) ? "ally" : "enemy";
}

/** An arena the host may pick, how big it plays (#444), and the mode it plays (#476). */
export interface LobbyMap {
  readonly id: string;
  readonly name: string;
  readonly size: string;
  readonly mode: MatchMode;
}

/** What each mode is, in a line, as the lobby shows it under the map (#476). */
const MODE_LINES: Readonly<Record<MatchMode, string>> = {
  annihilation: "Annihilation: defeat every foe",
  "kill-count": "Kill Count: most kills in 3 minutes",
  "priest-annihilation": "Priest Annihilation: defeat every foe and their priest",
};

/** The mode `map` plays, in a line: "Kill Count: most kills in 3 minutes". */
export function modeLine(map: LobbyMap): string {
  return MODE_LINES[map.mode];
}

/** The arena as the picker names it: its name, then its size class, e.g. "Long Hall (large)". */
export function mapLabel(map: LobbyMap): string {
  return `${map.name} (${map.size})`;
}

/**
 * A host's Leave, while it asks whether to close the lobby for everyone.
 * Kept across renders: the lobby redraws on every change, and a guest
 * pressing Ready must not answer the host's question for them.
 */
let closingLobby: InlineConfirm | undefined;

export function renderLobbyScreen(
  root: HTMLElement,
  snapshot: LobbySnapshot,
  callbacks: LobbyScreenCallbacks,
  notice: string | undefined,
  availableMaps: readonly LobbyMap[] = [],
): void {
  const wasAsking = closingLobby?.isOpen() === true;
  closingLobby?.dismiss();
  closingLobby = undefined;
  root.replaceChildren();
  const panel = h("div", "screen screen-lobby");
  const controls = lobbyControls(snapshot);

  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);

  const header = h("div", "lobby-header");
  header.appendChild(h("span", "lobby-code-label", "Lobby code"));
  // The code is the one thing a host reads aloud, so it gets the most
  // visual weight on the screen.
  const code = h("span", "lobby-code", displayLobbyCode(snapshot.code));
  header.appendChild(code);
  header.appendChild(
    button("Copy", "lobby-copy", () => {
      void copyCode(displayLobbyCode(snapshot.code), code);
    }),
  );

  // Only the host may change the map, so everyone else sees it as a
  // label rather than a control they would be refused on clicking.
  const current = availableMaps.find((map) => map.id === snapshot.mapId);
  let mapPart: HTMLElement;
  if (snapshot.isHost && availableMaps.length > 1) {
    mapPart = h("label", "lobby-map");
    mapPart.appendChild(h("span", "field-label", "Map"));
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
    mapPart.appendChild(select);
  } else {
    mapPart = h(
      "div",
      "lobby-map",
      `Map: ${current === undefined ? snapshot.mapId : mapLabel(current)}`,
    );
  }

  // The mode follows from the map (#476), so it reads under it.
  const mapBlock = h("div", "lobby-map-block");
  mapBlock.appendChild(mapPart);
  if (current !== undefined) {
    mapBlock.appendChild(h("div", "lobby-mode", modeLine(current)));
  }

  const readyLabel = self?.ready === true ? "Not ready" : "Ready";
  const readyButton = button(readyLabel, "", callbacks.onToggleReady);
  readyButton.disabled = controls.readyDisabled;
  const actions: HTMLElement[] = [readyButton];
  if (snapshot.isHost) {
    const start = button("Start match", "primary", () => {
      // Starting answers the question: the host is staying.
      closingLobby?.dismiss();
      callbacks.onStart();
    });
    start.disabled = controls.startDisabled;
    actions.push(start);
  }
  // A host's lobby ends with it: with anyone else in it, Leave (or Esc)
  // asks first, so one stray press does not send everyone to the menu.
  const othersHere = snapshot.players.some((p) => p.sessionId !== snapshot.selfSessionId);
  const askToClose = (): void => {
    closingLobby = inlineConfirm(
      back,
      "Close the lobby for everyone?",
      "Close lobby",
      callbacks.onLeave,
      "Stay",
    );
  };
  const { element: bar, back } = screenBar({
    back: {
      label: "Leave",
      onBack: () => {
        if (snapshot.isHost && othersHere) {
          askToClose();
        } else {
          callbacks.onLeave();
        }
      },
    },
    title: [header],
    status: [mapBlock],
    actions,
  });
  panel.appendChild(bar);

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  const relay = relayLine();
  if (relay !== undefined) {
    panel.appendChild(relay);
  }

  // Everyone sees it, not only the host: a guest who is the one being
  // waited for should know.
  const waiting = waitingFor(snapshot);
  if (waiting !== undefined) {
    panel.appendChild(h("div", "screen-info lobby-waiting", waiting));
  }

  const teams = h("div", "lobby-teams");
  for (const team of SELECTABLE_TEAMS) {
    const column = h("div", "lobby-team");
    const title = h("div", "lobby-team-header");
    title.appendChild(h("h3", "lobby-team-title", `Team ${String(team + 1)}`));
    const join = button("Join", "lobby-join", () => {
      callbacks.onChooseTeam(team);
    });
    join.setAttribute("aria-label", `Join team ${String(team + 1)}`);
    join.disabled = controls.teamsDisabled || self?.team === team;
    title.appendChild(join);
    column.appendChild(title);

    const members = snapshot.players.filter((p) => p.team === team);
    if (members.length === 0) {
      column.appendChild(h("div", "lobby-slot-empty", "Empty"));
    }
    for (const member of members) {
      column.appendChild(playerRow(member, self));
    }
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
  if (wasAsking && snapshot.isHost && othersHere && snapshot.phase === "waiting") {
    askToClose();
  }
}

/** One player on a team: dot, name, the character they bring, and a ready pill. */
function playerRow(
  member: LobbyPlayerSnapshot,
  self: LobbyPlayerSnapshot | undefined,
): HTMLElement {
  const row = h("div", "lobby-slot");
  const { character } = member;
  row.appendChild(
    character === null
      ? h("span", "character-dot is-house", "?")
      : createProfessionDot(
          character.primary,
          character.secondary ?? undefined,
          dotTeam(member, self),
        ),
  );
  const text = h("span", "lobby-slot-text");
  text.appendChild(h("span", "lobby-player", `${member.name}${member.isHost ? " (host)" : ""}`));
  text.appendChild(h("span", "lobby-character", characterLine(character)));
  row.appendChild(text);
  row.appendChild(
    h(
      "span",
      member.ready ? "lobby-ready is-ready" : "lobby-ready",
      member.ready ? "Ready" : "Not ready",
    ),
  );
  return row;
}

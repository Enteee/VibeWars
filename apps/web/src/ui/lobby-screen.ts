import type { MatchMode } from "@vibewars/game-core";
import { LOBBY_CODE_LENGTH, MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import type { LobbyCharacter, LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import type { RenderableActor } from "../render/arena-snapshot.js";
import { createProfessionDot, professionLabel } from "./character-preview.js";
import { button, h, toast } from "./kit.js";
import { relayLine } from "./relay-section.js";
import { botTagElement } from "./bot-tag.js";
import { playerLabelElement } from "./player-label.js";

/**
 * The lobby (brief §21's lobby layout, #580) as a mode screen shows it
 * (#1526): the map and Start in the bar, both team rosters below.
 */

export interface LobbyScreenCallbacks {
  readonly onSelectMap: (mapId: string) => void;
  readonly onChooseTeam: (team: 0 | 1 | null) => void;
  readonly onToggleReady: () => void;
  readonly onStart: () => void;
  /** A member on no team, while the match runs (#480): watch it, late. */
  readonly onWatch: () => void;
  /** Host only (#1454): `team` has `count` bots. */
  readonly onSetBots: (team: 0 | 1, count: number) => void;
}

/**
 * A team mode's matchmaking (#1766, ADR-0042): the party is one side,
 * and its host queues it for another instead of starting.
 */
export interface LobbyMatchmaking {
  /** How long the party has looked for a team; `null` while it is not queued. */
  readonly queuedMs: number | null;
  readonly onFindMatch: () => void;
  readonly onLeaveQueue: () => void;
  readonly onPlayHouseTeam: () => void;
}

/** The host may play the house team after this long with no other team (Q191). */
export const HOUSE_TEAM_AFTER_MS = 60_000;
/** A guest's word on a team-mode screen: matchmaking is the host's. */
export const HOST_STARTS_MATCHMAKING = "The host starts matchmaking";

/** The teams a player can pick. Two for now; the map decides capacity. */
export const SELECTABLE_TEAMS = [0, 1] as const;

export const MATCH_RUNNING_NOTICE = "A match is still running. The lobby opens again when it ends.";

/** A lobby key as it is read aloud: `ACDEFGHJKMNP` as `ACDE-FGHJ-KMNP` (#379, #1681). */
export function displayLobbyCode(code: string): string {
  return code.length === LOBBY_CODE_LENGTH ? (code.match(/.{4}/g) ?? []).join("-") : code;
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
  /** The bot count's + (#1454): a bot takes a seat like anyone, so a full lobby has none for it. */
  readonly botsDisabled: boolean;
  /** Watch (#480): only for a member on no team, and only while the match runs. */
  readonly canWatch: boolean;
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
    botsDisabled: !waiting || snapshot.players.length >= MAX_LOBBY_PLAYERS,
    canWatch: snapshot.phase === "in-match" && self?.team === null,
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

/**
 * "Mhenlo · Monk / Elementalist", or "Random starter build" without a
 * usable one (#580, #853). A bot's character is named after the bot, so
 * its line is the professions alone (#1241).
 */
export function characterLine(character: LobbyCharacter | null, bot: boolean): string {
  if (character === null) {
    return RANDOM_STARTER;
  }
  const professions = professionLabel(character.primary, character.secondary ?? undefined);
  return bot ? professions : `${character.name} · ${professions}`;
}

export const RANDOM_STARTER = "Random starter build";
export const COPIED = "Copied";
export const COPY_BY_HAND = "Could not copy: the key is selected, copy it by hand";

/**
 * Copy the code to the clipboard, and say so. A browser may refuse the
 * clipboard, or not offer one off https: the code is then selected, so
 * the player's own copy takes it, and the toast says to.
 */
export async function copyCode(code: string, shown: HTMLElement): Promise<void> {
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

/**
 * The maps a host may pick from (#1453): those playing one of `modes`, a
 * mode screen's (#1525), in `maps`' order; every map for `undefined`.
 */
export function hostMaps(
  maps: readonly LobbyMap[],
  modes: readonly MatchMode[] | undefined,
): LobbyMap[] {
  return maps.filter((map) => modes === undefined || modes.includes(map.mode));
}

/** What each mode is, in a line, as the lobby shows it under the map (#476). */
const MODE_LINES: Readonly<Record<MatchMode, string>> = {
  annihilation: "Annihilation: defeat every foe",
  "kill-count": "Kill Count: most kills in 3 minutes",
  "priest-annihilation": "Priest Annihilation: defeat every foe and their priest",
  "guild-battle": "Guild Battle: kill the enemy Guild Lord",
  "relic-run": "Relic Run: carry your relic to the altar. Most points in 8 minutes wins.",
  "king-of-the-hill":
    "King of the Hill: lead your Ghostly Hero onto the altar. Hold it to score; most points in 8 minutes wins.",
  "capture-points":
    "Capture Points: stand on shrines to take them. Each shrine you own scores every 30 s.",
};

/** The mode `map` plays, in a line: "Kill Count: most kills in 3 minutes". */
export function modeLine(map: LobbyMap): string {
  return MODE_LINES[map.mode];
}

/** The modes a draw from `maps` can play, in a line: "Annihilation or Kill Count: drawn at the start". */
export function drawnModesLine(maps: readonly LobbyMap[]): string {
  const names = new Set(maps.map((map) => MODE_LINES[map.mode].split(":")[0] ?? map.mode));
  return `${new Intl.ListFormat("en", { type: "disjunction" }).format(names)}: drawn at the start`;
}

/** The arena as the picker names it: its name, then its size class, e.g. "Long Hall (large)". */
export function mapLabel(map: LobbyMap): string {
  return `${map.name} (${map.size})`;
}

/** The lobby's part of a mode screen (#1526): the bar's map and buttons, and what goes under them. */
export interface LobbyPanel {
  readonly status: readonly HTMLElement[];
  readonly actions: readonly HTMLElement[];
  readonly body: HTMLElement;
}

/**
 * The lobby on a mode screen (#1526, ADR-0041): the map and Ready and
 * Start for the bar, and below, both team rosters with each player's
 * character and ready state, and who Start is waiting for. The code is
 * the title bar's.
 */
export function lobbyPanel(
  snapshot: LobbySnapshot,
  callbacks: LobbyScreenCallbacks,
  notice: string | undefined,
  availableMaps: readonly LobbyMap[] = [],
  matchmaking?: LobbyMatchmaking,
): LobbyPanel {
  const panel = h("div", "lobby-panel");
  const controls = lobbyControls(snapshot);

  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);

  // Only a Hosted Game's host may change the map (#1994), so everyone
  // else sees it as a label rather than a control they would be refused
  // on clicking. Team Arena draws its own at the start.
  const current = availableMaps.find((map) => map.id === snapshot.mapId);
  let mapPart: HTMLElement;
  if (snapshot.mode === "hosted-game" && snapshot.isHost && availableMaps.length > 1) {
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
  } else if (snapshot.mode === "team-arena") {
    mapPart = h("div", "lobby-map", "Map: random (Team Arena)");
  } else {
    mapPart = h(
      "div",
      "lobby-map",
      `Map: ${current === undefined ? snapshot.mapId : mapLabel(current)}`,
    );
  }

  // The next thing to press is the primary one, the one a phone keeps out
  // of the ⋯ (#1272): Ready until you are, then the host's Start match.
  const ready = self?.ready === true;
  const readyButton = button(
    ready ? "Not ready" : "Ready",
    ready ? "" : "primary",
    callbacks.onToggleReady,
  );
  readyButton.disabled = controls.readyDisabled;
  // A member on no team has nothing to ready while the match runs, but
  // can watch it (#480).
  const actions: HTMLElement[] = controls.canWatch
    ? [button("Watch", "primary lobby-watch", callbacks.onWatch)]
    : matchmaking === undefined
      ? [readyButton]
      : [];
  if (matchmaking !== undefined) {
    if (snapshot.isHost) {
      actions.push(...matchmakingButtons(matchmaking, controls));
    }
  } else if (snapshot.isHost) {
    const start = button("Start match", ready ? "primary" : "", callbacks.onStart);
    start.disabled = controls.startDisabled;
    actions.push(start);
  }

  // The mode follows from the map (#476). It is the only place a player
  // learns it before Start, so it gets a row of its own under the bar
  // rather than being shortened in it (#1272). Team Arena's map is a
  // placeholder until its draw, so it names what the draw can give (#1994).
  if (snapshot.mode === "team-arena") {
    if (availableMaps.length > 0) {
      panel.appendChild(h("div", "lobby-mode", drawnModesLine(availableMaps)));
    }
  } else if (current !== undefined) {
    panel.appendChild(h("div", "lobby-mode", modeLine(current)));
  }

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  const relay = relayLine();
  if (relay !== undefined) {
    panel.appendChild(relay);
  }

  if (matchmaking !== undefined && !snapshot.isHost && matchmaking.queuedMs === null) {
    panel.appendChild(h("div", "screen-info lobby-waiting", HOST_STARTS_MATCHMAKING));
  }

  // Everyone sees it, not only the host: a guest who is the one being
  // waited for should know. Nobody waits on Ready for matchmaking.
  const waiting = matchmaking === undefined ? waitingFor(snapshot) : undefined;
  if (waiting !== undefined) {
    panel.appendChild(h("div", "screen-info lobby-waiting", waiting));
  }

  const teams = h("div", "lobby-teams");
  // A team mode's lobby is one side, the party; its empty seats are bots.
  for (const team of matchmaking === undefined ? SELECTABLE_TEAMS : ([0] as const)) {
    teams.appendChild(teamColumn(team, snapshot, controls, callbacks, matchmaking === undefined));
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

  return { status: [mapPart], actions, body: panel };
}

/**
 * The host's matchmaking buttons (#1766): Find a match, and once queued,
 * Leave the queue, and after a minute alone also Play the house team.
 */
export function matchmakingButtons(
  matchmaking: LobbyMatchmaking,
  controls: LobbyControls,
): HTMLElement[] {
  if (matchmaking.queuedMs === null) {
    const find = button("Find a match", "primary lobby-find", matchmaking.onFindMatch);
    find.disabled = controls.mapDisabled;
    return [find];
  }
  const leave = button("Leave the queue", "lobby-leave-queue", matchmaking.onLeaveQueue);
  return matchmaking.queuedMs < HOUSE_TEAM_AFTER_MS
    ? [leave]
    : [
        button("Play the house team", "primary lobby-house-team", matchmaking.onPlayHouseTeam),
        leave,
      ];
}

/**
 * One team's column: its name and Join, its bot count (#1454), which the
 * host steps, unless `withBots` is off, and its members, bots among them.
 */
export function teamColumn(
  team: 0 | 1,
  snapshot: LobbySnapshot,
  controls: LobbyControls,
  callbacks: LobbyScreenCallbacks,
  withBots = true,
): HTMLElement {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
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
  if (withBots) {
    column.appendChild(
      botCount(
        team,
        members.filter((member) => member.bot).length,
        snapshot.isHost,
        controls,
        callbacks,
      ),
    );
  }
  if (members.length === 0) {
    column.appendChild(h("div", "lobby-slot-empty", "Empty"));
  }
  for (const member of members) {
    column.appendChild(playerRow(member, self));
  }
  return column;
}

/**
 * `team`'s "Bots: n" (#1454): the host steps it with − and +; everyone
 * else only reads it.
 */
function botCount(
  team: 0 | 1,
  count: number,
  isHost: boolean,
  controls: LobbyControls,
  callbacks: LobbyScreenCallbacks,
): HTMLElement {
  const control = h("div", "lobby-bots");
  if (!isHost) {
    control.textContent = `Bots: ${String(count)}`;
    return control;
  }
  const fewer = button("−", "lobby-bots-fewer", () => {
    callbacks.onSetBots(team, count - 1);
  });
  fewer.setAttribute("aria-label", `One bot fewer on team ${String(team + 1)}`);
  // Locked outside "waiting", like Join.
  fewer.disabled = controls.teamsDisabled || count === 0;
  const more = button("+", "lobby-bots-more", () => {
    callbacks.onSetBots(team, count + 1);
  });
  more.setAttribute("aria-label", `One bot more on team ${String(team + 1)}`);
  more.disabled = controls.botsDisabled;
  control.append(
    h("span", "lobby-bots-label", "Bots:"),
    fewer,
    h("span", "lobby-bot-count", String(count)),
    more,
  );
  return control;
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
  const player = text.appendChild(playerLabelElement("lobby-player", member.name, member.guildTag));
  if (member.isHost) {
    player.appendChild(h("span", "lobby-host", " (host)"));
  }
  text.appendChild(h("span", "lobby-character", characterLine(character, member.bot)));
  row.appendChild(text);
  // A bot is always ready, so its pill says what it is instead (#1194).
  row.appendChild(
    member.bot
      ? botTagElement("lobby-ready")
      : h(
          "span",
          member.ready ? "lobby-ready is-ready" : "lobby-ready",
          member.ready ? "Ready" : "Not ready",
        ),
  );
  return row;
}

import type { MatchMode, RelicCarry } from "@vibewars/game-core";
import { isHallsMap, mapMatchRules } from "@vibewars/game-maps/match-fields";
import type { SizeClass } from "@vibewars/game-maps/size-class";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import { mapName } from "../i18n/game-names.js";
import { t, type MessageKey } from "../i18n/index.js";
import { keySignet } from "../identity/key-signet.js";
import { LOBBY_FRAGMENT_KEY } from "../net/fragment.js";
import { ASCENT_PROGRESSION, arenaMap } from "../net/maps.js";
import { button, findMatchButton, h, readyButton, toast, type ShareLine } from "./kit.js";
import {
  SIGNET_ROW_PX,
  playerLabelElement,
  signedNamesLine,
  signetElement,
} from "./player-label.js";

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
}

/**
 * A team mode's matchmaking (#1766, ADR-0042): the party is one side,
 * and its host queues it for another instead of starting.
 */
export interface LobbyMatchmaking {
  /** How long the party has looked for a team; `null` while it is not queued. */
  readonly queuedMs: number | null;
  /** The map of the group the queue formed (#2687); `undefined` until it has. */
  readonly groupMapId: string | undefined;
  readonly onFindMatch: () => void;
  /** `undefined` where bots are not offered: Heroes' Ascent waits for a side (#1996). */
  readonly onPlayBots: (() => void) | undefined;
}

/** The host may play against bots after this long with no other team (Q191). */
export const PLAY_BOTS_AFTER_MS = 60_000;

/** The teams a player can pick. Two for now; the map decides capacity. */
export const SELECTABLE_TEAMS = [0, 1] as const;

/**
 * The invite link to lobby `code` (#2100): this page's own origin and
 * path, so a fork or a dev server invites to itself, with `#lobby=<key>`
 * for its only fragment. Its query and any other fragment are left out.
 */
export function inviteUrl(
  code: string,
  where: Pick<Location, "origin" | "pathname"> = location,
): string {
  return `${where.origin}${where.pathname}#${LOBBY_FRAGMENT_KEY}=${code}`;
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
  /** Why Ready is disabled (#2124); `undefined` when it is enabled. */
  readonly readyProblem: string | undefined;
  readonly startDisabled: boolean;
  /** Watch (#480): only for a member on no team, and only while the match runs. */
  readonly canWatch: boolean;
}

export function lobbyControls(snapshot: LobbySnapshot): LobbyControls {
  const waiting = snapshot.phase === "waiting";
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const assigned = snapshot.players.filter((p) => p.team !== null);
  return {
    running: snapshot.phase === "in-match" ? t("lobby.matchRunning") : undefined,
    mapDisabled: !waiting,
    teamsDisabled: !waiting,
    // Readiness is meaningless without a team, so the control is disabled
    // rather than silently doing nothing when pressed. Its hover says why (#2124).
    readyProblem:
      snapshot.phase === "queued"
        ? t("queue.busy")
        : !waiting
          ? t("lobby.readyMatchStarted")
          : self === undefined || self.team === null
            ? t("lobby.readyJoinATeam")
            : undefined,
    startDisabled: !waiting || assigned.length === 0 || !assigned.every((p) => p.ready),
    canWatch: snapshot.phase === "in-match" && self?.team === null,
  };
}

/**
 * Who keeps Start disabled while the lobby waits (#580): the players it
 * waits for, none if nobody has joined a team; `undefined` when it is
 * not waiting on anyone.
 */
export function waitingFor(snapshot: LobbySnapshot): readonly LobbyPlayerSnapshot[] | undefined {
  if (snapshot.phase !== "waiting") {
    return undefined;
  }
  const assigned = snapshot.players.filter((p) => p.team !== null);
  if (assigned.length === 0) {
    return [];
  }
  const notReady = assigned.filter((p) => !p.ready);
  return notReady.length === 0 ? undefined : notReady;
}

/** The line saying what `waitingFor` found: its names signed (#2820), or that nobody has joined. */
export function waitingLine(players: readonly LobbyPlayerSnapshot[]): HTMLElement {
  return players.length === 0
    ? h("div", "screen-info lobby-waiting", t("lobby.waitingForJoin"))
    : signedNamesLine("screen-info lobby-waiting", "lobby.waitingForReady", "names", players);
}

/**
 * Copy lobby `code`'s invite link (#2100), and say so. A browser may
 * refuse the clipboard, or not offer one off https: the link is then
 * shown selected in `share`, to copy by hand.
 */
export async function copyInviteLink(code: string, share: ShareLine): Promise<void> {
  const url = inviteUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    toast(t("lobby.copied"));
  } catch {
    share.show(url);
    toast(t("lobby.copyByHand"));
  }
}

/** An arena the host may pick, how big it plays (#444), and the mode it plays (#476). */
export interface LobbyMap {
  readonly id: string;
  readonly size: SizeClass;
  readonly mode: MatchMode;
  /** Whose relic a Relic Run map's teams carry (#2695); no other map has one. */
  readonly relicCarry?: RelicCarry | undefined;
  /** The team sizes it is made for (#2108): a Hosted Game lists those for its own (#2104). */
  readonly teamSizes: readonly number[];
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
const MODE_LINES: Readonly<Record<MatchMode, MessageKey>> = {
  annihilation: "lobby.modeAnnihilation",
  "kill-count": "lobby.modeKillCount",
  "priest-annihilation": "lobby.modePriestAnnihilation",
  "guild-battle": "lobby.modeGuildBattle",
  "relic-run": "lobby.modeRelicRun",
  "king-of-the-hill": "lobby.modeKingOfTheHill",
  "capture-points": "lobby.modeCapturePoints",
};

/** The mode `map` plays, in a line: "Kill Count: most kills in 3 minutes". */
export function modeLine(map: LobbyMap): string {
  return t(map.relicCarry === "foe" ? "lobby.modeRelicRunFoe" : MODE_LINES[map.mode], {
    minutes: mapMatchRules(arenaMap(map.id), map.mode).timeLimitSeconds / 60,
  });
}

/** Each size class as the picker writes it. */
const SIZE_NAMES: Readonly<Record<SizeClass, MessageKey>> = {
  small: "lobby.sizeSmall",
  medium: "lobby.sizeMedium",
  large: "lobby.sizeLarge",
};

/** What each of the Hall's modes is called in the picker (#2700). */
const HALLS_MODE_NAMES: Readonly<Partial<Record<MatchMode, MessageKey>>> = {
  "relic-run": "lobby.modeNameRelicRun",
  "king-of-the-hill": "lobby.modeNameKingOfTheHill",
  "capture-points": "lobby.modeNameCapturePoints",
};

/**
 * The arena as the picker names it: its name, then its size class, e.g.
 * "Long Hall (small)"; a Hall of Heroes map by its mode, the three being
 * one place (#2700).
 */
export function mapLabel(map: LobbyMap): string {
  const hallsMode = isHallsMap(arenaMap(map.id)) ? HALLS_MODE_NAMES[map.mode] : undefined;
  const qualifier = hallsMode === undefined ? t(SIZE_NAMES[map.size]) : t(hallsMode);
  return t("lobby.mapLabel", { name: mapName(map.id), size: qualifier });
}

/** The lobby's part of a mode screen (#1526): the bar's map and buttons, and what goes under them. */
export interface LobbyPanel {
  readonly status: readonly HTMLElement[];
  readonly actions: readonly HTMLElement[];
  readonly queueAction: HTMLElement | undefined;
  readonly body: HTMLElement;
}

/**
 * The map a lobby shows, and the menu background fights on (#3119). A
 * party queued in Heroes' Ascent is bound for its round's map, not the
 * lobby's (#1996), until a group is formed: a party that skipped ahead
 * plays the group's map, `groupMapId` (#2687). A host's round with no map
 * yet is wrong data: the lobby's map is shown (#2686).
 */
export function lobbyShownMapId(snapshot: LobbySnapshot, groupMapId: string | undefined): string {
  return (
    groupMapId ??
    (snapshot.ascentRound === null ? undefined : ASCENT_PROGRESSION[snapshot.ascentRound]) ??
    snapshot.mapId
  );
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
  const shownMapId = lobbyShownMapId(snapshot, matchmaking?.groupMapId);
  const current = availableMaps.find((map) => map.id === shownMapId);
  let mapPart: HTMLElement;
  // The host lists only the maps made for the lobby's team size (#2104).
  const sized = availableMaps.filter((map) => map.teamSizes.includes(snapshot.teamSize));
  if (snapshot.mode === "hosted-game" && snapshot.isHost && sized.length > 1) {
    mapPart = h("label", "lobby-map");
    mapPart.appendChild(h("span", "field-label", t("lobby.map")));
    const select = document.createElement("select");
    for (const map of sized) {
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
    mapPart = h("div", "lobby-map", t("lobby.mapRandom"));
  } else {
    mapPart = h(
      "div",
      "lobby-map",
      t("lobby.mapShown", { map: current === undefined ? shownMapId : mapLabel(current) }),
    );
  }

  // The next thing to press is the primary one, the one a phone keeps out
  // of the ⋯ (#1272): Ready until you are, then the host's Start match.
  const ready = self?.ready === true;
  const readyToggle = readyButton(ready, callbacks.onToggleReady);
  readyToggle.disabled = controls.readyProblem !== undefined;
  readyToggle.title = controls.readyProblem ?? "";
  // A member on no team has nothing to ready while the match runs, but
  // can watch it (#480).
  const actions: HTMLElement[] = controls.canWatch
    ? [button(t("lobby.watch"), "primary lobby-watch", callbacks.onWatch)]
    : matchmaking === undefined
      ? [readyToggle]
      : [];
  let queueAction: HTMLElement | undefined;
  if (matchmaking !== undefined) {
    if (snapshot.isHost) {
      const buttons = matchmakingButtons(matchmaking, controls);
      queueAction = buttons.queueAction;
      actions.push(...buttons.actions);
    }
  } else if (snapshot.isHost) {
    const start = button(t("lobby.startMatch"), ready ? "primary" : "", callbacks.onStart);
    start.disabled = controls.startDisabled;
    actions.push(start);
  }

  // The mode follows from the map (#476). It is the only place a player
  // learns it before Start, so it gets a row of its own under the bar
  // rather than being shortened in it (#1272). Team Arena's map is a
  // placeholder until its draw, so it has no line until then (#2642).
  if (snapshot.mode !== "team-arena" && current !== undefined) {
    panel.appendChild(h("div", "lobby-mode", modeLine(current)));
  }

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  if (matchmaking !== undefined && !snapshot.isHost && matchmaking.queuedMs === null) {
    // A guest's word on a team-mode screen: matchmaking is the host's.
    panel.appendChild(h("div", "screen-info lobby-waiting", t("lobby.hostStartsMatchmaking")));
  }

  // Everyone sees it, not only the host: a guest who is the one being
  // waited for should know. Nobody waits on Ready for matchmaking.
  const waiting = matchmaking === undefined ? waitingFor(snapshot) : undefined;
  if (waiting !== undefined) {
    panel.appendChild(waitingLine(waiting));
  }

  const teams = h("div", "lobby-teams");
  // A team mode's lobby is one side, the party; its empty seats are bots.
  for (const team of matchmaking === undefined ? SELECTABLE_TEAMS : ([0] as const)) {
    teams.appendChild(teamColumn(team, snapshot, controls, callbacks));
  }
  panel.appendChild(teams);

  const spectators = snapshot.players.filter((p) => p.team === null);
  if (spectators.length > 0) {
    panel.appendChild(signedNamesLine("lobby-spectators", "lobby.spectating", "names", spectators));
  }

  // Nothing went wrong, so this is not a `screen-problem`.
  if (controls.running !== undefined) {
    panel.appendChild(h("div", "screen-info lobby-running", controls.running));
  }

  return { status: [mapPart], actions, queueAction, body: panel };
}

/**
 * The host's matchmaking buttons (#1766): Find a match, and once queued
 * (#2980), whose way out is the spinner's flyout, after a minute alone
 * Play against bots.
 */
export function matchmakingButtons(
  matchmaking: LobbyMatchmaking,
  controls: LobbyControls,
): { readonly queueAction: HTMLElement | undefined; readonly actions: HTMLElement[] } {
  if (matchmaking.queuedMs === null) {
    const find = findMatchButton(matchmaking.onFindMatch);
    find.disabled = controls.mapDisabled;
    return { queueAction: find, actions: [] };
  }
  const { onPlayBots } = matchmaking;
  return {
    queueAction: undefined,
    actions:
      matchmaking.queuedMs < PLAY_BOTS_AFTER_MS || onPlayBots === undefined
        ? []
        : [button(t("lobby.playBots"), "primary lobby-play-bots", onPlayBots)],
  };
}

/**
 * One team's column: its name and Join, or Leave on one's own (#2199),
 * and its members by name (#2029); a bot plays a slot nobody claimed,
 * under that slot's character's name.
 */
export function teamColumn(
  team: 0 | 1,
  snapshot: LobbySnapshot,
  controls: LobbyControls,
  callbacks: LobbyScreenCallbacks,
): HTMLElement {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const column = h("div", "lobby-team");
  const title = h("div", "lobby-team-header");
  title.appendChild(h("h3", "lobby-team-title", t("lobby.team", { team: team + 1 })));
  // On their own team a player sees Leave, back to unassigned (#2199).
  const own = self?.team === team;
  const choose = button(t(own ? "lobby.leaveTeam" : "lobby.joinTeam"), "lobby-join", () => {
    callbacks.onChooseTeam(own ? null : team);
  });
  choose.setAttribute(
    "aria-label",
    t(own ? "lobby.leaveTeamLabel" : "lobby.joinTeamLabel", { team: team + 1 }),
  );
  choose.disabled = controls.teamsDisabled;
  title.appendChild(choose);
  column.appendChild(title);
  const members = snapshot.players.filter((p) => p.team === team);
  if (members.length === 0) {
    column.appendChild(h("div", "lobby-slot-empty", t("lobby.empty")));
  }
  for (const member of members) {
    column.appendChild(playerRow(member));
  }
  return column;
}

/**
 * One player on a team: name and a ready pill (#2029). What they play is
 * the Team Build slot they claim, so no character of their own is listed;
 * a bot, always ready, is marked only in the match.
 */
function playerRow(member: LobbyPlayerSnapshot): HTMLElement {
  const row = h("div", "lobby-slot");
  const text = h("span", "lobby-slot-text");
  const player = text.appendChild(
    playerLabelElement("lobby-player", member.name, member.guildTag, member.heroRank),
  );
  // A bot has no key, so no signet and no empty slot (#2805).
  if (member.playerPubkey !== null) {
    player.prepend(signetElement(keySignet(member.playerPubkey), SIGNET_ROW_PX));
  }
  if (member.isHost) {
    player.appendChild(h("span", "lobby-host", ` ${t("lobby.host")}`));
  }
  row.appendChild(text);
  row.appendChild(
    h(
      "span",
      member.ready ? "lobby-ready is-ready" : "lobby-ready",
      t(member.ready ? "lobby.ready" : "lobby.notReady"),
    ),
  );
  return row;
}

import type { QueueMode } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import { mapName } from "../i18n/game-names.js";
import { t } from "../i18n/index.js";
import { ASCENT_PROGRESSION, ascentMapId } from "../net/maps.js";
import { teamColour } from "../render/arena-snapshot.js";
import { cssColour } from "./character-preview.js";
import { RANDOM_ARENA_MODES } from "./menu.js";
import { button, h, screenBar } from "./kit.js";
import { SIGNET_ROW_PX, playerLabelElement, signetElement, signetOf } from "./player-label.js";
import { renderSummary, type SummaryTable } from "./match-summary.js";
import { relayLine } from "./relay-section.js";

/**
 * The Random Arena queue screen (#880, #854 B3–B4): mounted once a match
 * is found (#2743), the queue having waited in the background, for the
 * versus splash while the queued lobby counts down and the ended view
 * after the match. Built once and updated in place: the ended view ticks
 * several times a second, and a button rebuilt under the pointer would
 * eat the click.
 */

const TITLE_FLASH_MS = 1000;

/** "4v4". */
export function modeLabel(mode: QueueMode): string {
  return RANDOM_ARENA_MODES.find((choice) => choice.mode === mode)?.label ?? mode;
}

/** "Random Arena 4v4 · Mhenlo". */
export function queueTitle(mode: QueueMode, characterName: string): string {
  return t("queue.title", { mode: modeLabel(mode), character: characterName });
}

/** Time waited as m:ss. */
export function waitedLabel(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/** How a queued match ended for the streak (#881). */
export type QueuedResult = "win" | "loss" | "forfeit" | "host-left";

/**
 * The session streak after `result` (#854 D4): a win adds one, a defeat
 * or leaving before the end clears it, and a match lost to its host
 * leaving does not count either way.
 */
export function nextStreak(streak: number, result: QueuedResult): number {
  switch (result) {
    case "win":
      return streak + 1;
    case "loss":
    case "forfeit":
      return 0;
    case "host-left":
      return streak;
  }
}

/**
 * The Heroes' Ascent round after `result` at `round` (#1996): a win
 * moves on, and in the Hall defends it; a defeat or leaving before the
 * end starts again at the first; a match lost to its host leaving
 * stands.
 */
export function nextAscentRound(round: number, result: QueuedResult): number {
  switch (result) {
    case "win":
      return Math.min(round + 1, ASCENT_PROGRESSION.length - 1);
    case "loss":
    case "forfeit":
      return 0;
    case "host-left":
      return round;
  }
}

/** The Heroes' Ascent run's streak of wins after `result` (#2702), as the round moves. */
export function nextAscentWins(wins: number, result: QueuedResult): number {
  switch (result) {
    case "win":
      return wins + 1;
    case "loss":
    case "forfeit":
      return 0;
    case "host-left":
      return wins;
  }
}

/**
 * The morale a player carries into the next Heroes' Ascent map (#2686):
 * a win carries the morale `ended` the map at, a defeat or leaving ends
 * the run back at 0, and a match lost to its host leaving keeps
 * `carried`, the morale it started at.
 */
export function nextAscentMorale(carried: number, ended: number, result: QueuedResult): number {
  switch (result) {
    case "win":
      return ended;
    case "loss":
    case "forfeit":
      return 0;
    case "host-left":
      return carried;
  }
}

/**
 * The morale a join sends for a ticket at `round` (#2686): `carried`,
 * which at round 0 is the Elite Zaishen Battle's boost (#2692); outside
 * Heroes' Ascent, none.
 */
export function ascentStartMorale(round: number | null, carried: number): number {
  return round === null ? 0 : carried;
}

/** "3 wins in a row this visit (not a rating)"; nothing at 0. */
export function streakLine(streak: number): string | undefined {
  if (streak <= 0) {
    return undefined;
  }
  return t("queue.streak", { count: streak });
}

/**
 * *Stay together* on the ended view of a won 2v2 or 4v4 (#882): offered
 * for `secondsLeft`, pressed and waiting on the rest of the team, or off
 * because the match's host left.
 */
export type StayOffer =
  | { readonly kind: "offer"; readonly secondsLeft: number }
  | { readonly kind: "waiting"; readonly secondsLeft: number }
  | { readonly kind: "host-left" };

/** What the screen shows: the queue, the lobby's splash, why the queue ended, or how the match did. */
export type QueueView =
  | { readonly kind: "splash"; readonly snapshot: LobbySnapshot }
  | { readonly kind: "refused"; readonly notice: string }
  | {
      readonly kind: "ended";
      readonly outcome: string;
      readonly streak: number;
      /** The match summary (#1057); `undefined` if the host never sent one. */
      readonly summary: readonly SummaryTable[] | undefined;
      readonly stay?: StayOffer;
    };

export interface QueueScreenCallbacks {
  /** *Back to menu*, once the queue is over. */
  readonly onBack: () => void;
  /** *Queue again*, after a match (#881): same mode, the active character. */
  readonly onQueueAgain: () => void;
  /** *Stay together*, after a won 2v2 or 4v4 (#882). */
  readonly onStayTogether: () => void;
}

export interface QueueScreen {
  show(view: QueueView): void;
  /** Stops the title flashing; the next screen replaces the DOM. */
  dispose(): void;
}

export interface QueueScreenOptions {
  readonly mode: QueueMode;
  readonly characterName: string;
  /** The arena's name, for the splash. */
  readonly mapName: (mapId: string) => string;
}

/** What the queue screen says, and which button it offers. */
export interface QueueLines {
  readonly status: string;
  readonly problem?: string;
  readonly streak?: string;
  /** *Stay together*'s label, and whether it can be pressed; no button without. */
  readonly stay?: { readonly label: string; readonly enabled: boolean };
  /**
   * *Back to menu* once it is over, both that and *Queue again* after a
   * match, nothing on the splash.
   */
  readonly action: "back" | "ended" | "none";
}

/** *Stay together*'s button for `offer`. */
export function stayButton(offer: StayOffer): { label: string; enabled: boolean } {
  switch (offer.kind) {
    case "offer":
      return {
        label: t("queue.stayTogetherCountdown", { seconds: offer.secondsLeft }),
        enabled: true,
      };
    case "waiting":
      return {
        label: t("queue.waitingForTeam", { seconds: offer.secondsLeft }),
        enabled: false,
      };
    case "host-left":
      // Disabled, once the match's host is gone (#882).
      return { label: t("queue.hostLeft"), enabled: false };
  }
}

/** The screen after a queued match (#881): how it ended, the streak, *Queue again* and *Back to menu*. */
export function endedLines(outcome: string, streak: number, stay?: StayOffer): QueueLines {
  const line = streakLine(streak);
  return {
    status: outcome,
    action: "ended",
    ...(line === undefined ? {} : { streak: line }),
    ...(stay === undefined ? {} : { stay: stayButton(stay) }),
  };
}

/**
 * What a team match's end leads to (#1997): a queued party's winners
 * queue again, its losers (a draw too) go back to the menu; a coded
 * lobby's players go back to it.
 */
export type TeamEndAction = "requeue" | "menu" | "lobby";

/** The end of a team match that `won`, queued by its party or not (#1997). */
export function teamEndAction(won: boolean, queued: boolean): TeamEndAction {
  if (!queued) {
    return "lobby";
  }
  return won ? "requeue" : "menu";
}

/**
 * Whether a member out of its party's team match finds the party queued
 * again (#1997), under a nonce other than the `played` match's: its host
 * left the match first and queued while this tab was still in it.
 */
export function requeuedSince(
  snapshot: Pick<LobbySnapshot, "phase" | "queueNonce">,
  played: string,
): boolean {
  return (
    snapshot.phase === "queued" && snapshot.queueNonce !== null && snapshot.queueNonce !== played
  );
}

/**
 * The line under a team match's result (#1997), `seconds` before
 * `action`, and its button. A Heroes' Ascent won at `ascentRound`
 * names where it goes on to (#1996); `null` in any other mode.
 */
export function teamEndLine(
  action: TeamEndAction,
  seconds: number,
  ascentRound: number | null,
): { text: string; button: string } {
  switch (action) {
    case "requeue":
      if (ascentRound === null) {
        return { text: t("queue.nextMatchIn", { seconds }), button: t("queue.leave") };
      }
      return ascentRound === ASCENT_PROGRESSION.length - 1
        ? {
            text: t("queue.defending", { map: mapName(ascentMapId(ascentRound)), seconds }),
            button: t("queue.leave"),
          }
        : {
            text: t("queue.ascending", { map: mapName(ascentMapId(ascentRound + 1)), seconds }),
            button: t("queue.leave"),
          };
    case "menu":
      return { text: t("queue.backToMenuIn", { seconds }), button: t("queue.now") };
    case "lobby":
      return { text: t("queue.backToLobbyIn", { seconds }), button: t("queue.now") };
  }
}

/** The splash's two sides and its countdown line, from a queued lobby's snapshot. */
export interface VersusTeams {
  readonly ours: readonly LobbyPlayerSnapshot[];
  readonly theirs: readonly LobbyPlayerSnapshot[];
  readonly countdown: string;
}

/** Your side first, then theirs; a spectator watches team 1 as its own. */
export function versusTeams(snapshot: LobbySnapshot): VersusTeams {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const ours = self?.team === 1 ? 1 : 0;
  return {
    ours: snapshot.players.filter((p) => p.team === ours),
    theirs: snapshot.players.filter((p) => p.team === 1 - ours),
    countdown:
      snapshot.countdownSeconds === null
        ? t("queue.waitingForEveryone")
        : t("queue.startingIn", { seconds: snapshot.countdownSeconds }),
  };
}

/** A player on the splash, by name alone (#2029): what they play is not the lobby's to say. */
function splashRow(player: LobbyPlayerSnapshot): HTMLElement {
  const row = h("div", "versus-player");
  const text = h("span", "versus-player-text");
  const label = text.appendChild(
    playerLabelElement("versus-player-name", player.name, player.guildTag, player.heroRank),
  );
  const signet = signetOf(player);
  if (signet !== undefined) {
    label.prepend(signetElement(signet, SIGNET_ROW_PX));
  }
  row.appendChild(text);
  return row;
}

/**
 * The versus splash (GW1): the map, and both teams side by side in team
 * colours, each player's name, from the queued lobby's
 * snapshot. Yours on the left.
 */
export function renderVersusSplash(
  snapshot: LobbySnapshot,
  mapName: (mapId: string) => string,
): HTMLElement {
  const splash = h("div", "versus-splash");
  splash.appendChild(h("div", "versus-map", mapName(snapshot.mapId)));
  const teams = h("div", "versus-teams");
  const { ours, theirs, countdown } = versusTeams(snapshot);
  const column = (players: readonly LobbyPlayerSnapshot[], isOurs: boolean): HTMLElement => {
    const node = h("div", `versus-team ${isOurs ? "is-ours" : "is-theirs"}`);
    node.style.setProperty("--team-colour", cssColour(teamColour(isOurs ? "ally" : "enemy")));
    node.appendChild(
      h("h3", "versus-team-title", t(isOurs ? "queue.yourTeam" : "queue.theirTeam")),
    );
    for (const player of players) {
      node.appendChild(splashRow(player));
    }
    return node;
  };
  teams.append(
    column(ours, true),
    h("span", "versus-vs", t("queue.versus")),
    column(theirs, false),
  );
  splash.append(teams, h("div", "versus-countdown", countdown));
  return splash;
}

/**
 * Flash the tab title until the tab is visible; returns how to stop early.
 * A visible tab is not flashed at all.
 */
export function flashTitle(doc: Document): () => void {
  if (doc.visibilityState === "visible") {
    return () => undefined;
  }
  const original = doc.title;
  // The tab title while a match found in a background tab is unseen.
  const found = t("queue.matchFoundTitle");
  const timer = setInterval(() => {
    doc.title = doc.title === found ? original : found;
  }, TITLE_FLASH_MS);
  doc.title = found;
  const stop = (): void => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onVisible);
    doc.title = original;
  };
  const onVisible = (): void => {
    if (doc.visibilityState === "visible") {
      stop();
    }
  };
  doc.addEventListener("visibilitychange", onVisible);
  return stop;
}

export function mountQueueScreen(
  root: HTMLElement,
  options: QueueScreenOptions,
  callbacks: QueueScreenCallbacks,
): QueueScreen {
  root.replaceChildren();
  const panel = h("div", "screen screen-queue");
  screenBar({
    crumbs: ["VibeWars", queueTitle(options.mode, options.characterName)],
    actions: [],
  });
  const status = h("div", "queue-status");
  status.setAttribute("role", "status");
  const problem = h("div", "screen-problem queue-problem");
  const streak = h("div", "queue-streak");
  const summaryHost = h("div", "queue-summary");
  const body = h("div", "queue-body");
  body.append(status, problem, streak, summaryHost);
  const relay = relayLine();
  if (relay !== undefined) {
    body.append(relay);
  }
  const splashHost = h("div", "queue-splash");
  const stay = button(t("queue.stayTogether"), "primary", callbacks.onStayTogether);
  const again = button(t("queue.queueAgain"), "primary", callbacks.onQueueAgain);
  const back = button(t("queue.backToMenu"), "primary", callbacks.onBack);
  const actions = h("div", "menu-row queue-actions");
  actions.append(stay, again, back);
  panel.append(body, splashHost, actions);
  root.appendChild(panel);

  let stopFlash: (() => void) | undefined;
  let found = false;

  const set = (lines: QueueLines, splash?: HTMLElement): void => {
    status.textContent = lines.status;
    problem.textContent = lines.problem ?? "";
    problem.hidden = lines.problem === undefined;
    streak.textContent = lines.streak ?? "";
    streak.hidden = lines.streak === undefined;
    summaryHost.replaceChildren();
    if (splash === undefined) {
      splashHost.replaceChildren();
    } else {
      splashHost.replaceChildren(splash);
    }
    again.hidden = lines.action !== "ended";
    back.hidden = lines.action !== "back" && lines.action !== "ended";
    // After a match, *Queue again* is the default; *Back to menu* is not.
    back.classList.toggle("primary", lines.action !== "ended");
    stay.hidden = lines.stay === undefined;
    stay.textContent = lines.stay?.label ?? "";
    stay.disabled = lines.stay?.enabled !== true;
    // *Stay together* leads while it is offered; *Queue again* is the next.
    again.classList.toggle("primary", lines.stay === undefined);
  };

  /** Flash the title once per match found, not on every repaint of it. */
  const matchFound = (): void => {
    if (!found) {
      found = true;
      stopFlash?.();
      stopFlash = flashTitle(document);
    }
  };

  return {
    show: (view) => {
      switch (view.kind) {
        case "splash":
          matchFound();
          set(
            { status: t("queue.matchFound"), action: "none" },
            renderVersusSplash(view.snapshot, options.mapName),
          );
          return;
        case "refused":
          set({ status: t("queue.couldNotJoin"), problem: view.notice, action: "back" });
          return;
        case "ended":
          set(endedLines(view.outcome, view.streak, view.stay));
          // Under the outcome line, as it was under the result banner.
          if (view.summary !== undefined) {
            renderSummary(summaryHost, view.summary);
          }
          return;
      }
    },
    dispose: () => {
      stopFlash?.();
      stopFlash = undefined;
    },
  };
}

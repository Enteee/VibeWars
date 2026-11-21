import type { LobbyMode, QueueMode } from "@vibewars/game-protocol";
import type { QueueState } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { button, h } from "./kit.js";
import { ratingLine, type Standing } from "./leaderboard-window.js";
import { signedText, type SignedLine, type SignedName } from "./player-label.js";
import { modeLabel, waitedLabel } from "./queue-screen.js";
import { attachTopbarPopover, closeTopbarPopover } from "./topbar-popover.js";
import { isVaultRound, vaultLines } from "./vault-screen.js";

/**
 * The queue icon in the top bar and its flyout (#2743): any queue, Random
 * Arena's or a team mode's, waits in the background while the player goes
 * where they like; the icon says so and its flyout leaves it.
 */

/** How long a host's team-mode queue waits before it may play bots instead (Q191). */
export const PLAY_BOTS_AFTER_MS = 10_000;

/** The queue this tab is in, as the flyout shows it. */
export type QueueStatusInput =
  | {
      readonly kind: "random";
      readonly mode: QueueMode;
      /** By `Date.now`. */
      readonly since: number;
      /** `undefined` until the queue first says where it is. */
      readonly state: QueueState | undefined;
      /** Where this player stands (#3575); `undefined` for a queue that is not ranked. */
      readonly standing: Standing | undefined;
    }
  | {
      readonly kind: "team";
      readonly mode: LobbyMode;
      readonly teamSize: number;
      /** The Heroes' Ascent round it queued at, from 0; `null` in other modes. */
      readonly ascentRound: number | null;
      /** By `Date.now`. */
      readonly since: number;
      /** Teams the queue last heard searching; `undefined` until it says. */
      readonly teams: number | undefined;
      readonly isHost: boolean;
      /** Whether this host may play bots in this mode instead of waiting. */
      readonly playBots: boolean;
      /** Who holds the Hall of Heroes (#2701), as the Vault says; `undefined` for nobody. */
      readonly hallHolder: SignedName | undefined;
      /** Where this player stands (#3575); `undefined` for a side a bot fills. */
      readonly standing: Standing | undefined;
    };

/** What the flyout says. */
export interface QueueStatus {
  /** "Random Arena 4v4", "Heroes' Ascent · round 3". */
  readonly title: string;
  /** m:ss, or in the Vault how long until the Hall opens. */
  readonly waited: string;
  /** A ranked queue's "Your rating: 1623", or why there is none (#3575). */
  readonly rating?: string;
  /** In the Vault, the holder named with their signet (#3232). */
  readonly detail?: string | SignedLine;
  /** Leave Queue, or a guest's word that only the host can. */
  readonly leave: "button" | "host-only";
  /** Play against bots, for a host who may: seconds until it is enabled, 0 once it is. */
  readonly playBots?: { readonly inSeconds: number };
}

/** The flyout for `input` at `now`; none without a queue. */
export function queueStatus(
  input: QueueStatusInput | undefined,
  now: number,
): QueueStatus | undefined {
  if (input === undefined) {
    return undefined;
  }
  const status = unratedStatus(input, now);
  return input.standing === undefined ? status : { ...status, rating: ratingLine(input.standing) };
}

/** The flyout for `input` at `now`, but for the rating line. */
function unratedStatus(input: QueueStatusInput, now: number): QueueStatus {
  const waited = waitedLabel(now - input.since);
  if (input.kind === "random") {
    const detail = randomDetail(input.state);
    return {
      title: t("queue.randomArena", { size: modeLabel(input.mode) }),
      waited,
      ...(detail === undefined ? {} : { detail }),
      leave: "button",
    };
  }
  const leave = input.isHost ? "button" : "host-only";
  if (input.mode === "heroes-ascent" && isVaultRound(input.ascentRound)) {
    const vault = vaultLines(now, input.hallHolder);
    return { title: vault.title, waited: vault.countdown, detail: vault.holder, leave };
  }
  const status = teamStatus(input, waited, leave);
  if (!input.isHost || !input.playBots) {
    return status;
  }
  const inSeconds = Math.max(0, Math.ceil((PLAY_BOTS_AFTER_MS - (now - input.since)) / 1000));
  return { ...status, playBots: { inSeconds } };
}

/** A team mode's flyout outside the Vault, without its bots button. */
function teamStatus(
  input: Extract<QueueStatusInput, { kind: "team" }>,
  waited: string,
  leave: QueueStatus["leave"],
): QueueStatus {
  switch (input.mode) {
    case "team-arena": {
      const title = t("queue.teamArena", {
        size: `${String(input.teamSize)}v${String(input.teamSize)}`,
      });
      return input.teams === undefined || input.teams === 0
        ? { title, waited, leave }
        : { title, waited, detail: t("queue.teamsSearching", { count: input.teams }), leave };
    }
    case "heroes-ascent":
      return {
        title: t("queue.heroesAscent", { round: (input.ascentRound ?? 0) + 1 }),
        waited,
        leave,
      };
    default:
      return { title: t("queue.guildVsGuild"), waited, leave };
  }
}

/** Random Arena's line under the wait: how many search, or that a match was found. */
function randomDetail(state: QueueState | undefined): string | undefined {
  switch (state?.kind) {
    case "searching":
      // You always count yourself, so none is no tick heard yet.
      return state.searching === 0
        ? undefined
        : t("queue.searchingCount", { searching: state.searching, needed: state.needed });
    case "forming":
    case "in-lobby":
      return t("queue.matchFound");
    case "fell-through":
      return t("queue.fellThrough");
    case "party-gone":
      return t("queue.teamSplit");
    case "unreachable":
    case undefined:
      return undefined;
  }
}

/** The bar's queue icon: shown while `setQueue` names one. */
export interface QueueButton {
  readonly element: HTMLButtonElement;
  readonly setQueue: (input: QueueStatusInput | undefined) => void;
}

/**
 * The queue icon, its flyout dropping into `parent`: the queue, the time
 * waited, ticking, Play against bots for a host, which `onPlayBots` does,
 * and Leave Queue, which `onLeave` does.
 */
export function queueButton(
  parent: HTMLElement,
  onLeave: () => void,
  onPlayBots: () => void,
): QueueButton {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "topbar-queue";
  element.setAttribute("aria-label", t("queue.inQueue"));
  element.title = t("queue.inQueue");
  element.appendChild(h("span", "topbar-queue-ring"));
  element.hidden = true;
  let input: QueueStatusInput | undefined;
  /** The open flyout's repaint; none while it is shut. */
  let paint: (() => void) | undefined;
  attachTopbarPopover(element, parent, (close) => {
    const panel = h("div", "screen queue-window");
    panel.setAttribute("aria-label", t("queue.inQueue"));
    panel.tabIndex = -1;
    const title = h("h3", "queue-window-title");
    const waited = h("div", "queue-window-waited");
    const rating = h("div", "queue-window-rating");
    const detail = h("div", "queue-window-detail");
    const playBots = button(t("lobby.playBots"), "primary queue-play-bots", () => {
      close();
      onPlayBots();
    });
    const hostOnly = h("p", "queue-window-host-only", t("queue.hostOnly"));
    const leave = button(t("queue.leaveQueue"), "", () => {
      close();
      onLeave();
    });
    panel.append(title, waited, rating, playBots, detail, hostOnly, leave);
    paint = () => {
      const status = queueStatus(input, Date.now());
      if (status === undefined) {
        return;
      }
      title.textContent = status.title;
      waited.textContent = status.waited;
      rating.textContent = status.rating ?? "";
      rating.hidden = status.rating === undefined;
      paintDetail(detail, status.detail);
      detail.hidden = status.detail === undefined;
      playBots.hidden = status.playBots === undefined;
      if (status.playBots !== undefined) {
        const { inSeconds } = status.playBots;
        playBots.disabled = inSeconds > 0;
        playBots.textContent =
          inSeconds > 0 ? t("queue.playBotsIn", { seconds: inSeconds }) : t("lobby.playBots");
      }
      hostOnly.hidden = status.leave !== "host-only";
      leave.hidden = status.leave !== "button";
    };
    paint();
    const timer = setInterval(() => {
      paint?.();
    }, 1000);
    return {
      element: panel,
      focus: leave.hidden ? panel : leave,
      dispose() {
        clearInterval(timer);
        paint = undefined;
      },
    };
  });
  return {
    element,
    setQueue: (next) => {
      input = next;
      if (next === undefined) {
        // The queue ended by itself, or was left: its flyout goes with it.
        if (paint !== undefined) {
          closeTopbarPopover();
        }
        element.hidden = true;
        return;
      }
      element.hidden = false;
      paint?.();
    },
  };
}

/** Show `text` in `detail`, rebuilt only when it changes, as it is painted every second. */
function paintDetail(detail: HTMLElement, text: string | SignedLine | undefined): void {
  const key = JSON.stringify(text ?? "");
  if (detail.dataset.text === key) {
    return;
  }
  detail.dataset.text = key;
  if (typeof text === "object") {
    detail.replaceChildren(signedText(text.key, text.params));
  } else {
    detail.textContent = text ?? "";
  }
}

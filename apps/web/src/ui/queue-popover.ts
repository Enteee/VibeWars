import type { LobbyMode, QueueMode } from "@vibewars/game-protocol";
import { WARMUP_AFTER_MS, type QueueState } from "@vibewars/game-session";

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

/**
 * The seconds until a warmup against bots (#3899, #4285), for a party of
 * `mode` queued `waitedMs`: none once it is due, nor in Heroes' Ascent,
 * which waits for a side at its round (#1996).
 */
export function warmupSeconds(mode: LobbyMode, waitedMs: number): number | undefined {
  const seconds = Math.ceil((WARMUP_AFTER_MS - waitedMs) / 1000);
  return mode === "heroes-ascent" || seconds <= 0 ? undefined : seconds;
}

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
      /** The party is in a warmup (#3899): none starts now, it is on. */
      readonly warmup: boolean;
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
  /** Under the count, while this player's ticket is `hardNat`: why a match may not come (#3758). */
  readonly notice?: string;
  /** Leave Queue, or a guest's word that only the host can. */
  readonly leave: "button" | "host-only";
  /** Before the first warmup (#3899): the seconds until it, on Start warmup now (#4285). */
  readonly warmupSeconds?: number;
  /** Start warmup now (#3899) with `warmupSeconds`: a host's to press, a guest's disabled (#4285). */
  readonly warmupNow?: "enabled" | "disabled";
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
    const hardNat = input.state?.kind === "searching" && input.state.hardNat;
    return {
      title: t("queue.randomArena", { size: modeLabel(input.mode) }),
      waited,
      ...(detail === undefined ? {} : { detail }),
      ...(hardNat ? { notice: t("queue.hardNatHint", { relay: t("options.relay") }) } : {}),
      leave: "button",
    };
  }
  const leave = input.isHost ? "button" : "host-only";
  if (input.mode === "heroes-ascent" && isVaultRound(input.ascentRound)) {
    const vault = vaultLines(now, input.hallHolder);
    return { title: vault.title, waited: vault.countdown, detail: vault.holder, leave };
  }
  const status = teamStatus(input, waited, leave);
  const seconds = input.warmup ? undefined : warmupSeconds(input.mode, now - input.since);
  return seconds === undefined
    ? status
    : { ...status, warmupSeconds: seconds, warmupNow: input.isHost ? "enabled" : "disabled" };
}

/** A team mode's flyout outside the Vault, without its warmup. */
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
  /** Its flyout shut, and its listeners gone, for one that goes before the page (#3899). */
  dispose(): void;
}

/**
 * The queue icon, its flyout dropping into `parent`: the queue, the time
 * waited, ticking, Start warmup now for a host, which `onStartWarmup`
 * does, and Leave Queue, which `onLeave` does.
 */
export function queueButton(
  parent: HTMLElement,
  onLeave: () => void,
  onStartWarmup: () => void,
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
  const popover = attachTopbarPopover(element, parent, (close) => {
    const panel = h("div", "screen queue-window");
    panel.setAttribute("aria-label", t("queue.inQueue"));
    panel.tabIndex = -1;
    const title = h("h3", "queue-window-title");
    const waited = h("div", "queue-window-waited");
    const rating = h("div", "queue-window-rating");
    const detail = h("div", "queue-window-detail");
    const notice = h("p", "queue-window-notice");
    const warmupNow = button(t("queue.warmupNow"), "primary queue-warmup-now", () => {
      close();
      onStartWarmup();
    });
    const warmupCount = h("span", "queue-warmup-count");
    warmupNow.appendChild(warmupCount);
    const hostOnly = h("p", "queue-window-host-only", t("queue.hostOnly"));
    const leave = button(t("queue.leaveQueue"), "", () => {
      close();
      onLeave();
    });
    panel.append(title, waited, rating, warmupNow, detail, notice, hostOnly, leave);
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
      notice.textContent = status.notice ?? "";
      notice.hidden = status.notice === undefined;
      warmupCount.textContent = String(status.warmupSeconds ?? "");
      warmupNow.hidden = status.warmupNow === undefined;
      warmupNow.disabled = status.warmupNow === "disabled";
      warmupNow.setAttribute("aria-disabled", String(status.warmupNow === "disabled"));
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
    dispose: () => {
      popover.dispose();
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

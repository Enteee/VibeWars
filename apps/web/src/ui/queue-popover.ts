import type { LobbyMode, QueueMode } from "@vibewars/game-protocol";
import type { QueueState } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { button, h } from "./kit.js";
import { modeLabel, waitedLabel } from "./queue-screen.js";
import { attachTopbarPopover, closeTopbarPopover } from "./topbar-popover.js";
import { isVaultRound, vaultLines } from "./vault-screen.js";

/**
 * The queue icon in the top bar and its flyout (#2743): any queue, Random
 * Arena's or a team mode's, waits in the background while the player goes
 * where they like; the icon says so and its flyout leaves it.
 */

/** The queue this tab is in, as the flyout shows it. */
export type QueueStatusInput =
  | {
      readonly kind: "random";
      readonly mode: QueueMode;
      /** By `Date.now`. */
      readonly since: number;
      /** `undefined` until the queue first says where it is. */
      readonly state: QueueState | undefined;
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
      /** Who holds the Hall of Heroes (#2701), as the Vault says; `undefined` for nobody. */
      readonly hallHolder: string | undefined;
    };

/** What the flyout says. */
export interface QueueStatus {
  /** "Random Arena 4v4", "Heroes' Ascent · round 3". */
  readonly title: string;
  /** m:ss, or in the Vault how long until the Hall opens. */
  readonly waited: string;
  readonly detail?: string;
  /** Leave Queue, or a guest's word that only the host can. */
  readonly leave: "button" | "host-only";
}

/** The flyout for `input` at `now`; none without a queue. */
export function queueStatus(
  input: QueueStatusInput | undefined,
  now: number,
): QueueStatus | undefined {
  if (input === undefined) {
    return undefined;
  }
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
 * waited, ticking, and Leave Queue, which `onLeave` does.
 */
export function queueButton(parent: HTMLElement, onLeave: () => void): QueueButton {
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
    const detail = h("div", "queue-window-detail");
    const hostOnly = h("p", "queue-window-host-only", t("queue.hostOnly"));
    const leave = button(t("queue.leaveQueue"), "", () => {
      close();
      onLeave();
    });
    panel.append(title, waited, detail, hostOnly, leave);
    paint = () => {
      const status = queueStatus(input, Date.now());
      if (status === undefined) {
        return;
      }
      title.textContent = status.title;
      waited.textContent = status.waited;
      detail.textContent = status.detail ?? "";
      detail.hidden = status.detail === undefined;
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

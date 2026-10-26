import { RECONNECT_WINDOW_SECONDS } from "@vibewars/game-session";

/**
 * What a guest sees while its match connection is `reconnecting` (#602):
 * the arena dimmed, and "Reconnecting… 27 s" counting down the host's
 * window, so a frozen arena reads as paused rather than crashed.
 */

/**
 * Whole seconds left of the reconnect window that began at `startedAtMs`,
 * read off the clock: a late tick shows the true time, and it never goes
 * below 0. Reaching 0 ends nothing; `lost` comes from the connection.
 */
export function reconnectSecondsLeft(startedAtMs: number, nowMs: number): number {
  const remaining = RECONNECT_WINDOW_SECONDS - (nowMs - startedAtMs) / 1000;
  return Math.max(0, Math.ceil(remaining));
}

/** What the countdown draws on. */
export interface ReconnectOverlay {
  show(seconds: number): void;
  hide(): void;
  destroy(): void;
}

/**
 * The scrim and its centred box, over the arena and the HUD. It takes no
 * pointer events, so the leave control under it still works. The
 * seconds are `aria-hidden`: the live region speaks once, when it shows,
 * not every tick.
 */
export function mountReconnectOverlay(parent: HTMLElement): ReconnectOverlay {
  const scrim = document.createElement("div");
  scrim.className = "reconnect-overlay";
  scrim.hidden = true;
  const box = document.createElement("div");
  box.className = "reconnect-overlay-box";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  const title = document.createElement("div");
  title.className = "reconnect-overlay-title";
  title.textContent = "Reconnecting…";
  const seconds = document.createElement("span");
  seconds.setAttribute("aria-hidden", "true");
  title.append(" ", seconds);
  const detail = document.createElement("div");
  detail.className = "reconnect-overlay-detail";
  detail.textContent = "The host's connection dropped. Your seat is held.";
  box.append(title, detail);
  scrim.append(box);
  parent.append(scrim);
  return {
    show(left) {
      seconds.textContent = `${String(left)} s`;
      scrim.hidden = false;
    },
    hide() {
      scrim.hidden = true;
    },
    destroy() {
      scrim.remove();
    },
  };
}

export interface ReconnectCountdown {
  connectionChanged(state: "online" | "reconnecting" | "lost"): void;
  dispose(): void;
}

/**
 * Drive `overlay` from the connection's state: each `reconnecting` starts
 * the window again from its full length, redrawn once a second; `online`
 * and `lost` hide it and stop the clock.
 */
export function attachReconnectCountdown(
  overlay: Pick<ReconnectOverlay, "show" | "hide">,
  now: () => number = () => performance.now(),
): ReconnectCountdown {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
  };
  return {
    connectionChanged(state) {
      stop();
      if (state !== "reconnecting") {
        overlay.hide();
        return;
      }
      const startedAt = now();
      overlay.show(reconnectSecondsLeft(startedAt, startedAt));
      timer = setInterval(() => {
        overlay.show(reconnectSecondsLeft(startedAt, now()));
      }, 1000);
    },
    dispose() {
      stop();
    },
  };
}

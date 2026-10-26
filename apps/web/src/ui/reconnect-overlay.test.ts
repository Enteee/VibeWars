import { RECONNECT_WINDOW_SECONDS } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachReconnectCountdown, reconnectSecondsLeft } from "./reconnect-overlay.js";

describe("reconnectSecondsLeft (#602)", () => {
  it("is the whole window at the start, and counts down in whole seconds", () => {
    expect(reconnectSecondsLeft(1000, 1000)).toBe(RECONNECT_WINDOW_SECONDS);
    expect(reconnectSecondsLeft(1000, 4000)).toBe(RECONNECT_WINDOW_SECONDS - 3);
    expect(reconnectSecondsLeft(1000, 4200)).toBe(RECONNECT_WINDOW_SECONDS - 3);
  });

  it("stops at 0, however late the clock is read", () => {
    expect(reconnectSecondsLeft(0, RECONNECT_WINDOW_SECONDS * 1000)).toBe(0);
    expect(reconnectSecondsLeft(0, 1e9)).toBe(0);
  });
});

describe("attachReconnectCountdown (#602)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A countdown on a fake overlay: what it shows, `undefined` while hidden. */
  function countdown() {
    let shown: number | undefined;
    const overlay = {
      show: (seconds: number) => {
        shown = seconds;
      },
      hide: () => {
        shown = undefined;
      },
    };
    const attached = attachReconnectCountdown(overlay, () => Date.now());
    return { attached, shown: () => shown };
  }

  it("shows the whole window on reconnecting, and 3 s less 3 s later", () => {
    const { attached, shown } = countdown();
    attached.connectionChanged("reconnecting");
    expect(shown()).toBe(30);
    vi.advanceTimersByTime(3000);
    expect(shown()).toBe(27);
  });

  it("goes when the connection is back, or lost, and its clock stops", () => {
    for (const end of ["online", "lost"] as const) {
      const { attached, shown } = countdown();
      attached.connectionChanged("reconnecting");
      vi.advanceTimersByTime(2000);
      attached.connectionChanged(end);
      expect(shown()).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("starts again from the whole window on a second drop", () => {
    const { attached, shown } = countdown();
    attached.connectionChanged("reconnecting");
    vi.advanceTimersByTime(10_000);
    attached.connectionChanged("online");
    attached.connectionChanged("reconnecting");
    expect(shown()).toBe(30);
  });

  it("shows the clock's time after a late tick, as in a hidden tab", () => {
    const { attached, shown } = countdown();
    attached.connectionChanged("reconnecting");
    vi.setSystemTime(Date.now() + 12_500);
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(17);
  });

  it("leaves no timer behind once disposed", () => {
    const { attached } = countdown();
    attached.connectionChanged("reconnecting");
    attached.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

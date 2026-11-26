import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROFILE_INTERVAL_MS } from "@vibewars/game-session";

import { createProfilePacer, PROFILE_SLACK_MS } from "./profile-pacer.js";

const GAP = PROFILE_INTERVAL_MS + PROFILE_SLACK_MS;

describe("profile pacer (#3548)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A lobby whose profile is `sent`, and Options holding `name`. */
  const lobby = () => {
    const state = { name: "Ann", sent: [] as string[], last: "Ann" };
    const pacer = createProfilePacer({
      send: () => {
        if (state.name === state.last) {
          return false;
        }
        state.last = state.name;
        state.sent.push(state.name);
        return true;
      },
    });
    return { state, pacer };
  };

  it("sends the first change at once", () => {
    const { state, pacer } = lobby();
    state.name = "Bo";
    pacer.request();
    expect(state.sent).toEqual(["Bo"]);
  });

  it("sends a change inside the interval when it ends, with the values then", () => {
    const { state, pacer } = lobby();
    state.name = "Bo";
    pacer.request();
    vi.advanceTimersByTime(500);
    state.name = "Bob";
    pacer.request();
    vi.advanceTimersByTime(500);
    state.name = "Bobby";
    pacer.request();
    expect(state.sent).toEqual(["Bo"]);
    vi.advanceTimersByTime(GAP - 1000 - 1);
    expect(state.sent).toEqual(["Bo"]);
    vi.advanceTimersByTime(1);
    expect(state.sent).toEqual(["Bo", "Bobby"]);
  });

  it("sends at once after the interval", () => {
    const { state, pacer } = lobby();
    state.name = "Bo";
    pacer.request();
    vi.advanceTimersByTime(GAP);
    state.name = "Bob";
    pacer.request();
    expect(state.sent).toEqual(["Bo", "Bob"]);
  });

  it("a request that sent nothing does not start the interval", () => {
    const { state, pacer } = lobby();
    pacer.request();
    state.name = "Bo";
    pacer.request();
    expect(state.sent).toEqual(["Bo"]);
  });

  it("drops a waiting send and the interval in a new lobby", () => {
    const { state, pacer } = lobby();
    state.name = "Bo";
    pacer.request();
    state.name = "Bob";
    pacer.request();
    pacer.reset();
    vi.advanceTimersByTime(GAP * 2);
    expect(state.sent).toEqual(["Bo"]);
    pacer.request();
    expect(state.sent).toEqual(["Bo", "Bob"]);
  });
});

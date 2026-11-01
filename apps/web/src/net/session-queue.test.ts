import { NO_GUILD, createMemoryBoard, type QueueState } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enterQueue } from "./session.js";
import type * as Transport from "./transport/index.js";

/** A NAT check that never comes back, as on a page whose STUN is slow. */
vi.mock("./transport/index.js", async (original) => ({
  ...(await original<typeof Transport>()),
  checkTransportNat: () => new Promise<boolean>(() => undefined),
  joinQueueBoard: () => ({
    board: createMemoryBoard().board(),
    newTicketKey: () => ({ ticketId: "a".repeat(64), sign: () => "b".repeat(128) }),
    close: () => undefined,
  }),
}));
vi.mock("./transport/host-clock.js", () => ({ startHostClock: () => () => undefined }));
vi.mock("./transport/turn-config.js", () => ({ loadTurnConfig: () => undefined }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("entering the Random Arena queue (#2090)", () => {
  it("says searching at once, before the NAT check is in", () => {
    vi.stubGlobal("window", new EventTarget());
    const states: QueueState[] = [];
    const place = enterQueue("random-arena-2v2", "Pyro", NO_GUILD, {
      onState: (state) => states.push(state),
      onLobby: () => undefined,
      onRefused: () => undefined,
      onPartyGone: () => undefined,
    });

    expect(states).toEqual([{ kind: "searching", searching: 0, teams: 0, needed: 4, waitedMs: 0 }]);
    place.leave();
  });
});

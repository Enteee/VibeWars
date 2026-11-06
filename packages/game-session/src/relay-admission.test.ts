import { describe, expect, it } from "vitest";

import {
  RELAY_ADMIT_MS,
  RELAY_ADMIT_WINDOW_MS,
  RELAY_READMIT_MS,
  RELAY_ROOMS_LINGER_MS,
  createRelayAdmission,
  type RelayAdmissionLobby,
} from "./relay-admission.js";

/**
 * Which relay asks a lobby host admits (#2527): only for a peer it would
 * seat, while a member holds a relay, within the free seats and the rate
 * limits, keyed on peer id and key together.
 */

const PUB = "B".repeat(87);
const OTHER_PUB = "C".repeat(87);

/** A lobby a test sets: who is seated, who is away, how many seats are free. */
function lobbyOf(free = 4) {
  const seated = new Set<string>();
  const away = new Set<string>();
  const state = { free, inMatch: false };
  const lobby: RelayAdmissionLobby = {
    wouldSeat: (peerId) =>
      away.has(peerId) || (!seated.has(peerId) && !state.inMatch && state.free > 0),
    isAway: (peerId) => away.has(peerId),
    freeSeats: () => state.free,
  };
  return { lobby, seated, away, state };
}

function holding(free = 4) {
  const world = lobbyOf(free);
  const admission = createRelayAdmission(world.lobby);
  admission.holding("member", true);
  return { ...world, admission };
}

describe("relay admission (#2527)", () => {
  it("admits a peer it would seat while a member holds a relay", () => {
    const { admission } = holding();
    expect(admission.ask("joiner", PUB, 0)).toEqual({ peerId: "joiner", pub: PUB });
  });

  it("admits nothing while no member holds one", () => {
    const { lobby } = lobbyOf();
    const admission = createRelayAdmission(lobby);
    expect(admission.ask("joiner", PUB, 0)).toBeUndefined();
    admission.holding("member", true);
    admission.gone("member");
    expect(admission.ask("joiner", PUB, 0)).toBeUndefined();
  });

  it("admits no seated peer, none into a full lobby, none during a match", () => {
    const { admission, seated, state } = holding();
    seated.add("seated");
    expect(admission.ask("seated", PUB, 0)).toBeUndefined();
    state.inMatch = true;
    expect(admission.ask("late", PUB, 0)).toBeUndefined();
    state.inMatch = false;
    state.free = 0;
    expect(admission.ask("full", PUB, 0)).toBeUndefined();
  });

  it("admits an away member's peer id in a match: its seat is its own", () => {
    const { admission, away, state } = holding(0);
    state.inMatch = true;
    away.add("back");
    expect(admission.ask("back", PUB, 0)).toBeDefined();
  });

  it("never holds more live admits than free seats", () => {
    const { admission } = holding(1);
    expect(admission.ask("one", PUB, 0)).toBeDefined();
    expect(admission.ask("two", PUB, 0)).toBeUndefined();
    // The first's admit ends: the seat is askable again.
    expect(admission.ask("two", PUB, RELAY_ADMIT_MS)).toBeDefined();
  });

  it("admits at most two new asks in ten seconds", () => {
    const { admission } = holding(8);
    expect(admission.ask("a", PUB, 0)).toBeDefined();
    expect(admission.ask("b", PUB, 1000)).toBeDefined();
    expect(admission.ask("c", PUB, 2000)).toBeUndefined();
    expect(admission.ask("c", PUB, RELAY_ADMIT_WINDOW_MS)).toBeDefined();
  });

  it("does not readmit an unseated peer for five minutes", () => {
    const { admission } = holding();
    expect(admission.ask("joiner", PUB, 0)).toBeDefined();
    expect(admission.ask("joiner", PUB, RELAY_ADMIT_MS + 1)).toBeUndefined();
    expect(admission.ask("joiner", PUB, RELAY_READMIT_MS)).toBeDefined();
  });

  it("lets a peer that seated and left ask again at once", () => {
    const { admission } = holding();
    expect(admission.ask("joiner", PUB, 0)).toBeDefined();
    admission.seated("joiner");
    expect(admission.ask("joiner", PUB, RELAY_ADMIT_WINDOW_MS)).toBeDefined();
  });

  it("admits the joiner's key though another key asked first with its peer id", () => {
    const { admission } = holding();
    expect(admission.ask("joiner", OTHER_PUB, 0)).toBeDefined();
    expect(admission.ask("joiner", OTHER_PUB, 1000)).toBeUndefined();
    expect(admission.ask("joiner", PUB, 1000)).toEqual({ peerId: "joiner", pub: PUB });
  });

  it("wants the relay rooms while an admit is live and a minute after", () => {
    const { admission } = holding();
    expect(admission.roomsWanted(0)).toBe(false);
    admission.ask("joiner", PUB, 0);
    expect(admission.roomsWanted(RELAY_ADMIT_MS - 1)).toBe(true);
    expect(admission.roomsWanted(RELAY_ADMIT_MS + RELAY_ROOMS_LINGER_MS - 1)).toBe(true);
    expect(admission.roomsWanted(RELAY_ADMIT_MS + RELAY_ROOMS_LINGER_MS)).toBe(false);
  });

  it("wants no relay rooms once nobody holds a relay", () => {
    const { admission } = holding();
    admission.ask("joiner", PUB, 0);
    admission.holding("member", false);
    expect(admission.roomsWanted(1000)).toBe(false);
  });
});

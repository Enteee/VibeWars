import {
  CHANNELS,
  type Channel,
  type WireKeyChallenge,
  type WireLobbyState,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CODE, MAP_IDS, openLobby, playersOf } from "./lobby-harness.test-support.js";
import { cryptoTurns, settle } from "./match-harness.test-support.js";

describe("a guest in a room other key holders come into (#1682)", () => {
  it("hears nothing from a peer that is not its host, and sends it nothing", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    lobby.lobby.setOpen(false);
    await settle();
    const guestId = guest.transport.selfId;
    // Trystero is a mesh: a peer in the room reaches the guests too, and
    // may challenge one as its host would.
    const stranger = lobby.network.join("stranger");
    const fromGuest: Channel[] = [];
    for (const channel of CHANNELS) {
      stranger.on(channel, (_data, from) => {
        if (from === guestId) {
          fromGuest.push(channel);
        }
      });
    }
    await settle();
    stranger.send("key-challenge", { nonce: "2b".repeat(16) } satisfies WireKeyChallenge, guestId);
    const forged: WireLobbyState = {
      code: CODE,
      phase: "waiting",
      mode: "random-arena",
      mapId: MAP_IDS[0],
      open: true,
      hostId: "stranger",
      matchId: null,
      players: [],
      countdownSeconds: null,
      queueNonce: null,
      ascentRound: null,
      teamLobby: null,
    };
    stranger.send("lobby-state", forged, guestId);
    await cryptoTurns();
    expect(fromGuest).toEqual([]);
    expect(guest.connection.getSnapshot().hostId).toBe(lobby.room.selfId);
    expect(guest.connection.getSnapshot().open).toBe(false);
    expect(playersOf(guest).map(({ name }) => name)).toEqual(["Host", "Guest"]);
  });
});

import {
  CHANNELS,
  type Channel,
  type PeerLobbySeat,
  type WireKeyChallenge,
  type WireLobbyState,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CODE, MAP_IDS, openLobby, playersOf } from "./lobby-harness.test-support.js";
import { cryptoTurns, settle, until } from "./match-harness.test-support.js";

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
      teamSize: 4,
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

describe("a guest's lobby rejoin token (#2157)", () => {
  it("returns after a drop with the token its host sent, never one another peer sent", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    const guestId = guest.transport.selfId;
    const mine = "1a".repeat(16);
    const theirs = "2b".repeat(16);
    lobby.room.send("lobby-seat", { rejoinToken: mine } satisfies PeerLobbySeat, guestId);
    const stranger = lobby.network.join("stranger");
    await settle();
    stranger.send("lobby-seat", { rejoinToken: theirs } satisfies PeerLobbySeat, guestId);
    await settle();
    const joins: unknown[] = [];
    lobby.room.on("lobby-join", (data, from) => {
      if (from === guestId) {
        joins.push(data);
      }
    });
    lobby.network.partition(lobby.room.selfId, guestId);
    await settle();
    lobby.network.heal();
    await until(() => joins.length > 0);
    expect(joins).toEqual([expect.objectContaining({ rejoinToken: mine })]);
  });
});

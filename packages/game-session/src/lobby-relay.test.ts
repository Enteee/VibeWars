import { PROTOCOL_VERSION, type WireRelayLogin } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { type Member, openLobby, provenPeer, seat, start } from "./lobby-harness.test-support.js";
import type { LobbyRelaySource } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import type { Transport } from "./transport.js";

/**
 * The relay login a lobby host shares with its members (#2248): to each
 * admitted member alone, on admission and on every change, away and in
 * a match too; never to a peer that is not a member.
 */

const login = (n: number): WireRelayLogin => ({
  urls: ["turn:turn.example:3478?transport=udp"],
  username: `${String(1_800_000_000 + n)}:0123456789abcdef`,
  credential: `credential-${String(n)}`,
});

/** A relay source a test turns: `set` changes the login and tells the host. */
function relaySource(first: WireRelayLogin | null): LobbyRelaySource & {
  set(next: WireRelayLogin | null): void;
} {
  let current = first;
  const handlers = new Set<() => void>();
  return {
    current: () => current,
    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    set(next) {
      current = next;
      for (const handler of [...handlers]) {
        handler();
      }
    },
  };
}

/** Every login `who` was told, through its lobby connection. */
function logins(who: Member): (WireRelayLogin | null)[] {
  const told: (WireRelayLogin | null)[] = [];
  who.connection.onRelayLogin((relay) => told.push(relay));
  return told;
}

/** Every raw `relay-login` message `transport` receives. */
function heard(transport: Transport): unknown[] {
  const told: unknown[] = [];
  transport.on("relay-login", (data) => told.push(data));
  return told;
}

const joinAs = (name: string, rejoinToken: string | null) => ({
  protocolVersion: PROTOCOL_VERSION,
  name,
  guildTag: null,
  guildCape: null,
  admission: null,
  rejoinToken,
});

describe("a lobby host's relay login (#2248)", () => {
  it("tells a member on admission, and every member on each change", async () => {
    const relay = relaySource(login(1));
    const lobby = await openLobby({ relay });
    const told: (WireRelayLogin | null)[][] = [];
    const guests: Member[] = [];
    for (const name of ["Ann", "Bo"]) {
      // Listening before the join, as a guest's session does.
      const guest = await lobby.join(name);
      guests.push(guest);
      told.push(logins(guest));
    }
    // Admission's login came before the listener here; a change reaches both.
    relay.set(login(2));
    await settle();
    relay.set(null);
    await settle();
    expect(told).toEqual([
      [login(2), null],
      [login(2), null],
    ]);
  });

  it("is sent to a joiner on admission, and to nobody that is not a member", async () => {
    const relay = relaySource(login(1));
    const lobby = await openLobby({ relay });
    // Proven the key but never joined, and one in the room without the key.
    const proven = await provenPeer(lobby);
    const bare = lobby.network.join();
    const outsiders = [heard(proven), heard(bare)];
    const joiner = await provenPeer(lobby);
    const admitted = heard(joiner);
    joiner.send("lobby-join", joinAs("Joiner", null), "host");
    await settle();
    expect(admitted).toEqual([{ relay: login(1) }]);
    relay.set(login(2));
    await settle();
    expect(admitted).toEqual([{ relay: login(1) }, { relay: login(2) }]);
    expect(outsiders).toEqual([[], []]);
  });

  it("reaches a member in a match, and a Team Lobby's members", async () => {
    for (const teamLobby of [false, true]) {
      const relay = relaySource(login(1));
      const lobby = await openLobby({ relay, teamLobby });
      const guest = await lobby.join("Guest");
      const told = logins(guest);
      await seat([lobby.host, guest], [0, 1]);
      await start(lobby);
      relay.set(login(2));
      await settle();
      expect(told).toEqual([login(2)]);
    }
  });

  it("tells a member back from a drop the login it missed", async () => {
    const relay = relaySource(login(1));
    const lobby = await openLobby({ relay });
    const guest = await provenPeer(lobby);
    let token: string | null = null;
    guest.on("lobby-seat", (data) => {
      token = (data as { rejoinToken: string }).rejoinToken;
    });
    guest.send("lobby-join", joinAs("Guest", null), "host");
    await settle();
    const id = guest.selfId;
    await guest.leave();
    await settle();
    relay.set(login(2));
    await settle();

    const back = await provenPeer(lobby, id);
    const told = heard(back);
    back.send("lobby-join", joinAs("Guest", token), "host");
    await settle();
    expect(told).toEqual([{ relay: login(2) }]);
  });

  it("is taken from the host alone, and stops when the lobby closes", async () => {
    const relay = relaySource(login(1));
    const lobby = await openLobby({ relay });
    const guest = await lobby.join("Guest");
    const told = logins(guest);
    const member = await provenPeer(lobby);
    member.send("relay-login", { relay: login(9) }, guest.transport.selfId);
    await settle();
    expect(told).toEqual([]);
    await lobby.lobby.close();
    relay.set(login(2));
    await settle();
    expect(told).toEqual([]);
  });
});

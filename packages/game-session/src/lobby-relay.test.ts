import {
  PROTOCOL_VERSION,
  type PeerRelayAdmit,
  type WireRelayLogin,
} from "@vibewars/game-protocol";
import { describe, expect, it, vi } from "vitest";

import { type Member, openLobby, provenPeer, seat, start } from "./lobby-harness.test-support.js";
import type { LobbyRelaySource } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
import { RELAY_ADMIT_MS, RELAY_ROOMS_LINGER_MS } from "./relay-admission.js";
import { MAX_MESSAGE_BYTES, sizeChecked, type Transport } from "./transport.js";

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
      const guest = await lobby.join(name);
      guests.push(guest);
      told.push(logins(guest));
    }
    // Admission's login came before the listener: it is handed the last at once.
    relay.set(login(2));
    await settle();
    relay.set(null);
    await settle();
    expect(told).toEqual([
      [login(1), login(2), null],
      [login(1), login(2), null],
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
      expect(told).toEqual([login(1), login(2)]);
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
    expect(told).toEqual([login(1)]);
    await lobby.lobby.close();
    relay.set(login(2));
    await settle();
    expect(told).toEqual([login(1)]);
  });

  it("is never formatted into a log, even one over the size cap", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const credential = "c".repeat(MAX_MESSAGE_BYTES);
    const transport = sizeChecked(createMemoryNetwork().join());
    transport.send("relay-login", { relay: { ...login(1), credential } });
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/credential-|cccc|0123456789abcdef/);
    error.mockRestore();
  });
});

describe("a lobby host's relay asks (#2527)", () => {
  const PUB = "B".repeat(87);

  /** Every admit `who` was told, through its lobby connection. */
  function admits(who: Member): PeerRelayAdmit[] {
    const told: PeerRelayAdmit[] = [];
    who.connection.onRelayAdmit((admit) => told.push(admit));
    return told;
  }

  it("mints each member's login for that member's peer id", async () => {
    const asked: string[] = [];
    const lobby = await openLobby({
      relay: {
        current: (peerId) => (asked.push(peerId), login(1)),
        onChange: () => () => undefined,
      },
    });
    const guest = await lobby.join("Guest");
    expect(asked).toContain(guest.transport.selfId);
  });

  it("tells every member of an ask it admits, once a member holds a relay", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = [admits(lobby.host), admits(guest)];
    lobby.lobby.relayAsk("joiner", PUB);
    await settle();
    expect(told).toEqual([[], []]);
    guest.connection.setRelayHolding(true);
    await settle();
    lobby.lobby.relayAsk("joiner", PUB);
    await settle();
    expect(told).toEqual([[{ peerId: "joiner", pub: PUB }], [{ peerId: "joiner", pub: PUB }]]);
  });

  it("admits no seated member's peer id", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = admits(guest);
    guest.connection.setRelayHolding(true);
    await settle();
    lobby.lobby.relayAsk(guest.transport.selfId, PUB);
    lobby.lobby.relayAsk(lobby.host.transport.selfId, PUB);
    await settle();
    expect(told).toEqual([]);
  });

  it("takes an admit from the host alone", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = admits(guest);
    const member = await provenPeer(lobby);
    member.send("relay-admit", { peerId: "joiner", pub: PUB }, guest.transport.selfId);
    await settle();
    expect(told).toEqual([]);
  });

  it("wants its relay rooms while an admit is live, and a minute after", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const wanted: boolean[] = [];
    lobby.lobby.onRelayRooms((on) => wanted.push(on));
    guest.connection.setRelayHolding(true);
    await settle();
    lobby.lobby.relayAsk("joiner", PUB);
    lobby.lobby.advance(RELAY_ADMIT_MS / 1000 + RELAY_ROOMS_LINGER_MS / 1000 - 1);
    lobby.lobby.advance(1);
    expect(wanted).toEqual([false, true, false]);
  });

  it("forgets a holder that leaves, and counts no peer that is not a member", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const outsider = await provenPeer(lobby);
    outsider.send("relay-holding", { on: true }, "host");
    await settle();
    const wanted: boolean[] = [];
    lobby.lobby.onRelayRooms((on) => wanted.push(on));
    lobby.lobby.relayAsk("joiner", PUB);
    expect(wanted).toEqual([false]);
    guest.connection.setRelayHolding(true);
    await settle();
    lobby.lobby.relayAsk("other", PUB);
    expect(wanted).toEqual([false, true]);
    await guest.connection.disconnect();
    await settle();
    expect(wanted).toEqual([false, true, false]);
  });

  it("counts an away member a member, and tells when one is gone for good", async () => {
    const lobby = await openLobby();
    const dropped = await lobby.join("Dropped");
    const leaver = await lobby.join("Leaver");
    const gone: string[] = [];
    lobby.lobby.onMemberGone((peerId) => gone.push(peerId));
    expect(lobby.lobby.isMember(dropped.transport.selfId)).toBe(true);
    expect(lobby.lobby.isMember("stranger")).toBe(false);

    await dropped.transport.leave();
    await settle();
    expect(lobby.lobby.isMember(dropped.transport.selfId)).toBe(true);
    expect(gone).toEqual([]);

    await leaver.connection.disconnect();
    await settle();
    expect(lobby.lobby.isMember(leaver.transport.selfId)).toBe(false);
    expect(gone).toEqual([leaver.transport.selfId]);
  });
});

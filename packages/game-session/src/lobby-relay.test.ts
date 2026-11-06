import {
  PROTOCOL_VERSION,
  type PeerRelayAdmit,
  type PeerRelayCredIn,
  type PeerRelayOffers,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { type Member, openLobby, provenPeer, seat, start } from "./lobby-harness.test-support.js";
import { RELAY_CRED_EVERY_MS } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import { RELAY_ADMIT_MS, RELAY_ROOMS_LINGER_MS } from "./relay-admission.js";
import type { Transport } from "./transport.js";

/**
 * A lobby's relay holders and their sealed logins (#2529, ADR-0049): the
 * host lists the seated holders and the members they mint for, to every
 * member on each change, and forwards a holder's seal seated to seated,
 * stamped with the sender's seat, at most one a pair a minute.
 */

const pub = (letter: string): string => letter.repeat(87);

/** Every list `who` was told, through its lobby connection. */
function offers(who: Member): PeerRelayOffers[] {
  const told: PeerRelayOffers[] = [];
  who.connection.onRelayOffers((list) => told.push(list));
  return told;
}

/** Every seal forwarded to `who`, through its lobby connection. */
function creds(who: Member): PeerRelayCredIn[] {
  const told: PeerRelayCredIn[] = [];
  who.connection.onRelayCred((cred) => told.push(cred));
  return told;
}

/** Every raw message on `channel` that `transport` receives. */
function heard(transport: Transport, channel: "relay-offers" | "relay-cred"): unknown[] {
  const told: unknown[] = [];
  transport.on(channel, (data) => told.push(data));
  return told;
}

const joinAs = (name: string, rejoinToken: string | null, relayPub: string | null = null) => ({
  protocolVersion: PROTOCOL_VERSION,
  name,
  guildTag: null,
  guildCape: null,
  admission: null,
  rejoinToken,
  relayPub,
});

describe("a lobby host's relay holders (#2529)", () => {
  it("lists the seated holders in seat order and the members with a key, on each change", async () => {
    const lobby = await openLobby();
    const ann = await lobby.join("Ann", null, null, pub("A"));
    const bo = await lobby.join("Bo", null, null, pub("B"));
    const told = offers(bo);
    const id = (who: Member): string => who.transport.selfId;
    bo.connection.setRelayHolding(true);
    await settle();
    ann.connection.setRelayHolding(true);
    await settle();
    lobby.host.connection.setRelayHolding(true);
    await settle();
    bo.connection.setRelayHolding(false);
    await settle();
    // The host's own player needs no relay to reach the host: never a member to mint for.
    const members = [
      { peerId: id(ann), pub: pub("A") },
      { peerId: id(bo), pub: pub("B") },
    ];
    expect(told).toEqual([
      { holders: [], members },
      { holders: [id(bo)], members },
      { holders: [id(ann), id(bo)], members },
      { holders: [id(lobby.host), id(ann), id(bo)], members },
      { holders: [id(lobby.host), id(ann)], members },
    ]);
  });

  it("tells every member, the host's own player and a member in a match too", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest", null, null, pub("G"));
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    const told = [offers(lobby.host), offers(guest)];
    guest.connection.setRelayHolding(true);
    await settle();
    for (const list of told) {
      expect(list.at(-1)?.holders).toEqual([guest.transport.selfId]);
    }
  });

  it("drops a holder that leaves, and a joiner's key joins the list", async () => {
    const lobby = await openLobby();
    const holder = await lobby.join("Holder", null, null, pub("H"));
    holder.connection.setRelayHolding(true);
    await settle();
    const told = offers(lobby.host);
    const joiner = await lobby.join("Joiner", null, null, pub("J"));
    await holder.connection.disconnect();
    await settle();
    expect(told.slice(-2)).toEqual([
      {
        holders: [holder.transport.selfId],
        members: [
          { peerId: holder.transport.selfId, pub: pub("H") },
          { peerId: joiner.transport.selfId, pub: pub("J") },
        ],
      },
      { holders: [], members: [{ peerId: joiner.transport.selfId, pub: pub("J") }] },
    ]);
  });

  it("is sent to nobody that is not a member, and taken from the host alone", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = offers(guest);
    const outsider = await provenPeer(lobby);
    const overheard = heard(outsider, "relay-offers");
    outsider.send("relay-holding", { on: true }, "host");
    outsider.send("relay-offers", { holders: [outsider.selfId], members: [] }, guest.transport.selfId);
    guest.connection.setRelayHolding(true);
    await settle();
    expect(overheard).toEqual([]);
    expect(told.map(({ holders }) => holders)).toEqual([[], [guest.transport.selfId]]);
  });

  it("tells a member back from a drop the list, with its new key", async () => {
    const lobby = await openLobby();
    const holder = await lobby.join("Holder");
    holder.connection.setRelayHolding(true);
    const guest = await provenPeer(lobby);
    let token: string | null = null;
    guest.on("lobby-seat", (data) => {
      token = (data as { rejoinToken: string }).rejoinToken;
    });
    guest.send("lobby-join", joinAs("Guest", null, pub("G")), "host");
    await settle();
    const id = guest.selfId;
    await guest.leave();
    await settle();

    const back = await provenPeer(lobby, id);
    const told = heard(back, "relay-offers");
    back.send("lobby-join", joinAs("Guest", token, pub("N")), "host");
    await settle();
    expect(told).toEqual([
      { holders: [holder.transport.selfId], members: [{ peerId: id, pub: pub("N") }] },
    ]);
  });

  it("refuses a join whose relay key is not a P-256 key", async () => {
    const lobby = await openLobby();
    const guest = await provenPeer(lobby);
    const states = heard(guest, "relay-offers");
    guest.send("lobby-join", joinAs("Guest", null, "short"), "host");
    await settle();
    expect(states).toEqual([]);
    expect(lobby.lobby.isMember(guest.selfId)).toBe(false);
  });
});

describe("a lobby host's sealed relay logins (#2529)", () => {
  const SEAL = "sealed.login-text_0";

  it("forwards a holder's seal to a seated member, stamped with the holder's seat", async () => {
    const lobby = await openLobby();
    const holder = await lobby.join("Holder");
    const guest = await lobby.join("Guest");
    const told = creds(guest);
    const raw = holder.transport;
    raw.send("relay-cred", { to: guest.transport.selfId, from: "forged", seal: SEAL }, "host");
    await settle();
    expect(told).toEqual([{ from: raw.selfId, seal: SEAL }]);
  });

  it("forwards the host's own player's seal the same way", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = creds(guest);
    lobby.host.connection.sendRelayCred(guest.transport.selfId, SEAL);
    await settle();
    expect(told).toEqual([{ from: lobby.host.transport.selfId, seal: SEAL }]);
  });

  it("forwards nothing from or to a peer that is not seated, nor to the host's own player", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const outsider = await provenPeer(lobby);
    const told = [creds(guest), creds(lobby.host)];
    const overheard = heard(outsider, "relay-cred");
    outsider.send("relay-cred", { to: guest.transport.selfId, seal: SEAL }, "host");
    guest.connection.sendRelayCred(outsider.selfId, SEAL);
    guest.connection.sendRelayCred(lobby.host.transport.selfId, SEAL);
    guest.connection.sendRelayCred(guest.transport.selfId, SEAL);
    await settle();
    expect(told).toEqual([[], []]);
    expect(overheard).toEqual([]);
  });

  it("takes a seal from the host alone", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest");
    const told = creds(guest);
    const member = await provenPeer(lobby);
    member.send("relay-cred", { from: member.selfId, seal: SEAL }, guest.transport.selfId);
    await settle();
    expect(told).toEqual([]);
  });

  it("forwards one seal a pair each RELAY_CRED_EVERY_MS, and the first after a seat", async () => {
    const lobby = await openLobby();
    const holder = await lobby.join("Holder");
    const other = await lobby.join("Other");
    const guest = await provenPeer(lobby);
    let token: string | null = null;
    guest.on("lobby-seat", (data) => {
      token = (data as { rejoinToken: string }).rejoinToken;
    });
    guest.send("lobby-join", joinAs("Guest", null), "host");
    await settle();
    const id = guest.selfId;
    const told = heard(guest, "relay-cred");
    const send = (from: Member, seal: string): void => {
      from.connection.sendRelayCred(id, seal);
    };
    send(holder, "a");
    send(holder, "b");
    send(other, "c");
    await settle();
    lobby.lobby.advance(RELAY_CRED_EVERY_MS / 1000 - 1);
    send(holder, "d");
    await settle();
    lobby.lobby.advance(1);
    send(holder, "e");
    await settle();
    expect(told.map((cred) => (cred as PeerRelayCredIn).seal)).toEqual(["a", "c", "e"]);

    await guest.leave();
    await settle();
    const back = await provenPeer(lobby, id);
    const after = heard(back, "relay-cred");
    back.send("lobby-join", joinAs("Guest", token), "host");
    await settle();
    send(holder, "f");
    await settle();
    expect(after).toEqual([{ from: holder.transport.selfId, seal: "f" }]);
  });

  it("refuses a seal over MAX_RELAY_SEAL_CHARS or outside its alphabet", async () => {
    const lobby = await openLobby();
    const holder = await lobby.join("Holder");
    const guest = await lobby.join("Guest");
    const told = creds(guest);
    holder.connection.sendRelayCred(guest.transport.selfId, "s".repeat(2049));
    holder.connection.sendRelayCred(guest.transport.selfId, "no spaces");
    await settle();
    expect(told).toEqual([]);
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

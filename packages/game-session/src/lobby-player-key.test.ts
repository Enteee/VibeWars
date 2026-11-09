import {
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  parsePeerLobbyChallenge,
  parsePeerLobbySeat,
  parseWireLobbyNote,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  CODE,
  openLobby,
  playersOf,
  provenPeer,
  type TestLobby,
} from "./lobby-harness.test-support.js";
import { LOBBY_PROOF_MS } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import type { PlayerKey, VerifyPlayerProof } from "./player-key.js";
import { testPlayerKey, verifyTestProof } from "./player-key.test-support.js";
import type { Transport } from "./transport.js";

/**
 * The player key at the lobby host (#2706): every join proves the key it
 * names, on a fresh nonce, for this host, this sender and this lobby,
 * before it is seated.
 */

/** A coded lobby's join as `name`, naming `key`. */
const joinOf = (name: string, key: PlayerKey, rejoinToken: string | null = null) => ({
  protocolVersion: PROTOCOL_VERSION,
  name,
  guildTag: null,
  guildCape: null,
  admission: null,
  rejoinToken,
  relayPub: null,
  playerPubkey: key.pubkey,
  ascentMorale: 0,
});

interface HandPeer {
  readonly transport: Transport;
  /** Each nonce the host challenged it with, in order. */
  readonly nonces: string[];
  /** Each reason the host refused it for, in order. */
  readonly refusals: string[];
  /** The last rejoin token the host gave it. */
  token: string | null;
}

/** A peer in the lobby's room that answers no challenge by itself. */
async function handPeer(lobby: TestLobby, peerId?: string): Promise<HandPeer> {
  const transport = await provenPeer(lobby, peerId, null);
  const peer: HandPeer = { transport, nonces: [], refusals: [], token: null };
  transport.on("lobby-challenge", (data) => {
    const challenge = parsePeerLobbyChallenge(data);
    if (challenge !== undefined) {
      peer.nonces.push(challenge.nonce);
    }
  });
  transport.on("lobby-note", (data) => {
    const note = parseWireLobbyNote(data);
    if (note?.kind === "refused") {
      peer.refusals.push(note.reason);
    }
  });
  transport.on("lobby-seat", (data) => {
    peer.token = parsePeerLobbySeat(data)?.rejoinToken ?? null;
  });
  return peer;
}

/** What `peer`'s proof of `nonce` names, rightly: the harness's host is `"host"`. */
const fieldsOf = (peer: HandPeer, nonce: string) => ({
  hostPeerId: "host",
  joinerPeerId: peer.transport.selfId,
  roomId: CODE,
  nonce,
});

/** Send `join` from `peer`, and the nonce the host challenged it with. */
async function challenged(peer: HandPeer, join: ReturnType<typeof joinOf>): Promise<string> {
  const before = peer.nonces.length;
  peer.transport.send("lobby-join", join, "host");
  await settle();
  const nonce = peer.nonces[before];
  if (nonce === undefined) {
    throw new Error("no lobby challenge");
  }
  return nonce;
}

async function prove(peer: HandPeer, sig: string): Promise<void> {
  peer.transport.send("lobby-proof", { sig }, "host");
  await settle();
}

const names = (lobby: TestLobby) => playersOf(lobby.host).map(({ name }) => name);

describe("the lobby host's player-key proof (#2706)", () => {
  it("seats a join whose proof verifies, and lists the key it proved", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const peer = await handPeer(lobby);
    const nonce = await challenged(peer, joinOf("Proven", key));
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    // Nothing of it is acted on before its proof.
    expect(names(lobby)).toEqual(["Host"]);
    await prove(peer, key.signLobbyProof(fieldsOf(peer, nonce)));
    expect(names(lobby)).toEqual(["Host", "Proven"]);
    const players = lobby.host.connection.getSnapshot().players;
    expect(players[1]?.playerPubkey).toBe(key.pubkey);
    // The host's own player proved its key the same way.
    expect(players[0]?.playerPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(peer.refusals).toEqual([]);
  });

  it("refuses a proof by another key, or of another nonce, host, sender or lobby", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const wrongs: ((peer: HandPeer, nonce: string) => string)[] = [
      (peer, nonce) => testPlayerKey().signLobbyProof(fieldsOf(peer, nonce)),
      (peer) => key.signLobbyProof(fieldsOf(peer, "00".repeat(32))),
      (peer, nonce) => key.signLobbyProof({ ...fieldsOf(peer, nonce), hostPeerId: "elsewhere" }),
      (peer, nonce) => key.signLobbyProof({ ...fieldsOf(peer, nonce), joinerPeerId: "someone" }),
      (peer, nonce) => key.signLobbyProof({ ...fieldsOf(peer, nonce), roomId: "another-lobby" }),
      () => "ab".repeat(64),
      () => "not a signature",
    ];
    for (const wrong of wrongs) {
      const peer = await handPeer(lobby);
      const nonce = await challenged(peer, joinOf("Forger", key));
      await prove(peer, wrong(peer, nonce));
      expect(peer.refusals).toEqual(["unproven"]);
      // One proof a nonce: the right one, late, finds none pending.
      await prove(peer, key.signLobbyProof(fieldsOf(peer, nonce)));
      expect(peer.refusals).toEqual(["unproven"]);
    }
    expect(names(lobby)).toEqual(["Host"]);
    // And the host still seats the next join.
    await lobby.join("Next");
    expect(names(lobby)).toEqual(["Host", "Next"]);
  });

  it("refuses a proof a peer made for another sender, sent on by a relay", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const victim = await handPeer(lobby);
    const relay = await handPeer(lobby);
    const nonce = await challenged(relay, joinOf("Victim", key));
    // The victim signs the relay's nonce as it would its own join.
    await prove(relay, key.signLobbyProof(fieldsOf(victim, nonce)));
    expect(relay.refusals).toEqual(["unproven"]);
    expect(names(lobby)).toEqual(["Host"]);
  });

  it("refuses a join that proves nothing within LOBBY_PROOF_MS", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const peer = await handPeer(lobby);
    const nonce = await challenged(peer, joinOf("Slow", key));
    await lobby.step(LOBBY_PROOF_MS / 1000 - 0.5);
    expect(peer.refusals).toEqual([]);
    await lobby.step(1);
    expect(peer.refusals).toEqual(["unproven"]);
    await prove(peer, key.signLobbyProof(fieldsOf(peer, nonce)));
    expect(names(lobby)).toEqual(["Host"]);
  });

  it("challenges a second join while one is pending on the same nonce, and seats the second", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const peer = await handPeer(lobby);
    const nonce = await challenged(peer, joinOf("First", key));
    peer.transport.send("lobby-join", joinOf("Second", key), "host");
    await settle();
    expect(peer.nonces).toEqual([nonce]);
    await prove(peer, key.signLobbyProof(fieldsOf(peer, nonce)));
    expect(names(lobby)).toEqual(["Host", "Second"]);
  });

  it("takes a seat back only with its token and the key it proved, on a fresh nonce", async () => {
    const lobby = await openLobby();
    const key = testPlayerKey();
    const guest = await handPeer(lobby);
    const first = await challenged(guest, joinOf("Guest", key));
    const firstProof = key.signLobbyProof(fieldsOf(guest, first));
    await prove(guest, firstProof);
    const { token } = guest;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const id = guest.transport.selfId;
    await guest.transport.leave();
    await settle();

    const back = await handPeer(lobby, id);
    // The seat's token, but another key: no challenge, and the seat stays away.
    back.transport.send("lobby-join", joinOf("Thief", testPlayerKey(), token), "host");
    await settle();
    expect(back.nonces).toEqual([]);
    expect(names(lobby)).toEqual(["Host", "Guest"]);
    expect(lobby.host.connection.getSnapshot().players[1]?.away).toBe(true);

    // Its own key: challenged afresh, and the old proof is no answer.
    const again = await challenged(back, joinOf("Guest", key, token));
    expect(again).not.toBe(first);
    await prove(back, firstProof);
    expect(back.refusals).toEqual(["unproven"]);
    expect(lobby.host.connection.getSnapshot().players[1]?.away).toBe(true);

    // Refused, it is challenged no more until it comes back.
    await back.transport.leave();
    await settle();
    const later = await handPeer(lobby, id);
    const last = await challenged(later, joinOf("Guest", key, token));
    await prove(later, key.signLobbyProof(fieldsOf(later, last)));
    expect(lobby.host.connection.getSnapshot().players[1]?.away).toBe(false);
    expect(lobby.host.connection.getSnapshot().players[1]?.playerPubkey).toBe(key.pubkey);
  });

  it("holds no more pending challenges than the lobby has seats under a join flood", async () => {
    const lobby = await openLobby();
    const flood: HandPeer[] = [];
    for (let i = 0; i < MAX_LOBBY_PLAYERS + 4; i += 1) {
      const peer = await handPeer(lobby);
      peer.transport.send("lobby-join", joinOf(`Flood ${String(i)}`, testPlayerKey()), "host");
      flood.push(peer);
    }
    await settle();
    const challengedPeers = flood.filter((peer) => peer.nonces.length > 0);
    expect(challengedPeers).toHaveLength(MAX_LOBBY_PLAYERS);
    expect(flood.filter((peer) => peer.refusals.includes("lobby-full"))).toHaveLength(4);
    // Once they time out, a join is challenged and seated again.
    await lobby.step(LOBBY_PROOF_MS / 1000 + 0.5);
    await lobby.join("Patient");
    expect(names(lobby)).toEqual(["Host", "Patient"]);
  });

  it("checks one bad proof a peer while it is here, however often it joins again", async () => {
    let checks = 0;
    const verifyPlayerProof: VerifyPlayerProof = (...args) => {
      checks += 1;
      return verifyTestProof(...args);
    };
    const lobby = await openLobby({ verifyPlayerProof });
    // The host's own player proved its key too.
    checks = 0;
    const peer = await handPeer(lobby);
    for (let i = 0; i < 50; i += 1) {
      peer.transport.send("lobby-join", joinOf("Looper", testPlayerKey()), "host");
      await settle();
      peer.transport.send("lobby-proof", { sig: "00".repeat(64) }, "host");
      await settle();
    }
    expect(checks).toBe(1);
    expect(peer.nonces).toHaveLength(1);
    expect(peer.refusals).toEqual(["unproven"]);
    // Gone and back, it is a new peer: challenged again.
    await peer.transport.leave();
    await settle();
    const back = await handPeer(lobby, peer.transport.selfId);
    const key = testPlayerKey();
    const nonce = await challenged(back, joinOf("Back", key));
    await prove(back, key.signLobbyProof(fieldsOf(back, nonce)));
    expect(names(lobby)).toEqual(["Host", "Back"]);
  });

  it("refuses a join it would refuse anyway without a challenge", async () => {
    const lobby = await openLobby({ open: false });
    const peer = await handPeer(lobby);
    peer.transport.send("lobby-join", joinOf("Shut out", testPlayerKey()), "host");
    await settle();
    expect(peer.nonces).toEqual([]);
    expect(peer.refusals).toEqual(["closed"]);
  });
});

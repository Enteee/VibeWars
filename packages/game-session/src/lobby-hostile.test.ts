import type { JsonValue } from "@vibewars/game-protocol";
import { MESSAGE_BURST, MESSAGES_PER_SECOND } from "./intent-budget.js";
import { describe, expect, it } from "vitest";

import {
  openLobby,
  playersOf,
  provenPeer,
  seat,
  start,
  type TestLobby,
} from "./lobby-harness.test-support.js";
import { settle } from "./match-harness.test-support.js";
import type { Transport } from "./transport.js";

/**
 * A hostile peer against the lobby host (#379), ported from the lobby
 * parts of the server's `apps/server/src/fuzz.test.ts`, and the cases
 * only P2P has: anyone in the room can send anything, to anyone,
 * claiming nothing but its own peer id.
 */

/** Values chosen to break naive parsers. */
const HOSTILE: JsonValue[] = [
  null,
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER,
  "",
  "0",
  "\u0000",
  "x".repeat(500),
  true,
  [],
  [1, 2, 3],
  {},
  { kind: "choose-team" },
  { kind: "choose-team", team: "1" },
  { kind: "choose-team", team: 2 },
  { kind: "ready" },
  { kind: "ready", ready: "true" },
  { kind: "select-map" },
  { kind: "select-map", mapId: 7 },
  { kind: "select-map", mapId: "x".repeat(500) },
  { kind: "start", extra: { deeply: { nested: "junk" } } },
  { kind: "__proto__" },
  { kind: "constructor" },
  { protocolVersion: 42, name: "x" },
  { protocolVersion: "x".repeat(500), name: "x" },
];

/**
 * A peer in the room that holds the key (#1681) but has not joined the
 * lobby, and speaks the wire by hand.
 */
async function stranger(lobby: TestLobby): Promise<Transport> {
  const transport = await provenPeer(lobby);
  await settle();
  return transport;
}

describe("lobby host against hostile peers", () => {
  it("ignores every hostile lobby message and keeps the lobby healthy", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    for (const value of HOSTILE) {
      guest.transport.send("lobby-cmd", value, "host");
      guest.transport.send("lobby-join", value, "host");
    }
    await settle();
    // Nothing hostile put anyone on a team, marked them ready, changed the
    // map or started a match.
    expect(playersOf(lobby.host)).toEqual([
      { name: "Host", team: null, ready: false },
      { name: "Guest", team: null, ready: false },
    ]);
    expect(lobby.host.connection.getSnapshot().mapId).toBe("test-arena");
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
    // And it still listens.
    guest.connection.chooseTeam(1);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBe(1);
  });

  it("acts on nothing a peer says before its lobby-join", async () => {
    const lobby = await openLobby();
    const peer = await stranger(lobby);
    peer.send("lobby-cmd", { kind: "choose-team", team: 0 }, "host");
    peer.send("lobby-cmd", { kind: "ready", ready: true }, "host");
    peer.send("lobby-cmd", { kind: "start" }, "host");
    await settle();
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
    expect(lobby.matches).toHaveLength(0);
  });

  it("takes no lobby state from a peer other than the host", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    const peer = await stranger(lobby);
    const forged = {
      ...structuredClone(guest.connection.getSnapshot()),
      hostId: peer.selfId,
      phase: "in-match",
      players: [{ id: guest.transport.selfId, name: "Owned", team: 0, ready: true, isHost: true }],
      matchId: "match-1",
    };
    peer.send("lobby-state", forged, guest.transport.selfId);
    // Claiming to be the host does not make it so either.
    peer.send("lobby-state", { ...forged, hostId: "host" }, guest.transport.selfId);
    peer.send("match-start", { mapId: "test-arena", matchId: "match-1" }, guest.transport.selfId);
    peer.send("lobby-note", { kind: "refused", reason: "host-left" }, guest.transport.selfId);
    await settle();
    expect(guest.connection.getSnapshot().phase).toBe("waiting");
    expect(playersOf(guest).map(({ name }) => name)).toEqual(["Host", "Guest"]);
    expect(guest.starts).toEqual([]);
  });

  it("lets a member's lobby-cmd name no one but itself", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    // A command carries no player id: what it changes is its sender.
    guest.transport.send(
      "lobby-cmd",
      { kind: "choose-team", team: 1, id: lobby.host.transport.selfId },
      "host",
    );
    await settle();
    expect(playersOf(lobby.host).map(({ team }) => team)).toEqual([null, 1]);
  });

  it("ignores a member's commands over its budget, then listens again", async () => {
    const lobby = await openLobby();
    const flooder = await lobby.join("Flooder");
    // Each one a change, so each would cost everyone a state.
    for (let i = 0; i < MESSAGE_BURST + 100; i += 1) {
      flooder.connection.chooseTeam(i % 2 === 0 ? 0 : 1);
    }
    await settle();
    // The burst was spent on its join, which goes once, to the host alone
    // once it proved the key (#1681), and the first MESSAGE_BURST - 1; the
    // rest were dropped.
    expect(playersOf(lobby.host)[1]?.team).toBe(MESSAGE_BURST % 2 === 0 ? 0 : 1);
    flooder.connection.chooseTeam(null);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).not.toBeNull();
    await lobby.step(2 / MESSAGES_PER_SECOND);
    flooder.connection.chooseTeam(null);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBeNull();
  });

  it("does not refill a peer's budget for joining again under the same id", async () => {
    const lobby = await openLobby();
    const flooder = await lobby.join("Flooder");
    for (let i = 0; i < MESSAGE_BURST; i += 1) {
      flooder.connection.setReady(false);
    }
    await settle();
    flooder.transport.send("lobby-join", { protocolVersion: "x", name: "Again" }, "host");
    flooder.connection.chooseTeam(0);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBeNull();
  });

  it("ignores a hello for its match from a member it did not seat, and the match plays on", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    await seat([lobby.host, guest], [0, null]);
    await start(lobby);
    guest.transport.send("hello", { junk: true }, "host");
    await lobby.step(0.1);
    expect(lobby.matches[0]?.host.phase).toBe("active");
  });
});

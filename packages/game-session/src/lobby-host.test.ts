import { DEFAULT_MATCH_RULES } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parseWireLobbyNote,
  parseWireLobbyState,
  type WireLobbyNote,
  type WireLobbyState,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { LobbyNoAnswerError, LobbyRefusedError, joinLobby } from "./lobby-client.js";
import {
  CODE,
  MAP_IDS,
  openLobby,
  play,
  playersOf,
  seat,
  start,
  type Member,
  type TestLobby,
} from "./lobby-harness.test-support.js";
import { canStart } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { createMemoryNetwork } from "./memory-transport.js";
import type { Transport, TransportTrouble } from "./transport.js";

/**
 * The server's lobby-room tests (`apps/server/src/lobby.test.ts`), ported
 * to the P2P lobby host (#379): the same rules, asked of
 * `createLobbyHost` over the memory transport instead of a Colyseus room.
 * Where P2P means to differ, such as the lobby ending with its host, the
 * test says so.
 */

/** Every message `transport` is sent on one channel, through `parse`. */
function collect<T>(
  transport: Transport,
  channel: "lobby-state" | "lobby-note",
  parse: (value: unknown) => T | undefined,
): T[] {
  const got: T[] = [];
  transport.on(channel, (data) => {
    const message = parse(data);
    if (message !== undefined) {
      got.push(message);
    }
  });
  return got;
}

/** A peer in the room that speaks the wire by hand. */
async function rawPeer(lobby: TestLobby): Promise<{
  transport: Transport;
  states: WireLobbyState[];
  notes: WireLobbyNote[];
}> {
  const transport = lobby.network.join();
  const states = collect(transport, "lobby-state", parseWireLobbyState);
  const notes = collect(transport, "lobby-note", parseWireLobbyNote);
  await settle();
  return { transport, states, notes };
}

/** A host and one guest, the guest's peer id, and the lobby. */
async function hostAndGuest(): Promise<{ lobby: TestLobby; guest: Member }> {
  const lobby = await openLobby();
  return { lobby, guest: await lobby.join() };
}

describe("lobby host", () => {
  it("lists the code it was given, in the phase a fresh lobby starts in", async () => {
    const lobby = await openLobby();
    const snapshot = lobby.host.connection.getSnapshot();
    expect(snapshot.code).toBe(CODE);
    expect(snapshot.phase).toBe("waiting");
    expect(snapshot.mapId).toBe(MAP_IDS[0]);
  });

  it("refuses a guest with a wrong or missing protocol version, and keeps no trace", async () => {
    const lobby = await openLobby();
    const peer = await rawPeer(lobby);
    peer.transport.send("lobby-join", { protocolVersion: "stale", name: "Old" });
    peer.transport.send("lobby-join", { name: "None" });
    await settle();
    expect(peer.notes).toEqual([
      { kind: "refused", reason: "protocol-mismatch" },
      { kind: "refused", reason: "protocol-mismatch" },
    ]);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });

  it("makes the host's own player the host", async () => {
    const { lobby, guest } = await hostAndGuest();
    expect(lobby.host.connection.getSnapshot().isHost).toBe(true);
    expect(guest.connection.getSnapshot().isHost).toBe(false);
    expect(lobby.host.connection.getSnapshot().players.map(({ isHost }) => isHost)).toEqual([
      true,
      false,
    ]);
  });

  it("sanitises the display name a client asks for", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("  ‮evil\u0000name that goes on and on  ");
    expect(playersOf(guest)[1]?.name).toBe("evilname that go");
  });

  it("lists the character a joiner brings to everyone, and a starter build as null (#580)", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Guest", {
      name: "Mhenlo",
      primary: "monk",
      secondary: "elementalist",
    });
    for (const member of [lobby.host, guest]) {
      expect(member.connection.getSnapshot().players.map(({ character }) => character)).toEqual([
        null,
        { name: "Mhenlo", primary: "monk", secondary: "elementalist" },
      ]);
    }
  });

  it("lists a character no build could be as a starter build, and sanitises its name (#580)", async () => {
    const lobby = await openLobby();
    for (const [primary, secondary] of [
      ["pirate", null],
      ["monk", "pirate"],
      ["monk", "monk"],
      ["elementalist", null],
    ] as const) {
      const peer = await rawPeer(lobby);
      peer.transport.send("lobby-join", {
        protocolVersion: PROTOCOL_VERSION,
        name: primary,
        character: { name: "  \u202eCynn\u0000  ", primary, secondary },
      });
    }
    await settle();
    expect(lobby.host.connection.getSnapshot().players.map(({ character }) => character)).toEqual([
      null,
      null,
      null,
      null,
      { name: "Cynn", primary: "elementalist", secondary: null },
    ]);
  });

  it("lets a second player join with the code and does not make them host", async () => {
    const { lobby, guest } = await hostAndGuest();
    await settle();
    for (const who of [lobby.host, guest]) {
      expect(playersOf(who)).toEqual([
        { name: "Host", team: null, ready: false },
        { name: "Guest", team: null, ready: false },
      ]);
    }
  });

  it("assigns a team when a player chooses one", async () => {
    const { lobby, guest } = await hostAndGuest();
    guest.connection.chooseTeam(1);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBe(1);
  });

  it("rejects a nonsense team value rather than accepting it", async () => {
    const { lobby, guest } = await hostAndGuest();
    const nonsense = (team: number | string) => {
      guest.transport.send("lobby-cmd", { kind: "choose-team", team }, "host");
    };
    for (const team of [2, -1, 0.5, "0"]) {
      nonsense(team);
    }
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBeNull();
    guest.connection.chooseTeam(0);
    nonsense(7);
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBe(0);
  });

  it("clears readiness when a player switches teams", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([guest], [0]);
    expect(playersOf(lobby.host)[1]?.ready).toBe(true);
    guest.connection.chooseTeam(1);
    await settle();
    expect(playersOf(lobby.host)[1]).toEqual({ name: "Guest", team: 1, ready: false });
  });

  it("refuses to mark a spectator ready", async () => {
    const { lobby, guest } = await hostAndGuest();
    guest.connection.setReady(true);
    await settle();
    expect(playersOf(lobby.host)[1]?.ready).toBe(false);
  });

  it("rejects starting when nobody is on a team", async () => {
    const lobby = await openLobby();
    const rejected: string[] = [];
    lobby.host.connection.onStartRejected((reason) => rejected.push(reason));
    await start(lobby);
    expect(rejected).toEqual(["nobody has joined a team"]);
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
  });

  it("rejects starting while someone on a team is not ready, telling the host alone", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([lobby.host], [0]);
    guest.connection.chooseTeam(1);
    await settle();
    const told = { host: [] as string[], guest: [] as string[] };
    lobby.host.connection.onStartRejected((reason) => told.host.push(reason));
    guest.connection.onStartRejected((reason) => told.guest.push(reason));
    await start(lobby);
    expect(told).toEqual({ host: ["not everyone on a team is ready"], guest: [] });
    expect(lobby.matches).toHaveLength(0);
  });

  it("ignores a start request from a non-host", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([lobby.host, guest], [0, 1]);
    const rejected: string[] = [];
    guest.connection.onStartRejected((reason) => rejected.push(reason));
    guest.connection.startMatch();
    await settle();
    expect(lobby.matches).toHaveLength(0);
    expect(rejected).toEqual([]);
    expect(guest.connection.getSnapshot().phase).toBe("waiting");
  });

  it("starts the match when the host asks and everyone on a team is ready", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    expect(lobby.matches).toHaveLength(1);
    for (const who of [lobby.host, guest]) {
      expect(who.connection.getSnapshot().phase).toBe("in-match");
      expect(who.starts.map(({ mapId }) => mapId)).toEqual([MAP_IDS[0]]);
    }
  });

  it("ends the lobby for everyone when the host leaves, rather than handing hosting on", async () => {
    // The server passed hosting on; in P2P the host *is* the server.
    const { lobby, guest } = await hostAndGuest();
    const other = await lobby.join("Other");
    const closed: string[] = [];
    for (const who of [lobby.host, guest, other]) {
      who.connection.onClosed((reason) => closed.push(reason));
    }
    await lobby.lobby.close();
    await settle();
    expect(closed).toEqual(["host-left", "host-left", "host-left"]);
  });

  it("ends the lobby for everyone when the host's tab goes without a word", async () => {
    const { lobby, guest } = await hostAndGuest();
    const closed: string[] = [];
    guest.connection.onClosed((reason) => closed.push(reason));
    lobby.network.partition("host", guest.transport.selfId);
    await settle();
    expect(closed).toEqual(["host-left"]);
  });

  it("ignores a map selection from a non-host, and an unknown map from the host", async () => {
    const { lobby, guest } = await hostAndGuest();
    guest.connection.selectMap(MAP_IDS[1]);
    lobby.host.connection.selectMap("no-such-map");
    await settle();
    expect(guest.connection.getSnapshot().mapId).toBe(MAP_IDS[0]);
    lobby.host.connection.selectMap(MAP_IDS[1]);
    await settle();
    expect(guest.connection.getSnapshot().mapId).toBe(MAP_IDS[1]);
  });

  it("clears everyone's readiness when the host picks another map", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([lobby.host, guest], [0, 1]);
    lobby.host.connection.selectMap(MAP_IDS[1]);
    await settle();
    expect(playersOf(guest).map(({ ready }) => ready)).toEqual([false, false]);
  });

  it("turns a member away once it holds MAX_LOBBY_PLAYERS, and says so", async () => {
    const lobby = await openLobby();
    for (let i = 1; i < 16; i += 1) {
      await lobby.join(`Guest ${String(i)}`);
    }
    await expect(
      joinLobby({
        transport: lobby.network.join(),
        code: CODE,
        name: "Late",
        character: null,
        timeoutMs: 1000,
      }),
    ).rejects.toEqual(new LobbyRefusedError("lobby-full"));
    expect(playersOf(lobby.host)).toHaveLength(16);
  });

  it("drops a member who leaves the room from the lobby", async () => {
    const { lobby, guest } = await hostAndGuest();
    await guest.connection.disconnect();
    await settle();
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });
});

describe("canStart", () => {
  it("wants somebody on a team, and everyone on a team ready; spectators do not count", () => {
    expect(canStart([])).toEqual({ ok: false, reason: "nobody has joined a team" });
    expect(canStart([{ team: null, ready: false }])).toEqual({
      ok: false,
      reason: "nobody has joined a team",
    });
    expect(
      canStart([
        { team: 0, ready: true },
        { team: 1, ready: false },
      ]),
    ).toEqual({ ok: false, reason: "not everyone on a team is ready" });
    expect(
      canStart([
        { team: 0, ready: true },
        { team: null, ready: false },
      ]),
    ).toEqual({ ok: true });
  });
});

describe("playing more than one match in a lobby", () => {
  /** A host on team 0 and a guest on team 1, both playing the lobby's first match. */
  async function startAMatch(options: { timeLimitSeconds?: number } = {}) {
    const lobby = await openLobby({
      matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: options.timeLimitSeconds ?? 600 },
    });
    const guest = await lobby.join();
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    const matches = [await play(lobby.host, "Host"), await play(guest, "Guest")];
    return { lobby, guest, matches };
  }

  /** Everyone leaves the match, which is how one that never finished ends. */
  async function leaveTheMatch(
    lobby: TestLobby,
    matches: readonly { disconnect(): Promise<void> }[],
  ) {
    for (const match of matches) {
      await match.disconnect();
    }
    await lobby.step(0.05);
  }

  it("returns to waiting the moment its match finishes, with readiness cleared and teams kept", async () => {
    const { lobby, guest } = await startAMatch({ timeLimitSeconds: 1 });
    await lobby.step(1);
    for (const who of [lobby.host, guest]) {
      expect(who.connection.getSnapshot().phase).toBe("waiting");
      expect(playersOf(who)).toEqual([
        { name: "Host", team: 0, ready: false },
        { name: "Guest", team: 1, ready: false },
      ]);
    }
  });

  it("returns to waiting once, at the finish, and not again after", async () => {
    const { lobby } = await startAMatch({ timeLimitSeconds: 1 });
    let changes = 0;
    lobby.host.connection.onChange(() => {
      changes += 1;
    });
    await lobby.step(1);
    expect(changes).toBe(1);
    await lobby.step(1);
    expect(changes).toBe(1);
  });

  it("lets its match finish quietly when the lobby itself is already gone", async () => {
    const { lobby, matches } = await startAMatch({ timeLimitSeconds: 1 });
    const lost: string[] = [];
    for (const match of matches) {
      match.onConnectionChange((state) => lost.push(state));
    }
    await lobby.lobby.close();
    await settle();
    // The match ended with its host: nothing more is ticked, nothing throws.
    await lobby.step(2);
    expect(lobby.matches[0]?.host.phase).toBe("finished");
    expect(lost).toEqual(["lost", "lost"]);
  });

  it("returns to waiting by itself once everyone has left its match", async () => {
    const { lobby, matches } = await startAMatch();
    await leaveTheMatch(lobby, matches);
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
  });

  it("stays in its match while anyone is still playing it", async () => {
    const { lobby, matches } = await startAMatch();
    const [hostMatch, guestMatch] = matches;
    // The host walking out early must not end the match for the guest.
    await hostMatch?.disconnect();
    await lobby.step(1);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    await guestMatch?.disconnect();
    await lobby.step(0.05);
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
  });

  it("will not let a member reset or change a lobby whose match is still on (#44)", async () => {
    const { lobby, guest } = await startAMatch();
    guest.connection.chooseTeam(null);
    guest.connection.setReady(false);
    lobby.host.connection.selectMap(MAP_IDS[1]);
    lobby.host.connection.startMatch();
    await lobby.step(0.5);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    expect(playersOf(lobby.host)).toEqual([
      { name: "Host", team: 0, ready: true },
      { name: "Guest", team: 1, ready: true },
    ]);
    expect(lobby.matches).toHaveLength(1);
  });

  it("clears readiness on return, so nobody is dragged into a match they did not confirm", async () => {
    const { lobby, matches } = await startAMatch();
    await leaveTheMatch(lobby, matches);
    expect(playersOf(lobby.host).map(({ ready }) => ready)).toEqual([false, false]);
  });

  it("keeps team assignments, so sides do not have to be re-picked every round", async () => {
    const { lobby, matches } = await startAMatch();
    await leaveTheMatch(lobby, matches);
    expect(playersOf(lobby.host).map(({ team }) => team)).toEqual([0, 1]);
  });

  it("can actually start a second match after returning", async () => {
    const { lobby, guest, matches } = await startAMatch();
    await leaveTheMatch(lobby, matches);
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    expect(lobby.matches.map(({ plan }) => plan.matchId)).toEqual(["match-1", "match-2"]);
    const second = [await play(lobby.host, "Host"), await play(guest, "Guest")];
    expect(second.map((match) => match.selfSessionId)).toHaveLength(2);
  });

  /** The guest's peer drops off the host's room, and the host's off the guest's. */
  async function drop(lobby: TestLobby, guest: Member): Promise<void> {
    lobby.network.partition("host", guest.transport.selfId);
    await settle();
  }

  it("keeps the team of a guest who drops during the match and comes back (#596)", async () => {
    const { lobby, guest } = await startAMatch({ timeLimitSeconds: 15 });
    await drop(lobby, guest);
    // Still listed while away: the seat is held.
    expect(playersOf(lobby.host)).toEqual([
      { name: "Host", team: 0, ready: true },
      { name: "Guest", team: 1, ready: true },
    ]);
    await lobby.step(10);
    lobby.network.heal();
    await settle();
    await lobby.step(6);
    for (const who of [lobby.host, guest]) {
      expect(who.connection.getSnapshot().phase).toBe("waiting");
      expect(playersOf(who)).toEqual([
        { name: "Host", team: 0, ready: false },
        { name: "Guest", team: 1, ready: false },
      ]);
    }
  });

  it("lets go of a guest who drops and does not come back, when the match ends (#596)", async () => {
    const { lobby, guest } = await startAMatch({ timeLimitSeconds: 5 });
    await drop(lobby, guest);
    // A second past the limit, so the end has landed.
    await lobby.step(6);
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });

  it("lets go of a guest away for the reconnect window, though the match goes on (#596)", async () => {
    const { lobby, guest } = await startAMatch();
    await drop(lobby, guest);
    await lobby.step(RECONNECT_WINDOW_SECONDS - 1);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest"]);
    await lobby.step(1);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });
});

describe("joining by code", () => {
  it("takes no state for another lobby's code, so it never joins the wrong one", async () => {
    const lobby = await openLobby();
    const transport = lobby.network.join();
    await expect(
      joinLobby({ transport, code: "WXYKMN", name: "Lost", character: null, timeoutMs: 50 }),
    ).rejects.toEqual(new LobbyNoAnswerError(50, null));
  });

  it("says the last trouble its transport told it before the timeout, none if none (#707)", async () => {
    const lobby = await openLobby();
    const failure = (peerId: string, troubles: readonly TransportTrouble[]): Promise<unknown> => {
      const joining = joinLobby({
        transport: lobby.network.join(peerId),
        code: "WXYKMN",
        name: peerId,
        character: null,
        timeoutMs: 50,
      });
      for (const trouble of troubles) {
        lobby.network.trouble(peerId, trouble);
      }
      return joining.catch((error: unknown) => error);
    };

    const told = await failure("told", ["no-relay", "peer-unreachable"]);
    expect(told).toBeInstanceOf(LobbyNoAnswerError);
    expect(told instanceof LobbyNoAnswerError && told.trouble).toBe("peer-unreachable");
    const untold = await failure("untold", []);
    expect(untold instanceof LobbyNoAnswerError && untold.trouble).toBeNull();
  });

  it("accepts a lower-case or spaced code, because players mistype them", async () => {
    const lobby = await openLobby();
    const connection = await joinLobby({
      transport: lobby.network.join(),
      code: " acd-efg ",
      name: "Typist",
      character: null,
      timeoutMs: 1000,
    });
    expect(connection.getSnapshot().code).toBe(CODE);
  });

  it("gives up with no-answer when nobody in the room hosts", async () => {
    const lonely = createMemoryNetwork().join();
    await expect(
      joinLobby({ transport: lonely, code: CODE, name: "Alone", character: null, timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(LobbyNoAnswerError);
  });

  it("is told a protocol mismatch as a refusal, not left to time out", async () => {
    const lobby = await openLobby();
    const peer = await rawPeer(lobby);
    peer.transport.send("lobby-join", { protocolVersion: `${PROTOCOL_VERSION}x`, name: "Old" });
    await settle();
    expect(peer.notes).toEqual([{ kind: "refused", reason: "protocol-mismatch" }]);
  });
});

import { ANNIHILATION_MATCH_RULES, STARTER_BUILDS } from "@vibewars/game-core";
import {
  CHANNELS,
  type Channel,
  type JsonValue,
  type LobbyMode,
  MAX_TEAM_LOBBY_SIDE,
  PROTOCOL_VERSION,
  TEAM_LOBBY_STAGE_SECONDS,
  parseWireLobbyNote,
  parseWireTeamProposalBuilds,
  MAX_LOBBY_PLAYERS,
  parseWireKeyChallenge,
  parseWireKeyProof,
  parseWireKeyProven,
  parseWireLobbyState,
  type WireLobbyNote,
  type WireLobbyCommand,
  type WireLobbyState,
} from "@vibewars/game-protocol";
import { describe, expect, it, vi } from "vitest";

import { MESSAGE_BURST, MESSAGES_PER_SECOND } from "./intent-budget.js";
import { KEY_PROOF_TIMEOUT_MS, keyGated } from "./key-gate.js";
import { LobbyNoAnswerError, LobbyRefusedError, joinLobby } from "./lobby-client.js";
import {
  CODE,
  MAP_IDS,
  PROOF_KEY,
  openLobby,
  play,
  playersOf,
  provenPeer,
  seat,
  start,
  type Member,
  type TestLobby,
} from "./lobby-harness.test-support.js";
import { canStart, type MatchPlan } from "./lobby-host.js";
import { cryptoTurns, settle, until } from "./match-harness.test-support.js";
import { RECONNECT_WINDOW_SECONDS, type MatchHost } from "./match-host.js";
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
  const transport = await provenPeer(lobby);
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

  it("lists a joiner's guild tag to everyone, a bad one as none (#1406)", async () => {
    const lobby = await openLobby();
    const tagged = await lobby.join("Ann", " VIBE ");
    const bad = await lobby.join("Bob", "[VB]");
    for (const member of [lobby.host, tagged, bad]) {
      expect(member.connection.getSnapshot().players.map(({ guildTag }) => guildTag)).toEqual([
        null,
        "VIBE",
        null,
      ]);
    }
  });

  it("plays a member's guild tag in the lobby's match (#1406)", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join("Ann", "Vb");
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    const seats = lobby.matches[0]?.plan.seats;
    expect(seats?.get(guest.transport.selfId)?.guildTag).toBe("Vb");
    expect(seats?.get(lobby.host.transport.selfId)?.guildTag).toBeNull();
  });

  it("plays a member's cape in the lobby's match, and none without a valid tag (#1422)", async () => {
    const lobby = await openLobby();
    const cape = { main: "gold", trim: "black", emblem: "ring" } as const;
    const ann = await lobby.join("Ann", "Vb", cape);
    const bob = await lobby.join("Bob", null, cape);
    const cy = await lobby.join("Cy", "[x]", cape);
    await seat([lobby.host, ann, bob, cy], [0, 1, 0, 1]);
    await start(lobby);
    const seats = lobby.matches[0]?.plan.seats;
    expect(seats?.get(ann.transport.selfId)?.guildCape).toEqual(cape);
    expect(seats?.get(bob.transport.selfId)?.guildCape).toBeNull();
    expect(seats?.get(cy.transport.selfId)?.guildCape).toBeNull();
    expect(seats?.get(lobby.host.transport.selfId)?.guildCape).toBeNull();
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

  it("tells each guest, and only them, the lobby its host left for, before it closes (#1553)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const other = await lobby.join("Other");
    await settle();
    const heard: string[] = [];
    for (const who of [lobby.host, guest, other]) {
      const name = who === lobby.host ? "Host" : who === guest ? "Guest" : "Other";
      who.connection.onMove((code) => heard.push(`${name} move ${code}`));
      who.connection.onClosed((reason) => heard.push(`${name} ${reason}`));
    }
    await lobby.lobby.close("ACDEFGHJKMNP");
    await settle();
    expect(heard.filter((line) => line.startsWith("Guest"))).toEqual([
      "Guest move ACDEFGHJKMNP",
      "Guest host-left",
    ]);
    expect(heard.filter((line) => line.startsWith("Other"))).toEqual([
      "Other move ACDEFGHJKMNP",
      "Other host-left",
    ]);
    expect(heard.filter((line) => line.startsWith("Host"))).toEqual(["Host host-left"]);
  });

  it("follows a move from the host alone (#1553)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const moves: string[] = [];
    guest.connection.onMove((code) => moves.push(code));
    const peer = await rawPeer(lobby);
    peer.transport.send("lobby-move", { code: "ACDEFGHJKMNP" }, guest.transport.selfId);
    await settle();
    expect(moves).toEqual([]);
  });

  it("waits for a host whose peer drops in the lobby, and is in again when it is back (#1764)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const closed: string[] = [];
    guest.connection.onClosed((reason) => closed.push(reason));
    lobby.network.partition("host", guest.transport.selfId);
    await settle();
    expect(closed).toEqual([]);
    lobby.network.heal();
    // Back, it proves the key again (#1681): an HMAC, on the event loop.
    await until(() => lobby.host.connection.getSnapshot().players[1]?.away === false);
    guest.connection.chooseTeam(1);
    await until(() => playersOf(lobby.host)[1]?.team === 1);
    expect(closed).toEqual([]);
  });

  it("ends the lobby once the window runs out for a host whose peer dropped (#1764)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const closed: string[] = [];
    guest.connection.onClosed((reason) => closed.push(reason));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      lobby.network.partition("host", guest.transport.selfId);
      await settle();
      vi.advanceTimersByTime(RECONNECT_WINDOW_SECONDS * 1000 - 1);
      expect(closed).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(closed).toEqual(["connection-lost"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a map selection from a non-host, and an unknown map from the host", async () => {
    const { lobby, guest } = await hostAndGuest();
    lobby.host.connection.selectMode("hosted-game");
    guest.connection.selectMap(MAP_IDS[1]);
    lobby.host.connection.selectMap("no-such-map");
    await settle();
    expect(guest.connection.getSnapshot().mapId).toBe(MAP_IDS[0]);
    lobby.host.connection.selectMap(MAP_IDS[1]);
    await settle();
    expect(guest.connection.getSnapshot().mapId).toBe(MAP_IDS[1]);
  });

  it("seats no join that arrives while it closes (#1526)", async () => {
    const lobby = await openLobby();
    const joining = lobby.join();
    const closing = lobby.lobby.close();
    // Not yet key-proven, it hears nothing from the host (#1681), not even
    // that it left: its join runs out unanswered.
    await expect(joining).rejects.toBeInstanceOf(LobbyNoAnswerError);
    await closing;
    expect(lobby.host.connection.getSnapshot().players).toHaveLength(1);
  });

  it("starts on Random Arena, and lets only the host pick the mode (#1526)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const notes: string[] = [];
    guest.transport.on("lobby-note", (data) => {
      notes.push(parseWireLobbyNote(data)?.reason ?? "");
    });
    expect(guest.connection.getSnapshot().mode).toBe("random-arena");
    guest.connection.selectMode("hosted-game");
    await settle();
    expect(notes).toEqual(["not-host"]);
    expect(guest.connection.getSnapshot().mode).toBe("random-arena");
    lobby.host.connection.selectMode("team-arena");
    await settle();
    expect(guest.connection.getSnapshot().mode).toBe("team-arena");
    expect(lobby.host.connection.getSnapshot().mode).toBe("team-arena");
  });

  it("moves the map into the mode in the mode's own broadcast (#1526)", async () => {
    const { lobby, guest } = await hostAndGuest();
    await seat([lobby.host, guest], [0, 1]);
    const seen: [string, string][] = [];
    guest.connection.onChange(() => {
      const { mode, mapId } = guest.connection.getSnapshot();
      seen.push([mode, mapId]);
    });
    lobby.host.connection.selectMode("gvg");
    await settle();
    expect(seen).toEqual([["gvg", MAP_IDS[1]]]);
    expect(playersOf(guest).map(({ ready }) => ready)).toEqual([false, false]);
    // A map the next mode plays stays.
    lobby.host.connection.selectMode("hosted-game");
    await settle();
    expect(seen.at(-1)).toEqual(["hosted-game", MAP_IDS[1]]);
  });

  it("clears everyone's readiness when the host picks another map", async () => {
    const { lobby, guest } = await hostAndGuest();
    lobby.host.connection.selectMode("hosted-game");
    await seat([lobby.host, guest], [0, 1]);
    lobby.host.connection.selectMap(MAP_IDS[1]);
    await settle();
    expect(playersOf(guest).map(({ ready }) => ready)).toEqual([false, false]);
  });

  it("refuses a map pick outside a Hosted Game, and changes nothing (#1994)", async () => {
    const { lobby, guest } = await hostAndGuest();
    const notes: string[] = [];
    guest.transport.on("lobby-note", (data) => {
      notes.push(parseWireLobbyNote(data)?.reason ?? "");
    });
    await seat([lobby.host, guest], [0, 1]);
    for (const mode of ["team-arena", "heroes-ascent"] as const) {
      lobby.host.connection.selectMode(mode);
      await settle();
      await seat([lobby.host, guest], [0, 1]);
      lobby.host.connection.selectMap(MAP_IDS[1]);
      guest.connection.selectMap(MAP_IDS[1]);
      await settle();
      expect(guest.connection.getSnapshot().mapId).toBe(MAP_IDS[0]);
      expect(playersOf(guest).map(({ ready }) => ready)).toEqual([true, true]);
    }
    expect(notes).toEqual(["not-pickable", "not-pickable"]);
  });

  it("draws Team Arena's map at each start from the lobby's RNG (#1994)", async () => {
    for (const [draw, mapId] of [
      [0, MAP_IDS[0]],
      [0.9, MAP_IDS[1]],
    ] as const) {
      const lobby = await openLobby({ random: () => draw });
      const guest = await lobby.join();
      lobby.host.connection.selectMode("team-arena");
      await seat([lobby.host, guest], [0, 1]);
      await start(lobby);
      expect(lobby.matches[0]?.plan.mapId).toBe(mapId);
      expect(guest.starts[0]?.mapId).toBe(mapId);
      expect(guest.connection.getSnapshot().mapId).toBe(mapId);
    }
  });

  it("starts Heroes' Ascent on its first map, whatever the Hosted Game picked (#1994)", async () => {
    const { lobby, guest } = await hostAndGuest();
    lobby.host.connection.selectMode("hosted-game");
    lobby.host.connection.selectMap(MAP_IDS[1]);
    lobby.host.connection.selectMode("heroes-ascent");
    await seat([lobby.host, guest], [0, 1]);
    await start(lobby);
    expect(lobby.matches[0]?.plan.mapId).toBe(MAP_IDS[0]);
    expect(guest.starts[0]?.mapId).toBe(MAP_IDS[0]);
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
        proofKey: PROOF_KEY,
        name: "Late",
        guildTag: null,
        guildCape: null,
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

describe("a guest whose peer drops while the lobby waits (#1764)", () => {
  /** A host and a ready guest on team 1, whose peer has just dropped. */
  async function dropped(): Promise<{ lobby: TestLobby; guest: Member }> {
    const { lobby, guest } = await hostAndGuest();
    guest.connection.chooseTeam(1);
    guest.connection.setReady(true);
    await settle();
    lobby.network.partition("host", guest.transport.selfId);
    await settle();
    return { lobby, guest };
  }

  it("is still listed, away and not ready, on its team, and keeps the host in the room", async () => {
    const reaches: number[] = [];
    const { lobby } = await dropped();
    lobby.lobby.onReach((reach) => reaches.push(reach.guests));
    await settle();
    expect(
      lobby.host.connection
        .getSnapshot()
        .players.map(({ name, team, ready, away }) => [name, team, ready, away]),
    ).toEqual([
      ["Host", null, false, false],
      ["Guest", 1, false, true],
    ]);
    // Told once, as it was: the guest still counts.
    expect(reaches).toEqual([1]);
    lobby.host.connection.chooseTeam(0);
    lobby.host.connection.setReady(true);
    lobby.host.connection.startMatch();
    await settle();
    expect(lobby.matches).toHaveLength(0);
  });

  it("is in its seat again when it is back in the window, though the lobby is closed now", async () => {
    const { lobby, guest } = await dropped();
    lobby.lobby.setOpen(false);
    await lobby.step(10);
    lobby.network.heal();
    // Back, it proves the key again (#1681): an HMAC, on the event loop.
    await until(() => lobby.host.connection.getSnapshot().players[1]?.away === false);
    expect(playersOf(lobby.host)).toEqual([
      { name: "Host", team: null, ready: false },
      { name: "Guest", team: 1, ready: false },
    ]);
    expect(guest.connection.getSnapshot().players.map(({ name }) => name)).toEqual([
      "Host",
      "Guest",
    ]);
  });

  it("is gone once the window runs out, and the reach says so", async () => {
    const { lobby } = await dropped();
    const reaches: number[] = [];
    lobby.lobby.onReach((reach) => reaches.push(reach.guests));
    await lobby.step(RECONNECT_WINDOW_SECONDS - 1);
    expect(playersOf(lobby.host)).toHaveLength(2);
    await lobby.step(1);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
    expect(reaches).toEqual([1, 0]);
  });

  it("is gone at once when, back, it says it leaves", async () => {
    const { lobby, guest } = await dropped();
    lobby.network.heal();
    await until(() => lobby.host.connection.getSnapshot().players[1]?.away === false);
    await guest.connection.disconnect();
    await settle();
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });
});

describe("an open or closed lobby (#1682)", () => {
  /** Join `lobby` as `name` with the key, and how it went. */
  const tryJoin = (lobby: TestLobby, name: string): Promise<unknown> =>
    joinLobby({
      transport: lobby.network.join(),
      code: CODE,
      proofKey: PROOF_KEY,
      name,
      guildTag: null,
      guildCape: null,
      timeoutMs: 1000,
    }).catch((error: unknown) => error);

  it("starts closed, and refuses a peer with the key as closed", async () => {
    const lobby = await openLobby({ open: false });
    expect(lobby.host.connection.getSnapshot().open).toBe(false);
    expect(await tryJoin(lobby, "Early")).toEqual(new LobbyRefusedError("closed"));
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });

  it("takes a peer with the key once opened, and says it is open", async () => {
    const lobby = await openLobby({ open: false });
    lobby.lobby.setOpen(true);
    const guest = await lobby.join();
    expect(guest.connection.getSnapshot().open).toBe(true);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest"]);
  });

  it("keeps its guests when closed, tells them, and refuses the next", async () => {
    const lobby = await openLobby();
    const guest = await lobby.join();
    lobby.lobby.setOpen(false);
    await settle();
    expect(guest.connection.getSnapshot().open).toBe(false);
    expect(await tryJoin(lobby, "Late")).toEqual(new LobbyRefusedError("closed"));
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest"]);
  });

  it("tells its reach on every change: open, and guests other than the host", async () => {
    const lobby = await openLobby({ open: false });
    const reaches: { open: boolean; guests: number }[] = [];
    lobby.lobby.onReach((reach) => reaches.push({ ...reach }));
    lobby.lobby.setOpen(true);
    const guest = await lobby.join();
    await settle();
    lobby.lobby.setOpen(false);
    await guest.connection.disconnect();
    await settle();
    expect(reaches).toEqual([
      { open: false, guests: 0 },
      { open: true, guests: 0 },
      { open: true, guests: 1 },
      { open: false, guests: 1 },
      { open: false, guests: 0 },
    ]);
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
  /** A host on team 0 and a guest on team 1, unless `teams` says otherwise, both playing the lobby's first match. */
  async function startAMatch(
    options: { timeLimitSeconds?: number; teams?: readonly [0 | 1, 0 | 1] } = {},
  ) {
    const lobby = await openLobby({
      matchRules: {
        ...ANNIHILATION_MATCH_RULES,
        timeLimitSeconds: options.timeLimitSeconds ?? 600,
      },
    });
    const guest = await lobby.join();
    await seat([lobby.host, guest], options.teams ?? [0, 1]);
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
    // Teammates: walking out of a 1v1 wipes your team, which ends it.
    const { lobby, matches } = await startAMatch({ teams: [0, 0] });
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
    const { lobby, guest, matches } = await startAMatch({ timeLimitSeconds: 15 });
    await drop(lobby, guest);
    const states: string[] = [];
    matches[1]?.onConnectionChange((state) => states.push(state));
    // Still listed while away: the seat is held.
    expect(playersOf(lobby.host)).toEqual([
      { name: "Host", team: 0, ready: true },
      { name: "Guest", team: 1, ready: true },
    ]);
    await lobby.step(10);
    lobby.network.heal();
    // Back, it proves the key again (#1681): an HMAC, on the event loop.
    await until(() => states.includes("online"));
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

  it("keeps the seat of a guest only the host saw drop: it proves the key again, and the host does (#1681)", async () => {
    const { lobby, guest, matches } = await startAMatch({ timeLimitSeconds: 15 });
    const states: string[] = [];
    matches[1]?.onConnectionChange((state) => states.push(state));
    lobby.network.blip("host", guest.transport.selfId);
    // The host challenges it as a stranger; the guest stops hearing the
    // host until it has proven itself again, and then comes back.
    await until(() => states.length === 2);
    expect(states).toEqual(["reconnecting", "online"]);
    await settle();
    await lobby.step(16);
    for (const who of [lobby.host, guest]) {
      expect(who.connection.getSnapshot().phase).toBe("waiting");
      expect(playersOf(who)).toEqual([
        { name: "Host", team: 0, ready: false },
        { name: "Guest", team: 1, ready: false },
      ]);
    }
  });

  it("keeps the seat of a guest only it saw drop: it asks the host to challenge it again (#1681)", async () => {
    const { lobby, guest, matches } = await startAMatch({ timeLimitSeconds: 15 });
    const states: string[] = [];
    matches[1]?.onConnectionChange((state) => states.push(state));
    // The host never sees it go, and still holds it proven.
    lobby.network.blip(guest.transport.selfId, "host");
    await until(() => states.length === 2);
    expect(states).toEqual(["reconnecting", "online"]);
    await settle();
    await lobby.step(16);
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
      joinLobby({
        transport,
        code: "WXYKMNPQRT34",
        proofKey: PROOF_KEY,
        name: "Lost",
        guildTag: null,
        guildCape: null,
        timeoutMs: 50,
      }),
    ).rejects.toEqual(new LobbyNoAnswerError(50, null));
  });

  it("says the last trouble its transport told it before the timeout, none if none (#707)", async () => {
    const lobby = await openLobby();
    const failure = (peerId: string, troubles: readonly TransportTrouble[]): Promise<unknown> => {
      const joining = joinLobby({
        transport: lobby.network.join(peerId),
        code: "WXYKMNPQRT34",
        proofKey: PROOF_KEY,
        name: peerId,
        guildTag: null,
        guildCape: null,
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
      code: " acde-fghj-kmnp ",
      proofKey: PROOF_KEY,
      name: "Typist",
      guildTag: null,
      guildCape: null,
      timeoutMs: 1000,
    });
    expect(connection.getSnapshot().code).toBe(CODE);
  });

  it("gives up with no-answer when nobody in the room hosts", async () => {
    const lonely = createMemoryNetwork().join();
    await expect(
      joinLobby({
        transport: lonely,
        code: CODE,
        proofKey: PROOF_KEY,
        name: "Alone",
        guildTag: null,
        guildCape: null,
        timeoutMs: 50,
      }),
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

describe("a Team Lobby (#1458)", () => {
  const [WARRIOR, RANGER, MONK, NECRO, ELE] = STARTER_BUILDS;
  if (
    WARRIOR === undefined ||
    RANGER === undefined ||
    MONK === undefined ||
    NECRO === undefined ||
    ELE === undefined
  ) {
    throw new Error("a Team Lobby test needs five starter builds");
  }

  /** The draws the lobby's RNG makes, in order, then 0 for good. */
  function draws(...values: number[]): () => number {
    return () => values.shift() ?? 0;
  }

  /**
   * A lobby hosted from Team Play: the host and `guests`, seated on
   * `teams`, all ready. A Hosted Game unless `mode` is a team mode (#2029).
   */
  async function teamLobby(
    names: readonly string[],
    teams: readonly (0 | 1 | null)[],
    random: () => number = draws(),
    mode?: LobbyMode,
    startMatch?: (plan: MatchPlan) => MatchHost | undefined,
  ): Promise<{ lobby: TestLobby; members: Member[] }> {
    const lobby = await openLobby({
      teamLobby: true,
      random,
      ...(startMatch === undefined ? {} : { startMatch }),
    });
    const guests: Member[] = [];
    for (const name of names) {
      guests.push(await lobby.join(name));
    }
    if (mode !== undefined) {
      lobby.host.connection.selectMode(mode);
      await settle();
    }
    const members = [lobby.host, ...guests];
    await seat(members, teams);
    return { lobby, members };
  }

  /** Have the host start: into the Team Lobby, everyone ready. */
  async function begin(lobby: TestLobby): Promise<void> {
    await start(lobby);
    expect(lobby.host.connection.getSnapshot().phase).toBe("team-lobby");
  }

  async function ask(lobby: TestLobby, who: Member, command: WireLobbyCommand): Promise<void> {
    who.transport.send("lobby-cmd", command, lobby.room.selfId);
    await settle();
  }

  const teamOf = (who: Member) => who.connection.getSnapshot().teamLobby;
  const sideOf = (who: Member) => {
    const team = who.connection
      .getSnapshot()
      .players.find((player) => player.sessionId === who.transport.selfId)?.team;
    return team === undefined || team === null ? null : (teamOf(who)?.sides[team] ?? null);
  };
  const idOf = (who: Member) => who.transport.selfId;

  /** Every refusal `who` is sent from now on. */
  function refusals(who: Member): string[] {
    const got: string[] = [];
    who.connection.onRefused((reason) => got.push(reason));
    return got;
  }

  /** Everyone on a side ready, which ends the stage. */
  async function allReady(members: readonly Member[]): Promise<void> {
    for (const who of members) {
      who.connection.setReady(true);
    }
    await settle();
  }

  /** Run the stage's clock out. */
  async function timeOut(lobby: TestLobby): Promise<void> {
    lobby.lobby.advance(TEAM_LOBBY_STAGE_SECONDS);
    await settle();
  }

  it("starts the match at once without Team Play, and with it begins the vote instead", async () => {
    const plain = await openLobby();
    const guest = await plain.join();
    await seat([plain.host, guest], [0, 1]);
    await start(plain);
    expect(plain.matches).toHaveLength(1);

    const { lobby, members } = await teamLobby(["Ann", "Bob"], [0, 0, 1]);
    await begin(lobby);
    expect(lobby.matches).toEqual([]);
    const [host, ann, bob] = members;
    if (host === undefined || ann === undefined || bob === undefined) {
      throw new Error("three members");
    }
    expect(teamOf(host)).toMatchObject({ stage: "vote", secondsLeft: TEAM_LOBBY_STAGE_SECONDS });
    // A Hosted Game's sides propose any size (#2029).
    expect(sideOf(host)?.size).toBeNull();
    expect(sideOf(bob)?.size).toBeNull();
    // Everyone confirms again, for the vote, and nobody is a bot yet.
    expect(host.connection.getSnapshot().players.map(({ ready, bot }) => [ready, bot])).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
  });

  it("sizes each side of a team mode as the mode, whoever is on it (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 1], draws(), "team-arena");
    await begin(lobby);
    const [host, ann] = members;
    expect(host === undefined ? null : sideOf(host)?.size).toBe(4);
    expect(ann === undefined ? null : sideOf(ann)?.size).toBe(4);
  });

  it("refuses a start with a side of more players than it plays, saying why to the host (#2029)", async () => {
    const run = async (players: number, mode?: LobbyMode) => {
      const names = Array.from({ length: players - 1 }, (_, i) => `G${String(i)}`);
      const { lobby } = await teamLobby(
        names,
        Array.from({ length: players }, () => 0),
        draws(),
        mode,
      );
      const rejected: string[] = [];
      lobby.host.connection.onStartRejected((reason) => rejected.push(reason));
      await start(lobby);
      return [lobby.host.connection.getSnapshot().phase, rejected];
    };
    // A team mode's side plays the mode's size; a Hosted Game's a GW1 team at most.
    expect(await run(5, "team-arena")).toEqual(["waiting", ["a team plays at most 4"]]);
    expect(await run(4, "team-arena")).toEqual(["team-lobby", []]);
    expect(await run(MAX_TEAM_LOBBY_SIDE + 1)).toEqual([
      "waiting",
      [`a team plays at most ${String(MAX_TEAM_LOBBY_SIDE)}`],
    ]);
    expect(await run(MAX_TEAM_LOBBY_SIDE)).toEqual(["team-lobby", []]);
  });

  it("takes only a proposal of exactly a team mode's size of legal builds", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 0], draws(), "team-arena");
    const [host] = members;
    if (host === undefined) {
      throw new Error("a host");
    }
    await begin(lobby);
    const refused = refusals(host);
    host.connection.propose([WARRIOR]);
    host.connection.propose([WARRIOR, RANGER, MONK]);
    host.connection.propose([
      WARRIOR,
      MONK,
      RANGER,
      { ...RANGER, attributes: [], skillBar: ["no.such-skill", ...RANGER.skillBar.slice(1)] },
    ]);
    await settle();
    // One a slot: each slot of the wrong size, and the illegal build.
    expect(refused).toEqual(Array.from({ length: 5 }, () => "invalid-proposal"));
    expect(sideOf(host)?.proposals).toEqual([]);
    host.connection.propose([WARRIOR, MONK, RANGER, NECRO]);
    await settle();
    expect(sideOf(host)?.proposals).toEqual([
      {
        proposerId: idOf(host),
        members: [
          { primary: "warrior", secondary: "monk" },
          { primary: "monk", secondary: "elementalist" },
          { primary: "ranger", secondary: "mesmer" },
          { primary: "necromancer", secondary: NECRO.secondaryProfession ?? null },
        ],
        voterIds: [],
      },
    ]);
  });

  it("takes a Hosted Game's proposal of any size from its side's players to a GW1 team (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Bob", "Cy"], [0, 0, 0, 1]);
    const [host, ann, , cy] = members;
    if (host === undefined || ann === undefined || cy === undefined) {
      throw new Error("four members");
    }
    await begin(lobby);
    const refused = refusals(host);
    // Fewer slots than the side has players: one refusal a slot.
    host.connection.propose([WARRIOR, MONK]);
    await settle();
    expect(refused).toEqual(["invalid-proposal", "invalid-proposal"]);
    expect(sideOf(host)?.proposals).toEqual([]);
    host.connection.propose([WARRIOR, RANGER, MONK]);
    ann.connection.propose(Array.from({ length: MAX_TEAM_LOBBY_SIDE }, () => ELE));
    // A side of one plays a team of one, if it likes.
    cy.connection.propose([NECRO]);
    await settle();
    expect(refused).toHaveLength(2);
    expect(sideOf(host)?.proposals.map(({ members: builds }) => builds.length)).toEqual([
      3,
      MAX_TEAM_LOBBY_SIDE,
    ]);
    expect(sideOf(cy)?.proposals.map(({ members: builds }) => builds.length)).toEqual([1]);
  });

  it("lets a proposal stand only once all its slots are in, the old one until then", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 0]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, MONK]);
    await settle();
    const slot = (index: number, build: typeof WARRIOR) =>
      ask(lobby, host, {
        kind: "propose",
        slot: index,
        size: 2,
        build: JSON.parse(JSON.stringify(build)) as JsonValue,
      });
    await slot(1, ELE);
    expect(sideOf(ann)?.proposals[0]?.members).toMatchObject([
      { primary: "warrior" },
      { primary: "monk" },
    ]);
    await slot(0, RANGER);
    expect(sideOf(ann)?.proposals[0]?.members).toMatchObject([
      { primary: "ranger" },
      { primary: "elementalist" },
    ]);
    // Half a proposal when the vote ends is none.
    await ask(lobby, ann, {
      kind: "propose",
      slot: 0,
      size: 2,
      build: JSON.parse(JSON.stringify(NECRO)) as JsonValue,
    });
    await timeOut(lobby);
    expect(sideOf(ann)?.chosen?.proposerId).toBe(idOf(host));
  });

  it("replaces a member's proposal with a new one, clearing its votes, and withdraws it", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 0]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, MONK]);
    await settle();
    ann.connection.vote(idOf(host));
    await settle();
    expect(sideOf(ann)?.proposals[0]?.voterIds).toEqual([idOf(ann)]);
    host.connection.propose([RANGER, MONK]);
    await settle();
    expect(sideOf(ann)?.proposals).toMatchObject([
      {
        proposerId: idOf(host),
        members: [{ primary: "ranger" }, { primary: "monk" }],
        voterIds: [],
      },
    ]);
    host.connection.propose(null);
    await settle();
    expect(sideOf(ann)?.proposals).toEqual([]);
  });

  it("takes a vote for a proposal of one's own side only, one's own included, and withdraws it", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Bob"], [0, 0, 1]);
    const [host, ann, bob] = members;
    if (host === undefined || ann === undefined || bob === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, MONK]);
    bob.connection.propose([ELE]);
    await settle();
    const refused = refusals(ann);
    ann.connection.vote(idOf(bob));
    ann.connection.vote("nobody");
    await settle();
    expect(refused).toEqual(["invalid-vote", "invalid-vote"]);
    host.connection.vote(idOf(host));
    ann.connection.vote(idOf(host));
    await settle();
    expect(sideOf(host)?.proposals[0]?.voterIds).toEqual([idOf(host), idOf(ann)]);
    ann.connection.vote(null);
    await settle();
    expect(sideOf(host)?.proposals[0]?.voterIds).toEqual([idOf(host)]);
  });

  it("sends a proposal's builds once it stands, to its side alone, again on a rejoin, never for a withdrawal (#1811)", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Cy"], [0, 0, 1]);
    const [host, ann, cy] = members;
    if (host === undefined || ann === undefined || cy === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    const told = members.map((member) => {
      const got: (string | undefined)[] = [];
      member.transport.on("team-proposal-builds", (data) => {
        got.push(parseWireTeamProposalBuilds(data)?.proposerId);
      });
      return got;
    });
    host.connection.propose([WARRIOR, MONK]);
    await settle();
    // Two slots, two messages to the host: one proposal, told once.
    expect(told).toEqual([[idOf(host)], [idOf(host)], []]);
    const [set] = WARRIOR.equipment.weaponSets;
    expect(ann.connection.getSnapshot().proposalBuilds.get(idOf(host))?.[0]).toEqual({
      skills: WARRIOR.skillBar,
      mainHand: set.mainHand.weaponId,
      offHand: set.offHand?.offhandId ?? null,
    });
    expect(cy.connection.getSnapshot().proposalBuilds.size).toBe(0);

    ann.connection.propose([MONK, WARRIOR]);
    await settle();
    ann.connection.propose(null);
    await settle();
    expect(told).toEqual([[idOf(host), idOf(ann)], [idOf(host), idOf(ann)], []]);
    // Gone from the state, so gone from the cards.
    expect([...host.connection.getSnapshot().proposalBuilds.keys()]).toEqual([idOf(host)]);

    // Back from a drop, it is told of what its side lists.
    lobby.network.partition("host", ann.transport.selfId);
    await settle();
    lobby.network.heal();
    await until(() => told[1]?.length === 3);
    expect(told[1]).toEqual([idOf(host), idOf(ann), idOf(host)]);
    expect(told[0]).toHaveLength(2);
  });

  it("shows each side only its own vote, and a spectator neither", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Cy"], [0, 1, null]);
    const [host, ann, cy] = members;
    if (host === undefined || ann === undefined || cy === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR]);
    ann.connection.propose([MONK]);
    await settle();
    expect(teamOf(host)?.sides[1]).toBeNull();
    expect(teamOf(host)?.sides[0]?.proposals.map(({ proposerId }) => proposerId)).toEqual([
      idOf(host),
    ]);
    expect(teamOf(ann)?.sides[0]).toBeNull();
    expect(teamOf(ann)?.sides[1]?.proposals.map(({ proposerId }) => proposerId)).toEqual([
      idOf(ann),
    ]);
    expect(teamOf(cy)?.sides).toEqual([null, null]);
  });

  it("picks the most votes, then the captain's among a tie, then at random", async () => {
    // Four on a side of four: the host (its captain), Ann, Bob and Cy.
    const run = async (votes: readonly (0 | 1 | 2 | null)[], random = draws()) => {
      const { lobby, members } = await teamLobby(["Ann", "Bob", "Cy"], [0, 0, 0, 0], random);
      await begin(lobby);
      const [a, b, c] = members;
      a?.connection.propose([WARRIOR, RANGER, MONK, NECRO]);
      b?.connection.propose([RANGER, MONK, NECRO, ELE]);
      c?.connection.propose([MONK, NECRO, ELE, WARRIOR]);
      await settle();
      const proposers = [a, b, c].map((who) => (who === undefined ? "" : idOf(who)));
      votes.forEach((choice, i) => {
        if (choice !== null) {
          members[i]?.connection.vote(proposers[choice] ?? null);
        }
      });
      await settle();
      await timeOut(lobby);
      const chosen = sideOf(lobby.host)?.chosen;
      return [proposers.indexOf(chosen?.proposerId ?? ""), chosen?.reason];
    };
    expect(await run([1, 1, 0, null])).toEqual([1, "votes"]);
    expect(await run([2, 1, 2, 1])).toEqual([2, "captain"]);
    // A tie the captain did not vote in: the second of the tied, as drawn.
    expect(await run([null, 0, 1, null], draws(0.75))).toEqual([1, "random"]);
    // Proposals and no vote: any of the three, as drawn.
    expect(await run([null, null, null, null], draws(0.9))).toEqual([2, "random"]);
  });

  it("plays the house team without a proposal, the starters in order, round and round, as many as the other side chose (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 1]);
    await begin(lobby);
    members[1]?.connection.propose([WARRIOR, RANGER, MONK, NECRO, ELE, MONK]);
    await settle();
    await timeOut(lobby);
    expect(sideOf(lobby.host)?.chosen).toEqual({
      proposerId: null,
      reason: "house",
      // At most 16 long, as a player's name, but cut at a word (#1460).
      members: (
        [
          [WARRIOR, "Warrior/Monk"],
          [RANGER, "Ranger/Mesmer"],
          [MONK, "Monk…"],
          [NECRO, "Necromancer…"],
          [ELE, "Elementalist…"],
          [WARRIOR, "Warrior/Monk"],
        ] as const
      ).map(([build, name]) => ({
        name,
        primary: build.primaryProfession,
        secondary: build.secondaryProfession ?? null,
      })),
    });
    expect(teamOf(lobby.host)).toMatchObject({ stage: "claim" });
    expect(sideOf(lobby.host)?.claims).toHaveLength(6);
  });

  it("plays house teams of at least 4, or the larger side's players, when neither side chose, and a team mode's of its size (#2029)", async () => {
    const sizes = async (lobby: TestLobby, members: readonly Member[]) => {
      await begin(lobby);
      await timeOut(lobby);
      return members.map((who) => sideOf(who)?.chosen?.members.length);
    };
    // At least 4 a side, more if a side has more players.
    const hosted = await teamLobby(["Ann", "Bob"], [0, 0, 1]);
    expect(await sizes(hosted.lobby, hosted.members)).toEqual([4, 4, 4]);
    const many = await teamLobby(["Ann", "Bob", "Cy", "Di", "Ed"], [0, 0, 0, 0, 0, 1]);
    expect(await sizes(many.lobby, many.members)).toEqual([5, 5, 5, 5, 5, 5]);
    // A side alone: the empty side plays as many, all bots.
    const alone = await teamLobby([], [0]);
    expect(await sizes(alone.lobby, alone.members)).toEqual([4]);
    await timeOut(alone.lobby);
    expect(
      [...(alone.lobby.matches[0]?.plan.seats.values() ?? [])].map(({ team, bot }) => [team, bot]),
    ).toEqual([
      [0, false],
      [0, true],
      [0, true],
      [0, true],
      [1, true],
      [1, true],
      [1, true],
      [1, true],
    ]);
    const arena = await teamLobby(["Ann"], [0, 1], draws(), "team-arena");
    expect(await sizes(arena.lobby, arena.members)).toEqual([4, 4]);
  });

  it("ends a stage early once every human on both sides is ready", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 1]);
    await begin(lobby);
    lobby.lobby.advance(5);
    await settle();
    expect(teamOf(lobby.host)?.secondsLeft).toBe(TEAM_LOBBY_STAGE_SECONDS - 5);
    lobby.host.connection.setReady(true);
    await settle();
    expect(teamOf(lobby.host)?.stage).toBe("vote");
    await allReady(members);
    expect(teamOf(lobby.host)).toMatchObject({
      stage: "claim",
      secondsLeft: TEAM_LOBBY_STAGE_SECONDS,
    });
    expect(lobby.host.connection.getSnapshot().players.map(({ ready }) => ready)).toEqual([
      false,
      false,
    ]);
    await allReady(members);
    expect(lobby.matches).toHaveLength(1);
  });

  it("seats claims first come first served, the rest of the humans in join order, then bots", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Bob"], [0, 0, 0]);
    const [host, ann, bob] = members;
    if (host === undefined || ann === undefined || bob === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    ann.connection.propose([WARRIOR, RANGER, MONK, NECRO]);
    await settle();
    ann.connection.vote(idOf(ann));
    await settle();
    ann.connection.claim(0);
    ann.connection.claim(2);
    await settle();
    await timeOut(lobby);
    // Ann's claims in the vote did not count.
    expect(sideOf(host)?.claims).toEqual([null, null, null, null]);
    const refused = refusals(bob);
    ann.connection.claim(2);
    await settle();
    bob.connection.claim(2);
    bob.connection.claim(4);
    bob.connection.claim(-1);
    await settle();
    expect(refused).toEqual(["slot-taken", "invalid-slot", "invalid-slot"]);
    bob.connection.claim(3);
    await settle();
    expect(sideOf(host)?.claims).toEqual([null, null, idOf(ann), idOf(bob)]);
    expect(sideOf(host)?.proposals).toEqual([]);
    await timeOut(lobby);

    const seats = lobby.matches[0]?.plan.seats;
    const seatOf = (id: string) => {
      const seat = seats?.get(id);
      return [seat?.team, seat?.name, seat?.bot, seat?.build?.name];
    };
    const [bot0, ...house] = [...(seats?.keys() ?? [])].filter((id) => id.startsWith("bot-"));
    expect(seatOf(idOf(host))).toEqual([0, "Host", false, WARRIOR.name]);
    expect(seatOf(idOf(ann))).toEqual([0, "Ann", false, MONK.name]);
    expect(seatOf(idOf(bob))).toEqual([0, "Bob", false, NECRO.name]);
    // A bot plays the slot nobody took, under its character's name.
    expect(seatOf(bot0 ?? "")).toEqual([0, RANGER.name, true, RANGER.name]);
    // Nobody on the other side: its house team is as many, all bots (#2029).
    expect(house.map(seatOf)).toEqual([
      [1, "Warrior/Monk", true, WARRIOR.name],
      [1, "Ranger/Mesmer", true, RANGER.name],
      [1, "Monk…", true, MONK.name],
      [1, "Necromancer…", true, NECRO.name],
    ]);
    expect(host.starts).toHaveLength(1);
  });

  it("drops a leaver's proposal and the votes for it, and seats no bot for it yet (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Bob"], [0, 0, 0]);
    const [host, ann, bob] = members;
    if (host === undefined || ann === undefined || bob === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    ann.connection.propose([WARRIOR, RANGER, MONK]);
    await settle();
    host.connection.vote(idOf(ann));
    bob.connection.vote(idOf(ann));
    await settle();
    await ann.connection.disconnect();
    await settle();
    expect(sideOf(host)).toMatchObject({ size: null, proposals: [] });
    const players = host.connection.getSnapshot().players;
    expect(players.map(({ name, team, bot }) => [name, team, bot])).toEqual([
      ["Host", 0, false],
      ["Bob", 0, false],
    ]);
    // The rest ready: the vote is over at once, with the house team.
    await allReady([host, bob]);
    expect(sideOf(host)?.chosen?.reason).toBe("house");
  });

  it("leaves the slot of a member who leaves in the claim to a bot, made at its end (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann", "Bob"], [0, 0, 0]);
    const [host, ann, bob] = members;
    if (host === undefined || ann === undefined || bob === undefined) {
      throw new Error("three members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, RANGER, MONK]);
    await settle();
    await timeOut(lobby);
    ann.connection.claim(0);
    await settle();
    expect(sideOf(host)?.claims).toEqual([idOf(ann), null, null]);
    await ann.connection.disconnect();
    await settle();
    // Its claim is free, and nobody plays it until the claim is over.
    expect(sideOf(host)?.claims).toEqual([null, null, null]);
    expect(host.connection.getSnapshot().players.some(({ bot }) => bot)).toBe(false);
    await allReady([host, bob]);
    const seats = [...(lobby.matches[0]?.plan.seats.values() ?? [])].filter(
      (seat) => seat.team === 0,
    );
    // The humans in join order from the first free slot, the bot in the last.
    expect(seats.map(({ name, bot, build }) => [name, bot, build?.name])).toEqual([
      ["Host", false, WARRIOR.name],
      ["Bob", false, RANGER.name],
      ["Monk…", true, MONK.name],
    ]);
  });

  it("plays a bot in the slot of a guest away when its stage runs out, and holds its seat on (#1764)", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 0]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    await timeOut(lobby);
    expect(teamOf(host)?.stage).toBe("claim");
    const size = sideOf(host)?.claims.length;
    // Late in the claim stage: its window outlasts the stage.
    lobby.lobby.advance(TEAM_LOBBY_STAGE_SECONDS - 10);
    lobby.network.partition("host", idOf(ann));
    await settle();
    lobby.lobby.advance(10);
    await settle();
    expect(lobby.matches).toHaveLength(1);
    const seats = lobby.matches[0]?.plan.seats;
    expect(seats?.has(idOf(ann))).toBe(false);
    // Its side is never a body short: a bot plays the slot it would have.
    const side = [...(seats?.values() ?? [])].filter((seat) => seat.team === 0);
    expect(side).toHaveLength(size ?? 0);
    expect(side.map(({ name, bot }) => [name, bot])).toEqual([
      ["Host", false],
      [expect.any(String), true],
      [expect.any(String), true],
      [expect.any(String), true],
    ]);
    expect(host.connection.getSnapshot().players.find(({ name }) => name === "Ann")?.away).toBe(
      true,
    );
    // Back within its window, it is still the lobby's once the match is over.
    lobby.network.heal();
    await until(() =>
      host.connection.getSnapshot().players.some(({ name, away }) => name === "Ann" && !away),
    );
    await lobby.matches[0]?.host.close("host-left");
    await lobby.step(0.1);
    expect(host.connection.getSnapshot().phase).toBe("waiting");
    expect(
      host.connection.getSnapshot().players.map(({ name, team, away }) => [name, team, away]),
    ).toEqual(expect.arrayContaining([["Ann", 0, false]]));
  });

  it("plays a Hosted Game of two as both sides chose, a bot named for its slot in each one nobody claimed (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 1]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, RANGER, MONK, NECRO]);
    ann.connection.propose([ELE, MONK, RANGER, WARRIOR]);
    await settle();
    await timeOut(lobby);
    host.connection.claim(2);
    ann.connection.claim(0);
    await settle();
    expect(sideOf(host)?.claims).toEqual([null, null, idOf(host), null]);
    expect(sideOf(ann)?.claims).toEqual([idOf(ann), null, null, null]);
    await allReady([host, ann]);

    const seats = [...(lobby.matches[0]?.plan.seats.values() ?? [])];
    const sideSeats = (team: 0 | 1) =>
      seats
        .filter((seat) => seat.team === team)
        .map(({ name, bot, build }) => [name, bot, build?.name]);
    expect(sideSeats(0)).toEqual([
      ["Host", false, MONK.name],
      ["Warrior/Monk", true, WARRIOR.name],
      ["Ranger/Mesmer", true, RANGER.name],
      ["Necromancer…", true, NECRO.name],
    ]);
    expect(sideSeats(1)).toEqual([
      ["Ann", false, ELE.name],
      ["Monk…", true, MONK.name],
      ["Ranger/Mesmer", true, RANGER.name],
      ["Warrior/Monk", true, WARRIOR.name],
    ]);
    // Its bots are in the lobby while the match is on: always ready,
    // never the host, nobody's guild (#1406).
    const bots = ann.connection.getSnapshot().players.filter((player) => player.bot);
    expect(bots).toHaveLength(6);
    expect(bots.every(({ ready, isHost, guildTag }) => ready && !isHost && guildTag === null)).toBe(
      true,
    );
  });

  it("keeps no bot in a coded lobby once its match is over: the next makes its own (#2029)", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 1]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    host.connection.propose([WARRIOR, RANGER]);
    await settle();
    await timeOut(lobby);
    await timeOut(lobby);
    expect(host.connection.getSnapshot().phase).toBe("in-match");
    expect(host.connection.getSnapshot().players.filter(({ bot }) => bot)).toHaveLength(2);
    await lobby.matches[0]?.host.close("host-left");
    await lobby.step(0.1);
    expect(host.connection.getSnapshot().phase).toBe("waiting");
    expect(
      host.connection.getSnapshot().players.map(({ name, team, bot }) => [name, team, bot]),
    ).toEqual([
      ["Host", 0, false],
      ["Ann", 1, false],
    ]);
  });

  it("drops a failed start's bots and everyone's ready, so a retry makes one set (#2086)", async () => {
    let failures = 1;
    const { lobby, members } = await teamLobby(["Ann"], [0, 1], draws(), undefined, () => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("no match today");
      }
      return undefined;
    });
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    const rejected: string[] = [];
    host.connection.onStartRejected((reason) => rejected.push(reason));
    const toStart = async (): Promise<void> => {
      await begin(lobby);
      host.connection.propose([WARRIOR, RANGER]);
      await settle();
      await timeOut(lobby);
      await timeOut(lobby);
    };
    await toStart();
    const snapshot = host.connection.getSnapshot();
    expect(snapshot.phase).toBe("waiting");
    expect(rejected).toEqual(["the match could not be created"]);
    expect(snapshot.players.map(({ name, bot, ready }) => [name, bot, ready])).toEqual([
      ["Host", false, false],
      ["Ann", false, false],
    ]);

    await allReady([host, ann]);
    await toStart();
    expect(host.connection.getSnapshot().phase).toBe("in-match");
    expect(host.connection.getSnapshot().players.filter(({ bot }) => bot)).toHaveLength(2);
  });

  it("lets a joiner in only to watch, and ignores what a spectator or a command out of its stage asks", async () => {
    const { lobby, members } = await teamLobby(["Ann"], [0, 0]);
    const [host, ann] = members;
    if (host === undefined || ann === undefined) {
      throw new Error("two members");
    }
    await begin(lobby);
    const late = await lobby.join("Late");
    late.connection.chooseTeam(0);
    late.connection.propose([WARRIOR, MONK]);
    host.connection.claim(0);
    await settle();
    expect(
      host.connection.getSnapshot().players.find(({ name }) => name === "Late")?.team,
    ).toBeNull();
    expect(sideOf(host)?.proposals).toEqual([]);
    expect(teamOf(late)?.sides).toEqual([null, null]);
    await timeOut(lobby);
    host.connection.propose([WARRIOR, MONK]);
    host.connection.vote(idOf(host));
    await settle();
    expect(sideOf(host)?.chosen?.reason).toBe("house");
    expect(sideOf(host)?.proposals).toEqual([]);
  });
});

describe("the key gate (#1681, ADR-0043)", () => {
  /** Every message `transport` is sent, by channel, in order. */
  function heard(transport: Transport): [Channel, unknown][] {
    const got: [Channel, unknown][] = [];
    for (const channel of CHANNELS) {
      transport.on(channel, (data) => got.push([channel, data]));
    }
    return got;
  }

  /** `side`'s MAC, as a peer holding `PROOF_KEY` makes it. */
  async function mac(
    side: "guest" | "host",
    hostNonce: string,
    guestNonce: string,
    guestId: string,
    hostId: string,
  ): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      PROOF_KEY,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const input = `vibewars-key\n${side}\n${hostNonce}\n${guestNonce}\n${guestId}\n${hostId}`;
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
    return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  const GUEST_NONCE = "1a".repeat(16);

  /** A well-formed coded join, as `name`. */
  const joinAs = (name: string) => ({
    protocolVersion: PROTOCOL_VERSION,
    name,
    guildTag: null,
    guildCape: null,
    admission: null,
  });

  /** The nonce `got` was challenged with. */
  function challengeIn(got: readonly [Channel, unknown][]): string {
    const challenge = got.find(([channel]) => channel === "key-challenge");
    const nonce = parseWireKeyChallenge(challenge?.[1])?.nonce;
    if (nonce === undefined) {
      throw new Error("no key challenge");
    }
    return nonce;
  }

  /** Answer the host's challenge in `got` from `peer`, right or with junk. */
  async function prove(peer: Transport, got: readonly [Channel, unknown][], right = true) {
    const proof = right
      ? await mac("guest", challengeIn(got), GUEST_NONCE, peer.selfId, "host")
      : "00".repeat(32);
    peer.send("key-proof", { nonce: GUEST_NONCE, mac: proof }, "host");
    await cryptoTurns();
  }

  const channels = (got: readonly [Channel, unknown][]): Channel[] =>
    got.map(([channel]) => channel);

  const proven = (got: readonly [Channel, unknown][]): boolean =>
    channels(got).includes("key-proven");

  it("tells a peer that has not proven the key only its challenge, whatever happens", async () => {
    const lobby = await openLobby();
    const stranger = lobby.network.join();
    const got = heard(stranger);
    await settle();
    stranger.send("lobby-join", joinAs("Sneak"), "host");
    const guest = await lobby.join("Guest");
    guest.connection.chooseTeam(0);
    lobby.host.connection.sendChat("all", "hi");
    await settle();
    expect(channels(got)).toEqual(["key-challenge"]);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest"]);
  });

  it("lets a peer in on a right proof, and proves itself back", async () => {
    const lobby = await openLobby();
    const peer = lobby.network.join();
    const got = heard(peer);
    await settle();
    await prove(peer, got);
    await until(() => proven(got));
    const [, said] = got.find(([channel]) => channel === "key-proven") ?? [];
    expect(parseWireKeyProven(said)?.mac).toBe(
      await mac("host", challengeIn(got), GUEST_NONCE, peer.selfId, "host"),
    );
    peer.send("lobby-join", joinAs("Proven"), "host");
    await until(() => playersOf(lobby.host).length === 2);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Proven"]);
  });

  it("forgets a proven peer that leaves: the same id back hears only a fresh challenge (#1681)", async () => {
    const lobby = await openLobby();
    const peer = lobby.network.join();
    const got = heard(peer);
    await settle();
    await prove(peer, got);
    await until(() => proven(got));
    peer.send("lobby-join", joinAs("Proven"), "host");
    await until(() => playersOf(lobby.host).length === 2);

    got.length = 0;
    lobby.network.blip("host", peer.selfId);
    await settle();
    peer.send("lobby-join", joinAs("Again"), "host");
    lobby.host.connection.sendChat("all", "hi");
    await settle();
    expect(channels(got)).toEqual(["key-challenge"]);
    // Its seat is held for the window (#1764), but nothing it says counts yet.
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Proven"]);

    await prove(peer, got);
    await until(() => proven(got));
    peer.send("lobby-join", joinAs("Again"), "host");
    await until(() => playersOf(lobby.host)[1]?.name === "Again");
  });

  it("challenges a proven peer that asks again inside the gate: it keeps its seat and its spent budget (#1681)", async () => {
    const lobby = await openLobby();
    const peer = lobby.network.join();
    const got = heard(peer);
    await settle();
    await prove(peer, got);
    await until(() => proven(got));
    peer.send("lobby-join", joinAs("Flooder"), "host");
    await until(() => playersOf(lobby.host).length === 2);
    for (let i = 0; i < MESSAGE_BURST; i += 1) {
      peer.send("lobby-cmd", { kind: "ready", ready: false }, "host");
    }
    await settle();

    got.length = 0;
    peer.send("key-ask", {}, "host");
    await until(() => channels(got).includes("key-challenge"));
    // Unheard while it proves the key again, though still listed.
    peer.send("lobby-cmd", { kind: "choose-team", team: 1 }, "host");
    await settle();
    expect(playersOf(lobby.host)[1]).toEqual({ name: "Flooder", team: null, ready: false });
    await prove(peer, got);
    await until(() => proven(got));
    // A leave would have refilled its budget: there was none.
    peer.send("lobby-cmd", { kind: "choose-team", team: 0 }, "host");
    await settle();
    expect(playersOf(lobby.host)[1]).toEqual({ name: "Flooder", team: null, ready: false });
    await lobby.step(2 / MESSAGES_PER_SECOND);
    peer.send("lobby-cmd", { kind: "choose-team", team: 0 }, "host");
    await settle();
    expect(playersOf(lobby.host)[1]?.team).toBe(0);
  });

  it("drops a peer on a wrong proof: the nonce is spent, so a right one after it is not heard", async () => {
    const lobby = await openLobby();
    const peer = lobby.network.join();
    const got = heard(peer);
    await settle();
    await prove(peer, got, false);
    await prove(peer, got);
    peer.send("lobby-join", joinAs("Wrong"), "host");
    await settle();
    expect(channels(got)).toEqual(["key-challenge"]);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host"]);
  });

  it("drops a peer on a malformed proof, and on one over another nonce", async () => {
    const lobby = await openLobby();
    const malformed = lobby.network.join();
    const other = lobby.network.join();
    const [gotMalformed, gotOther] = [heard(malformed), heard(other)];
    await settle();
    malformed.send("key-proof", { nonce: GUEST_NONCE }, "host");
    await settle();
    await prove(malformed, gotMalformed);
    // `other` answers with the MAC over the nonce `malformed` was sent.
    other.send(
      "key-proof",
      {
        nonce: GUEST_NONCE,
        mac: await mac("guest", challengeIn(gotMalformed), GUEST_NONCE, other.selfId, "host"),
      },
      "host",
    );
    await settle();
    await prove(other, gotOther);
    expect(channels(gotMalformed)).toEqual(["key-challenge"]);
    expect(channels(gotOther)).toEqual(["key-challenge"]);
  });

  it("drops a peer with no proof in KEY_PROOF_TIMEOUT_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const lobby = await openLobby();
      const late = lobby.network.join();
      const got = heard(late);
      await settle();
      vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);
      await prove(late, got);
      expect(channels(got)).toEqual(["key-challenge"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps at most MAX_LOBBY_PLAYERS peers unproven, dropping the oldest", async () => {
    const lobby = await openLobby();
    const waiting = Array.from({ length: MAX_LOBBY_PLAYERS + 1 }, () => lobby.network.join());
    const got = waiting.map(heard);
    await settle();
    for (const [i, peer] of waiting.entries()) {
      await prove(peer, got[i] ?? []);
    }
    await until(() => got.slice(1).every(proven));
    expect(got.map(proven)).toEqual([false, ...waiting.slice(1).map(() => true)]);
  });

  it("hears nothing from a stranger back on the id of a host it had proven, which it asks for a challenge", async () => {
    const HOST_NONCE = "2b".repeat(16);
    const network = createMemoryNetwork();
    const host = network.join("host");
    const guest = keyGated(network.join(), PROOF_KEY, "guest");
    const joins: string[] = [];
    guest.onPeerJoin((peerId) => joins.push(peerId));
    const states: unknown[] = [];
    guest.on("lobby-state", (data) => states.push(data));
    // A host that proves itself, then is gone.
    host.on("key-proof", (data, from) => {
      const nonce = parseWireKeyProof(data)?.nonce ?? "";
      void mac("host", HOST_NONCE, nonce, from, "host").then((signed) => {
        host.send("key-proven", { mac: signed }, from);
      });
    });
    host.onPeerJoin((peerId) => {
      host.send("key-challenge", { nonce: HOST_NONCE }, peerId);
    });
    await until(() => joins.length === 1);
    await host.leave();
    await settle();

    const stranger = network.join("host");
    const asked: string[] = [];
    stranger.on("key-ask", (_data, from) => asked.push(from));
    stranger.on("key-proof", (_data, from) => {
      stranger.send("key-proven", { mac: "00".repeat(32) }, from);
      stranger.send("lobby-state", { forged: true }, from);
    });
    stranger.onPeerJoin((peerId) => {
      stranger.send("key-challenge", { nonce: HOST_NONCE }, peerId);
    });
    await until(() => asked.length === 1);
    await cryptoTurns();
    expect(asked).toEqual([guest.selfId]);
    expect(joins).toEqual(["host"]);
    expect(states).toEqual([]);
  });

  /** `transport`, and a way to say `peerId` joined again with no leave first. */
  function rejoinable(transport: Transport): {
    transport: Transport;
    rejoin(peerId: string): void;
  } {
    const joins = new Set<(peerId: string) => void>();
    return {
      transport: {
        ...transport,
        onPeerJoin(handler) {
          joins.add(handler);
          const off = transport.onPeerJoin(handler);
          return () => {
            joins.delete(handler);
            off();
          };
        },
      },
      rejoin(peerId) {
        for (const handler of [...joins]) {
          handler(peerId);
        }
      },
    };
  }

  it("challenges a proven peer that joins again with no leave, and hears it only once it proves the key (#1681)", async () => {
    const network = createMemoryNetwork();
    const room = rejoinable(network.join("host"));
    const host = keyGated(room.transport, PROOF_KEY, "host");
    const joins: string[] = [];
    host.onPeerJoin((peerId) => joins.push(peerId));
    const chats: unknown[] = [];
    host.on("chat", (data) => chats.push(data));
    const peer = network.join();
    const got = heard(peer);
    await settle();
    await prove(peer, got);
    await until(() => proven(got));

    got.length = 0;
    room.rejoin(peer.selfId);
    await settle();
    expect(channels(got)).toEqual(["key-challenge"]);
    peer.send("chat", { said: "unproven" }, "host");
    await settle();
    expect(chats).toEqual([]);
    await prove(peer, got);
    await until(() => proven(got));
    peer.send("chat", { said: "proven" }, "host");
    await settle();
    expect(chats).toEqual([{ said: "proven" }]);
    expect(joins).toEqual([peer.selfId]);
  });

  it("asks a proven host that joins again with no leave for a challenge, and hears nothing until it proves itself (#1681)", async () => {
    const HOST_NONCE = "2b".repeat(16);
    const network = createMemoryNetwork();
    const host = network.join("host");
    const room = rejoinable(network.join());
    const guest = keyGated(room.transport, PROOF_KEY, "guest");
    const joins: string[] = [];
    guest.onPeerJoin((peerId) => joins.push(peerId));
    const states: unknown[] = [];
    guest.on("lobby-state", (data) => states.push(data));
    const answer = (data: unknown, from: string): void => {
      const nonce = parseWireKeyProof(data)?.nonce ?? "";
      void mac("host", HOST_NONCE, nonce, from, "host").then((signed) => {
        host.send("key-proven", { mac: signed }, from);
        host.send("lobby-state", { proven: true }, from);
      });
    };
    host.on("key-proof", answer);
    host.onPeerJoin((peerId) => {
      host.send("key-challenge", { nonce: HOST_NONCE }, peerId);
    });
    await until(() => states.length === 1);

    const asked: string[] = [];
    host.on("key-ask", (_data, from) => asked.push(from));
    room.rejoin("host");
    await until(() => asked.length === 1);
    host.send("lobby-state", { unproven: true }, guest.selfId);
    await cryptoTurns();
    expect(states).toEqual([{ proven: true }]);
    host.send("key-challenge", { nonce: HOST_NONCE }, guest.selfId);
    await until(() => states.length === 2);
    expect(states).toEqual([{ proven: true }, { proven: true }]);
    expect(joins).toEqual(["host"]);
  });

  it("leaves a host whose key-proven does not hold unheard: the join times out", async () => {
    const network = createMemoryNetwork();
    const impostor = network.join("impostor");
    impostor.on("key-proof", (_data, from) => {
      impostor.send("key-proven", { mac: "00".repeat(32) }, from);
      impostor.send("lobby-state", { forged: true }, from);
    });
    impostor.onPeerJoin((peerId) => {
      impostor.send("key-challenge", { nonce: "2b".repeat(16) }, peerId);
    });
    const joining = joinLobby({
      transport: network.join(),
      code: CODE,
      proofKey: PROOF_KEY,
      name: "Fooled",
      guildTag: null,
      guildCape: null,
      timeoutMs: 50,
    });
    await expect(joining).rejects.toEqual(new LobbyNoAnswerError(50, null));
  });
});

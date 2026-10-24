import { Client, type Room } from "@colyseus/sdk";
import { matchMaker, type Room as ServerRoom } from "@colyseus/core";
import {
  PROTOCOL_VERSION,
  QUICK_MATCH_MAX_PLAYERS,
  ROOM_LOBBY,
  ROOM_MATCH,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOBBY_MATCH_JOIN_DEADLINE_SECONDS, MatchRoom } from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/** What a test reads of a match room's decoded state. */
interface MatchView {
  readonly players: ReadonlyMap<string, { readonly team: number }>;
}

/** What a test reads of a lobby's decoded state. */
interface LobbyView {
  readonly phase: string;
  readonly players: ReadonlyMap<string, { readonly team: number; readonly ready: boolean }>;
}

/**
 * Each lobby plays in its own match room, with its own teams (#41). Real
 * server, real sockets: the bug was in how rooms are found, which a
 * mocked matchmaker would have agreed with.
 */
describe("a lobby's own match", () => {
  let server: GameServer;
  let endpoint: string;

  beforeAll(async () => {
    const port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  /** One lobby member, and the `match-starting` it gets, if any. */
  interface Member {
    readonly room: Room<unknown, LobbyView>;
    readonly team: number | null;
    readonly starting: Promise<LobbyMatchStartingMessage>;
    received: LobbyMatchStartingMessage | undefined;
  }

  /**
   * A lobby whose members pick `teams` (`null` spectates) and ready up.
   * The first member hosts.
   */
  async function lobby(teams: readonly (number | null)[]): Promise<Member[]> {
    const members: Member[] = [];
    for (const team of teams) {
      const host = members[0];
      const room =
        host === undefined
          ? await new Client(endpoint).create<LobbyView>(ROOM_LOBBY, {
              protocolVersion: PROTOCOL_VERSION,
            })
          : await new Client(endpoint).joinById<LobbyView>(host.room.roomId, {
              protocolVersion: PROTOCOL_VERSION,
            });
      const member: Member = {
        room,
        team,
        received: undefined,
        starting: new Promise((resolve) => {
          room.onMessage("match-starting", (message: LobbyMatchStartingMessage) => {
            member.received = message;
            resolve(message);
          });
        }),
      };
      members.push(member);
    }
    const host = members[0]?.room;
    if (host === undefined) {
      throw new Error("a lobby needs a host");
    }
    await waitFor(() => host.state.players.size === teams.length, { label: "everyone in" });
    for (const { room, team } of members) {
      room.send("choose-team", { team });
    }
    await waitFor(
      () =>
        members.every(
          ({ room, team }) => host.state.players.get(room.sessionId)?.team === (team ?? -1),
        ),
      { label: "teams" },
    );
    for (const { room, team } of members) {
      if (team !== null) {
        room.send("ready", { ready: true });
      }
    }
    await waitFor(
      () =>
        members.every(
          ({ room, team }) =>
            team === null || host.state.players.get(room.sessionId)?.ready === true,
        ),
      { label: "ready" },
    );
    return members;
  }

  /** Start it, and wait for every team member's ticket. */
  async function start(members: readonly Member[]): Promise<LobbyMatchStartingMessage[]> {
    members[0]?.room.send("start-match", {});
    return Promise.all(members.filter(({ team }) => team !== null).map(({ starting }) => starting));
  }

  const join = (message: LobbyMatchStartingMessage, ticket: string | null = message.ticket) =>
    new Client(endpoint).joinById<MatchView>(message.roomId, {
      protocolVersion: PROTOCOL_VERSION,
      ...(ticket === null ? {} : { ticket }),
    });

  /** The room in this process, or `undefined` once it is gone. */
  const localRoom = (roomId: string): ServerRoom | undefined => {
    // Typed as always found; it is not, once the room has gone.
    const found: ServerRoom | undefined = matchMaker.getLocalRoomById(roomId);
    return found;
  };

  async function leaveAll(rooms: readonly { leave(): Promise<unknown> }[]): Promise<void> {
    for (const room of rooms) {
      await room.leave();
    }
  }

  it("gives two lobbies started at once two rooms, each with its lobby's teams", async () => {
    const first = await lobby([0, 1, 1]);
    const second = await lobby([1, 0]);
    const [a, b] = await Promise.all([start(first), start(second)]);

    const roomIds = new Set([...a, ...b].map((message) => message.roomId));
    expect(roomIds.size).toBe(2);

    for (const members of [first, second]) {
      const matches = await Promise.all(
        members.map(({ received }) => {
          if (received === undefined) {
            throw new Error("a team member got no ticket");
          }
          return join(received);
        }),
      );
      const watcher = matches[0];
      if (watcher === undefined) {
        throw new Error("nobody joined");
      }
      await waitFor(() => watcher.state.players.size === members.length, { label: "all seated" });
      members.forEach(({ team }, i) => {
        const seat = matches[i];
        expect(seat && watcher.state.players.get(seat.sessionId)?.team).toBe(team);
      });
      await leaveAll([...matches, ...members.map(({ room }) => room)]);
    }
  });

  it("sends a spectator no ticket, and leaves them in the lobby", async () => {
    const members = await lobby([0, null]);
    await start(members);
    const spectator = members[1];
    await waitFor(() => spectator?.room.state.phase === "in-match", { label: "match started" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spectator?.received).toBeUndefined();
    await leaveAll(members.map(({ room }) => room));
  });

  it("refuses a join with no ticket, a spent ticket, or another lobby's ticket, and stays open", async () => {
    // The bad joins come first, into the empty room: they must not close it.
    const [mine] = await start(await lobby([0, 1]));
    const [theirs] = await start(await lobby([0]));
    if (mine === undefined || theirs === undefined) {
      throw new Error("no tickets");
    }
    await expect(join(mine, null)).rejects.toThrow(/lobby's players only/);
    await expect(join(mine, theirs.ticket)).rejects.toThrow(/lobby's players only/);
    const seated = await join(mine);
    await expect(join(mine)).rejects.toThrow(/lobby's players only/);
    await seated.leave();
  });

  it("never puts a Quick Match player into a lobby's match", async () => {
    const [ticket] = await start(await lobby([0, 1]));
    if (ticket === undefined) {
      throw new Error("no ticket");
    }
    const seated = await join(ticket);
    const quick = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(quick.roomId).not.toBe(ticket.roomId);
    await leaveAll([quick, seated]);
  });

  it("disposes a lobby's match nobody came to, once the join deadline passes", async () => {
    const [ticket] = await start(await lobby([0]));
    if (ticket === undefined) {
      throw new Error("no ticket");
    }
    const room = localRoom(ticket.roomId);
    expect(room).toBeInstanceOf(MatchRoom);
    // Advance only the deadline, by exactly the deadline.
    const deadline = LOBBY_MATCH_JOIN_DEADLINE_SECONDS * 1000;
    for (const delayed of room?.clock.delayed ?? []) {
      if (delayed.time === deadline) {
        delayed.tick(deadline);
      }
    }
    await waitFor(() => localRoom(ticket.roomId) === undefined, {
      label: "the empty match to go",
    });
    await expect(join(ticket)).rejects.toThrow();
  });
});

describe("Quick Match", () => {
  let server: GameServer;
  let endpoint: string;

  beforeAll(async () => {
    const port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it(`opens a new room once one holds ${String(QUICK_MATCH_MAX_PLAYERS)} players`, async () => {
    const quick = () =>
      new Client(endpoint).joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const players = [];
    for (let i = 0; i < QUICK_MATCH_MAX_PLAYERS; i += 1) {
      players.push(await quick());
    }
    expect(new Set(players.map((room) => room.roomId)).size).toBe(1);

    const ninth = await quick();
    expect(ninth.roomId).not.toBe(players[0]?.roomId);

    for (const room of [...players, ninth]) {
      await room.leave();
    }
  });
});

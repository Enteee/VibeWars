import { randomUUID } from "node:crypto";

import { Client, type Room } from "@colyseus/sdk";
import { matchMaker, type Room as ServerRoom } from "@colyseus/core";
import { defaultBuildEquipment, type PlayerBuild } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  QUICK_MATCH_MAX_PLAYERS,
  ROOM_LOBBY,
  ROOM_MATCH,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_MAP_ID,
  LOBBY_MATCH_JOIN_DEADLINE_SECONDS,
  MatchRoom,
  openLobbyMatch,
} from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/** What a test reads of a match room's decoded state. */
interface MatchView {
  readonly phase: string;
  readonly players: ReadonlyMap<
    string,
    { readonly team: number; readonly name: string; readonly weaponId: string }
  >;
}

/** What a test reads of a lobby's decoded state. */
interface LobbyView {
  readonly phase: string;
  readonly players: ReadonlyMap<string, { readonly team: number; readonly ready: boolean }>;
}

/** A legal build whose weapon shows up in the match, so a test can see it arrived. */
const pyro = (name: string): PlayerBuild => ({
  name,
  primaryProfession: "elementalist",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
  skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("elementalist"),
});

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
   * The first member hosts. `builds[i]` and `names[i]`, when given, are
   * what member `i` joins the lobby with.
   */
  async function lobby(
    teams: readonly (number | null)[],
    builds: readonly (PlayerBuild | undefined)[] = [],
    names: readonly (string | undefined)[] = [],
  ): Promise<Member[]> {
    const members: Member[] = [];
    for (const [i, team] of teams.entries()) {
      const host = members[0];
      const build = builds[i];
      const name = names[i];
      const options = {
        protocolVersion: PROTOCOL_VERSION,
        ...(build === undefined ? {} : { build }),
        ...(name === undefined ? {} : { name }),
      };
      const room =
        host === undefined
          ? await new Client(endpoint).create<LobbyView>(ROOM_LOBBY, options)
          : await new Client(endpoint).joinById<LobbyView>(host.room.roomId, options);
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

  /** Start it, and wait for every team member's seat. */
  async function start(members: readonly Member[]): Promise<LobbyMatchStartingMessage[]> {
    members[0]?.room.send("start-match", {});
    return Promise.all(members.filter(({ team }) => team !== null).map(({ starting }) => starting));
  }

  const take = (message: LobbyMatchStartingMessage) =>
    new Client(endpoint).consumeSeatReservation<MatchView>(message.reservation);

  /** A client that knows the room's id, and nothing else. */
  const intrude = (roomId: string, options: Record<string, unknown> = {}) =>
    new Client(endpoint).joinById<MatchView>(roomId, {
      protocolVersion: PROTOCOL_VERSION,
      ...options,
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

    const roomIds = new Set([...a, ...b].map((message) => message.reservation.roomId));
    expect(roomIds.size).toBe(2);

    for (const members of [first, second]) {
      const matches = await Promise.all(
        members.map(({ received }) => {
          if (received === undefined) {
            throw new Error("a team member got no seat");
          }
          return take(received);
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

  it("plays each member with the build they joined the lobby with", async () => {
    const members = await lobby([0, 1], [pyro("Lobby Pyro"), undefined]);
    const [mine] = await start(members);
    if (mine === undefined) {
      throw new Error("no seat");
    }
    const match = await take(mine);
    await waitFor(() => match.state.players.get(match.sessionId) !== undefined, {
      label: "own player in state",
    });
    // The house loadout is a warrior's; only the build carries this weapon.
    expect(match.state.players.get(match.sessionId)?.weaponId).toBe(
      defaultBuildEquipment("elementalist").mainHand.weaponId,
    );
    await leaveAll([match, ...members.map(({ room }) => room)]);
  });

  it("names each member in the match as the lobby named them (#53)", async () => {
    const members = await lobby([0, 1], [], ["Hostess", "Guesty"]);
    const matches = await Promise.all((await start(members)).map(take));
    const [first] = matches;
    await waitFor(() => first?.state.players.size === 2, { label: "both in the match" });
    const names = matches.map((match) => first?.state.players.get(match.sessionId)?.name);
    expect(names).toEqual(["Hostess", "Guesty"]);
    await leaveAll([...matches, ...members.map(({ room }) => room)]);
  });

  it("sends a spectator no seat, and leaves them in the lobby", async () => {
    const members = await lobby([0, null]);
    await start(members);
    const spectator = members[1];
    await waitFor(() => spectator?.room.state.phase === "in-match", { label: "match started" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spectator?.received).toBeUndefined();
    await leaveAll(members.map(({ room }) => room));
  });

  it("is full before anyone arrives, so a stranger cannot take or hold a seat", async () => {
    const members = await lobby([0, 1]);
    const seats = await start(members);
    const roomId = seats[0]?.reservation.roomId ?? "";
    // A reservation is all an attacker needs to hold a seat: one never
    // consumed blocks it until it lapses. This asks for one the way the
    // HTTP matchmaking route does, and never connects. Were any of them
    // granted, the lobby's own players below could not all get in.
    for (let i = 0; i < 5; i += 1) {
      await expect(
        matchMaker.joinById(roomId, { protocolVersion: PROTOCOL_VERSION }),
      ).rejects.toThrow();
    }
    const matches = await Promise.all(seats.map(take));
    expect(matches).toHaveLength(2);
    await leaveAll([...matches, ...members.map(({ room }) => room)]);
  });

  it("does not hand a seat its player gave up to a stranger", async () => {
    const members = await lobby([0, 1]);
    const seats = await start(members);
    const [stays, goes] = await Promise.all(seats.map(take));
    const roomId = seats[0]?.reservation.roomId ?? "";
    const gaveUp = goes?.sessionId;
    await goes?.leave(true);
    await waitFor(() => stays?.state.players.size === 1, { label: "the leaver gone" });
    await expect(intrude(roomId)).rejects.toThrow(/lobby's players only/);
    // Naming the seat in the options claims nothing: only the session id
    // the server chose does.
    await expect(intrude(roomId, { sessionId: gaveUp })).rejects.toThrow(/lobby's players only/);
    await leaveAll([...(stays === undefined ? [] : [stays]), ...members.map(({ room }) => room)]);
  });

  it("refuses a stranger into a seat whose player never came, once it lapsed", async () => {
    // A one-second deadline instead of the real one; the lapse is the same.
    const [came, neverCame] = await openLobbyMatch(
      DEFAULT_MAP_ID,
      [
        { team: 0, name: "a", build: undefined },
        { team: 1, name: "b", build: undefined },
      ],
      () => {
        /* no lobby to tell */
      },
      1,
    );
    if (came === undefined || neverCame === undefined) {
      throw new Error("no seats");
    }
    const seated = await new Client(endpoint).consumeSeatReservation<MatchView>(came);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await expect(intrude(came.roomId)).rejects.toThrow(/lobby's players only/);
    await expect(intrude(came.roomId, { sessionId: neverCame.sessionId })).rejects.toThrow(
      /lobby's players only/,
    );
    // Too late for its own player as well.
    await expect(
      new Client(endpoint).consumeSeatReservation<MatchView>(neverCame),
    ).rejects.toThrow();
    expect(seated.state.players.size).toBe(1);
    await seated.leave();
  });

  it("names a seated player by their lobby name, whatever they join with (#53)", async () => {
    const [came, renamed] = await openLobbyMatch(
      DEFAULT_MAP_ID,
      [
        { team: 0, name: "Hostess", build: undefined },
        { team: 1, name: "Guesty", build: undefined },
      ],
      () => {
        /* no lobby to tell */
      },
      1,
    );
    if (came === undefined || renamed === undefined) {
      throw new Error("no seats");
    }
    const seated = await new Client(endpoint).consumeSeatReservation<MatchView>(came);
    // Let the second seat's own reservation lapse, then join that seat's
    // session asking for another player's name.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const impostor = await new Client(endpoint).consumeSeatReservation<MatchView>(
      await matchMaker.reserveSeatFor(
        await matchMaker.getRoomById(came.roomId),
        { protocolVersion: PROTOCOL_VERSION, name: "Impostor" },
        { sessionId: renamed.sessionId },
      ),
    );
    await waitFor(() => seated.state.players.size === 2, { label: "both in the match" });
    expect(seated.state.players.get(impostor.sessionId)?.name).toBe("Guesty");
    await leaveAll([seated, impostor]);
  });

  it("refuses a client that tries to open a seated match of its own", async () => {
    const before = (await matchMaker.query({ name: ROOM_MATCH })).length;
    await expect(
      new Client(endpoint).create(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
        seating: randomUUID(),
      }),
    ).rejects.toThrow(/opened by its lobby/);
    expect((await matchMaker.query({ name: ROOM_MATCH })).length).toBe(before);
  });

  it("never puts a Quick Match player into a lobby's match", async () => {
    const members = await lobby([0, 1]);
    const [seat] = await start(members);
    if (seat === undefined) {
      throw new Error("no seat");
    }
    const seated = await take(seat);
    const quick = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(quick.roomId).not.toBe(seat.reservation.roomId);
    await leaveAll([quick, seated, ...members.map(({ room }) => room)]);
  });

  /** Open a two-seat lobby match with `onOver`, and walk both players in. */
  async function seatTwo(onOver: () => void) {
    const reservations = await openLobbyMatch(
      DEFAULT_MAP_ID,
      [
        { team: 0, name: "a", build: undefined },
        { team: 1, name: "b", build: undefined },
      ],
      onOver,
    );
    const players = await Promise.all(
      reservations.map((reservation) =>
        new Client(endpoint).consumeSeatReservation<MatchView>(reservation),
      ),
    );
    const roomId = reservations[0]?.roomId ?? "";
    // Finish it now, rather than after ten minutes of play.
    const finish = async (): Promise<void> => {
      const room = localRoom(roomId);
      if (!(room instanceof MatchRoom)) throw new Error("no match room");
      await room.endMatch();
    };
    return { players, finish, roomId };
  }

  it("tells its lobby the match is over once: at the finish, not again at dispose (#44)", async () => {
    let calls = 0;
    const { players, finish, roomId } = await seatTwo(() => {
      calls += 1;
    });
    expect(calls).toBe(0);

    await finish();
    expect(calls).toBe(1);

    await leaveAll(players);
    await waitFor(() => localRoom(roomId) === undefined, { label: "disposed" });
    expect(calls).toBe(1);
  });

  it("tells its lobby when everyone left before the finish", async () => {
    let calls = 0;
    const { players } = await seatTwo(() => {
      calls += 1;
    });

    await leaveAll(players);
    await waitFor(() => calls === 1, { label: "onOver at dispose" });
  });

  it("finishes the match even if its lobby throws on hearing it", async () => {
    const { players, finish } = await seatTwo(() => {
      throw new Error("the lobby is broken");
    });

    await finish();
    await waitFor(() => players.every((player) => player.state.phase === "finished"), {
      label: "everyone sees the finish",
    });
    await leaveAll(players);
  });

  it("lets an unclaimed seat lapse at the join deadline, and then disposes the empty match", async () => {
    const members = await lobby([0]);
    const [seat] = await start(members);
    const room = localRoom(seat?.reservation.roomId ?? "");
    expect(room).toBeInstanceOf(MatchRoom);
    // Colyseus frees a reserved seat after `seatReservationTimeout`, and
    // disposes an auto-disposing room with nobody in it once its last
    // reservation lapses. Waiting the real 30 s is not worth it here.
    expect(room?.seatReservationTimeout).toBe(LOBBY_MATCH_JOIN_DEADLINE_SECONDS);
    expect(room?.autoDispose).toBe(true);
    await leaveAll(members.map(({ room: lobbyRoom }) => lobbyRoom));
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

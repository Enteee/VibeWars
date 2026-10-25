import { matchMaker } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import { createRng, seedFromString } from "@vibewars/game-core";
import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  ROOM_LOBBY,
  isLobbyCode,
  normalizeLobbyCode,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateLobbyCode, sanitizeName } from "./rooms/lobby-room.js";
import { MatchRoom } from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

describe("sanitizeName", () => {
  it("keeps a reasonable name as-is", () => {
    expect(sanitizeName("Ellie", "fallback")).toBe("Ellie");
  });

  it("falls back for a non-string", () => {
    expect(sanitizeName(42, "fallback")).toBe("fallback");
    expect(sanitizeName(undefined, "fallback")).toBe("fallback");
    expect(sanitizeName(null, "fallback")).toBe("fallback");
  });

  it("falls back for an empty or whitespace-only name", () => {
    expect(sanitizeName("", "fallback")).toBe("fallback");
    expect(sanitizeName("   ", "fallback")).toBe("fallback");
  });

  it("strips control characters that would corrupt logs or other clients' UI", () => {
    // A name carrying an ANSI escape and a NUL byte.
    const hostile = "ab\u001b[31mcd\u0000";
    expect(sanitizeName(hostile, "fallback")).toBe("ab[31mcd");
  });

  it("clamps a very long name so one player cannot flood the screen", () => {
    expect(sanitizeName("x".repeat(500), "fallback")).toHaveLength(16);
  });

  // #174: names are drawn over every player's head, so anything that
  // draws nothing, rearranges the line, or draws outside it goes.
  it("strips bidi controls, so a name cannot reverse itself or what follows", () => {
    expect(sanitizeName("\u202enimda", "fallback")).toBe("nimda");
    const bidi = [
      ...["\u202a", "\u202b", "\u202c", "\u202d", "\u202e"],
      ...["\u2066", "\u2067", "\u2068", "\u2069"],
      ...["\u200e", "\u200f", "\u061c"],
    ];
    for (const control of bidi) {
      expect(sanitizeName(`a${control}b`, "fallback")).toBe("ab");
    }
  });

  it("strips zero-width and other invisible characters", () => {
    expect(sanitizeName("a\u200bb\u200dc\ufeff\u2060\u00ad", "fallback")).toBe("abc");
    expect(sanitizeName("\u200b\u200c\u200d\u2060", "fallback")).toBe("fallback");
    expect(sanitizeName("a\u2028b\u2029c", "fallback")).toBe("abc");
  });

  it("strips the characters that are blank by design: Hangul fillers and the braille blank", () => {
    for (const blank of ["\u115f", "\u1160", "\u3164", "\uffa0", "\u2800"]) {
      expect(sanitizeName(`a${blank}b`, "fallback")).toBe("ab");
      expect(sanitizeName(blank.repeat(3), "fallback")).toBe("fallback");
    }
  });

  it("reads only the head of a huge name, and still cleans it", () => {
    const huge = `\u202eEllie${"\u0301".repeat(1_000_000)}`;
    expect(sanitizeName(huge, "fallback")).toBe("Elli\u00e9\u0301\u0301");
  });

  it("strips C1 controls", () => {
    expect(sanitizeName("\u0085x\u009f", "fallback")).toBe("x");
  });

  it("keeps at most two combining marks on a letter, and none with nothing to sit on", () => {
    // NFC first folds one mark into the letter: é, then two more.
    expect(sanitizeName(`e${"\u0301".repeat(15)}`, "fallback")).toBe("\u00e9\u0301\u0301");
    expect(sanitizeName("\u0301abc", "fallback")).toBe("abc");
    expect(sanitizeName(" \u0301 \u0301abc", "fallback")).toBe("abc");
  });

  it("normalises to NFC, so an accented letter is one character", () => {
    expect(sanitizeName("e\u0301", "fallback")).toBe("\u00e9");
  });

  it("collapses runs of whitespace", () => {
    expect(sanitizeName("a    b", "fallback")).toBe("a b");
    expect(sanitizeName("a\t\n b", "fallback")).toBe("a b");
  });

  it("clamps in code points, so an emoji is never cut in half", () => {
    const name = sanitizeName(`${"x".repeat(15)}\u{1f600}\u{1f600}`, "fallback");
    expect(name).toBe(`${"x".repeat(15)}\u{1f600}`);
    expect(Array.from(name)).toHaveLength(16);
    expect(name).not.toMatch(/\p{Cs}/u);
  });

  it("drops a lone surrogate the client sent", () => {
    expect(sanitizeName("a\ud800b", "fallback")).toBe("ab");
  });

  it("does not end on a space the clamp exposed", () => {
    expect(sanitizeName(`${"x".repeat(15)} y`, "fallback")).toBe("x".repeat(15));
  });
});

describe("generateLobbyCode", () => {
  it("produces a code of the expected length from the code alphabet", () => {
    const code = generateLobbyCode(createRng(seedFromString("seed")));
    expect(code).toHaveLength(LOBBY_CODE_LENGTH);
    expect(isLobbyCode(code)).toBe(true);
  });

  it("uses only characters from the unambiguous alphabet", () => {
    const rng = createRng(seedFromString("alphabet"));
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateLobbyCode(rng)) {
        expect(LOBBY_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("is deterministic for a given seed, so a match can be reproduced", () => {
    expect(generateLobbyCode(createRng(42))).toBe(generateLobbyCode(createRng(42)));
  });

  it("produces varied codes across draws rather than repeating one", () => {
    const rng = createRng(seedFromString("variety"));
    const codes = new Set(Array.from({ length: 50 }, () => generateLobbyCode(rng)));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("lobby room", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it("gives a newly created lobby a valid, shareable code", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, { protocolVersion: PROTOCOL_VERSION });
    // Wait for the condition actually under test. `create()` resolves on
    // the handshake, before the first state patch decodes, so polling for
    // a merely non-empty string can observe a half-synced value.
    await waitFor(() => isLobbyCode(room.state.code), { label: "a valid code to sync" });

    expect(isLobbyCode(room.state.code)).toBe(true);
    await room.leave();
  });

  it("refuses to create a lobby for a client on another protocol version", async () => {
    await expect(
      new Client(endpoint).create(ROOM_LOBBY, { protocolVersion: PROTOCOL_VERSION + 1 }),
    ).rejects.toThrow(PROTOCOL_MISMATCH_MESSAGE);
  });

  it("refuses a guest with a wrong or missing protocol version, and keeps no trace", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 1, { label: "the host" });

    for (const options of [{ protocolVersion: PROTOCOL_VERSION + 1 }, {}]) {
      await expect(new Client(endpoint).joinById(host.roomId, options)).rejects.toThrow(
        PROTOCOL_MISMATCH_MESSAGE,
      );
    }
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "the valid guest" });
    expect(host.state.players.size).toBe(2);

    await guest.leave();
    await host.leave();
  });

  it("makes the first player the host", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    expect(room.state.players.get(room.sessionId)?.isHost).toBe(true);
    await room.leave();
  });

  it("sanitises the display name a client asks for", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      name: "x".repeat(100),
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    expect(room.state.players.get(room.sessionId)?.name.length).toBeLessThanOrEqual(16);
    await room.leave();
  });

  it("lets a second player join by room id and does not make them host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    expect(host.state.players.get(guest.sessionId)?.isHost).toBe(false);
    expect(host.state.players.get(host.sessionId)?.isHost).toBe(true);

    await guest.leave();
    await host.leave();
  });

  it("assigns a team when a player chooses one", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 1 });
    await waitFor(() => room.state.players.get(room.sessionId)?.team === 1, {
      label: "team assigned",
    });

    expect(room.state.players.get(room.sessionId)?.team).toBe(1);
    await room.leave();
  });

  it("rejects a nonsense team value rather than accepting it", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 99 });
    room.send("choose-team", { team: "red" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(room.state.players.get(room.sessionId)?.team).toBe(-1);
    await room.leave();
  });

  it("clears readiness when a player switches teams", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 0 });
    await waitFor(() => room.state.players.get(room.sessionId)?.team === 0, { label: "team" });
    room.send("ready", { ready: true });
    await waitFor(() => room.state.players.get(room.sessionId)?.ready === true, { label: "ready" });

    room.send("choose-team", { team: 1 });
    await waitFor(() => room.state.players.get(room.sessionId)?.ready === false, {
      label: "readiness cleared",
    });

    expect(room.state.players.get(room.sessionId)?.ready).toBe(false);
    await room.leave();
  });

  it("refuses to mark a spectator ready", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("ready", { ready: true });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Still on no team, so readiness must not stick.
    expect(room.state.players.get(room.sessionId)?.ready).toBe(false);
    await room.leave();
  });

  it("rejects starting when nobody is on a team", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    const rejection = new Promise<{ reason: string }>((resolve) => {
      room.onMessage("start-rejected", resolve);
    });
    room.send("start-match", {});

    expect((await rejection).reason).toContain("team");
    expect(room.state.phase).toBe("waiting");
    await room.leave();
  });

  it("rejects starting while someone on a team is not ready", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    await waitFor(() => host.state.players.get(host.sessionId)?.ready === true, { label: "ready" });

    const rejection = new Promise<{ reason: string }>((resolve) => {
      host.onMessage("start-rejected", resolve);
    });
    host.send("start-match", {});

    expect((await rejection).reason).toContain("ready");
    await guest.leave();
    await host.leave();
  });

  it("ignores a start request from a non-host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(() => host.state.players.get(guest.sessionId)?.ready === true, {
      label: "ready",
    });

    // The guest, not the host, asks to start.
    guest.send("start-match", {});
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(host.state.phase).toBe("waiting");
    await guest.leave();
    await host.leave();
  });

  it("starts the match when the host asks and everyone on a team is ready", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(
      () =>
        host.state.players.get(host.sessionId)?.ready === true &&
        host.state.players.get(guest.sessionId)?.ready === true,
      { label: "both ready" },
    );

    const starting = new Promise<{ mapId: string }>((resolve) => {
      guest.onMessage("match-starting", resolve);
    });
    host.send("start-match", {});

    const message = await starting;
    expect(message.mapId.length).toBeGreaterThan(0);
    await waitFor(() => host.state.phase === "in-match", { label: "phase to advance" });

    await guest.leave();
    await host.leave();
  });

  it("hands hosting to someone else when the host leaves", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => guest.state.players.size === 2, { label: "both players" });

    await host.leave();
    await waitFor(() => guest.state.players.get(guest.sessionId)?.isHost === true, {
      label: "hosting to transfer",
    });

    expect(guest.state.players.get(guest.sessionId)?.isHost).toBe(true);
    await guest.leave();
  });

  it("ignores a map selection from a non-host, and an unknown map from the host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    const original = host.state.mapId;
    guest.send("select-map", { mapId: "arena-alpha" });
    host.send("select-map", { mapId: "no-such-map" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(host.state.mapId).toBe(original);
    await guest.leave();
    await host.leave();
  });
});

describe("playing more than one match in a lobby", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  /** Drive a lobby from fresh to a started match that both players are in. */
  async function startAMatch() {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const guest = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    return { host, guest, matches: await startAgain(host, guest) };
  }

  /** Ready both players, start, and walk each into the match. */
  async function startAgain(host: Room, guest: Room): Promise<Room[]> {
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(
      () =>
        host.state.players.get(host.sessionId)?.ready === true &&
        host.state.players.get(guest.sessionId)?.ready === true,
      { label: "both ready" },
    );

    const starting = [host, guest].map(
      (room) =>
        new Promise<LobbyMatchStartingMessage>((resolve) => {
          room.onMessage("match-starting", resolve);
        }),
    );
    host.send("start-match", {});
    const messages = await Promise.all(starting);
    await waitFor(() => host.state.phase === "in-match", { label: "match to start" });
    return Promise.all(
      messages.map(({ reservation }) => new Client(endpoint).consumeSeatReservation(reservation)),
    );
  }

  /** Everyone leaves the match, which is how one that never finished ends. */
  async function leaveTheMatch(host: Room, matches: readonly Room[]): Promise<void> {
    await Promise.all(matches.map((match) => match.leave()));
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });
  }

  /** Finish a match now, rather than after ten minutes of play. */
  function finish(match: Room): void {
    const room = matchMaker.getLocalRoomById(match.roomId);
    if (!(room instanceof MatchRoom)) throw new Error("no match room");
    room.endMatch();
  }

  it("returns to waiting the moment its match finishes, with readiness cleared and teams kept", async () => {
    const { host, guest, matches } = await startAMatch();
    const [match] = matches;
    if (match === undefined) throw new Error("no match");

    finish(match);
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });

    expect(host.state.players.get(host.sessionId)?.ready).toBe(false);
    expect(host.state.players.get(guest.sessionId)?.ready).toBe(false);
    expect(host.state.players.get(host.sessionId)?.team).toBe(0);
    expect(host.state.players.get(guest.sessionId)?.team).toBe(1);

    await Promise.all(matches.map((room) => room.leave()));
    await guest.leave();
    await host.leave();
  });

  it("lets its match finish quietly when the lobby itself is already gone", async () => {
    const { host, guest, matches } = await startAMatch();
    const [match] = matches;
    if (match === undefined) throw new Error("no match");
    await guest.leave();
    await host.leave();

    finish(match);
    await waitFor(() => matches.every((room) => room.state.phase === "finished"), {
      label: "the match to finish",
    });
    await Promise.all(matches.map((room) => room.leave()));
  });

  it("returns to waiting by itself once its match is over", async () => {
    const { host, guest, matches } = await startAMatch();

    await leaveTheMatch(host, matches);

    expect(host.state.phase).toBe("waiting");
    await guest.leave();
    await host.leave();
  });

  it("stays in its match while anyone is still playing it", async () => {
    const { host, guest, matches } = await startAMatch();
    const [hostMatch, guestMatch] = matches;

    // The host walking out early must not end the match for the guest.
    await hostMatch?.leave();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(host.state.phase).toBe("in-match");

    await guestMatch?.leave();
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });
    await guest.leave();
    await host.leave();
  });

  it("will not let a member reset a lobby whose match is still on (#44)", async () => {
    const { host, guest, matches } = await startAMatch();

    // There is no client message for it any more: an unregistered type
    // gets its sender dropped, and the match carries on.
    guest.send("return-to-lobby", {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(host.state.phase).toBe("in-match");
    expect(host.state.players.get(host.sessionId)?.ready).toBe(true);

    await leaveTheMatch(host, matches);
    await host.leave();
  });

  it("clears readiness on return, so nobody is dragged into a match they did not confirm", async () => {
    const { host, guest, matches } = await startAMatch();

    await leaveTheMatch(host, matches);

    expect(host.state.players.get(host.sessionId)?.ready).toBe(false);
    expect(host.state.players.get(guest.sessionId)?.ready).toBe(false);

    await guest.leave();
    await host.leave();
  });

  it("keeps team assignments, so sides do not have to be re-picked every round", async () => {
    const { host, guest, matches } = await startAMatch();

    await leaveTheMatch(host, matches);

    expect(host.state.players.get(host.sessionId)?.team).toBe(0);
    expect(host.state.players.get(guest.sessionId)?.team).toBe(1);

    await guest.leave();
    await host.leave();
  });

  it("can actually start a second match after returning", async () => {
    const { host, guest, matches } = await startAMatch();

    await leaveTheMatch(host, matches);
    const second = await startAgain(host, guest);

    expect(host.state.phase).toBe("in-match");
    await leaveTheMatch(host, second);
    await guest.leave();
    await host.leave();
  });
});

describe("joining by code", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it("puts a player into the lobby whose code they typed", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      name: "Host",
    });
    await waitFor(() => isLobbyCode(host.state.code), { label: "code" });

    const guest = await new Client(endpoint).join(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      code: host.state.code,
      name: "Guest",
    });
    await waitFor(() => host.state.players.size === 2, { label: "guest to arrive" });

    // Same room, not merely "a" lobby.
    expect(guest.roomId).toBe(host.roomId);
    expect(guest.state.code).toBe(host.state.code);

    await guest.leave();
    await host.leave();
  });

  it("does not drop a player into an unrelated lobby when two exist", async () => {
    const first = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const second = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => isLobbyCode(first.state.code) && isLobbyCode(second.state.code), {
      label: "both codes",
    });
    expect(first.state.code).not.toBe(second.state.code);

    const guest = await new Client(endpoint).join(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      code: second.state.code,
    });
    await waitFor(() => second.state.players.size === 2, { label: "guest in the right lobby" });

    expect(guest.roomId).toBe(second.roomId);
    expect(first.state.players.size).toBe(1);

    await guest.leave();
    await second.leave();
    await first.leave();
  });

  it("accepts a lower-case or spaced code, because players mistype them", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => isLobbyCode(host.state.code), { label: "code" });

    const code: string = host.state.code;
    const messy = ` ${code.toLowerCase()} `;
    const guest = await new Client(endpoint).join(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      code: normalizeLobbyCode(messy),
    });
    await waitFor(() => host.state.players.size === 2, { label: "guest to arrive" });

    expect(guest.roomId).toBe(host.roomId);
    await guest.leave();
    await host.leave();
  });
});

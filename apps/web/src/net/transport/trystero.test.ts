import { CHANNELS, type Channel } from "@vibewars/game-protocol";
import { MAX_MESSAGE_BYTES, deriveLobbyRoom, type LobbyRoom } from "@vibewars/game-session";
import type {
  DataPayload,
  JoinRoomCallbacks,
  JoinRoomConfig,
  MessageAction,
  Room,
} from "trystero/nostr";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_ID,
  MAX_RECEIVE_BYTES,
  NOSTR_RELAYS,
  RELAY_CHECK_MS,
  RELAY_REDUNDANCY,
} from "./relays.js";
import { joinTrysteroRoom, type TrysteroDeps } from "./trystero.js";
import type { TurnConfig } from "./turn-config.js";

/** A room as a lobby key's derivation names it; the transport reads only these two. */
const ROOM: LobbyRoom = { roomId: "a7", password: "kq", proofKey: null, relay: null };

/** A Trystero room with no network: the test plays the remote peers. */
function fakeRoom(options: { sendFails?: boolean; turn?: TurnConfig } = {}) {
  const actions = new Map<string, MessageAction>();
  const sent: { channel: string; data: DataPayload; target: unknown }[] = [];
  const joins: {
    config: JoinRoomConfig;
    roomId: string;
    callbacks: JoinRoomCallbacks | undefined;
  }[] = [];
  let left = false;
  const room = {
    makeAction(namespace: string) {
      const action: MessageAction = {
        send(data, sendOptions) {
          sent.push({ channel: namespace, data, target: sendOptions?.target });
          return options.sendFails === true
            ? Promise.reject(new Error("peer gone"))
            : Promise.resolve();
        },
        onMessage: null,
        onReceiveProgress: null,
        onReceive: null,
      };
      actions.set(namespace, action);
      return action;
    },
    leave() {
      left = true;
      return Promise.resolve();
    },
    onPeerJoin: null as Room["onPeerJoin"],
    onPeerLeave: null as Room["onPeerLeave"],
  };
  const joinRoom = (config: JoinRoomConfig, roomId: string, callbacks?: JoinRoomCallbacks) => {
    joins.push({ config, roomId, callbacks });
    return room as unknown as Room;
  };
  /** Each relay's socket state, as the test sets it: 1 is open. */
  const sockets: Record<string, { readyState: number }> = {};
  const deps: TrysteroDeps = {
    joinRoom,
    selfId: "me",
    relaySockets: () => sockets,
    turnConfig: () => options.turn,
  };
  return {
    joinRoom,
    deps,
    sockets,
    joins,
    sent,
    room,
    get left() {
      return left;
    },
    /** A message from `peerId` on `channel`, as Trystero hands it over. */
    receive(channel: Channel, data: DataPayload, peerId: string) {
      void actions.get(channel)?.onMessage?.(data, { peerId });
    },
    actions,
  };
}

describe("what the relays see of a lobby key (#1681, ADR-0043)", () => {
  const KEY = "ACDE-FGHJ-KMNP";

  async function digests(text: string): Promise<string[]> {
    const bytes = new TextEncoder().encode(text);
    return Promise.all(
      (["SHA-1", "SHA-256"] as const).map(async (algorithm) =>
        Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      ),
    );
  }

  it("is nothing of the key: not it, not normalised, not its sha1 or sha256", async () => {
    const fake = fakeRoom();
    joinTrysteroRoom(await deriveLobbyRoom(KEY), fake.deps);
    const [join] = fake.joins;
    // Every argument Trystero was given, the config's password included.
    const seen = JSON.stringify(join).toLowerCase();
    const forms = [KEY, "ACDEFGHJKMNP"];
    const secrets = [...forms, ...(await Promise.all(forms.map(digests))).flat()];
    for (const secret of secrets) {
      expect(seen).not.toContain(secret.toLowerCase());
    }
    expect(join?.roomId).toMatch(/^[0-9a-f]{64}$/);
    expect(join?.config.password).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the Trystero transport (#392)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes an action for every channel up front", () => {
    const fake = fakeRoom();
    joinTrysteroRoom(ROOM, fake.deps);
    expect([...fake.actions.keys()]).toEqual([...CHANNELS]);
  });

  it("joins the room with the app id, its password, size cap and relays", () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    expect(transport.selfId).toBe("me");
    expect(fake.joins).toHaveLength(1);
    const [join] = fake.joins;
    expect(join?.roomId).toBe("a7");
    expect(join?.config).toMatchObject({
      appId: APP_ID,
      password: "kq",
      maxReceiveBytes: MAX_RECEIVE_BYTES,
      relayConfig: { urls: [...NOSTR_RELAYS], redundancy: RELAY_REDUNDANCY },
    });
  });

  it("passes a saved TURN relay as Trystero's turnConfig, and none without one (#972)", () => {
    const turn: TurnConfig = {
      urls: ["turn:turn.example:3478", "turns:turn.example:5349"],
      username: "ana",
      credential: "s3cret",
    };
    const relayed = fakeRoom({ turn });
    joinTrysteroRoom(ROOM, relayed.deps);
    expect(relayed.joins[0]?.config.turnConfig).toEqual([
      { urls: [...turn.urls], username: "ana", credential: "s3cret" },
    ]);
    // Trystero's STUN stays: no rtcConfig replaces its ICE servers.
    expect(relayed.joins[0]?.config.rtcConfig).toBeUndefined();

    const direct = fakeRoom();
    joinTrysteroRoom(ROOM, direct.deps);
    expect(direct.joins[0]?.config).not.toHaveProperty("turnConfig");
  });

  it("fans one channel out to every handler, and stops calling a removed one", () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    const got: string[] = [];
    transport.on("intent", (data, from) => got.push(`first ${String(data)} ${from}`));
    const off = transport.on("intent", (data, from) => got.push(`second ${String(data)} ${from}`));
    fake.receive("intent", 1, "peer");
    off();
    fake.receive("intent", 2, "peer");
    fake.receive("snapshot", 3, "peer");
    expect(got).toEqual(["first 1 peer", "second 1 peer", "first 2 peer"]);
  });

  it("drops a message over MAX_MESSAGE_BYTES before any handler sees it (#403)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    const got: unknown[] = [];
    transport.on("intent", (data) => got.push(data));
    fake.receive("intent", "x".repeat(MAX_MESSAGE_BYTES), "peer");
    fake.receive("intent", "small", "peer");
    expect(got).toEqual(["small"]);
  });

  it("fans joins and leaves out to every handler", () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    const seen: string[] = [];
    transport.onPeerJoin((id) => seen.push(`+${id}`));
    const off = transport.onPeerJoin((id) => seen.push(`again +${id}`));
    transport.onPeerLeave((id) => seen.push(`-${id}`));
    fake.room.onPeerJoin?.("a");
    off();
    fake.room.onPeerJoin?.("b");
    fake.room.onPeerLeave?.("a");
    expect(seen).toEqual(["+a", "again +a", "+b", "-a"]);
  });

  it("sends to one peer with `to`, and to all without", () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    transport.send("intent", { kind: "stop" }, "peer");
    transport.send("snapshot", { tick: 1 });
    expect(fake.sent).toEqual([
      { channel: "intent", data: { kind: "stop" }, target: "peer" },
      { channel: "snapshot", data: { tick: 1 }, target: null },
    ]);
  });

  it("sends a list in one send, and an empty list not at all", () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    transport.send("snapshot", { tick: 1 }, ["a", "b"]);
    transport.send("snapshot", { tick: 2 }, []);
    expect(fake.sent).toEqual([{ channel: "snapshot", data: { tick: 1 }, target: ["a", "b"] }]);
  });

  it("swallows a send that fails, with a warning naming the channel and target", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = fakeRoom({ sendFails: true });
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    expect(() => transport.send("intent", 1, "peer")).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual(expect.arrayContaining(["intent", "peer"]) as unknown[]);
  });

  it("warns on a join error and does not retry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = fakeRoom();
    joinTrysteroRoom(ROOM, fake.deps);
    fake.joins[0]?.callbacks?.onJoinError?.({
      error: "incorrect password",
      appId: APP_ID,
      roomId: ROOM.roomId,
      peerId: "peer",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fake.joins).toHaveLength(1);
  });

  it("says peer-unreachable when SDP was exchanged and nothing connected, not for a password (#707)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    const troubles: string[] = [];
    transport.onTrouble((trouble) => troubles.push(trouble));
    const joinError = (error: string) => {
      fake.joins[0]?.callbacks?.onJoinError?.({
        error,
        appId: APP_ID,
        roomId: ROOM.roomId,
        peerId: "p",
      });
    };
    joinError("incorrect password for overlapping room");
    expect(troubles).toEqual([]);
    joinError(
      "could not connect to peer p after exchanging SDP; configure TURN servers with turnConfig or rtcConfig.iceServers",
    );
    expect(troubles).toEqual(["peer-unreachable"]);
  });

  it("says no-relay when no relay socket is open at the check and nobody was met (#707)", async () => {
    vi.useFakeTimers();
    try {
      /** What a transport says by the check, its fake set up by `setUp`. */
      const said = (setUp: (fake: ReturnType<typeof fakeRoom>) => void): string[] => {
        const fake = fakeRoom();
        const transport = joinTrysteroRoom(ROOM, fake.deps);
        const troubles: string[] = [];
        transport.onTrouble((trouble) => troubles.push(trouble));
        setUp(fake);
        vi.advanceTimersByTime(RELAY_CHECK_MS);
        return troubles;
      };
      const closed = { readyState: 3 };
      const open = { readyState: 1 };
      expect(
        said((fake) => {
          fake.sockets["wss://a"] = closed;
        }),
      ).toEqual(["no-relay"]);
      expect(
        said((fake) => {
          fake.sockets["wss://a"] = closed;
          fake.sockets["wss://b"] = open;
        }),
      ).toEqual([]);
      expect(
        said((fake) => {
          fake.room.onPeerJoin?.("host");
        }),
      ).toEqual([]);

      // Left before the check: nothing is said.
      const fake = fakeRoom();
      const transport = joinTrysteroRoom(ROOM, fake.deps);
      const troubles: string[] = [];
      transport.onTrouble((trouble) => troubles.push(trouble));
      await transport.leave();
      vi.advanceTimersByTime(RELAY_CHECK_MS);
      expect(troubles).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the room and delivers nothing after leave()", async () => {
    const fake = fakeRoom();
    const transport = joinTrysteroRoom(ROOM, fake.deps);
    const got: unknown[] = [];
    transport.on("intent", (data) => got.push(data));
    transport.onPeerJoin((id) => got.push(`+${id}`));
    transport.onPeerLeave((id) => got.push(`-${id}`));
    await transport.leave();
    expect(fake.left).toBe(true);
    fake.receive("intent", 1, "peer");
    fake.room.onPeerJoin?.("b");
    fake.room.onPeerLeave?.("b");
    expect(got).toEqual([]);
  });
});

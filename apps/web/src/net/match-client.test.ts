import type { ClientIntent, MapDescriptor } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";
import type { CombatMessage } from "@vibewars/game-session";

import {
  createMatchConnection,
  endpointFromLocation,
  httpOriginFrom,
  professionFrom,
  resolveEndpoint,
  type DecodedMatchState,
  type DecodedPlayer,
  type LiveMatchRoom,
} from "./match-client.js";

describe("endpointFromLocation", () => {
  it("uses ws:// for http pages", () => {
    expect(endpointFromLocation({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173",
    );
  });

  it("uses wss:// for https pages, so a TLS-terminated LAN host still works", () => {
    expect(endpointFromLocation({ protocol: "https:", host: "vibewars.local" })).toBe(
      "wss://vibewars.local",
    );
  });

  it("preserves a non-default port", () => {
    expect(endpointFromLocation({ protocol: "http:", host: "192.168.1.50:2567" })).toBe(
      "ws://192.168.1.50:2567",
    );
  });
});

describe("resolveEndpoint", () => {
  const page = { protocol: "http:", host: "localhost:5173" } as const;

  it("uses the page's own origin when there is no override", () => {
    // Production: the server serves the client, so same-origin is right
    // and nothing has to be configured on a LAN host.
    expect(resolveEndpoint(page, undefined)).toBe("ws://localhost:5173");
  });

  it("uses the override when one is set", () => {
    // `pnpm run dev`: Vite serves the client on 5173, the game is on 2567.
    expect(resolveEndpoint(page, "ws://localhost:2567")).toBe("ws://localhost:2567");
  });

  it("ignores a blank override rather than connecting to nowhere", () => {
    // An env var defined-but-empty is a very easy mistake to make in a
    // shell script, and it must not produce an empty endpoint.
    expect(resolveEndpoint(page, "")).toBe("ws://localhost:5173");
    expect(resolveEndpoint(page, "   ")).toBe("ws://localhost:5173");
  });
});

describe("httpOriginFrom", () => {
  it("maps a websocket endpoint to the same server over http", () => {
    expect(httpOriginFrom("ws://localhost:2567")).toBe("http://localhost:2567");
    expect(httpOriginFrom("wss://vibewars.local")).toBe("https://vibewars.local");
  });

  it("only rewrites the scheme, not a host that happens to start with ws", () => {
    expect(httpOriginFrom("ws://ws-host:2567")).toBe("http://ws-host:2567");
  });
});

/** A Colyseus room without a socket: the test plays the SDK's part. */
class FakeRoom implements LiveMatchRoom {
  readonly sessionId = "me";
  state: DecodedMatchState = {
    players: new Map(),
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: -1,
    endReason: "",
    projectiles: [],
  };
  readonly reconnection = { minUptime: 5000 };
  readonly sent: ClientIntent[] = [];
  left = false;
  private gone = false;
  private readonly messages = new Map<string, ((message: unknown) => void)[]>();
  private readonly drops: ((code: number) => void)[] = [];
  private readonly reconnects: (() => void)[] = [];
  private readonly leaves: ((code: number) => void)[] = [];

  send(_type: "intent", payload: ClientIntent): void {
    this.sent.push(payload);
  }
  onMessage(type: string, callback: (message: never) => void): void {
    const handlers = this.messages.get(type) ?? [];
    handlers.push(callback as (message: unknown) => void);
    this.messages.set(type, handlers);
  }
  onDrop(callback: (code: number) => void): void {
    this.drops.push(callback);
  }
  onReconnect(callback: () => void): void {
    this.reconnects.push(callback);
  }
  onLeave(callback: (code: number) => void): void {
    this.leaves.push(callback);
  }
  leave(): Promise<void> {
    if (this.gone) {
      // As the SDK: its listeners are dropped once the room has left, so
      // this leave is never answered.
      return new Promise(() => undefined);
    }
    this.left = true;
    this.emitLeave(4000);
    return Promise.resolve();
  }

  emit(type: string, message: unknown): void {
    for (const handler of this.messages.get(type) ?? []) handler(message);
  }
  emitDrop(code: number): void {
    for (const handler of this.drops) handler(code);
  }
  emitReconnect(): void {
    for (const handler of this.reconnects) handler();
  }
  emitLeave(code: number): void {
    for (const handler of this.leaves) handler(code);
    this.gone = true;
  }
}

const MAP: MapDescriptor = { id: "test", name: "Test", width: 10, height: 10, walls: [] };

function connect(): {
  room: FakeRoom;
  states: string[];
  connection: ReturnType<typeof createMatchConnection>;
} {
  const room = new FakeRoom();
  const connection = createMatchConnection(room, MAP, { slots: [], ranks: {} }, () => []);
  const states: string[] = [];
  connection.onConnectionChange((state) => states.push(state));
  return { room, states, connection };
}

describe("createMatchConnection", () => {
  it("lets the SDK retry a drop right after joining, not only after 5 s", () => {
    expect(connect().room.reconnection.minUptime).toBe(0);
  });

  it("says reconnecting on a drop and online once the SDK is back in", () => {
    const { room, states } = connect();
    room.emitDrop(1006);
    room.emitReconnect();
    expect(states).toEqual(["reconnecting", "online"]);
  });

  it("keeps the match live after a reconnect: state, intents and messages", () => {
    // The SDK reconnects the same room in place (#181), so nothing this
    // connection holds may be swapped out or registered again.
    const { room, connection } = connect();
    const combats: CombatMessage[] = [];
    connection.onCombat((message) => combats.push(message));

    room.emitDrop(1006);
    room.emitReconnect();
    room.state = { ...room.state, elapsedSeconds: 42 };
    room.emit("combat", { entries: [{ casterSessionId: "x", skillId: "s", events: [] }] });
    connection.sendIntent({ kind: "stop" });

    expect(connection.getSnapshot().elapsedSeconds).toBe(42);
    expect(combats).toHaveLength(1);
    expect(room.sent).toEqual([{ kind: "stop" }]);
  });

  it("notices a second drop", () => {
    const { room, states } = connect();
    room.emitDrop(1006);
    room.emitReconnect();
    room.emitDrop(1006);
    expect(states).toEqual(["reconnecting", "online", "reconnecting"]);
  });

  it("says lost once the SDK stops retrying", () => {
    const { room, states } = connect();
    room.emitDrop(1006);
    room.emitLeave(4003);
    expect(states).toEqual(["reconnecting", "lost"]);
  });

  it("disconnects at once from a room that is already lost (#195)", async () => {
    const { room, connection } = connect();
    room.emitLeave(4003);
    await connection.disconnect();
    expect(room.left).toBe(false);
  });

  it("says nothing when the player leaves on purpose", async () => {
    const { room, states, connection } = connect();
    await connection.disconnect();
    expect(room.left).toBe(true);
    expect(states).toEqual([]);
  });
});

describe("the off-hand on the wire (#276)", () => {
  const offhandOf = (offhandId: string) => {
    const room = new FakeRoom();
    const player: DecodedPlayer = {
      sessionId: "me",
      name: "me",
      x: 0,
      y: 0,
      facing: 0,
      targetSessionId: "",
      attackTargetSessionId: "",
      walking: false,
      health: 500,
      maxHealth: 500,
      energy: 20,
      maxEnergy: 20,
      adrenaline: 0,
      armor: 60,
      weaponId: "sword",
      offhandId,
      primaryProfession: "",
      secondaryProfession: "",
      team: 0,
      dead: false,
      castingSkillId: "",
      castRemaining: 0,
      castTotal: 0,
      statuses: [],
    };
    room.state = { ...room.state, players: new Map([["me", player]]) };
    return createMatchConnection(room, MAP, { slots: [], ranks: {} }, () => []).getSnapshot()
      .players[0]?.offhandId;
  };

  it("maps none to undefined, a known off-hand to itself, and an unknown one to undefined", () => {
    expect(offhandOf("")).toBeUndefined();
    expect(offhandOf("shield")).toBe("shield");
    expect(offhandOf("focus")).toBe("focus");
    expect(offhandOf("bogus")).toBeUndefined();
  });
});

describe("professionFrom (#281)", () => {
  it("reads a known profession, and none for empty or unknown", () => {
    expect(professionFrom("monk")).toBe("monk");
    expect(professionFrom("")).toBeUndefined();
    expect(professionFrom("bogus")).toBeUndefined();
  });
});

describe("a tick's combat batch (#288)", () => {
  const entry = (casterSessionId: string): CombatMessage => ({
    casterSessionId,
    cause: "skill",
    skillId: "s",
    weaponId: "",
    events: [{ kind: "damage", targetId: "t", amount: 10 }],
  });

  it("hands each entry to the handler, in order", () => {
    const { room, connection } = connect();
    const seen: string[] = [];
    connection.onCombat((message) => seen.push(message.casterSessionId));

    room.emit("combat", { entries: [entry("a"), entry("b"), entry("c")] });

    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("drops a malformed batch without throwing", () => {
    const { room, connection } = connect();
    const seen: CombatMessage[] = [];
    connection.onCombat((message) => seen.push(message));

    for (const malformed of [{}, { entries: 5 }, null, "combat"]) {
      expect(() => {
        room.emit("combat", malformed);
      }).not.toThrow();
    }
    expect(seen).toEqual([]);
  });
});

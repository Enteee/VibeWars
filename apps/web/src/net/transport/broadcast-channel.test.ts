import { MAX_MESSAGE_BYTES, type LobbyRoom } from "@vibewars/game-session";
import { transportContract } from "@vibewars/game-session/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  HEARTBEAT_MS,
  joinBroadcastRoom,
  parseFrame,
  PEER_TIMEOUT_MS,
} from "./broadcast-channel.js";
import { APP_ID } from "./relays.js";

/** A real-timer wait long enough for every posted frame to land. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

let rooms = 0;

/** A room id no other case shares, so cases never hear each other. */
function freshCode(): string {
  return `test${String(++rooms)}`;
}

/** The room `roomId` names; a BroadcastChannel reads nothing else of it. */
const roomOf = (roomId: string): LobbyRoom => ({
  roomId,
  password: "unused",
  proofKey: null,
  relay: null,
});

/** Frames posted on each channel name, by every channel the transport opens. */
const posted = new Map<string, number>();

class CountingChannel extends BroadcastChannel {
  override postMessage(message: unknown): void {
    posted.set(this.name, (posted.get(this.name) ?? 0) + 1);
    super.postMessage(message);
  }
}

/** How long a drained room must stay silent before `settle` resolves. */
const QUIET_MS = 50;
/** The longest `settle` waits: a room that never drains fails its case, not the run. */
const SETTLE_CAP_MS = 5000;

const observers: BroadcastChannel[] = [];

transportContract(
  "BroadcastChannel",
  () => {
    const code = freshCode();
    const name = `${APP_ID}:${code}`;
    // Sees every frame any peer posts, so it can tell when the backlog of
    // a burst has landed. Node drains a backlog over many loop turns, so
    // a fixed sleep would race it on a slow runner.
    const observer = new BroadcastChannel(name);
    observers.push(observer);
    let received = 0;
    let lastFrameAt = performance.now();
    observer.onmessage = () => {
      received++;
      lastFrameAt = performance.now();
    };
    return {
      join: () => joinBroadcastRoom(roomOf(code), crypto.randomUUID()),
      async settle() {
        const start = performance.now();
        for (;;) {
          await new Promise<void>((resolve) => setTimeout(resolve, QUIET_MS / 5));
          const now = performance.now();
          const drained = received === (posted.get(name) ?? 0) && now - lastFrameAt >= QUIET_MS;
          if (drained || now - start >= SETTLE_CAP_MS) return;
        }
      },
    };
  },
  { describe, it, expect },
);

beforeAll(() => {
  vi.stubGlobal("BroadcastChannel", CountingChannel);
});

afterEach(() => {
  for (const observer of observers.splice(0)) observer.close();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the BroadcastChannel transport (#392)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the app id and the room id in the channel name (#1681)", async () => {
    const raw = new BroadcastChannel(`${APP_ID}:a7kq`);
    const got: unknown[] = [];
    raw.onmessage = (event: MessageEvent<unknown>) => got.push(event.data);
    const peer = joinBroadcastRoom(roomOf("a7kq"), crypto.randomUUID());
    await settle();
    expect(got).toEqual([{ kind: "hello", from: peer.selfId }]);
    await peer.leave();
    raw.close();
  });

  it("drops a malformed frame and delivers the well-formed one after it", async () => {
    const code = freshCode();
    const peer = joinBroadcastRoom(roomOf(code), crypto.randomUUID());
    const got: unknown[] = [];
    peer.on("intent", (data) => got.push(data));
    const raw = new BroadcastChannel(`${APP_ID}:${code}`);
    raw.postMessage("junk");
    raw.postMessage({ kind: "msg", from: "x", to: null, channel: "no-such", data: 1 });
    raw.postMessage({ kind: "msg", from: 7, to: null, channel: "intent", data: 2 });
    raw.postMessage({ kind: "msg", from: "x", to: null, channel: "intent", data: 3 });
    await settle();
    expect(got).toEqual([3]);
    await peer.leave();
    raw.close();
  });

  it("drops a message over MAX_MESSAGE_BYTES before anything reads it (#403)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const code = freshCode();
    const peer = joinBroadcastRoom(roomOf(code), crypto.randomUUID());
    const got: unknown[] = [];
    peer.on("intent", (data) => got.push(data));
    const raw = new BroadcastChannel(`${APP_ID}:${code}`);
    const big = "x".repeat(MAX_MESSAGE_BYTES);
    raw.postMessage({ kind: "msg", from: "x", to: null, channel: "intent", data: big });
    raw.postMessage({ kind: "msg", from: "x", to: null, channel: "intent", data: "small" });
    await settle();
    expect(got).toEqual(["small"]);
    await peer.leave();
    raw.close();
  });

  it("counts a message from an unknown peer as its join, first", async () => {
    const code = freshCode();
    const peer = joinBroadcastRoom(roomOf(code), crypto.randomUUID());
    const seen: unknown[] = [];
    peer.onPeerJoin((id) => seen.push(`+${id}`));
    peer.on("intent", (data) => seen.push(data));
    const raw = new BroadcastChannel(`${APP_ID}:${code}`);
    raw.postMessage({ kind: "msg", from: "x", to: null, channel: "intent", data: "hi" });
    await settle();
    expect(seen).toEqual(["+x", "hi"]);
    await peer.leave();
    raw.close();
  });

  it("ignores a message addressed to another peer", async () => {
    const code = freshCode();
    const peer = joinBroadcastRoom(roomOf(code), crypto.randomUUID());
    const got: unknown[] = [];
    peer.on("intent", (data) => got.push(data));
    peer.onPeerJoin((id) => got.push(`+${id}`));
    const raw = new BroadcastChannel(`${APP_ID}:${code}`);
    raw.postMessage({ kind: "msg", from: "x", to: "someone-else", channel: "intent", data: 1 });
    await settle();
    expect(got).toEqual([]);
    await peer.leave();
    raw.close();
  });

  it("sees a peer leave once it has been silent for 3 s, as a killed page is", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const code = freshCode();
    const peer = joinBroadcastRoom(roomOf(code), crypto.randomUUID());
    const seen: string[] = [];
    peer.onPeerJoin((id) => seen.push(`+${id}`));
    peer.onPeerLeave((id) => seen.push(`-${id}`));
    const raw = new BroadcastChannel(`${APP_ID}:${code}`);
    raw.postMessage({ kind: "hello", from: "doomed" });
    await settle();
    vi.advanceTimersByTime(PEER_TIMEOUT_MS - HEARTBEAT_MS);
    expect(seen).toEqual(["+doomed"]);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(seen).toEqual(["+doomed", "-doomed"]);
    vi.advanceTimersByTime(PEER_TIMEOUT_MS);
    expect(seen).toEqual(["+doomed", "-doomed"]);
    await peer.leave();
    raw.close();
  });

  it("keeps a peer that goes on saying hello", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const code = freshCode();
    const [a, b] = [
      joinBroadcastRoom(roomOf(code), crypto.randomUUID()),
      joinBroadcastRoom(roomOf(code), crypto.randomUUID()),
    ];
    const seen: string[] = [];
    a.onPeerLeave((id) => seen.push(`-${id}`));
    for (let beat = 0; beat < 5; beat++) {
      vi.advanceTimersByTime(HEARTBEAT_MS);
      await settle();
    }
    expect(seen).toEqual([]);
    await b.leave();
    await settle();
    expect(seen).toEqual([`-${b.selfId}`]);
    await a.leave();
  });

  it("parses each frame kind and refuses the rest", () => {
    expect(parseFrame({ kind: "hello", from: "a", extra: 1 })).toEqual({
      kind: "hello",
      from: "a",
    });
    expect(parseFrame({ kind: "hello-back", from: "a", to: "b" })).toEqual({
      kind: "hello-back",
      from: "a",
      to: "b",
    });
    expect(parseFrame({ kind: "hello-back", from: "a" })).toBeUndefined();
    expect(parseFrame({ kind: "bye", from: "a" })).toEqual({ kind: "bye", from: "a" });
    expect(parseFrame({ kind: "msg", from: "a", channel: "intent", data: 1 })).toBeUndefined();
    expect(parseFrame({ kind: "wave", from: "a" })).toBeUndefined();
    expect(parseFrame(null)).toBeUndefined();
  });
});

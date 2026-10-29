/**
 * A `Transport` between tabs of one browser (#392): e2e and local play,
 * with no relay and no WebRTC.
 *
 * Every tab must share one origin, and in Playwright one `BrowserContext`:
 * a `BroadcastChannel` reaches nothing outside it.
 *
 * Peers find each other by `hello`, sent on join and every second after.
 * One silent for `PEER_TIMEOUT_MS` counts as gone, so a killed page is
 * noticed even though it never said `bye`.
 */
import { CHANNELS, normalizeLobbyCode } from "@vibewars/game-protocol";
import type { Channel } from "@vibewars/game-protocol";
import type { Transport } from "@vibewars/game-session";

import { HandlerSets } from "./handler-sets.js";
import { oversizedCheck } from "./oversized.js";
import { APP_ID } from "./relays.js";

export const HEARTBEAT_MS = 1000;
export const PEER_TIMEOUT_MS = 3000;

type Frame =
  | { kind: "hello"; from: string }
  | { kind: "hello-back"; from: string; to: string }
  | { kind: "msg"; from: string; to: string | null; channel: Channel; data: unknown }
  | { kind: "bye"; from: string };

function isChannel(value: unknown): value is Channel {
  return (CHANNELS as readonly unknown[]).includes(value);
}

/** `raw` as a `Frame`, or `undefined` if it is anything else. */
export function parseFrame(raw: unknown): Frame | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const frame = raw as Record<string, unknown>;
  const { kind, from, to } = frame;
  if (typeof from !== "string") {
    return undefined;
  }
  switch (kind) {
    case "hello":
    case "bye":
      return { kind, from };
    case "hello-back":
      return typeof to === "string" ? { kind, from, to } : undefined;
    case "msg":
      return (typeof to === "string" || to === null) && isChannel(frame.channel)
        ? { kind, from, to, channel: frame.channel, data: frame.data }
        : undefined;
    default:
      return undefined;
  }
}

export function joinBroadcastRoom(code: string): Transport {
  const selfId = crypto.randomUUID();
  const channel = new BroadcastChannel(`${APP_ID}:${normalizeLobbyCode(code)}`);
  const handlers = new HandlerSets();
  /** Each peer seen, and when it was last heard from. */
  const peers = new Map<string, number>();
  let left = false;

  function post(frame: Frame): void {
    if (left) {
      return;
    }
    try {
      channel.postMessage(frame);
    } catch (error) {
      console.warn("broadcast transport: could not send", frame.kind, error);
    }
  }

  /** Note that `peerId` was heard from, and tell the handlers if it is new. */
  function heard(peerId: string): boolean {
    const known = peers.has(peerId);
    peers.set(peerId, Date.now());
    if (!known) {
      handlers.joined(peerId);
    }
    return !known;
  }

  const oversized = oversizedCheck("broadcast transport");

  function gone(peerId: string): void {
    if (peers.delete(peerId)) {
      handlers.left(peerId);
    }
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    const frame = parseFrame(event.data);
    if (frame === undefined || frame.from === selfId) {
      return;
    }
    switch (frame.kind) {
      case "hello":
        if (heard(frame.from)) {
          post({ kind: "hello-back", from: selfId, to: frame.from });
        }
        return;
      case "hello-back":
        if (frame.to === selfId) {
          heard(frame.from);
        }
        return;
      case "msg":
        if (frame.to === null || frame.to === selfId) {
          heard(frame.from);
          if (!oversized(frame.data, frame.from)) {
            handlers.message(frame.channel, frame.data, frame.from);
          }
        }
        return;
      case "bye":
        gone(frame.from);
        return;
    }
  };

  const heartbeat = setInterval(() => {
    post({ kind: "hello", from: selfId });
    const now = Date.now();
    for (const [peerId, seen] of [...peers]) {
      if (now - seen >= PEER_TIMEOUT_MS) {
        gone(peerId);
      }
    }
  }, HEARTBEAT_MS);

  const onPageHide = () => {
    void transport.leave();
  };
  // Absent under Node, where the contract tests run this transport.
  if (typeof addEventListener === "function") {
    addEventListener("pagehide", onPageHide);
  }

  const transport: Transport = {
    selfId,
    send(on, data, to) {
      for (const target of typeof to === "object" ? to : [to ?? null]) {
        post({ kind: "msg", from: selfId, to: target, channel: on, data });
      }
    },
    on: (on, handler) => handlers.on(on, handler),
    onPeerJoin: (handler) => handlers.onPeerJoin(handler),
    onPeerLeave: (handler) => handlers.onPeerLeave(handler),
    // One browser, no network: nothing to have trouble with.
    onTrouble: (handler) => handlers.onTrouble(handler),
    leave() {
      if (!left) {
        post({ kind: "bye", from: selfId });
        left = true;
        clearInterval(heartbeat);
        channel.close();
        handlers.clear();
        peers.clear();
        if (typeof removeEventListener === "function") {
          removeEventListener("pagehide", onPageHide);
        }
      }
      return Promise.resolve();
    },
  };

  post({ kind: "hello", from: selfId });
  return transport;
}

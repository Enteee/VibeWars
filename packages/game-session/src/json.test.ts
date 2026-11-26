import type {
  PeerHello,
  PeerWelcome,
  WireCombatBatch,
  WireSnapshotPart,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { createMemoryNetwork } from "./memory-transport.js";

declare const welcome: PeerWelcome;
declare const hello: PeerHello;
declare const snapshot: WireSnapshotPart;
declare const combat: WireCombatBatch;

/**
 * `Transport.send` takes plain JSON only (#16), and every wire message is
 * plain JSON. Checked by the compiler: each `@ts-expect-error` is a send
 * that must not compile.
 */
describe("Transport.send's JSON check", () => {
  it("takes every wire message, and refuses what JSON cannot carry", () => {
    const peer = createMemoryNetwork().join();
    const sendAll = (): void => {
      peer.send("welcome", welcome);
      peer.send("hello", hello);
      peer.send("snapshot", snapshot);
      peer.send("combat", combat);
      peer.send("intent", { kind: "move", dirX: 1, dirY: 0 });
      peer.send("intent", null);
      // @ts-expect-error: undefined does not survive JSON
      peer.send("intent", { kind: "stop", extra: undefined });
      // @ts-expect-error: nor does a Map
      peer.send("intent", new Map<string, number>());
      // @ts-expect-error: nor a function
      peer.send("intent", () => 1);
    };
    expect(sendAll).toBeTypeOf("function");
  });
});

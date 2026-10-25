import { createServer, type Server as HttpServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { DEFAULT_MAX_CLIENTS } from "../config.js";

/**
 * Pick a free TCP port by binding an ephemeral listener and releasing it.
 *
 * Tests must not collide on a fixed port when run in parallel, and Colyseus
 * needs the port number *before* it starts listening.
 */
export async function findFreePort(): Promise<number> {
  const probe: HttpServer = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (address === null || typeof address === "string") {
    probe.close();
    throw new Error("Expected an AddressInfo from the probe server");
  }
  const { port } = address satisfies AddressInfo;
  await new Promise<void>((resolve, reject) => {
    probe.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  return port;
}

/**
 * Resolve once `predicate` holds, or reject after `timeoutMs`.
 *
 * Joining a Colyseus room resolves as soon as the WebSocket handshake
 * completes — the first state patch is a separate, slightly later message.
 * So `predicate` routinely reads through a path that does not exist yet
 * (e.g. `room.state.members.size` before `members` has decoded), and a
 * predicate that throws must be treated the same as one that returns false
 * rather than aborting the whole wait.
 */
export async function waitFor(
  predicate: () => boolean,
  {
    timeoutMs = 4000,
    intervalMs = 20,
    label = "condition",
  }: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (predicate()) {
        return;
      }
    } catch {
      // Not ready yet; keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${String(timeoutMs)}ms waiting for ${label}`);
}

/**
 * Seat limits for a test server, whose every client comes from
 * 127.0.0.1 (#265): the server-wide cap as deployed, and per-address caps
 * no test of ordinary play can meet. The caps themselves are tested in
 * `network-robustness.test.ts`.
 */
export const LOOPBACK_LIMITS = {
  maxClients: DEFAULT_MAX_CLIENTS,
  maxClientsPerAddress: 10_000,
  matchmakingBurst: 10_000,
} as const;

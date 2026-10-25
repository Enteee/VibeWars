import { Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";

import { matchMaker } from "colyseus";
import { RATE_LIMIT, RATE_LIMIT_MESSAGE } from "@vibewars/game-protocol";

import type { ClientLimits } from "./rooms/client-budget.js";
import { MessageBudget } from "./rooms/message-budget.js";

/**
 * Delete the headers Colyseus 0.18 reads a client's address from before
 * the socket's own (`resolveClientIp`), so `context.ip` is always the
 * socket's. We run behind no proxy (ADR-0009), so the client writes them:
 * believed, they would let it dodge a per-address cap with a new address
 * each time, or fill a victim's share by naming the victim (#265).
 */
function stripForwardingHeaders(req: IncomingMessage): void {
  delete req.headers["x-real-ip"];
  delete req.headers["x-forwarded-for"];
  delete req.headers["x-client-ip"];
}

/** The matchmaking calls that reserve a seat, and may create a room. */
const SEAT_RESERVING = /^\/matchmake\/(?:joinOrCreate|create|join|joinById)\//;

/** Matchmaking requests one address gets back each second (#265). */
export const MATCHMAKING_PER_SECOND = 1;

/** How often refilled buckets are forgotten, at most. */
const FORGET_EVERY_MS = 10_000;

/**
 * The HTTP server under Colyseus, which sees every request and upgrade
 * before any listener does.
 *
 * Colyseus adds its own matchmaking listener with `prependListener` once
 * the server listens, so a listener of ours could never be sure to run
 * first. Overriding `emit` is: it is what calls the listeners.
 */
export class GatedHttpServer extends HttpServer {
  readonly #matchmaking: MessageBudget;
  readonly #addressKey: ClientLimits["addressKey"];
  #forgotAt = 0;

  /**
   * @param matchmakingBurst how many matchmaking requests one address may
   *   make at once; it gets `MATCHMAKING_PER_SECOND` back each second
   * @param addressKey the key a request's address is counted under, the
   *   one the seat limits use (#271)
   */
  public constructor(matchmakingBurst: number, addressKey: ClientLimits["addressKey"]) {
    super();
    this.#addressKey = addressKey;
    this.#matchmaking = new MessageBudget(
      MATCHMAKING_PER_SECOND,
      matchmakingBurst,
      (address, refused) => {
        console.warn(
          `[http] refused ${String(refused)} matchmaking requests from ${address}: over its budget`,
        );
      },
    );
  }

  public override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (event === "request" || event === "upgrade") {
      const req = args[0] as IncomingMessage;
      stripForwardingHeaders(req);
      if (event === "request" && !this.#admit(req)) {
        refuse(args[1] as ServerResponse, req);
        return true;
      }
    }
    return super.emit(event, ...args);
  }

  /**
   * Whether a request is within its address's matchmaking budget. Checked
   * here, before Colyseus reads the body, because a request that is let
   * through creates a room and reserves a seat whether or not a socket
   * ever connects for it.
   */
  #admit(req: IncomingMessage): boolean {
    // The path the way Colyseus routes it: an absolute-form target such
    // as `POST http://x/matchmake/create/lobby` reaches the router as
    // `/matchmake/create/lobby`, so it must reach the bucket so too.
    if (req.method !== "POST" || !SEAT_RESERVING.test(routedPath(req.url))) {
      return true;
    }
    const now = performance.now();
    if (now - this.#forgotAt >= FORGET_EVERY_MS) {
      this.#matchmaking.forgetRefilled(now);
      this.#forgotAt = now;
    }
    return this.#matchmaking.take(this.#addressKey(req.socket.remoteAddress), now);
  }
}

/** The path Colyseus's router matches `url` on (`router/node.mjs`). */
function routedPath(url: string | undefined): string {
  try {
    return new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    // Not a URL Colyseus could route either.
    return "/";
  }
}

/**
 * Answer the way matchmaking answers a refused request, so the client
 * reads `code` from it like any other: the code as the status, and
 * `{ code, error }` as the body, with Colyseus's own CORS headers.
 */
function refuse(res: ServerResponse, req: IncomingMessage): void {
  const body = JSON.stringify({ code: RATE_LIMIT, error: RATE_LIMIT_MESSAGE });
  res.writeHead(RATE_LIMIT, {
    ...matchMaker.controller.DEFAULT_CORS_HEADERS,
    ...matchMaker.controller.getCorsHeaders(new Headers(headerPairs(req))),
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

/** A request's headers as name-value pairs, for `Headers`. */
function headerPairs(req: IncomingMessage): [string, string][] {
  return Object.entries(req.headers).flatMap(([name, value]): [string, string][] =>
    value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]],
  );
}

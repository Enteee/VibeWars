import { Room, type Client } from "colyseus";
import { schema, t } from "@colyseus/schema";
import type { MapSchema } from "@colyseus/schema";
import { PROTOCOL_VERSION, type ServerHello } from "@vibewars/game-protocol";

/**
 * Sprint 0 feasibility room.
 *
 * It exists to prove the Colyseus 0.18 join/leave lifecycle and state
 * synchronisation work end to end against our TypeScript configuration. It
 * deliberately contains **no** game logic: lobby semantics (codes, team slots,
 * readiness, map selection) arrive in Sprint 19, and the simulation in
 * Sprint 4. See `docs/adr/0002-networking.md`.
 */

/**
 * Schema 5's builder API is used rather than legacy decorators: decorators
 * would violate `erasableSyntaxOnly` in `tsconfig.base.json`, which we keep on
 * so that sources stay directly runnable by esbuild and `node --strip-types`.
 */
export const LobbyMember = schema(
  {
    sessionId: t.string(),
    /** Server-assigned display name. Never trusted from the client. */
    name: t.string(),
  },
  "LobbyMember",
);

export const LobbyState = schema(
  {
    protocolVersion: t.number().default(PROTOCOL_VERSION),
    members: t.map(LobbyMember),
  },
  "LobbyState",
);

/** How often, in Hz, the authoritative simulation will advance. */
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;

export class VibewarsLobbyRoom extends Room {
  public override state = new LobbyState();

  public override onCreate(): void {
    this.autoDispose = true;
  }

  public override onJoin(client: Client): void {
    this.state.members.set(
      client.sessionId,
      new LobbyMember({
        sessionId: client.sessionId,
        // Display names are assigned by the server. A client-supplied name
        // would be an unvalidated string on every other player's screen.
        name: `player-${client.sessionId.slice(0, 4)}`,
      }),
    );

    const hello: ServerHello = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: client.sessionId,
      tickIntervalMs: TICK_INTERVAL_MS,
    };
    client.send("hello", hello);

    console.info(
      `[lobby] join sessionId=${client.sessionId} size=${String(this.state.members.size)}`,
    );
  }

  public override onLeave(client: Client, code?: number): void {
    this.state.members.delete(client.sessionId);
    console.info(
      `[lobby] leave sessionId=${client.sessionId} code=${String(code ?? "none")} size=${String(this.state.members.size)}`,
    );
  }

  public override onDispose(): void {
    console.info("[lobby] disposed");
  }
}

// Keep the generated Schema classes' instance types nameable from other modules.
export type LobbyStateInstance = InstanceType<typeof LobbyState>;
export type LobbyMemberInstance = InstanceType<typeof LobbyMember>;

// `MapSchema` is part of the public state shape; re-exported so consumers do
// not need a direct @colyseus/schema dependency just to type a handler.
export type { MapSchema };

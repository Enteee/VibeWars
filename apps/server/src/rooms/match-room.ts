import { Room, type Client } from "colyseus";
import { schema, t } from "@colyseus/schema";
import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  ZERO,
  clampInputDirection,
  integrateMovement,
  resolveCircleSegmentCollision,
  vec2,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments, loadMap, type MapData } from "@vibewars/game-maps";
import {
  PROTOCOL_VERSION,
  parseClientIntent,
  type MapDescriptor,
  type ServerHello,
  type WallDescriptor,
} from "@vibewars/game-protocol";
import type { StepContext } from "colyseus";

/**
 * The match simulation room (brief §13, §14, §41's "never trust client
 * position"). Owns authoritative position for every connected player.
 *
 * Schema 5's builder API is used instead of legacy decorators: decorators
 * would violate `erasableSyntaxOnly` in `tsconfig.base.json`, which is on so
 * sources stay directly runnable by esbuild/`node --strip-types`.
 */
export const PlayerState = schema(
  {
    sessionId: t.string(),
    /** Server-assigned display name. Never trusted from the client. */
    name: t.string(),
    x: t.number().default(0),
    y: t.number().default(0),
    /**
     * Who this player is currently targeting, or `""` for no target.
     * `@colyseus/schema` strings don't carry a `null`; empty string is the
     * sentinel for "none" (ADR-0002's wire-vs-domain split — the protocol
     * layer uses `null`, this schema field uses `""`, and the room is the
     * one place that translates between them).
     */
    targetSessionId: t.string().default(""),
  },
  "PlayerState",
);

export const MatchState = schema(
  {
    protocolVersion: t.number().default(PROTOCOL_VERSION),
    players: t.map(PlayerState),
  },
  "MatchState",
);

export const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
export const TICK_INTERVAL_MS = 1000 / RULESET.tickRateHz;

/** The one map Sprint 6 ships. Map *selection* arrives with the lobby (Sprint 19). */
export const DEFAULT_MAP_ID = "arena-alpha";

function toMapDescriptor(map: MapData): MapDescriptor {
  const walls: WallDescriptor[] = map.walls.map((wall) =>
    wall.kind === "rect"
      ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
      : { kind: "polygon", points: wall.points },
  );
  return { id: map.id, name: map.name, width: map.width, height: map.height, walls };
}

export class MatchRoom extends Room {
  public override state = new MatchState();

  readonly #map: MapData;
  readonly #wallSegments: readonly Segment[];
  readonly #mapDescriptor: MapDescriptor;

  /** Cycles through the map's spawn points as players join, regardless of team. */
  #nextSpawnIndex = 0;

  /**
   * Each client's last-requested movement direction, clamped to a unit
   * disc. Not part of `state`: other players never need to see *intent*,
   * only its authoritative result (position) — keeping it off the wire
   * also means a client cannot infer another player's raw input stream.
   */
  readonly #inputDirectionBySession = new Map<string, Vec2>();

  public constructor() {
    super();
    this.#map = loadMap(DEFAULT_MAP_ID);
    this.#wallSegments = allWallSegments(this.#map.walls);
    this.#mapDescriptor = toMapDescriptor(this.#map);
  }

  private nextSpawnPoint(): Vec2 {
    const spawns = this.#map.spawnPoints;
    const spawn = spawns[this.#nextSpawnIndex % spawns.length];
    this.#nextSpawnIndex += 1;
    // `spawns` is non-empty (schema enforces `.min(1)`), so this is always defined.
    return spawn?.position ?? { x: 0, y: 0 };
  }

  public override onCreate(): void {
    this.autoDispose = true;

    this.onMessage("intent", (client, message: unknown) => {
      const intent = parseClientIntent(message);
      if (intent === undefined) {
        // Malformed or malicious payload: the sender gets nothing back and
        // nothing is applied. Never trust client input (brief §32).
        return;
      }
      if (intent.kind === "stop") {
        this.#inputDirectionBySession.set(client.sessionId, ZERO);
        return;
      }
      if (intent.kind === "target") {
        this.applyTarget(client.sessionId, intent.targetSessionId);
        return;
      }
      this.#inputDirectionBySession.set(
        client.sessionId,
        clampInputDirection(vec2(intent.dirX, intent.dirY)),
      );
    });

    this.setFixedTimestep((ctx: StepContext) => {
      this.tick(ctx);
    }, RULESET.tickRateHz);
  }

  /**
   * Validate and apply a target selection (brief §5 "target validation").
   *
   * The only requirement right now is that the target actually exists —
   * range/line-of-sight gating belongs to skill activation (Sprint 7/10),
   * not to selecting a target in the first place (GW1 lets you target
   * anything you can see on the compass, regardless of range).
   */
  private applyTarget(sessionId: string, targetSessionId: string | null): void {
    const player = this.state.players.get(sessionId);
    if (player === undefined) {
      return;
    }
    if (targetSessionId === null) {
      player.targetSessionId = "";
      return;
    }
    if (!this.state.players.has(targetSessionId)) {
      // Unknown/stale/malicious target id: silently ignored rather than
      // accepted — the server never trusts a client-supplied target
      // (brief §32).
      return;
    }
    player.targetSessionId = targetSessionId;
  }

  private tick(ctx: StepContext): void {
    for (const [sessionId, player] of this.state.players) {
      const direction = this.#inputDirectionBySession.get(sessionId) ?? ZERO;
      let position = integrateMovement(
        vec2(player.x, player.y),
        direction,
        RULESET.movement.maxSpeedUnitsPerSecond,
        ctx.dt,
      );

      // Resolve against every wall in one pass. Order doesn't matter at
      // this entity-vs-static-geometry scale: once a wall has pushed the
      // circle outside itself, a later wall only pushes it further away
      // from whichever wall it is actually overlapping.
      for (const wallSegment of this.#wallSegments) {
        position = resolveCircleSegmentCollision(
          position,
          RULESET.collision.playerRadius,
          wallSegment,
        );
      }

      player.x = position.x;
      player.y = position.y;
    }
  }

  public override onJoin(client: Client): void {
    const spawn = this.nextSpawnPoint();
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        sessionId: client.sessionId,
        // Display names are assigned by the server. A client-supplied name
        // would be an unvalidated string rendered on every other player's
        // screen.
        name: `player-${client.sessionId.slice(0, 4)}`,
        x: spawn.x,
        y: spawn.y,
      }),
    );
    this.#inputDirectionBySession.set(client.sessionId, ZERO);

    const hello: ServerHello = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: client.sessionId,
      tickIntervalMs: TICK_INTERVAL_MS,
    };
    client.send("hello", hello);
    client.send("map", this.#mapDescriptor);

    console.info(
      `[match] join sessionId=${client.sessionId} size=${String(this.state.players.size)}`,
    );
  }

  public override onLeave(client: Client, code?: number): void {
    this.state.players.delete(client.sessionId);
    this.#inputDirectionBySession.delete(client.sessionId);

    // A player who had the leaver targeted must not keep pointing at an
    // entity that no longer exists.
    for (const player of this.state.players.values()) {
      if (player.targetSessionId === client.sessionId) {
        player.targetSessionId = "";
      }
    }

    console.info(
      `[match] leave sessionId=${client.sessionId} code=${String(code ?? "none")} size=${String(this.state.players.size)}`,
    );
  }

  public override onDispose(): void {
    console.info("[match] disposed");
  }
}

// Keep the generated Schema classes' instance types nameable from other modules.
export type MatchStateInstance = InstanceType<typeof MatchState>;
export type PlayerStateInstance = InstanceType<typeof PlayerState>;

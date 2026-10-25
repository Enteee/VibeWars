import { ClientState, CloseCode, Room, ServerError, type AuthContext, type Client } from "colyseus";
import { schema, t } from "@colyseus/schema";
import { createRng, seedFromString, type SimulationRng } from "@vibewars/game-core";
import { listMapIds } from "@vibewars/game-maps";
import {
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  ROOM_LIMIT,
  SERVER_FULL_MESSAGE,
  isLobbyCode,
  normalizeLobbyCode,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";
import { generateLobbyCode, sanitizeName } from "@vibewars/game-session";

import { quote } from "../log-safe.js";
import { DEFAULT_MAP_ID, openLobbyMatch, type LobbySeat } from "./match-room.js";
import {
  FLOOD_MESSAGES_PER_SECOND,
  assertProtocolVersion,
  field,
  messageBudget,
} from "./options.js";
import { RoomSeats, type ClientLimits } from "./client-budget.js";
import { RoomSlot, type RoomBudget } from "./room-budget.js";
import { send } from "./wire.js";

/**
 * The pre-match lobby (brief §19, §25).
 *
 * A host creates a lobby and gets a short code; others type that code to
 * join. The lobby owns team assignment, ready state and map selection,
 * then hands everyone off to a match room.
 *
 * Lobby state is deliberately volatile: when the server restarts, lobbies
 * vanish. That is intentional (brief §3) — this is a LAN party tool, not
 * a persistent service.
 */

export const LobbyPlayer = schema(
  {
    sessionId: t.string(),
    /** Server-sanitised display name; never the raw client string. */
    name: t.string(),
    /** `-1` means spectating / not yet on a team. */
    team: t.number().default(-1),
    ready: t.boolean().default(false),
    isHost: t.boolean().default(false),
  },
  "LobbyPlayer",
);

export const LobbyState = schema(
  {
    protocolVersion: t.string().default(PROTOCOL_VERSION),
    /** The short code players type to join. */
    code: t.string().default(""),
    phase: t.string().default("waiting"),
    mapId: t.string().default(DEFAULT_MAP_ID),
    players: t.map(LobbyPlayer),
  },
  "LobbyState",
);

export class LobbyRoom extends Room {
  public override state = new LobbyState();

  #rng: SimulationRng = createRng(0);

  /**
   * The build each member joined with, unparsed, for the match to
   * validate. Kept off the synced state: nobody else needs it.
   */
  readonly #builds = new Map<string, unknown>();
  /** How many messages each client may still have handled (#43). */
  readonly #budget = messageBudget("lobby");

  /**
   * Counts the matches this lobby opened, so a room from an earlier one
   * that only goes away later cannot end the current one.
   */
  #matchNumber = 0;

  /** Set once this room is gone, so a match ending later finds nobody to reset. */
  #disposed = false;

  /**
   * This server's room budget (#114). `createGameServer` defines a
   * subclass that supplies it, so a LobbyRoom defined any other way fails
   * loudly instead of running uncapped.
   */
  protected get roomBudget(): RoomBudget {
    throw new Error("LobbyRoom has no room budget: define it through createGameServer");
  }

  /** This room's slot in the budget: taken first, given back once. */
  #slot: RoomSlot | undefined;

  /**
   * This server's seat limits (#265), supplied by the same subclass as
   * the room budget.
   */
  protected get clientLimits(): ClientLimits {
    throw new Error("LobbyRoom has no seat limits: define it through createGameServer");
  }

  /** The seat each client holds: taken in `onAuth`, given back once. */
  readonly #clientSeats = new RoomSeats(this.clientLimits);

  public override onCreate(options: unknown): void {
    // Before anything else, so a full server refuses cheaply; and given
    // back if creating fails after it was taken.
    this.#slot = new RoomSlot(this.roomBudget);
    this.#slot.take();
    try {
      this.#create(options);
    } catch (error: unknown) {
      this.#slot.release();
      throw error;
    }
  }

  #create(options: unknown): void {
    this.autoDispose = true;
    this.maxMessagesPerSecond = FLOOD_MESSAGES_PER_SECOND;
    this.maxClients = MAX_LOBBY_PLAYERS;

    this.#rng = createRng(seedFromString(this.roomId));

    // A client that passed a code is *joining*; matchmaking only reaches
    // onCreate when no lobby with that code existed, so honour the
    // requested code rather than inventing a different one and leaving
    // the player confused about which code to share.
    // Join options come from the client too, so they get the same
    // treatment as any other payload.
    const requestedCode = field(options, "code");
    const requested = typeof requestedCode === "string" ? normalizeLobbyCode(requestedCode) : "";
    this.state.code = isLobbyCode(requested)
      ? requested
      : generateLobbyCode(() => this.#rng.nextFloat());

    // The code is the matchmaking key other clients filter on.
    // `setMetadata` is async; a rejection here would leave the lobby
    // unjoinable-by-code while still looking healthy, so it is logged
    // rather than dropped on the floor.
    this.setMetadata({ code: this.state.code }).catch((error: unknown) => {
      console.error(`[lobby] failed to publish code ${this.state.code}`, error);
    });

    // Over budget, a message is ignored, never its sender dropped (#43).
    const within = (client: Client): boolean =>
      this.#budget.take(client.sessionId, this.clock.currentTime);
    this.onMessage("choose-team", (client, message: unknown) => {
      if (within(client)) {
        this.handleChooseTeam(client, message);
      }
    });
    this.onMessage("ready", (client, message: unknown) => {
      if (within(client)) {
        this.handleReady(client, message);
      }
    });
    this.onMessage("select-map", (client, message: unknown) => {
      if (within(client)) {
        this.handleSelectMap(client, message);
      }
    });
    this.onMessage("start-match", (client) => {
      if (within(client)) {
        void this.handleStartMatch(client);
      }
    });

    console.info(`[lobby] created code=${this.state.code} roomId=${this.roomId}`);
  }

  private handleChooseTeam(client: Client, message: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined || this.state.phase !== "waiting") {
      return;
    }
    const team = field(message, "team");
    if (team === null) {
      player.team = -1;
      player.ready = false;
      return;
    }
    // Only two teams exist for now; how many players each can hold is a
    // function of the map's spawn points, checked at match start.
    if (typeof team === "number" && Number.isInteger(team) && (team === 0 || team === 1)) {
      player.team = team;
      // Changing teams clears readiness: a player should re-confirm after
      // the composition they agreed to has changed.
      player.ready = false;
    }
  }

  private handleReady(client: Client, message: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined || this.state.phase !== "waiting") {
      return;
    }
    const ready = field(message, "ready");
    if (typeof ready !== "boolean") {
      return;
    }
    // A spectator cannot be "ready" — readiness is about being in the match.
    player.ready = ready && player.team >= 0;
  }

  private handleSelectMap(client: Client, message: unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined || !player.isHost || this.state.phase !== "waiting") {
      return;
    }
    const mapId = field(message, "mapId");
    if (typeof mapId !== "string" || !listMapIds().includes(mapId)) {
      // An unknown map id is ignored rather than accepted — the server
      // decides what maps exist (brief §32).
      return;
    }
    this.state.mapId = mapId;
    // A map change can invalidate what players agreed to, so everyone
    // re-confirms.
    for (const other of this.state.players.values()) {
      other.ready = false;
    }
  }

  /**
   * Put the lobby back into its waiting state once its match is over.
   *
   * The match room says when (#44): no client can, so a non-host cannot
   * reset a lobby mid-match, and nobody waits on the host to come back.
   *
   * Without this a lobby is single-use: brief §46 requires that players
   * can "return to the lobby" and "immediately play another match", so
   * the phase has to be reversible. Readiness is cleared so nobody is
   * dragged into a second match they did not re-confirm, while team
   * assignments are kept because re-picking sides every round would be
   * tedious.
   */
  private returnToLobby(): void {
    if (this.state.phase !== "in-match") {
      return;
    }
    this.state.phase = "waiting";
    for (const player of this.state.players.values()) {
      player.ready = false;
    }
    console.info(`[lobby] ${this.state.code} returned to waiting`);
  }

  /** Whether the lobby currently satisfies the rules for starting. */
  public canStart(): { ok: true } | { ok: false; reason: string } {
    const players = [...this.state.players.values()];
    const assigned = players.filter((player) => player.team >= 0);

    if (assigned.length === 0) {
      return { ok: false, reason: "nobody has joined a team" };
    }
    if (!assigned.every((player) => player.ready)) {
      return { ok: false, reason: "not everyone on a team is ready" };
    }
    return { ok: true };
  }

  /**
   * Start the lobby's own match (#41): a private room with a seat
   * reserved for each of this lobby's team players, each sent only their
   * own reservation. A reservation is a seat, so it is never broadcast,
   * and the room's id is never put in the shared state: spectators get
   * nothing and stay here.
   */
  private async handleStartMatch(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined || !player.isHost || this.state.phase !== "waiting") {
      return;
    }
    const check = this.canStart();
    if (!check.ok) {
      send(client, "start-rejected", { reason: check.reason });
      return;
    }

    // Leaves "waiting" before the await, so a second start cannot race in.
    this.state.phase = "starting";
    const mapId = this.state.mapId;
    const seated: (LobbySeat & { readonly sessionId: string })[] = [
      ...this.state.players.values(),
    ].flatMap((other) =>
      other.team === 0 || other.team === 1
        ? [
            {
              sessionId: other.sessionId,
              team: other.team,
              name: other.name,
              build: this.#builds.get(other.sessionId),
            },
          ]
        : [],
    );

    let reservations: Awaited<ReturnType<typeof openLobbyMatch>>;
    try {
      this.#matchNumber += 1;
      const matchNumber = this.#matchNumber;
      reservations = await openLobbyMatch(mapId, seated, () => {
        if (!this.#disposed && matchNumber === this.#matchNumber) {
          this.returnToLobby();
        }
      });
    } catch (error: unknown) {
      console.error(`[lobby] ${this.state.code} could not open its match`, error);
      this.state.phase = "waiting";
      // A full server says so, as Quick Match and hosting do (#114).
      const full = error instanceof ServerError && error.code === ROOM_LIMIT;
      send(client, "start-rejected", {
        reason: full ? SERVER_FULL_MESSAGE : "the server could not create the match",
      });
      return;
    }

    this.state.phase = "in-match";
    seated.forEach(({ sessionId }, i) => {
      const reservation = reservations[i];
      if (reservation !== undefined) {
        const message: LobbyMatchStartingMessage = { mapId, reservation };
        const seat = this.clients.get(sessionId);
        if (seat !== undefined) {
          send(seat, "match-starting", message);
        }
      }
    });

    console.info(
      `[lobby] ${this.state.code} starting match ${reservations[0]?.roomId ?? "?"} on ${quote(mapId)}`,
    );
  }

  /**
   * Take the client's seat before it joins (#265), or refuse it with
   * `CLIENT_LIMIT` or `ADDRESS_LIMIT`. `context.ip` is the socket's own
   * address: `createGameServer` strips the forwarding headers it would
   * otherwise believe.
   */
  public override onAuth(client: Client, _options: unknown, context: AuthContext): true {
    if (client.state === ClientState.LEAVING) {
      // Its socket closed before it got here. Colyseus refuses it right
      // after `onAuth` without ever calling `onLeave`, so a seat taken now
      // would be held until the room is gone.
      throw new ServerError(CloseCode.WITH_ERROR, "already disconnected");
    }
    this.#clientSeats.take(client.sessionId, this.clientLimits.addressKey(context.ip));
    return true;
  }

  public override onJoin(client: Client, options: unknown): void {
    assertProtocolVersion(options);
    const isFirst = this.state.players.size === 0;
    const player = new LobbyPlayer({
      sessionId: client.sessionId,
      name: sanitizeName(field(options, "name"), `player-${client.sessionId.slice(0, 4)}`),
      // The first player in is the host; if they leave, hosting passes on.
      isHost: isFirst,
    });
    this.state.players.set(client.sessionId, player);
    this.#builds.set(client.sessionId, field(options, "build"));

    console.info(
      `[lobby] ${this.state.code} join ${client.sessionId} (${String(this.state.players.size)} players)`,
    );
  }

  public override onLeave(client: Client): void {
    const leaving = this.state.players.get(client.sessionId);
    const wasHost = leaving?.isHost ?? false;
    this.state.players.delete(client.sessionId);
    this.#builds.delete(client.sessionId);
    this.#budget.forget(client.sessionId);
    this.#clientSeats.release(client.sessionId);

    // Hosting must not vanish with the host, or the lobby becomes
    // unstartable and everyone has to regroup under a new code.
    if (wasHost) {
      const next = [...this.state.players.values()][0];
      if (next !== undefined) {
        next.isHost = true;
      }
    }

    console.info(
      `[lobby] ${this.state.code} leave ${client.sessionId} (${String(this.state.players.size)} players)`,
    );
  }

  public override onDispose(): void {
    this.#slot?.release();
    this.#clientSeats.releaseAll();
    this.#disposed = true;
    console.info(`[lobby] ${this.state.code} disposed`);
  }
}

/** `LobbyRoom`, holding this server's room budget (#114) and seat limits (#265). */
export function budgetedLobbyRoom(budget: RoomBudget, limits: ClientLimits): typeof LobbyRoom {
  return class extends LobbyRoom {
    protected override get roomBudget(): RoomBudget {
      return budget;
    }

    protected override get clientLimits(): ClientLimits {
      return limits;
    }
  };
}

export type LobbyStateInstance = InstanceType<typeof LobbyState>;
export type LobbyPlayerInstance = InstanceType<typeof LobbyPlayer>;

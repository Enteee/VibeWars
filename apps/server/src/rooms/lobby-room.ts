import { Room, type Client } from "colyseus";
import { schema, t } from "@colyseus/schema";
import { createRng, seedFromString, type SimulationRng } from "@vibewars/game-core";
import { listMapIds } from "@vibewars/game-maps";
import {
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  isLobbyCode,
  normalizeLobbyCode,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";

import { DEFAULT_MAP_ID } from "./match-room.js";
import { assertProtocolVersion, field } from "./options.js";

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
    protocolVersion: t.number().default(PROTOCOL_VERSION),
    /** The short code players type to join. */
    code: t.string().default(""),
    phase: t.string().default("waiting"),
    mapId: t.string().default(DEFAULT_MAP_ID),
    players: t.map(LobbyPlayer),
    /** Set once the host starts; the room clients should join. */
    matchRoomId: t.string().default(""),
  },
  "LobbyState",
);

/** Display names are clamped so one player cannot flood everyone's screen. */
const MAX_NAME_LENGTH = 16;

/**
 * Matches ASCII control characters, which have no place in a display
 * name — they can corrupt terminal output in server logs and render as
 * invisible junk in other players' client UIs.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is this pattern's entire purpose
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * Sanitise a client-supplied display name (brief §32: never trust the
 * client). Control characters are stripped, length is clamped, and an
 * empty result falls back to a server-generated name.
 */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  const cleaned = raw.replace(CONTROL_CHARACTERS, "").trim();
  if (cleaned === "") {
    return fallback;
  }
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

/** Generate a lobby code from the injected RNG (never `Math.random`). */
export function generateLobbyCode(rng: SimulationRng): string {
  let code = "";
  for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
    const index = rng.nextInt(0, LOBBY_CODE_ALPHABET.length);
    code += LOBBY_CODE_ALPHABET[index] ?? "A";
  }
  return code;
}

export class LobbyRoom extends Room {
  public override state = new LobbyState();

  #rng: SimulationRng = createRng(0);

  public override onCreate(options: unknown): void {
    this.autoDispose = true;
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
    this.state.code = isLobbyCode(requested) ? requested : generateLobbyCode(this.#rng);

    // The code is the matchmaking key other clients filter on.
    // `setMetadata` is async; a rejection here would leave the lobby
    // unjoinable-by-code while still looking healthy, so it is logged
    // rather than dropped on the floor.
    this.setMetadata({ code: this.state.code }).catch((error: unknown) => {
      console.error(`[lobby] failed to publish code ${this.state.code}`, error);
    });

    this.onMessage("choose-team", (client, message: unknown) => {
      this.handleChooseTeam(client, message);
    });
    this.onMessage("ready", (client, message: unknown) => {
      this.handleReady(client, message);
    });
    this.onMessage("select-map", (client, message: unknown) => {
      this.handleSelectMap(client, message);
    });
    this.onMessage("start-match", (client) => {
      this.handleStartMatch(client);
    });
    this.onMessage("return-to-lobby", () => {
      this.returnToLobby();
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
   * Put the lobby back into its waiting state after a match.
   *
   * Without this a lobby is single-use: brief §46 requires that players
   * can "return to the lobby" and "immediately play another match", so
   * the phase has to be reversible. Readiness is cleared so nobody is
   * dragged into a second match they did not re-confirm, while team
   * assignments are kept because re-picking sides every round would be
   * tedious.
   */
  public returnToLobby(): void {
    if (this.state.phase === "waiting") {
      return;
    }
    this.state.phase = "waiting";
    this.state.matchRoomId = "";
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

  private handleStartMatch(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player === undefined || !player.isHost || this.state.phase !== "waiting") {
      return;
    }
    const check = this.canStart();
    if (!check.ok) {
      client.send("start-rejected", { reason: check.reason });
      return;
    }

    this.state.phase = "starting";
    // Clients create/join the match room themselves; the lobby only says
    // which map to play. Keeping room creation client-side means a lobby
    // cannot leak an empty match room if everyone disconnects between
    // "start" and "join".
    const message: LobbyMatchStartingMessage = {
      roomId: this.state.matchRoomId,
      mapId: this.state.mapId,
    };
    this.broadcast("match-starting", message);
    this.state.phase = "in-match";

    console.info(`[lobby] ${this.state.code} starting match on ${this.state.mapId}`);
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

    console.info(
      `[lobby] ${this.state.code} join ${client.sessionId} (${String(this.state.players.size)} players)`,
    );
  }

  public override onLeave(client: Client): void {
    const leaving = this.state.players.get(client.sessionId);
    const wasHost = leaving?.isHost ?? false;
    this.state.players.delete(client.sessionId);

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
    console.info(`[lobby] ${this.state.code} disposed`);
  }
}

export type LobbyStateInstance = InstanceType<typeof LobbyState>;
export type LobbyPlayerInstance = InstanceType<typeof LobbyPlayer>;

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

import { DEFAULT_MAP_ID, openLobbyMatch, type LobbySeat } from "./match-room.js";
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
  },
  "LobbyState",
);

/** Display names are clamped so one player cannot flood everyone's screen. */
const MAX_NAME_LENGTH = 16;

/**
 * How much of the raw string is looked at, in UTF-16 units. A join body
 * can carry a megabyte of name, and the passes below cost per unit, so
 * the rest is dropped unread: 16 units per kept character leaves room for
 * any real name and its marks (#174).
 */
const MAX_RAW_NAME_UNITS = MAX_NAME_LENGTH * 16;

/**
 * Characters that draw nothing of their own or rearrange what is drawn
 * around them: every control (C0 and C1), every format character (bidi
 * overrides, zero-width joiners and spaces, the BOM, the soft hyphen),
 * the line and paragraph separators, lone surrogate halves, which draw
 * as a replacement box, and the letters and symbols that are blank by
 * design: the Hangul fillers and the braille blank. In a log they corrupt
 * the terminal; over a player's head they make a name invisible, or
 * reverse it and whatever is drawn after it (#174).
 */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u115f\u1160\u3164\uffa0\u2800]/gu;

/** Leading whitespace, and combining marks before any base letter: they have nothing to sit on. */
const LEADING_MARKS = /^[\s\p{M}]+/u;

/**
 * Combining marks past the second on one letter. Two covers every real
 * accent; a stack of fifteen draws far above and below the line, over
 * other players' health bars.
 */
const STACKED_MARKS = /(\p{M}{2})\p{M}+/gu;

/**
 * Sanitise a client-supplied display name (brief §32: never trust the
 * client). Invisible characters are stripped, mark stacks and whitespace
 * runs collapsed, the length clamped in code points, so an emoji is never
 * cut in half, and an empty result falls back to a server-generated name.
 */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  // Slicing can halve a surrogate pair; the stray half is stripped below.
  const cleaned = raw
    .slice(0, MAX_RAW_NAME_UNITS)
    .normalize("NFC")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .replace(LEADING_MARKS, "")
    .replace(STACKED_MARKS, "$1")
    .trim();
  if (cleaned === "") {
    return fallback;
  }
  // The cut can leave a space at the end.
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("").trim();
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

  /**
   * The build each member joined with, unparsed, for the match to
   * validate. Kept off the synced state: nobody else needs it.
   */
  readonly #builds = new Map<string, unknown>();

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
      void this.handleStartMatch(client);
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
      client.send("start-rejected", { reason: check.reason });
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
              build: this.#builds.get(other.sessionId),
            },
          ]
        : [],
    );

    let reservations: Awaited<ReturnType<typeof openLobbyMatch>>;
    try {
      reservations = await openLobbyMatch(mapId, seated);
    } catch (error: unknown) {
      console.error(`[lobby] ${this.state.code} could not open its match`, error);
      this.state.phase = "waiting";
      client.send("start-rejected", { reason: "the server could not create the match" });
      return;
    }

    this.state.phase = "in-match";
    seated.forEach(({ sessionId }, i) => {
      const reservation = reservations[i];
      if (reservation !== undefined) {
        const message: LobbyMatchStartingMessage = { mapId, reservation };
        this.clients.get(sessionId)?.send("match-starting", message);
      }
    });

    console.info(
      `[lobby] ${this.state.code} starting match ${reservations[0]?.roomId ?? "?"} on ${mapId}`,
    );
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

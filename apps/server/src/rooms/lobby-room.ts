import { Room, ServerError, type Client } from "colyseus";
import { schema, t } from "@colyseus/schema";
import { createRng, seedFromString, type SimulationRng } from "@vibewars/game-core";
import { listMapIds } from "@vibewars/game-maps";
import {
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  MAX_LOBBY_PLAYERS,
  PROTOCOL_VERSION,
  ROOM_LIMIT,
  SERVER_FULL_MESSAGE,
  isLobbyCode,
  normalizeLobbyCode,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";

import { quote } from "../log-safe.js";
import { DEFAULT_MAP_ID, openLobbyMatch, type LobbySeat } from "./match-room.js";
import {
  FLOOD_MESSAGES_PER_SECOND,
  assertProtocolVersion,
  field,
  messageBudget,
} from "./options.js";
import { RoomSlot, type RoomBudget } from "./room-budget.js";

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

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
/** U+1F3F4 WAVING BLACK FLAG, the base of every subdivision flag. */
const BLACK_FLAG = 0x1f3f4;
const CANCEL_TAG = 0xe007f;
/** The longest tag run a real subdivision flag uses, e.g. `gbsct` is 5. */
const MAX_FLAG_TAGS = 6;
/** Joiners one grapheme may hold: the family emoji has three. */
const MAX_JOINERS_PER_GRAPHEME = 4;
/**
 * Code points one grapheme may hold. A family in four skin tones is 11;
 * a letter under a hundred skin-tone modifiers, or a run of Hangul
 * leading jamo, is also one grapheme, and draws far wider than a letter.
 */
const MAX_CODE_POINTS_PER_GRAPHEME = 12;
/**
 * Code points in the whole name. Each grapheme stays under the cap above,
 * but sixteen of them at eleven swatches each still draw a wall; this is
 * six families, or sixteen of nearly anything else.
 */
const MAX_NAME_CODE_POINTS = 48;

/** One character of `INVISIBLE_CHARACTERS`, for testing a single code point. */
const INVISIBLE_CHARACTER = new RegExp(INVISIBLE_CHARACTERS.source, "u");
const WHITESPACE_OR_MARK = /[\s\p{M}]/u;

function isTag(codePoint: number): boolean {
  return codePoint >= 0xe0020 && codePoint <= CANCEL_TAG;
}

/** A tag a subdivision flag may spell with: a digit or a lowercase letter. */
function isFlagTag(codePoint: number): boolean {
  return (
    (codePoint >= 0xe0030 && codePoint <= 0xe0039) || (codePoint >= 0xe0061 && codePoint <= 0xe007a)
  );
}

/** Draws something a joiner can join: not blank, not invisible, not itself a joiner. */
function isVisible(char: string | undefined): boolean {
  return char !== undefined && !/\s/u.test(char) && !INVISIBLE_CHARACTER.test(char);
}

/**
 * The format characters real names need, from the code points of a
 * name (#192): a ZWJ or ZWNJ with something visible on both sides (emoji
 * sequences, Persian and Indic letter forms), and the tags of a complete
 * subdivision flag (England, Scotland, Wales). Indexes into `chars`.
 */
function wantedFormatCharacters(chars: readonly string[]): Set<number> {
  const keep = new Set<number>();
  // A mark with only blanks and marks before it is stripped as leading,
  // so it is nothing to join to.
  let leading = true;
  const leadingAt: boolean[] = [];
  for (const char of chars) {
    leading &&= WHITESPACE_OR_MARK.test(char) || INVISIBLE_CHARACTER.test(char);
    leadingAt.push(leading);
  }
  for (let i = 0; i < chars.length; i += 1) {
    const codePoint = chars[i]?.codePointAt(0) ?? 0;
    if (codePoint === ZWJ || codePoint === ZWNJ) {
      if (isVisible(chars[i - 1]) && leadingAt[i - 1] === false && isVisible(chars[i + 1])) {
        keep.add(i);
      }
      continue;
    }
    if (codePoint !== BLACK_FLAG) {
      continue;
    }
    let end = i + 1;
    while (end < chars.length && isTag(chars[end]?.codePointAt(0) ?? 0)) {
      end += 1;
    }
    const tags = chars.slice(i + 1, end - 1).map((char) => char.codePointAt(0) ?? 0);
    const complete =
      chars[end - 1]?.codePointAt(0) === CANCEL_TAG &&
      tags.length >= 1 &&
      tags.length <= MAX_FLAG_TAGS &&
      tags.every(isFlagTag);
    if (complete) {
      for (let tag = i + 1; tag < end; tag += 1) {
        keep.add(tag);
      }
    }
    i = end - 1;
  }
  return keep;
}

/**
 * The first `MAX_NAME_LENGTH` graphemes, whole ones only, up to
 * `MAX_NAME_CODE_POINTS` in all. One holding more than
 * `MAX_JOINERS_PER_GRAPHEME` joiners or `MAX_CODE_POINTS_PER_GRAPHEME`
 * code points keeps only its first code point.
 */
function clampGraphemes(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const kept: string[] = [];
  let codePointsKept = 0;
  for (const { segment } of segmenter.segment(name)) {
    if (kept.length === MAX_NAME_LENGTH) {
      break;
    }
    const codePoints = Array.from(segment);
    const joiners = codePoints.filter((char) => char.codePointAt(0) === ZWJ).length;
    // A chain of thirty faces is one grapheme, drawn over everyone's bars.
    const tooWide =
      joiners > MAX_JOINERS_PER_GRAPHEME || codePoints.length > MAX_CODE_POINTS_PER_GRAPHEME;
    const grapheme = tooWide ? (codePoints[0] ?? "") : segment;
    codePointsKept += tooWide ? 1 : codePoints.length;
    if (codePointsKept > MAX_NAME_CODE_POINTS) {
      break;
    }
    kept.push(grapheme);
  }
  return kept.join("");
}

/**
 * Sanitise a client-supplied display name (brief §32: never trust the
 * client). Invisible characters are stripped, except the joiners and flag
 * tags real names need, mark stacks and whitespace runs collapsed, the
 * length clamped in graphemes, so an emoji, a family or a flag is never
 * cut apart, and an empty result falls back to a server-generated name.
 */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  // Slicing can halve a surrogate pair; the stray half is stripped below.
  const chars = Array.from(raw.slice(0, MAX_RAW_NAME_UNITS).normalize("NFC"));
  const wanted = wantedFormatCharacters(chars);
  const cleaned = chars
    .map((char, index) => (wanted.has(index) ? char : char.replace(INVISIBLE_CHARACTERS, "")))
    .join("")
    .replace(/\s+/gu, " ")
    .replace(LEADING_MARKS, "")
    .replace(STACKED_MARKS, "$1")
    .trim();
  if (cleaned === "") {
    return fallback;
  }
  // The cut can leave a space at the end.
  return clampGraphemes(cleaned).trim();
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
    this.state.code = isLobbyCode(requested) ? requested : generateLobbyCode(this.#rng);

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
      client.send("start-rejected", {
        reason: full ? SERVER_FULL_MESSAGE : "the server could not create the match",
      });
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
      `[lobby] ${this.state.code} starting match ${reservations[0]?.roomId ?? "?"} on ${quote(mapId)}`,
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
    this.#budget.forget(client.sessionId);

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
    this.#disposed = true;
    console.info(`[lobby] ${this.state.code} disposed`);
  }
}

/** `LobbyRoom`, holding this server's room budget (#114). */
export function budgetedLobbyRoom(budget: RoomBudget): typeof LobbyRoom {
  return class extends LobbyRoom {
    protected override get roomBudget(): RoomBudget {
      return budget;
    }
  };
}

export type LobbyStateInstance = InstanceType<typeof LobbyState>;
export type LobbyPlayerInstance = InstanceType<typeof LobbyPlayer>;

import { randomUUID } from "node:crypto";

import {
  ClientState,
  CloseCode,
  Room,
  ServerError,
  matchMaker,
  type AuthContext,
  type Client,
} from "colyseus";
import { ArraySchema, schema, t } from "@colyseus/schema";
import {
  IMPLEMENTED_SKILLS,
  DEFAULT_MATCH_RULES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  ZERO,
  attributeRanksOf,
  defaultBuildEquipment,
  getSkill,
  parsePlayerBuild,
  // Named apart from this module's own join-time `resolveLoadout`, which
  // decides *whether* to honour a build; this one turns the gear in an
  // already-accepted build into numbers.
  resolveLoadout as resolveLoadout_,
  spawnFacing,
  validatePlayerBuild,
  vec2,
  type CombatLogEntry,
  type BuildEquipment,
  type Participant,
  type PlayerBuild,
  type ProfessionId,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments, loadMap, type MapData } from "@vibewars/game-maps";
import {
  PROTOCOL_VERSION,
  QUICK_MATCH_MAX_PLAYERS,
  ROOM_MATCH,
  parseClientIntent,
  type CastRefusedMessage,
  type MapDescriptor,
  type RechargeMessage,
  type RechargeSlot,
  type ServerHello,
  type WallDescriptor,
} from "@vibewars/game-protocol";
import type { StepContext } from "colyseus";

import { quote } from "../log-safe.js";
import { sanitizeName } from "./lobby-room.js";
import {
  FLOOD_MESSAGES_PER_SECOND,
  assertProtocolVersion,
  field,
  messageBudget,
} from "./options.js";
import { rechargePredicted, rechargeSlots } from "./recharge.js";
import { RoomSeats, peerAddress, type ClientLimits } from "./client-budget.js";
import { RoomSlot, type RoomBudget } from "./room-budget.js";

/**
 * The match simulation room: authoritative movement, targeting and combat
 * (brief §12-§15, §32 "never trust the client").
 *
 * The room owns *transport and state sync*. Every actual game rule lives
 * in `@vibewars/game-core`, and the tick itself is its `MatchSimulation`
 * (ADR-0017), so the same combat can be (and is) tested headlessly with
 * no socket involved (ADR-0001).
 */

export const PlayerState = schema(
  {
    sessionId: t.string(),
    /** Server-assigned display name. Never trusted from the client. */
    name: t.string(),
    x: t.number().default(0),
    y: t.number().default(0),
    /** Where the player faces, radians, `atan2` convention; to 2 decimals (#187). */
    facing: t.number().default(0),
    targetSessionId: t.string().default(""),
    /**
     * Who this player is attacking with their weapon, or `""`. Public, as
     * in GW1: everyone can see who is swinging at whom.
     */
    attackTargetSessionId: t.string().default(""),

    health: t.number().default(0),
    maxHealth: t.number().default(0),
    energy: t.number().default(0),
    maxEnergy: t.number().default(0),
    adrenaline: t.number().default(0),
    /** Base armor including the off-hand, before statuses. Shown in the HUD. */
    armor: t.number().default(0),
    /** Equipped weapon class id, so a target panel can name it. */
    weaponId: t.string().default(""),
    /** The equipped `OffhandId`, or `""` for none, for its mark in the arena (#276). */
    offhandId: t.string().default(""),
    /**
     * The build's professions, as the server resolved them, never as
     * claimed (#281): the arena shows the primary's glyph, the target
     * panel both. `""` for no secondary.
     */
    primaryProfession: t.string().default(""),
    secondaryProfession: t.string().default(""),
    team: t.number().default(0),
    dead: t.boolean().default(false),

    /** Skill currently being cast, or `""`. Drives the client's cast bar. */
    castingSkillId: t.string().default(""),
    /** Seconds left on the current cast; 0 when not casting. */
    castRemaining: t.number().default(0),
    /** The current cast's whole length, dazed included; 0 when not casting. */
    castTotal: t.number().default(0),
    /** Active condition/hex/enchantment ids, for status markers. */
    statuses: t.array("string"),
  },
  "PlayerState",
);

/**
 * A ranged weapon's shot in flight, as it was released: the client flies
 * it from `(x0, y0)` to `(x1, y1)` over `flightSeconds` from
 * `launchedAt`. Written once at release and removed when it lands, so a
 * shot costs no traffic while it flies.
 */
export const ProjectileState = schema(
  {
    id: t.number(),
    /** Who shot it, so a client can tint it by side (#161). */
    attackerId: t.string(),
    /** The weapon it left, as released: a swap mid-flight changes nothing. */
    weaponId: t.string(),
    x0: t.number(),
    y0: t.number(),
    x1: t.number(),
    y1: t.number(),
    /** The match clock (`elapsedSeconds`) at release. */
    launchedAt: t.number(),
    flightSeconds: t.number(),
  },
  "ProjectileState",
);

export const MatchState = schema(
  {
    protocolVersion: t.number().default(PROTOCOL_VERSION),
    players: t.map(PlayerState),
    /** Weapon shots in flight, oldest first. */
    projectiles: t.array(ProjectileState),

    /** Kills scored by team 0 and team 1 (brief §22's match rules). */
    scoreTeam0: t.number().default(0),
    scoreTeam1: t.number().default(0),
    /** Seconds elapsed; drives the match clock in the HUD. */
    elapsedSeconds: t.number().default(0),
    /** `"active"` or `"finished"`. */
    phase: t.string().default("active"),
    /** `-1` while active or on a draw; otherwise the winning team. */
    winningTeam: t.number().default(-1),
    /** `""`, `"score"` or `"time"` — why the match ended. */
    endReason: t.string().default(""),
  },
  "MatchState",
);

export const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
export const TICK_INTERVAL_MS = 1000 / RULESET.tickRateHz;

/** The one map Sprint 6 ships. Map *selection* arrives with the lobby (Sprint 19). */
export const DEFAULT_MAP_ID = "arena-alpha";

/** One minute of ticks at the configured rate — enough to see a p95, bounded. */
const TICK_SAMPLE_LIMIT = RULESET.tickRateHz * 60;

/** Tick-time statistics for one room (brief §26). */
export interface TickMetrics {
  readonly samples: number;
  /** Milliseconds a tick is allowed to take at the configured tick rate. */
  readonly budgetMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

/**
 * The skill bar a player gets when they bring no build of their own.
 *
 * Quick match and a first-time player both land here, so it is chosen to
 * be immediately playable: damage, a heal, a self-buff, an interrupt, a
 * condition and a cure — enough for a real fight with counterplay on the
 * very first join, without visiting the editor.
 *
 * It is NOT a legal single-character build (no character has access to
 * all six of these professions' attributes), which is deliberate: it is
 * the house loadout, not a build anyone could make. A player who wants a
 * legal, tuned build makes one and brings it.
 */
const DEFAULT_SKILL_BAR: readonly string[] = [
  "elementalist.fireball",
  "monk.orison-of-healing",
  "warrior.sever-artery-lite",
  "ranger.broad-head-arrow",
  "elementalist.armor-of-earth",
  "monk.mend-affliction",
  "necromancer.faintheartedness",
  "ranger.troll-unguent",
];

/** Attribute ranks that go with `DEFAULT_SKILL_BAR`. */
const DEFAULT_ATTRIBUTE_RANKS: ReadonlyMap<string, number> = new Map([
  ["elementalist.fire-magic", 12],
  ["monk.healing-prayers", 12],
  ["warrior.swordsmanship", 12],
  ["ranger.marksmanship", 12],
  ["necromancer.curses", 12],
  ["ranger.wilderness-survival", 12],
]);

/**
 * The gear that goes with `DEFAULT_SKILL_BAR`.
 *
 * A warrior's kit, because the house bar is melee-capable and handing a
 * first-time player a wand to go with a sword skill would be a worse
 * first five seconds than any argument for neutrality.
 */
const DEFAULT_EQUIPMENT: BuildEquipment = defaultBuildEquipment("warrior");

/** What a joining client claimed, after it has been checked. */
interface ResolvedJoinLoadout {
  readonly skillBar: readonly string[];
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly equipment: BuildEquipment;
}

const HOUSE_LOADOUT: ResolvedJoinLoadout = {
  skillBar: DEFAULT_SKILL_BAR,
  attributeRanks: DEFAULT_ATTRIBUTE_RANKS,
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  equipment: DEFAULT_EQUIPMENT,
};

/**
 * Decide what a joining client actually gets to play (brief §32).
 *
 * The client sends a build; the server decides whether to honour it. An
 * illegal or malformed build is refused and replaced with the house
 * loadout rather than rejecting the join — being dropped at the door
 * because of a stale saved character is a miserable way to find out
 * something is wrong, and the player still gets a playable match.
 *
 * Nothing about the claimed build is trusted: not the attribute ranks
 * (which scale every skill), not the skill bar (which decides what can be
 * cast at all), and not the professions that gate both.
 */
function resolveLoadout(options: unknown): ResolvedJoinLoadout {
  const claimed = field(options, "build");
  if (claimed === undefined) {
    return HOUSE_LOADOUT;
  }

  const build: PlayerBuild | undefined = parsePlayerBuild(claimed);
  if (build === undefined) {
    console.warn("[match] ignoring a malformed build; using the house loadout");
    return HOUSE_LOADOUT;
  }

  const problems = validatePlayerBuild(build, RULESET.attributes);
  if (problems.length > 0) {
    // Every reason, not just the first: a client that sent a bad build
    // deserves a log that says exactly what was wrong with it.
    console.warn(
      `[match] refusing build ${quote(build.name)}: ` +
        problems.map((p) => `${p.field}: ${quote(p.message)}`).join("; "),
    );
    return HOUSE_LOADOUT;
  }

  const skillBar = build.skillBar.filter((id): id is string => id !== null);
  if (skillBar.length === 0) {
    console.warn(`[match] build ${quote(build.name)} has an empty bar; using the house loadout`);
    return HOUSE_LOADOUT;
  }

  return {
    skillBar,
    attributeRanks: attributeRanksOf(build),
    primaryProfession: build.primaryProfession,
    secondaryProfession: build.secondaryProfession,
    equipment: build.equipment,
  };
}

// Starting health and energy now come from the ruleset's combat rules,
// via `resolveLoadout` — runes move both, so a fixed constant here
// would quietly override them. Respawn time comes from the match rules.
/**
 * How long a dropped player keeps their slot, character and position.
 * Long enough to survive a wifi blip or a laptop lid, short enough that
 * a quit does not leave a ghost standing in the arena.
 */
const RECONNECT_WINDOW_SECONDS = 30;

/**
 * How long a lobby's players have to take the seats it reserved for
 * them: twice Colyseus's default, for a slow phone on a bad network. A
 * seat nobody takes in time lapses and is gone for good: its player
 * gets "match failed" and finds their lobby again, and the rest play on.
 * A match nobody came to disposes itself, so a lobby that empties
 * between "start" and "join" leaves nothing behind.
 */
export const LOBBY_MATCH_JOIN_DEADLINE_SECONDS = 30;

/** One player a lobby seats in its match: their team, name, and the build they asked for. */
export interface LobbySeat {
  readonly team: 0 | 1;
  /** The name the lobby showed, so a player is the same person on both screens. */
  readonly name: string;
  /** Unparsed: the match validates it like any other requested build. */
  readonly build: unknown;
}

interface PendingSeat extends LobbySeat {
  /** Chosen here, before the reservation, so the room knows whose seat is whose. */
  readonly sessionId: string;
}

interface Seating {
  readonly seats: readonly PendingSeat[];
  readonly joinDeadlineSeconds: number;
  readonly onOver: () => void;
}

/**
 * Seatings a lobby has asked for, while its match room is being created:
 * `onCreate` reads them from here. They live in this process, and never in the
 * room's create options: `create` is open to clients, and a client must
 * not be able to open a seated room of its own (#41).
 */
const pendingSeatings = new Map<string, Seating>();

/**
 * Open a lobby's own match and reserve every seat in it, server-side
 * (#41). Each reservation is one player's way in, in `seats` order, and
 * goes to that player alone. The room is full from the start, so no
 * client can reserve a seat in it; it is private, so Quick Match never
 * finds it.
 *
 * `onOver` runs once, when the match finishes or its room goes away
 * first (everyone left, or nobody came), so the lobby can take its
 * players back without trusting any of them to say so (#44).
 *
 * If a reservation fails, the error goes to the caller. The room it
 * leaves is empty, and disposes itself once the reservations made in it
 * lapse.
 */
export async function openLobbyMatch(
  mapId: string,
  seats: readonly LobbySeat[],
  onOver: () => void,
  joinDeadlineSeconds = LOBBY_MATCH_JOIN_DEADLINE_SECONDS,
): Promise<matchMaker.ISeatReservation[]> {
  const seating = randomUUID();
  const pending = seats.map((seat) => ({ ...seat, sessionId: randomUUID() }));
  pendingSeatings.set(seating, { seats: pending, joinDeadlineSeconds, onOver });
  const room = await matchMaker
    .createRoom(ROOM_MATCH, { mapId, seating })
    .finally(() => pendingSeatings.delete(seating));
  return Promise.all(
    pending.map(({ sessionId, build }) =>
      // Colyseus takes the session id from the auth data when there is one.
      matchMaker.reserveSeatFor(room, { protocolVersion: PROTOCOL_VERSION, build }, { sessionId }),
    ),
  );
}

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

  // Assigned in onCreate once the requested map id is known; a room is
  // never ticked before onCreate runs.
  #map: MapData;
  #wallSegments: readonly Segment[];
  #mapDescriptor: MapDescriptor;
  /**
   * Created in `onCreate`, not in the constructor: Colyseus assigns
   * `roomId` after construction, and the match is seeded from it. This
   * placeholder is replaced before anyone can join.
   */
  #sim = new MatchSimulation({ seed: 0 });

  #nextSpawnIndex = 0;
  /**
   * Set the moment `endMatch` starts, before its lock is awaited: the
   * tick keeps running meanwhile and would end the match a second time.
   */
  #ending = false;

  /**
   * The recharges each player was last told, and the match time they were
   * told at, so only what their countdown cannot predict is sent (#152).
   */
  readonly #rechargesSent = new Map<string, { slots: RechargeSlot[]; at: number }>();
  /** How many intents each client may still have handled (#43). */
  readonly #budget = messageBudget("match");

  /**
   * A lobby's match: each seat's team, its player's lobby name, and
   * whether it was taken. Absent for Quick Match, which alternates teams
   * as players arrive.
   */
  #seats: Map<string, { readonly team: 0 | 1; readonly name: string; used: boolean }> | undefined;
  /** The opening lobby's `onOver`, until it has run; Quick Match has none. */
  #onOver: (() => void) | undefined;

  /**
   * Rolling tick-duration samples in milliseconds (brief §26).
   *
   * Always on rather than behind a flag: the measurement is one
   * `performance.now()` pair per tick against a 50 ms budget, and a
   * benchmark you have to remember to enable is one that silently stops
   * being run. Bounded to the last minute of ticks so a long match cannot
   * grow this without limit.
   */
  readonly #tickSamples: number[] = [];

  public constructor() {
    super();
    // The default is replaced in onCreate if the lobby chose another map.
    this.#map = loadMap(DEFAULT_MAP_ID);
    this.#wallSegments = allWallSegments(this.#map.walls);
    this.#mapDescriptor = toMapDescriptor(this.#map);
  }

  /**
   * Switch the room to `mapId`, falling back to the default if it is
   * unknown. An unknown id must not take the room down — a stale client
   * asking for a map that was removed should still get a playable match
   * rather than a crash (brief §32).
   */
  private useMap(mapId: string): void {
    try {
      this.#map = loadMap(mapId);
    } catch {
      console.warn(`[match] unknown map ${quote(mapId)}; falling back to ${DEFAULT_MAP_ID}`);
      this.#map = loadMap(DEFAULT_MAP_ID);
    }
    this.#wallSegments = allWallSegments(this.#map.walls);
    this.#mapDescriptor = toMapDescriptor(this.#map);
  }

  /**
   * A spawn point belonging to `team`, cycling through that team's own
   * points as more of its players join.
   *
   * Filtering by team matters: spawning a team-1 player at a team-0 point
   * would drop them in the middle of the enemy's starting position, which
   * is both unfair and exactly the kind of bug that only shows up once
   * more than two people join.
   */
  private nextSpawnPoint(team: number): Vec2 {
    const teamSpawns = this.#map.spawnPoints.filter((spawn) => spawn.team === team);
    const pool = teamSpawns.length > 0 ? teamSpawns : this.#map.spawnPoints;
    const spawn = pool[this.#nextSpawnIndex % pool.length];
    this.#nextSpawnIndex += 1;
    return spawn?.position ?? { x: 0, y: 0 };
  }

  /**
   * This server's room budget (#114). `createGameServer` defines a
   * subclass that supplies it, so a MatchRoom defined any other way fails
   * loudly instead of running uncapped.
   */
  protected get roomBudget(): RoomBudget {
    throw new Error("MatchRoom has no room budget: define it through createGameServer");
  }

  /** This room's slot in the budget: taken first, given back once. */
  #slot: RoomSlot | undefined;

  /**
   * This server's seat limits (#265), supplied by the same subclass as
   * the room budget.
   */
  protected get clientLimits(): ClientLimits {
    throw new Error("MatchRoom has no seat limits: define it through createGameServer");
  }

  /** The seat each client holds: taken in `onAuth`, given back once. */
  readonly #clientSeats = new RoomSeats(this.clientLimits);

  public override async onCreate(options?: unknown): Promise<void> {
    // Before anything else, so a full server refuses cheaply; and given
    // back if creating fails after it was taken.
    this.#slot = new RoomSlot(this.roomBudget);
    this.#slot.take();
    try {
      await this.#create(options);
    } catch (error: unknown) {
      this.#slot.release();
      throw error;
    }
  }

  async #create(options?: unknown): Promise<void> {
    this.autoDispose = true;
    this.maxMessagesPerSecond = FLOOD_MESSAGES_PER_SECOND;

    const seating = field(options, "seating");
    if (seating === undefined) {
      this.maxClients = QUICK_MATCH_MAX_PLAYERS;
    } else {
      // Only the lobby that put the seating there can name it, so a
      // client's own `create` with one is refused here (#41).
      const pending = typeof seating === "string" ? pendingSeatings.get(seating) : undefined;
      if (pending === undefined) {
        throw new Error("A lobby's match is opened by its lobby.");
      }
      // Private, so Quick Match never finds it; exactly as many seats as
      // the lobby reserves, so it is full before any client could ask.
      await this.setPrivate(true);
      this.maxClients = pending.seats.length;
      this.seatReservationTimeout = pending.joinDeadlineSeconds;
      this.#onOver = pending.onOver;
      this.#seats = new Map(
        pending.seats.map((seat) => [
          seat.sessionId,
          { team: seat.team, name: seat.name, used: false },
        ]),
      );
    }

    // Join options are client-supplied; read them defensively rather
    // than dereferencing whatever arrived.
    const requestedMap = field(options, "mapId");
    if (typeof requestedMap === "string") {
      this.useMap(requestedMap);
    }

    // Seeded from the room id so a match is reproducible from its seed
    // (brief §35, §36) rather than depending on Math.random.
    this.#sim = new MatchSimulation({
      seed: this.roomId,
      ruleset: RULESET,
      matchRules: DEFAULT_MATCH_RULES,
      walls: this.#wallSegments,
      bounds: { width: this.#map.width, height: this.#map.height },
    });

    this.onMessage("intent", (client, message: unknown) => {
      if (!this.#budget.take(client.sessionId, this.clock.currentTime)) {
        return;
      }
      const intent = parseClientIntent(message);
      if (intent === undefined) {
        // Malformed or malicious payload: nothing is applied and the
        // sender gets nothing back (brief §32).
        return;
      }
      if (this.#sim.get(client.sessionId) === undefined) {
        return;
      }

      switch (intent.kind) {
        case "stop":
          this.#sim.setInputDirection(client.sessionId, ZERO);
          return;
        case "move":
          this.#sim.setInputDirection(client.sessionId, vec2(intent.dirX, intent.dirY));
          return;
        case "target":
          this.applyTarget(client.sessionId, intent.targetSessionId);
          return;
        case "use-skill": {
          const request = this.#sim.requestSkill(client.sessionId, intent.slot);
          // An enemy skill cast at nobody targets the nearest enemy, so
          // mirror the simulation's target back, as `applyTarget` does.
          const player = this.state.players.get(client.sessionId);
          if (player !== undefined) {
            player.targetSessionId = this.#sim.get(client.sessionId)?.targetId ?? "";
          }
          // Only the caster hears it: a key that does nothing reads as a
          // broken game, and why it did nothing is nobody else's business.
          if (request !== undefined && !request.check.ok) {
            const message: CastRefusedMessage = {
              kind: "skill",
              slot: intent.slot,
              skillId: request.skillId,
              reason: request.check.reason,
            };
            client.send("cast-refused", message);
          }
          return;
        }
        case "attack": {
          const check = this.#sim.requestAttack(client.sessionId, intent.targetId);
          if (check !== undefined && !check.ok) {
            const message: CastRefusedMessage = { kind: "attack", reason: check.reason };
            client.send("cast-refused", message);
          }
          this.mirrorAttack(client.sessionId);
          return;
        }
        case "cancel-attack":
          this.#sim.cancelAttack(client.sessionId);
          this.mirrorAttack(client.sessionId);
          return;
      }
    });

    this.setFixedTimestep((ctx: StepContext) => {
      const startedAt = performance.now();
      this.tick(ctx);
      this.recordTickDuration(performance.now() - startedAt);
    }, RULESET.tickRateHz);
  }

  private recordTickDuration(ms: number): void {
    this.#tickSamples.push(ms);
    if (this.#tickSamples.length > TICK_SAMPLE_LIMIT) {
      this.#tickSamples.shift();
    }
  }

  /**
   * Tick-time statistics over the retained samples (brief §26).
   *
   * Reports p50/p95/max rather than a mean: a mean hides the one tick in
   * fifty that blew the budget, and that tick is exactly the one a player
   * feels as a stutter. `budgetMs` is what a tick is actually allowed to
   * take at the configured rate, so a reader does not have to know the
   * tick rate to judge the numbers.
   */
  public tickMetrics(): TickMetrics {
    const sorted = [...this.#tickSamples].sort((a, b) => a - b);
    const quantile = (q: number): number => {
      if (sorted.length === 0) {
        return 0;
      }
      const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
      return sorted[index] ?? 0;
    };
    return {
      samples: sorted.length,
      budgetMs: TICK_INTERVAL_MS,
      p50Ms: quantile(0.5),
      p95Ms: quantile(0.95),
      maxMs: sorted.length === 0 ? 0 : (sorted[sorted.length - 1] ?? 0),
    };
  }

  /** Mirror an attack change onto the schema at once, as `applyTarget` does. */
  private mirrorAttack(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (player !== undefined) {
      player.attackTargetSessionId = this.#sim.get(sessionId)?.combatant.attack?.targetId ?? "";
    }
  }

  /**
   * Apply a target selection; the simulation decides whether it is valid
   * (brief §5). Mirrored onto the schema at once rather than at the next
   * tick, so a click is answered by the very next patch.
   */
  private applyTarget(sessionId: string, targetSessionId: string | null): void {
    const player = this.state.players.get(sessionId);
    if (player === undefined) {
      return;
    }
    if (this.#sim.setTarget(sessionId, targetSessionId ?? undefined)) {
      player.targetSessionId = targetSessionId ?? "";
    }
  }

  /**
   * Push combat events to every client. The client uses these for
   * floating numbers and a combat log; authoritative *state* still
   * arrives via schema sync, so a dropped event can never desync the
   * simulation — it only costs a visual flourish. An area skill also says
   * where it landed and how far it reached, for the flash (#5). This is
   * not part of `game-protocol`, so the field is additive.
   */
  private broadcastCombatEvents(casterSessionId: string, entry: CombatLogEntry): void {
    const { cause, events, area } = entry;
    if (events.length === 0) {
      return;
    }
    // `cause` says what this was; `skillId` is `""` unless it was a
    // skill, and `weaponId` `""` unless it was a weapon (#162).
    const skillId = entry.skillId ?? "";
    const weaponId = entry.weaponId ?? "";
    this.broadcast(
      "combat",
      area === undefined
        ? { casterSessionId, cause, skillId, weaponId, events }
        : { casterSessionId, cause, skillId, weaponId, events, area },
    );
  }

  private tick(ctx: StepContext): void {
    // A finished match stops simulating but stays joinable, so everyone
    // can read the result before heading back to the lobby.
    if (this.state.phase !== "active") {
      return;
    }

    const result = this.#sim.step(ctx.dt);
    this.state.elapsedSeconds = result.elapsedSeconds;
    this.state.scoreTeam0 = this.#sim.score.byTeam.get(0) ?? 0;
    this.state.scoreTeam1 = this.#sim.score.byTeam.get(1) ?? 0;

    for (const entry of result.log) {
      // On the wire, a status tick is sent as its bearer's, with no
      // skill: who applied the statuses is the combat log's business. A
      // weapon swing goes out as its attacker's, with no skill.
      const casterSessionId =
        entry.cause === "degeneration" ? entry.events[0]?.targetId : entry.sourceId;
      this.broadcastCombatEvents(casterSessionId ?? "", entry);
    }
    this.syncProjectiles();

    for (const [sessionId, player] of this.state.players) {
      const participant = this.#sim.get(sessionId);
      if (participant !== undefined) {
        this.syncPlayer(player, participant);
      }
    }
    for (const client of this.clients) {
      this.sendRecharges(client, false);
    }

    if (result.phase === "finished") {
      void this.endMatch().catch((error: unknown) => {
        console.error("[match] could not end the match", error);
      });
    }
  }

  /**
   * The match just finished: say so, once, to everyone. The tick calls it
   * when the rules say so; tests call it to skip ten minutes of play.
   *
   * Locked first (#249): matchmaking must stop offering the room before
   * anyone hears the match is over, or a Quick Match places a newcomer in
   * a frozen, finished one. An explicit lock, so a leaving player does not
   * reopen it. Players still here keep the result and can reconnect.
   */
  public async endMatch(): Promise<void> {
    if (this.#ending) {
      return;
    }
    this.#ending = true;
    try {
      await this.lock();
    } catch (error: unknown) {
      // Still end it: a match that never says it is over is worse than
      // one Quick Match might still offer.
      console.error("[match] could not lock the finished room", error);
    }
    this.over();
    const outcome = this.#sim.outcome;
    this.state.phase = "finished";
    this.state.winningTeam = outcome.winningTeam ?? -1;
    this.state.endReason = outcome.reason ?? "";
    this.broadcast("match-ended", {
      winningTeam: outcome.winningTeam ?? null,
      reason: outcome.reason,
      scoreTeam0: this.state.scoreTeam0,
      scoreTeam1: this.state.scoreTeam1,
    });
    console.info(
      `[match] finished winner=${String(outcome.winningTeam ?? "draw")} reason=${String(outcome.reason)}`,
    );
  }

  /**
   * Tell one player their own recharges, when they changed in a way the
   * client's countdown cannot know, or always with `force` (on join and
   * reconnect). Never broadcast: an opponent's recharges are private.
   */
  private sendRecharges(client: Client, force: boolean): void {
    const participant = this.#sim.get(client.sessionId);
    if (participant === undefined) {
      return;
    }
    const now = this.#sim.elapsedSeconds;
    const slots = rechargeSlots(participant.skillBar, participant.combatant.cast);
    const sent = this.#rechargesSent.get(client.sessionId);
    if (!force && sent !== undefined && rechargePredicted(sent.slots, now - sent.at, slots)) {
      return;
    }
    this.#rechargesSent.set(client.sessionId, { slots, at: now });
    const message: RechargeMessage = { slots };
    client.send("recharge", message);
  }

  /** Add the shots released this tick and drop those that landed; leave the rest alone. */
  private syncProjectiles(): void {
    const flying = this.#sim.projectiles;
    const ids = new Set(flying.map((projectile) => projectile.id));
    for (let i = this.state.projectiles.length - 1; i >= 0; i -= 1) {
      const shown = this.state.projectiles[i];
      if (shown !== undefined && !ids.has(shown.id)) {
        this.state.projectiles.splice(i, 1);
      }
    }
    const shownIds = new Set(this.state.projectiles.map((projectile) => projectile.id));
    for (const projectile of flying) {
      if (!shownIds.has(projectile.id)) {
        this.state.projectiles.push(
          new ProjectileState({
            id: projectile.id,
            attackerId: projectile.attackerId,
            weaponId: projectile.weaponSnapshot.mainHand.weapon.id,
            x0: projectile.from.x,
            y0: projectile.from.y,
            x1: projectile.aimPoint.x,
            y1: projectile.aimPoint.y,
            launchedAt: this.#sim.elapsedSeconds - projectile.elapsed,
            flightSeconds: projectile.flightSeconds,
          }),
        );
      }
    }
  }

  /** Copy simulation state onto the synchronized schema object. */
  private syncPlayer(player: InstanceType<typeof PlayerState>, sim: Participant): void {
    player.x = sim.position.x;
    player.y = sim.position.y;
    // Rounded, so jitter under a centiradian never costs a patch.
    player.facing = Math.round(sim.facing * 100) / 100;
    player.health = Math.round(sim.combatant.health);
    player.maxHealth = sim.combatant.maxHealth;
    player.energy = Math.round(sim.combatant.energy);
    player.maxEnergy = sim.combatant.maxEnergy;
    player.adrenaline = sim.combatant.adrenaline;
    player.dead = sim.combatant.dead;
    player.armor = sim.combatant.equipment.baseArmor;
    player.weaponId = sim.combatant.equipment.mainHand.weapon.id;
    player.offhandId = sim.combatant.equipment.offhandId ?? "";
    player.attackTargetSessionId = sim.combatant.attack?.targetId ?? "";

    const activeCast = sim.combatant.cast.activeCast;
    player.castingSkillId = activeCast?.skillId ?? "";
    player.castRemaining = activeCast?.remainingSeconds ?? 0;
    player.castTotal = activeCast?.totalSeconds ?? 0;

    const statusIds = sim.combatant.statuses.active.map((s) => s.id);
    // Only rewrite the array when it actually changed: every assignment
    // is a patch on the wire, and statuses change far less often than
    // positions do.
    if (
      player.statuses.length !== statusIds.length ||
      statusIds.some((id, index) => player.statuses[index] !== id)
    ) {
      player.statuses.splice(0, player.statuses.length, ...statusIds);
    }
  }

  /**
   * The team and name a joining player plays under. In a lobby's match
   * those are the team and lobby name of the seat the lobby reserved for
   * their session, and the seat is spent. Only the session id counts, which the server chose, never
   * the join options, which a client did: a seat that lapsed or that a
   * dropped player gave up is free again, and a stranger joining into it
   * is refused.
   * In Quick Match, teams alternate as players join so a 1v1 is
   * adversarial by default.
   */
  private claimSeat(sessionId: string, options: unknown): { team: number; name: string } {
    if (this.#seats === undefined) {
      return {
        team: [...this.#sim.participants()].length % 2,
        // The player's chosen name is client-supplied, so it goes through
        // the same sanitiser the lobby uses before anyone else sees it.
        name: sanitizeName(field(options, "name"), `player-${sessionId.slice(0, 4)}`),
      };
    }
    const seat = this.#seats.get(sessionId);
    if (seat === undefined || seat.used) {
      throw new Error("This match is for its lobby's players only.");
    }
    seat.used = true;
    // The lobby already sanitised and showed this name; a seated player
    // cannot rename themselves on the way in.
    return { team: seat.team, name: seat.name };
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
    this.#clientSeats.take(client.sessionId, peerAddress(context.ip));
    return true;
  }

  public override onJoin(client: Client, options?: unknown): void {
    assertProtocolVersion(options);
    const { team, name } = this.claimSeat(client.sessionId, options);
    const spawn = this.nextSpawnPoint(team);
    const loadout = resolveLoadout(options);

    // Gear becomes numbers exactly once, here, before the combatant
    // exists (ADR-0012). Health, energy and attribute ranks all arrive
    // already including rune and insignia effects, which is why they can
    // stay readonly on `Combatant`.
    const resolved = resolveLoadout_(
      {
        primaryProfession: loadout.primaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      RULESET.combat,
    );

    const sim = this.#sim.add({
      id: client.sessionId,
      team,
      skillBar: loadout.skillBar,
      attributeRanks: resolved.attributeRanks,
      equipment: resolved.equipment,
      spawn,
      facing: spawnFacing(
        spawn,
        this.#map.spawnPoints.filter((point) => point.team !== team).map((point) => point.position),
        this.#map.spawnPoints.map((point) => point.position),
      ),
      maxHealth: resolved.maxHealth,
      maxEnergy: resolved.maxEnergy,
    });

    const player = new PlayerState({
      sessionId: client.sessionId,
      name,
      x: spawn.x,
      y: spawn.y,
      team,
      // Set once, from what the server resolved, never from the claim.
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession ?? "",
      statuses: new ArraySchema<string>(),
    });
    this.state.players.set(client.sessionId, player);
    this.syncPlayer(player, sim);

    const hello: ServerHello = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: client.sessionId,
      tickIntervalMs: TICK_INTERVAL_MS,
    };
    client.send("hello", hello);
    client.send("map", this.#mapDescriptor);
    client.send("skill-bar", {
      slots: sim.skillBar.map((skillId) => {
        const skill = getSkill(skillId);
        return {
          id: skillId,
          name: skill?.name ?? skillId,
          energyCost: skill?.cost?.kind === "energy" ? skill.cost.amount : 0,
          adrenalineCost: skill?.cost?.kind === "adrenaline" ? skill.cost.amount : 0,
          activationSeconds: skill?.activationSeconds ?? 0,
          rechargeSeconds: skill?.rechargeSeconds ?? 0,
        };
      }),
    });
    this.sendRecharges(client, true);

    console.info(
      `[match] join sessionId=${client.sessionId} team=${String(team)} size=${String(this.state.players.size)}`,
    );
  }

  /**
   * Remove a player and everything that referenced them.
   *
   * Separated from `onLeave` because a *dropped* player is only removed
   * after their reconnection window closes, while a player who
   * deliberately left goes immediately.
   */
  private removePlayer(sessionId: string): void {
    this.state.players.delete(sessionId);
    this.#sim.remove(sessionId);
    this.#rechargesSent.delete(sessionId);
    this.#budget.forget(sessionId);
    // A deliberate leave, or a drop whose window closed: the seat is gone.
    this.#clientSeats.release(sessionId);

    for (const player of this.state.players.values()) {
      if (player.targetSessionId === sessionId) {
        player.targetSessionId = "";
      }
    }
  }

  public override async onLeave(client: Client, code?: number): Promise<void> {
    // A player who chose to leave is gone. Anyone else dropped — wifi
    // blip, laptop lid, a switch hiccup — gets a window to come back to
    // the same character rather than losing the match (brief §25).
    //
    // Colyseus reports WHY via the close code rather than a boolean:
    // CONSENTED (4000) is a deliberate leave, anything else is a drop.
    if (code === CloseCode.CONSENTED) {
      this.removePlayer(client.sessionId);
      console.info(`[match] leave sessionId=${client.sessionId} (left deliberately)`);
      return;
    }

    const sim = this.#sim.get(client.sessionId);
    if (sim !== undefined) {
      // Freeze the dropped player rather than leaving them running into
      // a wall while disconnected.
      this.#sim.setInputDirection(client.sessionId, ZERO);
      sim.combatant.cast.cancelCast();
    }

    console.info(
      `[match] ${client.sessionId} dropped; holding their slot for ${String(RECONNECT_WINDOW_SECONDS)}s`,
    );

    try {
      const returned = await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
      console.info(`[match] ${client.sessionId} reconnected`);
      this.sendRecharges(returned, true);
    } catch {
      // Window expired, or the room is shutting down.
      this.removePlayer(client.sessionId);
      console.info(`[match] ${client.sessionId} did not return; slot released`);
    }
  }

  public override onDispose(): void {
    this.#slot?.release();
    this.#clientSeats.releaseAll();
    this.over();
    console.info("[match] disposed");
  }

  /** Tell the opening lobby, once, that this match is over. */
  private over(): void {
    const onOver = this.#onOver;
    this.#onOver = undefined;
    try {
      onOver?.();
    } catch (error: unknown) {
      // The lobby's trouble; it must not stop this tick or dispose.
      console.error("[match] the lobby failed to take its players back", error);
    }
  }
}

/** `MatchRoom`, holding this server's room budget (#114) and seat limits (#265). */
export function budgetedMatchRoom(budget: RoomBudget, limits: ClientLimits): typeof MatchRoom {
  return class extends MatchRoom {
    protected override get roomBudget(): RoomBudget {
      return budget;
    }

    protected override get clientLimits(): ClientLimits {
      return limits;
    }
  };
}

export { IMPLEMENTED_SKILLS, DEFAULT_SKILL_BAR };

// Keep the generated Schema classes' instance types nameable from other modules.
export type MatchStateInstance = InstanceType<typeof MatchState>;
export type PlayerStateInstance = InstanceType<typeof PlayerState>;

import { CloseCode, Room, type Client } from "colyseus";
import { ArraySchema, schema, t } from "@colyseus/schema";
import {
  CastState,
  IMPLEMENTED_SKILLS,
  DEFAULT_MATCH_RULES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  StatusSet,
  ZERO,
  addKill,
  advanceStatuses,
  attributeRanksOf,
  applyEffects,
  canActivate,
  clampInputDirection,
  createRng,
  defaultBuildEquipment,
  emptyScore,
  evaluateMatch,
  getSkill,
  integrateMovement,
  parsePlayerBuild,
  payCost,
  // Named apart from this module's own join-time `resolveLoadout`, which
  // decides *whether* to honour a build; this one turns the gear in an
  // already-accepted build into numbers.
  resolveLoadout as resolveLoadout_,
  validatePlayerBuild,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
  seedFromString,
  vec2,
  type ActivationRejection,
  type CombatEvent,
  type MatchScore,
  type BuildEquipment,
  type PlayerBuild,
  type ProfessionId,
  type Combatant,
  type Segment,
  type SimulationRng,
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments, loadMap, type MapData } from "@vibewars/game-maps";
import {
  PROTOCOL_VERSION,
  parseClientIntent,
  type CastRefusedMessage,
  type MapDescriptor,
  type ServerHello,
  type WallDescriptor,
} from "@vibewars/game-protocol";
import type { StepContext } from "colyseus";

import { sanitizeName } from "./lobby-room.js";
import { assertProtocolVersion, field } from "./options.js";

/**
 * The match simulation room: authoritative movement, targeting and combat
 * (brief §12-§15, §32 "never trust the client").
 *
 * The room owns *transport and state sync*. Every actual game rule lives
 * in `@vibewars/game-core` and is reached through its pure functions, so
 * the same combat can be (and is) tested headlessly with no socket
 * involved (ADR-0001).
 */

export const PlayerState = schema(
  {
    sessionId: t.string(),
    /** Server-assigned display name. Never trusted from the client. */
    name: t.string(),
    x: t.number().default(0),
    y: t.number().default(0),
    targetSessionId: t.string().default(""),

    health: t.number().default(0),
    maxHealth: t.number().default(0),
    energy: t.number().default(0),
    maxEnergy: t.number().default(0),
    adrenaline: t.number().default(0),
    /** Base armor including the off-hand, before statuses. Shown in the HUD. */
    armor: t.number().default(0),
    /** Equipped weapon class id, so a target panel can name it. */
    weaponId: t.string().default(""),
    team: t.number().default(0),
    dead: t.boolean().default(false),

    /** Skill currently being cast, or `""`. Drives the client's cast bar. */
    castingSkillId: t.string().default(""),
    /** Seconds left on the current cast; 0 when not casting. */
    castRemaining: t.number().default(0),
    /** Active condition/hex/enchantment ids, for status markers. */
    statuses: t.array("string"),
  },
  "PlayerState",
);

export const MatchState = schema(
  {
    protocolVersion: t.number().default(PROTOCOL_VERSION),
    players: t.map(PlayerState),

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
  readonly buildName: string | undefined;
  readonly primaryProfession: ProfessionId;
  readonly equipment: BuildEquipment;
}

const HOUSE_LOADOUT: ResolvedJoinLoadout = {
  skillBar: DEFAULT_SKILL_BAR,
  attributeRanks: DEFAULT_ATTRIBUTE_RANKS,
  buildName: undefined,
  primaryProfession: "warrior",
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
      `[match] refusing build ${JSON.stringify(build.name)}: ` +
        problems.map((p) => `${p.field}: ${p.message}`).join("; "),
    );
    return HOUSE_LOADOUT;
  }

  const skillBar = build.skillBar.filter((id): id is string => id !== null);
  if (skillBar.length === 0) {
    console.warn(
      `[match] build ${JSON.stringify(build.name)} has an empty bar; using the house loadout`,
    );
    return HOUSE_LOADOUT;
  }

  return {
    skillBar,
    attributeRanks: attributeRanksOf(build),
    buildName: build.name,
    primaryProfession: build.primaryProfession,
    equipment: build.equipment,
  };
}

// Starting health and energy now come from the ruleset's combat rules,
// via `resolveLoadout` — runes move both, so a fixed constant here
// would quietly override them.
/** Seconds a dead player waits before respawning at their spawn point. */
const RESPAWN_SECONDS = 8;
/**
 * How long a dropped player keeps their slot, character and position.
 * Long enough to survive a wifi blip or a laptop lid, short enough that
 * a quit does not leave a ghost standing in the arena.
 */
const RECONNECT_WINDOW_SECONDS = 30;

function toMapDescriptor(map: MapData): MapDescriptor {
  const walls: WallDescriptor[] = map.walls.map((wall) =>
    wall.kind === "rect"
      ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
      : { kind: "polygon", points: wall.points },
  );
  return { id: map.id, name: map.name, width: map.width, height: map.height, walls };
}

/** Everything the simulation tracks about a player that is not wire state. */
interface PlayerSim {
  readonly combatant: Combatant;
  readonly skillBar: readonly string[];
  inputDirection: Vec2;
  position: Vec2;
  readonly spawn: Vec2;
  respawnInSeconds: number;
}

export class MatchRoom extends Room {
  public override state = new MatchState();

  // Assigned in onCreate once the requested map id is known; a room is
  // never ticked before onCreate runs.
  #map: MapData;
  #wallSegments: readonly Segment[];
  #mapDescriptor: MapDescriptor;
  readonly #sims = new Map<string, PlayerSim>();
  /**
   * Seeded in `onCreate`, not in the constructor: Colyseus assigns
   * `roomId` after construction, so seeding here would hash `undefined`
   * and throw. Non-null by the time any tick runs.
   */
  #rng: SimulationRng = createRng(0);

  #nextSpawnIndex = 0;
  #score: MatchScore = emptyScore([0, 1]);
  #elapsedSeconds = 0;

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
      console.warn(`[match] unknown map ${mapId}; falling back to ${DEFAULT_MAP_ID}`);
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

  public override onCreate(options?: unknown): void {
    this.autoDispose = true;

    // Join options are client-supplied; read them defensively rather
    // than dereferencing whatever arrived.
    const requestedMap = field(options, "mapId");
    if (typeof requestedMap === "string") {
      this.useMap(requestedMap);
    }

    // Seeded from the room id so a match is reproducible from its seed
    // (brief §35, §36) rather than depending on Math.random.
    this.#rng = createRng(seedFromString(this.roomId));

    this.onMessage("intent", (client, message: unknown) => {
      const intent = parseClientIntent(message);
      if (intent === undefined) {
        // Malformed or malicious payload: nothing is applied and the
        // sender gets nothing back (brief §32).
        return;
      }
      const sim = this.#sims.get(client.sessionId);
      if (sim === undefined) {
        return;
      }

      switch (intent.kind) {
        case "stop":
          sim.inputDirection = ZERO;
          return;
        case "move":
          sim.inputDirection = clampInputDirection(vec2(intent.dirX, intent.dirY));
          return;
        case "target":
          this.applyTarget(client.sessionId, intent.targetSessionId);
          return;
        case "use-skill": {
          const refused = this.tryUseSkill(client.sessionId, intent.slot);
          // Only the caster hears it: a key that does nothing reads as a
          // broken game, and why it did nothing is nobody else's business.
          if (refused !== undefined) {
            const message: CastRefusedMessage = { slot: intent.slot, ...refused };
            client.send("cast-refused", message);
          }
          return;
        }
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

  /**
   * Validate and apply a target selection (brief §5).
   *
   * Only existence is required here; range and line of sight are checked
   * at *cast* time, since this genre lets you target anything you can see
   * regardless of whether you can currently reach it.
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
      return;
    }
    player.targetSessionId = targetSessionId;
  }

  /**
   * Begin casting the skill in `slot`, if every activation rule passes.
   *
   * The whole validation gate lives in `game-core`'s `canActivate`; this
   * method only gathers the inputs it needs. A client that asks for an
   * illegal cast does not get one, and is told why: the named rejection
   * is returned for the caller to send back to that client alone.
   *
   * A slot with no skill in it returns nothing to say: the client draws
   * only the slots it was sent, so asking for another one is not a player
   * pressing a key.
   */
  private tryUseSkill(
    sessionId: string,
    slot: number,
  ): { skillId: string; reason: ActivationRejection } | undefined {
    const sim = this.#sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (sim === undefined || player === undefined) {
      return undefined;
    }

    const skillId = sim.skillBar[slot];
    if (skillId === undefined) {
      return undefined;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return undefined;
    }

    const targetSim =
      player.targetSessionId === "" ? undefined : this.#sims.get(player.targetSessionId);

    const check = canActivate({
      skill,
      caster: sim.combatant,
      casterPosition: sim.position,
      target: skill.target === "self" ? sim.combatant : targetSim?.combatant,
      targetPosition: skill.target === "self" ? sim.position : targetSim?.position,
      rechargeRemaining: sim.combatant.cast.rechargeRemaining,
      isCasting: sim.combatant.cast.isCasting,
      skillBar: sim.skillBar,
      losBlockers: this.#wallSegments,
    });

    if (!check.ok) {
      return { skillId: skill.id, reason: check.reason };
    }

    payCost(skill, sim.combatant);
    sim.combatant.cast.beginCast(
      skill.id,
      skill.target === "self" ? sessionId : player.targetSessionId,
      skill.activationSeconds,
    );
    return undefined;
  }

  /** Resolve a cast that has finished its activation time. */
  private resolveCast(
    sessionId: string,
    sim: PlayerSim,
    skillId: string,
    targetId: string | undefined,
  ): void {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return;
    }

    const targetSim = targetId === undefined ? undefined : this.#sims.get(targetId);
    const events = applyEffects(skill.effects, {
      caster: sim.combatant,
      target: skill.target === "self" ? sim.combatant : targetSim?.combatant,
      rng: this.#rng,
      rules: RULESET.combat,
    });

    // Adrenaline is earned by landing damage, never by waiting — which is
    // what makes adrenaline skills a reward for staying in the fight
    // rather than a second energy pool. Weapon auto-attacks (the other
    // classic source) arrive with Sprint 21.
    const dealtDamage = events.some(
      (event) => event.kind === "damage" && event.targetId !== sim.combatant.id,
    );
    if (dealtDamage) {
      sim.combatant.adrenaline = Math.min(
        RULESET.resources.maxAdrenaline,
        sim.combatant.adrenaline + RULESET.resources.adrenalinePerHit,
      );
    }

    // A skill that killed someone scores for the caster's side. Read
    // from the emitted events so every death routes through one place,
    // whether it came from a skill or from degeneration.
    for (const event of events) {
      if (event.kind !== "death") {
        continue;
      }
      const victim = this.#sims.get(event.targetId);
      if (victim !== undefined) {
        victim.respawnInSeconds = RESPAWN_SECONDS;
        this.recordDeath(victim.combatant.team);
      }
    }

    sim.combatant.cast.startRecharge(skill.id, skill.rechargeSeconds);
    this.broadcastCombatEvents(sessionId, skill.id, events);
  }

  /**
   * Push combat events to every client. The client uses these for
   * floating numbers and a combat log; authoritative *state* still
   * arrives via schema sync, so a dropped event can never desync the
   * simulation — it only costs a visual flourish.
   */
  private broadcastCombatEvents(
    casterSessionId: string,
    skillId: string,
    events: readonly CombatEvent[],
  ): void {
    if (events.length === 0) {
      return;
    }
    this.broadcast("combat", { casterSessionId, skillId, events });
  }

  /**
   * Credit a kill to the team that scored it and check for a winner.
   *
   * The victim's team is what is known at the point of death, so a kill
   * is credited to "the other team" rather than to a specific killer.
   * Attributing kills to individuals needs damage-source tracking, which
   * is honest future work rather than something to fake here.
   */
  private recordDeath(victimTeam: number): void {
    if (this.state.phase !== "active") {
      return;
    }
    const scoringTeam = victimTeam === 0 ? 1 : 0;
    this.#score = addKill(this.#score, scoringTeam);
    this.state.scoreTeam0 = this.#score.byTeam.get(0) ?? 0;
    this.state.scoreTeam1 = this.#score.byTeam.get(1) ?? 0;
    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    const outcome = evaluateMatch(this.#score, this.#elapsedSeconds, DEFAULT_MATCH_RULES);
    if (outcome.phase !== "finished") {
      return;
    }
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

  private tick(ctx: StepContext): void {
    // A finished match stops simulating but stays joinable, so everyone
    // can read the result before heading back to the lobby.
    if (this.state.phase !== "active") {
      return;
    }

    this.#elapsedSeconds += ctx.dt;
    this.state.elapsedSeconds = this.#elapsedSeconds;
    this.checkMatchEnd();

    for (const [sessionId, sim] of this.#sims) {
      const player = this.state.players.get(sessionId);
      if (player === undefined) {
        continue;
      }

      if (sim.combatant.dead) {
        sim.respawnInSeconds -= ctx.dt;
        if (sim.respawnInSeconds <= 0) {
          this.respawn(sim);
        }
        this.syncPlayer(player, sim);
        continue;
      }

      this.advanceMovement(sessionId, sim, ctx.dt);

      // Energy regenerates continuously; adrenaline is earned by acting,
      // not by waiting, so it deliberately does not tick up here.
      sim.combatant.energy = Math.min(
        sim.combatant.maxEnergy,
        sim.combatant.energy + RULESET.resources.energyRegenPerSecond * ctx.dt,
      );

      const statusEvents = advanceStatuses(sim.combatant, ctx.dt);
      if (statusEvents.length > 0) {
        this.broadcastCombatEvents(sessionId, "", statusEvents);
      }

      // Degeneration (bleeding, burning, a hex) can kill between ticks.
      // Keyed off the emitted death event rather than re-reading
      // `combatant.dead`: the flag was checked above, so narrowing would
      // claim this is unreachable, and losing this branch would leave a
      // corpse mid-cast that never respawns.
      if (statusEvents.some((event) => event.kind === "death")) {
        sim.combatant.cast.cancelCast();
        sim.respawnInSeconds = RESPAWN_SECONDS;
        this.recordDeath(sim.combatant.team);
        this.syncPlayer(player, sim);
        continue;
      }

      const completed = sim.combatant.cast.advance(ctx.dt);
      if (completed !== undefined) {
        this.resolveCast(sessionId, sim, completed.skillId, completed.targetId);
      }

      this.syncPlayer(player, sim);
    }
  }

  private advanceMovement(sessionId: string, sim: PlayerSim, dt: number): void {
    const radius = RULESET.collision.playerRadius;
    let position = integrateMovement(
      sim.position,
      sim.inputDirection,
      RULESET.movement.maxSpeedUnitsPerSecond,
      dt,
    );

    // Body blocking (brief §21): living players are solid, so a front
    // line can physically deny ground and a caster can be boxed in.
    // Corpses are not solid — standing on a dead player should never
    // trap the living.
    for (const [otherId, other] of this.#sims) {
      if (otherId === sessionId || other.combatant.dead) {
        continue;
      }
      position = resolveCircleCircleCollision(position, radius, other.position, radius);
    }

    // Walls resolve last so a player squeezed between a blocker and a
    // wall ends up outside the wall rather than inside it — being pushed
    // through level geometry is far worse than overlapping a teammate
    // for one tick.
    for (const wallSegment of this.#wallSegments) {
      position = resolveCircleSegmentCollision(position, radius, wallSegment);
    }

    sim.position = position;
  }

  private respawn(sim: PlayerSim): void {
    sim.combatant.dead = false;
    sim.combatant.health = sim.combatant.maxHealth;
    sim.combatant.energy = sim.combatant.maxEnergy;
    sim.combatant.adrenaline = 0;
    sim.combatant.statuses.removeByCategory("condition");
    sim.combatant.statuses.removeByCategory("hex");
    sim.combatant.statuses.removeByCategory("enchantment");
    sim.position = sim.spawn;
    sim.inputDirection = ZERO;
    sim.respawnInSeconds = 0;
  }

  /** Copy simulation state onto the synchronized schema object. */
  private syncPlayer(player: InstanceType<typeof PlayerState>, sim: PlayerSim): void {
    player.x = sim.position.x;
    player.y = sim.position.y;
    player.health = Math.round(sim.combatant.health);
    player.maxHealth = sim.combatant.maxHealth;
    player.energy = Math.round(sim.combatant.energy);
    player.maxEnergy = sim.combatant.maxEnergy;
    player.adrenaline = sim.combatant.adrenaline;
    player.dead = sim.combatant.dead;
    player.armor = sim.combatant.equipment.baseArmor;
    player.weaponId = sim.combatant.equipment.mainHand.weapon.id;

    const activeCast = sim.combatant.cast.activeCast;
    player.castingSkillId = activeCast?.skillId ?? "";
    player.castRemaining = activeCast?.remainingSeconds ?? 0;

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

  public override onJoin(client: Client, options?: unknown): void {
    assertProtocolVersion(options);
    // Alternate teams as players join so a 1v1 is adversarial by default.
    const team = this.#sims.size % 2;
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

    const combatant: Combatant = {
      id: client.sessionId,
      health: resolved.maxHealth,
      maxHealth: resolved.maxHealth,
      energy: resolved.maxEnergy,
      maxEnergy: resolved.maxEnergy,
      adrenaline: 0,
      attributeRanks: resolved.attributeRanks,
      team,
      dead: false,
      statuses: new StatusSet(),
      cast: new CastState(),
      equipment: resolved.equipment,
    };

    const sim: PlayerSim = {
      combatant,
      skillBar: loadout.skillBar,
      inputDirection: ZERO,
      position: spawn,
      spawn,
      respawnInSeconds: 0,
    };
    this.#sims.set(client.sessionId, sim);

    const player = new PlayerState({
      sessionId: client.sessionId,
      // A build name is client-supplied, so it goes through the same
      // sanitiser the lobby uses before any other player ever sees it.
      name: sanitizeName(loadout.buildName, `player-${client.sessionId.slice(0, 4)}`),
      x: spawn.x,
      y: spawn.y,
      team,
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
    this.#sims.delete(sessionId);

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

    const sim = this.#sims.get(client.sessionId);
    if (sim !== undefined) {
      // Freeze the dropped player rather than leaving them running into
      // a wall while disconnected.
      sim.inputDirection = ZERO;
      sim.combatant.cast.cancelCast();
    }

    console.info(
      `[match] ${client.sessionId} dropped; holding their slot for ${String(RECONNECT_WINDOW_SECONDS)}s`,
    );

    try {
      await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
      console.info(`[match] ${client.sessionId} reconnected`);
    } catch {
      // Window expired, or the room is shutting down.
      this.removePlayer(client.sessionId);
      console.info(`[match] ${client.sessionId} did not return; slot released`);
    }
  }

  public override onDispose(): void {
    console.info("[match] disposed");
  }
}

export { IMPLEMENTED_SKILLS, DEFAULT_SKILL_BAR };

// Keep the generated Schema classes' instance types nameable from other modules.
export type MatchStateInstance = InstanceType<typeof MatchState>;
export type PlayerStateInstance = InstanceType<typeof PlayerState>;

import { Room, type Client } from "colyseus";
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
  applyEffects,
  canActivate,
  clampInputDirection,
  createRng,
  emptyScore,
  evaluateMatch,
  getSkill,
  integrateMovement,
  payCost,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
  seedFromString,
  vec2,
  type CombatEvent,
  type MatchScore,
  type Combatant,
  type Segment,
  type SimulationRng,
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

/**
 * The skill bar every player gets until the build editor exists
 * (Sprint 17). Chosen to be immediately playable: damage, a heal, a
 * self-buff, an interrupt, a condition and a cure — enough that two
 * players can have a real fight with counterplay on the very first join.
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

/** Attribute ranks granted to every player until builds exist (Sprint 17). */
const DEFAULT_ATTRIBUTE_RANKS: ReadonlyMap<string, number> = new Map([
  ["elementalist.fire-magic", 12],
  ["monk.healing-prayers", 12],
  ["warrior.swordsmanship", 12],
  ["ranger.marksmanship", 12],
  ["necromancer.curses", 12],
  ["ranger.wilderness-survival", 12],
]);

const STARTING_HEALTH = 500;
const STARTING_ENERGY = 50;
/** Energy regenerated per second, the pacing lever for how often skills fire. */
const ENERGY_REGEN_PER_SECOND = 2;
/** Seconds a dead player waits before respawning at their spawn point. */
const RESPAWN_SECONDS = 8;
/** Adrenaline earned each time one of your skills damages an enemy. */
const ADRENALINE_PER_HIT = 3;
/** Adrenaline ceiling, so it cannot be banked indefinitely between fights. */
const MAX_ADRENALINE = 25;

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
    // than dereferencing whatever arrived (see lobby-room's `field`).
    const requestedMap =
      typeof options === "object" && options !== null
        ? (options as Record<string, unknown>).mapId
        : undefined;
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
        case "use-skill":
          this.tryUseSkill(client.sessionId, intent.slot);
          return;
      }
    });

    this.setFixedTimestep((ctx: StepContext) => {
      this.tick(ctx);
    }, RULESET.tickRateHz);
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
   * method only gathers the inputs it needs. A rejection is logged in dev
   * and otherwise silently ignored — a client that asks for an illegal
   * cast simply does not get one.
   */
  private tryUseSkill(sessionId: string, slot: number): void {
    const sim = this.#sims.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (sim === undefined || player === undefined) {
      return;
    }

    const skillId = sim.skillBar[slot];
    if (skillId === undefined) {
      return;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return;
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
      return;
    }

    payCost(skill, sim.combatant);
    sim.combatant.cast.beginCast(
      skill.id,
      skill.target === "self" ? sessionId : player.targetSessionId,
      skill.activationSeconds,
    );
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
        MAX_ADRENALINE,
        sim.combatant.adrenaline + ADRENALINE_PER_HIT,
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
        sim.combatant.energy + ENERGY_REGEN_PER_SECOND * ctx.dt,
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

  public override onJoin(client: Client): void {
    // Alternate teams as players join so a 1v1 is adversarial by default.
    const team = this.#sims.size % 2;
    const spawn = this.nextSpawnPoint(team);

    const combatant: Combatant = {
      id: client.sessionId,
      health: STARTING_HEALTH,
      maxHealth: STARTING_HEALTH,
      energy: STARTING_ENERGY,
      maxEnergy: STARTING_ENERGY,
      adrenaline: 0,
      attributeRanks: DEFAULT_ATTRIBUTE_RANKS,
      team,
      dead: false,
      statuses: new StatusSet(),
      cast: new CastState(),
    };

    const sim: PlayerSim = {
      combatant,
      skillBar: DEFAULT_SKILL_BAR,
      inputDirection: ZERO,
      position: spawn,
      spawn,
      respawnInSeconds: 0,
    };
    this.#sims.set(client.sessionId, sim);

    const player = new PlayerState({
      sessionId: client.sessionId,
      name: `player-${client.sessionId.slice(0, 4)}`,
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

  public override onLeave(client: Client, code?: number): void {
    this.state.players.delete(client.sessionId);
    this.#sims.delete(client.sessionId);

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

export { IMPLEMENTED_SKILLS, DEFAULT_SKILL_BAR };

// Keep the generated Schema classes' instance types nameable from other modules.
export type MatchStateInstance = InstanceType<typeof MatchState>;
export type PlayerStateInstance = InstanceType<typeof PlayerState>;

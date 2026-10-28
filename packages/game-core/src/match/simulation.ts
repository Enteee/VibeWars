import type { SkillBar } from "../build.js";
import {
  unarmedResolvedEquipment,
  type ResolvedEquipment,
  type ResolvedLoadout,
} from "../equipment/resolve.js";
import type { WeaponId } from "../equipment/weapons.js";
import {
  distanceWithinRange,
  firstHit,
  hasLineOfSight,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
} from "../geometry.js";
import type { Segment } from "../geometry.js";
import { AREA_ADJACENT, RANGE_COMPASS, RANGE_SPIRIT } from "../distances.js";
import {
  addKill,
  DEATH_PENALTY_PERCENT,
  DP_GRACE_AFTER_RES_SECONDS,
  emptyScore,
  evaluateMatch,
  KILL_MORALE_PERCENT,
  MATCH_IN_PROGRESS,
  MORALE_CEILING,
  MORALE_FLOOR,
  moraleMaximum,
  type MatchOutcome,
  type MatchPhase,
  type MatchRules,
  type MatchScore,
  type MatchStanding,
  type TeamStanding,
} from "../match-rules.js";
import { clampInputDirection, integrateMovement } from "../movement.js";
import {
  buildNavGraph,
  createPathFinder,
  nearestStandable,
  type NavGraph,
  type PathFinder,
} from "../pathing.js";
import {
  LEADERSHIP_ATTRIBUTE,
  leadershipEnergy,
  SOUL_REAPING_ATTRIBUTE,
  soulReapingEnergy,
  soulReapingTrigger,
} from "../primary-attributes.js";
import { createRng, seedFromString, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import {
  canActivate,
  hasAftercast,
  payCost,
  type ActivationCheck,
  type ActivationRejection,
} from "../skills/activation.js";
import {
  adrenalineLossIn,
  adrenalinePools,
  emptyAdrenaline,
  gainStrikes,
  gainUnits,
} from "../skills/adrenaline.js";
import { CastState, type ActiveCast } from "../skills/cast-state.js";
import { getSkill } from "../skills/catalog.js";
import { clearChainMarksOn, tickChainMarks } from "../skills/chain.js";
import {
  applyEffects,
  applySkillEffects,
  applyStatus,
  gainEnergy,
  resolveSkillEffects,
  type CombatEvent,
  type SkillOutcome,
  type SkillResolution,
} from "../skills/effects.js";
import {
  aggregateModifiers,
  clampPips,
  ENERGY_PER_PIP,
  isStatusId,
  MAX_PIPS,
  reducedRecharge,
  scaledStatusDuration,
  STATUS_DEFINITIONS,
  StatusSet,
  type ActiveStatus,
  type Outbreak,
  type StatusId,
  type StatusTriggerEvent,
} from "../skills/status.js";
import { effectiveMaxEnergy, recoverOvercast } from "../skills/overcast.js";
import { resolveMagnitude } from "../skills/scaling.js";
import { resolveTargets } from "../skills/targeting.js";
import {
  advanceStatuses,
  effectiveActivationSeconds,
  effectiveMaxHealth,
  naturalHealthPips,
  moveSpeedMultiplier,
  netPips,
  preCapEnergyPips,
  rankOf,
  upkeepPips,
  type NetPips,
} from "../skills/tick.js";
import { isSpell, type Combatant, type CreatureTemplate, type Skill } from "../skills/types.js";
import {
  leadAimPoint,
  PositionHistory,
  trackTarget,
  type Projectile,
  type SkillHit,
  type SpellHit,
} from "../skills/projectile.js";
import {
  attackDurationSeconds,
  attackHitRiders,
  attackReached,
  bearerAttacked,
  bearerHit,
  blindMisses,
  blocks,
  gainCriticalEnergy,
  landBlow,
  nextAttackSkillOf,
  nextAttackSkillRiders,
  PLAIN_BLOW,
  resolveAttackSkill,
  resolveSwing,
  settleBlow,
  skillBlow,
  useNextAttackSkill,
  swingIntervalSeconds,
  weaponSnapshotOf,
} from "../skills/weapon-attack.js";
import {
  fireChangeTriggers,
  fireTriggers,
  type FiredTrigger,
  type SpreadGainedCondition,
  type TriggerContext,
} from "../skills/triggers.js";
import { add, distance, normalize, scale, sub, vec2, ZERO, type Vec2 } from "../vec2.js";
import {
  createCursor,
  decide,
  nearestLiving,
  type Behaviour,
  type BehaviourCursor,
  type ResetPolicy,
} from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { directionAngle, showsBackTo } from "./facing.js";
import { steerAround } from "./steering.js";

/**
 * One match, steppable, with no transport attached (ADR-0017).
 *
 * This is the only copy of the per-tick rules. The server's `MatchRoom`
 * wraps it in sockets and schema sync, `runHeadlessMatch` drives it with
 * behaviours, and the training arena will run it in the browser. Every
 * game rule is still in the pure functions it calls; what lives here is
 * their order within a tick, which is a rule too, and the one that had
 * drifted while it existed twice.
 *
 * Order within a tick, per participant, in the order they were added:
 * reset policy, respawn countdown (if dead), movement, energy regeneration, statuses,
 * cast resolution, the weapon attack (approach or swing), then the
 * participant's behaviour, if it has one. Projectiles already in flight
 * advance, and land, before anyone acts. Player-driven participants have
 * none: their intents arrive between steps, through `setInputDirection`,
 * `walkTo`, `setTarget`, `requestSkill`, `requestAttack` and `cancelAction`.
 */

/** What kind of non-player body this is (#467). */
export type CreatureKind = "spirit" | "minion";

/**
 * A body that is not a player (#1052, ADR-0035): a participant that never
 * counts for its team, has no seat, and is gone once it dies or expires.
 */
export interface Creature {
  /** Whoever summoned it, and whom it answers to: it leaves with them. */
  readonly ownerId: string;
  readonly kind: CreatureKind;
  /** Shown in the target frame and the name label, e.g. "Bone Minion". */
  readonly name: string;
  /** Seconds left before it vanishes; `Infinity`: until it is killed. */
  expiresInSeconds: number;
  /** The tick it was summoned, for "oldest first" caps. */
  readonly summonedAtTick: number;
}

/** At most this many creatures in a match at once (#1052): a summon past it makes as many as fit. */
export const MAX_CREATURES = 32;

/**
 * Whether `participant` counts for its team (ADR-0035): its roster,
 * score, morale and win condition. A creature never does.
 */
export function countsForTeam(participant: Participant): boolean {
  return participant.creature === undefined;
}

export interface ParticipantSpec {
  readonly id: string;
  readonly team: number;
  readonly skillBar: SkillBar;
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly equipment: ResolvedEquipment;
  readonly spawn: Vec2;
  /** Where it faces at the start and after every reset, in radians (`atan2`, 0 = +x). */
  readonly facing: number;
  /** Defaults to the ruleset's base health. */
  readonly maxHealth?: number;
  /** Defaults to the ruleset's base energy. */
  readonly maxEnergy?: number;
  /** Energy regeneration before statuses, in pips. Defaults to 0: none, as a dummy needs. */
  readonly baseEnergyPips?: number;
  /** Health to start (and reset) at, as a fraction of max. Defaults to 1. */
  readonly startHealthFraction?: number | undefined;
  /** Omitted: driven from outside, like a player. */
  readonly behaviour?: Behaviour | undefined;
  /** Omitted: `never`. Death then follows the match rules' respawn. */
  readonly reset?: ResetPolicy | undefined;
  /** Omitted: a player or a training dummy, not a creature (#1052). */
  readonly creature?: Creature | undefined;
}

export interface Participant {
  readonly id: string;
  readonly combatant: Combatant;
  readonly skillBar: SkillBar;
  readonly spawn: Vec2;
  position: Vec2;
  /**
   * Where it faces, in radians, `atan2` convention, in (−π, π], 0 = +x.
   * Where it last pushed, or at what it is casting at or swinging at,
   * whichever came last in the step. The dead keep the facing they died with.
   */
  facing: number;
  inputDirection: Vec2;
  /**
   * Where a click-to-walk is taking it, round walls and bodies (#310);
   * `undefined` when not walking. Until the next step settles it, the
   * point as clicked.
   */
  walkGoal: Vec2 | undefined;
  /**
   * A targeted skill pressed out of range or out of sight, being walked
   * to (#415, #499); `undefined` when there is none. It goes off on
   * arrival, and nothing is paid until then.
   */
  pendingSkill: PendingSkill | undefined;
  targetId: string | undefined;
  respawnInSeconds: number;
  /**
   * Seconds since it was last in combat, by GW1's list (#460): lost
   * health, swung or used an attack skill, began a cast at a foe, or was
   * the target of a foe's as it began. What natural regeneration waits on.
   */
  readonly outOfCombatSeconds: number;
  /** `undefined`: a player or a training dummy (#1052). */
  readonly creature: Creature | undefined;
}

/** A skill walking in to its target (#499). */
export interface PendingSkill {
  readonly slot: number;
  readonly targetId: string;
  /** As an attack's: how long the walk has got nowhere (#218). */
  unreachableSeconds: number;
}

export interface MatchSimulationOptions {
  readonly seed: string | number;
  readonly ruleset?: Ruleset;
  /**
   * Scoring, time limit and respawn. Omitted: the match never ends and
   * the dead stay dead, which is what training and the headless runner
   * want.
   */
  readonly matchRules?: MatchRules | undefined;
  /** Omitted or `[]`: nothing collides with a wall or blocks line of sight. */
  readonly walls?: readonly Segment[];
  /**
   * The map's size: no body leaves it, and an attack's approach never
   * paths outside it (#211). Omitted: an open field with no edge
   * (headless tools).
   */
  readonly bounds?: { readonly width: number; readonly height: number } | undefined;
  readonly participants?: readonly ParticipantSpec[];
}

export interface StepResult {
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly phase: MatchPhase;
  /** Every resolution this step, in the order it happened. */
  readonly log: readonly CombatLogEntry[];
}

/** What `requestSkill` has to say, if anything. */
export interface SkillRequest {
  readonly skillId: string;
  readonly check: ActivationCheck;
  /**
   * Pressed during an aftercast, it goes off when the aftercast ends
   * (#317); a targeted skill pressed out of range or out of sight, when
   * it is walked into range (#415, #499).
   */
  readonly queued?: true;
}

/** `Participant`, plus what only the simulation may change. */
interface ParticipantRecord extends Participant {
  combatant: Combatant;
  skillBar: SkillBar;
  readonly spec: ParticipantSpec;
  readonly behaviour: Behaviour | undefined;
  readonly cursor: BehaviourCursor;
  /** `on-interval`: seconds since the last reset. */
  sinceReset: number;
  outOfCombatSeconds: number;
  /** Where it ended its last ticks: what a projectile leads. */
  readonly history: PositionHistory;
  /** How long the walk has got nowhere, as an attack's `unreachableSeconds` counts for its approach. */
  walkStalledSeconds: number;
  /** The shortest way left to the goal the walk has reached so far: what counts as progress. */
  walkLeast: number;
  /** Whether `walkGoal` is settled: pulled onto a spot a body fits on, with a way there. */
  walkSettled: boolean;
  /**
   * Maximum health and energy before morale (#843): the participant's,
   * or its loadout's since the last `rearm`.
   */
  resolvedMaxHealth: number;
  resolvedMaxEnergy: number;
  /** Match time of the last resurrection (#812); `-Infinity` for none. */
  resurrectedAtSeconds: number;
}

/**
 * Who is behind the degeneration about to tick on `combatant`, split by
 * whether it drains or regenerates.
 *
 * `advanceStatuses` sums every status into one health change, so one
 * damage event can have several causes. The source is named only when
 * there is exactly one; otherwise it is `undefined`, and the tally counts
 * it as unattributed rather than guessing. Splitting `advanceStatuses`
 * per status was rejected: it would change the clamping and death
 * semantics of live combat to improve a readout.
 */
function degenerationSources(combatant: Combatant): {
  draining: string | undefined;
  healing: string | undefined;
} {
  const draining = new Set<string>();
  const healing = new Set<string>();
  for (const status of combatant.statuses.active) {
    const definition = STATUS_DEFINITIONS[status.id];
    if (definition.healthPips < 0) {
      draining.add(status.sourceId);
    } else if (
      definition.healthPips > 0 ||
      definition.healthPipsPerEnchantment !== undefined ||
      definition.healthPerSecondWhileMoving > 0 ||
      definition.healthPerSecond > 0
    ) {
      healing.add(status.sourceId);
    }
  }
  const only = (sources: Set<string>): string | undefined =>
    sources.size === 1 ? [...sources][0] : undefined;
  return { draining: only(draining), healing: only(healing) };
}

/** How far short of its interval a swing or a flight may be and still land; see `#advanceAttack`. */
const SWING_EPSILON = 1e-9;

/** How close to zero a knockdown may be and count as over: 4 s in 0.05 s ticks leaves a float crumb. */
const KNOCKDOWN_EPSILON = 1e-9;

/** What a use of a skill spares when that skill put nothing on its own user (#999). */
const NONE_SPARED: ReadonlySet<StatusId> = new Set();

/** At most this many push-out passes per move; see `advanceMovement`. */
const MOVEMENT_RELAX_PASSES = 4;

/**
 * How long a maintained enchantment's bearer may stay beyond compass
 * range of its caster before it ends, s (#839). GW1 says "a short grace
 * period"; this is our tuning.
 */
const UPKEEP_RANGE_GRACE_SECONDS = 5;

/** How deep a body at `position` is inside a living body at `other`, their radii summing to `reach`. */
function penetration(position: Vec2, other: Vec2, reach: number): number {
  return Math.max(0, reach - distance(position, other));
}

/**
 * An approach step that covers less than this share of the distance it was
 * asked to walk made no progress (#277): boxed in by bodies, or pressed
 * into a wall. A tenth leaves room for a slide round a body or along a
 * wall, which is slower than a straight walk but still progress.
 */
const STALL_FRACTION = 0.1;

/** A walk this close to its goal has arrived (#310). */
const ARRIVE_UNITS = 1;

/**
 * Refusals that mean the target is gone, or no longer one the skill can be
 * used on: a skill walking in to it is dropped (#499). Any other waits for
 * the arrival, where it is checked again.
 */
const TARGET_REJECTIONS: ReadonlySet<ActivationRejection> = new Set([
  "no-target",
  "invalid-target-dead",
  "invalid-target-alive",
  "invalid-target-self",
  "invalid-target-ally",
  "invalid-target-enemy",
]);

/** How a step toward a waypoint went; see `#stepToward`. */
type PathStep = "moved" | "stalled" | "held";

/** Every participant's combatant, without a copy: read each tick (#837). */
function* combatantsOf(records: Iterable<Participant>): Generator<Combatant> {
  for (const record of records) {
    yield record.combatant;
  }
}

/** How far a body walks from `from` along `path`'s waypoints. */
function pathLength(from: Vec2, path: readonly Vec2[]): number {
  let total = 0;
  let at = from;
  for (const next of path) {
    total += distance(at, next);
    at = next;
  }
  return total;
}

/** Turn to face `point`; one exactly underfoot has no direction, so facing stays. */
function faceToward(record: Participant, point: Vec2): void {
  const dx = point.x - record.position.x;
  const dy = point.y - record.position.y;
  if (dx !== 0 || dy !== 0) {
    record.facing = directionAngle(dx, dy);
  }
}

export class MatchSimulation {
  readonly #ruleset: Ruleset;
  readonly #matchRules: MatchRules | undefined;
  readonly #walls: readonly Segment[];
  readonly #bounds: { readonly width: number; readonly height: number } | undefined;
  /** Corners an approach or a walk can path through, built once from the walls (#211). */
  readonly #graph: NavGraph;
  /** Paths round this match's walls, for the attack's approach and for a walk (#211, #267, #310). */
  readonly #paths: PathFinder;
  /** The living bodies a path step steers round, refilled for each one rather than allocated (#277). */
  readonly #bodies: Vec2[] = [];
  readonly #rng: SimulationRng;
  readonly #participants = new Map<string, ParticipantRecord>();
  /**
   * Every team anyone was added to (#846): one whose members all left is
   * still in the standing, wiped, rather than gone.
   */
  readonly #teams = new Set<number>();
  #projectiles: Projectile[] = [];
  #nextProjectileId = 1;

  #tick = 0;
  #elapsedSeconds = 0;
  #score: MatchScore = emptyScore([0, 1]);
  #outcome: MatchOutcome = MATCH_IN_PROGRESS;
  /**
   * The entries for the next step to report: its own, and a cast that a
   * move cancelled since the last one, stamped with when it happened.
   */
  #log: CombatLogEntry[] = [];
  /**
   * Soul Reaping's gains this step (#633), reported after everything
   * else in it: a death is recorded before the entry that holds it is
   * logged, and the gain reads after the death.
   */
  #reaped: CombatLogEntry[] = [];
  /**
   * The team of every death this step with `deathPenalty` on (#843): its
   * foes' +2 morale waits for the end of the step, so nobody who died in
   * it gains.
   */
  #moraleKills: number[] = [];
  /**
   * Where every participant stood as this step began (#921): what
   * `Combatant.moving` is read against at its end. A reset puts its spawn
   * here, so being put back is not walking.
   */
  #stepStart = new Map<string, Vec2>();
  /** The `n` of the next creature's id, `<ownerId>/c<n>` (#1052). */
  #nextCreature = 1;
  /**
   * Creatures that died or expired this step (#1052), in that order:
   * removed once, at its end, never mid-loop.
   */
  readonly #leaving = new Set<string>();

  public constructor(options: MatchSimulationOptions) {
    this.#ruleset = options.ruleset ?? MINIMAL_GW_INSPIRED_PVP_V1;
    this.#matchRules = options.matchRules;
    this.#walls = options.walls ?? [];
    this.#bounds = options.bounds;
    this.#graph = buildNavGraph(this.#walls, options.bounds, this.#ruleset.collision.playerRadius);
    this.#paths = createPathFinder(this.#graph);
    this.#rng = createRng(
      typeof options.seed === "string" ? seedFromString(options.seed) : options.seed,
    );
    for (const spec of options.participants ?? []) {
      this.add(spec);
    }
  }

  public get tick(): number {
    return this.#tick;
  }

  public get elapsedSeconds(): number {
    return this.#elapsedSeconds;
  }

  public get phase(): MatchPhase {
    return this.#outcome.phase;
  }

  /** Who won and why, once `phase` is `"finished"`. */
  public get outcome(): MatchOutcome {
    return this.#outcome;
  }

  public get score(): MatchScore {
    return this.#score;
  }

  /** Ranged weapons' shots in flight, oldest first. */
  public get projectiles(): readonly Readonly<Projectile>[] {
    return this.#projectiles;
  }

  public get(id: string): Participant | undefined {
    return this.#participants.get(id);
  }

  /** A participant's net pips as they stand (#504): what the next tick applies, natural regeneration included. */
  public pips(participant: Participant): NetPips {
    const { combatant, outOfCombatSeconds } = participant;
    return netPips(
      combatant,
      naturalHealthPips(combatant, outOfCombatSeconds, this.#ruleset.resources),
      this.#upkeep(participant.id),
    );
  }

  public participants(): IterableIterator<Participant> {
    return this.#participants.values();
  }

  public add(spec: ParticipantSpec): Participant {
    if (this.#participants.has(spec.id)) {
      throw new Error(`participant ${spec.id} is already in the match`);
    }
    // Either of these resets every tick, which pins the participant at
    // spawn without a word. Refuse it here instead.
    const reset = spec.reset;
    if (reset?.kind === "below-health" && reset.fraction >= (spec.startHealthFraction ?? 1)) {
      throw new Error(
        `participant ${spec.id}: below-health ${String(reset.fraction)} would reset every tick from its start health`,
      );
    }
    if (reset?.kind === "on-interval" && !(reset.everySeconds > 0)) {
      throw new Error(`participant ${spec.id}: on-interval needs everySeconds above 0`);
    }
    const record: ParticipantRecord = {
      id: spec.id,
      combatant: this.#combatant(spec),
      skillBar: spec.skillBar,
      spawn: spec.spawn,
      position: spec.spawn,
      facing: spec.facing,
      inputDirection: ZERO,
      walkGoal: undefined,
      pendingSkill: undefined,
      targetId: undefined,
      respawnInSeconds: 0,
      spec,
      behaviour: spec.behaviour,
      cursor: createCursor(),
      sinceReset: 0,
      outOfCombatSeconds: 0,
      history: new PositionHistory(this.#historyLength()),
      walkStalledSeconds: 0,
      walkLeast: Number.POSITIVE_INFINITY,
      walkSettled: false,
      resolvedMaxHealth: spec.maxHealth ?? this.#ruleset.combat.baseHealth,
      resolvedMaxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      resurrectedAtSeconds: Number.NEGATIVE_INFINITY,
      creature: spec.creature === undefined ? undefined : { ...spec.creature },
    };
    this.#participants.set(spec.id, record);
    if (countsForTeam(record)) {
      this.#teams.add(spec.team);
    }
    return record;
  }

  /**
   * Remove a participant, the creatures it owns (#1052), and every target
   * that pointed at any of them.
   */
  public remove(id: string): void {
    const leaving = new Set([id]);
    for (const record of this.#participants.values()) {
      if (record.creature?.ownerId === id) {
        leaving.add(record.id);
      }
    }
    for (const gone of leaving) {
      this.#participants.delete(gone);
      this.#stepStart.delete(gone);
      this.#leaving.delete(gone);
    }
    for (const other of this.#participants.values()) {
      if (other.targetId !== undefined && leaving.has(other.targetId)) {
        other.targetId = undefined;
      }
    }
  }

  /**
   * `count` creatures of `template` at `owner`, facing as it does, on its
   * team (#1052): as many as `MAX_CREATURES` leaves room for. Added to the
   * end of the match, so they act from this very tick, after everyone
   * already there.
   */
  #summon(owner: ParticipantRecord, template: CreatureTemplate, count: number): void {
    let creatures = 0;
    for (const record of this.#participants.values()) {
      if (record.creature !== undefined && !this.#leaving.has(record.id)) {
        creatures += 1;
      }
    }
    const fits = Math.max(0, Math.min(count, MAX_CREATURES - creatures));
    for (let i = 0; i < fits; i += 1) {
      const id = `${owner.id}/c${String(this.#nextCreature)}`;
      this.#nextCreature += 1;
      this.add({
        id,
        team: owner.combatant.team,
        skillBar: [],
        attributeRanks: new Map(),
        equipment: unarmedResolvedEquipment(template.armor),
        spawn: owner.position,
        facing: owner.facing,
        maxHealth: resolveMagnitude(template.maxHealth, owner.combatant),
        maxEnergy: 0,
        baseEnergyPips: 0,
        behaviour: template.behaviour,
        creature: {
          ownerId: owner.id,
          kind: template.kind,
          name: template.name,
          expiresInSeconds:
            template.durationSeconds === undefined
              ? Number.POSITIVE_INFINITY
              : resolveMagnitude(template.durationSeconds, owner.combatant),
          summonedAtTick: this.#tick,
        },
      });
    }
  }

  /** A body's radius (#1052): a creature's is smaller than a player's. */
  #radiusOf(participant: Participant): number {
    return participant.creature === undefined
      ? this.#ruleset.collision.playerRadius
      : this.#ruleset.collision.creatureRadius;
  }

  /** Every creature that died or expired this step leaves, in that order (#1052). */
  #removeLeaving(): void {
    for (const id of [...this.#leaving]) {
      this.remove(id);
    }
    this.#leaving.clear();
  }

  /**
   * Swap a participant's gear and skills in place: same id, team and
   * position, at the same fraction of their health and full energy, with
   * nothing active and nothing recharging. The loadout carries no skill
   * bar, so it comes separately.
   *
   * The health *fraction* carries over, not the starting health: a build
   * change that moves max health must not be a free heal, and a corpse
   * stays a corpse until its respawn.
   */
  public rearm(id: string, loadout: ResolvedLoadout, skillBar: SkillBar): void {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return;
    }
    const before = record.combatant;
    const fraction = before.maxHealth > 0 ? before.health / before.maxHealth : 0;
    record.combatant = this.#combatant({
      ...record.spec,
      skillBar,
      attributeRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
      maxHealth: loadout.maxHealth,
      maxEnergy: loadout.maxEnergy,
      baseEnergyPips: loadout.baseEnergyPips,
    });
    record.resolvedMaxHealth = loadout.maxHealth;
    record.resolvedMaxEnergy = loadout.maxEnergy;
    this.#setMorale(record, before.morale);
    record.combatant.health = record.combatant.maxHealth * fraction;
    record.combatant.dead = before.dead;
    record.combatant.soulReapingTriggers = before.soulReapingTriggers;
    record.skillBar = skillBar;
    record.pendingSkill = undefined;
  }

  /** Put a participant back as they started, exactly as a respawn does. */
  public resetParticipant(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#reset(record, "reset");
    }
  }

  /**
   * Walk. Any direction but none cancels the attack and the cast, as
   * moving does in GW1 (#279). The cast stays paid for and does not
   * recharge. Only a new direction cancels: one held as a cast begins was
   * dropped by `requestSkill`, and the client sends only changes. An
   * instant skill waits for the next step to resolve, but it has no cast
   * to walk out of, so a move leaves it alone.
   *
   * Any direction, none included (`stop`), ends a click-to-walk (#310).
   *
   * Knocked down, nothing moves (#468), but the direction is still kept:
   * it mirrors the keyboard, so a key held through the knockdown walks on
   * the tick the body rises. There is nothing to interrupt while down.
   */
  public setInputDirection(id: string, direction: Vec2): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      record.inputDirection = clampInputDirection(direction);
      record.walkGoal = undefined;
      const moving = record.inputDirection.x !== 0 || record.inputDirection.y !== 0;
      if (moving && record.combatant.knockdownRemaining <= 0) {
        this.#moveInterrupts(record);
      }
    }
  }

  /**
   * Walk to `point`, round walls and bodies, and stop there (#310): a
   * left-click on the ground. It interrupts what a move does, the attack
   * and a cast (#279), and keeps the target, so Space resumes the attack.
   *
   * A point a body cannot stand on, inside a wall or off the map, walks
   * to the nearest one that it can. A goal with no way there at all is
   * no walk; the hero only stops.
   *
   * Knocked down, the click is refused, not kept for rising (#468).
   *
   * Only the point is kept here. The next step settles it, once however
   * many clicks arrived since: settling costs a path search, and a client
   * may send hundreds of clicks a second.
   */
  public walkTo(id: string, point: Vec2): void {
    const record = this.#participants.get(id);
    if (record === undefined || record.combatant.dead || record.combatant.knockdownRemaining > 0) {
      return;
    }
    record.inputDirection = ZERO;
    this.#moveInterrupts(record);
    record.walkGoal = point;
    record.walkSettled = false;
    record.walkStalledSeconds = 0;
    record.walkLeast = Number.POSITIVE_INFINITY;
  }

  /**
   * Moving cancels the attack, a skill walking in (#499) and a cast with
   * a cast time, as in GW1 (#279). In the aftercast it drops the skill
   * queued for after it, so the walk goes when the aftercast ends instead
   * of being swallowed by the queued cast (#317).
   */
  #moveInterrupts(record: ParticipantRecord): void {
    record.combatant.attack = undefined;
    record.pendingSkill = undefined;
    this.#cancelCast(record);
    record.combatant.cast.clearQueue();
  }

  /**
   * Cancel Action, Esc in GW1 (#300): stop the cast, the attack and a
   * walk to a clicked point (#310) in one press, whichever are running.
   * The cast ends as walking ends it, paid for and not recharging. A skill
   * queued for after the aftercast, or walking in (#499), is dropped too
   * (#317). With none of these, nothing happens.
   */
  public cancelAction(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#cancelCast(record);
      record.combatant.attack = undefined;
      record.pendingSkill = undefined;
      record.combatant.cast.clearQueue();
      record.walkGoal = undefined;
    }
  }

  /**
   * End an enchantment `casterId` maintains on `targetId` (#838): a
   * double-click on its icon in GW1. It leaves the bearer at once, for
   * free, with no log row, and the upkeep stops with it. Anything but a
   * maintained `statusId` of the caster's own on that target is refused
   * quietly, so a click that raced a drop does nothing. Whether it ended.
   */
  public endUpkeep(casterId: string, targetId: string, statusId: string): boolean {
    const bearer = this.#participants.get(targetId)?.combatant;
    if (bearer === undefined || !isStatusId(statusId)) {
      return false;
    }
    const status = bearer.statuses.get(statusId);
    if (status === undefined || status.maintained === null || status.sourceId !== casterId) {
      return false;
    }
    return bearer.statuses.remove(statusId);
  }

  /**
   * Abandon `record`'s cast and log it as `"cancelled"`. An instant skill
   * has no cast to give up, so it is left to resolve.
   */
  #cancelCast(record: ParticipantRecord): void {
    const cast = record.combatant.cast.activeCast;
    if (cast !== undefined && cast.totalSeconds > 0) {
      record.combatant.cast.cancelCast();
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: cast.skillId,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: [{ kind: "cancelled", targetId: record.id, skillId: cast.skillId }],
      });
    }
  }

  /**
   * Attack `targetId` with the equipped weapon until told otherwise
   * (ADR-0026): walk into reach, then swing at the weapon's rate.
   *
   * Asking again for the same target keeps the swing in progress; a new
   * target starts a fresh one. Refused, with the reason a cast at it
   * would get, unless the target is a living enemy and the attacker is
   * alive. Range and line of sight are not checked: approach closes the
   * one, and a ranged swing checks the other as it is released, so an
   * attack can start behind a corner and walk out.
   *
   * An attack allowed ends a click-to-walk, and its approach takes over
   * (#310); one refused leaves the walk going. One at anyone but the
   * target of a skill walking in drops that skill (#499).
   */
  public requestAttack(id: string, targetId: string): ActivationCheck | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }
    const check = this.#attackCheck(record, targetId);
    if (check.ok) {
      record.walkGoal = undefined;
      if (record.pendingSkill?.targetId !== targetId) {
        record.pendingSkill = undefined;
      }
      if (record.combatant.attack?.targetId !== targetId) {
        record.combatant.attack = { targetId, swingElapsed: 0, unreachableSeconds: 0 };
      }
    }
    return check;
  }

  /**
   * Validate and apply a target selection (brief §5).
   *
   * Only existence is required here; range and line of sight are checked
   * at *cast* time, since this genre lets you target anything you can see
   * regardless of whether you can currently reach it.
   *
   * @returns whether the selection was applied
   */
  public setTarget(id: string, targetId: string | undefined): boolean {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return false;
    }
    if (targetId === undefined) {
      record.targetId = undefined;
      return true;
    }
    if (!this.#participants.has(targetId)) {
      return false;
    }
    record.targetId = targetId;
    return true;
  }

  /**
   * Begin casting the skill in `slot`, if every activation rule passes.
   *
   * The whole validation gate lives in `canActivate`; this method only
   * gathers the inputs it needs. A participant that asks for an illegal
   * cast does not get one, and the returned check says why.
   *
   * A slot with no skill in it returns nothing to say: the client draws
   * only the slots it was sent, so asking for another one is not a player
   * pressing a key.
   *
   * With no target, an enemy-targeted skill targets the nearest living
   * enemy first, picked exactly as a behaviour picks one. That target
   * stays selected, whether or not the cast is then allowed.
   *
   * An ally-targeted skill with nothing or an enemy selected goes to the
   * caster, as in GW1 (#52). The enemy stays selected, so a monk can heal
   * themself mid-fight without losing the target.
   */
  public requestSkill(id: string, slot: number): SkillRequest | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }

    const skillId = record.skillBar[slot];
    if (skillId === undefined || skillId === null) {
      return undefined;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return undefined;
    }

    if (skill.target === "single-enemy" && record.targetId === undefined) {
      const team = record.combatant.team;
      record.targetId = nearestLiving(
        record,
        this.#participants.values(),
        (other) => other.combatant.team !== team,
      );
    }

    const castTargetId = skill.target === "self" ? id : this.#castTarget(record, skill);
    const check = this.#check(record, skill, castTargetId);
    // Out of range or out of sight, a skill walks in and goes off there,
    // as Space does (#415, operator Q61). Range and line of sight are
    // checked last, so everything else has passed; it is all checked
    // again on arrival. An attack skill turns on its target with the
    // weapon as it goes; any other leaves the attack to pause and resume.
    if (
      !check.ok &&
      (check.reason === "out-of-range" || check.reason === "no-line-of-sight") &&
      castTargetId !== undefined
    ) {
      record.walkGoal = undefined;
      record.combatant.cast.clearQueue();
      record.pendingSkill = { slot, targetId: castTargetId, unreachableSeconds: 0 };
      if (skill.attack !== undefined) {
        record.combatant.attack = {
          targetId: castTargetId,
          swingElapsed: 0,
          unreachableSeconds: 0,
        };
      }
      return { skillId: skill.id, check: { ok: true }, queued: true };
    }
    return this.#useSkill(record, slot, skill, castTargetId, check);
  }

  /**
   * The rest of `requestSkill`, once its target is known and `check`
   * made: queue it behind an aftercast, or pay for it and begin it. Also
   * how a skill walking in goes off on arrival (#415, #499).
   */
  #useSkill(
    record: ParticipantRecord,
    slot: number,
    skill: Skill,
    castTargetId: string | undefined,
    check: ActivationCheck,
  ): SkillRequest {
    if (!check.ok) {
      return { skillId: skill.id, check };
    }
    // Another skill, accepted, drops one walking in: the press replaces it.
    record.pendingSkill = undefined;
    // During an aftercast a skill with an activation time, or an attack
    // skill, which takes its weapon's, waits for it to end, as in GW1
    // (#317): checked now, so one that could never go off is refused at
    // once, and tried again for real when it fires. An instant goes off at
    // once.
    if (
      record.combatant.cast.inAftercast &&
      (skill.activationSeconds > 0 || skill.attack !== undefined)
    ) {
      record.combatant.cast.queue(slot);
      return { skillId: skill.id, check, queued: true };
    }

    payCost(skill, record.combatant);
    this.#useGlyph(record, skill);
    // The swing in progress is lost, as in GW1; the attack itself resumes
    // once the skill is done.
    if (record.combatant.attack !== undefined) {
      record.combatant.attack.swingElapsed = 0;
    }
    const activationSeconds =
      skill.attack === undefined
        ? effectiveActivationSeconds(
            skill,
            record.combatant,
            castTargetId === undefined
              ? undefined
              : this.#participants.get(castTargetId)?.combatant,
          )
        : this.#attackHitSeconds(record, skill);
    record.combatant.cast.beginCast(
      skill.id,
      castTargetId,
      activationSeconds,
      skill.whileActivating,
    );
    this.#castBegun(record, skill, castTargetId);
    // Casting stops you (operator Q33): a key held as the cast begins
    // does not walk, and only the next move cancels the cast. An instant
    // has no cast, so it leaves the walk alone. A click-to-walk stops the
    // same way (#310).
    if (activationSeconds > 0) {
      record.inputDirection = ZERO;
      record.walkGoal = undefined;
    }
    return { skillId: skill.id, check };
  }

  /**
   * A spell starting, paid for, uses up one of the next spells an active
   * glyph holds (#526): an interrupt or a cancel after this does not give
   * it back, as in GW1. A glyph spent logs its end.
   */
  #useGlyph(record: ParticipantRecord, skill: Skill): void {
    if (!isSpell(skill.type)) {
      return;
    }
    const ended = record.combatant.statuses.countSpellStarted();
    if (ended.length > 0) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: skill.id,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: ended.map((statusId) => ({
          kind: "status-expired",
          targetId: record.id,
          statusId,
        })),
      });
    }
  }

  /**
   * A cast beginning puts its caster in combat if it is an attack skill
   * or at a foe, and that foe too: cancelled or interrupted later, it
   * still counted (GW1). A self-heal or a skill on an ally does not.
   */
  /**
   * A blow or attack skill started keeps adrenaline (#828) for its
   * attacker and its foe: a hit for 0, which logs no damage, or one that
   * is blocked is still a fight.
   */
  #blowStarted(record: ParticipantRecord, target: ParticipantRecord | undefined): void {
    record.combatant.lastCombatAt = this.#elapsedSeconds;
    if (target !== undefined && target.combatant.team !== record.combatant.team) {
      target.combatant.lastCombatAt = this.#elapsedSeconds;
    }
  }

  #castBegun(record: ParticipantRecord, skill: Skill, castTargetId: string | undefined): void {
    const target = castTargetId === undefined ? undefined : this.#participants.get(castTargetId);
    const atFoe = target !== undefined && target.combatant.team !== record.combatant.team;
    if (skill.attack !== undefined || atFoe) {
      record.outOfCombatSeconds = 0;
    }
    // Only an attack skill keeps adrenaline (#828), its own and its foe's,
    // as a blow does; a spell at a foe does not.
    if (skill.type === "attack") {
      this.#blowStarted(record, target);
    }
    if (atFoe) {
      target.outOfCombatSeconds = 0;
    }
  }

  public step(dt: number): StepResult {
    // A finished match stops simulating, so everyone can read the result.
    if (this.phase !== "active") {
      return this.#result([]);
    }

    this.#tick += 1;
    this.#elapsedSeconds += dt;
    this.checkMatchEnd();
    for (const record of this.#participants.values()) {
      this.#stepStart.set(record.id, record.position);
    }
    // Every knockdown counts down before anyone acts, so one lasts its
    // full duration whoever lands it, and the tick it ends is one its
    // bearer acts in again (#468).
    for (const record of this.#participants.values()) {
      this.#advanceKnockdown(record.combatant, dt);
      tickChainMarks(record.combatant, dt);
    }
    this.#advanceProjectiles(dt);

    for (const record of this.#participants.values()) {
      if (this.#resetDue(record, dt)) {
        this.#reset(record, "reset");
      }
      // Overcast recovers alive or dead (#461, GW1).
      recoverOvercast(record.combatant, this.#ruleset.resources.overcastRecoveryPerSecond, dt);

      if (record.combatant.dead) {
        record.respawnInSeconds -= dt;
        if (record.respawnInSeconds <= 0) {
          this.#reset(record, "respawn");
        }
        continue;
      }

      // A creature that has run its time vanishes (#1052): no death, so
      // nothing answers it and nobody scores.
      if (record.creature !== undefined) {
        record.creature.expiresInSeconds -= dt;
        if (record.creature.expiresInSeconds < SWING_EPSILON) {
          this.#leaving.add(record.id);
          continue;
        }
      }

      // Adrenaline does not keep between fights (#828): out of combat for
      // the whole window, within a hair, as a swing's interval is.
      const lossIn = adrenalineLossIn(
        record.combatant,
        this.#elapsedSeconds,
        this.#ruleset.resources.adrenalineLossSeconds,
      );
      if (lossIn !== null && lossIn < SWING_EPSILON) {
        emptyAdrenaline(record.combatant);
      }

      // Knocked down, it does nothing at all; its statuses and recharges
      // run on (#468). Read here, so one landed earlier this tick counts.
      const down = record.combatant.knockdownRemaining > 0;

      // The aftercast holds the body still; a held direction or a clicked
      // point is kept for after it.
      if (!down && !record.combatant.cast.inAftercast) {
        this.advanceMovement(record, record.inputDirection, dt);
        this.#advanceWalk(record, dt);
      }

      // Degeneration its statuses' own regeneration does not cancel is
      // health lost, so natural regeneration stops before it would.
      const modifiers = aggregateModifiers(record.combatant.statuses.active);
      record.outOfCombatSeconds += dt;
      if (clampPips(modifiers.healthPips) < 0) {
        record.outOfCombatSeconds = 0;
      }
      const natural = naturalHealthPips(
        record.combatant,
        record.outOfCombatSeconds,
        this.#ruleset.resources,
      );

      // Energy regenerates continuously, at the net pips (GW1); adrenaline
      // is earned by acting, not by waiting, so it deliberately does not
      // tick up here.
      const energyPips = netPips(record.combatant, natural, this.#upkeep(record.id)).energy;
      // Up to the ceiling overcast leaves, which can be below 0 (#461).
      record.combatant.energy = Math.max(
        0,
        Math.min(
          effectiveMaxEnergy(record.combatant),
          record.combatant.energy + energyPips * ENERGY_PER_PIP * dt,
        ),
      );

      const sources = degenerationSources(record.combatant);
      const statusEvents = advanceStatuses(record.combatant, dt, natural);
      if (statusEvents.length > 0) {
        const drained = statusEvents.some((event) => event.kind === "damage");
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: drained ? sources.draining : sources.healing,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: statusEvents,
        });
      }

      // Degeneration (bleeding, burning, a hex) can kill between ticks.
      // Keyed off the emitted death event rather than re-reading
      // `combatant.dead`: the flag was checked above, so narrowing would
      // claim this is unreachable, and losing this branch would leave a
      // corpse mid-cast that never respawns.
      if (statusEvents.some((event) => event.kind === "death")) {
        this.#recordDeaths(statusEvents);
        continue;
      }

      const wasInAftercast = record.combatant.cast.inAftercast;
      const completed = record.combatant.cast.advance(dt);
      if (completed !== undefined) {
        this.resolveCast(record, completed, dt);
      }
      // A skill pressed during the aftercast goes off the tick it ends. A
      // refusal now is dropped: nobody is pressing a key at this moment.
      if (wasInAftercast && !record.combatant.cast.inAftercast) {
        const queued = record.combatant.cast.takeQueued();
        if (queued !== undefined) {
          this.requestSkill(record.id, queued);
        }
      }

      if (!down) {
        this.#advancePendingSkill(record, dt);
        this.#advanceAttack(record, dt);
        this.#faceCastTarget(record);
      }
      // Walked or approached: either way, it is what a shot leads.
      record.history.push(record.position);

      // Behaviours act after their own cast resolves, so a dummy can
      // finish one cast and begin the next within the same tick.
      if (record.behaviour !== undefined && !down) {
        this.#act(record, record.behaviour, dt);
      }
    }

    this.#settleUpkeep(dt);
    this.#spreadStatuses();
    this.#fireStatusChanges();
    this.#awardKillMorale();
    this.#settleMoving();
    this.#removeLeaving();
    // After every death this step, so two teams wiped in it both lose.
    this.checkMatchEnd();

    const log = this.#log.concat(this.#reaped);
    this.#log = [];
    this.#reaped = [];
    this.#healthLost(log);
    return this.#result(log);
  }

  /**
   * Maintained enchantments that end by themselves (#837, GW1), once
   * everyone has acted. A death ends one, the bearer's or its caster's.
   * A bearer beyond compass range of its caster for longer than the grace
   * period loses it, unlogged; coming back starts the grace again (#839).
   * Past the cap, a caster whose upkeep takes its pre-cap energy pips below
   * −`MAX_PIPS` loses its oldest. And a caster at 0 energy whose pre-cap
   * net is below 0 loses its newest, then the next, until it can pay, each
   * with a log row of its own. Pre-cap, never the clamped rate the tick
   * applies.
   */
  #settleUpkeep(dt: number): void {
    const maintained = new Map<string, { bearer: Combatant; id: StatusId; seq: number }[]>();
    for (const record of this.#participants.values()) {
      const bearer = record.combatant;
      for (const status of bearer.statuses.active) {
        if (status.maintained === null) {
          continue;
        }
        // Ended by its caster's death, or its caster leaving the match. A
        // dead bearer has none left: its death ended them all (#940).
        const caster = this.#participants.get(status.sourceId);
        if (caster === undefined || caster.combatant.dead) {
          bearer.statuses.remove(status.id);
          continue;
        }
        status.maintained.outOfRangeSeconds =
          distance(caster.position, record.position) > RANGE_COMPASS
            ? status.maintained.outOfRangeSeconds + dt
            : 0;
        if (status.maintained.outOfRangeSeconds > UPKEEP_RANGE_GRACE_SECONDS) {
          bearer.statuses.remove(status.id);
          continue;
        }
        const held = maintained.get(status.sourceId) ?? [];
        held.push({ bearer, id: status.id, seq: status.maintained.seq });
        maintained.set(status.sourceId, held);
      }
    }
    for (const [casterId, held] of maintained) {
      const caster = this.#participants.get(casterId)?.combatant;
      if (caster === undefined) {
        continue;
      }
      held.sort((a, b) => a.seq - b.seq);
      let upkeep = -held.length;
      // Over the cap: the oldest give way to the newest, which stays even
      // alone. Checked every tick, so in practice it is the cast that
      // crosses it.
      while (held.length > 1 && preCapEnergyPips(caster, upkeep) < -MAX_PIPS) {
        const oldest = held.shift();
        oldest?.bearer.statuses.remove(oldest.id);
        upkeep += 1;
      }
      // Can't pay: the newest goes first, until the rest can be paid for.
      const events: CombatEvent[] = [];
      while (caster.energy <= 0 && preCapEnergyPips(caster, upkeep) < 0) {
        const newest = held.pop();
        if (newest === undefined) {
          break;
        }
        newest.bearer.statuses.remove(newest.id);
        upkeep += 1;
        events.push({
          kind: "upkeep-lost",
          targetId: newest.bearer.id,
          statusId: newest.id,
          casterId,
        });
      }
      if (events.length > 0) {
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "skill",
          sourceId: casterId,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events,
        });
      }
    }
  }

  /** What `casterId` pays for the enchantments it maintains, in pips (#837). */
  #upkeep(casterId: string): number {
    return upkeepPips(casterId, combatantsOf(this.#participants.values()));
  }

  /**
   * Spreading statuses (#765), once everyone has acted: every living
   * combatant adjacent to a living bearer, on either team, catches it for
   * as long as the bearer has left, once per outbreak. Who carries what
   * is read before anyone catches anything, so one caught this step
   * spreads from the next, and in the participants' fixed order, so the
   * same seed spreads the same way.
   */
  #spreadStatuses(): void {
    const living = [...this.#participants.values()].filter((record) => !record.combatant.dead);
    const carriers: {
      readonly record: ParticipantRecord;
      readonly status: ActiveStatus;
      readonly outbreak: Outbreak;
      readonly remainingSeconds: number;
    }[] = [];
    for (const record of living) {
      for (const status of record.combatant.statuses.active) {
        if (status.outbreak !== null) {
          // Its bearer is in it, so it never catches its own outbreak back.
          status.outbreak.infected.add(record.id);
          carriers.push({
            record,
            status,
            outbreak: status.outbreak,
            remainingSeconds: status.remainingSeconds,
          });
        }
      }
    }
    for (const { record, status, outbreak, remainingSeconds } of carriers) {
      for (const other of living) {
        if (
          outbreak.infected.has(other.id) ||
          distance(record.position, other.position) > AREA_ADJACENT
        ) {
          continue;
        }
        outbreak.infected.add(other.id);
        const had = other.combatant.statuses.has(status.id);
        other.combatant.statuses.catch(
          status.id,
          scaledStatusDuration(other.combatant, status.id, remainingSeconds),
          status.sourceId,
          outbreak,
        );
        // Already carrying it, from another outbreak: nothing new to say.
        if (had) {
          continue;
        }
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: status.sourceId,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: [
            { kind: "status-spread", targetId: other.id, fromId: record.id, statusId: status.id },
          ],
        });
      }
    }
  }

  /** Losing health of any kind, a hit, a sacrifice, a drain or a steal, is being in combat. */
  #healthLost(log: readonly CombatLogEntry[]): void {
    for (const entry of log) {
      for (const event of entry.events) {
        if (
          (event.kind === "damage" ||
            event.kind === "sacrifice" ||
            event.kind === "health-lost" ||
            event.kind === "life-stolen") &&
          event.amount > 0
        ) {
          const target = this.#participants.get(event.targetId);
          if (target !== undefined) {
            target.outOfCombatSeconds = 0;
          }
        }
      }
    }
  }

  #result(log: readonly CombatLogEntry[]): StepResult {
    return { tick: this.#tick, elapsedSeconds: this.#elapsedSeconds, phase: this.phase, log };
  }

  /** Who a targeted skill lands on: the selection, or the caster for an ally skill with no ally selected. */
  #castTarget(record: ParticipantRecord, skill: Skill): string | undefined {
    if (skill.target !== "single-ally") {
      return record.targetId;
    }
    const selected =
      record.targetId === undefined ? undefined : this.#participants.get(record.targetId);
    return selected?.combatant.team === record.combatant.team ? selected.id : record.id;
  }

  /** The one activation check, for a cast and for a behaviour asking whether it could. */

  #check(record: ParticipantRecord, skill: Skill, targetId: string | undefined): ActivationCheck {
    const target = targetId === undefined ? undefined : this.#participants.get(targetId);
    return canActivate({
      skill,
      caster: record.combatant,
      casterPosition: record.position,
      target: skill.target === "self" ? record.combatant : target?.combatant,
      targetPosition: skill.target === "self" ? record.position : target?.position,
      rechargeRemaining: record.combatant.cast.rechargeRemaining,
      isCasting: record.combatant.cast.isCasting,
      skillBar: record.skillBar,
      losBlockers: this.#walls,
    });
  }

  /** Put a behaviour's intent through the same calls a player's messages make. */
  #act(record: ParticipantRecord, behaviour: Behaviour, dt: number): void {
    const intent = decide(behaviour, record.cursor, {
      self: record,
      participants: [...this.#participants.values()],
      dt,
      // The same slowed speed advanceMovement will move it at, so a
      // crippled dummy plans with the step it will really take.
      stepUnits: this.#stepUnits(record, dt),
      canUse: (skillId, targetId) => {
        const skill = getSkill(skillId);
        return skill !== undefined && this.#check(record, skill, targetId).ok;
      },
    });
    this.setInputDirection(record.id, intent.moveDirection);
    this.setTarget(record.id, intent.targetId);
    // Asked only while no attack is going, as a player presses Space once.
    if (intent.attackTargetId !== undefined && record.combatant.attack === undefined) {
      this.requestAttack(record.id, intent.attackTargetId);
    }
    if (intent.useSkillId !== undefined) {
      const slot = record.skillBar.indexOf(intent.useSkillId);
      if (slot !== -1) {
        this.requestSkill(record.id, slot);
      }
    }
    // As a skill effect applies it: the dummy is the source, so the
    // degeneration it causes is attributed to the dummy, and so is the
    // health a deep wound takes as it lands.
    for (const application of intent.applyStatuses) {
      const target = this.#participants.get(application.targetId);
      if (target !== undefined && !target.combatant.dead) {
        const loss = applyStatus(
          target.combatant,
          application.statusId,
          scaledStatusDuration(target.combatant, application.statusId, application.durationSeconds),
          record.id,
        );
        if (loss > 0) {
          this.#log.push({
            tick: this.#tick,
            atSeconds: this.#elapsedSeconds,
            cause: "skill",
            sourceId: record.id,
            skillId: undefined,
            weaponId: undefined,
            attributeId: undefined,
            area: undefined,
            doubleStrike: false,
            events: [
              {
                kind: "health-lost",
                targetId: target.id,
                amount: loss,
                statusId: application.statusId,
              },
            ],
          });
        }
      }
    }
  }

  /**
   * How long an attack skill winds up before its blow lands (ADR-0029):
   * half of its activation, or of a swing of the weapon when it states
   * none, after attack-speed effects. Its recovery is as long again.
   */
  #attackHitSeconds(record: ParticipantRecord, skill: Skill): number {
    const base =
      skill.activationSeconds > 0
        ? skill.activationSeconds
        : record.combatant.equipment.mainHand.weapon.attackIntervalSeconds;
    return attackDurationSeconds(record.combatant, base) / 2;
  }

  /**
   * Leadership's energy for a shout or a chant (#625, #758): one for
   * each ally it reached, the shouter included, however many events each got, up to
   * the rank's cap. Pushed onto the shout's own events, so its log entry
   * carries the gain.
   */
  #gainLeadershipEnergy(record: ParticipantRecord, events: CombatEvent[]): void {
    const team = record.combatant.team;
    const affected = new Set(
      events
        .map((event) => event.targetId)
        .filter((id) => this.#participants.get(id)?.combatant.team === team),
    );
    const rank = rankOf(record.combatant, LEADERSHIP_ATTRIBUTE);
    gainEnergy(record.combatant, leadershipEnergy(rank, affected.size), events);
  }

  /** Resolve a cast that has finished its activation time. */
  private resolveCast(record: ParticipantRecord, cast: ActiveCast, dt: number): void {
    const { skillId, targetId } = cast;
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return;
    }

    const targetRecord = targetId === undefined ? undefined : this.#participants.get(targetId);
    const primary = skill.target === "self" ? record : targetRecord;
    const exposed = this.#exposedTo(record);
    const speed = record.combatant.equipment.mainHand.weapon.projectileSpeed;
    const flight = skill.projectile;
    // Only a skill that lands at once can shorten its own recharge (#845):
    // one that flies has started it by the time it lands. Only one can
    // summon (#1052): no attack skill or flying spell does.
    const only = (events: CombatEvent[]): SkillOutcome => ({
      events,
      rechargeFraction: 0,
      summons: [],
    });
    // What the caster's statuses add to its hits, each logged apart (#939).
    const riders: FiredTrigger[] = [];
    const resolve =
      flight !== undefined
        ? (resolution: SkillResolution) =>
            only(this.#releaseSpell(record, resolution, flight.speed, dt))
        : skill.attack === undefined
          ? (resolution: SkillResolution) => resolveSkillEffects(resolution)
          : speed === undefined
            ? (resolution: SkillResolution) => only(resolveAttackSkill(resolution, exposed, riders))
            : (resolution: SkillResolution) =>
                only(this.#releaseSkill(record, resolution, speed, dt));
    const targets = resolveTargets({
      skill,
      caster: record.combatant,
      casterPosition: record.position,
      primary,
      // Only an area looks past the primary: skip the copy every other
      // cast would make for nothing. A flying spell's area is found
      // where it lands, not here.
      candidates:
        skill.area === undefined || flight !== undefined ? [] : [...this.#participants.values()],
      losBlockers: this.#walls,
    });
    const { events, rechargeFraction, summons } = resolve({
      skill,
      caster: record.combatant,
      targets,
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
    });
    // What the skill put on its own user does not answer this use of it
    // (#999): the chanter's own Song of Restoration waits for its next skill.
    const spared: ReadonlySet<StatusId> = new Set(
      events.flatMap((event) =>
        event.kind === "status-applied" && event.targetId === record.id ? [event.statusId] : [],
      ),
    );
    // Where an area landed, for whoever draws it: nowhere, when an area
    // centred on a target had no target to centre on, or when it is still
    // flying.
    const origin = skill.area?.origin === "caster" ? record.position : primary?.position;
    const area =
      skill.area === undefined || origin === undefined || flight !== undefined
        ? undefined
        : { x: origin.x, y: origin.y, radius: skill.area.radius };

    // Only attack skills earn adrenaline, as weapon hits do: a spell is
    // paid for in energy, and earning both would make casters the best
    // adrenaline builders. A blocked blow earns nothing, not even the
    // damage its `onBlocked` deals, as Swift Chop's (#534). Damage on a
    // victim that blocked every blow is all `onBlocked`'s; a dual attack
    // (#885) blocked once and landed once still landed. Each foe it landed
    // on is a strike (#936): Cyclone Axe on three foes earns three. Only
    // a foe the skill swung at counts, not one an effect of it hit: Death
    // Blossom's splash on adjacent foes earns nothing more.
    if (skill.type === "attack") {
      const strikes = skill.attack?.strikes ?? 1;
      const swungAt = new Set(targets.map((target) => target.id));
      const blocked = (targetId: string): boolean => {
        const blows = events.filter(
          (event) =>
            (event.kind === "attack-blocked" || event.kind === "attack-missed") &&
            event.targetId === targetId,
        );
        return blows.some(({ kind }) => kind === "attack-blocked") && blows.length >= strikes;
      };
      const landed = events.filter((event) => event.kind !== "damage" || !blocked(event.targetId));
      const foesHit = new Set(
        landed.flatMap((event) => {
          const victim =
            event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
          return victim !== undefined &&
            swungAt.has(victim.id) &&
            victim.combatant.team !== record.combatant.team
            ? [victim.id]
            : [];
        }),
      );
      this.#gainAdrenaline(record, landed, foesHit.size);
    }
    if (skill.type === "shout" || skill.type === "chant") {
      this.#gainLeadershipEnergy(record, events);
    }
    this.#chargeFromDamage(record.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#recordShadowSteps(events);
    this.#recordResurrections(events);
    for (const summon of summons) {
      this.#summon(record, summon.creature, summon.count);
    }
    // An attack skill is a swing, so it turns on its target with the
    // weapon: it starts an attack, or switches one to them. Any other skill
    // leaves the attack alone (#317): one in progress resumes on its own
    // target after the cast, and none starts.
    if (
      skill.type === "attack" &&
      primary !== undefined &&
      this.#attackCheck(record, primary.id).ok
    ) {
      record.combatant.attack = { targetId: primary.id, swingElapsed: 0, unreachableSeconds: 0 };
    }
    if (hasAftercast(skill)) {
      record.combatant.cast.beginAftercast(this.#ruleset.combat.aftercastSeconds);
    }
    // An attack skill recovers from its blow for as long as it wound up.
    if (skill.attack !== undefined) {
      record.combatant.cast.beginAftercast(cast.totalSeconds);
    }

    // An off-hand attack out of sequence, or whose chain requirement did
    // not hold, recharges at once (#831, #1041).
    if (
      !events.some((event) => event.kind === "attack-missed" && event.reason === "out-of-sequence")
    ) {
      // A spell recharges faster under Mantra of Recovery (#938) or Weapon
      // of Quickening (#975), read now: one that ends later leaves this
      // recharge as it started. Read after the spell resolved, so Weapon of
      // Quickening cast on yourself already shortens its own.
      const faster = isSpell(skill.type)
        ? aggregateModifiers(record.combatant.statuses.active).spellRechargeFaster
        : 0;
      record.combatant.cast.startRecharge(
        skill.id,
        reducedRecharge(skill.rechargeSeconds * (1 - rechargeFraction), faster),
      );
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: record.id,
      skillId: skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area,
      doubleStrike: false,
      events,
    });
    this.#logFired(riders);
    // After the skill's own effects, as their own entries (#469): a spell
    // finished is Backfire's moment, an attack skill Empathy's. Any skill
    // used is Spiteful Spirit's (#935), and an attack skill twice over.
    this.#fireTriggers(record, "bearer-uses-skill", spared, skill.id);
    this.#endOnUseSkill(record, skill, spared);
    if (isSpell(skill.type)) {
      this.#fireTriggers(record, "bearer-casts-spell", spared);
    }
    if (skill.attack !== undefined) {
      this.#fireTriggers(record, "bearer-attacks", spared);
    }
  }

  /**
   * The bearer did `event` (#469): each status on it that answers fires.
   * `usedSkillId` is the skill it used, on `bearer-uses-skill` (#949).
   * A status in `spared` does not answer (#999), as `fireTriggers`.
   */
  #fireTriggers(
    record: ParticipantRecord,
    event: Exclude<StatusTriggerEvent, "bearer-gains-condition" | "ends" | "expires">,
    spared: ReadonlySet<StatusId>,
    usedSkillId?: string,
  ): void {
    this.#logFired(
      fireTriggers(record.combatant, event, this.#triggerContext(usedSkillId), spared),
    );
  }

  /**
   * After its triggers answered the use (#949): every status on the
   * bearer that ends when it uses a skill, as Diversion, is gone, and
   * logged against that skill, but those in `spared` (#999).
   */
  #endOnUseSkill(record: ParticipantRecord, skill: Skill, spared: ReadonlySet<StatusId>): void {
    const ended = record.combatant.statuses.endOnBearerUseSkill(spared);
    if (ended.length > 0) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: skill.id,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: ended.map((statusId) => ({
          kind: "status-expired",
          targetId: record.id,
          statusId,
        })),
      });
    }
  }

  #triggerContext(usedSkillId?: string): TriggerContext {
    return {
      sourceOf: (id) => this.#participants.get(id)?.combatant,
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
      usedSkillId,
    };
  }

  /**
   * The one point a tick where statuses that answer a change fire (#887):
   * every participant's recorded changes, in participant order, each in
   * the order it happened. Then whatever the firing itself changed is
   * discarded: a triggered effect never sets off a trigger, so two
   * Contagions never echo, and a condition Contagion hands out sets off
   * nobody's. Hits and physical damage are drained here too (#935), so
   * two Mark of Pain bearers side by side never chain.
   */
  #fireStatusChanges(): void {
    const changes = [...this.#participants.values()].map((record) => ({
      record,
      changes: record.combatant.statuses.drainChanges(),
    }));
    const context = this.#triggerContext();
    for (const { record, changes: recorded } of changes) {
      for (const change of recorded) {
        this.#logFired(fireChangeTriggers(record.combatant, change, this.#spread, context));
      }
    }
    for (const record of this.#participants.values()) {
      record.combatant.statuses.drainChanges();
    }
  }

  /**
   * Contagion (#887): the condition its bearer gained, on each living foe
   * of the bearer within the radius, in participant order, as the bearer's.
   */
  readonly #spread: SpreadGainedCondition = (effect, bearer, gained) => {
    const from = this.#participants.get(bearer.id);
    if (from === undefined || bearer.dead) {
      return [];
    }
    return [...this.#participants.values()]
      .filter(
        (other) =>
          other.combatant.team !== bearer.team &&
          !other.combatant.dead &&
          distance(from.position, other.position) <= effect.radius,
      )
      .flatMap((other) =>
        applyEffects(
          [{ kind: "apply-status", statusId: gained.id, durationSeconds: gained.durationSeconds }],
          {
            caster: bearer,
            target: other.combatant,
            rng: this.#rng,
            rules: this.#ruleset.combat,
            surroundings: this.#participants,
          },
        ),
      );
  };

  /**
   * What triggers did (#469), each logged as its source's skill; whoever
   * it kills dies as usual. Its damage charges the source's adrenaline as
   * any foe's hit does (#827).
   */
  #logFired(fired: readonly FiredTrigger[]): void {
    for (const { sourceId, skillId, events } of fired) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId,
        skillId,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events,
      });
      this.#chargeFromDamage(this.#participants.get(sourceId)?.combatant, events);
      this.#recordDeaths(events);
    }
  }

  /**
   * One tick of an approach (ADR-0026): walk until `target` is within
   * `reach` and in sight, round walls (#211), then face it. The only
   * movement the simulation chooses, and never on top of the player's
   * own. Replanned every tick, so a target that moves, or a shove, is
   * simply where the next plan starts.
   *
   * `progress` counts how long it has got nowhere; at
   * `unreachableAfterSeconds` (#218) the approach gives up, and the
   * caller ends what it was walking for.
   */
  #approach(
    record: ParticipantRecord,
    target: ParticipantRecord,
    reach: number,
    progress: { unreachableSeconds: number },
    dt: number,
  ): "arrived" | "walking" | "unreachable" {
    if (
      distanceWithinRange(record.position, target.position, reach) &&
      hasLineOfSight(record.position, target.position, this.#walls)
    ) {
      faceToward(record, target.position);
      return "arrived";
    }
    const next = this.#paths.find(record.position, target.position)?.[0];
    if (next === undefined) {
      // No way there, this tick. It has to last before the approach ends
      // (#218); meanwhile, steer straight at the target, which is what
      // usually shoves a squeezed body back out (#211).
      if (this.#stalledFor(progress, dt)) {
        return "unreachable";
      }
      this.advanceMovement(record, sub(target.position, record.position), dt);
      return "walking";
    }
    // A path that leads nowhere counts as none: an approach that cannot
    // move, boxed in or with a body in a doorway, ends as unreachable
    // too. One held is neither lost nor progress.
    const step = this.#stepToward(record, next, target.id, false, dt);
    if (step === "stalled") {
      return this.#stalledFor(progress, dt) ? "unreachable" : "walking";
    }
    if (step === "moved") {
      progress.unreachableSeconds = 0;
    }
    return "walking";
  }

  /** Another `dt` of an approach getting nowhere; whether it has now lasted too long (#218). */
  #stalledFor(progress: { unreachableSeconds: number }, dt: number): boolean {
    progress.unreachableSeconds += dt;
    return (
      progress.unreachableSeconds >= this.#ruleset.combat.unreachableAfterSeconds - SWING_EPSILON
    );
  }

  /**
   * One tick's walk toward `next`, a path's next waypoint round walls
   * (#211), bent round any living body in the way but `self` and
   * `passing` (#277). The approach passes its target, since reaching it
   * is the point. With `land`, `next` is the goal, and a step longer than
   * what is left ends on it rather than past it.
   *
   * A step that covers less than `STALL_FRACTION` of what it was asked
   * made no progress: boxed in, or pressed into a wall. One asked to walk
   * nowhere is `held`, which is neither: nothing in the game does that
   * today (the speed multiplier floors at 0.25), but a ruleset or a
   * future status that zeroes speed would.
   */
  #stepToward(
    record: ParticipantRecord,
    next: Vec2,
    passing: string | undefined,
    land: boolean,
    dt: number,
  ): PathStep {
    this.#bodies.length = 0;
    for (const [otherId, other] of this.#participants) {
      if (otherId !== record.id && otherId !== passing && !other.combatant.dead) {
        this.#bodies.push(other.position);
      }
    }
    const radius = this.#radiusOf(record);
    const before = record.position;
    const left = distance(before, next);
    const full = this.#stepUnits(record, dt);
    // The same speed for less of the tick: on the goal, never past it.
    const asked = land ? Math.min(full, left) : full;
    const seconds = asked < full ? (dt * asked) / full : dt;
    this.advanceMovement(record, steerAround(before, next, radius, this.#bodies), seconds);
    if (!(asked > 0)) {
      return "held";
    }
    return distance(before, record.position) < STALL_FRACTION * asked ? "stalled" : "moved";
  }

  /** How far `record` walks in `dt` at its speed now, slowed or not. */
  #stepUnits(record: ParticipantRecord, dt: number): number {
    return (
      this.#ruleset.movement.maxSpeedUnitsPerSecond * moveSpeedMultiplier(record.combatant) * dt
    );
  }

  /**
   * The click-to-walk step (#310): along the path to the goal, until
   * within `ARRIVE_UNITS` of it. A walk whose way there has got no
   * shorter for as long as an approach may get nowhere
   * (`unreachableAfterSeconds`, #218) ends where it is, without a word:
   * the player sees the hero stop.
   *
   * Progress is the way left, not the step taken: a body in a doorway
   * leaves a walker sliding to and fro along the wall, a full step every
   * tick and no nearer. The approach cannot judge it so, since its
   * target moves. And unlike an attack, a walk that cannot move at all
   * is not held: there is nothing for it to resume.
   */
  #advanceWalk(record: ParticipantRecord, dt: number): void {
    if (record.walkGoal !== undefined && !record.walkSettled) {
      const spot = nearestStandable(this.#graph, record.walkGoal);
      record.walkGoal = this.#paths.find(record.position, spot) === undefined ? undefined : spot;
      record.walkSettled = true;
    }
    const goal = record.walkGoal;
    if (goal === undefined) {
      return;
    }
    if (distance(record.position, goal) <= ARRIVE_UNITS) {
      record.walkGoal = undefined;
      return;
    }
    const path = this.#paths.find(record.position, goal);
    const left = path === undefined ? Number.POSITIVE_INFINITY : pathLength(record.position, path);
    if (left < record.walkLeast - STALL_FRACTION * this.#stepUnits(record, dt)) {
      record.walkLeast = left;
      record.walkStalledSeconds = 0;
    } else {
      record.walkStalledSeconds += dt;
      if (
        record.walkStalledSeconds >=
        this.#ruleset.combat.unreachableAfterSeconds - SWING_EPSILON
      ) {
        record.walkGoal = undefined;
        return;
      }
    }
    const next = path?.[0];
    if (next === undefined) {
      // As the approach does: straight at it usually shoves a squeezed
      // body back out (#211).
      this.advanceMovement(record, sub(goal, record.position), dt);
    } else {
      this.#stepToward(record, next, undefined, path?.length === 1, dt);
    }
    if (distance(record.position, goal) <= ARRIVE_UNITS) {
      record.walkGoal = undefined;
    }
  }

  /**
   * The step of a skill walking in (#415, #499): drop it once its target
   * is no longer one it could be used on, or on a move; wait out a cast
   * and an aftercast; walk to the skill's own range, not the weapon's
   * (Barrage stops short of a longbow's); then use it as if pressed now,
   * checked all over again. Refused there (Energy Burn took the energy on
   * the way), it is dropped without a word, and a running attack resumes.
   *
   * A walk that gets nowhere for `unreachableAfterSeconds` drops it and
   * says so; an attack skill's ends its attack too, as Space's would.
   */
  #advancePendingSkill(record: ParticipantRecord, dt: number): void {
    const pending = record.pendingSkill;
    if (pending === undefined) {
      return;
    }
    const skillId = record.skillBar[pending.slot];
    const skill = skillId === undefined || skillId === null ? undefined : getSkill(skillId);
    const target = this.#participants.get(pending.targetId);
    const moving =
      record.inputDirection.x !== 0 ||
      record.inputDirection.y !== 0 ||
      record.walkGoal !== undefined;
    if (skill === undefined || target === undefined || moving) {
      record.pendingSkill = undefined;
      return;
    }
    const check = this.#check(record, skill, target.id);
    if (!check.ok && TARGET_REJECTIONS.has(check.reason)) {
      record.pendingSkill = undefined;
      return;
    }
    if (record.combatant.cast.isCasting || record.combatant.cast.inAftercast) {
      return;
    }

    const approach = this.#approach(record, target, skill.range, pending, dt);
    if (approach === "unreachable") {
      record.pendingSkill = undefined;
      const unreachable: CombatEvent = { kind: "attack-unreachable", targetId: target.id };
      if (skill.attack === undefined) {
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "skill",
          sourceId: record.id,
          skillId: skill.id,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: [unreachable],
        });
      } else {
        record.combatant.attack = undefined;
        this.#logWeapon(record.id, record.combatant.equipment.mainHand.weapon.id, [unreachable]);
      }
      return;
    }
    if (approach === "arrived") {
      record.pendingSkill = undefined;
      this.#useSkill(record, pending.slot, skill, target.id, this.#check(record, skill, target.id));
    }
  }

  /**
   * The attack step (ADR-0026): drop an attack whose target is no longer
   * a living enemy, pause while casting, through the aftercast and while
   * a skill walks in (#499), walk into reach, then swing.
   *
   * The swing timer keeps the remainder past each interval rather than
   * zeroing, so the rate stays exact at 20 Hz. A target that steps out of
   * reach mid-swing keeps the swing's progress for when it is caught.
   */
  #advanceAttack(record: ParticipantRecord, dt: number): void {
    const attack = record.combatant.attack;
    if (attack === undefined) {
      return;
    }
    const check = this.#attackCheck(record, attack.targetId);
    const target = this.#participants.get(attack.targetId);
    if (!check.ok || target === undefined) {
      record.combatant.attack = undefined;
      return;
    }
    // Moving cancels, as in GW1. `setInputDirection` cancels on the way in,
    // but an attack asked for while a direction is already held would
    // otherwise approach on top of the walk, at twice the speed. A
    // click-to-walk is moving too: an instant skill at an enemy, which
    // turns on them with the weapon, does not stop it (#310).
    if (
      record.inputDirection.x !== 0 ||
      record.inputDirection.y !== 0 ||
      record.walkGoal !== undefined
    ) {
      record.combatant.attack = undefined;
      return;
    }
    if (
      record.combatant.cast.isCasting ||
      record.combatant.cast.inAftercast ||
      record.pendingSkill !== undefined
    ) {
      return;
    }

    const { weapon } = record.combatant.equipment.mainHand;
    const approach = this.#approach(record, target, weapon.range, attack, dt);
    if (approach === "unreachable") {
      record.combatant.attack = undefined;
      this.#logWeapon(record.id, weapon.id, [{ kind: "attack-unreachable", targetId: target.id }]);
    }
    if (approach !== "arrived") {
      return;
    }

    attack.swingElapsed += dt;
    const interval = swingIntervalSeconds(record.combatant);
    // Within a hair: twenty-odd additions of 0.05 fall just short of
    // 1.75, and a swing a whole tick late would make the rate drift.
    if (attack.swingElapsed < interval - SWING_EPSILON) {
      return;
    }
    attack.swingElapsed = Math.max(0, attack.swingElapsed - interval);
    record.outOfCombatSeconds = 0;
    this.#blowStarted(record, target);

    if (weapon.projectileSpeed !== undefined) {
      const released = this.#release(record, target, weapon.projectileSpeed, dt, undefined);
      if (released.length > 0) {
        this.#logWeapon(record.id, weapon.id, released);
      }
      this.#fireTriggers(record, "bearer-attacks", NONE_SPARED);
      return;
    }
    const { events, doubleStrike, landed, fired } = resolveSwing({
      attacker: record.combatant,
      target,
      surroundings: this.#participants,
      rng: this.#rng,
      rules: this.#ruleset.combat,
      exposed: this.#exposedTo(record),
    });
    this.#gainAdrenaline(record, events, landed);
    this.#chargeFromDamage(record.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#logWeapon(record.id, record.combatant.equipment.mainHand.weapon.id, events, doubleStrike);
    this.#logFired(fired);
    this.#fireTriggers(record, "bearer-attacks", NONE_SPARED);
  }

  /**
   * Whether a victim shows `attacker` its back while moving (#533): facing
   * more than 90° away from the attacker, read the moment the blow lands,
   * and its last step moved it. A melee blow at such a victim always crits.
   */
  #exposedTo(attacker: ParticipantRecord): (victim: Combatant) => boolean {
    return (victim) => {
      const record = this.#participants.get(victim.id);
      if (record === undefined) {
        return false;
      }
      const [before, after] = record.history.samples().slice(-2);
      const moving =
        before !== undefined &&
        after !== undefined &&
        (before.x !== after.x || before.y !== after.y);
      return moving && showsBackTo(record.position, record.facing, attacker.position);
    };
  }

  /**
   * A ranged weapon's attack skill (#416): a shot at each victim the
   * skill picked, each with its own blind roll and its own flight, the
   * skill riding it. What happens now is only what stopped a shot from
   * flying; the rest lands with the shot.
   *
   * Each shot carries the caster's chants' riders as they are now, and
   * the chants end at once, flying or not (#782): the release spends
   * them, so a second attack skill loosed before the first shot lands
   * carries none, and a chant that would have run out in flight still
   * lands its rider.
   */
  #releaseSkill(
    record: ParticipantRecord,
    resolution: SkillResolution,
    speed: number,
    dt: number,
  ): CombatEvent[] {
    const skillHit: SkillHit = {
      kind: "attack",
      skill: resolution.skill,
      blow: skillBlow(resolution.skill, record.combatant),
      next: nextAttackSkillOf(record.combatant),
    };
    const events = resolution.targets.flatMap((victim) => {
      const target = this.#participants.get(victim.id);
      return target === undefined || victim.dead
        ? []
        : this.#release(record, target, speed, dt, skillHit);
    });
    useNextAttackSkill(record.combatant, skillHit.next, events);
    return events;
  }

  /**
   * A flying spell (#535): one shot at the primary target, carrying the
   * cast. Its effects, and anyone its area catches, land with it.
   */
  #releaseSpell(
    record: ParticipantRecord,
    resolution: SkillResolution,
    speed: number,
    dt: number,
  ): CombatEvent[] {
    const [primary] = resolution.targets;
    const target = primary === undefined ? undefined : this.#participants.get(primary.id);
    return target === undefined || target.combatant.dead
      ? []
      : this.#release(record, target, speed, dt, {
          kind: "spell",
          skill: resolution.skill,
          caster: record.combatant,
        });
  }

  /**
   * A ranged swing lands as a shot leaving the bow, led ahead of the
   * target. Blind is rolled now, as GW1 does: a blinded shot misses at
   * once and nothing flies; a spell is not blinded. Then line of sight, once: a wall in the way
   * spends the swing and nothing flies either, and the next swing looks
   * again. Melee is never checked; its reach is shorter than any gap.
   * Releasing an attack, flying or not, ends the attacker's weapon spell
   * (#758). Returns that, and the miss or the obstruction, for the caller
   * to log.
   */
  #release(
    record: ParticipantRecord,
    target: ParticipantRecord,
    speed: number,
    dt: number,
    skillHit: SkillHit | SpellHit | undefined,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    if (skillHit?.kind !== "spell") {
      // Only a flying attack is released here.
      bearerAttacked(record.combatant, events, "projectile");
      if (blindMisses(record.combatant, this.#rng)) {
        return [...events, { kind: "attack-missed", targetId: target.id }];
      }
    }
    if (!hasLineOfSight(record.position, target.position, this.#walls)) {
      return [...events, { kind: "attack-obstructed", targetId: target.id }];
    }
    const from = record.position;
    const tracked = trackTarget(target.history.samples(), dt, target.position);
    const leadPoint = leadAimPoint(from, tracked.position, tracked.velocity, speed);
    // Along the whole flight, once: the path is fixed from here (#215). A
    // shot led round a corner, or at a target stepping behind a pillar,
    // stops at the wall, a unit short of it so it lands on the near side.
    const impact = firstHit(from, leadPoint, this.#walls);
    const aimPoint =
      impact === undefined
        ? leadPoint
        : distance(from, impact) <= 1
          ? from
          : add(impact, scale(normalize(sub(from, impact)), 1));
    this.#projectiles.push({
      id: this.#nextProjectileId,
      attackerId: record.id,
      targetId: target.id,
      from,
      aimPoint,
      obstructed: impact !== undefined,
      speed,
      flightSeconds: distance(from, aimPoint) / speed,
      elapsed: 0,
      weaponSnapshot: weaponSnapshotOf(record.combatant),
      skillHit,
    });
    this.#nextProjectileId += 1;
    return events;
  }

  /** Fly every shot in flight one tick, and land those that arrive, in release order. */
  #advanceProjectiles(dt: number): void {
    const landed: Projectile[] = [];
    const flying: Projectile[] = [];
    for (const projectile of this.#projectiles) {
      projectile.elapsed += dt;
      (projectile.elapsed >= projectile.flightSeconds - SWING_EPSILON ? landed : flying).push(
        projectile,
      );
    }
    this.#projectiles = flying;
    for (const projectile of landed) {
      this.#land(projectile);
    }
  }

  /**
   * A shot lands at its aim point, and hits whoever it was aimed at if
   * they are still there: alive, and within their body plus the
   * tolerance. Anyone else is dodged. Its attacker may have died since;
   * the shot lands all the same, as in GW1, but the dead earn no
   * adrenaline. A target that died in flight is not there to be hit or
   * to dodge, so nothing happens. A hit carries the attacker's
   * preparation as it is on landing (#525).
   *
   * A shot carrying an attack skill (#416) lands its bonus with the blow
   * and its riders after it, only on a hit: a caster who finished before
   * it arrived is not interrupted. Blocked, it lands the skill's
   * `onBlocked` instead, which earns no adrenaline; an `unblockable`
   * skill (Wild Throw) rolls no block. With its attacker gone from the
   * match, the blow lands and the riders do not.
   *
   * A hit lands the riders of the chants its release spent (#782) after
   * the skill's own.
   */
  #land(projectile: Projectile): void {
    if (projectile.obstructed) {
      // It hit the wall; where the target is now has nothing to do with it.
      this.#logShot(projectile, [{ kind: "attack-obstructed", targetId: projectile.targetId }]);
      return;
    }
    const target = this.#participants.get(projectile.targetId);
    if (target === undefined || target.combatant.dead) {
      return;
    }
    const { skillHit } = projectile;
    if (skillHit?.kind === "spell") {
      this.#landSpell(projectile, skillHit, target);
      return;
    }
    const events: CombatEvent[] = [];
    const attacker = this.#participants.get(projectile.attackerId);
    // What the attacker's statuses add to the hit, each logged apart (#939).
    const fired: FiredTrigger[] = [];
    const riders = (effects: Skill["effects"]): CombatEvent[] =>
      skillHit === undefined || attacker === undefined
        ? []
        : applySkillEffects(
            {
              skill: { ...skillHit.skill, effects },
              caster: attacker.combatant,
              targets: [target.combatant],
              rng: this.#rng,
              rules: this.#ruleset.combat,
              surroundings: this.#participants,
            },
            events,
          );
    let blocked = false;
    if (!this.#reaches(projectile, target)) {
      events.push({ kind: "attack-dodged", targetId: target.id });
    } else if (
      skillHit?.skill.attack?.unblockable !== true &&
      blocks(target.combatant, "projectile", this.#rng)
    ) {
      blocked = true;
      events.push({ kind: "attack-blocked", targetId: target.id });
      attackReached(target.combatant, events);
      events.push(...riders(skillHit?.skill.attack?.onBlocked ?? []));
    } else {
      const critical = landBlow(
        projectile.weaponSnapshot,
        attacker?.combatant,
        target.combatant,
        settleBlow(
          skillHit?.blow ?? PLAIN_BLOW,
          attacker?.combatant,
          target.combatant,
          this.#participants,
        ),
        // A shot crits only on its roll, never for where it came from.
        false,
        this.#rng,
        this.#ruleset.combat,
        events,
      );
      if (critical && attacker !== undefined) {
        gainCriticalEnergy(attacker.combatant, projectile.weaponSnapshot.criticalStrikes, events);
      }
      if (attacker !== undefined) {
        events.push(
          ...attackHitRiders(
            attacker.combatant,
            target.combatant,
            projectile.weaponSnapshot.mainHand,
            this.#rng,
            this.#ruleset.combat,
            this.#participants,
            fired,
          ),
        );
        bearerHit(attacker.combatant, events, skillHit !== undefined);
      }
      if (skillHit !== undefined && attacker !== undefined) {
        events.push(
          ...nextAttackSkillRiders(
            skillHit.next,
            attacker.combatant,
            target.combatant,
            this.#rng,
            this.#ruleset.combat,
            this.#participants,
          ),
        );
      }
      attackReached(target.combatant, events);
      events.push(...riders(skillHit?.skill.effects ?? []));
    }
    if (attacker !== undefined && !attacker.combatant.dead && !blocked) {
      this.#gainAdrenaline(attacker, events);
    }
    this.#chargeFromDamage(attacker?.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#logShot(projectile, events);
    this.#logFired(fired);
  }

  /**
   * A spell lands as it was cast (#535), centred on where its target is
   * now: its effects on the target, its area around them. Its caster may
   * have died since, and it lands all the same. Dodged, nothing happens
   * to anyone, splash included.
   */
  #landSpell(projectile: Projectile, spell: SpellHit, target: ParticipantRecord): void {
    if (!this.#reaches(projectile, target)) {
      this.#logShot(projectile, [{ kind: "attack-dodged", targetId: target.id }]);
      return;
    }
    const { skill, caster } = spell;
    const events = applySkillEffects({
      skill,
      caster,
      targets: resolveTargets({
        skill,
        caster,
        casterPosition: projectile.from,
        primary: target,
        candidates: skill.area === undefined ? [] : [...this.#participants.values()],
        losBlockers: this.#walls,
      }),
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
    });
    this.#chargeFromDamage(caster, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    const area =
      skill.area === undefined
        ? undefined
        : { x: target.position.x, y: target.position.y, radius: skill.area.radius };
    this.#logShot(projectile, events, area);
  }

  /** Whether a shot landing now finds its target where it was aimed: their body plus the tolerance. */
  #reaches(projectile: Projectile, target: ParticipantRecord): boolean {
    const reach = this.#radiusOf(target) + this.#ruleset.combat.projectileTolerance;
    return distance(target.position, projectile.aimPoint) <= reach;
  }

  /**
   * A shot's entry: its skill's, if it carries one (#416, #535), else its
   * weapon's; with the area a spell's landing caught.
   */
  #logShot(
    projectile: Projectile,
    events: readonly CombatEvent[],
    area?: CombatLogEntry["area"],
  ): void {
    const { skillHit } = projectile;
    if (skillHit === undefined) {
      this.#logWeapon(projectile.attackerId, projectile.weaponSnapshot.mainHand.weapon.id, events);
      return;
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: projectile.attackerId,
      skillId: skillHit.skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area,
      doubleStrike: false,
      events,
    });
  }

  /** A weapon entry, named for the weapon that swung or shot (#162). */
  #logWeapon(
    sourceId: string,
    weaponId: WeaponId,
    events: readonly CombatEvent[],
    doubleStrike = false,
  ): void {
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "weapon",
      sourceId,
      skillId: undefined,
      weaponId,
      attributeId: undefined,
      area: undefined,
      doubleStrike,
      events,
    });
  }

  /** Why `record` may not attack `targetId`, as a cast at it would be told. */
  #attackCheck(record: ParticipantRecord, targetId: string): ActivationCheck {
    const target = this.#participants.get(targetId)?.combatant;
    if (record.combatant.dead) {
      return { ok: false, reason: "caster-dead" };
    }
    if (record.combatant.knockdownRemaining > 0) {
      return { ok: false, reason: "caster-knocked-down" };
    }
    if (target === undefined) {
      return { ok: false, reason: "no-target" };
    }
    if (target.dead) {
      return { ok: false, reason: "invalid-target-dead" };
    }
    if (target.id === record.id) {
      return { ok: false, reason: "invalid-target-self" };
    }
    if (target.team === record.combatant.team) {
      return { ok: false, reason: "invalid-target-ally" };
    }
    return { ok: true };
  }

  /**
   * Adrenaline is earned by landing damage on a foe, never by waiting,
   * which makes adrenaline skills a reward for staying in the fight rather
   * than a second energy pool. `blows` strikes to every adrenaline skill
   * (#463), if anything in `events` damaged a foe: one for each foe an
   * attack skill landed on (#936), one for a shot, and one per landed blow
   * of a swing, so
   * a double strike earns two. A blocked blow deals no damage, so it earns
   * nothing (#534). "For Great Justice!" (#936) adds its extra strikes
   * to each.
   */
  #gainAdrenaline(record: ParticipantRecord, events: readonly CombatEvent[], blows = 1): void {
    const damagedFoe = events.some((event) => {
      const victim = event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
      return victim !== undefined && victim.combatant.team !== record.combatant.team;
    });
    if (damagedFoe) {
      const { extraStrikesPerHit } = aggregateModifiers(record.combatant.statuses.active);
      gainStrikes(record.combatant, blows * (1 + extraStrikesPerHit), this.#elapsedSeconds);
    }
  }

  /**
   * Taking damage from a foe charges adrenaline too (#827), as in GW1: a
   * warrior under pressure builds it. Each `damage` in `events` that
   * `source` dealt a living foe gives that foe `floor(100 × amount /
   * maxHealth)` units, so a hit for a quarter of its health is a strike.
   * Called where a skill, a swing, a shot or a spell lands, never for
   * degeneration; an ally's or your own damage, and a lethal hit, give
   * nothing. A `source` gone from the match is no one's foe. A hit for
   * 0 gives nothing but still keeps the victim's adrenaline (#828).
   */
  #chargeFromDamage(source: Combatant | undefined, events: readonly CombatEvent[]): void {
    if (source === undefined) {
      return;
    }
    for (const event of events) {
      const victim = event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
      if (
        event.kind !== "damage" ||
        victim === undefined ||
        victim.combatant.dead ||
        victim.combatant.team === source.team
      ) {
        continue;
      }
      gainUnits(
        victim.combatant,
        Math.floor((100 * event.amount) / effectiveMaxHealth(victim.combatant)),
        this.#elapsedSeconds,
      );
    }
  }

  /**
   * Every death in `events` drops the victim's cast, so a resurrection
   * (#812) never finishes it, scores for the other side and starts its
   * respawn; a creature's does neither, and it leaves (#1052). Read from the emitted events so every death routes through
   * one place, whether a skill, a swing or degeneration caused it.
   */
  #recordDeaths(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "death") {
        continue;
      }
      const victim = this.#participants.get(event.targetId);
      if (victim !== undefined) {
        victim.combatant.attack = undefined;
        victim.pendingSkill = undefined;
        victim.combatant.cast.cancelCast();
        victim.combatant.cast.endAftercast();
        victim.walkGoal = undefined;
        victim.combatant.knockdownRemaining = 0;
        victim.combatant.statuses.endAll();
        this.#clearChainMarks(victim);
        emptyAdrenaline(victim.combatant);
        // A creature (#1052) scores nothing, costs no morale and never
        // respawns: it leaves at the end of the step. Only a spirit's death
        // is no soul to reap (GW1: "a non-Spirit creature").
        if (victim.creature !== undefined) {
          victim.respawnInSeconds = Number.POSITIVE_INFINITY;
          this.#leaving.add(victim.id);
          if (victim.creature.kind !== "spirit") {
            this.#reapSoul(victim);
          }
          continue;
        }
        victim.respawnInSeconds = this.#respawnSeconds(victim);
        this.#deathPenalty(victim);
        this.#reapSoul(victim);
        this.recordDeath(victim.combatant.team);
      }
    }
  }

  /**
   * Soul Reaping (#530): every living Necromancer within spirit range of
   * `victim` gains its rank in energy, up to its maximum, at most 3 times
   * in any 15 s. The victim's own rank does nothing: it is dead.
   */
  #reapSoul(victim: ParticipantRecord): void {
    for (const record of this.#participants.values()) {
      const { combatant } = record;
      const rank = rankOf(combatant, SOUL_REAPING_ATTRIBUTE);
      if (
        rank <= 0 ||
        combatant.dead ||
        !distanceWithinRange(record.position, victim.position, RANGE_SPIRIT)
      ) {
        continue;
      }
      const triggers = soulReapingTrigger(combatant.soulReapingTriggers, this.#elapsedSeconds);
      if (triggers !== undefined) {
        combatant.soulReapingTriggers = triggers;
        const events: CombatEvent[] = [];
        gainEnergy(combatant, soulReapingEnergy(rank), events);
        if (events.length > 0) {
          this.#reaped.push({
            tick: this.#tick,
            atSeconds: this.#elapsedSeconds,
            cause: "attribute",
            sourceId: record.id,
            skillId: undefined,
            weaponId: undefined,
            attributeId: SOUL_REAPING_ATTRIBUTE,
            area: undefined,
            doubleStrike: false,
            events,
          });
        }
      }
    }
  }

  /** Every chain mark on `record` goes, and every one it placed (#831). */
  #clearChainMarks(record: ParticipantRecord): void {
    clearChainMarksOn(
      [...this.#participants.values()].map(({ combatant }) => combatant),
      record.id,
    );
  }

  /** Count `combatant`'s knockdown down by `dt`, to exactly 0 at the end. */
  #advanceKnockdown(combatant: Combatant, dt: number): void {
    if (combatant.knockdownRemaining > 0) {
      combatant.knockdownRemaining -= dt;
      if (combatant.knockdownRemaining <= KNOCKDOWN_EPSILON) {
        combatant.knockdownRemaining = 0;
      }
    }
  }

  /**
   * Everyone knocked down in `events` stops where they are (#468): the
   * skill effect already ended their cast and attack; this drops what
   * only the simulation keeps, a walk and a skill walking in. Neither
   * comes back on rising. A held direction stays: it is the keyboard's
   * state, not an action, and walks again on rising.
   */
  #recordKnockdowns(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "knocked-down") {
        continue;
      }
      const victim = this.#participants.get(event.targetId);
      if (victim !== undefined) {
        victim.walkGoal = undefined;
        victim.pendingSkill = undefined;
      }
    }
  }

  /**
   * Every shadow step in `events` (#988) puts its caster beside its
   * target, where it stands now: touching it, on the side the caster came
   * from, or behind it when the two stood on one spot. With a wall between
   * the target and that spot, on the target, and the push-outs move it
   * clear as they do a walk; the doorway rule does not hold, since a step
   * is not a walk. It faces the target, and nothing reads the step as a
   * run: its track starts over, and it did not walk this step. An attack
   * and a skill walking in stay.
   */
  #recordShadowSteps(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "shadow-stepped") {
        continue;
      }
      const record = this.#participants.get(event.targetId);
      const target = this.#participants.get(event.toId);
      if (record === undefined || target === undefined) {
        continue;
      }
      const radius = this.#ruleset.collision.playerRadius;
      const away =
        distance(record.position, target.position) > 0
          ? normalize(sub(record.position, target.position))
          : vec2(-Math.cos(target.facing), -Math.sin(target.facing));
      const beside = add(target.position, scale(away, 2 * radius));
      let position = hasLineOfSight(target.position, beside, this.#walls)
        ? beside
        : target.position;
      for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
        const relaxed = this.#pushOut(record.id, position, radius);
        const settled = relaxed.x === position.x && relaxed.y === position.y;
        position = relaxed;
        if (settled) {
          break;
        }
      }
      record.position = position;
      faceToward(record, target.position);
      record.walkGoal = undefined;
      record.history.clear();
      this.#stepStart.set(record.id, position);
    }
  }

  /**
   * Every resurrection in `events` (#812) cancels its respawn timer. The
   * body stays where it fell, and what its death cleared stays clear.
   */
  #recordResurrections(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "resurrected") {
        continue;
      }
      const record = this.#participants.get(event.targetId);
      if (record !== undefined) {
        record.respawnInSeconds = 0;
        record.outOfCombatSeconds = 0;
        record.resurrectedAtSeconds = this.#elapsedSeconds;
      }
    }
  }

  /**
   * How long `record` stays dead: its own `on-death` reset if it has one,
   * else the match rules'. Without match rules, or under
   * `"resurrection-only"` (#843), nobody respawns: infinity never counts
   * down to 0.
   */
  #respawnSeconds(record: ParticipantRecord): number {
    if (record.spec.reset?.kind === "on-death") {
      return record.spec.reset.afterSeconds;
    }
    if (this.#matchRules?.deathRule !== "respawn") {
      return Number.POSITIVE_INFINITY;
    }
    return this.#matchRules.respawnSeconds;
  }

  /**
   * The death penalty (#843, GW1): with `deathPenalty` on, `victim` loses
   * 15% morale, down to −60%, unless it was resurrected less than 5 s ago;
   * its foes' +2% waits for the end of the step.
   */
  #deathPenalty(victim: ParticipantRecord): void {
    if (this.#matchRules?.deathPenalty !== true) {
      return;
    }
    this.#moraleKills.push(victim.combatant.team);
    if (this.#elapsedSeconds - victim.resurrectedAtSeconds < DP_GRACE_AFTER_RES_SECONDS) {
      return;
    }
    this.#setMorale(
      victim,
      Math.max(MORALE_FLOOR, victim.combatant.morale - DEATH_PENALTY_PERCENT),
    );
  }

  /**
   * Every death this step gives each living foe in the death penalty 2%
   * back, up to 0 (#843): a kill never boosts. A creature has no morale (#1052).
   */
  #awardKillMorale(): void {
    for (const team of this.#moraleKills) {
      for (const record of this.#participants.values()) {
        const { combatant } = record;
        if (
          combatant.team !== team &&
          !combatant.dead &&
          combatant.morale < 0 &&
          countsForTeam(record)
        ) {
          this.#setMorale(record, Math.min(0, combatant.morale + KILL_MORALE_PERCENT));
        }
      }
    }
    this.#moraleKills = [];
  }

  /**
   * A morale boost (GvG's flag stand, HA's altar): `amount` percent to
   * every member of `team`, dead or alive, up to +10%, creatures aside (#1052). Not capped at 0,
   * so it lifts a death penalty too.
   */
  public moraleBoost(team: number, amount: number): void {
    for (const record of this.#participants.values()) {
      if (record.combatant.team === team && countsForTeam(record)) {
        this.#setMorale(record, Math.min(MORALE_CEILING, record.combatant.morale + amount));
      }
    }
  }

  /**
   * Set `record`'s morale and the maxima that follow it (GW1: on the base,
   * before upgrades). A drop clamps health and energy to the new
   * ceilings; a rise leaves them where they are.
   */
  #setMorale(record: ParticipantRecord, morale: number): void {
    const { combatant } = record;
    const { baseHealth, baseEnergy } = this.#ruleset.combat;
    combatant.morale = morale;
    combatant.maxHealth = moraleMaximum(baseHealth, record.resolvedMaxHealth, morale);
    combatant.maxEnergy = moraleMaximum(baseEnergy, record.resolvedMaxEnergy, morale);
    combatant.health = Math.min(combatant.health, effectiveMaxHealth(combatant));
    combatant.energy = Math.max(0, Math.min(combatant.energy, effectiveMaxEnergy(combatant)));
  }

  /** Whether `record`'s reset policy, other than `on-death`, calls for a reset now. */
  #resetDue(record: ParticipantRecord, dt: number): boolean {
    const policy = record.spec.reset;
    record.sinceReset += dt;
    switch (policy?.kind) {
      case "on-interval":
        return record.sinceReset >= policy.everySeconds;
      case "below-health":
        return record.combatant.health < record.combatant.maxHealth * policy.fraction;
      case "on-death":
      case "never":
      case undefined:
        return false;
    }
  }

  /**
   * Credit a kill to the team that scored it; the step checks for a winner
   * once every death in it is in.
   *
   * The victim's team is what is known at the point of death, so a kill
   * is credited to "the other team" rather than to a specific killer.
   * Attributing kills to individuals needs damage-source tracking, which
   * is honest future work rather than something to fake here.
   */
  private recordDeath(victimTeam: number): void {
    if (this.phase !== "active") {
      return;
    }
    const scoringTeam = victimTeam === 0 ? 1 : 0;
    this.#score = addKill(this.#score, scoringTeam);
  }

  /** Every team that had members: who is alive and its total morale (#846); creatures are neither (#1052). */
  #standing(): MatchStanding {
    const byTeam = new Map<number, TeamStanding>(
      [...this.#teams].map((team) => [team, { living: 0, morale: 0 }]),
    );
    for (const record of this.#participants.values()) {
      if (!countsForTeam(record)) {
        continue;
      }
      const { combatant } = record;
      const team = byTeam.get(combatant.team) ?? { living: 0, morale: 0 };
      byTeam.set(combatant.team, {
        living: team.living + (combatant.dead ? 0 : 1),
        morale: team.morale + combatant.morale,
      });
    }
    return { byTeam };
  }

  private checkMatchEnd(): void {
    if (this.#matchRules === undefined) {
      return;
    }
    const outcome = evaluateMatch(
      this.#score,
      this.#standing(),
      this.#elapsedSeconds,
      this.#matchRules,
    );
    if (outcome.phase !== "finished") {
      return;
    }
    this.#outcome = outcome;
  }

  private advanceMovement(record: ParticipantRecord, direction: Vec2, dt: number): void {
    // Where it pushes, even into a wall.
    if (direction.x !== 0 || direction.y !== 0) {
      record.facing = directionAngle(direction.x, direction.y);
    }
    const radius = this.#radiusOf(record);
    const start = record.position;
    let position = integrateMovement(
      start,
      direction,
      this.#ruleset.movement.maxSpeedUnitsPerSecond * moveSpeedMultiplier(record.combatant),
      dt,
    );

    // One push-out pass at a time, until a pass changes nothing. Squeezed
    // between a body and a wall, each push undoes the other, so one pass
    // alone can leave a body anywhere; a few settle it.
    for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
      const relaxed = this.#pushOut(record.id, position, radius);
      const settled = relaxed.x === position.x && relaxed.y === position.y;
      position = relaxed;
      if (settled) {
        break;
      }
    }

    // A doorway a body stands in stays held (#291): a move that ends any
    // deeper inside a living body than it started is refused, so hugging
    // the wall never squeezes past. Per body and against the start, so two
    // bodies that already overlap (a shared spawn) can still move apart.
    for (const [otherId, other] of this.#participants) {
      if (otherId === record.id || other.combatant.dead) {
        continue;
      }
      const reach = radius + this.#radiusOf(other);
      if (
        penetration(position, other.position, reach) >
        penetration(start, other.position, reach) + 1e-6
      ) {
        return;
      }
    }

    record.position = position;
  }

  /** One pass of push-outs for a body of `radius` at `position`: bodies, then walls, then the edge. */
  #pushOut(id: string, position: Vec2, radius: number): Vec2 {
    // Body blocking (brief §21): living players are solid, so a front
    // line can physically deny ground and a caster can be boxed in.
    // Corpses are not solid — standing on a dead player should never
    // trap the living.
    for (const [otherId, other] of this.#participants) {
      if (otherId === id || other.combatant.dead) {
        continue;
      }
      position = resolveCircleCircleCollision(
        position,
        radius,
        other.position,
        this.#radiusOf(other),
      );
    }

    // Walls resolve after bodies so a player squeezed between a blocker
    // and a wall ends up outside the wall rather than inside it — being
    // pushed through level geometry is far worse than overlapping a
    // teammate for one tick.
    for (const wallSegment of this.#walls) {
      position = resolveCircleSegmentCollision(position, radius, wallSegment);
    }

    // The map's edge last (#244), so nobody walks off it out of sight.
    // Every wall that meets an edge on today's maps is perpendicular to it,
    // so this slides a body along the wall's face, never into it.
    const bounds = this.#bounds;
    if (bounds !== undefined) {
      position = vec2(
        Math.min(Math.max(position.x, radius), bounds.width - radius),
        Math.min(Math.max(position.y, radius), bounds.height - radius),
      );
    }
    return position;
  }

  /**
   * Casting at somebody else turns you to them, after anything that
   * pushed you this step; nobody walks mid-cast, since a move cancels the
   * cast (#279). A self-cast, or a target that is gone, leaves facing
   * alone.
   */
  #faceCastTarget(record: ParticipantRecord): void {
    const targetId = record.combatant.cast.activeCast?.targetId;
    if (targetId === undefined || targetId === record.id) {
      return;
    }
    const target = this.#participants.get(targetId);
    if (target !== undefined) {
      faceToward(record, target.position);
    }
  }

  /**
   * Respawn, and every reset policy: the one way back to the start. At
   * the starting health, full energy, no adrenaline, nothing active, any
   * cast dropped, at spawn. Recharges carry on, as they would in a match.
   * A respawn keeps its overcast and fills only to the ceiling it leaves,
   * as GW1 keeps it through death; a reset clears it (#461), and morale
   * with it, maxima and all (#843).
   */
  #reset(record: ParticipantRecord, why: "respawn" | "reset"): void {
    if (why === "reset") {
      record.combatant.overcast = 0;
      this.#setMorale(record, 0);
    }
    record.combatant.dead = false;
    record.combatant.health = record.combatant.maxHealth * (record.spec.startHealthFraction ?? 1);
    record.combatant.energy = Math.max(0, effectiveMaxEnergy(record.combatant));
    emptyAdrenaline(record.combatant);
    record.combatant.lastCombatAt = this.#elapsedSeconds;
    record.combatant.statuses.clear();
    record.position = record.spawn;
    record.facing = record.spec.facing;
    record.inputDirection = ZERO;
    record.walkGoal = undefined;
    record.respawnInSeconds = 0;
    record.combatant.cast.cancelCast();
    record.combatant.cast.endAftercast();
    record.combatant.attack = undefined;
    record.combatant.knockdownRemaining = 0;
    this.#clearChainMarks(record);
    record.pendingSkill = undefined;
    record.sinceReset = 0;
    record.outOfCombatSeconds = 0;
    record.history.clear();
    record.combatant.moving = false;
    this.#stepStart.set(record.id, record.spawn);
  }

  /**
   * Who walked this step (#921): everyone at once, after everyone acted,
   * so the order the participants resolve in cannot change who is moving.
   */
  #settleMoving(): void {
    for (const record of this.#participants.values()) {
      const start = this.#stepStart.get(record.id);
      record.combatant.moving =
        !record.combatant.dead &&
        start !== undefined &&
        (start.x !== record.position.x || start.y !== record.position.y);
    }
  }

  /** Ticks in the ruleset's tracking window: at least two, or there is no motion to fit. */
  #historyLength(): number {
    return Math.max(
      2,
      Math.round(this.#ruleset.combat.trackWindowSeconds * this.#ruleset.tickRateHz),
    );
  }

  #combatant(spec: ParticipantSpec): Combatant {
    const maxHealth = spec.maxHealth ?? this.#ruleset.combat.baseHealth;
    const statuses = new StatusSet();
    return {
      id: spec.id,
      health: maxHealth * (spec.startHealthFraction ?? 1),
      maxHealth,
      energy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      maxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      overcast: 0,
      morale: 0,
      baseEnergyPips: spec.baseEnergyPips ?? 0,
      adrenaline: adrenalinePools(spec.skillBar),
      skillBar: spec.skillBar,
      lastCombatAt: this.#elapsedSeconds,
      attributeRanks: spec.attributeRanks,
      team: spec.team,
      dead: false,
      statuses,
      cast: new CastState(spec.id, statuses),
      attack: undefined,
      knockdownRemaining: 0,
      soulReapingTriggers: [],
      nextMaintainSeq: 0,
      chainMarks: new Map(),
      moving: false,
      equipment: spec.equipment,
    };
  }
}

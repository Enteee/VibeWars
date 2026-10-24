import type { ResolvedEquipment, ResolvedLoadout } from "../equipment/resolve.js";
import { resolveCircleCircleCollision, resolveCircleSegmentCollision } from "../geometry.js";
import type { Segment } from "../geometry.js";
import {
  addKill,
  emptyScore,
  evaluateMatch,
  MATCH_IN_PROGRESS,
  type MatchOutcome,
  type MatchPhase,
  type MatchRules,
  type MatchScore,
} from "../match-rules.js";
import { clampInputDirection, integrateMovement } from "../movement.js";
import { createRng, seedFromString, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { canActivate, payCost, type ActivationCheck } from "../skills/activation.js";
import { CastState } from "../skills/cast-state.js";
import { getSkill } from "../skills/catalog.js";
import { applyEffects } from "../skills/effects.js";
import { STATUS_DEFINITIONS, StatusSet } from "../skills/status.js";
import { advanceStatuses } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { ZERO, type Vec2 } from "../vec2.js";
import { createCursor, decide, type Behaviour, type BehaviourCursor } from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";

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
 * respawn countdown (if dead), movement, energy regeneration, statuses,
 * cast resolution, then the participant's behaviour, if it has one.
 * Player-driven participants have none: their intents arrive between
 * steps, through `setInputDirection`, `setTarget` and `requestSkill`.
 */

export interface ParticipantSpec {
  readonly id: string;
  readonly team: number;
  readonly skillBar: readonly string[];
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly equipment: ResolvedEquipment;
  readonly spawn: Vec2;
  /** Defaults to the ruleset's base health. */
  readonly maxHealth?: number;
  /** Defaults to the ruleset's base energy. */
  readonly maxEnergy?: number;
  /** Health to start (and reset) at, as a fraction of max. Defaults to 1. */
  readonly startHealthFraction?: number;
  /** Omitted: driven from outside, like a player. */
  readonly behaviour?: Behaviour | undefined;
}

export interface Participant {
  readonly id: string;
  readonly combatant: Combatant;
  readonly skillBar: readonly string[];
  readonly spawn: Vec2;
  position: Vec2;
  inputDirection: Vec2;
  targetId: string | undefined;
  respawnInSeconds: number;
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
}

/** `Participant`, plus what only the simulation may change. */
interface ParticipantRecord extends Participant {
  combatant: Combatant;
  skillBar: readonly string[];
  readonly spec: ParticipantSpec;
  readonly behaviour: Behaviour | undefined;
  readonly cursor: BehaviourCursor;
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
    const perSecond = STATUS_DEFINITIONS[status.id].healthPerSecond;
    if (perSecond < 0) {
      draining.add(status.sourceId);
    } else if (perSecond > 0) {
      healing.add(status.sourceId);
    }
  }
  const only = (sources: Set<string>): string | undefined =>
    sources.size === 1 ? [...sources][0] : undefined;
  return { draining: only(draining), healing: only(healing) };
}

export class MatchSimulation {
  readonly #ruleset: Ruleset;
  readonly #matchRules: MatchRules | undefined;
  readonly #walls: readonly Segment[];
  readonly #rng: SimulationRng;
  readonly #participants = new Map<string, ParticipantRecord>();

  #tick = 0;
  #elapsedSeconds = 0;
  #score: MatchScore = emptyScore([0, 1]);
  #outcome: MatchOutcome = MATCH_IN_PROGRESS;
  /** The entries of the step in progress. */
  #log: CombatLogEntry[] = [];

  public constructor(options: MatchSimulationOptions) {
    this.#ruleset = options.ruleset ?? MINIMAL_GW_INSPIRED_PVP_V1;
    this.#matchRules = options.matchRules;
    this.#walls = options.walls ?? [];
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

  public get(id: string): Participant | undefined {
    return this.#participants.get(id);
  }

  public participants(): IterableIterator<Participant> {
    return this.#participants.values();
  }

  public add(spec: ParticipantSpec): Participant {
    if (this.#participants.has(spec.id)) {
      throw new Error(`participant ${spec.id} is already in the match`);
    }
    const record: ParticipantRecord = {
      id: spec.id,
      combatant: this.#combatant(spec),
      skillBar: spec.skillBar,
      spawn: spec.spawn,
      position: spec.spawn,
      inputDirection: ZERO,
      targetId: undefined,
      respawnInSeconds: 0,
      spec,
      behaviour: spec.behaviour,
      cursor: createCursor(),
    };
    this.#participants.set(spec.id, record);
    return record;
  }

  /** Remove a participant and every target that pointed at them. */
  public remove(id: string): void {
    this.#participants.delete(id);
    for (const other of this.#participants.values()) {
      if (other.targetId === id) {
        other.targetId = undefined;
      }
    }
  }

  /**
   * Swap a participant's gear and skills in place: same id, team and
   * position, at their starting health and full energy, with nothing
   * active and nothing recharging. The loadout carries no skill bar, so it comes separately.
   */
  public rearm(id: string, loadout: ResolvedLoadout, skillBar: readonly string[]): void {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return;
    }
    record.combatant = this.#combatant({
      ...record.spec,
      attributeRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
      maxHealth: loadout.maxHealth,
      maxEnergy: loadout.maxEnergy,
    });
    record.skillBar = skillBar;
  }

  /**
   * Put a participant back as they started: what a respawn does, at their
   * starting health, with any cast in progress dropped.
   */
  public resetParticipant(id: string): void {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return;
    }
    this.respawn(record);
    record.combatant.cast.cancelCast();
    record.combatant.health = record.combatant.maxHealth * (record.spec.startHealthFraction ?? 1);
  }

  public setInputDirection(id: string, direction: Vec2): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      record.inputDirection = clampInputDirection(direction);
    }
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
   */
  public requestSkill(id: string, slot: number): SkillRequest | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }

    const skillId = record.skillBar[slot];
    if (skillId === undefined) {
      return undefined;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return undefined;
    }

    const check = this.#check(record, skill, record.targetId);
    if (!check.ok) {
      return { skillId: skill.id, check };
    }

    payCost(skill, record.combatant);
    record.combatant.cast.beginCast(
      skill.id,
      skill.target === "self" ? id : record.targetId,
      skill.activationSeconds,
    );
    return { skillId: skill.id, check };
  }

  public step(dt: number): StepResult {
    // A finished match stops simulating, so everyone can read the result.
    if (this.phase !== "active") {
      return this.#result([]);
    }

    this.#tick += 1;
    this.#elapsedSeconds += dt;
    this.#log = [];
    this.checkMatchEnd();

    for (const record of this.#participants.values()) {
      if (record.combatant.dead) {
        record.respawnInSeconds -= dt;
        if (record.respawnInSeconds <= 0) {
          this.respawn(record);
        }
        continue;
      }

      this.advanceMovement(record, dt);

      // Energy regenerates continuously; adrenaline is earned by acting,
      // not by waiting, so it deliberately does not tick up here.
      record.combatant.energy = Math.min(
        record.combatant.maxEnergy,
        record.combatant.energy + this.#ruleset.resources.energyRegenPerSecond * dt,
      );

      const sources = degenerationSources(record.combatant);
      const statusEvents = advanceStatuses(record.combatant, dt);
      if (statusEvents.length > 0) {
        const drained = statusEvents.some((event) => event.kind === "damage");
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: drained ? sources.draining : sources.healing,
          skillId: undefined,
          events: statusEvents,
        });
      }

      // Degeneration (bleeding, burning, a hex) can kill between ticks.
      // Keyed off the emitted death event rather than re-reading
      // `combatant.dead`: the flag was checked above, so narrowing would
      // claim this is unreachable, and losing this branch would leave a
      // corpse mid-cast that never respawns.
      if (statusEvents.some((event) => event.kind === "death")) {
        record.combatant.cast.cancelCast();
        record.respawnInSeconds = this.#respawnSeconds();
        this.recordDeath(record.combatant.team);
        continue;
      }

      const completed = record.combatant.cast.advance(dt);
      if (completed !== undefined) {
        this.resolveCast(record, completed.skillId, completed.targetId);
      }

      // Behaviours act after their own cast resolves, so a dummy can
      // finish one cast and begin the next within the same tick.
      if (record.behaviour !== undefined) {
        this.#act(record, record.behaviour, dt);
      }
    }

    return this.#result(this.#log);
  }

  #result(log: readonly CombatLogEntry[]): StepResult {
    return { tick: this.#tick, elapsedSeconds: this.#elapsedSeconds, phase: this.phase, log };
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
      canUse: (skillId, targetId) => {
        const skill = getSkill(skillId);
        return skill !== undefined && this.#check(record, skill, targetId).ok;
      },
    });
    this.setInputDirection(record.id, intent.moveDirection);
    this.setTarget(record.id, intent.targetId);
    if (intent.useSkillId !== undefined) {
      const slot = record.skillBar.indexOf(intent.useSkillId);
      if (slot !== -1) {
        this.requestSkill(record.id, slot);
      }
    }
  }

  /** Resolve a cast that has finished its activation time. */
  private resolveCast(
    record: ParticipantRecord,
    skillId: string,
    targetId: string | undefined,
  ): void {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return;
    }

    const targetRecord = targetId === undefined ? undefined : this.#participants.get(targetId);
    const events = applyEffects(skill.effects, {
      caster: record.combatant,
      target: skill.target === "self" ? record.combatant : targetRecord?.combatant,
      rng: this.#rng,
      rules: this.#ruleset.combat,
    });

    // Adrenaline is earned by landing damage, never by waiting — which is
    // what makes adrenaline skills a reward for staying in the fight
    // rather than a second energy pool. Weapon auto-attacks (the other
    // classic source) arrive with Sprint 21.
    const dealtDamage = events.some(
      (event) => event.kind === "damage" && event.targetId !== record.combatant.id,
    );
    if (dealtDamage) {
      record.combatant.adrenaline = Math.min(
        this.#ruleset.resources.maxAdrenaline,
        record.combatant.adrenaline + this.#ruleset.resources.adrenalinePerHit,
      );
    }

    // A skill that killed someone scores for the caster's side. Read
    // from the emitted events so every death routes through one place,
    // whether it came from a skill or from degeneration.
    for (const event of events) {
      if (event.kind !== "death") {
        continue;
      }
      const victim = this.#participants.get(event.targetId);
      if (victim !== undefined) {
        victim.respawnInSeconds = this.#respawnSeconds();
        this.recordDeath(victim.combatant.team);
      }
    }

    record.combatant.cast.startRecharge(skill.id, skill.rechargeSeconds);
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: record.id,
      skillId: skill.id,
      events,
    });
  }

  /** Without match rules nobody respawns: infinity never counts down to 0. */
  #respawnSeconds(): number {
    return this.#matchRules?.respawnSeconds ?? Number.POSITIVE_INFINITY;
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
    if (this.phase !== "active") {
      return;
    }
    const scoringTeam = victimTeam === 0 ? 1 : 0;
    this.#score = addKill(this.#score, scoringTeam);
    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    if (this.#matchRules === undefined) {
      return;
    }
    const outcome = evaluateMatch(this.#score, this.#elapsedSeconds, this.#matchRules);
    if (outcome.phase !== "finished") {
      return;
    }
    this.#outcome = outcome;
  }

  private advanceMovement(record: ParticipantRecord, dt: number): void {
    const radius = this.#ruleset.collision.playerRadius;
    let position = integrateMovement(
      record.position,
      record.inputDirection,
      this.#ruleset.movement.maxSpeedUnitsPerSecond,
      dt,
    );

    // Body blocking (brief §21): living players are solid, so a front
    // line can physically deny ground and a caster can be boxed in.
    // Corpses are not solid — standing on a dead player should never
    // trap the living.
    for (const [otherId, other] of this.#participants) {
      if (otherId === record.id || other.combatant.dead) {
        continue;
      }
      position = resolveCircleCircleCollision(position, radius, other.position, radius);
    }

    // Walls resolve last so a player squeezed between a blocker and a
    // wall ends up outside the wall rather than inside it — being pushed
    // through level geometry is far worse than overlapping a teammate
    // for one tick.
    for (const wallSegment of this.#walls) {
      position = resolveCircleSegmentCollision(position, radius, wallSegment);
    }

    record.position = position;
  }

  private respawn(record: ParticipantRecord): void {
    record.combatant.dead = false;
    record.combatant.health = record.combatant.maxHealth;
    record.combatant.energy = record.combatant.maxEnergy;
    record.combatant.adrenaline = 0;
    record.combatant.statuses.removeByCategory("condition");
    record.combatant.statuses.removeByCategory("hex");
    record.combatant.statuses.removeByCategory("enchantment");
    record.position = record.spawn;
    record.inputDirection = ZERO;
    record.respawnInSeconds = 0;
  }

  #combatant(spec: ParticipantSpec): Combatant {
    const maxHealth = spec.maxHealth ?? this.#ruleset.combat.baseHealth;
    return {
      id: spec.id,
      health: maxHealth * (spec.startHealthFraction ?? 1),
      maxHealth,
      energy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      maxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      adrenaline: 0,
      attributeRanks: spec.attributeRanks,
      team: spec.team,
      dead: false,
      statuses: new StatusSet(),
      cast: new CastState(),
      equipment: spec.equipment,
    };
  }
}

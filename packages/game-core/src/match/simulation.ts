import type { ResolvedEquipment, ResolvedLoadout } from "../equipment/resolve.js";
import {
  distanceWithinRange,
  firstHit,
  hasLineOfSight,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
} from "../geometry.js";
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
import { buildNavGraph, findPath, type NavGraph } from "../pathing.js";
import { createRng, seedFromString, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { canActivate, payCost, type ActivationCheck } from "../skills/activation.js";
import { CastState } from "../skills/cast-state.js";
import { getSkill } from "../skills/catalog.js";
import { applySkillEffects, type CombatEvent } from "../skills/effects.js";
import { STATUS_DEFINITIONS, StatusSet } from "../skills/status.js";
import { resolveTargets } from "../skills/targeting.js";
import {
  advanceStatuses,
  effectiveActivationSeconds,
  moveSpeedMultiplier,
} from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import {
  leadAimPoint,
  PositionHistory,
  trackTarget,
  type Projectile,
} from "../skills/projectile.js";
import { blindMisses, landBlow, resolveSwing, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from "../vec2.js";
import {
  createCursor,
  decide,
  nearestLiving,
  type Behaviour,
  type BehaviourCursor,
  type ResetPolicy,
} from "./behaviour.js";
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
 * reset policy, respawn countdown (if dead), movement, energy regeneration, statuses,
 * cast resolution, the weapon attack (approach or swing), then the
 * participant's behaviour, if it has one. Projectiles already in flight
 * advance, and land, before anyone acts. Player-driven participants have
 * none: their intents arrive between steps, through `setInputDirection`,
 * `setTarget`, `requestSkill`, `requestAttack` and `cancelAttack`.
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
  /** Omitted: `never`. Death then follows the match rules' respawn. */
  readonly reset?: ResetPolicy | undefined;
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
  /**
   * The map's size, which an attack's approach never paths outside of
   * (#211). Omitted: an open field with no edge.
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
}

/** `Participant`, plus what only the simulation may change. */
interface ParticipantRecord extends Participant {
  combatant: Combatant;
  skillBar: readonly string[];
  readonly spec: ParticipantSpec;
  readonly behaviour: Behaviour | undefined;
  readonly cursor: BehaviourCursor;
  /** `on-interval`: seconds since the last reset. */
  sinceReset: number;
  /** Where it ended its last ticks: what a projectile leads. */
  readonly history: PositionHistory;
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

/** How far short of its interval a swing or a flight may be and still land; see `#advanceAttack`. */
const SWING_EPSILON = 1e-9;

export class MatchSimulation {
  readonly #ruleset: Ruleset;
  readonly #matchRules: MatchRules | undefined;
  readonly #walls: readonly Segment[];
  /** Corners an approach can path through, built once from the walls (#211). */
  readonly #nav: NavGraph;
  readonly #rng: SimulationRng;
  readonly #participants = new Map<string, ParticipantRecord>();
  #projectiles: Projectile[] = [];
  #nextProjectileId = 1;

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
    this.#nav = buildNavGraph(this.#walls, options.bounds, this.#ruleset.collision.playerRadius);
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
      inputDirection: ZERO,
      targetId: undefined,
      respawnInSeconds: 0,
      spec,
      behaviour: spec.behaviour,
      cursor: createCursor(),
      sinceReset: 0,
      history: new PositionHistory(this.#historyLength()),
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
   * position, at the same fraction of their health and full energy, with
   * nothing active and nothing recharging. The loadout carries no skill
   * bar, so it comes separately.
   *
   * The health *fraction* carries over, not the starting health: a build
   * change that moves max health must not be a free heal, and a corpse
   * stays a corpse until its respawn.
   */
  public rearm(id: string, loadout: ResolvedLoadout, skillBar: readonly string[]): void {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return;
    }
    const before = record.combatant;
    const fraction = before.maxHealth > 0 ? before.health / before.maxHealth : 0;
    record.combatant = this.#combatant({
      ...record.spec,
      attributeRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
      maxHealth: loadout.maxHealth,
      maxEnergy: loadout.maxEnergy,
    });
    record.combatant.health = record.combatant.maxHealth * fraction;
    record.combatant.dead = before.dead;
    record.skillBar = skillBar;
  }

  /** Put a participant back as they started, exactly as a respawn does. */
  public resetParticipant(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#reset(record);
    }
  }

  /** Walk. Any direction but none cancels the attack: in GW1, moving does. */
  public setInputDirection(id: string, direction: Vec2): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      record.inputDirection = clampInputDirection(direction);
      if (record.inputDirection.x !== 0 || record.inputDirection.y !== 0) {
        record.combatant.attack = undefined;
      }
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
   */
  public requestAttack(id: string, targetId: string): ActivationCheck | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }
    const check = this.#attackCheck(record, targetId);
    if (check.ok && record.combatant.attack?.targetId !== targetId) {
      record.combatant.attack = { targetId, swingElapsed: 0 };
    }
    return check;
  }

  public cancelAttack(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      record.combatant.attack = undefined;
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
    if (skillId === undefined) {
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
    if (!check.ok) {
      return { skillId: skill.id, check };
    }

    payCost(skill, record.combatant);
    // The swing in progress is lost, as in GW1; the attack itself resumes
    // once the skill is done.
    if (record.combatant.attack !== undefined) {
      record.combatant.attack.swingElapsed = 0;
    }
    record.combatant.cast.beginCast(
      skill.id,
      castTargetId,
      effectiveActivationSeconds(skill, record.combatant),
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
    this.#advanceProjectiles(dt);

    for (const record of this.#participants.values()) {
      if (this.#resetDue(record, dt)) {
        this.#reset(record);
      }

      if (record.combatant.dead) {
        record.respawnInSeconds -= dt;
        if (record.respawnInSeconds <= 0) {
          this.#reset(record);
        }
        continue;
      }

      this.advanceMovement(record, record.inputDirection, dt);

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
          area: undefined,
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
        this.#recordDeaths(statusEvents);
        continue;
      }

      const completed = record.combatant.cast.advance(dt);
      if (completed !== undefined) {
        this.resolveCast(record, completed.skillId, completed.targetId);
      }

      this.#advanceAttack(record, dt);
      // Walked or approached: either way, it is what a shot leads.
      record.history.push(record.position);

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
      stepUnits:
        this.#ruleset.movement.maxSpeedUnitsPerSecond * moveSpeedMultiplier(record.combatant) * dt,
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
    // As a skill effect applies it: the dummy is the source, so the
    // degeneration it causes is attributed to the dummy.
    for (const application of intent.applyStatuses) {
      const target = this.#participants.get(application.targetId);
      if (target !== undefined && !target.combatant.dead) {
        target.combatant.statuses.apply(
          application.statusId,
          application.durationSeconds,
          record.id,
        );
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
    const primary = skill.target === "self" ? record : targetRecord;
    const events = applySkillEffects({
      skill,
      caster: record.combatant,
      targets: resolveTargets({
        skill,
        caster: record.combatant,
        casterPosition: record.position,
        primary,
        // Only an area looks past the primary: skip the copy every other
        // cast would make for nothing.
        candidates: skill.area === undefined ? [] : [...this.#participants.values()],
        losBlockers: this.#walls,
      }),
      rng: this.#rng,
      rules: this.#ruleset.combat,
    });
    // Where an area landed, for whoever draws it: nowhere, when an area
    // centred on a target had no target to centre on.
    const origin = skill.area?.origin === "caster" ? record.position : primary?.position;
    const area =
      skill.area === undefined || origin === undefined
        ? undefined
        : { x: origin.x, y: origin.y, radius: skill.area.radius };

    // Only attack skills earn adrenaline, as weapon hits do: a spell is
    // paid for in energy, and earning both would make casters the best
    // adrenaline builders.
    if (skill.type === "attack") {
      this.#gainAdrenaline(record, events);
    }
    this.#recordDeaths(events);
    // A skill on an enemy turns on them with the weapon, as in GW1: it
    // starts an attack, or switches one to them. Any other skill leaves
    // the attack in progress to resume on its own target.
    if (primary !== undefined && this.#attackCheck(record, primary.id).ok) {
      record.combatant.attack = { targetId: primary.id, swingElapsed: 0 };
    }

    record.combatant.cast.startRecharge(skill.id, skill.rechargeSeconds);
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: record.id,
      skillId: skill.id,
      area,
      events,
    });
  }

  /**
   * The attack step (ADR-0026): drop an attack whose target is no longer
   * a living enemy, pause while casting, walk into reach, then swing.
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
    // otherwise approach on top of the walk, at twice the speed.
    if (record.inputDirection.x !== 0 || record.inputDirection.y !== 0) {
      record.combatant.attack = undefined;
      return;
    }
    if (record.combatant.cast.isCasting) {
      return;
    }

    const { weapon } = record.combatant.equipment.mainHand;
    if (
      !distanceWithinRange(record.position, target.position, weapon.range) ||
      !hasLineOfSight(record.position, target.position, this.#walls)
    ) {
      // Approach until in reach and in sight, round walls (#211): the only
      // movement the simulation chooses, and never on top of the
      // player's own. Replanned every tick, so a target that moves, or a
      // shove, is simply where the next plan starts.
      const path = findPath(this.#nav, record.position, target.position);
      const next = path?.[0];
      if (next === undefined) {
        record.combatant.attack = undefined;
        this.#logWeapon(record.id, [{ kind: "attack-unreachable", targetId: target.id }]);
        return;
      }
      this.advanceMovement(record, sub(next, record.position), dt);
      return;
    }

    attack.swingElapsed += dt;
    // Within a hair: twenty-odd additions of 0.05 fall just short of
    // 1.75, and a swing a whole tick late would make the rate drift.
    if (attack.swingElapsed < weapon.attackIntervalSeconds - SWING_EPSILON) {
      return;
    }
    attack.swingElapsed = Math.max(0, attack.swingElapsed - weapon.attackIntervalSeconds);

    if (weapon.projectileSpeed !== undefined) {
      this.#release(record, target, weapon.projectileSpeed, dt);
      return;
    }
    const events = resolveSwing({
      attacker: record.combatant,
      target,
      candidates: weapon.cleaveTargets === 0 ? [] : [...this.#participants.values()],
      rng: this.#rng,
      rules: this.#ruleset.combat,
    });
    this.#gainAdrenaline(record, events);
    this.#recordDeaths(events);
    this.#logWeapon(record.id, events);
  }

  /**
   * A ranged swing lands as a shot leaving the bow, led ahead of the
   * target. Blind is rolled now, as GW1 does: a blinded shot misses at
   * once and nothing flies. Then line of sight, once: a wall in the way
   * spends the swing and nothing flies either, and the next swing looks
   * again. Melee is never checked; its reach is shorter than any gap.
   */
  #release(record: ParticipantRecord, target: ParticipantRecord, speed: number, dt: number): void {
    if (blindMisses(record.combatant, this.#rng)) {
      this.#logWeapon(record.id, [{ kind: "attack-missed", targetId: target.id }]);
      return;
    }
    if (!hasLineOfSight(record.position, target.position, this.#walls)) {
      this.#logWeapon(record.id, [{ kind: "attack-obstructed", targetId: target.id }]);
      return;
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
    });
    this.#nextProjectileId += 1;
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
   * to dodge, so nothing happens.
   */
  #land(projectile: Projectile): void {
    if (projectile.obstructed) {
      // It hit the wall; where the target is now has nothing to do with it.
      this.#logWeapon(projectile.attackerId, [
        { kind: "attack-obstructed", targetId: projectile.targetId },
      ]);
      return;
    }
    const target = this.#participants.get(projectile.targetId);
    if (target === undefined || target.combatant.dead) {
      return;
    }
    const reach = this.#ruleset.collision.playerRadius + this.#ruleset.combat.projectileTolerance;
    const events: CombatEvent[] = [];
    if (distance(target.position, projectile.aimPoint) <= reach) {
      landBlow(
        projectile.weaponSnapshot,
        target.combatant,
        this.#rng,
        this.#ruleset.combat,
        events,
      );
    } else {
      events.push({ kind: "attack-dodged", targetId: target.id });
    }
    const attacker = this.#participants.get(projectile.attackerId);
    if (attacker !== undefined && !attacker.combatant.dead) {
      this.#gainAdrenaline(attacker, events);
    }
    this.#recordDeaths(events);
    this.#logWeapon(projectile.attackerId, events);
  }

  #logWeapon(sourceId: string, events: readonly CombatEvent[]): void {
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "weapon",
      sourceId,
      skillId: undefined,
      area: undefined,
      events,
    });
  }

  /** Why `record` may not attack `targetId`, as a cast at it would be told. */
  #attackCheck(record: ParticipantRecord, targetId: string): ActivationCheck {
    const target = this.#participants.get(targetId)?.combatant;
    if (record.combatant.dead) {
      return { ok: false, reason: "caster-dead" };
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
   * Adrenaline is earned by landing damage on someone else, never by
   * waiting, which makes adrenaline skills a reward for staying in the
   * fight rather than a second energy pool. Once per resolution, however
   * many it hit.
   */
  #gainAdrenaline(record: ParticipantRecord, events: readonly CombatEvent[]): void {
    const dealtDamage = events.some(
      (event) => event.kind === "damage" && event.targetId !== record.combatant.id,
    );
    if (dealtDamage) {
      record.combatant.adrenaline = Math.min(
        this.#ruleset.resources.maxAdrenaline,
        record.combatant.adrenaline + this.#ruleset.resources.adrenalinePerHit,
      );
    }
  }

  /**
   * Every death in `events` scores for the other side and starts its
   * respawn. Read from the emitted events so every death routes through
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
        victim.respawnInSeconds = this.#respawnSeconds(victim);
        this.recordDeath(victim.combatant.team);
      }
    }
  }

  /**
   * How long `record` stays dead: its own `on-death` reset if it has one,
   * else the match rules'. Without match rules nobody respawns: infinity
   * never counts down to 0.
   */
  #respawnSeconds(record: ParticipantRecord): number {
    if (record.spec.reset?.kind === "on-death") {
      return record.spec.reset.afterSeconds;
    }
    return this.#matchRules?.respawnSeconds ?? Number.POSITIVE_INFINITY;
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

  private advanceMovement(record: ParticipantRecord, direction: Vec2, dt: number): void {
    const radius = this.#ruleset.collision.playerRadius;
    let position = integrateMovement(
      record.position,
      direction,
      this.#ruleset.movement.maxSpeedUnitsPerSecond * moveSpeedMultiplier(record.combatant),
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

  /**
   * Respawn, and every reset policy: the one way back to the start. At
   * the starting health, full energy, no adrenaline, nothing active, any
   * cast dropped, at spawn. Recharges carry on, as they would in a match.
   */
  #reset(record: ParticipantRecord): void {
    record.combatant.dead = false;
    record.combatant.health = record.combatant.maxHealth * (record.spec.startHealthFraction ?? 1);
    record.combatant.energy = record.combatant.maxEnergy;
    record.combatant.adrenaline = 0;
    record.combatant.statuses.removeByCategory("condition");
    record.combatant.statuses.removeByCategory("hex");
    record.combatant.statuses.removeByCategory("enchantment");
    record.position = record.spawn;
    record.inputDirection = ZERO;
    record.respawnInSeconds = 0;
    record.combatant.cast.cancelCast();
    record.combatant.attack = undefined;
    record.sinceReset = 0;
    record.history.clear();
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
      attack: undefined,
      equipment: spec.equipment,
    };
  }
}

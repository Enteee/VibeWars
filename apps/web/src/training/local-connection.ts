import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  applyIntent,
  drainAccumulator,
  energyCostOf,
  getSkill,
  type Combatant,
  type MatchSimulation,
  type Participant,
  type ProfessionId,
  type ResolvedLoadout,
  type SkillBar,
  type StepResult,
} from "@vibewars/game-core";
import type { CastRefusedMessage, ClientIntent, MapDescriptor } from "@vibewars/game-protocol";
import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
  SkillSlot,
} from "@vibewars/game-session";

/**
 * A `MatchConnection` backed by a `MatchSimulation` running in this tab
 * (#2 §4.3), for the Training Ground.
 *
 * The renderer, the input handling and the combat feedback are written
 * against `MatchConnection`, so they cannot tell this from the server.
 * That is the point: the training arena measures the identical code a
 * match runs. It is never a source of truth for a networked match
 * (ADR-0020); nothing it computes is ever sent anywhere.
 */

export interface LocalMatchConnection extends MatchConnection {
  readonly simulation: MatchSimulation;
  /** Advance the clock by a frame's worth of wall time; runs whole ticks. */
  advance(elapsedSeconds: number): void;
  /** Every step's result, including the status ticks `onCombat` folds away. */
  onStep(handler: (result: StepResult) => void): void;
  /** Swap the player's build in place; the skill bar follows. */
  rearm(loadout: ResolvedLoadout, skillBar: SkillBar): void;
}

/** One simulation tick, at the ruleset's rate, exactly as the server steps. */
export const TICK_SECONDS = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

/**
 * The bar the HUD draws, from skill ids, gaps kept, as the server sends it
 * on join: energy costs are what `bearer` pays (#528).
 */
export function skillSlotsFor(
  skillBar: SkillBar,
  bearer: Pick<Combatant, "attributeRanks">,
): (SkillSlot | null)[] {
  return skillBar.map((skillId) => {
    if (skillId === null) {
      return null;
    }
    const skill = getSkill(skillId);
    return {
      id: skillId,
      name: skill?.name ?? skillId,
      energyCost: skill === undefined ? 0 : energyCostOf(skill, bearer),
      adrenalineCost: skill?.cost?.kind === "adrenaline" ? skill.cost.amount : 0,
      activationSeconds: skill?.activationSeconds ?? 0,
      rechargeSeconds: skill?.rechargeSeconds ?? 0,
    };
  });
}

/** A participant's professions, as a snapshot carries them (#281). */
export interface Professions {
  readonly primary: ProfessionId | undefined;
  readonly secondary: ProfessionId | undefined;
}

/** A dummy's: it has no build, so no profession. */
export const NO_PROFESSIONS: Professions = { primary: undefined, secondary: undefined };

function toPlayerSnapshot(
  participant: Participant,
  name: string,
  professions: Professions,
): PlayerSnapshot {
  const { combatant } = participant;
  const activeCast = combatant.cast.activeCast;
  return {
    sessionId: participant.id,
    name,
    x: participant.position.x,
    y: participant.position.y,
    facing: participant.facing,
    targetSessionId: participant.targetId,
    attackTargetSessionId: combatant.attack?.targetId,
    walking: participant.walkGoal !== undefined || participant.pendingSkill !== undefined,
    health: Math.round(combatant.health),
    maxHealth: combatant.maxHealth,
    energy: Math.round(combatant.energy),
    maxEnergy: combatant.maxEnergy,
    adrenaline: combatant.adrenaline,
    armor: combatant.equipment.baseArmor,
    weaponId: combatant.equipment.mainHand.weapon.id,
    offhandId: combatant.equipment.offhandId,
    primaryProfession: professions.primary,
    secondaryProfession: professions.secondary,
    team: combatant.team,
    dead: combatant.dead,
    castingSkillId: activeCast?.skillId,
    castRemaining: activeCast?.remainingSeconds ?? 0,
    castTotal: activeCast?.totalSeconds ?? 0,
    statuses: combatant.statuses.active.map((status) => status.id),
  };
}

export function createLocalConnection(options: {
  readonly simulation: MatchSimulation;
  readonly selfId: string;
  readonly map: MapDescriptor;
  /** What to call each participant: dummies by label, the player by their name. */
  readonly nameOf: (id: string) => string;
  /** Each participant's professions: the player's build's, a dummy's none. */
  readonly professionsOf: (id: string) => Professions;
}): LocalMatchConnection {
  const { simulation, selfId, map, nameOf, professionsOf } = options;
  const selfBar = (bar: SkillBar) =>
    skillSlotsFor(bar, {
      attributeRanks: simulation.get(selfId)?.combatant.attributeRanks ?? new Map(),
    });
  let skillBar = selfBar(simulation.get(selfId)?.skillBar ?? []);
  let accumulator = 0;
  let closed = false;
  const stepHandlers: ((result: StepResult) => void)[] = [];
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const refusalHandlers: ((message: CastRefusedMessage) => void)[] = [];

  const deliver = (result: StepResult): void => {
    for (const handler of stepHandlers) {
      handler(result);
    }
    for (const entry of result.log) {
      if (entry.events.length === 0) {
        continue;
      }
      // The same envelope the server broadcasts: a status tick goes out
      // as its bearer's, with no skill, a swing as its attacker's, and
      // an area skill says where it landed, for the flash (#5).
      const casterSessionId =
        (entry.cause === "degeneration" ? entry.events[0]?.targetId : entry.sourceId) ?? "";
      const { cause } = entry;
      const skillId = entry.skillId ?? "";
      const weaponId = entry.weaponId ?? "";
      const message: CombatMessage =
        entry.area === undefined
          ? { casterSessionId, cause, skillId, weaponId, events: entry.events }
          : { casterSessionId, cause, skillId, weaponId, events: entry.events, area: entry.area };
      for (const handler of combatHandlers) {
        handler(message);
      }
    }
  };

  const sendIntent = (intent: ClientIntent): void => {
    if (closed) {
      return;
    }
    const refusal = applyIntent(simulation, selfId, intent);
    if (refusal !== null) {
      for (const handler of refusalHandlers) {
        handler(refusal);
      }
    }
  };

  return {
    simulation,
    selfSessionId: selfId,
    map,
    get skillBar() {
      return skillBar;
    },
    get ranks() {
      // Straight from the simulation, so a rearm shows at once.
      return simulation.get(selfId)?.combatant.attributeRanks ?? new Map<string, number>();
    },
    onConnectionChange() {
      // Nothing to lose: the simulation is in this tab.
    },
    sendIntent,
    getSnapshot(): MatchSnapshot {
      return {
        selfSessionId: selfId,
        players: [...simulation.participants()].map((participant) =>
          toPlayerSnapshot(participant, nameOf(participant.id), professionsOf(participant.id)),
        ),
        scoreTeam0: simulation.score.byTeam.get(0) ?? 0,
        scoreTeam1: simulation.score.byTeam.get(1) ?? 0,
        elapsedSeconds: simulation.elapsedSeconds,
        phase: simulation.phase,
        winningTeam: simulation.outcome.winningTeam,
        endReason: simulation.outcome.reason,
        projectiles: simulation.projectiles.map((shot) => ({
          id: shot.id,
          attackerId: shot.attackerId,
          skillId: shot.skillHit?.kind === "spell" ? shot.skillHit.skill.id : undefined,
          from: shot.from,
          to: shot.aimPoint,
          launchedAt: simulation.elapsedSeconds - shot.elapsed,
          flightSeconds: shot.flightSeconds,
        })),
      };
    },
    onCombat(handler) {
      combatHandlers.push(handler);
    },
    onCastRefused(handler) {
      refusalHandlers.push(handler);
    },
    getRecharges() {
      // Straight from the simulation: there is no wire to extrapolate over.
      const cast = simulation.get(selfId)?.combatant.cast;
      return skillBar.map((slot) => ({
        remaining: (slot === null ? undefined : cast?.rechargeRemaining.get(slot.id)) ?? 0,
        total: (slot === null ? undefined : cast?.rechargeTotal.get(slot.id)) ?? 0,
      }));
    },
    onStep(handler) {
      stepHandlers.push(handler);
    },
    advance(elapsedSeconds) {
      if (closed) {
        return;
      }
      const drained = drainAccumulator(accumulator, elapsedSeconds, TICK_SECONDS);
      accumulator = drained.remainder;
      for (let i = 0; i < drained.ticks; i += 1) {
        deliver(simulation.step(TICK_SECONDS));
      }
    },
    rearm(loadout, nextBar) {
      simulation.rearm(selfId, loadout, nextBar);
      skillBar = selfBar(nextBar);
    },
    disconnect() {
      closed = true;
      stepHandlers.length = 0;
      combatHandlers.length = 0;
      refusalHandlers.length = 0;
      return Promise.resolve();
    },
  };
}

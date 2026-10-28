import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  adrenalineLossIn,
  applyIntent,
  drainAccumulator,
  resolvedBar,
  swingProgress,
  type MatchSimulation,
  type NetPips,
  type Participant,
  type ProfessionId,
  type ResolvedLoadout,
  type SkillBar,
  type SlotSkill,
  type StepResult,
} from "@vibewars/game-core";
import type {
  CastRefusedMessage,
  ClientIntent,
  MapDescriptor,
  PeerCall,
} from "@vibewars/game-protocol";
import {
  createCallBoard,
  groundEffectSnapshot,
  sameSkillBar,
  skillBarSlots,
  statusSnapshot,
  wireStatuses,
  wireWeaponSets,
  type CallsSnapshot,
  type CombatMessage,
  type MatchConnection,
  type MatchSnapshot,
  type PlayerSnapshot,
  type SkillSlot,
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
  pips: NetPips,
  elapsedSeconds: number,
): PlayerSnapshot {
  const { combatant } = participant;
  const activeCast = combatant.cast.activeCast;
  const swing = swingProgress(combatant);
  return {
    sessionId: participant.id,
    // A creature (#1052) is named for its kind and has no professions.
    name: participant.creature?.name ?? name,
    x: participant.position.x,
    y: participant.position.y,
    facing: participant.facing,
    targetSessionId: participant.targetId,
    attackTargetSessionId: combatant.attack?.targetId,
    walking: participant.walkGoal !== undefined || participant.pendingSkill !== undefined,
    health: Math.round(combatant.health),
    maxHealth: combatant.maxHealth,
    // Clamped as the host clamps it: energy below 0 is hidden (#489).
    energy: Math.max(0, Math.round(combatant.energy)),
    maxEnergy: combatant.maxEnergy,
    overcast: Math.round(combatant.overcast),
    morale: combatant.morale,
    armor: combatant.equipment.baseArmor,
    weaponId: combatant.equipment.mainHand.weapon.id,
    offhandId: combatant.equipment.offhandId,
    primaryProfession: participant.creature === undefined ? professions.primary : undefined,
    secondaryProfession: participant.creature === undefined ? professions.secondary : undefined,
    team: combatant.team,
    dead: combatant.dead,
    corpseExploited: participant.corpseExploited,
    castingSkillId: activeCast?.skillId,
    castRemaining: activeCast?.remainingSeconds ?? 0,
    castTotal: activeCast?.totalSeconds ?? 0,
    swingElapsed: swing.elapsed,
    swingTotal: swing.total,
    knockdownRemaining: combatant.knockdownRemaining,
    healthPips: pips.health,
    energyPips: pips.energy,
    statuses: wireStatuses(combatant.statuses.active).map((status) =>
      statusSnapshot(status, elapsedSeconds, activeCast),
    ),
    creature:
      participant.creature === undefined
        ? undefined
        : { ownerId: participant.creature.ownerId, kind: participant.creature.kind },
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
  // What each slot holds now, a copy standing in one (#469) included.
  const held = (): readonly (SlotSkill | null)[] => {
    const self = simulation.get(selfId);
    return self === undefined ? [] : resolvedBar(self.skillBar, self.combatant.cast);
  };
  // The bar as the host would send it: costs follow the player, glyph and
  // all, and it changes only when a slot does (#637).
  const selfBar = (): (SkillSlot | null)[] => {
    const self = simulation.get(selfId);
    return self === undefined
      ? []
      : skillBarSlots(
          held().map((slot) => slot?.skillId ?? null),
          self.combatant,
        );
  };
  let skillBar = selfBar();
  let accumulator = 0;
  let closed = false;
  const stepHandlers: ((result: StepResult) => void)[] = [];
  const combatHandlers: ((message: CombatMessage) => void)[] = [];
  const refusalHandlers: ((message: CastRefusedMessage) => void)[] = [];
  // The host's own call board, for your team alone, so the controls can be
  // learned here (#443).
  const calls = createCallBoard(map);
  const alive = (id: string): boolean => simulation.get(id)?.combatant.dead === false;
  const selfTeam = (): 0 | 1 => (simulation.get(selfId)?.combatant.team === 1 ? 1 : 0);

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
      const attributeId = entry.attributeId ?? "";
      const { doubleStrike, events } = entry;
      const base = { casterSessionId, cause, skillId, weaponId, attributeId, doubleStrike, events };
      const message: CombatMessage =
        entry.area === undefined ? base : { ...base, area: entry.area };
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

  const sendCall = (call: PeerCall): void => {
    if (closed || !alive(selfId)) {
      return;
    }
    const team = selfTeam();
    const isLiveEnemy = (targetId: string): boolean =>
      alive(targetId) && simulation.get(targetId)?.combatant.team !== team;
    calls.call(team, selfId, call, simulation.elapsedSeconds, isLiveEnemy);
  };

  const getCalls = (): CallsSnapshot => {
    const now = simulation.elapsedSeconds;
    calls.step(now, alive);
    return calls.view(selfTeam(), now);
  };

  return {
    simulation,
    selfSessionId: selfId,
    sendCall,
    getCalls,
    map,
    get skillBar() {
      return skillBar;
    },
    get ranks() {
      // Straight from the simulation, so a rearm shows at once.
      return simulation.get(selfId)?.combatant.attributeRanks ?? new Map<string, number>();
    },
    get weaponSets() {
      // Straight from the simulation too: a swap or a rearm shows at once (#489).
      const self = simulation.get(selfId);
      return self === undefined ? undefined : wireWeaponSets(self);
    },
    onConnectionChange() {
      // Nothing to lose: the simulation is in this tab.
    },
    sendIntent,
    getSnapshot(): MatchSnapshot {
      return {
        selfSessionId: selfId,
        players: [...simulation.participants()].map((participant) =>
          toPlayerSnapshot(
            participant,
            nameOf(participant.id),
            professionsOf(participant.id),
            simulation.pips(participant),
            simulation.elapsedSeconds,
          ),
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
        groundEffects: simulation.groundEffects
          .filter((effect) => effect.act.kind !== "trap")
          .map((effect) => groundEffectSnapshot(effect, simulation.elapsedSeconds)),
        // As the host sends them (#1105): your own team's alone.
        traps: simulation.groundEffects
          .filter((effect) => effect.act.kind === "trap" && effect.team === selfTeam())
          .map((effect) => groundEffectSnapshot(effect, simulation.elapsedSeconds)),
        // No match with rules ends here, so there is never a summary (#1057).
        summary: undefined,
      };
    },
    onCombat(handler) {
      combatHandlers.push(handler);
    },
    onCastRefused(handler) {
      refusalHandlers.push(handler);
    },
    getAdrenaline() {
      // Straight from the simulation, as the recharges are (#463).
      const combatant = simulation.get(selfId)?.combatant;
      return held().map((slot) => (slot === null ? 0 : (combatant?.adrenaline.get(slot.key) ?? 0)));
    },
    getAdrenalineLossIn() {
      const combatant = simulation.get(selfId)?.combatant;
      return combatant === undefined
        ? null
        : adrenalineLossIn(
            combatant,
            simulation.elapsedSeconds,
            MINIMAL_GW_INSPIRED_PVP_V1.resources.adrenalineLossSeconds,
          );
    },
    getChainMark(targetId) {
      // Straight from the simulation, which drops a mark the tick it runs out (#916).
      return simulation.get(selfId)?.combatant.chainMarks.get(targetId)?.role;
    },
    getRecharges() {
      // Straight from the simulation: there is no wire to extrapolate over.
      const cast = simulation.get(selfId)?.combatant.cast;
      return held().map((slot) => ({
        remaining: (slot === null ? undefined : cast?.rechargeRemaining.get(slot.key)) ?? 0,
        total: (slot === null ? undefined : cast?.rechargeTotal.get(slot.key)) ?? 0,
        spent: slot !== null && cast?.spent.has(slot.key) === true,
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
        const next = selfBar();
        if (!sameSkillBar(skillBar, next)) {
          skillBar = next;
        }
      }
    },
    rearm(loadout, nextBar) {
      simulation.rearm(selfId, loadout, nextBar);
      skillBar = selfBar();
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

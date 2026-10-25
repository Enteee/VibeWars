import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  ZERO,
  getSkill,
  vec2,
  type MatchSimulation,
  type Participant,
  type ResolvedLoadout,
  type StepResult,
} from "@vibewars/game-core";
import type { CastRefusedMessage, ClientIntent, MapDescriptor } from "@vibewars/game-protocol";

import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
  SkillSlot,
} from "../net/match-connection.js";

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
  rearm(loadout: ResolvedLoadout, skillBar: readonly string[]): void;
}

/** One simulation tick, at the ruleset's rate, exactly as the server steps. */
export const TICK_SECONDS = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

/**
 * The most wall time one frame may catch up on. A backgrounded tab comes
 * back with a delta of minutes; running every tick of it at once would
 * freeze the page and fast-forward the fight past anything worth seeing.
 */
export const MAX_CATCHUP_SECONDS = 0.25;

const TICK_EPSILON = 1e-9;

/**
 * The fixed-step accumulator, as a pure function: how many ticks this
 * frame runs, and the time carried to the next one.
 *
 * Lives in `apps/web`, never in `game-core`: the simulation stays
 * clock-free (ADR-0003), and only the pump differs from the server's
 * `setFixedTimestep`.
 */
export function drainAccumulator(
  accumulator: number,
  elapsedSeconds: number,
  tickSeconds: number = TICK_SECONDS,
): { readonly ticks: number; readonly remainder: number } {
  let remainder = Math.min(
    accumulator + Math.max(0, elapsedSeconds),
    MAX_CATCHUP_SECONDS + tickSeconds,
  );
  let ticks = 0;
  // Within a hair of a whole tick counts as one: two half-tick frames
  // sum to 0.04999… in floating point, and must not wait a third frame.
  while (remainder >= tickSeconds - TICK_EPSILON) {
    remainder = Math.max(0, remainder - tickSeconds);
    ticks += 1;
  }
  return { ticks, remainder };
}

/** The bar the HUD draws, from skill ids, as the server sends it on join. */
export function skillSlotsFor(skillBar: readonly string[]): SkillSlot[] {
  return skillBar.map((skillId) => {
    const skill = getSkill(skillId);
    return {
      id: skillId,
      name: skill?.name ?? skillId,
      energyCost: skill?.cost?.kind === "energy" ? skill.cost.amount : 0,
      adrenalineCost: skill?.cost?.kind === "adrenaline" ? skill.cost.amount : 0,
      activationSeconds: skill?.activationSeconds ?? 0,
      rechargeSeconds: skill?.rechargeSeconds ?? 0,
    };
  });
}

function toPlayerSnapshot(participant: Participant, name: string): PlayerSnapshot {
  const { combatant } = participant;
  const activeCast = combatant.cast.activeCast;
  return {
    sessionId: participant.id,
    name,
    x: participant.position.x,
    y: participant.position.y,
    targetSessionId: participant.targetId,
    health: Math.round(combatant.health),
    maxHealth: combatant.maxHealth,
    energy: Math.round(combatant.energy),
    maxEnergy: combatant.maxEnergy,
    adrenaline: combatant.adrenaline,
    armor: combatant.equipment.baseArmor,
    weaponId: combatant.equipment.mainHand.weapon.id,
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
}): LocalMatchConnection {
  const { simulation, selfId, map, nameOf } = options;
  let skillBar = skillSlotsFor(simulation.get(selfId)?.skillBar ?? []);
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
      const skillId = entry.skillId ?? "";
      const message: CombatMessage =
        entry.area === undefined
          ? { casterSessionId, skillId, events: entry.events }
          : { casterSessionId, skillId, events: entry.events, area: entry.area };
      for (const handler of combatHandlers) {
        handler(message);
      }
    }
  };

  const sendIntent = (intent: ClientIntent): void => {
    if (closed) {
      return;
    }
    switch (intent.kind) {
      case "stop":
        simulation.setInputDirection(selfId, ZERO);
        return;
      case "move":
        simulation.setInputDirection(selfId, vec2(intent.dirX, intent.dirY));
        return;
      case "target":
        simulation.setTarget(selfId, intent.targetSessionId ?? undefined);
        return;
      case "use-skill": {
        const request = simulation.requestSkill(selfId, intent.slot);
        if (request !== undefined && !request.check.ok) {
          const message = {
            slot: intent.slot,
            skillId: request.skillId,
            reason: request.check.reason,
          };
          for (const handler of refusalHandlers) {
            handler(message);
          }
        }
        return;
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
    onConnectionChange() {
      // Nothing to lose: the simulation is in this tab.
    },
    sendIntent,
    getSnapshot(): MatchSnapshot {
      return {
        selfSessionId: selfId,
        players: [...simulation.participants()].map((participant) =>
          toPlayerSnapshot(participant, nameOf(participant.id)),
        ),
        scoreTeam0: simulation.score.byTeam.get(0) ?? 0,
        scoreTeam1: simulation.score.byTeam.get(1) ?? 0,
        elapsedSeconds: simulation.elapsedSeconds,
        phase: simulation.phase,
        winningTeam: simulation.outcome.winningTeam,
        endReason: simulation.outcome.reason,
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
        remaining: cast?.rechargeRemaining.get(slot.id) ?? 0,
        total: cast?.rechargeTotal.get(slot.id) ?? 0,
      }));
    },
    onStep(handler) {
      stepHandlers.push(handler);
    },
    advance(elapsedSeconds) {
      if (closed) {
        return;
      }
      const drained = drainAccumulator(accumulator, elapsedSeconds);
      accumulator = drained.remainder;
      for (let i = 0; i < drained.ticks; i += 1) {
        deliver(simulation.step(TICK_SECONDS));
      }
    },
    rearm(loadout, nextBar) {
      simulation.rearm(selfId, loadout, nextBar);
      skillBar = skillSlotsFor(nextBar);
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

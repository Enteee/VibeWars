import { ZERO, vec2 } from "../vec2.js";
import type { CreatureOrder, MatchSimulation } from "./simulation.js";

/**
 * One player's request to the simulation (#375): the shape of
 * game-protocol's `ClientIntent`, restated here because game-core depends
 * on nothing (ADR-0001). game-session's tests hold the two to the same
 * shape.
 */
export type MatchIntent =
  | { readonly kind: "move"; readonly dirX: number; readonly dirY: number }
  | { readonly kind: "stop" }
  | { readonly kind: "target"; readonly targetSessionId: string | null }
  | { readonly kind: "use-skill"; readonly slot: number }
  | { readonly kind: "attack"; readonly targetId: string }
  | { readonly kind: "cancel" }
  | { readonly kind: "walk-to"; readonly x: number; readonly y: number }
  | { readonly kind: "end-upkeep"; readonly targetId: string; readonly status: string }
  | { readonly kind: "weapon-set"; readonly set: 0 | 1 | 2 | 3 }
  | { readonly kind: "drop-bundle" }
  | { readonly kind: "command"; readonly creatureId: string; readonly order: CreatureOrder };

/**
 * Why a cast or an attack was turned down, for its caster alone: the
 * shape of game-protocol's `CastRefusedMessage`, which carries it as is.
 */
export type IntentRefusal =
  | {
      readonly kind: "skill";
      readonly slot: number;
      readonly skillId: string;
      /** game-core's `ActivationRejection`, e.g. `"out-of-range"`. */
      readonly reason: string;
    }
  | { readonly kind: "attack"; readonly reason: string };

/**
 * Apply one already-validated intent of `playerId`'s to the simulation:
 * the one switch the server's room, the Training Ground and a P2P host
 * all run. The refusal to tell the player, or `null`; a player the
 * simulation does not know gets nothing done and `null`.
 */
export function applyIntent(
  sim: MatchSimulation,
  playerId: string,
  intent: MatchIntent,
): IntentRefusal | null {
  if (sim.get(playerId) === undefined) {
    return null;
  }
  switch (intent.kind) {
    case "stop":
      sim.setInputDirection(playerId, ZERO);
      return null;
    case "move":
      sim.setInputDirection(playerId, vec2(intent.dirX, intent.dirY));
      return null;
    case "target":
      sim.setTarget(playerId, intent.targetSessionId ?? undefined);
      return null;
    case "use-skill": {
      const request = sim.requestSkill(playerId, intent.slot);
      return request === undefined || request.check.ok
        ? null
        : {
            kind: "skill",
            slot: intent.slot,
            skillId: request.skillId,
            reason: request.check.reason,
          };
    }
    case "attack": {
      const check = sim.requestAttack(playerId, intent.targetId);
      return check === undefined || check.ok ? null : { kind: "attack", reason: check.reason };
    }
    case "cancel":
      sim.cancelAction(playerId);
      return null;
    case "walk-to":
      sim.walkTo(playerId, vec2(intent.x, intent.y));
      return null;
    case "end-upkeep":
      sim.endUpkeep(playerId, intent.targetId, intent.status);
      return null;
    case "weapon-set":
      // No refusal to tell: GW1 says nothing for an empty set (#489).
      sim.requestWeaponSet(playerId, intent.set);
      return null;
    case "drop-bundle":
      sim.dropBundle(playerId);
      return null;
    case "command":
      // Not theirs to command: dropped quietly, as `end-upkeep` is (#1110).
      sim.commandCreature(playerId, intent.creatureId, intent.order);
      return null;
  }
}

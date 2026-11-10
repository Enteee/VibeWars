import { closestPointOnPolygon, closestPointOnSegment, pointInPolygon } from "../../../geometry.js";
import { distance, vec2, type Vec2 } from "../../../vec2.js";
import { ghostId } from "../../ghost.js";
import { carriedRelic } from "../../relics.js";
import type { Participant } from "../../simulation.js";
import { harmfulZonesHolding, type MatchZone } from "../../zones.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/** How far past a zone's edge a bot steps to be out of it: clear of the edge, not far. */
export const EXIT_MARGIN = 20;

/**
 * Harmful ground (#3026): a bot standing in it with nothing better to do
 * steps out to the nearest spot outside, as a player would. A foe in
 * reach, a cast, a relic or a ghost it leads keeps it where it is; so
 * does any walk but this rule's own, as a path crosses a zone on purpose
 * when going round is longer, and an objective may lie inside one. It
 * comes after every objective rule, so a bot on a shrine or a plate in
 * harmful ground holds it, rather than step out and walk back in on the
 * next think. `rest` yields to it.
 */
const leaveZone: BotRule = {
  order: 117,
  name: "leave-zone",
  decide: ({ context, self, targetId, cursor }) => {
    const zones = context.objectives.harmfulZones;
    if (
      zones.length === 0 ||
      targetId !== undefined ||
      self.combatant.cast.isCasting ||
      carriedRelic(context.objectives.relics, self.id) !== undefined ||
      leadsGhost(context.participants, self.id, self.combatant.team)
    ) {
      return undefined;
    }
    const holding = harmfulZonesHolding(zones, self.position, self.layer);
    if (holding.length === 0) {
      return undefined;
    }
    const onLayer = zones.filter((zone) => zone.layer === self.layer);
    const walkingTo = cursor.heldMove.moveTo;
    if (walkingTo !== undefined && !isExit(walkingTo, onLayer)) {
      return undefined;
    }
    const exit = nearestExit(self.position, holding, onLayer, (point) => context.walkable(point));
    return exit === undefined ? undefined : { ...NOTHING, moveTo: exit, moveToLayer: self.layer };
  },
};

/** Whether `ghostId(team)` follows `leaderId`. */
function leadsGhost(participants: readonly Participant[], leaderId: string, team: number): boolean {
  const id = ghostId(team);
  return participants.some(
    (participant) => participant.id === id && participant.creature?.leaderId === leaderId,
  );
}

/**
 * Whether `goal` is a spot `nearestExit` gives: out of every zone in
 * `onLayer`, and no farther than `EXIT_MARGIN` past one's edge.
 */
function isExit(goal: Vec2, onLayer: readonly MatchZone[]): boolean {
  return (
    !onLayer.some((zone) => pointInPolygon(goal, zone.polygon)) &&
    onLayer.some(
      (zone) => distance(goal, closestPointOnPolygon(goal, zone.polygon)) <= EXIT_MARGIN + 1e-6,
    )
  );
}

/**
 * The nearest spot `EXIT_MARGIN` past a side of one of `holding`, square
 * off it, that is out of every zone in `onLayer` and `standable`. Zone
 * order, then side order, settles a tie (#267).
 */
export function nearestExit(
  position: Vec2,
  holding: readonly MatchZone[],
  onLayer: readonly MatchZone[],
  standable: (point: Vec2) => boolean,
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let least = Number.POSITIVE_INFINITY;
  for (const zone of holding) {
    const { polygon } = zone;
    let previous = polygon[polygon.length - 1];
    for (const corner of polygon) {
      if (previous === undefined) {
        break;
      }
      const side = { a: previous, b: corner };
      previous = corner;
      const length = distance(side.a, side.b);
      if (length === 0) {
        continue;
      }
      const edge = closestPointOnSegment(position, side);
      // The side's normal, turned to the zone's outside.
      let nx = -(side.b.y - side.a.y) / length;
      let ny = (side.b.x - side.a.x) / length;
      if (pointInPolygon(vec2(edge.x + nx, edge.y + ny), polygon)) {
        nx = -nx;
        ny = -ny;
      }
      const spot = vec2(edge.x + nx * EXIT_MARGIN, edge.y + ny * EXIT_MARGIN);
      const away = distance(position, spot);
      if (
        away < least &&
        !onLayer.some((other) => pointInPolygon(spot, other.polygon)) &&
        standable(spot)
      ) {
        best = spot;
        least = away;
      }
    }
  }
  return best;
}

export default leaveZone;

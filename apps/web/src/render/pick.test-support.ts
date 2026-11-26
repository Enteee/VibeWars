import { recordBody, type ArenaSnapshot } from "./arena-snapshot.js";
import { recordBreakable } from "./breakable-objects.js";
import { recordFlag, recordStand, recordSwitch } from "./flag-objects.js";
import { liftAt } from "./layer-surfaces.js";
import type { DrawnClickable } from "./pick.js";
import { characterBand, renderOrder } from "./render-order.js";

/**
 * `arena` as the scene would record it at rest (#3634): every body settled
 * at its layer's lift, through the recorders the draw code calls, at the
 * depths of the graphics it draws them into.
 */
export function atRest(arena: Omit<ArenaSnapshot, "drawn">): ArenaSnapshot {
  const { structure } = arena;
  const band = (layer: number): number =>
    renderOrder({
      kind: "character",
      band: characterBand(layer, structure.layerCount),
      part: "body",
    });
  const drawn: DrawnClickable[] = [];
  for (const breakable of arena.breakables) {
    recordBreakable(
      drawn,
      breakable,
      structure,
      renderOrder({ kind: "breakable", layer: breakable.layer }),
    );
  }
  if (arena.stand !== undefined) {
    recordStand(drawn, arena.stand, structure.ground, band(arena.stand.layer));
  }
  for (const lever of arena.switches) {
    recordSwitch(drawn, lever, structure.ground, band(lever.layer));
  }
  for (const actor of arena.actors) {
    const lift =
      structure.layerCount === 1 ? 0 : liftAt(structure, arena.lifts, actor.position, actor.layer);
    const position = { x: actor.position.x, y: actor.position.y - lift };
    recordBody(drawn, { ...actor, position }, band(actor.layer));
  }
  for (const flag of arena.flags) {
    recordFlag(drawn, flag, structure.ground, renderOrder({ kind: "effect" }));
  }
  return { ...arena, drawn };
}

import { pointInPolygon, type Polygon } from "../../geometry.js";
import { vec2, type Vec2 } from "../../vec2.js";
import type { BotObjectives, HostileGround } from "../behaviour.js";
import type { GroundEffect } from "../simulation.js";

/** Ground a bot steps out of (#4193): the map's harmful zones and the ground effects that hit it. */
export interface HarmArea {
  readonly layer: number;
  readonly polygon: Polygon;
}

/** The sides of the polygon a ground effect's circle becomes. */
const SIDES = 16;

/**
 * The ground effects in `effects` that hurt someone now (#4193): an aura
 * on foes, and a pulse with a pulse still to land or an end, whichever of
 * those hits enemies or all, by the larger radius of them. Traps, auras
 * on allies or on all, and a spent pulse never count.
 */
export function hostileGroundOf(effects: readonly GroundEffect[]): readonly HostileGround[] {
  return effects.flatMap(({ team, position, layer, act, pulsed }): HostileGround[] => {
    if (act.kind === "aura") {
      return act.aura.affects === "foes"
        ? [{ team, hits: "foes", position, layer, radius: act.aura.radius }]
        : [];
    }
    if (act.kind === "trap") {
      return [];
    }
    const areas = [
      ...(pulsed < act.pulse.count ? [act.pulse.area] : []),
      ...(act.atEnd === undefined ? [] : [act.atEnd.area]),
    ].filter((area) => area.affects !== "allies");
    if (areas.length === 0) {
      return [];
    }
    return [
      {
        team,
        hits: areas.some((area) => area.affects === "all") ? "all" : "foes",
        position,
        layer,
        radius: Math.max(...areas.map((area) => area.radius)),
      },
    ];
  });
}

/**
 * Everything a bot on `team` steps out of: the map's harmful zones, and
 * each hostile ground effect that hits `team` as a polygon round its
 * circle, so a point in the circle is in the polygon.
 */
export function harmAround(objectives: BotObjectives, team: number): readonly HarmArea[] {
  const ground = objectives.hostileGround
    .filter((effect) => effect.hits === "all" || effect.team !== team)
    .map(({ position, layer, radius }) => ({ layer, polygon: circumscribed(position, radius) }));
  return ground.length === 0 ? objectives.harmfulZones : [...objectives.harmfulZones, ...ground];
}

/** The areas of `areas` a body at `position` on `layer` stands in. */
export function harmHolding(
  areas: readonly HarmArea[],
  position: Vec2,
  layer: number,
): readonly HarmArea[] {
  return areas.filter((area) => area.layer === layer && pointInPolygon(position, area.polygon));
}

/** A `SIDES`-gon whose sides touch the circle at `centre`, of `radius`, from outside. */
function circumscribed(centre: Vec2, radius: number): Polygon {
  const corner = radius / Math.cos(Math.PI / SIDES);
  return Array.from({ length: SIDES }, (_, i) => {
    const angle = (2 * Math.PI * i) / SIDES;
    return vec2(centre.x + corner * Math.cos(angle), centre.y + corner * Math.sin(angle));
  });
}

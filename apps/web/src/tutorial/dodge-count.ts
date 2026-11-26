import {
  pointInPolygon,
  polygonCentre,
  zonePhaseAt,
  type MatchZone,
  type Vec2,
} from "@vibewars/game-core";

/** How near a rockfall's centre the player must stand as it strikes for a miss to be a dodge. */
export const DODGE_REACH = 300;

/** What one look at the canyon found: the dodges so far, and whether a rock hit just now. */
export interface DodgeTally {
  readonly dodges: number;
  readonly hit: boolean;
}

export interface DodgeCounter {
  /** The player at `self` on `layer` at `seconds` of match time, after a step. */
  observe(seconds: number, self: Vec2, layer: number): DodgeTally;
}

/**
 * Station 4's count (#3247): a rockfall that strikes with the player
 * within `DODGE_REACH` of its centre, on its layer, and lands no blow on
 * them is one dodge. A strike lands on whoever stands in the zone while it
 * is active (#3029), so a hit is read from the clock and the player's
 * place, as the simulation judges it, and needs no event. A strike already
 * falling at the first look is not counted either way.
 */
export function createDodgeCounter(zones: readonly MatchZone[]): DodgeCounter {
  const rockfalls = zones
    .filter((zone) => zone.kind === "rockfall")
    .map((zone) => ({
      zone,
      centre: polygonCentre(zone.polygon),
      active: undefined as boolean | undefined,
      near: false,
      hit: false,
    }));
  let dodges = 0;
  return {
    observe(seconds, self, layer) {
      let hitNow = false;
      for (const rockfall of rockfalls) {
        const { zone, centre } = rockfall;
        const active = zonePhaseAt(zone, seconds) === "active";
        const onLayer = layer === zone.layer;
        if (active && rockfall.active === false) {
          // It strikes now: is the player close enough for a miss to count?
          rockfall.near =
            onLayer && Math.hypot(self.x - centre.x, self.y - centre.y) <= DODGE_REACH;
          rockfall.hit = false;
        }
        if (active && !rockfall.hit && onLayer && pointInPolygon(self, zone.polygon)) {
          rockfall.hit = true;
          hitNow = true;
        }
        if (!active && rockfall.active === true && rockfall.near && !rockfall.hit) {
          dodges += 1;
        }
        if (!active) {
          rockfall.near = false;
        }
        rockfall.active = active;
      }
      return { dodges, hit: hitNow };
    },
  };
}

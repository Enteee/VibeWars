import type { AscentAct } from "@vibewars/game-maps/schema";

import { FOG_COLOUR, FOG_CROWN, type FogTint } from "./atmosphere.js";

/**
 * The Heroes' Ascent's three-act look (#3589, docs/art/visual-style.md §1b).
 * The act sets only its fog's tint: everything else, light, particles and
 * shafts, is the map's own `lighting` and `atmosphere`, authored to the act.
 */
const ACT_FOG: Record<AscentAct, FogTint> = {
  /** Ash haze over the basalt, warm grey. */
  volcanic: { body: 0x6b5f58, crown: 0x8f7f74 },
  /** Cold blue-green banks in the dark. */
  underworld: { body: 0x3d5560, crown: 0x5f7c88 },
  /** Thin gold haze in the light. */
  heavenly: { body: 0xf3e2b0, crown: 0xfff4d6 },
};

/** The fog tint of a map of `act`; a map off the Ascent keeps the plain cool grey. */
export function fogTintOf(act: AscentAct | null): FogTint {
  return act === null ? { body: FOG_COLOUR, crown: FOG_CROWN } : ACT_FOG[act];
}

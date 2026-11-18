import type { AscentAct } from "@vibewars/game-maps/schema";

import type { BiomeTones } from "./arena-palette.js";
import { FOG_COLOUR, FOG_CROWN, type FogTint } from "./atmosphere.js";

/**
 * The Heroes' Ascent's three-act look (#3589, docs/art/visual-style.md §1b).
 * The act sets its ground, its walls and its fog's tint: everything else,
 * light, particles and shafts, is the map's own `lighting` and
 * `atmosphere`, authored to the act.
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

/**
 * Each act's ground and wall rock (#3618, §1b), laid over the biome's own
 * tones: the rest of a map's materials are tinted from them as from a biome's.
 */
export const ACT_TONES: Record<AscentAct, Pick<BiomeTones, "ground" | "rock">> = {
  /** Basalt crust. */
  volcanic: { ground: 0x2b2320, rock: 0x4a4340 },
  /** Slate. */
  underworld: { ground: 0x1f2428, rock: 0x38424a },
  /** Pale stone: the one pale floor. */
  heavenly: { ground: 0xe8dfc8, rock: 0xb9ad92 },
};

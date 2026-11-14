import { getSkill } from "@vibewars/game-core";

import type { CastBeat } from "./attack-clock.js";
import { skillColour } from "./skill-colours.js";

/**
 * The glow at a caster's hand (#3320, docs/art/3191-skill-visuals.md, the
 * study's top row): it appears small in the skill's type colour as a cast
 * starts and grows with its progress; a cast that runs out flashes white
 * and fades; one stopped short shrinks to nothing and greys. Reduced
 * motion keeps the growth, a size, but fades out without a flash or a
 * shrink. An attack skill has none: its wind-up is its beat.
 *
 * No Phaser here, so it is tested in Node.
 */

export interface CastGlow {
  readonly radius: number;
  readonly alpha: number;
  readonly colour: number;
}

const START_RADIUS = 7;
const START_ALPHA = 0.4;
const FULL_RADIUS = 12;
const FULL_ALPHA = 0.55;
const FLASH_RADIUS = 16;
const FLASH_ALPHA = 0.6;
const FLASH_COLOUR = 0xffffff;
/** What a fizzled glow greys to: the slate of a spent cast. */
const SPENT_COLOUR = 0x8a8f98;
export const FLASH_SECONDS = 0.15;
export const FIZZLE_SECONDS = 0.2;

const unit = (t: number): number => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** `from` turned toward `to` by `t`, channel by channel. */
function mix(from: number, to: number, t: number): number {
  const channel = (shift: number): number =>
    Math.round(lerp((from >> shift) & 0xff, (to >> shift) & 0xff, t)) << shift;
  return channel(16) | channel(8) | channel(0);
}

/** The glow `progress` 0 … 1 through a cast. */
function growing(progress: number, colour: number): CastGlow {
  const t = unit(progress);
  return {
    radius: lerp(START_RADIUS, FULL_RADIUS, t),
    alpha: lerp(START_ALPHA, FULL_ALPHA, t),
    colour,
  };
}

/** The glow a spell cast's `beat` shows; `undefined` for none. */
export function castGlow(beat: CastBeat | undefined, reducedMotion: boolean): CastGlow | undefined {
  if (beat === undefined) {
    return undefined;
  }
  const skill = getSkill(beat.skillId);
  if (skill === undefined || skill.attack !== undefined) {
    return undefined;
  }
  const colour = skillColour(skill);
  switch (beat.phase) {
    case "casting":
      return growing(beat.progress, colour);
    case "released": {
      const t = beat.since / FLASH_SECONDS;
      if (t >= 1) {
        return undefined;
      }
      if (reducedMotion) {
        const full = growing(1, colour);
        return { ...full, alpha: full.alpha * (1 - t) };
      }
      return { radius: FLASH_RADIUS, alpha: FLASH_ALPHA * (1 - t), colour: FLASH_COLOUR };
    }
    case "stopped": {
      const t = beat.since / FIZZLE_SECONDS;
      if (t >= 1) {
        return undefined;
      }
      const from = growing(beat.progress, colour);
      return {
        radius: reducedMotion ? from.radius : from.radius * (1 - t),
        alpha: from.alpha * (1 - t),
        colour: mix(colour, SPENT_COLOUR, t),
      };
    }
  }
}

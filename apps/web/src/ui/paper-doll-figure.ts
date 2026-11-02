import type { ArmorSlot, OffhandId, WeaponId } from "@vibewars/game-core";

/**
 * The paper-doll figure (#2058): `icons/paper-doll/figure.svg`, drawn by
 * `scripts/assets/gear-icons.mjs`. The anchors are the centre of each piece
 * and each hand, in the SVG's own coordinates.
 */
export const PAPER_DOLL_SIZE = { width: 200, height: 360 } as const;

export const PAPER_DOLL_ANCHORS: Readonly<
  Record<ArmorSlot | "mainHand" | "offHand", { readonly x: number; readonly y: number }>
> = {
  head: { x: 100, y: 40 },
  chest: { x: 100, y: 122 },
  hands: { x: 38, y: 160 },
  legs: { x: 100, y: 250 },
  feet: { x: 100, y: 336 },
  mainHand: { x: 30, y: 218 },
  offHand: { x: 170, y: 218 },
};

/**
 * A held item (#2154), in the figure's units: its drawn length from end to
 * end (a shield's height), where the hand grips it as a fraction of that
 * length from the bottom, and how far it leans outward, in degrees.
 * `scripts/assets/gear-icons.mjs` draws `icons/paper-doll/held/<id>.svg`
 * upright from this table, the grip at the bottom-centre of its fraction.
 */
export interface HeldPose {
  readonly length: number;
  readonly grip: number;
  readonly tilt: number;
}

export const HELD: Readonly<Record<Exclude<WeaponId, "unarmed"> | OffhandId, HeldPose>> = {
  sword: { length: 170, grip: 0.12, tilt: 10 },
  axe: { length: 140, grip: 0.12, tilt: 5 },
  hammer: { length: 175, grip: 0.12, tilt: 0 },
  daggers: { length: 75, grip: 0.2, tilt: 20 },
  scythe: { length: 300, grip: 0.35, tilt: 8 },
  spear: { length: 280, grip: 0.4, tilt: 5 },
  wand: { length: 80, grip: 0.15, tilt: 20 },
  staff: { length: 320, grip: 0.4, tilt: 3 },
  shortbow: { length: 200, grip: 0.5, tilt: 0 },
  "recurve-bow": { length: 230, grip: 0.5, tilt: 0 },
  hornbow: { length: 230, grip: 0.5, tilt: 0 },
  flatbow: { length: 260, grip: 0.5, tilt: 0 },
  longbow: { length: 280, grip: 0.5, tilt: 0 },
  shield: { length: 124, grip: 0.5, tilt: 0 },
  focus: { length: 46, grip: 0.5, tilt: 0 },
};

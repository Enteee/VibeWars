import type { ArmorSlot } from "@vibewars/game-core";

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

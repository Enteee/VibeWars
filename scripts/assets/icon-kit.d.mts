export type Glyph = (colour: string) => string;

export type Category =
  | "condition"
  | "hex"
  | "enchantment"
  | "stance"
  | "preparation"
  | "glyph"
  | "shout"
  | "chant"
  | "echo"
  | "weapon-spell"
  | "item"
  | "form"
  | "skill-effect";

/** The palette. */
export const C: {
  readonly bg: string;
  readonly plate: string;
  readonly line: string;
  readonly ink: string;
  readonly inkDim: string;
  readonly condition: string;
  readonly hex: string;
  readonly enchantment: string;
  readonly stance: string;
  readonly preparation: string;
  readonly glyph: string;
  readonly weaponSpell: string;
  readonly warrior: string;
  readonly ranger: string;
  readonly monk: string;
  readonly necromancer: string;
  readonly mesmer: string;
  readonly elementalist: string;
  readonly assassin: string;
  readonly ritualist: string;
  readonly paragon: string;
  readonly dervish: string;
};

export function svg(body: string): string;

export function stroke(colour: string, width?: number): string;

export function germ(c: string): string;

export function perEach(
  kind: "desecrate" | "defile" | "victory" | "sadist" | "channeling" | "zeal" | "vigor",
  c: string,
  w: number,
): string;

export function stepAndReturn(
  kind: "fang" | "aura" | "meld" | "haste",
  c: string,
  w: number,
): string;

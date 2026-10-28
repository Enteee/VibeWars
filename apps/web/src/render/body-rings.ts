import { findStatusDefinition } from "@vibewars/game-core";

/**
 * The rings an enchanted or hexed body wears (#1117, docs/art/art-direction.md
 * "Player mark"): a solid `enchantment` ring hugging it, a broken `hex` ring
 * outside that. One ring per category however many statuses of it, the icon
 * row says which. Static: a ring is a state, not an event, so reduced
 * motion changes nothing.
 *
 * No Phaser here, so the geometry can be tested in Node.
 */

export interface BodyFlags {
  readonly enchanted: boolean;
  readonly hexed: boolean;
}

/** Which rings `statuses` call for. A status id the client's catalogue does not know is ignored. */
export function bodyFlags(statuses: readonly string[]): BodyFlags {
  let enchanted = false;
  let hexed = false;
  for (const id of statuses) {
    const category = findStatusDefinition(id)?.category;
    enchanted ||= category === "enchantment";
    hexed ||= category === "hex";
  }
  return { enchanted, hexed };
}

/** A stretch of a ring, radians, `atan2` convention, clockwise on screen. */
export interface RingArc {
  readonly from: number;
  readonly to: number;
}

export interface BodyRing {
  readonly kind: "enchantment" | "hex";
  /** World units from the body's centre to the stroke's middle. */
  readonly radius: number;
  readonly width: number;
  readonly colour: number;
  /** One full arc when solid. */
  readonly arcs: readonly RingArc[];
}

/** The enchantment ring's radius past the body's edge: its stroke spans r + 1.75 … r + 3.25. */
export const ENCHANT_RING_OFFSET = 2.5;
/** The hex ring's: its stroke spans r + 4.25 … r + 5.75, inside r + 6 (the status row, the epic's cap). */
export const HEX_RING_OFFSET = 5;
/** The hex ring's dashes, at 50% duty, the first centred on 12 o'clock, as the broken-ring hex badge. */
export const HEX_RING_DASHES = 8;
export const BODY_RING_WIDTH = 1.5;
/** The `enchantment` and `hex` palette colours. */
const ENCHANTMENT_COLOUR = 0x56d4dd;
const HEX_COLOUR = 0xd2a8ff;

const SOLID: readonly RingArc[] = [{ from: 0, to: 2 * Math.PI }];
const DASHED: readonly RingArc[] = Array.from({ length: HEX_RING_DASHES }, (_, dash) => {
  const step = (2 * Math.PI) / HEX_RING_DASHES;
  const centre = -Math.PI / 2 + dash * step;
  return { from: centre - step / 4, to: centre + step / 4 };
});

interface RingsByFlags {
  readonly enchanted: readonly BodyRing[];
  readonly hexed: readonly BodyRing[];
  readonly both: readonly BodyRing[];
}

const NONE: readonly BodyRing[] = [];

/** Every body of a radius wears the same rings, so they are built once per radius, not per frame. */
const RINGS_BY_RADIUS = new Map<number, RingsByFlags>();

function ringsFor(radius: number): RingsByFlags {
  const known = RINGS_BY_RADIUS.get(radius);
  if (known !== undefined) {
    return known;
  }
  const enchantment: BodyRing = {
    kind: "enchantment",
    radius: radius + ENCHANT_RING_OFFSET,
    width: BODY_RING_WIDTH,
    colour: ENCHANTMENT_COLOUR,
    arcs: SOLID,
  };
  const hex: BodyRing = {
    kind: "hex",
    radius: radius + HEX_RING_OFFSET,
    width: BODY_RING_WIDTH,
    colour: HEX_COLOUR,
    arcs: DASHED,
  };
  const rings = { enchanted: [enchantment], hexed: [hex], both: [enchantment, hex] };
  RINGS_BY_RADIUS.set(radius, rings);
  return rings;
}

/** The rings a body of `radius` wears, enchantment first, hex second; none for neither. */
export function bodyRings(radius: number, flags: BodyFlags): readonly BodyRing[] {
  if (!flags.enchanted && !flags.hexed) {
    return NONE;
  }
  const rings = ringsFor(radius);
  return flags.enchanted ? (flags.hexed ? rings.both : rings.enchanted) : rings.hexed;
}

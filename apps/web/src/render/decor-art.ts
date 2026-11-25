import type { Vec2 } from "@vibewars/game-core";
import { ANIMATED_DECOR_KINDS, type DecorKind } from "@vibewars/game-maps/schema";

import type { DecorColours } from "./arena-palette.js";

/**
 * Map decor (#4013, ADR-0059): columns, braziers, crates, spikes, trees and
 * fern tufts, scenery nobody bumps into. Each is a few vector shapes with
 * a lit top, a shaded side and a contact shadow, the light from the
 * north-west (docs/art/visual-style.md). Phaser-free: the scene paints the
 * commands, in its light, so the looks and the motion are tested without it.
 */

/** A decor prop as the renderer reads it: the map's entry without its id. */
export interface MapDecor {
  readonly kind: DecorKind;
  /** Its foot, on its layer's floor. */
  readonly at: Vec2;
  readonly layer: number;
  /** Degrees, clockwise from east. */
  readonly rotation: number;
  readonly scale: number;
  readonly variant: number;
}

/** One stroke of a prop, in world units, on its layer's floor. */
export type DecorCommand =
  | {
      readonly kind: "poly";
      readonly points: readonly Vec2[];
      readonly colour: number;
      readonly alpha: number;
      /** Drawn in its own light, as a flame is: the scene does not dim it. */
      readonly glow: boolean;
    }
  | {
      readonly kind: "ellipse";
      readonly at: Vec2;
      readonly rx: number;
      readonly ry: number;
      readonly colour: number;
      readonly alpha: number;
      readonly glow: boolean;
    }
  | {
      readonly kind: "line";
      readonly from: Vec2;
      readonly to: Vec2;
      readonly width: number;
      readonly colour: number;
      readonly alpha: number;
    };

/** The kinds drawn over a body, and faded off one as an overhang is. */
export const TALL_DECOR_KINDS: readonly DecorKind[] = ["column", "tree"];

/** How often a brazier's flame changes shape, in seconds. */
export const BRAZIER_FLICKER_SECONDS = 0.066;
/** How long a tree's sway and a fern's take, there and back, in seconds. */
export const TREE_SWAY_SECONDS = 5;
export const FERN_SWAY_SECONDS = 3;
/** How far a crown or a frond sways each way, in world units. */
export const DECOR_SWAY = 2;

/** A contact shadow, cast toward +x +y, the way every shadow on the map falls. */
const SHADOW = 0x000000;
const SHADOW_ALPHA = 0.28;

const COLUMN_RADIUS = 13;
const COLUMN_HEIGHT = 72;
const TRUNK_HEIGHT = 34;
const TRUNK_WIDTH = 6;
const CROWN_RADIUS = 24;
const CRATE_SIZE = 22;
const CRATE_HEIGHT = 15;
const SPIKE_WIDTH = 8;
const SPIKE_HEIGHT = 20;
const FROND_LENGTH = 17;
const BRAZIER_RADIUS = 11;
const BRAZIER_HEIGHT = 15;
const FLAME_HEIGHT = 15;

/** Whether `kind` moves while idle: a flame flickers, a crown or a frond sways. */
export function animatedDecor(kind: DecorKind): boolean {
  return ANIMATED_DECOR_KINDS.includes(kind);
}

/** Whether `kind` stands taller than a body, and fades off one. */
export function tallDecor(kind: DecorKind): boolean {
  return TALL_DECOR_KINDS.includes(kind);
}

/** `(dx, dy)` turned by `degrees` about `at`. */
function turned(at: Vec2, dx: number, dy: number, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: at.x + dx * cos - dy * sin, y: at.y + dx * sin + dy * cos };
}

function poly(points: readonly Vec2[], colour: number, alpha = 1, glow = false): DecorCommand {
  return { kind: "poly", points, colour, alpha, glow };
}

function ellipse(
  at: Vec2,
  rx: number,
  ry: number,
  colour: number,
  alpha = 1,
  glow = false,
): DecorCommand {
  return { kind: "ellipse", at, rx, ry, colour, alpha, glow };
}

/** A stable number in [0, 1) for a prop and a tick: the same flame for everyone. */
function noise(prop: MapDecor, tick: number): number {
  let h = Math.imul(Math.round(prop.at.x) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.round(prop.at.y) ^ Math.imul(tick, 0xc2b2ae35), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 0x100000000;
}

/**
 * How far a prop's crown or fronds lean east now, in world units: a slow
 * sine, each prop on its own phase. Held at its mean, upright, when `still`.
 */
export function decorSway(prop: MapDecor, now: number, still: boolean): number {
  if (still || !animatedDecor(prop.kind) || prop.kind === "brazier") {
    return 0;
  }
  const period = prop.kind === "tree" ? TREE_SWAY_SECONDS : FERN_SWAY_SECONDS;
  const phase = noise(prop, 0) * Math.PI * 2;
  return Math.sin((now / period) * Math.PI * 2 + phase) * DECOR_SWAY;
}

/** How tall a brazier's flame is now, a share of its full height; its mean when `still`. */
export function brazierFlicker(prop: MapDecor, now: number, still: boolean): number {
  return still ? 0.85 : 0.7 + 0.3 * noise(prop, Math.floor(now / BRAZIER_FLICKER_SECONDS));
}

/**
 * The shadow a prop casts on its floor: drawn under every body, whatever
 * stands over them, so a tall prop's shadow never fades with it.
 */
export function decorShadow(prop: MapDecor): DecorCommand {
  const { at, scale: s } = prop;
  const height =
    prop.kind === "column"
      ? COLUMN_HEIGHT * (prop.variant === 1 ? 0.6 : 1)
      : prop.kind === "tree"
        ? TRUNK_HEIGHT + CROWN_RADIUS
        : prop.kind === "crates" || prop.kind === "brazier"
          ? CRATE_HEIGHT
          : SPIKE_HEIGHT / 2;
  const foot =
    prop.kind === "column"
      ? COLUMN_RADIUS
      : prop.kind === "tree"
        ? CROWN_RADIUS
        : prop.kind === "crates"
          ? CRATE_SIZE * 0.8
          : BRAZIER_RADIUS;
  const reach = height * 0.3 * s;
  return ellipse(
    { x: at.x + reach, y: at.y + reach * 0.45 },
    foot * s + reach * 0.8,
    foot * s * 0.55 + reach * 0.3,
    SHADOW,
    SHADOW_ALPHA,
  );
}

/**
 * Where a tall prop is drawn, in its floor's coordinates: what a body
 * must stand in for the prop to fade off it. Empty for a short one.
 */
export function decorOutline(prop: MapDecor): readonly Vec2[] {
  if (!tallDecor(prop.kind)) {
    return [];
  }
  const { at, scale: s } = prop;
  const half = (prop.kind === "tree" ? CROWN_RADIUS : COLUMN_RADIUS) * s;
  const top =
    (prop.kind === "tree" ? TRUNK_HEIGHT + CROWN_RADIUS * 1.8 : COLUMN_HEIGHT + COLUMN_RADIUS) * s;
  return [
    { x: at.x - half, y: at.y - top },
    { x: at.x + half, y: at.y - top },
    { x: at.x + half, y: at.y + 4 * s },
    { x: at.x - half, y: at.y + 4 * s },
  ];
}

/** A stone column: a plinth, a lit and a shaded flank, a lit cap; broken off short as variant 1. */
function column(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const r = COLUMN_RADIUS * s;
  const h = COLUMN_HEIGHT * s * (variant === 1 ? 0.6 : 1);
  const top = at.y - h;
  const commands: DecorCommand[] = [
    ellipse({ x: at.x, y: at.y + r * 0.1 }, r * 1.35, r * 0.62, c.stoneShade),
    ellipse(at, r * 1.25, r * 0.55, c.stone),
    poly(
      [
        { x: at.x - r, y: top },
        { x: at.x - r / 3, y: top },
        { x: at.x - r / 3, y: at.y },
        { x: at.x - r, y: at.y },
      ],
      c.stoneLit,
    ),
    poly(
      [
        { x: at.x - r / 3, y: top },
        { x: at.x + r / 3, y: top },
        { x: at.x + r / 3, y: at.y },
        { x: at.x - r / 3, y: at.y },
      ],
      c.stone,
    ),
    poly(
      [
        { x: at.x + r / 3, y: top },
        { x: at.x + r, y: top },
        { x: at.x + r, y: at.y },
        { x: at.x + r / 3, y: at.y },
      ],
      c.stoneShade,
    ),
  ];
  if (variant === 2) {
    // Fluted: a groove down each flank.
    for (const dx of [-r * 0.66, 0, r * 0.66]) {
      commands.push({
        kind: "line",
        from: { x: at.x + dx, y: top + r * 0.5 },
        to: { x: at.x + dx, y: at.y - r * 0.3 },
        width: Math.max(1, s),
        colour: c.stoneShade,
        alpha: 0.6,
      });
    }
  }
  if (variant === 1) {
    // Broken: a jagged lit stump instead of a cap.
    commands.push(
      poly(
        [
          { x: at.x - r, y: top },
          { x: at.x - r / 2, y: top - r * 0.5 },
          { x: at.x, y: top - r * 0.1 },
          { x: at.x + r / 2, y: top - r * 0.6 },
          { x: at.x + r, y: top },
          { x: at.x, y: top + r * 0.45 },
        ],
        c.stoneLit,
      ),
    );
  } else {
    const cap = variant === 3 ? 1.45 : 1.2;
    commands.push(
      ellipse({ x: at.x, y: top + r * 0.12 }, r * cap, r * 0.55, c.stoneShade),
      ellipse({ x: at.x, y: top }, r * cap, r * 0.5, c.stoneLit),
    );
  }
  return commands;
}

/** A tree: a trunk, and a crown of three clumps, the north-west one lit; a pine as variant 3. */
function tree(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const w = (TRUNK_WIDTH * s) / 2;
  const h = TRUNK_HEIGHT * s;
  const r = CROWN_RADIUS * s * (variant === 1 ? 0.85 : 1);
  const crown = { x: at.x + sway, y: at.y - h - r * 0.4 };
  const commands: DecorCommand[] = [
    poly(
      [
        { x: at.x - w, y: at.y - h },
        { x: at.x, y: at.y - h },
        { x: at.x, y: at.y },
        { x: at.x - w * 1.3, y: at.y },
      ],
      c.bark,
    ),
    poly(
      [
        { x: at.x, y: at.y - h },
        { x: at.x + w, y: at.y - h },
        { x: at.x + w * 1.3, y: at.y },
        { x: at.x, y: at.y },
      ],
      c.barkShade,
    ),
  ];
  if (variant === 3) {
    // A pine: three tiers, each lit on its west half.
    for (let tier = 0; tier < 3; tier++) {
      const base = crown.y + r * 0.6 - tier * r * 0.55;
      const half = r * (1 - tier * 0.25);
      const tip = { x: crown.x + sway * tier * 0.3, y: base - r * 0.9 };
      commands.push(
        poly([tip, { x: crown.x - half, y: base }, { x: crown.x, y: base + r * 0.12 }], c.plant),
        poly(
          [tip, { x: crown.x, y: base + r * 0.12 }, { x: crown.x + half, y: base }],
          c.plantShade,
        ),
      );
    }
    return commands;
  }
  const spread = variant === 2 ? 0.75 : 0.55;
  commands.push(
    ellipse({ x: crown.x + r * 0.25, y: crown.y + r * 0.2 }, r, r * 0.8, c.plantShade),
    ellipse({ x: crown.x - r * spread, y: crown.y + r * 0.1 }, r * 0.7, r * 0.6, c.plant),
    ellipse({ x: crown.x + r * spread, y: crown.y }, r * 0.7, r * 0.6, c.plant),
    ellipse({ x: crown.x - r * 0.2, y: crown.y - r * 0.25 }, r * 0.75, r * 0.6, c.plant),
    ellipse({ x: crown.x - r * 0.4, y: crown.y - r * 0.4 }, r * 0.42, r * 0.32, c.plantLit),
  );
  return commands;
}

/**
 * A box `size` square and `height` tall, turned by `rotation`: its faces
 * toward the viewer, lit or shaded by which way they look, then its lit top.
 */
function block(
  foot: Vec2,
  size: number,
  height: number,
  rotation: number,
  lit: number,
  face: number,
  shade: number,
): DecorCommand[] {
  const half = size / 2;
  const corners = [
    turned(foot, -half, -half, rotation),
    turned(foot, half, -half, rotation),
    turned(foot, half, half, rotation),
    turned(foot, -half, half, rotation),
  ];
  const up = (point: Vec2): Vec2 => ({ x: point.x, y: point.y - height });
  const commands: DecorCommand[] = [];
  corners.forEach((a, index) => {
    const b = corners[(index + 1) % corners.length] ?? a;
    // The side's outward normal, the box turning clockwise: seen only if it faces south.
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    if (ny > 0) {
      commands.push(poly([up(a), up(b), b, a], nx > 0 ? shade : face));
    }
  });
  commands.push(poly(corners.map(up), lit));
  return commands;
}

/** Crates: one, two side by side, a stack of three, or a barrel beside one, by variant. */
function crates(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const size = CRATE_SIZE * s;
  const height = CRATE_HEIGHT * s;
  const box = (foot: Vec2, lift = 0, turn = 0): DecorCommand[] =>
    block(
      { x: foot.x, y: foot.y - lift },
      size,
      height,
      rotation + turn,
      c.woodLit,
      c.wood,
      c.woodShade,
    );
  if (variant === 0) {
    return box(at);
  }
  const beside = turned(at, size * 1.05, 0, rotation);
  if (variant === 1) {
    return [...box(at), ...box(beside, 0, 12)];
  }
  if (variant === 2) {
    const back = turned(at, size * 0.5, -size * 0.9, rotation);
    return [...box(back), ...box(at), ...box(beside, 0, 8), ...box(at, height, 20)];
  }
  const barrel = turned(at, -size * 0.95, size * 0.2, rotation);
  const r = size * 0.42;
  return [
    ...box(at),
    poly(
      [
        { x: barrel.x - r, y: barrel.y - height * 1.2 },
        { x: barrel.x + r, y: barrel.y - height * 1.2 },
        { x: barrel.x + r, y: barrel.y },
        { x: barrel.x - r, y: barrel.y },
      ],
      c.wood,
    ),
    ellipse(barrel, r, r * 0.45, c.woodShade),
    ellipse({ x: barrel.x, y: barrel.y - height * 1.2 }, r, r * 0.45, c.woodLit),
    {
      kind: "line",
      from: { x: barrel.x - r, y: barrel.y - height * 0.6 },
      to: { x: barrel.x + r, y: barrel.y - height * 0.6 },
      width: Math.max(1, 1.5 * s),
      colour: c.iron,
      alpha: 1,
    },
  ];
}

/** A cluster of three to five rock spikes, each lit on its west flank. */
function spike(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const count = 3 + (variant % 3);
  const commands: DecorCommand[] = [];
  const spikes = Array.from({ length: count }, (_, k) => {
    const spot = k === 0 ? at : turned(at, SPIKE_WIDTH * 1.2 * s, 0, rotation + (k * 360) / count);
    return { spot, height: SPIKE_HEIGHT * s * (k === 0 ? 1.2 : 0.65 + 0.1 * (k % 3)) };
  }).sort((a, b) => a.spot.y - b.spot.y);
  for (const { spot, height } of spikes) {
    const half = (SPIKE_WIDTH * s) / 2;
    const tip = { x: spot.x + half * 0.2, y: spot.y - height };
    commands.push(
      poly(
        [tip, { x: spot.x - half, y: spot.y }, { x: spot.x, y: spot.y + half * 0.4 }],
        c.spikeLit,
      ),
      poly(
        [tip, { x: spot.x, y: spot.y + half * 0.4 }, { x: spot.x + half, y: spot.y }],
        c.spikeShade,
      ),
    );
  }
  return commands;
}

/** A fern tuft: fronds from its heart, those facing north-west lit, their tips swaying. */
function fern(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const count = 6 + (variant % 2);
  const length = FROND_LENGTH * s * (variant >= 2 ? 0.8 : 1);
  const fronds = Array.from({ length: count }, (_, k) => rotation + (k * 360) / count);
  // North first, so the fronds toward the viewer are drawn over them.
  const tipOf = (degrees: number): Vec2 => {
    const tip = turned(at, length, 0, degrees);
    return { x: tip.x + sway, y: at.y + (tip.y - at.y) * 0.6 - length * 0.25 };
  };
  return fronds
    .sort((a, b) => tipOf(a).y - tipOf(b).y)
    .map((degrees) => {
      const tip = tipOf(degrees);
      const side = turned({ x: 0, y: 0 }, 0, length * 0.16, degrees);
      const mid = { x: (at.x + tip.x) / 2, y: (at.y + tip.y) / 2 };
      const westward = Math.cos(((degrees + 135) * Math.PI) / 180);
      const colour = westward > 0.4 ? c.plantLit : westward < -0.4 ? c.plantShade : c.plant;
      return poly(
        [
          at,
          { x: mid.x + side.x, y: mid.y + side.y },
          tip,
          { x: mid.x - side.x, y: mid.y - side.y },
        ],
        colour,
      );
    });
}

/** A brazier: three iron legs, a bowl of coals, and its flame, `flicker` of full height. */
function brazier(prop: MapDecor, c: DecorColours, flicker: number): DecorCommand[] {
  const { at, scale: s } = prop;
  const r = BRAZIER_RADIUS * s;
  const bowl = { x: at.x, y: at.y - BRAZIER_HEIGHT * s };
  const legs: DecorCommand[] = [-0.8, 0, 0.8].map((share) => ({
    kind: "line",
    from: { x: bowl.x + share * r * 0.6, y: bowl.y },
    to: { x: at.x + share * r, y: at.y + (share === 0 ? r * 0.3 : 0) },
    width: Math.max(1.5, 2 * s),
    colour: share > 0 ? c.ironShade : c.iron,
    alpha: 1,
  }));
  const flame = FLAME_HEIGHT * s * flicker;
  return [
    ...legs,
    ellipse({ x: bowl.x, y: bowl.y + r * 0.3 }, r, r * 0.55, c.ironShade),
    ellipse(bowl, r, r * 0.45, c.iron),
    ellipse(bowl, r * 0.8, r * 0.32, c.ember, 1, true),
    poly(
      [
        { x: bowl.x - r * 0.6, y: bowl.y },
        { x: bowl.x - r * 0.25, y: bowl.y - flame * 0.6 },
        { x: bowl.x + r * 0.05, y: bowl.y - flame },
        { x: bowl.x + r * 0.35, y: bowl.y - flame * 0.55 },
        { x: bowl.x + r * 0.6, y: bowl.y },
      ],
      c.flame,
      0.95,
      true,
    ),
    poly(
      [
        { x: bowl.x - r * 0.3, y: bowl.y },
        { x: bowl.x, y: bowl.y - flame * 0.6 },
        { x: bowl.x + r * 0.3, y: bowl.y },
      ],
      c.flameCore,
      1,
      true,
    ),
  ];
}

/**
 * How `prop` is drawn at `now`, its shadow apart (`decorShadow`): a
 * still prop the same at every `now`, a moving one held at its mean when
 * `still` (reduced motion).
 */
export function decorCommands(
  prop: MapDecor,
  colours: DecorColours,
  now: number,
  still: boolean,
): readonly DecorCommand[] {
  switch (prop.kind) {
    case "column":
      return column(prop, colours);
    case "tree":
      return tree(prop, colours, decorSway(prop, now, still));
    case "crates":
      return crates(prop, colours);
    case "spike":
      return spike(prop, colours);
    case "fern":
      return fern(prop, colours, decorSway(prop, now, still));
    case "brazier":
      return brazier(prop, colours, brazierFlicker(prop, now, still));
  }
}

import { MINIMAL_GW_INSPIRED_PVP_V1 as RULESET, type Vec2 } from "@vibewars/game-core";
import { ANIMATED_DECOR_KINDS, type DecorKind } from "@vibewars/game-maps/schema";

import { WATER_LOOK, type DecorColours } from "./arena-palette.js";

/**
 * Map decor (#4013, ADR-0060): braziers, crates, trees, fern tufts,
 * cinder drifts (#4018) and reed clumps (#4019), scenery nobody bumps into. Each is a few vector
 * shapes in the gothic look (#4059): a dark outline round its top, its
 * sides darkening to the ground, a contact shadow, the light from the
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
  /** Whether it stands in shallow water (#4019): a reed's foot is drawn under the water's tint. */
  readonly wading: boolean;
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
      /** A closed line round `points`: the gothic outline (#4059). */
      readonly kind: "outline";
      readonly points: readonly Vec2[];
      readonly width: number;
      readonly colour: number;
      readonly alpha: number;
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
export const TALL_DECOR_KINDS: readonly DecorKind[] = ["tree", "dead-tree"];

/** How often a brazier's flame changes shape, in seconds. */
export const BRAZIER_FLICKER_SECONDS = 0.066;
/**
 * How long a tree's sway, a fern's, a reed's and a dead tree's take, and a
 * banner's ripple (#4020), there and back, in seconds.
 */
export const TREE_SWAY_SECONDS = 5;
export const FERN_SWAY_SECONDS = 3;
export const REED_SWAY_SECONDS = 3;
export const DEAD_TREE_SWAY_SECONDS = 4;
export const BANNER_RIPPLE_SECONDS = 5;
/** How far a crown, a frond, a reed's tip, a bare branch or a banner's hem sways each way, in world units. */
export const DECOR_SWAY = 2;

/** A contact shadow, cast toward +x +y, the way every shadow on the map falls. */
const SHADOW = 0x000000;
const SHADOW_ALPHA = 0.28;

const TRUNK_HEIGHT = 48;
const TRUNK_WIDTH = 6;
const CROWN_RADIUS = 36;
const CRATE_SIZE = 22;
const CRATE_HEIGHT = 15;
const FROND_LENGTH = 17;
const BRAZIER_RADIUS = 11;
const BRAZIER_HEIGHT = 15;
const FLAME_HEIGHT = 15;
/** Half a reed clump's width, 50 u across at scale 1 (#4019), and how tall its tallest blade stands. */
const REED_RADIUS = 25;
const REED_HEIGHT = 30;
/** How many blades a clump has, the fewest; a variant adds up to three. */
const REED_BLADES = 7;
/** Half a cinder drift's width: 120 u across at scale 1 (#4018). */
const CINDER_RADIUS = 60;
/** How many embers glow in a drift, the most. */
const CINDER_EMBERS = 10;
/** Half a boulder cluster's width (#4020): 60 u across at scale 1, under 100 u at the largest, so never cover. */
const ROCK_RADIUS = 30;
/** Half a dead tree's reach, 50 u across at scale 1 (#4020), and how tall its trunk stands. */
const DEAD_TREE_RADIUS = 25;
const DEAD_TREE_HEIGHT = 58;
/** Half the width of a scatter of bones and of a cairn (#4020), 50 u and 44 u across at scale 1. */
const BONES_RADIUS = 25;
const CAIRN_RADIUS = 22;
/** A banner's cloth, 40 u wide at scale 1 (#4020), its pole's height and the cloth's drop. */
const BANNER_WIDTH = 40;
const BANNER_HEIGHT = 46;
const BANNER_DROP = 26;
/** Where a crate's two dark bands run, as shares of its height up its side, and how tall each is. */
const CRATE_BANDS = [0.15, 0.6];
const CRATE_BAND = 0.1;

/** The gothic outline round a prop's top (#4059): near-black, 1 px. */
const OUTLINE = 0x08080a;
const OUTLINE_WIDTH = 1;
/** How many points an outline round an ellipse takes. */
const RING_POINTS = 16;
/**
 * How much darker a prop's foot is than its cap (#4059): the mock's
 * contrast 0.75 and ambient occlusion 0.5, so a foot is 0.625 of its colour.
 */
const DECOR_CONTRAST = 0.75;
const DECOR_AO = 0.5;
/** How many bands a prop's side darkens in, from its cap down to its foot. */
const SIDE_BANDS = 4;

/** Whether `kind` moves while idle: a flame flickers, a crown, a frond or a reed sways. */
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

/** How long each swaying kind's sway takes, there and back, in seconds. */
const SWAY_SECONDS: Partial<Record<DecorKind, number>> = {
  tree: TREE_SWAY_SECONDS,
  fern: FERN_SWAY_SECONDS,
  reed: REED_SWAY_SECONDS,
  "dead-tree": DEAD_TREE_SWAY_SECONDS,
  banner: BANNER_RIPPLE_SECONDS,
};

/**
 * How far a prop's crown, fronds or blades lean east now, in world units:
 * a slow sine, each prop on its own phase. Held at its mean, upright, when `still`.
 */
export function decorSway(prop: MapDecor, now: number, still: boolean): number {
  const period = SWAY_SECONDS[prop.kind];
  if (still || period === undefined) {
    return 0;
  }
  const phase = noise(prop, 0) * Math.PI * 2;
  return Math.sin((now / period) * Math.PI * 2 + phase) * DECOR_SWAY;
}

/** How tall a brazier's flame is now, a share of its full height; its mean when `still`. */
export function brazierFlicker(prop: MapDecor, now: number, still: boolean): number {
  return still ? 0.85 : 0.7 + 0.3 * noise(prop, Math.floor(now / BRAZIER_FLICKER_SECONDS));
}

/**
 * How tall each kind stands, which sets how far its shadow reaches, and
 * how wide its foot is. A drift, bones and a cairn lie flat: their shadow
 * is the dark under them, cast nowhere.
 */
const SHADOW_SIZE: Record<DecorKind, { readonly height: number; readonly foot: number }> = {
  tree: { height: TRUNK_HEIGHT + CROWN_RADIUS, foot: CROWN_RADIUS },
  cinders: { height: 0, foot: CINDER_RADIUS * 0.85 },
  crates: { height: CRATE_HEIGHT, foot: CRATE_SIZE * 0.8 },
  reed: { height: REED_HEIGHT, foot: REED_RADIUS * 0.6 },
  brazier: { height: CRATE_HEIGHT, foot: BRAZIER_RADIUS },
  fern: { height: CRATE_HEIGHT, foot: BRAZIER_RADIUS },
  rock: { height: ROCK_RADIUS * 0.6, foot: ROCK_RADIUS * 0.85 },
  "dead-tree": { height: DEAD_TREE_HEIGHT, foot: DEAD_TREE_RADIUS * 0.4 },
  bones: { height: 0, foot: BONES_RADIUS * 0.8 },
  cairn: { height: 0, foot: CAIRN_RADIUS * 0.9 },
  banner: { height: BANNER_HEIGHT, foot: BANNER_WIDTH * 0.15 },
};

/**
 * The shadow a prop casts on its floor: drawn under every body, whatever
 * stands over them, so a tall prop's shadow never fades with it.
 */
export function decorShadow(prop: MapDecor): DecorCommand {
  const { at, scale: s } = prop;
  const { height, foot } = SHADOW_SIZE[prop.kind];
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
 * How far a tall prop reaches either side of its foot and above it, at
 * scale 1: a crown's side lobes 1.45 of its radius out, a dead tree's
 * branches its radius and a little over its trunk.
 */
const TALL_REACH: Partial<Record<DecorKind, { readonly half: number; readonly top: number }>> = {
  tree: { half: CROWN_RADIUS * 1.45, top: TRUNK_HEIGHT + CROWN_RADIUS * 1.8 },
  "dead-tree": { half: DEAD_TREE_RADIUS * 1.1, top: DEAD_TREE_HEIGHT * 1.15 },
};

/**
 * Where a tall prop is drawn, in its floor's coordinates, widened by a
 * body's radius and its sway: what a body must stand in for the prop to
 * fade off it, so none is half under it unfaded. Empty for a short one.
 */
export function decorOutline(prop: MapDecor): readonly Vec2[] {
  const size = TALL_REACH[prop.kind];
  if (size === undefined) {
    return [];
  }
  const { at, scale: s } = prop;
  const reach = RULESET.collision.playerRadius + DECOR_SWAY;
  const half = size.half * s + reach;
  const top = size.top * s + reach;
  const bottom = 4 * s + reach;
  return [
    { x: at.x - half, y: at.y - top },
    { x: at.x + half, y: at.y - top },
    { x: at.x + half, y: at.y + bottom },
    { x: at.x - half, y: at.y + bottom },
  ];
}

/** `colour` with each channel scaled by `factor`, held at white. */
function scaled(colour: number, factor: number): number {
  const channel = (at: number): number =>
    Math.min(255, Math.round(((colour >> at) & 0xff) * factor)) << at;
  return channel(16) | channel(8) | channel(0);
}

/** `colour` at `t` of a prop's height, 0 its foot, 1 its cap: darker toward the ground (#4059). */
function rising(colour: number, t: number): number {
  return scaled(colour, 1 - DECOR_AO * DECOR_CONTRAST * (1 - t));
}

/** The gothic outline (#4059) round `points`, closed. */
function outline(points: readonly Vec2[]): DecorCommand {
  return { kind: "outline", points, width: OUTLINE_WIDTH, colour: OUTLINE, alpha: 1 };
}

/** An ellipse's edge, as the points an outline goes round. */
function ring(at: Vec2, rx: number, ry: number): Vec2[] {
  return Array.from({ length: RING_POINTS }, (_, k) => {
    const angle = (k / RING_POINTS) * Math.PI * 2;
    return { x: at.x + Math.cos(angle) * rx, y: at.y + Math.sin(angle) * ry };
  });
}

/** An ellipse, then its outline. */
function outlinedEllipse(at: Vec2, rx: number, ry: number, colour: number): DecorCommand[] {
  return [ellipse(at, rx, ry, colour), outline(ring(at, rx, ry))];
}

/**
 * The side of a prop from `a` to `b` on its floor, `height` tall, in bands
 * of `colour` from its dark foot up to its full colour under the cap.
 */
function side(a: Vec2, b: Vec2, height: number, colour: number): DecorCommand[] {
  return Array.from({ length: SIDE_BANDS }, (_, k) => {
    const low = (k * height) / SIDE_BANDS;
    const high = ((k + 1) * height) / SIDE_BANDS;
    return poly(
      [
        { x: a.x, y: a.y - high },
        { x: b.x, y: b.y - high },
        { x: b.x, y: b.y - low },
        { x: a.x, y: a.y - low },
      ],
      rising(colour, (k + 1) / SIDE_BANDS),
    );
  });
}

/**
 * A tree: a trunk, and a crown of four blobs graded from the dark, low one
 * at the back to the light one on top, each outlined; a pine as variant 3.
 */
function tree(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const w = (TRUNK_WIDTH * s) / 2;
  const h = TRUNK_HEIGHT * s;
  const r = CROWN_RADIUS * s * (variant === 1 ? 0.85 : 1);
  const crown = { x: at.x + sway, y: at.y - h - r * 0.4 };
  const leaf = (k: number): number => c.leaves[k] ?? c.plant;
  const commands: DecorCommand[] = [
    ...side({ x: at.x - w * 1.3, y: at.y }, at, h, c.trunk),
    ...side(at, { x: at.x + w * 1.3, y: at.y }, h, scaled(c.trunk, 0.7)),
  ];
  if (variant === 3) {
    // A pine: three tiers, lighter as they rise, each lit on its west half.
    for (let tier = 0; tier < 3; tier++) {
      const base = crown.y + r * 0.6 - tier * r * 0.55;
      const half = r * (1 - tier * 0.25);
      const tip = { x: crown.x + sway * tier * 0.3, y: base - r * 0.9 };
      const west = { x: crown.x - half, y: base };
      const foot = { x: crown.x, y: base + r * 0.12 };
      const east = { x: crown.x + half, y: base };
      const colour = leaf(tier + 1);
      commands.push(
        poly([tip, west, foot], colour),
        poly([tip, foot, east], scaled(colour, 0.7)),
        outline([tip, west, foot, east]),
      );
    }
    return commands;
  }
  const spread = variant === 2 ? 0.75 : 0.55;
  const blobs = [
    { x: crown.x + r * 0.25, y: crown.y + r * 0.2, rx: r, ry: r * 0.8 },
    { x: crown.x + r * spread, y: crown.y, rx: r * 0.7, ry: r * 0.6 },
    { x: crown.x - r * spread, y: crown.y + r * 0.1, rx: r * 0.7, ry: r * 0.6 },
    { x: crown.x - r * 0.25, y: crown.y - r * 0.3, rx: r * 0.75, ry: r * 0.6 },
  ];
  blobs.forEach((blob, k) => {
    commands.push(...outlinedEllipse(blob, blob.rx, blob.ry, leaf(k)));
  });
  return commands;
}

/**
 * A box `size` square and `height` tall, turned by `rotation`: its faces
 * toward the viewer darkening to the ground, lit or shaded by which way
 * they look, two dark bands round them, then its outlined lid with its planks.
 */
function block(
  foot: Vec2,
  size: number,
  height: number,
  rotation: number,
  c: DecorColours,
): DecorCommand[] {
  const half = size / 2;
  const corners = [
    turned(foot, -half, -half, rotation),
    turned(foot, half, -half, rotation),
    turned(foot, half, half, rotation),
    turned(foot, -half, half, rotation),
  ];
  const up = (point: Vec2, lift = height): Vec2 => ({ x: point.x, y: point.y - lift });
  const commands: DecorCommand[] = [];
  corners.forEach((a, index) => {
    const b = corners[(index + 1) % corners.length] ?? a;
    // The side's outward normal, the box turning clockwise: seen only if it faces south.
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    if (ny > 0) {
      commands.push(...side(a, b, height, nx > 0 ? scaled(c.wood, 0.75) : c.wood));
      for (const at of CRATE_BANDS) {
        const low = at * height;
        const high = low + CRATE_BAND * height;
        commands.push(poly([up(a, high), up(b, high), up(b, low), up(a, low)], c.woodBand));
      }
    }
  });
  const lid = corners.map((corner) => up(corner));
  commands.push(poly(lid, c.wood));
  const [n, e, s, w] = lid;
  if (n !== undefined && e !== undefined && s !== undefined && w !== undefined) {
    for (const share of [1 / 3, 2 / 3]) {
      commands.push({
        kind: "line",
        from: { x: n.x + (e.x - n.x) * share, y: n.y + (e.y - n.y) * share },
        to: { x: w.x + (s.x - w.x) * share, y: w.y + (s.y - w.y) * share },
        width: OUTLINE_WIDTH,
        colour: c.plank,
        alpha: 1,
      });
    }
  }
  commands.push(outline(lid));
  return commands;
}

/** Crates: one, two side by side, a stack of three, or a barrel beside one, by variant. */
function crates(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const size = CRATE_SIZE * s;
  const height = CRATE_HEIGHT * s;
  const box = (foot: Vec2, lift = 0, turn = 0): DecorCommand[] =>
    block({ x: foot.x, y: foot.y - lift }, size, height, rotation + turn, c);
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
  const tall = height * 1.2;
  return [
    ...box(at),
    ellipse(barrel, r, r * 0.45, rising(c.wood, 0)),
    ...side({ x: barrel.x - r, y: barrel.y }, { x: barrel.x + r, y: barrel.y }, tall, c.wood),
    ...[0.3, 0.75].map((share): DecorCommand => ({
      kind: "line",
      from: { x: barrel.x - r, y: barrel.y - tall * share },
      to: { x: barrel.x + r, y: barrel.y - tall * share },
      width: Math.max(1, 1.5 * s),
      colour: c.iron,
      alpha: 1,
    })),
    ...outlinedEllipse({ x: barrel.x, y: barrel.y - tall }, r, r * 0.45, c.wood),
  ];
}

/** A fern tuft: outlined fronds from its heart, those facing north-west lit, their tips swaying. */
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
    .flatMap((degrees) => {
      const tip = tipOf(degrees);
      const across = turned({ x: 0, y: 0 }, 0, length * 0.16, degrees);
      const mid = { x: (at.x + tip.x) / 2, y: (at.y + tip.y) / 2 };
      const westward = Math.cos(((degrees + 135) * Math.PI) / 180);
      const colour = westward > 0.4 ? c.plantLit : westward < -0.4 ? c.plantShade : c.plant;
      const frond = [
        at,
        { x: mid.x + across.x, y: mid.y + across.y },
        tip,
        { x: mid.x - across.x, y: mid.y - across.y },
      ];
      return [poly(frond, colour), outline(frond)];
    });
}

/**
 * A brazier: three iron legs, an outlined bowl of coals, and its flame,
 * `flicker` of full height, stacked from deep red at its foot to pale gold
 * at its tip.
 */
function brazier(prop: MapDecor, c: DecorColours, flicker: number): DecorCommand[] {
  const { at, scale: s } = prop;
  const r = BRAZIER_RADIUS * s;
  const bowl = { x: at.x, y: at.y - BRAZIER_HEIGHT * s };
  const legs: DecorCommand[] = [-0.8, 0, 0.8].map((share) => ({
    kind: "line",
    from: { x: bowl.x + share * r * 0.6, y: bowl.y },
    to: { x: at.x + share * r, y: at.y + (share === 0 ? r * 0.3 : 0) },
    width: Math.max(1.5, 2 * s),
    colour: rising(c.iron, share > 0 ? 0 : 0.5),
    alpha: 1,
  }));
  const flame = FLAME_HEIGHT * s * flicker;
  const tones = c.flame.length;
  const tongues = c.flame.map((colour, k): DecorCommand => {
    const t = k / tones;
    const half = r * 0.6 * (1 - t * 0.8);
    const foot = bowl.y - flame * t * 0.45;
    const tip = bowl.y - flame * (1 - t * 0.35);
    return poly(
      [
        { x: bowl.x - half, y: foot },
        { x: bowl.x - half * 0.45, y: (foot + tip) / 2 },
        { x: bowl.x + half * 0.1, y: tip },
        { x: bowl.x + half * 0.55, y: (foot + tip) / 2 + flame * 0.05 },
        { x: bowl.x + half, y: foot },
      ],
      colour,
      0.95,
      true,
    );
  });
  return [
    ...legs,
    ellipse({ x: bowl.x, y: bowl.y + r * 0.3 }, r, r * 0.55, rising(c.iron, 0.4)),
    ...outlinedEllipse(bowl, r, r * 0.45, c.iron),
    ellipse(bowl, r * 0.8, r * 0.32, c.coals),
    ellipse(bowl, r * 0.6, r * 0.24, c.ember, 0.8, true),
    ...tongues,
  ];
}

/**
 * A cinder drift (#4018): flat heaps of ash, the middle one outlined, the
 * north-west one lit, and a few embers glowing in it, some bright, some
 * dying. Still: it is drawn the same at every moment. Grey and dim on
 * purpose: it carries no light, and nothing about it is a fire zone's
 * orange sheet or rim.
 */
function cinders(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const r = CINDER_RADIUS * s;
  // Heaps along the drift's axis, a radius out at each end, flattened by the view.
  const heaps = [
    { dx: -0.42, dy: 0.1, rx: 0.58, colour: c.ashShade, alpha: 0.55, rim: false },
    { dx: 0.38 - variant * 0.04, dy: 0.05, rx: 0.62, colour: c.ashShade, alpha: 0.55, rim: false },
    { dx: 0, dy: 0, rx: 0.62, colour: c.ash, alpha: 0.7, rim: true },
    { dx: -0.2 + variant * 0.08, dy: -0.12, rx: 0.34, colour: c.ashLit, alpha: 0.6, rim: false },
  ];
  // A point along the drift's axis, on the ground: flattened by the view as the heaps are.
  const onAxis = (along: number): Vec2 => {
    const point = turned(at, along, 0, rotation);
    return { x: point.x, y: at.y + (point.y - at.y) * 0.5 };
  };
  const drawn = heaps.flatMap(({ dx, dy, rx, colour, alpha, rim }) => {
    const centre = onAxis(dx * r);
    const heap = { x: centre.x, y: centre.y + dy * r };
    const filled = ellipse(heap, rx * r, rx * r * 0.5, colour, alpha);
    return rim ? [filled, outline(ring(heap, rx * r, rx * r * 0.5))] : [filled];
  });
  const count = CINDER_EMBERS - (variant % 3);
  const embers = Array.from({ length: count }, (_, k): DecorCommand => {
    const along = (noise(prop, k + 1) * 2 - 1) * 0.75;
    const across = (noise(prop, k + 11) * 2 - 1) * 0.2;
    const glow = noise(prop, k + 21);
    const centre = onAxis(along * r);
    return ellipse(
      { x: centre.x, y: centre.y + across * r },
      // An ember is an ember at any size of drift.
      1.4 + glow * 1.6,
      (1.4 + glow * 1.6) * 0.7,
      k % 3 === 0 ? c.spark : c.ember,
      0.35 + glow * 0.55,
      true,
    );
  });
  return [...drawn, ...embers];
}

/**
 * A reed clump (#4019): thin blades fanning up from a tight foot, the
 * north-west ones lit, over one dark silhouette of them all, so the clump
 * is outlined and its blades are not; a seed head or two, outlined, on the
 * tallest. Their tips sway `sway`. Wading, its foot is drawn under shallow
 * water's own tint and a ripple, so it stands in the water, not on it.
 */
function reed(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, variant, wading } = prop;
  const count = REED_BLADES + (variant % 4);
  const r = REED_RADIUS * s;
  const blades = Array.from({ length: count }, (_, k) => {
    // Spread across the clump's width; back ones first, so the front is drawn over them.
    const across = ((k + 0.5) / count) * 2 - 1 + (noise(prop, k + 31) - 0.5) * 0.3;
    const foot = { x: at.x + across * r * 0.35, y: at.y - noise(prop, k + 41) * r * 0.2 };
    const height = REED_HEIGHT * s * (0.6 + 0.4 * noise(prop, k + 51));
    const tip = {
      x: foot.x + across * r * 0.75 + sway * (height / (REED_HEIGHT * s)),
      y: foot.y - height,
    };
    return { foot, tip, height, across };
  }).sort((a, b) => a.foot.y - b.foot.y);
  const half = Math.max(1.2, 2 * s);
  /** A blade's outline, `grow` wider all round. */
  const blade = ({ foot, tip }: { foot: Vec2; tip: Vec2 }, grow: number): Vec2[] => {
    const mid = { x: (foot.x + tip.x) / 2, y: (foot.y + tip.y) / 2 };
    const w = half + grow;
    return [
      { x: foot.x - w, y: foot.y },
      { x: mid.x - w * 0.7, y: mid.y },
      { x: tip.x, y: tip.y - grow },
      { x: mid.x + w * 0.7, y: mid.y },
      { x: foot.x + w, y: foot.y },
    ];
  };
  const heads = [...blades].sort((a, b) => b.height - a.height).slice(0, variant >= 2 ? 2 : 1);
  return [
    ...blades.map((one) => poly(blade(one, OUTLINE_WIDTH), OUTLINE)),
    ...blades.map((one) =>
      poly(
        blade(one, 0),
        one.across < -0.3 ? c.plantLit : one.across > 0.3 ? c.plantShade : c.plant,
      ),
    ),
    ...heads.flatMap(({ foot, tip }) =>
      outlinedEllipse(
        { x: foot.x + (tip.x - foot.x) * 0.8, y: foot.y + (tip.y - foot.y) * 0.8 },
        2.2 * s,
        5 * s,
        c.wood,
      ),
    ),
    ...(wading ? waterline(at, r) : []),
  ];
}

/**
 * A boulder cluster (#4020): two to four low stones, the back ones first,
 * each a lumpy outlined silhouette darkening to the ground, its cap in the
 * rock's colour and its north-west facet lit. Under 100 u across at any
 * scale, so it reads as scenery, never as the cover a boulder wall is.
 */
function rock(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const r = ROCK_RADIUS * s;
  const stones = [
    { dx: 0, dy: 0, size: 0.62 },
    { dx: 0.5, dy: -0.25, size: 0.42 },
    { dx: -0.55, dy: 0.15, size: 0.36 },
    { dx: 0.3, dy: 0.4, size: 0.28 },
  ]
    .slice(0, 2 + (variant % 3))
    .map(({ dx, dy, size }) => {
      const centre = turned(at, dx * r, 0, rotation);
      return { foot: { x: centre.x, y: at.y + (centre.y - at.y) * 0.5 + dy * r }, size: size * r };
    })
    .sort((a, b) => a.foot.y - b.foot.y);
  return stones.flatMap(({ foot, size }, index) => {
    const height = size * 0.9;
    // A lumpy ring: each point's radius jittered, so no two stones are the same oval.
    const lumps = Array.from({ length: 8 }, (_, k) => 0.8 + noise(prop, index * 8 + k + 61) * 0.35);
    const edge = (lift: number, shrink: number): Vec2[] =>
      lumps.map((lump, k) => {
        const angle = (k / lumps.length) * Math.PI * 2;
        return {
          x: foot.x + Math.cos(angle) * size * lump * shrink,
          y: foot.y - lift + Math.sin(angle) * size * lump * shrink * 0.5,
        };
      });
    const base = edge(0, 1);
    const cap = edge(height, 0.8);
    // Its silhouette: the cap's north half over the foot's south half.
    const silhouette = [
      ...cap.filter((_, k) => k >= lumps.length / 2),
      ...base.filter((_, k) => k <= lumps.length / 2),
    ];
    const lit = [cap[4], cap[5], cap[6], { x: foot.x - size * 0.1, y: foot.y - height }].filter(
      (point): point is Vec2 => point !== undefined,
    );
    return [
      poly(silhouette, rising(c.rockShade, 0.5)),
      poly(
        base
          .filter((_, k) => k <= lumps.length / 2)
          .map(({ x, y }) => ({ x, y: y - height * 0.45 })),
        rising(c.rock, 0.4),
      ),
      poly(cap, c.rock),
      poly(lit, c.rockLit),
      outline(silhouette),
    ];
  });
}

/**
 * A dead tree (#4020): a bare, leaning trunk darkening to its foot, lit on
 * its west side, and three or four crooked branches tapering from it,
 * every piece outlined. Its branch tips sway `sway`.
 */
function deadTree(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const h = DEAD_TREE_HEIGHT * s * (variant === 1 ? 0.85 : 1);
  const w = TRUNK_WIDTH * s * 0.6;
  const lean = (noise(prop, 71) - 0.5) * 10 * s;
  const top = { x: at.x + lean + sway * 0.5, y: at.y - h };
  const trunk = [
    { x: at.x - w * 1.3, y: at.y },
    { x: top.x - w * 0.3, y: top.y },
    { x: top.x + w * 0.3, y: top.y },
    { x: at.x + w * 1.3, y: at.y },
  ];
  const reach = DEAD_TREE_RADIUS * s;
  const branches = Array.from({ length: 3 + (variant % 2) }, (_, k) => {
    const up = 0.45 + k * 0.17 + noise(prop, k + 81) * 0.08;
    const westward = k % 2 === 0;
    const from = { x: at.x + (top.x - at.x) * up, y: at.y - h * up };
    const out = reach * (0.6 + noise(prop, k + 91) * 0.4) * (1 - k * 0.12) * (westward ? -1 : 1);
    const tip = { x: from.x + out + sway, y: from.y - Math.abs(out) * 0.7 };
    // A crooked limb: it kinks at its elbow, tapering from the trunk to its tip.
    const elbow = {
      x: from.x + out * 0.5,
      y: from.y - Math.abs(out) * (0.15 + noise(prop, k + 101) * 0.2),
    };
    const thick = w * (0.55 - k * 0.08);
    const limb = [
      { x: from.x, y: from.y - thick },
      { x: elbow.x, y: elbow.y - thick * 0.6 },
      tip,
      { x: elbow.x, y: elbow.y + thick * 0.6 },
      { x: from.x, y: from.y + thick },
    ];
    return { limb, westward };
  });
  // The east limbs behind the trunk in its shade, the west ones in front of it, lit.
  const drawn = (west: boolean, colour: number): DecorCommand[] =>
    branches
      .filter(({ westward }) => westward === west)
      .flatMap(({ limb }) => [poly(limb, colour), outline(limb)]);
  return [
    ...drawn(false, scaled(c.trunk, 0.8)),
    ...side({ x: at.x - w * 1.3, y: at.y }, at, h, scaled(c.trunk, 1.35)),
    ...side(at, { x: at.x + w * 1.3, y: at.y }, h, c.trunk),
    outline(trunk),
    ...drawn(true, scaled(c.trunk, 1.35)),
  ];
}

/** One bone from `a` to `b`, `width` thick: a shaft and a knob at each end, outlined. */
function bone(a: Vec2, b: Vec2, width: number, c: DecorColours): DecorCommand[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = ((a.y - b.y) / length) * width * 0.5;
  const ny = ((b.x - a.x) / length) * width * 0.5;
  const shaft = [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  return [
    ...outlinedEllipse(a, width, width * 0.7, c.bone),
    ...outlinedEllipse(b, width, width * 0.7, c.bone),
    poly(shaft, c.bone),
    outline(shaft),
  ];
}

/**
 * A scatter of old bones (#4020), flat on the ground: three to five long
 * bones at odd angles and, on most, a skull with two dark sockets. Pale
 * and dull, never lit: nothing in it glows or rings like a shrine.
 */
function bones(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, rotation, variant } = prop;
  const r = BONES_RADIUS * s;
  const width = Math.max(1.5, 2.4 * s);
  const count = 3 + (variant % 3);
  const long = Array.from({ length: count }, (_, k) => {
    // Spread east to west, so it is as wide as it says, each a little off its place.
    const along = ((k + 0.5) / count) * 2 - 1 + (noise(prop, k + 111) - 0.5) * 0.3;
    const foot = { x: at.x + along * r * 0.9, y: at.y + (noise(prop, k + 121) - 0.5) * r * 0.5 };
    const half = r * (0.3 + noise(prop, k + 131) * 0.2);
    const angle = rotation + noise(prop, k + 141) * 180;
    const a = turned(foot, -half, 0, angle);
    const b = turned(foot, half, 0, angle);
    // Flattened by the view, as everything on the ground is.
    return {
      a: { x: a.x, y: foot.y + (a.y - foot.y) * 0.5 },
      b: { x: b.x, y: foot.y + (b.y - foot.y) * 0.5 },
    };
  }).sort((one, two) => one.a.y + one.b.y - (two.a.y + two.b.y));
  const commands = long.flatMap(({ a, b }) => bone(a, b, width, c));
  if (variant !== 3) {
    const skull = turned(at, r * 0.35, 0, rotation + 90);
    const head = { x: skull.x, y: at.y + (skull.y - at.y) * 0.5 };
    const rx = 5 * s;
    commands.push(
      ...outlinedEllipse(
        { x: head.x, y: head.y + rx * 0.5 },
        rx * 0.6,
        rx * 0.45,
        scaled(c.bone, 0.8),
      ),
      ...outlinedEllipse(head, rx, rx * 0.8, c.bone),
      ellipse({ x: head.x - rx * 0.4, y: head.y + rx * 0.05 }, rx * 0.25, rx * 0.22, OUTLINE),
      ellipse({ x: head.x + rx * 0.4, y: head.y + rx * 0.05 }, rx * 0.25, rx * 0.22, OUTLINE),
    );
  }
  return commands;
}

/**
 * A cairn (#4020): three to five flat stones stacked, each smaller than
 * the one under it and a little off its centre, each a short banded side
 * under an outlined cap lit on its north-west. Low, grey and unlit, it has
 * none of a capture point's or a shrine's rings, glow or colour.
 */
function cairn(prop: MapDecor, c: DecorColours): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const r = CAIRN_RADIUS * s;
  const count = 3 + (variant % 3);
  const commands: DecorCommand[] = [];
  let lift = 0;
  for (let k = 0; k < count; k++) {
    const size = r * (1 - k * 0.2);
    const thick = size * 0.38;
    const foot = { x: at.x + (noise(prop, k + 151) - 0.5) * size * 0.3, y: at.y - lift };
    const ry = size * 0.42;
    commands.push(
      ...side({ x: foot.x - size, y: foot.y }, { x: foot.x + size, y: foot.y }, thick, c.rock),
      ellipse({ x: foot.x, y: foot.y }, size, ry, rising(c.rockShade, 0.3)),
      ...outlinedEllipse({ x: foot.x, y: foot.y - thick }, size, ry, c.rock),
      ellipse(
        { x: foot.x - size * 0.3, y: foot.y - thick - ry * 0.25 },
        size * 0.5,
        ry * 0.45,
        c.rockLit,
      ),
    );
    lift += thick;
  }
  return commands;
}

/**
 * A banner (#4020): an outlined pole with a crossbar, and a cloth hanging
 * from it in three folds, lit and shaded in turn, its hem rippling `sway`
 * east and west, the folds shifting with it.
 */
function banner(prop: MapDecor, c: DecorColours, sway: number): DecorCommand[] {
  const { at, scale: s, variant } = prop;
  const half = (BANNER_WIDTH * s) / 2;
  const height = BANNER_HEIGHT * s;
  const drop = BANNER_DROP * s * (variant === 2 ? 1.2 : 1);
  const pole = Math.max(1.2, 1.6 * s);
  const bar = at.y - height;
  const folds = 3;
  const commands: DecorCommand[] = [
    ...side({ x: at.x - pole, y: at.y }, { x: at.x + pole, y: at.y }, height + 4 * s, c.wood),
    outline([
      { x: at.x - pole, y: at.y },
      { x: at.x - pole, y: at.y - height - 4 * s },
      { x: at.x + pole, y: at.y - height - 4 * s },
      { x: at.x + pole, y: at.y },
    ]),
  ];
  const hemAt = (share: number): Vec2 => ({
    x: at.x - half + share * half * 2 + sway,
    // A tail cut, or a straight hem, by variant; the ripple lifts the hem a little.
    y:
      bar +
      drop * (variant === 1 && Math.abs(share - 0.5) < 0.2 ? 0.75 : 1) +
      Math.sin(share * Math.PI * 2 + sway) * s,
  });
  for (let k = 0; k < folds; k++) {
    const from = k / folds;
    const to = (k + 1) / folds;
    const strip = [
      { x: at.x - half + from * half * 2, y: bar },
      { x: at.x - half + to * half * 2, y: bar },
      hemAt(to),
      hemAt((from + to) / 2),
      hemAt(from),
    ];
    // The fold that faces north-west catches the light; which one shifts as the cloth ripples.
    const lit = (k + (sway > 0 ? 1 : 0)) % 2 === 0;
    commands.push(poly(strip, lit ? c.cloth : c.clothShade));
  }
  const cloth = [
    { x: at.x - half, y: bar },
    { x: at.x + half, y: bar },
    ...[1, 5 / 6, 4 / 6, 3 / 6, 2 / 6, 1 / 6, 0].map(hemAt),
  ];
  commands.push(
    outline(cloth),
    poly(
      [
        { x: at.x - half - 2 * s, y: bar - pole },
        { x: at.x + half + 2 * s, y: bar - pole },
        { x: at.x + half + 2 * s, y: bar + pole },
        { x: at.x - half - 2 * s, y: bar + pole },
      ],
      c.wood,
    ),
    outline([
      { x: at.x - half - 2 * s, y: bar - pole },
      { x: at.x + half + 2 * s, y: bar - pole },
      { x: at.x + half + 2 * s, y: bar + pole },
      { x: at.x - half - 2 * s, y: bar + pole },
    ]),
  );
  return commands;
}

/** Shallow water's tint over a wading prop's foot, and the front half of a ripple round it. */
function waterline(at: Vec2, r: number): DecorCommand[] {
  const look = WATER_LOOK.shallow;
  const front = ring(at, r * 0.7, r * 0.24).slice(0, RING_POINTS / 2 + 1);
  return [
    ellipse({ x: at.x, y: at.y - r * 0.04 }, r * 0.5, r * 0.16, look.fill, look.fillAlpha),
    ...front.slice(1).map((to, k): DecorCommand => ({
      kind: "line",
      from: front[k] ?? to,
      to,
      width: OUTLINE_WIDTH,
      colour: look.ripple,
      alpha: look.rippleAlpha,
    })),
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
    case "tree":
      return tree(prop, colours, decorSway(prop, now, still));
    case "crates":
      return crates(prop, colours);
    case "fern":
      return fern(prop, colours, decorSway(prop, now, still));
    case "brazier":
      return brazier(prop, colours, brazierFlicker(prop, now, still));
    case "cinders":
      return cinders(prop, colours);
    case "reed":
      return reed(prop, colours, decorSway(prop, now, still));
    case "rock":
      return rock(prop, colours);
    case "dead-tree":
      return deadTree(prop, colours, decorSway(prop, now, still));
    case "bones":
      return bones(prop, colours);
    case "cairn":
      return cairn(prop, colours);
    case "banner":
      return banner(prop, colours, decorSway(prop, now, still));
  }
}

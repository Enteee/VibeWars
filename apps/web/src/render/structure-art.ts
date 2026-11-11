import type { Vec2 } from "@vibewars/game-core";
import { pointInShape } from "@vibewars/game-maps/geometry";
import type { DeckLook, TransitionLook } from "@vibewars/game-maps/schema";

import {
  DECK_LOOK,
  GATE_DOOR_LOOK,
  SWITCHED_DECK_LOOK,
  TRANSITION_LOOK,
  type ArenaPalette,
} from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import {
  plankLines,
  southFacingEdges,
  type RampDrawing,
  type RampFrame,
  type Segment,
} from "./layer-surfaces.js";

/**
 * What each raised structure is drawn as (#3067), through one lookup
 * keyed by its map `look`, as `LIGHT_MARK_ART` and `SWITCH_MARK_ART`
 * are: a tower, a wall-walk, a terrace, a bridge; stairs, a ladder; and
 * (#3078) a ledge, a ruin, an arch, a gatehouse, a rooftop, a pier, a plinth.
 * Parapets and railings are art only: a deck's edge already stops a body.
 */

/** The few drawing calls a structure needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface StructurePainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void;
  lineBetween(ax: number, ay: number, bx: number, by: number): void;
}

/** A deck as its art draws it: lifts in world units, its palette as `deckPalette` gives it, lit. */
export interface DeckFrame {
  readonly footprint: RenderableShape;
  /** The stretches of its edge no transition meets (`openEdges`): a parapet's or railing's. */
  readonly open: readonly Segment[];
  /** The lift of its top. */
  readonly top: number;
  /** The lift its side face reaches down to (`deckSideLow`). */
  readonly low: number;
  /** The lift of the layer under it, where a pier stands. */
  readonly base: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  readonly palette: ArenaPalette;
}

/**
 * How one deck look draws, once per map. `side` paints over its side face
 * in world units, each lift explicit; `top` paints over its top's fill,
 * in the top's own frame, already lifted by its caller.
 */
export interface DeckArt {
  readonly side: (painter: StructurePainter, deck: DeckFrame) => void;
  readonly top: (painter: StructurePainter, deck: DeckFrame) => void;
}

/** A transition as its art draws it: its slope's lines, already lifted. */
export interface TransitionFrame {
  readonly drawing: RampDrawing;
  readonly frame: RampFrame;
  readonly line: number;
  readonly palette: ArenaPalette;
}

/** How one transition look draws over its slope's fill, once per map. */
export type TransitionArt = (painter: StructurePainter, ramp: TransitionFrame) => void;

/** `palette` with its deck colours turned into `look`'s, for `litStructurePalette` to light. */
export function deckPalette(palette: ArenaPalette, look: DeckLook): ArenaPalette {
  const colours = DECK_LOOK[look];
  return {
    ...palette,
    deckTop: colours.top,
    plank: colours.detail,
    slab: colours.side,
    wallTop: colours.edgeTop,
    wallLit: colours.edgeTop,
    wallFace: colours.edgeFace,
    support: colours.support,
  };
}

/** `palette` with its ramp colours turned into `look`'s, for `litStructurePalette` to light. */
export function transitionPalette(palette: ArenaPalette, look: TransitionLook): ArenaPalette {
  const colours = TRANSITION_LOOK[look];
  return {
    ...palette,
    rampTop: colours.top,
    rampPanel: colours.step,
    rampChevron: colours.riser,
    slab: colours.side,
  };
}

/** How far apart a platform's planks are, in world units. */
const DECK_PLANK = 48;
/** How far apart flagstones and paving are, in world units. */
const PAVING = 20;
/** How high a parapet stands over its deck, and a merlon over the parapet. */
const PARAPET_HEIGHT = 6;
const MERLON_HEIGHT = 4;
/** A crenellation's merlon and gap, along the edge. */
const MERLON_EVERY = 12;
/** A railing's posts: how far apart, how tall. */
const POST_EVERY = 36;
const POST_HEIGHT = 11;
/** How far a rope sags between two posts. */
const ROPE_SAG = 3;
/** How far apart a pier stands along a stone bridge's face. */
const PIER_EVERY = 120;
const PIER_WIDTH = 14;
/** How far apart a masonry course or a terrace's stratum is on a face. */
const COURSE_EVERY = 10;
/** A stair's tread, a ladder's rung, in world units along the climb. */
const STAIR_TREAD = 10;
const LADDER_RUNG = 8;
/** Where a ladder's rails stand, as shares of its width off its middle. */
const LADDER_RAIL = 0.4;
/** Where a landing sits on its stairs, as shares of their length. */
const LANDING = [0.42, 0.58] as const;
/** An arch's opening and a gatehouse's passage, as shares of the face they are in. */
const OPENING_WIDTH = 0.5;
const PASSAGE_HEIGHT = 0.7;
/** The segments an arch's round top is drawn in. */
const ARCH_SEGMENTS = 8;
/** How far apart a gatehouse grid's bars are, in world units. */
const GRID_EVERY = 8;
/** A rooftop's door, in world units, and how far apart a face has one. */
const DOOR_WIDTH = 10;
const DOOR_HEIGHT = 16;
const DOOR_EVERY = 160;
/** A pier's posts: how far apart, how thick. */
const POST_EVERY_PIER = 60;
const PIER_POST_WIDTH = 5;
/**
 * Where a ruin's brink has fallen in, per face: where along it, how wide,
 * and how many courses down. Each bite steps: its middle half falls one
 * course further than its shoulders.
 */
const RUIN_BITES = [
  [0.12, 30, 1],
  [0.38, 44, 2],
  [0.63, 22, 1],
  [0.86, 36, 2],
] as const;
/** How far a bite reaches into a ruin's top, per course it falls, in world units. */
const BITE_DEPTH = 6;
/** The stones fallen at a ruin's foot, per face: where along it, how big; the biggest under its bites. */
const RUBBLE = [
  [0.05, 9],
  [0.13, 16],
  [0.21, 10],
  [0.38, 18],
  [0.5, 11],
  [0.63, 14],
  [0.75, 9],
  [0.86, 17],
] as const;
/** One flagstone in this many is gone from a ruin's top, and one in this many cracked. */
const STONE_MISSING_ONE_IN = 6;
const STONE_CRACKED_ONE_IN = 4;
/** How far a plinth's capture ring stands out past its base, in world units. */
const RING_MARGIN = 14;
const RING_SEGMENTS = 24;
/** A plinth's statue: its base's share of the top, its body and head in world units. */
const STATUE_BASE = 0.4;
const STATUE_HEIGHT = 22;
const STATUE_HEAD = 5;
/** A rough step's depths, in turn, in world units: cut by hand, never even. */
const ROUGH_TREADS = [14, 19, 12, 17, 15];
/** How far a rough step's edge wanders, as a share of its depth. */
const ROUGH_WANDER = 0.25;

function fillQuad(painter: StructurePainter, a: Vec2, b: Vec2, c: Vec2, d: Vec2): void {
  painter.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
  painter.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
}

function strokeSegments(painter: StructurePainter, segments: readonly Segment[]): void {
  for (const { from, to } of segments) {
    painter.lineBetween(from.x, from.y, to.x, to.y);
  }
}

/** The point `t` of the way along `segment`. */
function along({ from, to }: Segment, t: number): Vec2 {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function lengthOf({ from, to }: Segment): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** Up by `lift` on screen. */
function raised(point: Vec2, lift: number): Vec2 {
  return { x: point.x, y: point.y - lift };
}

/** The axis a deck runs along, its longer side: a bridge's planks lie across it. */
function longAxis(shape: RenderableShape): "x" | "y" {
  if (shape.kind === "rect") {
    return shape.width >= shape.height ? "x" : "y";
  }
  const xs = shape.points.map(({ x }) => x);
  const ys = shape.points.map(({ y }) => y);
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "x" : "y";
}

/** Lines across `shape`'s long axis, every `every`: planks, paving, a log's rings. */
function acrossLong(shape: RenderableShape, every: number): readonly Segment[] {
  return plankLines(shape, every, longAxis(shape));
}

/** Lines along `shape`'s long axis, every `every`: a log's grain, a terrace's furrows. */
function alongLong(shape: RenderableShape, every: number): readonly Segment[] {
  return plankLines(shape, every, longAxis(shape) === "x" ? "y" : "x");
}

/** A low wall on each open edge, in the top's frame: its face, then its lit top. */
function parapet(painter: StructurePainter, deck: DeckFrame, crenellated: boolean): void {
  const { open, line, palette } = deck;
  painter.fillStyle(palette.wallFace, 1);
  for (const edge of open) {
    fillQuad(
      painter,
      edge.from,
      edge.to,
      raised(edge.to, PARAPET_HEIGHT),
      raised(edge.from, PARAPET_HEIGHT),
    );
  }
  if (crenellated) {
    for (const edge of open) {
      const merlons = Math.floor(lengthOf(edge) / MERLON_EVERY);
      for (let k = 0; k < merlons; k += 2) {
        const [a, b] = [along(edge, k / merlons), along(edge, (k + 1) / merlons)];
        fillQuad(
          painter,
          raised(a, PARAPET_HEIGHT),
          raised(b, PARAPET_HEIGHT),
          raised(b, PARAPET_HEIGHT + MERLON_HEIGHT),
          raised(a, PARAPET_HEIGHT + MERLON_HEIGHT),
        );
      }
    }
  }
  painter.lineStyle(line * 2, palette.wallLit, 1);
  for (const edge of open) {
    const [a, b] = [raised(edge.from, PARAPET_HEIGHT), raised(edge.to, PARAPET_HEIGHT)];
    painter.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Posts along each open edge with a rope sagging between them, in the top's frame. */
function railing(painter: StructurePainter, deck: DeckFrame): void {
  const { open, line, palette } = deck;
  for (const edge of open) {
    const spans = Math.max(1, Math.round(lengthOf(edge) / POST_EVERY));
    const posts = Array.from({ length: spans + 1 }, (_, k) => along(edge, k / spans));
    painter.fillStyle(palette.wallFace, 1);
    for (const post of posts) {
      painter.fillRect(post.x - line * 1.5, post.y - POST_HEIGHT, line * 3, POST_HEIGHT);
    }
    painter.lineStyle(line * 1.5, palette.wallLit, 1);
    for (let k = 0; k < spans; k += 1) {
      const [a, b] = [posts[k], posts[k + 1]];
      if (a !== undefined && b !== undefined) {
        const sag = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - POST_HEIGHT + ROPE_SAG };
        painter.lineBetween(a.x, a.y - POST_HEIGHT, sag.x, sag.y);
        painter.lineBetween(sag.x, sag.y, b.x, b.y - POST_HEIGHT);
      }
    }
  }
}

/** Courses of stone, or strata of earth, across each south face from `low` up to `top`. */
function courses(painter: StructurePainter, deck: DeckFrame, staggered: boolean): void {
  const { footprint, low, top, line, palette } = deck;
  painter.lineStyle(line, palette.wallFace, 1);
  for (const edge of southFacingEdges(footprint)) {
    for (let lift = low + COURSE_EVERY; lift < top; lift += COURSE_EVERY) {
      const [a, b] = [raised(edge.from, lift), raised(edge.to, lift)];
      painter.lineBetween(a.x, a.y, b.x, b.y);
    }
    if (staggered) {
      const joints = Math.floor(lengthOf(edge) / (COURSE_EVERY * 1.6));
      for (let lift = low, row = 0; lift + COURSE_EVERY <= top; lift += COURSE_EVERY, row += 1) {
        for (let k = 1; k < joints; k += 1) {
          const at = along(edge, (k + (row % 2) / 2) / joints);
          painter.lineBetween(at.x, at.y - lift, at.x, at.y - lift - COURSE_EVERY);
        }
      }
    }
  }
}

/** Square piers under each south face, every `PIER_EVERY`, from the layer below to the slab. */
function piers(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, base, palette } = deck;
  painter.fillStyle(palette.support, 1);
  for (const edge of southFacingEdges(footprint)) {
    const count = Math.max(2, Math.round(lengthOf(edge) / PIER_EVERY) + 1);
    for (let k = 0; k < count; k += 1) {
      const at = along(edge, (k + 0.5) / count);
      painter.fillRect(at.x - PIER_WIDTH / 2, at.y - low, PIER_WIDTH, low - base);
    }
  }
}

/** Thin posts under each south face, every `POST_EVERY_PIER`, from the layer below to the planks. */
function posts(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, base, palette } = deck;
  painter.fillStyle(palette.support, 1);
  for (const edge of southFacingEdges(footprint)) {
    const count = Math.max(2, Math.round(lengthOf(edge) / POST_EVERY_PIER) + 1);
    for (let k = 0; k < count; k += 1) {
      const at = along(edge, k / (count - 1));
      painter.fillRect(at.x - PIER_POST_WIDTH / 2, at.y - low, PIER_POST_WIDTH, low - base);
    }
  }
}

/** The middle `OPENING_WIDTH` of `edge`: where an arch opens or a passage runs. */
function opening(edge: Segment): Segment {
  const margin = (1 - OPENING_WIDTH) / 2;
  return { from: along(edge, margin), to: along(edge, 1 - margin) };
}

/** A round-topped dark opening in each south face, from its foot: what passes under an arch. */
function archway(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, top, palette } = deck;
  painter.fillStyle(palette.support, 1);
  for (const edge of southFacingEdges(footprint)) {
    const { from, to } = opening(edge);
    const middle = along({ from, to }, 0.5);
    const radius = Math.min(lengthOf({ from, to }) / 2, (top - low) * 0.45);
    const spring = low + Math.max(0, (top - low) * 0.85 - radius);
    fillQuad(painter, raised(from, low), raised(to, low), raised(to, spring), raised(from, spring));
    const centre = raised(middle, spring);
    const round = Array.from({ length: ARCH_SEGMENTS + 1 }, (_, k) => {
      const angle = (Math.PI * k) / ARCH_SEGMENTS;
      const t = (1 - Math.cos(angle)) / 2;
      return raised(along({ from, to }, t), spring + Math.sin(angle) * radius);
    });
    for (let k = 0; k < ARCH_SEGMENTS; k += 1) {
      const [a, b] = [round[k], round[k + 1]];
      if (a !== undefined && b !== undefined) {
        painter.fillTriangle(centre.x, centre.y, a.x, a.y, b.x, b.y);
      }
    }
  }
}

/** A square dark passage in each south face, from its foot, an iron grid across it. */
function passage(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, top, line, palette } = deck;
  const high = low + (top - low) * PASSAGE_HEIGHT;
  for (const edge of southFacingEdges(footprint)) {
    const way = opening(edge);
    painter.fillStyle(palette.support, 1);
    fillQuad(
      painter,
      raised(way.from, low),
      raised(way.to, low),
      raised(way.to, high),
      raised(way.from, high),
    );
    painter.lineStyle(line * 1.5, palette.wallLit, 1);
    const bars = Math.max(2, Math.round(lengthOf(way) / GRID_EVERY));
    for (let k = 1; k < bars; k += 1) {
      const at = along(way, k / bars);
      painter.lineBetween(at.x, at.y - low, at.x, at.y - high);
    }
    const [a, b] = [raised(way.from, high), raised(way.to, high)];
    painter.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** A dark door in each south face, every `DOOR_EVERY`, at its foot. */
function doors(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, top, palette } = deck;
  const height = Math.min(DOOR_HEIGHT, (top - low) * 0.8);
  painter.fillStyle(palette.support, 1);
  for (const edge of southFacingEdges(footprint)) {
    const count = Math.max(1, Math.floor(lengthOf(edge) / DOOR_EVERY));
    for (let k = 0; k < count; k += 1) {
      const at = along(edge, (k + 0.5) / count);
      painter.fillRect(at.x - DOOR_WIDTH / 2, at.y - low - height, DOOR_WIDTH, height);
    }
  }
}

/** Stones fallen at the foot of each south face, on the layer under it: a dark heap, its top lit. */
function rubble(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, palette } = deck;
  for (const edge of southFacingEdges(footprint)) {
    for (const [t, size] of RUBBLE) {
      if (size > lengthOf(edge) / 3) {
        continue;
      }
      const at = raised(along(edge, t), low);
      painter.fillStyle(palette.wallFace, 1);
      painter.fillTriangle(
        at.x - size,
        at.y + size / 2,
        at.x + size,
        at.y + size / 2,
        at.x + size * 0.2,
        at.y - size / 2,
      );
      painter.fillStyle(palette.slab, 1);
      painter.fillTriangle(
        at.x - size * 0.5,
        at.y,
        at.x + size * 0.6,
        at.y - size * 0.1,
        at.x + size * 0.2,
        at.y - size / 2,
      );
    }
  }
}

/** The bites fallen out of `edge`, as stretches of it and the courses each falls. */
function bitesOf(edge: Segment): readonly { readonly way: Segment; readonly courses: number }[] {
  const length = lengthOf(edge);
  return RUIN_BITES.filter(([, width]) => width < length / 2).map(([t, width, courses]) => {
    const half = width / 2 / length;
    return { way: { from: along(edge, t - half), to: along(edge, t + half) }, courses };
  });
}

/**
 * Where each south face's top has fallen in: a dark gap stepping down its
 * courses, the stones it bared lit along each step.
 */
function brokenFace(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, low, top, line, palette } = deck;
  for (const edge of southFacingEdges(footprint)) {
    for (const { way, courses } of bitesOf(edge)) {
      const shoulder = Math.max(low, top - courses * COURSE_EVERY);
      const deep = Math.max(low, shoulder - COURSE_EVERY);
      const inner = { from: along(way, 0.25), to: along(way, 0.75) };
      painter.fillStyle(palette.support, 1);
      fillQuad(
        painter,
        raised(way.from, shoulder),
        raised(way.to, shoulder),
        raised(way.to, top),
        raised(way.from, top),
      );
      fillQuad(
        painter,
        raised(inner.from, deep),
        raised(inner.to, deep),
        raised(inner.to, shoulder),
        raised(inner.from, shoulder),
      );
      painter.lineStyle(line * 2, palette.wallLit, 1);
      const steps: readonly Segment[] = [
        { from: raised(way.from, shoulder), to: raised(inner.from, shoulder) },
        { from: raised(inner.from, deep), to: raised(inner.to, deep) },
        { from: raised(inner.to, shoulder), to: raised(way.to, shoulder) },
      ];
      strokeSegments(painter, steps);
    }
  }
}

/**
 * Each bite seen from above, in the top's frame: a hole into the top behind
 * the brink, as deep as it falls, its far lip lit.
 */
function brokenBrink(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, line, palette } = deck;
  for (const edge of southFacingEdges(footprint)) {
    for (const { way, courses } of bitesOf(edge)) {
      const back = BITE_DEPTH * courses;
      const inner = { from: along(way, 0.25), to: along(way, 0.75) };
      const far = [
        raised(way.from, back / 2),
        raised(inner.from, back / 2),
        raised(inner.from, back),
        raised(inner.to, back),
        raised(inner.to, back / 2),
        raised(way.to, back / 2),
      ] as const;
      painter.fillStyle(palette.support, 1);
      fillQuad(painter, way.from, way.to, far[5], far[0]);
      fillQuad(painter, inner.from, inner.to, far[3], far[2]);
      painter.lineStyle(line * 2, palette.wallLit, 1);
      strokeSegments(
        painter,
        far.slice(1).map((to, k) => ({ from: far[k] ?? to, to })),
      );
    }
  }
}

/** A small whole-number hash of a flagstone's place, the same on every client. */
function stoneHash(column: number, row: number): number {
  const mixed = Math.imul(column, 73856093) ^ Math.imul(row, 19349663);
  return (mixed >>> 0) % 997;
}

/**
 * A ruin's paving, in the top's frame: the flagstones' grid, with some gone
 * (a dark hole, its far edge lit) and some cracked across.
 */
function brokenPaving(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, line, palette } = deck;
  painter.lineStyle(line, palette.plank, 1);
  strokeSegments(painter, plankLines(footprint, PAVING));
  strokeSegments(painter, plankLines(footprint, PAVING, "y"));
  const { middle, half } = boxMiddle(footprint);
  const [left, top] = [middle.x - half.x, middle.y - half.y];
  const [columns, rows] = [Math.ceil((half.x * 2) / PAVING), Math.ceil((half.y * 2) / PAVING)];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const [x, y] = [left + column * PAVING, top + row * PAVING];
      const corners = [
        { x: x + 1, y: y + 1 },
        { x: x + PAVING - 1, y: y + 1 },
        { x: x + 1, y: y + PAVING - 1 },
        { x: x + PAVING - 1, y: y + PAVING - 1 },
      ];
      if (!corners.every((corner) => pointInShape(corner, footprint))) {
        continue;
      }
      const hash = stoneHash(column, row);
      if (hash % STONE_MISSING_ONE_IN === 0) {
        painter.fillStyle(palette.support, 1);
        painter.fillRect(x + 2, y + 2, PAVING - 4, PAVING - 4);
        painter.lineStyle(line * 1.5, palette.wallLit, 1);
        painter.lineBetween(x + 2, y + 2, x + PAVING - 2, y + 2);
      } else if (hash % STONE_CRACKED_ONE_IN === 1) {
        const lean = hash % 2 === 0 ? 1 : -1;
        const [from, to] = lean > 0 ? [x, x + PAVING] : [x + PAVING, x];
        const bend = { x: x + PAVING / 2, y: y + PAVING * (0.3 + (hash % 5) / 10) };
        painter.lineStyle(line * 1.5, palette.support, 1);
        painter.lineBetween(from, y + 3, bend.x, bend.y);
        painter.lineBetween(bend.x, bend.y, to, y + PAVING - 3);
      }
    }
  }
}

/** The middle of `shape`'s box, and its half-widths. */
function boxMiddle(shape: RenderableShape): { readonly middle: Vec2; readonly half: Vec2 } {
  const outline =
    shape.kind === "rect"
      ? [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.width, y: shape.y + shape.height },
        ]
      : shape.points;
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return {
    middle: { x: (left + right) / 2, y: (top + bottom) / 2 },
    half: { x: (right - left) / 2, y: (bottom - top) / 2 },
  };
}

/** A brass ring on the layer under a plinth, round it: its capture spot. */
function captureRing(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, base, line, palette } = deck;
  const { middle, half } = boxMiddle(footprint);
  const ring = Array.from({ length: RING_SEGMENTS + 1 }, (_, k) => {
    const angle = (2 * Math.PI * k) / RING_SEGMENTS;
    return raised(
      {
        x: middle.x + Math.cos(angle) * (half.x + RING_MARGIN),
        y: middle.y + Math.sin(angle) * (half.y + RING_MARGIN),
      },
      base,
    );
  });
  painter.lineStyle(line * 2, palette.wallLit, 1);
  strokeSegments(
    painter,
    ring.slice(1).map((to, k) => ({ from: ring[k] ?? to, to })),
  );
}

/** A statue on a plinth's top, in the top's frame: a stepped base, a body, a head. */
function statue(painter: StructurePainter, deck: DeckFrame): void {
  const { footprint, palette } = deck;
  const { middle, half } = boxMiddle(footprint);
  const [w, h] = [half.x * STATUE_BASE, half.y * STATUE_BASE];
  painter.fillStyle(palette.slab, 1);
  painter.fillRect(middle.x - w, middle.y - h, w * 2, h * 2);
  painter.fillStyle(palette.support, 1);
  painter.fillRect(middle.x - w / 2, middle.y - STATUE_HEIGHT, w, STATUE_HEIGHT);
  painter.fillTriangle(
    middle.x - w * 0.8,
    middle.y - STATUE_HEIGHT * 0.55,
    middle.x + w * 0.8,
    middle.y - STATUE_HEIGHT * 0.55,
    middle.x,
    middle.y - STATUE_HEIGHT,
  );
  painter.fillRect(
    middle.x - STATUE_HEAD / 2,
    middle.y - STATUE_HEIGHT - STATUE_HEAD,
    STATUE_HEAD,
    STATUE_HEAD,
  );
}

const nothing = (): void => undefined;

export const DECK_ART: Record<DeckLook, DeckArt> = {
  /** Today's deck: built stone, planked north to south. */
  platform: {
    side: nothing,
    top: (painter, { footprint, line, palette }) => {
      painter.lineStyle(line, palette.plank, 1);
      strokeSegments(painter, plankLines(footprint, DECK_PLANK));
    },
  },
  /** Flagstones on top, crenellations round it, coursed masonry all the way down. */
  tower: {
    side: (painter, deck) => {
      courses(painter, deck, true);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, plankLines(deck.footprint, PAVING));
      strokeSegments(painter, plankLines(deck.footprint, PAVING, "y"));
      parapet(painter, deck, true);
    },
  },
  /** A wall's top: paving across it, crenellations along it, the wall's courses under it. */
  "wall-walk": {
    side: (painter, deck) => {
      courses(painter, deck, true);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, acrossLong(deck.footprint, PAVING));
      parapet(painter, deck, true);
    },
  },
  /** Stepped hillside: furrows along it, a grass lip on its brow, strata in its face. */
  terrace: {
    side: (painter, deck) => {
      courses(painter, deck, false);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line * 1.5, deck.palette.plank, 1);
      strokeSegments(painter, alongLong(deck.footprint, PAVING * 1.5));
      painter.lineStyle(deck.line * 3, deck.palette.wallLit, 1);
      strokeSegments(painter, southFacingEdges(deck.footprint));
    },
  },
  /** Paved stone on piers, with a low parapet. */
  "bridge-stone": {
    side: (painter, deck) => {
      piers(painter, deck);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, acrossLong(deck.footprint, PAVING));
      parapet(painter, deck, false);
    },
  },
  /** Planks across, rope railings on posts: one lane, no piers. */
  "bridge-plank": {
    side: nothing,
    top: (painter, deck) => {
      painter.lineStyle(deck.line * 1.5, deck.palette.plank, 1);
      strokeSegments(painter, acrossLong(deck.footprint, PAVING / 2));
      railing(painter, deck);
    },
  },
  /** A fallen trunk: grain along it, a lit crown down its middle, no railing. */
  "bridge-log": {
    side: nothing,
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, alongLong(deck.footprint, PAVING / 3));
      const grain = alongLong(deck.footprint, PAVING / 3);
      const crown = grain[Math.floor(grain.length / 2)];
      if (crown !== undefined) {
        painter.lineStyle(deck.line * 3, deck.palette.wallLit, 1);
        strokeSegments(painter, [crown]);
      }
    },
  },
  /** A stone shelf on a cliff face: paving along it, a bright lip, strata down the rock. */
  ledge: {
    side: (painter, deck) => {
      courses(painter, deck, false);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, acrossLong(deck.footprint, PAVING));
      painter.lineStyle(deck.line * 2, deck.palette.wallLit, 1);
      strokeSegments(painter, southFacingEdges(deck.footprint));
    },
  },
  /**
   * Broken masonry: its gaps are notches in its footprint, so what is drawn
   * is what walks; flagstones gone and cracked on what stands, its brink
   * fallen in down its courses, and the stones of it heaped at its foot.
   */
  ruin: {
    side: (painter, deck) => {
      courses(painter, deck, true);
      brokenFace(painter, deck);
      rubble(painter, deck);
    },
    top: (painter, deck) => {
      brokenPaving(painter, deck);
      brokenBrink(painter, deck);
    },
  },
  /** A stone arch: a dark round opening in its face, a walkable top. */
  arch: {
    side: (painter, deck) => {
      courses(painter, deck, false);
      archway(painter, deck);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, alongLong(deck.footprint, PAVING));
      painter.lineStyle(deck.line * 2, deck.palette.wallLit, 1);
      strokeSegments(painter, southFacingEdges(deck.footprint));
    },
  },
  /** A gatehouse: merlons round its roof, a dark passage under it, an iron grid in it. */
  "gatehouse-roof": {
    side: (painter, deck) => {
      courses(painter, deck, true);
      passage(painter, deck);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, plankLines(deck.footprint, PAVING));
      strokeSegments(painter, plankLines(deck.footprint, PAVING, "y"));
      parapet(painter, deck, true);
    },
  },
  /** A flat plaster roof over a coursed house wall with a door in it. */
  rooftop: {
    side: (painter, deck) => {
      courses(painter, deck, true);
      doors(painter, deck);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, alongLong(deck.footprint, PAVING));
      painter.lineStyle(deck.line * 2, deck.palette.wallLit, 1);
      strokeSegments(painter, southFacingEdges(deck.footprint));
    },
  },
  /** Planks across, on thin posts down into the water. */
  pier: {
    side: (painter, deck) => {
      posts(painter, deck);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line * 1.5, deck.palette.plank, 1);
      strokeSegments(painter, acrossLong(deck.footprint, PAVING / 2));
      painter.lineStyle(deck.line * 2, deck.palette.wallLit, 1);
      strokeSegments(painter, southFacingEdges(deck.footprint));
    },
  },
  /** A statue on a stone base one step up, a brass capture ring round it on the ground. */
  plinth: {
    side: (painter, deck) => {
      captureRing(painter, deck);
      courses(painter, deck, true);
    },
    top: (painter, deck) => {
      painter.lineStyle(deck.line, deck.palette.plank, 1);
      strokeSegments(painter, plankLines(deck.footprint, PAVING));
      statue(painter, deck);
    },
  },
};

/** Lines across a ramp at shares `at` of its length, from `low` to `high` across. */
function rungs(frame: RampFrame, at: readonly number[], low = -0.5, high = 0.5): Segment[] {
  return at.map((t) => ({ from: frame.onRamp(t, low), to: frame.onRamp(t, high) }));
}

/** Shares of a ramp's length, every `every` world units, its two ends left out. */
function every(frame: RampFrame, step: number): number[] {
  const count = Math.max(2, Math.round(frame.length / step));
  return Array.from({ length: count - 1 }, (_, k) => (k + 1) / count);
}

/** Treads at `at`: each a dark riser a little downhill of its lit nosing. */
function treads(painter: StructurePainter, ramp: TransitionFrame, at: readonly number[]): void {
  const { frame, line, palette } = ramp;
  const riser = STAIR_TREAD / frame.length / 3;
  painter.lineStyle(line * 2, palette.rampChevron, 1);
  strokeSegments(
    painter,
    rungs(
      frame,
      at.map((t) => t - riser),
    ),
  );
  painter.lineStyle(line * 1.5, palette.rampPanel, 1);
  strokeSegments(painter, rungs(frame, at));
}

export const TRANSITION_ART: Record<TransitionLook, TransitionArt> = {
  /** Today's ramp: panel lines across it, chevrons pointing up it. */
  ramp: (painter, { drawing, line, palette }) => {
    painter.lineStyle(line, palette.rampPanel, 1);
    for (const [from, to] of drawing.panels) {
      if (from !== undefined && to !== undefined) {
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
    }
    painter.lineStyle(line * 2, palette.rampChevron, 1);
    for (const chevron of drawing.chevrons) {
      strokeSegments(
        painter,
        chevron.slice(1).map((to, k) => ({ from: chevron[k] ?? to, to })),
      );
    }
  },
  stairs: (painter, ramp) => {
    treads(painter, ramp, every(ramp.frame, STAIR_TREAD));
  },
  /** Wide stairs broken by a flat landing halfway up. */
  "stairs-landing": (painter, ramp) => {
    const [from, to] = LANDING;
    treads(
      painter,
      ramp,
      every(ramp.frame, STAIR_TREAD).filter((t) => t < from || t > to),
    );
    painter.lineStyle(ramp.line, ramp.palette.rampChevron, 1);
    strokeSegments(painter, rungs(ramp.frame, LANDING));
  },
  /** Two rails up a dark gap, rungs between them. */
  ladder: (painter, { frame, line, palette }) => {
    painter.lineStyle(line * 1.5, palette.rampPanel, 1);
    strokeSegments(painter, rungs(frame, every(frame, LADDER_RUNG), -LADDER_RAIL, LADDER_RAIL));
    painter.lineStyle(line * 2.5, palette.rampChevron, 1);
    strokeSegments(painter, [
      { from: frame.onRamp(0, -LADDER_RAIL), to: frame.onRamp(1, -LADDER_RAIL) },
      { from: frame.onRamp(0, LADDER_RAIL), to: frame.onRamp(1, LADDER_RAIL) },
    ]);
  },
  /** Steps cut into rock or earth: uneven depths, each edge wandering across. */
  "rough-steps": (painter, { frame, line, palette }) => {
    const edges: Segment[] = [];
    let depth = 0;
    for (let k = 0; ; k += 1) {
      const tread = ROUGH_TREADS[k % ROUGH_TREADS.length] ?? STAIR_TREAD;
      depth += tread;
      if (depth >= frame.length - STAIR_TREAD / 2) {
        break;
      }
      const t = depth / frame.length;
      const wander = (ROUGH_WANDER * tread) / frame.length;
      const knots = [-0.5, -0.15, 0.2, 0.5].map((across, n) =>
        frame.onRamp(t + ((k + n) % 3 === 0 ? wander : (k + n) % 3 === 1 ? -wander : 0), across),
      );
      edges.push(...knots.slice(1).map((to, n) => ({ from: knots[n] ?? to, to })));
    }
    painter.lineStyle(line * 2, palette.rampChevron, 1);
    strokeSegments(painter, edges);
  },
};

/** A shape's bounding box: a switched deck's span. */
function boxOf(shape: RenderableShape): {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
} {
  if (shape.kind === "rect") {
    return { x0: shape.x, y0: shape.y, x1: shape.x + shape.width, y1: shape.y + shape.height };
  }
  const xs = shape.points.map(({ x }) => x);
  const ys = shape.points.map(({ y }) => y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A box `height` tall standing on the rect `x, y, width, depth`: its south face, then its top. */
function standingBox(
  painter: StructurePainter,
  [x, y, width, depth]: readonly [number, number, number, number],
  height: number,
  face: number,
  top: number,
): void {
  painter.fillStyle(face, 1);
  painter.fillRect(x, y + depth - height, width, height);
  painter.fillStyle(top, 1);
  painter.fillRect(x, y - height, width, depth);
}

/** How thick a raised drawbridge's slab is, and how far up it stands as a share of its span. */
const SLAB_THICKNESS = 16;
const SLAB_RISE = 0.45;
/** A cut bridge's halves: how much of the span each keeps, how far it hangs. */
const HALF_SHARE = 0.18;
const HALF_DROP = 22;
/** A crack's zig-zag: how many legs, how far each strays off its line, in world units. */
const CRACK_LEGS = 5;
const CRACK_STRAY = 5;

/**
 * Where a crack runs on a deck, the `k`th of them: a zig-zag across its
 * short side at a fixed share of its long one, so the same deck cracks the
 * same way every redraw and on every client.
 */
function crackPath(footprint: RenderableShape, k: number): readonly Vec2[] {
  const { x0, y0, x1, y1 } = boxOf(footprint);
  const alongX = longAxis(footprint) === "x";
  const at = (0.2 + 0.6 * ((k * 0.618) % 1)) % 1;
  return Array.from({ length: CRACK_LEGS + 1 }, (_, leg) => {
    const t = leg / CRACK_LEGS;
    // Uneven, but the same for the same crack: -1, -0.5, 0, 0.5 or 1 of its stray.
    const stray = leg === 0 ? 0 : CRACK_STRAY * (((k * 7 + leg * 13) % 5) / 2 - 1);
    return alongX
      ? { x: x0 + (x1 - x0) * at + stray, y: y0 + (y1 - y0) * t }
      : { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * at + stray };
  });
}

/**
 * A switched deck (#3068) as it is drawn down or giving way, in its top's
 * frame, over or instead of its look's art: they differ in shape, not
 * only in colour (docs/art/3068-switched.md).
 */
export const SWITCHED_DECK_ART = {
  /** A drawbridge raised: its iron-banded oak slab standing at its hinge, chains taut, the span open. */
  raised(painter: StructurePainter, deck: DeckFrame, hinge: "n" | "e" | "s" | "w"): void {
    const { x0, y0, x1, y1 } = boxOf(deck.footprint);
    const span = hinge === "n" || hinge === "s" ? y1 - y0 : x1 - x0;
    const rise = span * SLAB_RISE;
    const slab: Record<typeof hinge, readonly [number, number, number, number]> = {
      n: [x0, y0, x1 - x0, SLAB_THICKNESS],
      s: [x0, y1 - SLAB_THICKNESS, x1 - x0, SLAB_THICKNESS],
      w: [x0, y0, SLAB_THICKNESS, y1 - y0],
      e: [x1 - SLAB_THICKNESS, y0, SLAB_THICKNESS, y1 - y0],
    };
    const [x, y, width, depth] = slab[hinge];
    standingBox(painter, slab[hinge], rise, GATE_DOOR_LOOK.face, GATE_DOOR_LOOK.body);
    painter.lineStyle(deck.line * 2, GATE_DOOR_LOOK.band, 1);
    for (const share of [0.25, 0.75]) {
      painter.lineBetween(x, y + depth - rise * share, x + width, y + depth - rise * share);
    }
    painter.lineStyle(deck.line, SWITCHED_DECK_LOOK.chain, 1);
    painter.lineBetween(x, y - rise, x - width * 0.1, y);
    painter.lineBetween(x + width, y - rise, x + width * 1.1, y);
  },
  /** A rope bridge cut: each half hangs from its anchor, a frayed end on each. */
  cut(painter: StructurePainter, deck: DeckFrame): void {
    const { x0, y0, x1, y1 } = boxOf(deck.footprint);
    const alongX = longAxis(deck.footprint) === "x";
    const keep = (alongX ? x1 - x0 : y1 - y0) * HALF_SHARE;
    const halves: readonly (readonly [Vec2, Vec2, Vec2, Vec2])[] = alongX
      ? [
          [
            { x: x0, y: y0 },
            { x: x0 + keep, y: y0 + HALF_DROP },
            { x: x0 + keep, y: y1 + HALF_DROP },
            { x: x0, y: y1 },
          ],
          [
            { x: x1, y: y0 },
            { x: x1 - keep, y: y0 + HALF_DROP },
            { x: x1 - keep, y: y1 + HALF_DROP },
            { x: x1, y: y1 },
          ],
        ]
      : [
          [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y0 + keep },
            { x: x0, y: y0 + keep },
          ],
          [
            { x: x0, y: y1 - keep + HALF_DROP },
            { x: x1, y: y1 - keep + HALF_DROP },
            { x: x1, y: y1 + HALF_DROP },
            { x: x0, y: y1 + HALF_DROP },
          ],
        ];
    for (const [a, b, c, d] of halves) {
      painter.fillStyle(deck.palette.deckTop, 1);
      fillQuad(painter, a, b, c, d);
      painter.lineStyle(deck.line * 1.5, deck.palette.plank, 1);
      for (const t of [0.33, 0.66]) {
        const from = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const to = { x: d.x + (c.x - d.x) * t, y: d.y + (c.y - d.y) * t };
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
      painter.lineStyle(deck.line * 2, SWITCHED_DECK_LOOK.fray, 1);
      painter.lineBetween(b.x, b.y, c.x, c.y);
    }
  },
  /** A floor fallen in: a dark gap, broken stubs at its corners. */
  fallen(painter: StructurePainter, deck: DeckFrame): void {
    const { x0, y0, x1, y1 } = boxOf(deck.footprint);
    const stub = Math.min(x1 - x0, y1 - y0) * 0.25;
    painter.fillStyle(deck.palette.deckTop, 1);
    for (const [x, y, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x1, y1, -1, -1],
      [x0, y1, 1, -1],
    ] as const) {
      painter.fillTriangle(x, y, x + dx * stub, y, x, y + dy * stub);
    }
  },
  /**
   * A floor giving way: a crack for each body that has stepped on it, and
   * a chipped-out hole each once it is two thirds of the way down.
   */
  cracks(painter: StructurePainter, deck: DeckFrame, shown: number, afterCrossings: number): void {
    // Never more than the floor takes, whatever a peer claims (#3068).
    const cracks = Math.min(shown, afterCrossings);
    painter.lineStyle(deck.line * 2.2, SWITCHED_DECK_LOOK.crack, 1);
    for (let k = 0; k < cracks; k += 1) {
      const path = crackPath(deck.footprint, k);
      for (let leg = 0; leg + 1 < path.length; leg += 1) {
        const [from, to] = [path[leg], path[leg + 1]];
        if (from !== undefined && to !== undefined) {
          painter.lineBetween(from.x, from.y, to.x, to.y);
        }
      }
    }
    if (cracks * 3 < afterCrossings * 2) {
      return;
    }
    painter.fillStyle(SWITCHED_DECK_LOOK.hole, 1);
    for (let k = 0; k < cracks; k += 1) {
      const mid = crackPath(deck.footprint, k)[Math.floor(CRACK_LEGS / 2)];
      if (mid !== undefined) {
        const size = Math.max(4, deck.line * 6);
        painter.fillTriangle(mid.x - size, mid.y, mid.x + size, mid.y - size, mid.x, mid.y + size);
      }
    }
  },
};

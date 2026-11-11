import type { Vec2 } from "@vibewars/game-core";
import type { DeckLook, TransitionLook } from "@vibewars/game-maps/schema";

import { DECK_LOOK, TRANSITION_LOOK, type ArenaPalette } from "./arena-palette.js";
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
 * are: a tower, a wall-walk, a terrace, a bridge; stairs, a ladder.
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

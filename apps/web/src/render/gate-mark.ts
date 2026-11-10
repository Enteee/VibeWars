import type { ArenaPalette } from "./arena-palette.js";
import { GATE_DOOR_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import { southFacingEdges } from "./layer-surfaces.js";

/**
 * A gate's door (#3061, #3053), drawn through one lookup keyed by whether
 * it is open, as a switch's mark is (`switch-mark.ts`). They differ in
 * shape, not only in colour (docs/art/visual-style.md, "Door, open and
 * closed"): shut, an oak door at wall height in an iron frame, banded and
 * knobbed; open, its two leaves swung back flat against the walls either
 * side, over a dark sill where it closes.
 */

/** The few drawing calls a door needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface GatePainter {
  save(): void;
  restore(): void;
  translateCanvas(x: number, y: number): void;
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillShape(shape: RenderableShape): void;
  strokeShape(shape: RenderableShape): void;
  /** `shape` stacked from its base up to `height`: a box's front face. */
  fillColumn(shape: RenderableShape, height: number, colour: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** Where and how a door draws: on its layer, translated to its base. */
export interface GateFrame {
  /** How tall the shut door stands: a wall's height, or 0 on a flat map. */
  readonly height: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  /** Its door colours, as `doorPalette` gives them, lit for where it stands. */
  readonly palette: Pick<ArenaPalette, "wallTop" | "wallFace" | "wallStroke" | "wallLit">;
}

export type GateArt = (painter: GatePainter, wall: RenderableShape, frame: GateFrame) => void;

/** `palette` with its wall colours turned into a door's, for `litStructurePalette` to light. */
export function doorPalette(palette: ArenaPalette): ArenaPalette {
  return {
    ...palette,
    wallTop: GATE_DOOR_LOOK.body,
    wallFace: GATE_DOOR_LOOK.face,
    wallStroke: GATE_DOOR_LOOK.edge,
    wallLit: GATE_DOOR_LOOK.lit,
  };
}

/** How wide a door's lit top edge and its iron frame are, in CSS pixels. */
const LIT_WIDTH = 2;
const FRAME_WIDTH = 2;
/** How thick a swung leaf is, and how tall against the wall's height. */
const LEAF_THICKNESS = 3;
const LEAF_RISE = 0.9;
const SILL_ALPHA = 0.55;

/** `wall`'s long side, as a rect's two ends and its width across: `undefined` for a polygon. */
function doorAxis(
  wall: RenderableShape,
): { readonly along: "x" | "y"; readonly length: number; readonly across: number } | undefined {
  if (wall.kind !== "rect") {
    return undefined;
  }
  return wall.height >= wall.width
    ? { along: "y", length: wall.height, across: wall.width }
    : { along: "x", length: wall.width, across: wall.height };
}

/** Lines across `wall`'s top at `shares` of its length: the iron bands, or the planks' seams. */
function across(painter: GatePainter, wall: RenderableShape, shares: readonly number[]): void {
  if (wall.kind !== "rect") {
    return;
  }
  const { x, y, width, height } = wall;
  for (const share of shares) {
    if (height >= width) {
      painter.lineBetween(x, y + height * share, x + width, y + height * share);
    } else {
      painter.lineBetween(x + width * share, y, x + width * share, y + height);
    }
  }
}

/** The solid door: oak front and top, iron bands and frame, its lit edge, a brass knob. */
const shut: GateArt = (painter, wall, { height, line, palette }) => {
  if (height > 0) {
    painter.fillColumn(wall, height, palette.wallFace);
    // Its bands run on round the front face too.
    painter.lineStyle(line * FRAME_WIDTH, GATE_DOOR_LOOK.band, 1);
    for (const { from, to } of southFacingEdges(wall)) {
      for (const share of [0.25, 0.75]) {
        painter.lineBetween(from.x, from.y - height * share, to.x, to.y - height * share);
      }
    }
  }
  painter.save();
  painter.translateCanvas(0, -height);
  painter.fillStyle(palette.wallTop, 1);
  painter.fillShape(wall);
  painter.lineStyle(line, GATE_DOOR_LOOK.face, 1);
  across(painter, wall, [0.5]);
  painter.lineStyle(line * FRAME_WIDTH, GATE_DOOR_LOOK.band, 1);
  across(painter, wall, [0.12, 0.88]);
  painter.lineStyle(line * FRAME_WIDTH, palette.wallStroke, 1);
  painter.strokeShape(wall);
  if (height > 0) {
    painter.lineStyle(line * LIT_WIDTH, palette.wallLit, 1);
    for (const { from, to } of southFacingEdges(wall)) {
      painter.lineBetween(from.x, from.y, to.x, to.y);
    }
  }
  if (wall.kind === "rect") {
    painter.fillStyle(GATE_DOOR_LOOK.knob, 1);
    painter.fillShape(knobOf(wall));
  }
  painter.restore();
};

/** The knob, a small brass square beside the leaves' meeting line. */
function knobOf(wall: RenderableShape & { kind: "rect" }): RenderableShape {
  const size = Math.min(wall.width, wall.height) * 0.3;
  const { x, y } = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
  return wall.height >= wall.width
    ? { kind: "rect", x: x - size / 2, y: y + size * 0.4, width: size, height: size }
    : { kind: "rect", x: x + size * 0.4, y: y - size / 2, width: size, height: size };
}

/** Where the two leaves lie swung open: thin slabs flat along the walls beyond each end. */
export function openLeaves(wall: RenderableShape): readonly RenderableShape[] {
  const axis = doorAxis(wall);
  if (axis === undefined || wall.kind !== "rect") {
    return [];
  }
  const leaf = axis.length / 2;
  // On the camera's side of the wall line, so the leaves are seen.
  return axis.along === "y"
    ? [
        {
          kind: "rect",
          x: wall.x + wall.width,
          y: wall.y - leaf,
          width: LEAF_THICKNESS,
          height: leaf,
        },
        {
          kind: "rect",
          x: wall.x + wall.width,
          y: wall.y + wall.height,
          width: LEAF_THICKNESS,
          height: leaf,
        },
      ]
    : [
        {
          kind: "rect",
          x: wall.x - leaf,
          y: wall.y + wall.height,
          width: leaf,
          height: LEAF_THICKNESS,
        },
        {
          kind: "rect",
          x: wall.x + wall.width,
          y: wall.y + wall.height,
          width: leaf,
          height: LEAF_THICKNESS,
        },
      ];
}

/** Swung aside: a dark sill where it closes, iron jambs at its ends, and its leaves against the walls. */
const open: GateArt = (painter, wall, { height, line, palette }) => {
  painter.fillStyle(GATE_DOOR_LOOK.sill, SILL_ALPHA);
  painter.fillShape(wall);
  painter.lineStyle(line * FRAME_WIDTH, palette.wallStroke, 1);
  across(painter, wall, [0, 1]);
  const rise = height * LEAF_RISE;
  for (const leaf of openLeaves(wall)) {
    if (rise > 0) {
      painter.fillColumn(leaf, rise, palette.wallFace);
    }
    painter.save();
    painter.translateCanvas(0, -rise);
    painter.fillStyle(palette.wallTop, 1);
    painter.fillShape(leaf);
    painter.lineStyle(line, palette.wallStroke, 1);
    painter.strokeShape(leaf);
    painter.restore();
  }
};

/** A gate's look, by whether it stands open. */
export const GATE_ART: { readonly shut: GateArt; readonly open: GateArt } = { shut, open };

/** The few drawing calls a pressure plate needs, in Phaser `Graphics` terms. */
export interface PlatePainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
}

/** A plate's stone disc, in world units, and how far it sinks held. */
const PLATE_WIDTH = 30;
const PLATE_DEPTH = 12;
const PLATE_LIFT = 3;

/**
 * A gate's pressure plate (#3053): a stone disc with a front face, standing
 * proud; held, it sinks flush, its face gone, and its ring turns brass.
 */
export function paintPlate(
  painter: PlatePainter,
  at: { x: number; y: number },
  held: boolean,
  line: number,
): void {
  const { x, y } = at;
  if (!held) {
    painter.fillStyle(GATE_DOOR_LOOK.plateFace, 1);
    painter.fillEllipse(x, y, PLATE_WIDTH, PLATE_DEPTH);
  }
  const top = held ? y : y - PLATE_LIFT;
  painter.fillStyle(held ? GATE_DOOR_LOOK.plateHeld : GATE_DOOR_LOOK.plate, 1);
  painter.fillEllipse(x, top, PLATE_WIDTH, PLATE_DEPTH);
  painter.lineStyle(line, GATE_DOOR_LOOK.plateOutline, 1);
  painter.strokeEllipse(x, top, PLATE_WIDTH, PLATE_DEPTH);
  painter.lineStyle(
    line * (held ? 2 : 1),
    held ? GATE_DOOR_LOOK.knob : GATE_DOOR_LOOK.plateFace,
    1,
  );
  painter.strokeEllipse(x, top, PLATE_WIDTH * 0.55, PLATE_DEPTH * 0.55);
}

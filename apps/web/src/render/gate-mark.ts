import type { ArenaPalette } from "./arena-palette.js";
import { GATE_DOOR_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import { shapeOutline, southFacingEdges } from "./layer-surfaces.js";

/**
 * A gate's door (#3061), drawn through one lookup keyed by whether it is
 * open, as a switch's mark is (`switch-mark.ts`). They differ in shape,
 * not only in colour (docs/art/visual-style.md, "Door, open and closed"):
 * shut, a solid amber box at wall height between its wall's stubs; open,
 * no body, only a faint dashed ghost of it on the ground, where it closes.
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

/** How wide a door's lit top edge and its knob line are, in CSS pixels. */
const LIT_WIDTH = 2;
const KNOB_WIDTH = 3;
/** The ghost's dashes and gaps, in world units, as the manifest's door. */
const DASH = 5;
const GAP = 4;
const GHOST_FILL_ALPHA = 0.18;
const GHOST_STROKE_ALPHA = 0.9;

/** The solid door: front face, amber top, its lit edge, and a knob line across a rect. */
const shut: GateArt = (painter, wall, { height, line, palette }) => {
  if (height > 0) {
    painter.fillColumn(wall, height, palette.wallFace);
  }
  painter.save();
  painter.translateCanvas(0, -height);
  painter.fillStyle(palette.wallTop, 1);
  painter.fillShape(wall);
  painter.lineStyle(line, palette.wallStroke, 1);
  painter.strokeShape(wall);
  if (height > 0) {
    painter.lineStyle(line * LIT_WIDTH, palette.wallLit, 1);
    for (const { from, to } of southFacingEdges(wall)) {
      painter.lineBetween(from.x, from.y, to.x, to.y);
    }
  }
  if (wall.kind === "rect") {
    painter.lineStyle(line * KNOB_WIDTH, GATE_DOOR_LOOK.knob, 1);
    const { x, y, width, height: depth } = wall;
    if (depth >= width) {
      painter.lineBetween(x + width / 4, y + depth / 2, x + (width * 3) / 4, y + depth / 2);
    } else {
      painter.lineBetween(x + width / 2, y + depth / 4, x + width / 2, y + (depth * 3) / 4);
    }
  }
  painter.restore();
};

/** No body: a faint amber fill and a dashed outline on the ground, where it closes. */
const open: GateArt = (painter, wall, { line }) => {
  painter.fillStyle(GATE_DOOR_LOOK.body, GHOST_FILL_ALPHA);
  painter.fillShape(wall);
  painter.lineStyle(line * 2, GATE_DOOR_LOOK.body, GHOST_STROKE_ALPHA);
  const outline = shapeOutline(wall);
  outline.forEach((from, k) => {
    const to = outline[(k + 1) % outline.length] ?? from;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let at = 0; at < length; at += DASH + GAP) {
      const end = Math.min(at + DASH, length);
      painter.lineBetween(
        from.x + ((to.x - from.x) * at) / length,
        from.y + ((to.y - from.y) * at) / length,
        from.x + ((to.x - from.x) * end) / length,
        from.y + ((to.y - from.y) * end) / length,
      );
    }
  });
};

/** A gate's look, by whether it stands open. */
export const GATE_ART: { readonly shut: GateArt; readonly open: GateArt } = { shut, open };

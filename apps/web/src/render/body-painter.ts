import type { AttackFrame } from "./attack-clock.js";
import {
  BODY_EDGE,
  offhandMarkLayout,
  teamColour,
  type RenderableActor,
} from "./arena-snapshot.js";
import { capeMotionShape, type CapeBand, type CapeMotion, type CapeShape } from "./cape-motion.js";
import type { CapeLook, EmblemPart } from "./cape-shape.js";
import { weaponMarkLayout } from "./weapon-mark.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * A standing body and the marks on it, drawn once for every surface that
 * shows one (#1250): the arena through Phaser, the menu's character
 * figure through a 2D canvas. Both go through `paintStandingBody`, so the
 * menu cannot drift from what a match draws.
 */

/** `ink`: the self rim, and the core of every mark. */
export const SELF_RIM = 0xd7dee8;
export const BODY_EDGE_WIDTH = 1.5;

/**
 * The few drawing calls a body needs, in Phaser `Graphics` terms: colours
 * are 0xRRGGBB, angles radians, a path is begun, traced and then stroked.
 */
export interface Painter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void;
  strokePath(): void;
  /** Fill one closed polygon, on its own: it does not touch the current path. */
  fillPoints(points: readonly Point[]): void;
}

/** What a standing body shows. */
export interface StandingBody {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly facing: number;
  readonly team: RenderableActor["team"];
  readonly weaponId: string | undefined;
  readonly offhandId: RenderableActor["offhandId"];
  /** The weapon mark's pose: `REST_FRAME` unless it is swinging. */
  readonly frame: AttackFrame;
  /** The guild cape behind it (#1422) and how it moves (#1699); `undefined` wears none. */
  readonly cape: WornCape | undefined;
}

/** A cape on a body: its look and its motion, which the caller steps. */
export interface WornCape {
  readonly look: CapeLook;
  readonly motion: CapeMotion;
}

/** The cape's outline, as wide as the study draws it, and its trim's. */
export const CAPE_EDGE_WIDTH = 1.6;
export const CAPE_TRIM_WIDTH = 1.4;
/** The band on the rim and its casing, as the motion study draws them (#1699). */
export const CAPE_BAND_WIDTH = 1.5;
export const CAPE_BAND_CASING = 3;

/**
 * The cape, the disc, its edge, the self rim on your own, then the
 * off-hand and the weapon mark on `marks` (the order #275 gives). The arena keeps marks on
 * a layer of their own, over the body glyphs (#1037); one painter for both
 * draws no glyph between them.
 */
export function paintStandingBody(painter: Painter, body: StandingBody, marks = painter): void {
  paintBodyDisc(painter, body);
  paintBodyMarks(marks, body);
}

/**
 * The cape, the disc, its edge, the self rim on your own, then the cape's
 * band on the rim: what lies under the body glyph.
 */
export function paintBodyDisc(painter: Painter, body: StandingBody): void {
  const { x, y, r, cape } = body;
  const shape =
    cape === undefined ? undefined : capeMotionShape(cape.motion, body, cape.look.emblem);
  if (cape !== undefined && shape !== undefined) {
    paintCape(painter, shape, cape.look);
  }
  painter.fillStyle(teamColour(body.team), 1);
  painter.fillCircle(x, y, r);
  // Centred half its width in, so the edge stays inside the collision
  // radius (#166) and only touches the self rim inside it.
  painter.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
  painter.strokeCircle(x, y, r - BODY_EDGE_WIDTH / 2);

  if (body.team === "self") {
    painter.lineStyle(2, SELF_RIM, 1);
    painter.strokeCircle(x, y, r - 2);
  }
  if (cape !== undefined && shape !== undefined) {
    paintCapeBand(painter, shape.band, cape.look);
  }
}

/**
 * The cape (#1422, #1699) under the disc, which covers its root: the cloth, its
 * `edge` outline, the trim along the hem, then the emblem in the trim colour.
 * Folded, all of it hides under the disc but the emblem's edge.
 */
function paintCape(painter: Painter, shape: CapeShape, cape: CapeLook): void {
  painter.fillStyle(cape.main, 1);
  painter.fillPoints(shape.cloth);
  painter.lineStyle(CAPE_EDGE_WIDTH, BODY_EDGE, 1);
  tracePoints(painter, shape.cloth, true);
  painter.lineStyle(CAPE_TRIM_WIDTH, cape.trim, 1);
  tracePoints(painter, shape.trim, false);
  paintEmblem(painter, shape.emblem, cape.trim);
}

/** The band on the rim, over the disc's edge: an `edge` casing under the cape's colour. */
function paintCapeBand(painter: Painter, band: CapeBand, cape: CapeLook): void {
  for (const [width, colour] of [
    [CAPE_BAND_CASING, BODY_EDGE],
    [CAPE_BAND_WIDTH, cape.main],
  ] as const) {
    painter.lineStyle(width, colour, 1);
    painter.beginPath();
    painter.arc(band.x, band.y, band.radius, band.from, band.to);
    painter.strokePath();
  }
}

/** An emblem's parts in `colour`: on a cape, and on the designer's buttons (#1422). */
export function paintEmblem(painter: Painter, parts: readonly EmblemPart[], colour: number): void {
  painter.fillStyle(colour, 1);
  for (const part of parts) {
    if (part.kind === "fill") {
      painter.fillPoints(part.points);
    } else {
      painter.lineStyle(part.width, colour, 1);
      tracePoints(painter, part.points, true);
    }
  }
}

/** Stroke one line through `points`, back to the first if `close`. */
function tracePoints(painter: Painter, points: readonly Point[], close: boolean): void {
  const [first, ...rest] = points;
  if (first === undefined) {
    return;
  }
  painter.beginPath();
  painter.moveTo(first.x, first.y);
  for (const point of rest) {
    painter.lineTo(point.x, point.y);
  }
  if (close) {
    painter.lineTo(first.x, first.y);
  }
  painter.strokePath();
}

/** The off-hand, then the weapon mark: what lies over the body glyph. */
export function paintBodyMarks(painter: Painter, body: StandingBody): void {
  paintOffhandMark(painter, body);
  paintWeaponMark(painter, body, body.weaponId, body.frame);
}

/**
 * The off-hand mark (#276): an `edge` casing under an `ink` core, like
 * the weapon mark. The shield is one arc path stroked twice, the focus
 * one circle per colour.
 */
function paintOffhandMark(painter: Painter, body: StandingBody): void {
  const mark = offhandMarkLayout(body.x, body.y, body.r, body.facing, body.offhandId);
  if (mark === undefined) {
    return;
  }
  for (const [width, colour] of [
    [mark.casing, BODY_EDGE],
    [mark.core, SELF_RIM],
  ] as const) {
    painter.lineStyle(width, colour, 1);
    if (mark.kind === "arc") {
      painter.beginPath();
      painter.arc(mark.x, mark.y, mark.radius, mark.from, mark.to);
      painter.strokePath();
    } else {
      painter.strokeCircle(mark.x, mark.y, mark.radius);
    }
  }
}

/**
 * The weapon mark (#188, #418): a 4 px `edge` casing, then a 2 px `ink` core,
 * so the line reads on either team's colour. The casing also outlines the
 * filled shapes, which the core then fills. Bow strings are one extra
 * pass, thinner: a 3 px casing under a 1 px core. `at` is the body it is
 * held by, or where a knocked-down body dropped it (#545).
 */
export function paintWeaponMark(
  painter: Painter,
  at: { readonly x: number; readonly y: number; readonly r: number; readonly facing: number },
  weaponId: string | undefined,
  frame: AttackFrame,
): void {
  const { strokes, fills, strings, alpha } = weaponMarkLayout(
    at.x,
    at.y,
    at.r,
    at.facing,
    weaponId,
    frame,
  );
  if ((strokes.length === 0 && fills.length === 0) || alpha <= 0) {
    return;
  }
  const trace = (points: readonly Point[], close: boolean) => {
    const [first, ...rest] = points;
    if (first === undefined) {
      return;
    }
    painter.moveTo(first.x, first.y);
    for (const point of rest) {
      painter.lineTo(point.x, point.y);
    }
    if (close) {
      painter.lineTo(first.x, first.y);
    }
  };

  painter.lineStyle(4, BODY_EDGE, alpha);
  painter.beginPath();
  for (const line of strokes) {
    trace(line, false);
  }
  for (const shape of fills) {
    trace(shape, true);
  }
  painter.strokePath();

  painter.lineStyle(2, SELF_RIM, alpha);
  painter.beginPath();
  for (const line of strokes) {
    trace(line, false);
  }
  painter.strokePath();
  painter.fillStyle(SELF_RIM, alpha);
  for (const shape of fills) {
    painter.fillPoints(shape);
  }

  for (const [width, colour] of strings.length === 0
    ? []
    : ([
        [3, BODY_EDGE],
        [1, SELF_RIM],
      ] as const)) {
    painter.lineStyle(width, colour, alpha);
    painter.beginPath();
    for (const line of strings) {
      trace(line, false);
    }
    painter.strokePath();
  }
}

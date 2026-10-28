import type { AttackFrame } from "./attack-clock.js";
import {
  BODY_EDGE,
  offhandMarkLayout,
  teamColour,
  type RenderableActor,
} from "./arena-snapshot.js";
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
}

/**
 * The disc, its edge, the self rim on your own, then the off-hand and the
 * weapon mark on `marks` (the order #275 gives). The arena keeps marks on
 * a layer of their own, over the body glyphs (#1037); one painter for both
 * draws no glyph between them.
 */
export function paintStandingBody(painter: Painter, body: StandingBody, marks = painter): void {
  paintBodyDisc(painter, body);
  paintBodyMarks(marks, body);
}

/** The disc, its edge and the self rim on your own: what lies under the body glyph. */
export function paintBodyDisc(painter: Painter, body: StandingBody): void {
  const { x, y, r } = body;
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

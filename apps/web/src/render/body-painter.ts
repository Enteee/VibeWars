import type { OffhandId } from "@vibewars/game-core";

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
 * A standing body and the marks it holds, drawn once for every surface
 * (#1250): the arena paints it with Phaser, the menu's character figure
 * with a 2D canvas, so the menu can never draw you differently from the
 * match. No Phaser here: a painter is the few calls the drawing makes.
 */

/** Marks the actor you control, inside its circle, in any team colour. */
export const SELF_RIM = 0xd7dee8;
export const BODY_EDGE_WIDTH = 1.5;

/** The drawing calls a body needs, in Phaser `Graphics`' terms: colours are 0xRRGGBB. */
export interface Painter {
  lineStyle(width: number, colour: number, alpha: number): void;
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, r: number): void;
  strokeCircle(x: number, y: number, r: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, from: number, to: number): void;
  strokePath(): void;
  /** Fill the closed polygon through `points`, on its own path. */
  fillPoints(points: readonly Point[]): void;
}

/** Where a body stands and what it holds. */
export interface StandingBody {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly facing: number;
  readonly team: RenderableActor["team"];
  readonly weaponId: string | undefined;
  readonly offhandId: OffhandId | undefined;
  /** The weapon's pose: `REST_FRAME` when it is not attacking. */
  readonly frame: AttackFrame;
}

/**
 * A living, standing body (#166, #275): the team-colour disc, its edge,
 * the self rim on your own, then the off-hand and the weapon over it on
 * `marks`, in that order.
 */
export function paintStandingBody(painter: Painter, body: StandingBody, marks = painter): void {
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

  paintOffhandMark(marks, body);
  paintWeaponMark(marks, body, body.weaponId, body.frame);
}

/**
 * The off-hand mark (#276): an `edge` casing under an `ink` core, like
 * the weapon mark. The shield is one arc path stroked twice, the focus
 * one circle per colour.
 */
export function paintOffhandMark(
  painter: Painter,
  body: Pick<StandingBody, "x" | "y" | "r" | "facing" | "offhandId">,
): void {
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
 * pass, thinner: a 3 px casing under a 1 px core.
 */
export function paintWeaponMark(
  painter: Painter,
  at: Pick<StandingBody, "x" | "y" | "r" | "facing">,
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

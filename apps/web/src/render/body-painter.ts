import type { OffhandId } from "@vibewars/game-core";

import {
  BODY_EDGE,
  offhandMarkLayout,
  teamColour,
  type RenderableActor,
} from "./arena-snapshot.js";
import type { AttackFrame } from "./attack-clock.js";
import { weaponMarkLayout } from "./weapon-mark.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * How a standing player is drawn (#1250): one drawing for the arena and the
 * menu's character figure, so the menu can never show a body the match
 * does not. No Phaser here: the arena hands in its `Graphics`, the menu a
 * 2D canvas, each behind `BodyPainter`.
 */

/** Marks the actor you control, inside its circle, in any team colour. */
export const SELF_RIM = 0xd7dee8;
export const BODY_EDGE_WIDTH = 1.5;

/** The few drawing calls a body takes, as Phaser's `Graphics` names them. */
export interface BodyPainter {
  lineStyle(width: number, colour: number, alpha: number): void;
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, r: number): void;
  strokeCircle(x: number, y: number, r: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  /** Clockwise, on screen, from `from` to `to`. */
  arc(x: number, y: number, r: number, from: number, to: number): void;
  strokePath(): void;
  /** A closed shape along `points`, filled. */
  fillPolygon(points: readonly Point[]): void;
}

/** The body on one layer; its off-hand and weapon over it, on another (#1037). */
export interface BodyLayers {
  readonly body: BodyPainter;
  readonly marks: BodyPainter;
}

/** A living, standing player, as drawn. */
export interface StandingBody {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly facing: number;
  readonly team: RenderableActor["team"];
  readonly weaponId: string | undefined;
  readonly offhandId: OffhandId | undefined;
  /** Where its weapon is in a swing: `REST_FRAME` when not attacking. */
  readonly frame: AttackFrame;
}

/**
 * A standing body (#166, #275): the team-colour disc, its edge, the self
 * rim on your own, then the off-hand and the weapon mark.
 */
export function paintStandingBody(layers: BodyLayers, body: StandingBody): void {
  const { x, y, r } = body;
  const g = layers.body;
  g.fillStyle(teamColour(body.team), 1);
  g.fillCircle(x, y, r);
  // Centred half its width in, so the edge stays inside the collision
  // radius (#166) and only touches the self rim inside it.
  g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
  g.strokeCircle(x, y, r - BODY_EDGE_WIDTH / 2);

  if (body.team === "self") {
    g.lineStyle(2, SELF_RIM, 1);
    g.strokeCircle(x, y, r - 2);
  }

  // Off-hand, then weapon mark, then target ring: the order #275 gives.
  paintOffhandMark(layers.marks, body);
  paintWeaponMark(layers.marks, body, body.weaponId, body.frame);
}

/**
 * The off-hand mark (#276): an `edge` casing under an `ink` core, like
 * the weapon mark. The shield is one arc path stroked twice, the focus
 * one circle per colour.
 */
function paintOffhandMark(g: BodyPainter, body: StandingBody): void {
  const mark = offhandMarkLayout(body.x, body.y, body.r, body.facing, body.offhandId);
  if (mark === undefined) {
    return;
  }
  for (const [width, colour] of [
    [mark.casing, BODY_EDGE],
    [mark.core, SELF_RIM],
  ] as const) {
    g.lineStyle(width, colour, 1);
    if (mark.kind === "arc") {
      g.beginPath();
      g.arc(mark.x, mark.y, mark.radius, mark.from, mark.to);
      g.strokePath();
    } else {
      g.strokeCircle(mark.x, mark.y, mark.radius);
    }
  }
}

/**
 * The weapon mark (#188, #418) of a body at `at`: a 4 px `edge` casing,
 * then a 2 px `ink` core, so the line reads on either team's colour. The
 * casing also outlines the filled shapes, which the core then fills. Bow
 * strings are one extra pass, thinner: a 3 px casing under a 1 px core.
 */
export function paintWeaponMark(
  g: BodyPainter,
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
    g.moveTo(first.x, first.y);
    for (const point of rest) {
      g.lineTo(point.x, point.y);
    }
    if (close) {
      g.lineTo(first.x, first.y);
    }
  };

  g.lineStyle(4, BODY_EDGE, alpha);
  g.beginPath();
  for (const line of strokes) {
    trace(line, false);
  }
  for (const shape of fills) {
    trace(shape, true);
  }
  g.strokePath();

  g.lineStyle(2, SELF_RIM, alpha);
  g.beginPath();
  for (const line of strokes) {
    trace(line, false);
  }
  g.strokePath();
  g.fillStyle(SELF_RIM, alpha);
  for (const shape of fills) {
    g.fillPolygon(shape);
  }

  for (const [width, colour] of strings.length === 0
    ? []
    : ([
        [3, BODY_EDGE],
        [1, SELF_RIM],
      ] as const)) {
    g.lineStyle(width, colour, alpha);
    g.beginPath();
    for (const line of strings) {
      trace(line, false);
    }
    g.strokePath();
  }
}

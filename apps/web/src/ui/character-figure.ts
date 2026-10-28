import {
  loadoutSpec,
  MINIMAL_GW_INSPIRED_PVP_V1,
  resolveJoinLoadout,
  resolveLoadout,
  type OffhandId,
} from "@vibewars/game-core";

import { REST_FRAME } from "../render/attack-clock.js";
import { paintStandingBody, type Painter, type StandingBody } from "../render/body-painter.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { cssColour, professionLabel } from "./character-preview.js";

/**
 * The character figure (#1250): the body the arena draws for you,
 * weapon and off-hand included, on a small canvas. It goes through the
 * arena's own `paintStandingBody`, so the menu cannot draw a character
 * differently from the match.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RADIUS = RULES.collision.playerRadius;
/** Past the body's edge each side: the weapon mark reaches r + 7.5, its casing 2 px more. */
const MARGIN = 10;
/** The figure's side in CSS pixels. */
export const FIGURE_SIZE = (RADIUS + MARGIN) * 2;

/** What a character holds as it enters a match. */
export interface CharacterAppearance {
  readonly weaponId: string;
  readonly offhandId: OffhandId | undefined;
}

/**
 * The weapon and off-hand `character` enters a match holding: the host's
 * own resolution of the build it claims (`match-host.ts` puts them on the
 * wire from `loadoutSpec`). A build the host refuses plays a starter
 * build; the figure shows the first, as the host's pick is random.
 */
export function characterAppearance(character: StoredCharacter): CharacterAppearance {
  const { loadout } = resolveJoinLoadout(toPlayerBuild(character), RULES.attributes, () => 0);
  const { equipment } = loadoutSpec(
    resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
        secondaryProfession: loadout.secondaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      RULES.combat,
    ),
  );
  return { weaponId: equipment.mainHand.weapon.id, offhandId: equipment.offhandId };
}

/** Your body, standing still in the middle of the figure, facing right as the reference sheet draws it. */
export function figureBody(appearance: CharacterAppearance): StandingBody {
  return {
    x: FIGURE_SIZE / 2,
    y: FIGURE_SIZE / 2,
    r: RADIUS,
    facing: 0,
    team: "self",
    weaponId: appearance.weaponId,
    offhandId: appearance.offhandId,
    frame: REST_FRAME,
  };
}

/** The calls of a 2D context the painter makes. */
export type FigureContext = Pick<
  CanvasRenderingContext2D,
  | "lineWidth"
  | "strokeStyle"
  | "fillStyle"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "closePath"
  | "stroke"
  | "fill"
>;

function rgba(colour: number, alpha: number): string {
  return alpha >= 1
    ? cssColour(colour)
    : `${cssColour(colour)}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`;
}

/** `context` as a body painter: Phaser's calls in Canvas 2D terms. */
export function canvasPainter(context: FigureContext): Painter {
  return {
    lineStyle: (width, colour, alpha) => {
      context.lineWidth = width;
      context.strokeStyle = rgba(colour, alpha);
    },
    fillStyle: (colour, alpha) => {
      context.fillStyle = rgba(colour, alpha);
    },
    fillCircle: (x, y, r) => {
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    },
    strokeCircle: (x, y, r) => {
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.stroke();
    },
    beginPath: () => {
      context.beginPath();
    },
    moveTo: (x, y) => {
      context.moveTo(x, y);
    },
    lineTo: (x, y) => {
      context.lineTo(x, y);
    },
    arc: (x, y, r, from, to) => {
      context.arc(x, y, r, from, to);
    },
    strokePath: () => {
      context.stroke();
    },
    fillPoints: (points) => {
      const [first, ...rest] = points;
      if (first === undefined) {
        return;
      }
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fill();
    },
  };
}

/** Paint `appearance`'s figure with `painter`. */
export function paintFigure(painter: Painter, appearance: CharacterAppearance): void {
  paintStandingBody(painter, figureBody(appearance));
}

/**
 * The figure for `character`, sharp at the screen's pixel ratio. A
 * browser that gives no 2D context leaves the box empty.
 */
export function createCharacterFigure(character: StoredCharacter): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "character-figure";
  canvas.setAttribute("aria-hidden", "true");
  canvas.title = professionLabel(character.primaryProfession, character.secondaryProfession);
  canvas.style.width = `${String(FIGURE_SIZE)}px`;
  canvas.style.height = `${String(FIGURE_SIZE)}px`;
  const ratio = window.devicePixelRatio;
  canvas.width = Math.round(FIGURE_SIZE * ratio);
  canvas.height = Math.round(FIGURE_SIZE * ratio);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintFigure(canvasPainter(context), characterAppearance(character));
  }
  return canvas;
}

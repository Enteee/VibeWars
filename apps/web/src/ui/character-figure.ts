import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  loadoutSpec,
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
 * The character figure (#1250): a character in a list drawn exactly as a
 * match draws your own standing body, with the weapon and off-hand it
 * enters holding, through the arena's own `paintStandingBody`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
/** The arena's body radius: the figure is drawn at its 1:1 scale. */
const BODY_RADIUS = RULES.collision.playerRadius;
/** Room round the body for its marks: the weapon reaches r + 7.5, the off-hand r + 7. */
const MARK_ROOM = 8;
/** Facing right, as the player-mark reference sheet draws a body. */
const FIGURE_FACING = 0;

/** What a character holds in a match: `weaponId` and `offhandId` as the host sends them. */
export interface CharacterAppearance {
  readonly weaponId: string;
  readonly offhandId: OffhandId | undefined;
}

/**
 * The weapon and off-hand `character` enters a match with: its claimed
 * build through the host's own checks, set 1 in hand. A build the host
 * would refuse plays a starter build; the figure shows the first one,
 * where the host picks one at random.
 */
export function characterAppearance(character: StoredCharacter): CharacterAppearance {
  const { loadout } = resolveJoinLoadout(toPlayerBuild(character), RULES.attributes, () => 0);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULES.combat,
  );
  const { equipment } = loadoutSpec(resolved);
  return { weaponId: equipment.mainHand.weapon.id, offhandId: equipment.offhandId };
}

/** The figure's body: your own, standing still, centred in a box `MARK_ROOM` wider each side. */
export function figureBody(appearance: CharacterAppearance): StandingBody {
  const centre = BODY_RADIUS + MARK_ROOM;
  return {
    x: centre,
    y: centre,
    r: BODY_RADIUS,
    facing: FIGURE_FACING,
    team: "self",
    weaponId: appearance.weaponId,
    offhandId: appearance.offhandId,
    frame: REST_FRAME,
  };
}

/** A canvas 2D context as the painter a body is drawn through. */
export function canvasPainter(context: CanvasRenderingContext2D): Painter {
  const rgba = (colour: number, alpha: number): string =>
    alpha >= 1
      ? cssColour(colour)
      : `${cssColour(colour)}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`;
  const circle = (x: number, y: number, radius: number): void => {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
  };
  return {
    fillStyle: (colour, alpha) => {
      context.fillStyle = rgba(colour, alpha);
    },
    lineStyle: (width, colour, alpha) => {
      context.lineWidth = width;
      context.strokeStyle = rgba(colour, alpha);
    },
    fillCircle: (x, y, radius) => {
      circle(x, y, radius);
      context.fill();
    },
    strokeCircle: (x, y, radius) => {
      circle(x, y, radius);
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
    arc: (x, y, radius, from, to) => {
      context.arc(x, y, radius, from, to);
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

/**
 * The figure for `character`, as a canvas sharp at the device's pixel
 * ratio. A browser that gives no 2D context leaves the box empty.
 */
export function createCharacterFigure(character: StoredCharacter): HTMLCanvasElement {
  const size = (BODY_RADIUS + MARK_ROOM) * 2;
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.className = "character-figure";
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  canvas.style.width = `${String(size)}px`;
  canvas.style.height = `${String(size)}px`;
  const label = professionLabel(character.primaryProfession, character.secondaryProfession);
  canvas.title = label;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.scale(ratio, ratio);
    paintStandingBody(canvasPainter(context), figureBody(characterAppearance(character)));
  }
  return canvas;
}

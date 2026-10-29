import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  loadoutSpec,
  resolveJoinLoadout,
  resolveLoadout,
  type OffhandId,
  type ProfessionId,
} from "@vibewars/game-core";

import { BODY_EDGE, BODY_GLYPH_ALPHA, BODY_GLYPH_SIZE } from "../render/arena-snapshot.js";
import { REST_FRAME } from "../render/attack-clock.js";
import {
  paintBodyDisc,
  paintBodyMarks,
  type Painter,
  type StandingBody,
} from "../render/body-painter.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import { cssColour, professionLabel } from "./character-preview.js";
import { professionIcon } from "./icons.js";

/**
 * The character figure (#1250): a character in a list drawn exactly as a
 * match draws your own standing body, with the weapon and off-hand it
 * enters holding, through the arena's own `paintStandingBody`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
/** The arena's body radius: the figure is drawn at its 1:1 scale. */
const BODY_RADIUS = RULES.collision.playerRadius;
/** Room round the body for its marks: the weapon reaches r + 7.5, its 4 px casing 2 px more. */
const MARK_ROOM = 10;
/** Facing right, as the player-mark reference sheet draws a body. */
const FIGURE_FACING = 0;

/** What a character holds in a match: `weaponId` and `offhandId` as the host sends them. */
export interface CharacterAppearance {
  /** `undefined` for an invalid build, which the host refuses: what it plays is not known here. */
  readonly weaponId: string | undefined;
  readonly offhandId: OffhandId | undefined;
}

/** An invalid build's: the bare body, no marks. */
const UNKNOWN: CharacterAppearance = { weaponId: undefined, offhandId: undefined };

/**
 * The weapon and off-hand `character` enters a match with: its claimed
 * build through the host's own checks, set 1 in hand. An empty bar is a
 * build like any other (#1290). An invalid build, which the host refuses
 * by the test the lobby uses too (`main.ts`), plays a starter build the
 * host picks at random (#852): unknowable here, so the figure is the bare
 * body. Not an error.
 */
export function characterAppearance(character: TeamCharacter): CharacterAppearance {
  const { loadout, refused } = resolveJoinLoadout(
    toPlayerBuild(character),
    RULES.attributes,
    Math.random,
  );
  if (refused !== undefined) {
    return UNKNOWN;
  }
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

/** The figure's body through `painter`: its disc, `paintGlyph` over it, then its marks. */
export function paintFigure(painter: Painter, body: StandingBody, paintGlyph: () => void): void {
  paintBodyDisc(painter, body);
  paintGlyph();
  paintBodyMarks(painter, body);
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
 * The primary profession's glyph inside the body (#1037), as the arena
 * draws it: `glyph` filled with the body's edge colour, its alpha kept,
 * as Phaser's fill tint does, at 60 %, centred and `BODY_GLYPH_SIZE` wide.
 */
function paintBodyGlyph(
  context: CanvasRenderingContext2D,
  body: StandingBody,
  glyph: HTMLImageElement,
  ratio: number,
): void {
  const pixels = Math.round(BODY_GLYPH_SIZE * ratio);
  const tinted = document.createElement("canvas");
  tinted.width = pixels;
  tinted.height = pixels;
  const tint = tinted.getContext("2d");
  if (tint === null) {
    return;
  }
  tint.drawImage(glyph, 0, 0, pixels, pixels);
  tint.globalCompositeOperation = "source-in";
  tint.fillStyle = cssColour(BODY_EDGE);
  tint.fillRect(0, 0, pixels, pixels);
  context.save();
  context.globalAlpha = BODY_GLYPH_ALPHA;
  const half = BODY_GLYPH_SIZE / 2;
  context.drawImage(tinted, body.x - half, body.y - half, BODY_GLYPH_SIZE, BODY_GLYPH_SIZE);
  context.restore();
}

/**
 * The figure for `character`, as a canvas sharp at the device's pixel
 * ratio: drawn at once without its glyph, then again with it once the
 * profession icon has loaded, with `data-glyph` naming it, and
 * `data-weapon-id` naming what it holds. An invalid build keeps its
 * glyph: its profession is known. A browser that gives no 2D context
 * leaves the box empty.
 */
export function createCharacterFigure(character: TeamCharacter): HTMLCanvasElement {
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
  if (context === null) {
    return canvas;
  }
  context.scale(ratio, ratio);
  // Phaser joins its strokes round; a canvas's default miter would
  // spike the weapon casing's points past the mark.
  context.lineJoin = "round";
  const appearance = characterAppearance(character);
  if (appearance.weaponId !== undefined) {
    canvas.dataset.weaponId = appearance.weaponId;
  }
  const body = figureBody(appearance);
  const painter = canvasPainter(context);
  const paint = (glyph: HTMLImageElement | undefined): void => {
    context.clearRect(0, 0, size, size);
    paintFigure(painter, body, () => {
      if (glyph !== undefined) {
        paintBodyGlyph(context, body, glyph, ratio);
      }
    });
  };
  paint(undefined);
  void loadGlyph(character.primaryProfession).then((glyph) => {
    if (glyph !== undefined) {
      paint(glyph);
      canvas.dataset.glyph = character.primaryProfession;
    }
  });
  return canvas;
}

/** The profession's icon, decoded; `undefined` if it cannot load, and the figure stays bare. */
async function loadGlyph(profession: ProfessionId): Promise<HTMLImageElement | undefined> {
  const image = new Image();
  image.src = professionIcon(profession);
  try {
    await image.decode();
    return image;
  } catch {
    return undefined;
  }
}

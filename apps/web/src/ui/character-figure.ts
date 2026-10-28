import {
  ALL_OFFHANDS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  WEAPONS,
  loadoutSpec,
  resolveJoinLoadout,
  resolveLoadout,
  type OffhandId,
} from "@vibewars/game-core";

import { offhandMarkLayout } from "../render/arena-snapshot.js";
import { REST_FRAME } from "../render/attack-clock.js";
import { paintStandingBody, type BodyPainter, type StandingBody } from "../render/body-painter.js";
import { weaponMarkLayout } from "../render/weapon-mark.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { cssColour, professionLabel } from "./character-preview.js";

/**
 * The character as the arena draws it (#1250): your own standing body,
 * holding what it enters a match with, at the arena's 1:1 scale. Drawn by
 * the arena's own `paintStandingBody`, so the menu cannot show a body the
 * match does not.
 */

/** What a character holds as a match starts. */
export interface CharacterAppearance {
  readonly weaponId: string | undefined;
  readonly offhandId: OffhandId | undefined;
}

/**
 * What `character` enters a match holding: the host's own resolution
 * (match-host.ts `seatNew`), set 1 in hand. A build the host would refuse
 * plays a random starter build, so it is drawn holding nothing.
 */
export function characterAppearance(character: StoredCharacter): CharacterAppearance {
  const rules = MINIMAL_GW_INSPIRED_PVP_V1;
  const { loadout, refused } = resolveJoinLoadout(
    toPlayerBuild(character),
    rules.attributes,
    Math.random,
  );
  if (refused !== undefined) {
    return { weaponId: undefined, offhandId: undefined };
  }
  const { equipment } = loadoutSpec(
    resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
        secondaryProfession: loadout.secondaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      rules.combat,
    ),
  );
  return { weaponId: equipment.mainHand.weapon.id, offhandId: equipment.offhandId };
}

/** Facing right, as the reference sheet's true-size row draws a body (player-mark.mjs). */
const FACING = 0;
const RADIUS = MINIMAL_GW_INSPIRED_PVP_V1.collision.playerRadius;
/** Half the widest line a mark draws: the weapon's 4 px casing. */
const CASING = 2;

/**
 * Half the figure's width and height: as far as any weapon or off-hand
 * reaches from the centre, so every figure is the same size and a list's
 * bodies line up.
 */
function figureHalfSize(): { readonly x: number; readonly y: number } {
  let x = RADIUS;
  let y = RADIUS;
  const reach = (px: number, py: number, by: number) => {
    x = Math.max(x, Math.abs(px) + by);
    y = Math.max(y, Math.abs(py) + by);
  };
  for (const weaponId of Object.keys(WEAPONS)) {
    const mark = weaponMarkLayout(0, 0, RADIUS, FACING, weaponId, REST_FRAME);
    for (const point of [...mark.strokes, ...mark.fills, ...mark.strings].flat()) {
      reach(point.x, point.y, CASING);
    }
  }
  for (const offhand of ALL_OFFHANDS) {
    const mark = offhandMarkLayout(0, 0, RADIUS, FACING, offhand.id);
    if (mark !== undefined) {
      // A circle's or an arc's whole ring: generous for an arc, never short.
      const outer = Math.hypot(mark.x, mark.y) + mark.radius + mark.casing / 2;
      reach(outer, outer, 0);
    }
  }
  return { x: Math.ceil(x), y: Math.ceil(y) };
}

/** The figure's body, at the centre of its canvas. */
export function figureBody(appearance: CharacterAppearance): StandingBody {
  const half = figureHalfSize();
  return {
    x: half.x,
    y: half.y,
    r: RADIUS,
    facing: FACING,
    team: "self",
    weaponId: appearance.weaponId,
    offhandId: appearance.offhandId,
    frame: REST_FRAME,
  };
}

/** `colour` at `alpha`, as CSS. */
function cssRgba(colour: number, alpha: number): string {
  return alpha >= 1
    ? cssColour(colour)
    : `rgba(${String(colour >> 16)}, ${String((colour >> 8) & 0xff)}, ${String(colour & 0xff)}, ${String(alpha)})`;
}

/** A 2D canvas as a body's painter. */
export function canvasPainter(ctx: CanvasRenderingContext2D): BodyPainter {
  // Phaser's strokes have no miter spikes: a sharp tip, the wand's star,
  // would otherwise grow one past the mark.
  ctx.lineJoin = "round";
  return {
    lineStyle: (width, colour, alpha) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = cssRgba(colour, alpha);
    },
    fillStyle: (colour, alpha) => {
      ctx.fillStyle = cssRgba(colour, alpha);
    },
    fillCircle: (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    strokeCircle: (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    beginPath: () => {
      ctx.beginPath();
    },
    moveTo: (x, y) => {
      ctx.moveTo(x, y);
    },
    lineTo: (x, y) => {
      ctx.lineTo(x, y);
    },
    arc: (x, y, r, from, to) => {
      ctx.arc(x, y, r, from, to);
    },
    strokePath: () => {
      ctx.stroke();
    },
    fillPolygon: (points) => {
      const [first, ...rest] = points;
      if (first === undefined) {
        return;
      }
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of rest) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fill();
    },
  };
}

/**
 * `character`'s figure: a canvas sharp at the screen's pixel ratio. With no
 * 2D context to be had, it stays an empty box of the same size.
 */
export function createCharacterFigure(character: StoredCharacter): HTMLElement {
  const half = figureHalfSize();
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const canvas = document.createElement("canvas");
  canvas.className = "character-figure";
  canvas.width = Math.round(half.x * 2 * ratio);
  canvas.height = Math.round(half.y * 2 * ratio);
  canvas.style.width = `${String(half.x * 2)}px`;
  canvas.style.height = `${String(half.y * 2)}px`;
  canvas.title = professionLabel(character.primaryProfession, character.secondaryProfession);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", canvas.title);
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.scale(ratio, ratio);
    const painter = canvasPainter(ctx);
    paintStandingBody(
      { body: painter, marks: painter },
      figureBody(characterAppearance(character)),
    );
  }
  return canvas;
}

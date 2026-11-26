import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  loadoutSpec,
  resolveJoinLoadout,
  resolveLoadout,
  type OffhandId,
  type ProfessionId,
} from "@vibewars/game-core";

import { BODY_GLYPH_SIZE, FOCUS_ANGLE, teamColour } from "../render/arena-snapshot.js";
import { REST_FRAME } from "../render/attack-clock.js";
import { newCapeMotion } from "../render/cape-motion.js";
import type { CapeLook } from "../render/cape-shape.js";
import {
  paintBodyMarks,
  paintFigureGround,
  type Painter,
  type StandingBody,
} from "../render/body-painter.js";
import {
  STACK_BADGE_FILL,
  STACK_BADGE_RIM,
  STACK_GLYPH_TINT,
  STACK_OUTLINE_WIDTH,
  bucketFacing,
  headingBucket,
  stackBadge,
  stackLayers,
  stackSlices,
  stackTones,
  type StackPose,
} from "../render/sprite-stack.js";
import {
  STACK_BAKE_RADIUS,
  STACK_BAKE_SCALE,
  bakeFigure,
  type BakeContext,
} from "../render/stack-atlas.js";
import { t } from "../i18n/index.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import type { FigureLook } from "./character-card.js";
import { cssColour, professionLabel } from "./character-preview.js";
import { professionIcon } from "./icons.js";

/**
 * The character figure (#1250): a character in a list drawn exactly as a
 * match draws your own standing body, with the weapon and off-hand it
 * enters holding: the arena's stacked figure (ADR-0057), its badge and
 * marks, from the same slices, never a copy of them (#4032).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
/** The arena's body radius: the figure is drawn at it, then scaled into its box. */
const BODY_RADIUS = RULES.collision.playerRadius;
/** Room beside the body for its marks: the weapon reaches r + 7.5, its 4 px casing 2 px more. */
const MARK_ROOM = 10;
/** Three-quarter, towards you and to the right: the figure shows its face and its weapon. */
const FIGURE_FACING = Math.PI / 4;
/** In its box, the weapon is held out to the right of the feet and the off-hand to the left (#4082). */
const BOX_WEAPON_FACING = 0;
const BOX_OFFHAND_FACING = Math.PI + FOCUS_ANGLE;
/** How far the bake's shadow reaches below the feet, in radii (`STACK_FRAME_HEIGHT`). */
const SHADOW_DROP = 0.91;
/** How high the figure's helmet stands over its feet, its outline included. */
const HELMET_TOP =
  STACK_OUTLINE_WIDTH -
  Math.min(
    ...stackLayers(
      stackSlices("stand"),
      bucketFacing(headingBucket(FIGURE_FACING)),
      BODY_RADIUS,
      stackTones(0, undefined),
      undefined,
    ).flatMap((layer) => layer.points.map((point) => point.y)),
  );
/** How much of its box the figure fills (#4082): helmet to shadow, or mark to mark. */
const FIGURE_FILL = 0.9;

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

/**
 * The figure's square box, CSS pixels, the size every list lays out: a
 * phone's (#1699), and past the wide layout's 52rem a bigger one (#4082).
 */
export const FIGURE_BOX = { narrow: 48, wide: 64 } as const;

/**
 * The box's side in world units: the figure, helmet to shadow and mark
 * to mark, fills `FIGURE_FILL` of it, whatever it wears.
 */
export const FIGURE_FRAME =
  Math.max(2 * (BODY_RADIUS + MARK_ROOM), HELMET_TOP + SHADOW_DROP * BODY_RADIUS) / FIGURE_FILL;

/**
 * The figure's body, in world units of a box `FIGURE_FRAME` wide: your
 * own, standing still, wearing `cape`, centred.
 */
export function figureBody(
  appearance: CharacterAppearance,
  cape: CapeLook | undefined,
): StandingBody {
  return {
    x: FIGURE_FRAME / 2,
    y: (FIGURE_FRAME + HELMET_TOP - SHADOW_DROP * BODY_RADIUS) / 2,
    r: BODY_RADIUS,
    facing: FIGURE_FACING,
    team: "self",
    weaponId: appearance.weaponId,
    offhandId: appearance.offhandId,
    frame: REST_FRAME,
    // Folded, the cape shows no emblem, so no emblem frame either (#3581).
    cape:
      cape === undefined
        ? undefined
        : { look: cape, motion: newCapeMotion(), pattern: undefined, emblemFrame: undefined },
  };
}

/** What a figure's slices are drawn into: a bake's calls, and a transform to place them. */
export type FigureContext = BakeContext &
  Pick<CanvasRenderingContext2D, "save" | "restore" | "translate" | "scale">;

/** Where a figure's badge and marks go: the badge's centre, and which way each mark is held. */
export interface FigureDecor {
  readonly badge: { readonly x: number; readonly y: number };
  readonly weaponFacing: number;
  readonly offhandFacing: number;
}

/** As a match lays them out: the badge over the head, the marks round the feet as it faces. */
export function matchDecor(body: StandingBody): FigureDecor {
  return {
    badge: { x: body.x, y: body.y - stackBadge(body.r).rise },
    weaponFacing: body.facing,
    offhandFacing: body.facing,
  };
}

/**
 * As the box lays them out (#4082), so the body can fill it: the badge
 * in the top corner behind the head, clear of the visor, and the weapon
 * and off-hand to either side of the feet.
 */
export function boxDecor(body: StandingBody): FigureDecor {
  const rim = stackBadge(body.r).radius + 1;
  return {
    badge: { x: body.x - body.r - MARK_ROOM + rim, y: body.y - HELMET_TOP + rim },
    weaponFacing: BOX_WEAPON_FACING,
    offhandFacing: BOX_OFFHAND_FACING,
  };
}

/**
 * The figure's body as a match draws a standing one (ADR-0057): what
 * lies on the ground under it through `painter`; its stacked figure in
 * `pose` at its nearest heading, `body.r` wide, into `context`; the badge
 * where `decor` puts it, `paintGlyph` on that; then its marks.
 */
export function paintFigure(
  painter: Painter,
  context: FigureContext,
  body: StandingBody,
  pose: StackPose,
  decor: FigureDecor,
  paintGlyph: () => void,
): void {
  paintFigureGround(painter, body);
  const { cape } = body;
  const look = {
    body: teamColour(body.team),
    cape: cape === undefined ? undefined : { look: cape.look, pattern: cape.pattern },
  };
  const size = body.r / (STACK_BAKE_RADIUS * STACK_BAKE_SCALE);
  context.save();
  context.translate(body.x, body.y);
  context.scale(size, size);
  bakeFigure(context, 0, 0, look, headingBucket(body.facing), pose);
  context.restore();
  const badge = stackBadge(body.r);
  painter.fillStyle(STACK_BADGE_RIM, 1);
  painter.fillCircle(decor.badge.x, decor.badge.y, badge.radius + 1);
  painter.fillStyle(STACK_BADGE_FILL, 1);
  painter.fillCircle(decor.badge.x, decor.badge.y, badge.radius);
  paintGlyph();
  paintBodyMarks(painter, { ...body, facing: decor.offhandFacing, weaponId: undefined });
  paintBodyMarks(painter, { ...body, facing: decor.weaponFacing, offhandId: undefined });
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
 * The primary profession's glyph as the arena tints it on a figure's
 * badge (#1037, ADR-0057): `glyph` filled pale, its alpha kept, as Phaser's fill
 * tint does, `pixels` wide; `undefined` with no 2D context.
 */
export function tintedGlyph(
  glyph: HTMLImageElement,
  pixels: number,
): HTMLCanvasElement | undefined {
  const tinted = document.createElement("canvas");
  tinted.width = pixels;
  tinted.height = pixels;
  const tint = tinted.getContext("2d");
  if (tint === null) {
    return undefined;
  }
  tint.drawImage(glyph, 0, 0, pixels, pixels);
  tint.globalCompositeOperation = "source-in";
  tint.fillStyle = cssColour(STACK_GLYPH_TINT);
  tint.fillRect(0, 0, pixels, pixels);
  return tinted;
}

/** `tinted`, a `tintedGlyph`, on the badge centred at `badge` as the arena draws it: opaque, `BODY_GLYPH_SIZE` wide. */
export function drawBodyGlyph(
  context: CanvasRenderingContext2D,
  badge: FigureDecor["badge"],
  tinted: HTMLCanvasElement,
): void {
  const half = BODY_GLYPH_SIZE / 2;
  context.drawImage(tinted, badge.x - half, badge.y - half, BODY_GLYPH_SIZE, BODY_GLYPH_SIZE);
}

/**
 * The figure `look` describes, `scale` times its box, as a canvas
 * sharp at the device's pixel ratio in the wide layout's `FIGURE_BOX`
 * (the stylesheet's `--figure-box` picks the box): drawn at once without its
 * glyph, then again with it once the profession icon has loaded, with
 * `data-glyph` naming it, and `data-weapon-id` naming what it holds.
 * The bare body keeps its glyph: its profession is known. A browser
 * that gives no 2D context leaves the box empty.
 */
export function createCharacterFigure(
  look: Pick<FigureLook, "primary" | "secondary" | "appearance" | "cape">,
  scale = 1,
): HTMLCanvasElement {
  const pixels = Math.round(FIGURE_BOX.wide * window.devicePixelRatio * scale);
  const canvas = document.createElement("canvas");
  canvas.className = "character-figure";
  canvas.width = pixels;
  canvas.height = pixels;
  canvas.style.width = `calc(var(--figure-box) * ${String(scale)})`;
  canvas.style.height = canvas.style.width;
  const label = professionLabel(look.primary, look.secondary);
  canvas.title = label;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  const { appearance } = look;
  if (appearance.weaponId !== undefined) {
    canvas.dataset.weaponId = appearance.weaponId;
  }
  const context = canvas.getContext("2d");
  if (context === null) {
    return canvas;
  }
  const perUnit = pixels / FIGURE_FRAME;
  context.scale(perUnit, perUnit);
  // Phaser joins its strokes round; a canvas's default miter would
  // spike the weapon casing's points past the mark.
  context.lineJoin = "round";
  const body = figureBody(appearance, look.cape);
  const decor = boxDecor(body);
  const painter = canvasPainter(context);
  const paint = (glyph: HTMLImageElement | undefined): void => {
    context.clearRect(0, 0, FIGURE_FRAME, FIGURE_FRAME);
    paintFigure(painter, context, body, "stand", decor, () => {
      const size = Math.round(BODY_GLYPH_SIZE * perUnit);
      const tinted = glyph === undefined ? undefined : tintedGlyph(glyph, size);
      if (tinted !== undefined) {
        drawBodyGlyph(context, decor.badge, tinted);
      }
    });
  };
  paint(undefined);
  void loadGlyph(look.primary).then((glyph) => {
    if (glyph !== undefined) {
      paint(glyph);
      canvas.dataset.glyph = look.primary;
    }
  });
  return canvas;
}

/** The profession's icon, decoded; `undefined` if it cannot load, and the figure stays bare. */
export async function loadGlyph(profession: ProfessionId): Promise<HTMLImageElement | undefined> {
  const image = new Image();
  image.src = professionIcon(profession);
  try {
    await image.decode();
    return image;
  } catch {
    return undefined;
  }
}

/** The character ball's scale of its box (#2225): a row's, so the weapon reads. */
const BALL_SCALE = 0.75;

/**
 * The character ball (#2225), the shared icon for a character in a list:
 * its figure holding its active weapon set, set 1, as it enters a match,
 * and under it one dot a weapon set when it carries more than one, the
 * active one lit.
 */
export function createCharacterDot(character: TeamCharacter): HTMLElement {
  const ball = document.createElement("span");
  ball.className = "character-ball";
  ball.appendChild(
    createCharacterFigure(
      {
        primary: character.primaryProfession,
        secondary: character.secondaryProfession,
        appearance: characterAppearance(character),
        cape: undefined,
      },
      BALL_SCALE,
    ),
  );
  const sets = character.equipment.weaponSets.filter((set) => set !== null).length;
  if (sets > 1) {
    const dots = document.createElement("span");
    dots.className = "character-ball-sets";
    dots.setAttribute("aria-label", t("character.weaponSets", { count: sets }));
    for (let set = 0; set < sets; set += 1) {
      const dot = document.createElement("span");
      dot.className = set === 0 ? "character-ball-set is-active" : "character-ball-set";
      dots.appendChild(dot);
    }
    ball.appendChild(dots);
  }
  return ball;
}

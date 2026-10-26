import { Vec, type OffhandId, type ProfessionId, type Vec2 } from "@vibewars/game-core";

import type { RenderableProjectile } from "./projectiles.js";

/**
 * The renderer's own data shape and its pure helpers (team colour lookup,
 * click hit-testing). Deliberately has zero dependency on Phaser — the
 * actual drawing lives in `arena-scene.ts`, which imports Phaser and so
 * cannot be imported from a plain-Node test (Phaser probes for browser
 * globals at module load time and throws outside one). Keeping this file
 * Phaser-free is what lets these helpers be unit-tested headlessly,
 * consistent with ADR-0001's "the domain never depends on the renderer" —
 * the same separation, one layer over.
 */

export interface RenderableActor {
  readonly id: string;
  /** Drawn above the actor, so a player can tell who is who. */
  readonly name: string;
  readonly position: Vec2;
  /** Radians, `atan2` convention, 0 = +x (#187). Not drawn yet. */
  readonly facing: number;
  /** Picks the weapon mark's tip (#188); `undefined` draws none. */
  readonly weaponId: string | undefined;
  /** Picks the off-hand mark (#276); `undefined` draws none. */
  readonly offhandId: OffhandId | undefined;
  /** The primary profession, whose glyph leads the name (#281); `undefined` draws none. */
  readonly profession: ProfessionId | undefined;
  readonly radius: number;
  readonly team: "ally" | "enemy" | "self";
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
  /** Lying down from a knockdown (#545): drawn flattened, the weapon dropped beside it. */
  readonly knockedDown: boolean;
  /** Fraction of the current cast still remaining, or `undefined`. */
  readonly castProgress: number | undefined;
  readonly statuses: readonly string[];
}

export interface RectRenderableWall {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonRenderableWall {
  readonly kind: "polygon";
  readonly points: readonly Vec2[];
}

export type RenderableWall = RectRenderableWall | PolygonRenderableWall;

/** A short-lived floating number or label above an actor. */
export interface FloatingText {
  readonly id: number;
  /** The actor it floats over; only texts over the same actor make room for each other. */
  readonly anchorId: string;
  readonly text: string;
  /** Where it starts; it rises from here as it ages. */
  readonly position: Vec2;
  readonly colour: number;
  /**
   * `"light"` for weapon swings: smaller and fainter, so a stream of
   * them never drowns a skill's number (#160). `"critical"` for a
   * critical hit: larger and bold, so it stands out of that stream (#533).
   */
  readonly weight: "normal" | "light" | "critical";
  /** Seconds of life remaining; the scene fades and removes it. */
  remainingSeconds: number;
}

export const FLOATING_TEXT_SECONDS = 1.2;
const FLOATING_TEXT_RISE_PER_SECOND = 24;
/** A 13px line of text, plus a pixel so neighbours never touch. */
export const FLOATING_TEXT_LINE = 14;
/** The most texts one actor carries at once; a steady stream would otherwise build a tower. */
export const FLOATING_TEXT_STACK = 4;

/** How high a floating text has risen by now. */
export function floatingTextY(text: FloatingText): number {
  const age = FLOATING_TEXT_SECONDS - text.remainingSeconds;
  return text.position.y - FLOATING_TEXT_RISE_PER_SECOND * age;
}

/**
 * Where a new floating text starts so it covers none already over the
 * same actor (#54). Several hits landing together used to draw on one
 * spot as an unreadable smear. Each one that would overlap lifts the new
 * text a line above it, so a burst reads as a short column of numbers.
 *
 * Nothing, once the actor already carries `FLOATING_TEXT_STACK` texts:
 * the new one is dropped rather than stacked out of sight.
 */
export function placeFloatingText(
  existing: readonly FloatingText[],
  incoming: FloatingText,
): FloatingText | undefined {
  const sameAnchor = existing.filter((text) => text.anchorId === incoming.anchorId);
  if (sameAnchor.length >= FLOATING_TEXT_STACK) {
    return undefined;
  }
  // Lowest first: lifting past one can only reach those above it.
  const ys = sameAnchor.map(floatingTextY).sort((a, b) => b - a);
  let y = floatingTextY(incoming);
  for (const other of ys) {
    if (Math.abs(other - y) < FLOATING_TEXT_LINE) {
      y = other - FLOATING_TEXT_LINE;
    }
  }
  const lift = floatingTextY(incoming) - y;
  return { ...incoming, position: Vec.add(incoming.position, { x: 0, y: -lift }) };
}

/**
 * Where an area skill landed (#5): a ring at its true radius in the
 * caster's side's colour, fading out (docs/art/art-direction.md).
 */
export interface AreaFlash {
  readonly id: number;
  readonly position: Vec2;
  readonly radius: number;
  readonly colour: number;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** How long a flash takes to fade from full to nothing. */
export const AREA_FLASH_SECONDS = 0.4;

/** Every flash `dt` seconds older, the faded ones gone. */
export function decayAreaFlashes(flashes: readonly AreaFlash[], dt: number): AreaFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

/** A flash's opacity: 1 when it lands, 0 when it is gone. */
export function areaFlashAlpha(flash: AreaFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / AREA_FLASH_SECONDS));
}

/**
 * A melee swing (#161): a 90° arc around the attacker, toward its target,
 * in the attacker's side's colour, fading out (docs/art/art-direction.md
 * "Swing flash"). It hugs the attacker, so it never reads as the target ring.
 */
export interface SwingFlash {
  readonly id: number;
  /** The attacker's centre when it swung. */
  readonly centre: Vec2;
  /** Toward the target, in radians. */
  readonly angle: number;
  readonly radius: number;
  readonly colour: number;
  /** Your own swing, which gets an `ink` line along its outer edge. */
  readonly own: boolean;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** Every body's radius, as drawn: the ruleset's collision radius. */
export const ACTOR_RADIUS = 14;

/**
 * Where a damage or heal number starts, from the body's centre: right of
 * the health bar, clear of the name ("Damage and heal numbers" in
 * docs/art/art-direction.md, #262). Here rather than with the other
 * floating-text constants, because it needs `ACTOR_RADIUS` declared first.
 */
export const FLOATING_TEXT_OFFSET_X = ACTOR_RADIUS + 4;
export const FLOATING_TEXT_OFFSET_Y = 8;

/** Short, so a dagger's rapid hits read as separate flashes, never a standing ring. */
export const SWING_FLASH_SECONDS = 0.12;
/** Outside the body: the attacker's radius plus this. */
export const SWING_FLASH_GAP = 6;

/** Every swing `dt` seconds older, the faded ones gone. */
export function decaySwingFlashes(flashes: readonly SwingFlash[], dt: number): SwingFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

export function swingFlashAlpha(flash: SwingFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / SWING_FLASH_SECONDS));
}

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  readonly targetId: string | undefined;
  /** Weapon shots in flight (#161). */
  readonly projectiles: readonly RenderableProjectile[];
  /** The match clock (`elapsedSeconds`), which projectiles fly against. */
  readonly clock: number;
  /** The living body under the mouse cursor, whose name shows (#253). */
  readonly hoverId: string | undefined;
  /** The names key is held (Shift by default, #302): every name shows (#253). */
  readonly showAllNames: boolean;
}

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  targetId: undefined,
  projectiles: [],
  clock: 0,
  hoverId: undefined,
  showAllNames: false,
};

/**
 * Two hues, for two sides (docs/art/art-direction.md): `friend` blue and
 * `foe` red, which stay apart under every common colour-vision deficiency,
 * where the old green allies did not. You are drawn in your team's blue;
 * what marks you out is the ink rim the scene adds, not a hue of your own.
 */
const TEAM_COLOURS: Record<RenderableActor["team"], number> = {
  self: 0x59c2ff,
  ally: 0x59c2ff,
  enemy: 0xff7b72,
};

/** Colour lookup must stay total over the team union. */
export function teamColour(team: RenderableActor["team"]): number {
  return TEAM_COLOURS[team];
}

/**
 * Hit-test a point against actors; used by click-to-target (brief §5).
 *
 * Dead actors are skipped: clicking a corpse should select whoever is
 * standing behind it, not the corpse.
 */
export function actorAtPoint(snapshot: ArenaSnapshot, point: Vec2): RenderableActor | undefined {
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of snapshot.actors) {
    if (actor.dead) {
      continue;
    }
    const d = Vec.distance(actor.position, point);
    if (d <= actor.radius && d < bestDistance) {
      best = actor;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * `snapshot` with whose names show this frame (#253): the body under
 * `pointer` (in world units, `undefined` once the cursor left the
 * arena), hit-tested like a click so a corpse is never picked, and
 * every name while `showAllNames`.
 */
export function withNames(
  snapshot: ArenaSnapshot,
  pointer: Vec2 | undefined,
  showAllNames: boolean,
): ArenaSnapshot {
  const hoverId = pointer === undefined ? undefined : actorAtPoint(snapshot, pointer)?.id;
  return { ...snapshot, hoverId, showAllNames };
}

/**
 * Whether `actor`'s name label is drawn (#253): only your target's, the
 * body's under the cursor, and everyone's while the names key is held. Eleven
 * pixel names over every body smeared together as soon as two stood
 * close. Never your own: the ink rim marks you.
 */
export function nameShown(snapshot: ArenaSnapshot, actor: RenderableActor): boolean {
  if (actor.team === "self") {
    return false;
  }
  return snapshot.showAllNames || actor.id === snapshot.targetId || actor.id === snapshot.hoverId;
}

/** Health as a 0..1 fraction, clamped — the shape a health bar needs. */
export function healthFraction(actor: RenderableActor): number {
  if (actor.maxHealth <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, actor.health / actor.maxHealth));
}

/**
 * Where an actor's name label sits: its bottom edge, in world y (#53).
 *
 * Clear of the cast bar whether or not one is showing, so a name does not
 * jump every time its owner starts casting. A corpse has no bars, so its
 * name sits just over the circle.
 */
export function nameLabelBottom(actor: RenderableActor): number {
  return actor.position.y - actor.radius - (actor.dead ? 4 : 22);
}

/** The shield: an arc on the body's centre, 45° to 105° left of the facing, at r + 3.5 (#275). */
const SHIELD_FROM = (45 * Math.PI) / 180;
const SHIELD_TO = (105 * Math.PI) / 180;
/** The focus: a ring of radius 1.75 centred 75° left of the facing, at r + 3.5 (#275). */
const FOCUS_ANGLE = (75 * Math.PI) / 180;
const FOCUS_RADIUS = 1.75;
/** Both off-hand marks' centrelines sit this far past the body's edge. */
const OFFHAND_REACH = 3.5;

/**
 * The off-hand mark (#276, docs/art/art-direction.md "Player mark"), cased
 * like the weapon mark: an `edge` stroke `casing` px wide under an `ink`
 * stroke `core` px wide, both along the same centreline.
 */
export type OffhandMarkLayout =
  /** The shield: a circular arc on the body's centre, clockwise from `from` to `to`. */
  | {
      readonly kind: "arc";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly from: number;
      readonly to: number;
      readonly casing: number;
      readonly core: number;
    }
  /** The focus: a small ring off the body. */
  | {
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly casing: number;
      readonly core: number;
    };

/**
 * The off-hand mark of a body of radius `r` at (`x`, `y`), facing `facing`
 * radians, on its left: in screen coordinates, y down, that is the facing
 * minus the angle. `undefined` for no off-hand: nothing to draw.
 */
export function offhandMarkLayout(
  x: number,
  y: number,
  r: number,
  facing: number,
  offhandId: OffhandId | undefined,
): OffhandMarkLayout | undefined {
  switch (offhandId) {
    case undefined:
      return undefined;
    case "shield":
      return {
        kind: "arc",
        x,
        y,
        radius: r + OFFHAND_REACH,
        from: facing - SHIELD_TO,
        to: facing - SHIELD_FROM,
        casing: 5,
        core: 3,
      };
    case "focus": {
      const angle = facing - FOCUS_ANGLE;
      return {
        kind: "ring",
        x: x + Math.cos(angle) * (r + OFFHAND_REACH),
        y: y + Math.sin(angle) * (r + OFFHAND_REACH),
        radius: FOCUS_RADIUS,
        casing: 3,
        core: 1.5,
      };
    }
  }
}

/** The profession glyph before a name, in world pixels: the name's own 11 px (#281). */
export const PROFESSION_GLYPH_SIZE = 11;
/** Between the glyph and the name. */
const PROFESSION_GLYPH_GAP = 2;

/** Where a name and its profession glyph go: centre x of each, and their shared bottom. */
export interface NameplateLayout {
  /** `undefined`: the actor has no profession, so no glyph. */
  readonly glyphX: number | undefined;
  readonly textX: number;
  readonly bottom: number;
}

/**
 * Lay out an actor's name and the glyph before it (#281): glyph, gap and
 * name centred together on the body, so a long name pushes the glyph left
 * with it, and both sit on `nameLabelBottom`.
 *
 * @param textWidth the label's measured width, never a character count:
 *   a name can be any script (#192)
 */
export function nameplateLayout(actor: RenderableActor, textWidth: number): NameplateLayout {
  const bottom = nameLabelBottom(actor);
  const { x } = actor.position;
  if (actor.profession === undefined) {
    return { glyphX: undefined, textX: x, bottom };
  }
  const left = x - (PROFESSION_GLYPH_SIZE + PROFESSION_GLYPH_GAP + textWidth) / 2;
  return {
    glyphX: left + PROFESSION_GLYPH_SIZE / 2,
    textX: left + PROFESSION_GLYPH_SIZE + PROFESSION_GLYPH_GAP + textWidth / 2,
    bottom,
  };
}

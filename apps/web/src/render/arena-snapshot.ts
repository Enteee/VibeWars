import {
  Vec,
  type CreatureLook,
  type OffhandId,
  type ProfessionId,
  type SkillType,
  type Vec2,
} from "@vibewars/game-core";

import type { CallsSnapshot, GroundEffectSnapshot } from "@vibewars/game-session";

import { PROFESSION_GLYPH_SIZE } from "./arena-atlas.js";
import type { AttackCast } from "./attack-clock.js";
import type { ConditionCue } from "./body-conditions.js";
import type { CapeLook } from "./cape-shape.js";
import type { RenderablePing } from "./call-marks.js";
import type { RenderableCapturePoint, RenderableFlag, RenderableStand } from "./flag-objects.js";
import { LYING_WIDTH } from "./lying-pose.js";
import type { RenderableProjectile } from "./projectiles.js";
import { screenPx } from "./screen-text.js";

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
  /** The player's guild tag (#1406), after the name on its plate; `undefined` for none. */
  readonly guildTag: string | undefined;
  /** The player's guild cape (#1422), drawn behind a standing body; `undefined` for none. */
  readonly cape: CapeLook | undefined;
  /** A lobby's bot (#1194): its name plate wears the BOT tag. */
  readonly bot: boolean;
  readonly position: Vec2;
  /** Radians, `atan2` convention, 0 = +x (#187). Not drawn yet. */
  readonly facing: number;
  /** Picks the weapon mark's tip (#188); `undefined` draws none. */
  readonly weaponId: string | undefined;
  /** The host's swing timer, which the weapon mark's pose follows (#560); `swingTotal` 0: not attacking. */
  readonly swingElapsed: number;
  readonly swingTotal: number;
  /** The host's cast timer while an attack skill winds up (#562), which the pose follows instead. */
  readonly attackCast: AttackCast | undefined;
  /** Picks the off-hand mark (#276); `undefined` draws none. */
  readonly offhandId: OffhandId | undefined;
  /** The primary profession, whose glyph leads the name (#281); `undefined` draws none. */
  readonly profession: ProfessionId | undefined;
  /** A creature's shape and kind glyph (#1162); `undefined`: a player or a dummy, a disc. */
  readonly creatureLook: CreatureLook | undefined;
  readonly radius: number;
  readonly team: "ally" | "enemy" | "self";
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
  /** A corpse a skill has exploited (#466): drawn darker. */
  readonly exploited: boolean;
  /** Lying down from a knockdown (#545): drawn flattened, the weapon dropped beside it. */
  readonly knockedDown: boolean;
  /** Fraction of the current cast still remaining, or `undefined`. */
  readonly castProgress: number | undefined;
  /** The casting skill's type, for the badge by the cast bar (#1125); only with `castProgress`. */
  readonly castType: SkillType | undefined;
  readonly statuses: readonly string[];
  /** Wears the solid enchantment ring (#1117); never a corpse. */
  readonly enchanted: boolean;
  /** Wears the broken hex ring (#1117); never a corpse. */
  readonly hexed: boolean;
  /** Shimmers, a shrine raise's invulnerability (#1233); never a corpse. */
  readonly invulnerable: boolean;
  /** Flames, drops or bubbles on the body (#1138), two at most; never a corpse. */
  readonly conditionCues: readonly ConditionCue[];
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
  /** Where it starts, in the world; it rises from here as it ages. */
  readonly position: Vec2;
  /**
   * Screen px it starts above `position`, to clear the texts already over
   * the same actor (#54). Screen px, as the text is (#456).
   */
  readonly lift: number;
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
/** A 13px line of text, plus a pixel so neighbours never touch; screen px, as the rise is. */
export const FLOATING_TEXT_LINE = 14;
/** The most texts one actor carries at once; a steady stream would otherwise build a tower. */
export const FLOATING_TEXT_STACK = 4;

/** How far a floating text is above its `position` by now, screen px (#456). */
function floatingTextRise(text: FloatingText): number {
  const age = FLOATING_TEXT_SECONDS - text.remainingSeconds;
  return text.lift + FLOATING_TEXT_RISE_PER_SECOND * age;
}

/** Where a floating text is by now, in world y at camera `zoom`. */
export function floatingTextY(text: FloatingText, zoom: number): number {
  return text.position.y - screenPx(floatingTextRise(text), zoom);
}

/**
 * Where a new floating text starts so it covers none already over the
 * same actor (#54). Several hits landing together used to draw on one
 * spot as an unreadable smear. Each one that would overlap lifts the new
 * text a line above it, so a burst reads as a short column of numbers.
 *
 * Nothing, once the actor already carries `FLOATING_TEXT_STACK` texts:
 * the new one is dropped rather than stacked out of sight.
 *
 * @param zoom the camera's: texts are screen-sized (#456), so a line apart
 *   is screen px
 */
export function placeFloatingText(
  existing: readonly FloatingText[],
  incoming: FloatingText,
  zoom: number,
): FloatingText | undefined {
  const sameAnchor = existing.filter((text) => text.anchorId === incoming.anchorId);
  if (sameAnchor.length >= FLOATING_TEXT_STACK) {
    return undefined;
  }
  // In screen px, where the line is. Lowest first: lifting past one can
  // only reach those above it.
  const screenY = (text: FloatingText): number => floatingTextY(text, zoom) * zoom;
  const ys = sameAnchor.map(screenY).sort((a, b) => b - a);
  let y = screenY(incoming);
  for (const other of ys) {
    if (Math.abs(other - y) < FLOATING_TEXT_LINE) {
      y = other - FLOATING_TEXT_LINE;
    }
  }
  return { ...incoming, lift: incoming.lift + screenY(incoming) - y };
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

/** A player's radius, as drawn: the ruleset's collision radius. */
export const ACTOR_RADIUS = 14;

/** A creature's (#1052), as drawn: the ruleset's `creatureRadius`. */
export const CREATURE_RADIUS = 10;

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

/**
 * A ward or a trap on the ground (#1087, #1105): a circle in its side's
 * colour, its skill's icon at the centre. A ward's is a translucent
 * disc; a trap's, its outline alone.
 */
export interface RenderableGroundEffect {
  readonly id: number;
  readonly skillId: string;
  readonly position: Vec2;
  readonly radius: number;
  readonly colour: number;
  readonly filled: boolean;
}

/**
 * `effect` as the arena draws it, for a viewer on `selfTeam`: an ally's in
 * the ally colour, any other's in the enemy's; `kind` says which list it
 * came in.
 */
export function toRenderableGroundEffect(
  effect: GroundEffectSnapshot,
  selfTeam: number | undefined,
  kind: "ward" | "trap",
): RenderableGroundEffect {
  return {
    id: effect.id,
    skillId: effect.skillId,
    position: { x: effect.x, y: effect.y },
    radius: effect.radius,
    colour: teamColour(effect.team === selfTeam ? "ally" : "enemy"),
    filled: kind === "ward",
  };
}

/** How far a shrine's ring reaches round it, world units (#1199). */
export const SHRINE_RADIUS = 40;

/** A team's resurrection shrine on the ground (#1199), in its side's colour. */
export interface RenderableShrine {
  readonly position: Vec2;
  readonly side: "ally" | "enemy";
}

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  /** The map's resurrection shrines (#1199), their priests alive or not. */
  readonly shrines: readonly RenderableShrine[];
  /**
   * A Guild Battle's flags (#1225), or a Relic Run's relics (#1374), as
   * flags, wherever each is; `[]` on any other map.
   */
  readonly flags: readonly RenderableFlag[];
  /** A Guild Battle's flag stand (#1225); `undefined` on any other map. */
  readonly stand: RenderableStand | undefined;
  /** A Relic Run or King of the Hill altar (#1374, #1377); `undefined` on any other map. */
  readonly altar: Vec2 | undefined;
  /** Capture Points' shrines (#1378); `[]` on any other map. */
  readonly capturePoints: readonly RenderableCapturePoint[];
  readonly targetId: string | undefined;
  /** Weapon shots in flight (#161). */
  readonly projectiles: readonly RenderableProjectile[];
  /** Wards on the ground, oldest first (#1087), then your team's traps (#1105). */
  readonly groundEffects: readonly RenderableGroundEffect[];
  /** The match clock (`elapsedSeconds`), which projectiles fly against. */
  readonly clock: number;
  /** The living body under the mouse cursor, whose name shows (#253). */
  readonly hoverId: string | undefined;
  /** The names key is held (Shift by default, #302): every name shows (#253). */
  readonly showAllNames: boolean;
  /** The foe your team has called (#443): a chevron over it. */
  readonly calledId: string | undefined;
  /** Your team's pings on the floor (#443). */
  readonly pings: readonly RenderablePing[];
}

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  shrines: [],
  flags: [],
  stand: undefined,
  altar: undefined,
  capturePoints: [],
  targetId: undefined,
  projectiles: [],
  groundEffects: [],
  clock: 0,
  hoverId: undefined,
  showAllNames: false,
  calledId: undefined,
  pings: [],
};

/** `snapshot` with your team's calls on it (#443). */
export function withCalls(snapshot: ArenaSnapshot, calls: CallsSnapshot): ArenaSnapshot {
  return {
    ...snapshot,
    calledId: calls.target?.targetId,
    pings: calls.pings.map((ping) => ({
      id: ping.id,
      position: { x: ping.x, y: ping.y },
      remaining: ping.remaining,
    })),
  };
}

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

/** Edges every living body, darker than the grid and walls, so no body blends into what it stands on. */
export const BODY_EDGE = 0x0b0f14;
/** A corpse's hollow circle, and the glyph inside it. */
export const DEAD_COLOUR = 0x4a5464;
/** An exploited corpse's circle and glyph (#466): darker than a fresh one. */
export const EXPLOITED_CORPSE_COLOUR = 0x262b33;

/** Colour lookup must stay total over the team union. */
export function teamColour(team: RenderableActor["team"]): number {
  return TEAM_COLOURS[team];
}

/**
 * Hit-test a point against actors; used by click-to-target (brief §5).
 *
 * The living come first: clicking a corpse selects whoever is standing
 * behind it. With nobody living under the point, an ally's corpse is
 * picked, so a resurrection has something to aim at (#812). A foe's
 * corpse never is.
 */
export function actorAtPoint(snapshot: ArenaSnapshot, point: Vec2): RenderableActor | undefined {
  return (
    nearestUnder(snapshot.actors, point, (actor) => !actor.dead) ??
    nearestUnder(snapshot.actors, point, (actor) => actor.dead && actor.team === "ally")
  );
}

/** The actor among `actors` that `accepts` nearest `point`, within its radius. */
function nearestUnder(
  actors: readonly RenderableActor[],
  point: Vec2,
  accepts: (actor: RenderableActor) => boolean,
): RenderableActor | undefined {
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of actors) {
    if (!accepts(actor)) {
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
 * arena), hit-tested like a click, so a foe's corpse is never picked, and
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

/** The cast bar's top, in world units above a living body's edge. */
const CAST_BAR_TOP = 19;
/** Screen px between a name and the cast bar, or a corpse's edge, under it (#456). */
const NAME_GAP_LIVING = 3;
const NAME_GAP_DEAD = 4;
/** A name label's height, screen px: its 11 px text (#456). */
export const NAME_LABEL_HEIGHT = 11;

/**
 * Where an actor's name label sits: its bottom edge, in world y (#53), at
 * camera `zoom`. The label is screen-sized (#456), so the gap under it is
 * screen px at every zoom.
 *
 * Clear of the cast bar whether or not one is showing, so a name does not
 * jump every time its owner starts casting. A corpse has no bars, so its
 * name sits just over the circle.
 */
export function nameLabelBottom(actor: RenderableActor, zoom: number): number {
  const { y } = actor.position;
  if (actor.dead) {
    return y - actor.radius - screenPx(NAME_GAP_DEAD, zoom);
  }
  return y - actor.radius - CAST_BAR_TOP - screenPx(NAME_GAP_LIVING, zoom);
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

/** Between the glyph and the name. */
const PROFESSION_GLYPH_GAP = 2;

/** Where a name and its profession glyph go: centre x of each, and their shared bottom, in world units. */
export interface NameplateLayout {
  /** `undefined`: the actor has no profession, so no glyph. */
  readonly glyphX: number | undefined;
  readonly textX: number;
  readonly bottom: number;
}

/**
 * Lay out an actor's name and the glyph before it (#281): glyph, gap and
 * name centred together on the body, so a long name pushes the glyph left
 * with it, and both sit on `nameLabelBottom`. Both are screen-sized
 * (#456), so their widths are screen px, laid out in world units at `zoom`.
 *
 * @param textWidth the label's measured width, screen px, never a
 *   character count: a name can be any script (#192)
 */
export function nameplateLayout(
  actor: RenderableActor,
  textWidth: number,
  zoom: number,
): NameplateLayout {
  const bottom = nameLabelBottom(actor, zoom);
  const { x } = actor.position;
  if (actor.profession === undefined) {
    return { glyphX: undefined, textX: x, bottom };
  }
  const glyph = screenPx(PROFESSION_GLYPH_SIZE, zoom);
  const gap = screenPx(PROFESSION_GLYPH_GAP, zoom);
  const text = screenPx(textWidth, zoom);
  const left = x - (glyph + gap + text) / 2;
  return {
    glyphX: left + glyph / 2,
    textX: left + glyph + gap + text / 2,
    bottom,
  };
}

/** The primary profession's glyph inside the body (#1037, Q105 B), world units. */
export const BODY_GLYPH_SIZE = 13;
export const BODY_GLYPH_ALPHA = 0.6;

/**
 * A creature's kind glyph (#1162): the study's glyph scale (0.95) over the
 * icon's 14-unit box, at `CREATURE_RADIUS`, scaled with the drawn radius.
 * Opaque, as the study draws it.
 */
export const CREATURE_GLYPH_SIZE = 13.3;
/** A Ghostly Hero's glyph (#1377): the priest's, pale, until its own is drawn. */
export const GHOST_GLYPH_TINT = 0xdfe8f2;

/** What a body glyph shows: its primary profession, or a creature's kind (#1162). */
export type BodyGlyph =
  | { readonly kind: "profession"; readonly profession: ProfessionId }
  | { readonly kind: "creature"; readonly look: CreatureLook };

export interface BodyGlyphLayout {
  readonly glyph: BodyGlyph;
  readonly x: number;
  readonly y: number;
  /** World units, square. */
  readonly size: number;
  /** Tint colour and alpha: edge at 60 % alive, dead grey at 1 on a corpse. */
  readonly tint: number;
  readonly alpha: number;
}

/**
 * The glyph inside `actor`'s body (#1037): upright, centred, a dark mark
 * on the team colour, under the weapon mark. World sized, so it scales
 * with the body at every zoom. A player's is its primary profession's, at
 * 60 %, shrunk to fit its flattened disc when knocked down; a creature's
 * is its kind's (#1162), opaque, and its shape never lies down; a
 * Ghostly Hero's pale (#1377). A corpse greys it.
 *
 * `undefined`: neither a profession nor a creature, so no glyph.
 */
export function bodyGlyphLayout(actor: RenderableActor): BodyGlyphLayout | undefined {
  const creature = actor.creatureLook !== undefined;
  const glyph: BodyGlyph | undefined =
    actor.creatureLook !== undefined
      ? { kind: "creature", look: actor.creatureLook }
      : actor.profession !== undefined
        ? { kind: "profession", profession: actor.profession }
        : undefined;
  if (glyph === undefined) {
    return undefined;
  }
  const { x, y } = actor.position;
  // A creature's glyph grows with its drawn radius (#2047).
  const size = creature ? (CREATURE_GLYPH_SIZE * actor.radius) / CREATURE_RADIUS : BODY_GLYPH_SIZE;
  if (actor.dead) {
    return {
      glyph,
      x,
      y,
      size,
      tint: actor.exploited ? EXPLOITED_CORPSE_COLOUR : DEAD_COLOUR,
      alpha: 1,
    };
  }
  return {
    glyph,
    x,
    y,
    size: actor.knockedDown && !creature ? size * LYING_WIDTH : size,
    tint: actor.creatureLook === "ghostly-hero" ? GHOST_GLYPH_TINT : BODY_EDGE,
    alpha: creature ? 1 : BODY_GLYPH_ALPHA,
  };
}

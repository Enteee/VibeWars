import Phaser from "phaser";

import {
  ALTAR_REACH_UNITS,
  CAPTURE_REACH_UNITS,
  isStatusId,
  isWeaponId,
  type CreatureLook,
  type StatusId,
  type Vec2,
} from "@vibewars/game-core";

import { taggedName } from "../ui/bot-tag.js";
import { playerLabelText } from "../ui/player-label.js";
import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import {
  BODY_EDGE,
  DEAD_COLOUR,
  EMPTY_SNAPSHOT,
  EXPLOITED_CORPSE_COLOUR,
  SHRINE_RADIUS,
  areaFlashAlpha,
  bodyGlyphLayout,
  decayAreaFlashes,
  decaySwingFlashes,
  floatingTextY,
  healthFraction,
  nameShown,
  nameplateLayout,
  placeFloatingText,
  swingFlashAlpha,
  teamColour,
  type AreaFlash,
  type NameplateLayout,
  type SwingFlash,
} from "./arena-snapshot.js";
import {
  ARENA_ATLAS_JSON,
  ARENA_ATLAS_SVG,
  bodyProfessionFrame,
  creatureFrame,
  groundFrame,
  professionFrame,
  projectileFrame,
  skillTypeFrame,
  statusFrame,
  type AtlasMap,
} from "./arena-atlas.js";
import { MatchClock, projectileHeading, projectilePosition, shotFadeAlpha } from "./projectiles.js";
import { NO_COVER, type CameraView, type Cover } from "./camera-rig.js";
import { edgeMarkers, type EdgeMarker, type EdgeThing } from "./edge-markers.js";
import { statusRowLayout } from "./status-icons.js";
import {
  decayWalkMarker,
  walkMarkerAlpha,
  walkMarkerAt,
  walkMarkerTicks,
  type WalkMarker,
} from "./walk-marker.js";
import { AttackClock, REST_FRAME, shownFrame, type AttackFrame } from "./attack-clock.js";
import { impactMarks, mergeImpacts, type Impact } from "./body-impacts.js";
import { conditionMarks, cuePhase } from "./body-conditions.js";
import { bodyRings, invulnerableAlpha, invulnerableRing } from "./body-rings.js";
import {
  capeJumped,
  newCapeMotion,
  reprimeCapeMotion,
  stepCapeMotion,
  type CapeMotion,
} from "./cape-motion.js";
import { CREATURE_ARMS } from "./creature-arms.js";
import {
  DEAD_DASH,
  DEAD_GAP,
  RING_CASING,
  TICK_EDGE,
  creatureOrnament,
  creatureOutline,
  creatureTick,
  dashes,
  type OrnamentColour,
} from "./creature-shape.js";
import { CAST_BADGE_SIZE, CAST_BAR_RISE, castBadgeLayout } from "./cast-badge.js";
import {
  PING_HEAD_RADIUS,
  PING_PIN_HEIGHT,
  callChevron,
  pingRing,
  type RenderablePing,
} from "./call-marks.js";
import {
  FLAG_PICK_RADIUS,
  STAND_RADIUS,
  type RenderableCapturePoint,
  type RenderableFlag,
} from "./flag-objects.js";
import { lyingPose } from "./lying-pose.js";
import { mapLayerChanged, type MapLayer } from "./map-layer.js";
import { screenSized } from "./screen-text.js";
import {
  BODY_EDGE_WIDTH,
  SELF_RIM,
  paintBodyMarks,
  paintStandingBody,
  paintWeaponMark,
  type Painter,
  type WornCape,
} from "./body-painter.js";
import type { Point } from "./weapon-mark-geometry.js";
import type {
  ArenaSnapshot,
  FloatingText,
  RenderableActor,
  RenderableWall,
} from "./arena-snapshot.js";

/**
 * Minimal geometric renderer (brief §20's visual language).
 *
 * This scene is a *view*. It reads a snapshot and draws it; it never
 * decides anything about the game (brief §41). The snapshot shape and its
 * pure helpers live in `arena-snapshot.ts`, which has no Phaser
 * dependency — see that file for why that split exists.
 */

const WALL_FILL = 0x202836;
const WALL_STROKE = 0x3b4759;
const TARGET_RING = 0xffd866;
/** The `condition` orange: your team's called foe wears its chevron (#443). */
const CALL_CHEVRON = 0xffa657;
/**
 * The target ring's radius past the body's edge (operator Q26): its 2 px
 * stroke spans r + 8 … r + 10, clear of the weapon mark (r + 7.5) and the
 * off-hand mark (inside r + 7).
 */
const TARGET_RING_OFFSET = 9;
/** A flag's pole, world units up from its foot (#1225): stand-in shapes until its asset. */
const FLAG_POLE = 26;
/** Its pennant, along the pole and out from it. */
const FLAG_PENNANT_HEIGHT = 11;
const FLAG_PENNANT_LENGTH = 16;
/** A carried flag stands on its carrier's head: this far up from the body's centre. */
const FLAG_CARRIED_LIFT = 22;
/** The flag stand nobody holds, neutral grey (#1225). */
const STAND_NEUTRAL = 0x8b949e;
/** The altar on an edge marker (#1413): the palette's `altar` gold, as the compass draws it (#1388). */
const ALTAR_GOLD = 0xc8a45a;
const FLAG_POLE_COLOUR = 0xd8dee9;
const GRID = 0x1a212c;
const HEALTH_BAR_BG = 0x11161d;
const HEALTH_BAR_FILL = 0x7ee787;
const HEALTH_BAR_LOW = 0xff7b72;
// Ink, not blue: a blue bar over an enemy would read as "an ally".
const CAST_BAR_FILL = 0xd7dee8;
/** Marks the actor you control, inside its circle, in any team colour. */
/** A condition cue's outline, and a bubble's stroke (#1138). */
const CUE_EDGE_WIDTH = 1;
/** How opaque a weapon swing's number is at most: present, never louder than a skill (#160). */
const LIGHT_TEXT_ALPHA = 0.8;
/** A floating text's size by weight: a critical hit is the loudest number on screen (#533). */
const FLOATING_FONT_SIZE: Readonly<Record<FloatingText["weight"], string>> = {
  light: "11px",
  normal: "13px",
  critical: "17px",
};
const INK = "#d7dee8";
/**
 * The outline under every floating number and cue: `BODY_EDGE` as a CSS
 * colour. "Every number wears a 3 px edge outline" (docs/art/art-direction.md),
 * so a heal over a full health bar, or damage over a melee attacker, still
 * reads (#274).
 */
const TEXT_EDGE = "#0b0f14";
const DEAD_INK = "#4a5464";
/** The same two inks as tints, for the profession glyph before a name (#281). */
const INK_TINT = 0xd7dee8;
const DEAD_INK_TINT = 0x4a5464;

/** An off-screen marker's length, tip to base, and width, screen px (#440). */
const EDGE_MARKER_LENGTH = 12;
const EDGE_MARKER_WIDTH = 10;
/** A skill impact's spikes and ring (#1139). */
const IMPACT_LINE_WIDTH = 1.5;
/**
 * The world's layers, bottom up (#1037). Wards on the floor and their
 * icons (#1087), under everything that stands on them; the grid and the
 * walls, drawn only when they change (#1353); what moves on the floor and the
 * bodies, with their enchantment and hex rings (#1117) and condition cues
 * (#1138); the profession glyph inside each body; every mark on a body
 * (off-hand, weapon, target ring, call chevron, bars, swing flashes, skill
 * impacts), so a weapon crosses the glyph, never the reverse; the casting
 * skill's type badge by the cast bar (#1125); then shots, status icons, names and
 * numbers, which were over the bodies before the split, so a long name may
 * cover a badge's top edge.
 */
const GROUND_DEPTH = -1;
const MAP_DEPTH = -0.5;
const BODY_DEPTH = 0;
const BODY_GLYPH_DEPTH = 1;
const MARK_DEPTH = 2;
const CAST_BADGE_DEPTH = 2.5;
const OVERLAY_DEPTH = 3;
/** Over every world object, names and numbers included. */
const EDGE_MARKER_DEPTH = 10;
/** The arena's icon sheet (#1671) and its frame map, as Phaser keys them. */
const ATLAS = "arena-atlas";
const ATLAS_MAP = "arena-atlas-map";

/** A ward's icon at its centre (#1087), world units. */
const GROUND_ICON_SIZE = 22;
const GROUND_ICON_ALPHA = 0.55;

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  /** Wards on the floor (#1087), under the grid, walls and bodies. */
  private groundGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Each ward's icon, by ground effect id (#1087). */
  private groundIcons = new Map<number, Phaser.GameObjects.Image>();
  /** The grid, the arena's edge and the walls (#1353), over the wards; drawn when they change. */
  private mapGraphics: Phaser.GameObjects.Graphics | undefined;
  /** What `mapGraphics` shows; `undefined` until it is first drawn. */
  private drawnMap: MapLayer | undefined;
  /** What moves on the floor, and the bodies, under the body glyphs. */
  private graphics: Phaser.GameObjects.Graphics | undefined;
  /** Every mark on a body, over the body glyphs (#1037). */
  private markGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The off-screen markers, drawn in screen px over everything (#440). */
  private markerGraphics: Phaser.GameObjects.Graphics | undefined;
  private snapshot: ArenaSnapshot = EMPTY_SNAPSHOT;
  /** What the camera shows; `undefined` until the first `setCamera`. */
  private view: CameraView | undefined;
  /** What the HUD covers, so no edge marker hides under it. */
  private cover: Cover = NO_COVER;
  private arena = { width: 0, height: 0 };
  private floatingTexts: FloatingText[] = [];
  private areaFlashes: AreaFlash[] = [];
  private swingFlashes: SwingFlash[] = [];
  /** Skills landing on bodies (#1139), newest last; merged in on the next frame. */
  private impacts: Impact[] = [];
  private addedImpacts: Impact[] = [];
  private walkMarker: WalkMarker | undefined;
  /** Every caped body's cape (#1699), and where the body was drawn last frame. */
  private capes = new Map<string, { motion: CapeMotion; x: number; y: number }>();
  /**
   * One sprite per shot, by projectile id: in flight, or ended and fading
   * at its end point since `endedAt` (scene seconds).
   */
  private projectileImages = new Map<
    number,
    { image: Phaser.GameObjects.Image; to: { x: number; y: number }; endedAt: number | undefined }
  >();
  private readonly clock = new MatchClock();
  /**
   * Shots that have ended, kept until they leave the state: if the clock
   * steps back after an overshot, a faded shot must not fly again.
   */
  private readonly endedShots = new Set<number>();
  private floatingTextObjects = new Map<number, Phaser.GameObjects.Text>();
  /**
   * Status icons per actor id, reused frame to frame: hidden when not
   * needed, created only when an actor shows more than it ever has.
   */
  private statusIcons = new Map<string, Phaser.GameObjects.Image[]>();
  private statusOverflow = new Map<string, Phaser.GameObjects.Text>();
  /** One name label per actor id, reused frame to frame like the icons. */
  private nameLabels = new Map<string, Phaser.GameObjects.Text>();
  /** The primary profession's glyph before each name, one pooled image per actor (#281). */
  private nameGlyphs = new Map<string, Phaser.GameObjects.Image>();
  /** The primary profession's glyph inside each body, one pooled image per actor (#1037). */
  private bodyGlyphs = new Map<string, Phaser.GameObjects.Image>();
  /** The casting skill's type badge by each cast bar, one pooled image per actor (#1125). */
  private castBadges = new Map<string, Phaser.GameObjects.Image>();
  /** Status ids the server sent that this client has no icon for. */
  private readonly unknownStatuses = new Set<string>();
  /** Each attacker's swing, which its weapon mark plays (#558), by actor id. */
  private readonly attackClocks = new Map<string, AttackClock>();
  /** The scene clock at the last frame, seconds, which the match clock runs on from. */
  private now = 0;
  /** Read once a frame: under reduced motion every mark stays at rest. */
  private reducedMotion = false;

  public constructor() {
    super(ArenaScene.KEY);
  }

  /**
   * Point the camera: `view` is at the centre of the canvas, `zoom` CSS px
   * per world unit; `cover` is what the HUD covers.
   */
  public setCamera(view: CameraView, cover: Cover): void {
    this.cover = cover;
    this.view = view;
    this.cameras.main.setZoom(view.zoom);
    this.cameras.main.centerOn(view.x, view.y);
  }

  /** The arena's bounds, which the grid covers and the edge line traces. */
  public setArenaBounds(width: number, height: number): void {
    this.arena = { width, height };
  }

  /** Replace the snapshot to draw on the next frame. */
  public setSnapshot(snapshot: ArenaSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Queue a floating number/label above a world position. */
  public addFloatingText(text: FloatingText): void {
    const placed = placeFloatingText(this.floatingTexts, text, this.cameras.main.zoom);
    if (placed !== undefined) {
      this.floatingTexts.push(placed);
    }
  }

  /** Flash where an area skill landed. */
  public addAreaFlash(flash: AreaFlash): void {
    this.areaFlashes.push(flash);
  }

  /** Mark where you clicked the floor to walk, replacing the last mark (#310). */
  public showWalkMarker(point: Vec2): void {
    this.walkMarker = walkMarkerAt(point);
  }

  /** Flash a melee swing; off under reduced motion, where the damage number says enough. */
  /** The host says `actorId`'s swing struck twice (#561): the off hand stabs too. */
  public struckTwice(actorId: string): void {
    this.attackClocks.get(actorId)?.struckTwice(this.snapshot.clock);
  }

  public addSwingFlash(flash: SwingFlash): void {
    if (!prefersReducedMotion()) {
      this.swingFlashes.push(flash);
    }
  }

  public addImpacts(impacts: readonly Impact[]): void {
    this.addedImpacts.push(...impacts);
  }

  /**
   * Every icon the arena draws comes from one sheet (#1671), loaded at its
   * own size: one raster at match start, however many skills there are.
   * Name glyphs are drawn in ink, never the profession colour: in the
   * arena, colour is team.
   */
  public preload(): void {
    this.load.svg(ATLAS, `${import.meta.env.BASE_URL}${ARENA_ATLAS_SVG}`);
    this.load.json(ATLAS_MAP, `${import.meta.env.BASE_URL}${ARENA_ATLAS_JSON}`);
  }

  public create(): void {
    const sheet = this.textures.get(ATLAS);
    const map = this.cache.json.get(ATLAS_MAP) as AtlasMap;
    for (const [frame, { x, y, w, h }] of Object.entries(map.frames)) {
      sheet.add(frame, 0, x, y, w, h);
    }
    this.groundGraphics = this.add.graphics().setDepth(GROUND_DEPTH);
    this.mapGraphics = this.add.graphics().setDepth(MAP_DEPTH);
    this.graphics = this.add.graphics().setDepth(BODY_DEPTH);
    this.markGraphics = this.add.graphics().setDepth(MARK_DEPTH);
    this.markerGraphics = this.add.graphics().setDepth(EDGE_MARKER_DEPTH);
  }

  public override update(time: number, deltaMs: number): void {
    const g = this.graphics;
    const marks = this.markGraphics;
    if (g === undefined || marks === undefined) {
      return;
    }
    g.clear();
    marks.clear();
    this.now = time / 1000;
    this.reducedMotion = prefersReducedMotion();
    this.clock.observe(this.snapshot.clock, this.now);
    this.observeAttacks();
    this.updateGroundEffects();
    this.drawMap();
    // Over the grid and walls, under the actors: a flash never hides a
    // health bar, a status or the target ring.
    this.areaFlashes = decayAreaFlashes(this.areaFlashes, deltaMs / 1000);
    for (const flash of this.areaFlashes) {
      const alpha = areaFlashAlpha(flash);
      g.fillStyle(flash.colour, 0.12 * alpha);
      g.fillCircle(flash.position.x, flash.position.y, flash.radius);
      g.lineStyle(2, flash.colour, alpha);
      g.strokeCircle(flash.position.x, flash.position.y, flash.radius);
    }
    this.walkMarker = decayWalkMarker(this.walkMarker, deltaMs / 1000);
    if (this.walkMarker !== undefined) {
      this.drawWalkMarker(g, this.walkMarker);
    }
    for (const ping of this.snapshot.pings) {
      this.drawPing(g, ping);
    }
    this.drawStand(g, marks);
    this.drawAltar(g);
    for (const point of this.snapshot.capturePoints) {
      this.drawCapturePoint(g, point);
    }
    this.stepCapes(deltaMs / 1000);
    for (const actor of this.snapshot.actors) {
      this.drawActor(g, marks, actor);
    }
    // Over the bodies: a carried flag stands above its carrier's head.
    for (const flag of this.snapshot.flags) {
      this.drawFlag(marks, flag);
    }
    this.swingFlashes = decaySwingFlashes(this.swingFlashes, deltaMs / 1000);
    for (const flash of this.swingFlashes) {
      this.drawSwingFlash(marks, flash);
    }
    this.impacts = mergeImpacts(this.impacts, this.addedImpacts, deltaMs / 1000);
    this.addedImpacts = [];
    for (const impact of this.impacts) {
      this.drawImpact(marks, impact);
    }
    this.updateBodyGlyphs();
    this.updateCastBadges();
    this.updateProjectiles(time / 1000);
    this.updateStatusIcons();
    this.updateNameLabels();
    this.updateFloatingTexts(deltaMs / 1000);
    this.updateEdgeMarkers();
  }

  /**
   * Step the cape of every living caped body (#1699) by its drawn
   * movement since last frame: knocked down it stands still, so it
   * folds. A body that jumped (a shadow step, a respawn) starts over;
   * one gone, dead or without a cape keeps none.
   */
  private stepCapes(dt: number): void {
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      if (actor.cape === undefined || actor.dead) {
        continue;
      }
      seen.add(actor.id);
      const { x, y } = actor.position;
      const last = this.capes.get(actor.id);
      if (last === undefined) {
        this.capes.set(actor.id, { motion: newCapeMotion(), x, y });
        continue;
      }
      const jumped = capeJumped(Math.hypot(x - last.x, y - last.y), actor.radius);
      if (jumped) {
        reprimeCapeMotion(last.motion);
      }
      const still = jumped || dt <= 0;
      const vx = still ? 0 : (x - last.x) / dt;
      const vy = still ? 0 : (y - last.y) / dt;
      stepCapeMotion(last.motion, dt, { x, y, r: actor.radius, vx, vy });
      last.x = x;
      last.y = y;
    }
    for (const id of this.capes.keys()) {
      if (!seen.has(id)) {
        this.capes.delete(id);
      }
    }
  }

  /** The cape `actor` wears, with its motion; `undefined` for none. */
  private wornCape(actor: RenderableActor): WornCape | undefined {
    const motion = this.capes.get(actor.id)?.motion;
    return actor.cape === undefined || motion === undefined
      ? undefined
      : { look: actor.cape, motion };
  }

  /**
   * A Relic Run or King of the Hill altar (#1374, #1377): a neutral ring
   * on the ground as wide as a relic or ghost must come to score, and a
   * stone at its centre.
   */
  private drawAltar(g: Phaser.GameObjects.Graphics): void {
    const altar = this.snapshot.altar;
    if (altar === undefined) {
      return;
    }
    g.fillStyle(STAND_NEUTRAL, 0.14);
    g.fillCircle(altar.x, altar.y, ALTAR_REACH_UNITS);
    g.lineStyle(3, STAND_NEUTRAL, 0.9);
    g.strokeCircle(altar.x, altar.y, ALTAR_REACH_UNITS);
    g.fillStyle(FLAG_POLE_COLOUR, 1);
    g.fillRect(altar.x - 9, altar.y - 9, 18, 18);
  }

  /**
   * A Capture Points shrine (#1378): the stand's marker as wide as a
   * player must come to count on it, in its owner's colour, neutral grey
   * with none; round it, clockwise from the top, its capturer's progress.
   */
  private drawCapturePoint(g: Phaser.GameObjects.Graphics, point: RenderableCapturePoint): void {
    const { x, y } = point.position;
    const colour = point.owner === undefined ? STAND_NEUTRAL : teamColour(point.owner);
    g.fillStyle(colour, 0.18);
    g.fillCircle(x, y, CAPTURE_REACH_UNITS);
    g.lineStyle(3, colour, 0.9);
    g.strokeCircle(x, y, CAPTURE_REACH_UNITS);
    g.fillStyle(BODY_EDGE, 1);
    g.fillCircle(x, y, 5);
    if (point.ring !== undefined) {
      const top = -Math.PI / 2;
      g.lineStyle(5, teamColour(point.ring.side), 1);
      g.beginPath();
      g.arc(x, y, CAPTURE_REACH_UNITS + 6, top, top + point.ring.fraction * 2 * Math.PI);
      g.strokePath();
    }
  }

  /**
   * The flag stand (#1225): a ring on the ground in its holder's colour,
   * neutral grey with none, round a pole; the target ring when selected.
   */
  private drawStand(g: Phaser.GameObjects.Graphics, marks: Phaser.GameObjects.Graphics): void {
    const stand = this.snapshot.stand;
    if (stand === undefined) {
      return;
    }
    const { x, y } = stand.position;
    const colour = stand.holder === undefined ? STAND_NEUTRAL : teamColour(stand.holder);
    g.fillStyle(colour, 0.18);
    g.fillCircle(x, y, STAND_RADIUS);
    g.lineStyle(3, colour, 0.9);
    g.strokeCircle(x, y, STAND_RADIUS);
    g.fillStyle(BODY_EDGE, 1);
    g.fillCircle(x, y, 5);
    if (!this.snapshot.flags.some((flag) => flag.onStand)) {
      g.lineStyle(3, FLAG_POLE_COLOUR, 1);
      g.lineBetween(x, y, x, y - FLAG_POLE);
    }
    if (stand.id === this.snapshot.targetId) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, y, STAND_RADIUS + TARGET_RING_OFFSET);
    }
  }

  /**
   * A flag (#1225): a pole with a pennant in its team's colour, standing
   * at its foot, or on its carrier's head; the target ring when selected.
   */
  private drawFlag(marks: Phaser.GameObjects.Graphics, flag: RenderableFlag): void {
    const x = flag.position.x;
    const foot = flag.position.y - (flag.carried ? FLAG_CARRIED_LIFT : 0);
    const top = foot - FLAG_POLE;
    marks.lineStyle(3, BODY_EDGE, 1);
    marks.lineBetween(x, foot, x, top);
    marks.lineStyle(2, FLAG_POLE_COLOUR, 1);
    marks.lineBetween(x, foot, x, top);
    marks.fillStyle(teamColour(flag.side), 1);
    marks.fillTriangle(
      x + 1,
      top,
      x + 1 + FLAG_PENNANT_LENGTH,
      top + FLAG_PENNANT_HEIGHT / 2,
      x + 1,
      top + FLAG_PENNANT_HEIGHT,
    );
    marks.lineStyle(1, BODY_EDGE, 1);
    marks.strokeTriangle(
      x + 1,
      top,
      x + 1 + FLAG_PENNANT_LENGTH,
      top + FLAG_PENNANT_HEIGHT / 2,
      x + 1,
      top + FLAG_PENNANT_HEIGHT,
    );
    if (flag.id === this.snapshot.targetId && !flag.carried && !flag.onStand) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, flag.position.y, FLAG_PICK_RADIUS);
    }
  }

  /** Hand each attack clock its actor's swing timer; forget those who left. */
  private observeAttacks(): void {
    const present = new Set<string>();
    for (const actor of this.snapshot.actors) {
      present.add(actor.id);
      if (actor.weaponId === undefined || !isWeaponId(actor.weaponId)) {
        continue;
      }
      let clock = this.attackClocks.get(actor.id);
      if (clock === undefined) {
        clock = new AttackClock();
        this.attackClocks.set(actor.id, clock);
      }
      const total = actor.dead ? 0 : actor.swingTotal;
      const cast = actor.dead ? undefined : actor.attackCast;
      clock.observe(this.snapshot.clock, actor.swingElapsed, total, actor.weaponId, cast);
    }
    for (const id of this.attackClocks.keys()) {
      if (!present.has(id)) {
        this.attackClocks.delete(id);
      }
    }
  }

  /**
   * A triangle on the screen edge toward every living body out of view:
   * `foe` or `friend`, a `target` outline round your target's, `ink` for
   * your own, which the follow camera should never need; an outlined one
   * toward each objective out of view (#1413), under the bodies'. Drawn in
   * world space through the inverse of the camera, so it sits still on
   * screen at any zoom.
   */
  private updateEdgeMarkers(): void {
    const g = this.markerGraphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    const view = this.view;
    if (view === undefined) {
      return;
    }
    const screen = { width: this.scale.width, height: this.scale.height };
    const bodies: EdgeThing[] = this.snapshot.actors.map((actor) => ({
      id: actor.id,
      kind: actor.team === "self" ? "self" : actor.team === "ally" ? "friend" : "foe",
      colour: undefined,
      position: actor.position,
      dead: actor.dead,
      targeted: actor.id === this.snapshot.targetId,
    }));
    // Objectives first, so a body's marker draws over one it overlaps.
    const things = [...this.objectiveEdgeThings(), ...bodies];
    for (const marker of edgeMarkers(things, view, screen, this.cover)) {
      this.drawEdgeMarker(g, marker, view, screen);
    }
  }

  /** The objectives a mode is played around (#1413), each in the colour the arena draws it. */
  private objectiveEdgeThings(): EdgeThing[] {
    const { stand, altar, capturePoints } = this.snapshot;
    const objective = (id: string, position: Vec2, colour: number): EdgeThing => ({
      id,
      kind: "objective",
      colour,
      position,
      dead: false,
      targeted: false,
    });
    const owned = (side: "ally" | "enemy" | undefined): number =>
      side === undefined ? STAND_NEUTRAL : teamColour(side);
    return [
      ...capturePoints.map((point, index) =>
        objective(`capture-point/${String(index)}`, point.position, owned(point.owner)),
      ),
      ...(altar === undefined ? [] : [objective("altar", altar, ALTAR_GOLD)]),
      ...(stand === undefined ? [] : [objective(stand.id, stand.position, owned(stand.holder))]),
    ];
  }

  private drawEdgeMarker(
    g: Phaser.GameObjects.Graphics,
    marker: EdgeMarker,
    view: CameraView,
    screen: { readonly width: number; readonly height: number },
  ): void {
    /** Screen px from the marker, along and across its heading, to a world point. */
    const at = (along: number, across: number): Phaser.Math.Vector2 => {
      const cos = Math.cos(marker.angle);
      const sin = Math.sin(marker.angle);
      const sx = marker.x + along * cos - across * sin;
      const sy = marker.y + along * sin + across * cos;
      return new Phaser.Math.Vector2(
        view.x + (sx - screen.width / 2) / view.zoom,
        view.y + (sy - screen.height / 2) / view.zoom,
      );
    };
    // The tip on the marker point, the base back toward the centre.
    const points = [
      at(0, 0),
      at(-EDGE_MARKER_LENGTH, EDGE_MARKER_WIDTH / 2),
      at(-EDGE_MARKER_LENGTH, -EDGE_MARKER_WIDTH / 2),
    ];
    if (marker.kind === "objective") {
      // Stroked, not filled, so it never reads as a body (#1413).
      g.lineStyle(2 / view.zoom, marker.colour ?? STAND_NEUTRAL, 1);
      g.strokePoints(points, true);
      return;
    }
    const fill =
      marker.kind === "self" ? SELF_RIM : teamColour(marker.kind === "friend" ? "ally" : "enemy");
    g.fillStyle(fill, 1);
    g.fillPoints(points, true);
    g.lineStyle(
      (marker.targeted ? 2 : BODY_EDGE_WIDTH) / view.zoom,
      marker.targeted ? TARGET_RING : BODY_EDGE,
      1,
    );
    g.strokePoints(points, true);
  }

  /**
   * A knocked-down body (#545): the disc flattened along its facing, edged
   * as a standing one is, with the weapon mark dropped beside it. The
   * off-hand is not drawn: one dropped thing reads, two clutter.
   */
  private drawLyingBody(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
  ): void {
    const { x, y } = actor.position;
    const pose = lyingPose(x, y, actor.radius, actor.facing);
    g.fillStyle(teamColour(actor.team), 1);
    tracePath(g, pose.body);
    g.fillPath();
    g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
    g.strokePath();
    if (actor.team === "self") {
      g.lineStyle(2, SELF_RIM, 1);
      tracePath(g, lyingPose(x, y, actor.radius - 2, actor.facing).body);
      g.strokePath();
    }
    this.drawWeaponMark(marks, actor, pose.weapon);
  }

  /**
   * The weapon mark (#188, #418), in its swing frame; where a knocked-down
   * body dropped it (#545), lying still at rest.
   */
  private drawWeaponMark(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    dropped?: {
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly facing: number;
    },
  ): void {
    const at = dropped ?? { ...actor.position, r: actor.radius, facing: actor.facing };
    const frame = dropped === undefined ? this.weaponFrame(actor) : REST_FRAME;
    paintWeaponMark(phaserPainter(g), at, actor.weaponId, frame);
  }

  /** Where `actor`'s weapon is in its swing, `REST_FRAME` for none. */
  private weaponFrame(actor: RenderableActor): AttackFrame {
    return actor.weaponId === undefined || !isWeaponId(actor.weaponId)
      ? REST_FRAME
      : shownFrame(
          this.attackClocks.get(actor.id),
          this.clock.read(this.now),
          actor.weaponId,
          this.reducedMotion,
        );
  }

  /** The walk marker (#310): cased like the weapon mark, a 4 px `edge` under a 2 px `ink` core. */
  private drawWalkMarker(g: Phaser.GameObjects.Graphics, marker: WalkMarker): void {
    const alpha = walkMarkerAlpha(marker, prefersReducedMotion());
    const ticks = walkMarkerTicks(marker);
    for (const [width, colour] of [
      [4, BODY_EDGE],
      [2, SELF_RIM],
    ] as const) {
      g.lineStyle(width, colour, alpha);
      g.beginPath();
      for (const [from, to] of ticks) {
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
      }
      g.strokePath();
    }
  }

  /**
   * A ping (#443): a `friend` pin on the spot, cased in `edge`, and a ring
   * that grows from it and fades. Under the actors, as the walk marker is.
   */
  private drawPing(g: Phaser.GameObjects.Graphics, ping: RenderablePing): void {
    const { x, y } = ping.position;
    const ring = pingRing(ping.remaining, prefersReducedMotion());
    const friend = teamColour("ally");
    g.lineStyle(2, friend, ring.alpha);
    g.strokeCircle(x, y, ring.radius);
    const head = y - PING_PIN_HEIGHT;
    for (const [width, colour] of [
      [4, BODY_EDGE],
      [2, friend],
    ] as const) {
      g.lineStyle(width, colour, 1);
      g.lineBetween(x, y, x, head);
    }
    g.fillStyle(friend, 1);
    g.fillCircle(x, head, PING_HEAD_RADIUS);
    g.lineStyle(1.5, BODY_EDGE, 1);
    g.strokeCircle(x, head, PING_HEAD_RADIUS);
  }

  /** Your team's called foe (#443): a `condition` chevron over it, cased like the weapon mark. */
  private drawCallChevron(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const points = callChevron(actor, this.cameras.main.zoom);
    for (const [width, colour] of [
      [5, BODY_EDGE],
      [3, CALL_CHEVRON],
    ] as const) {
      g.lineStyle(width, colour, 1);
      g.strokePoints(points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)));
    }
  }

  /** A skill's impact on a body (#1139), where that body is now; none once it has left the state. */
  private drawImpact(g: Phaser.GameObjects.Graphics, impact: Impact): void {
    const actor = this.snapshot.actors.find((a) => a.id === impact.anchorId);
    if (actor === undefined) {
      return;
    }
    const { x, y } = actor.position;
    for (const mark of impactMarks(impact, actor.radius, this.reducedMotion)) {
      if (mark.kind === "spike") {
        g.lineStyle(IMPACT_LINE_WIDTH, impact.colour, mark.alpha);
        g.lineBetween(x + mark.from.x, y + mark.from.y, x + mark.to.x, y + mark.to.y);
      } else if (mark.kind === "tint") {
        g.fillStyle(impact.colour, mark.alpha);
        g.fillCircle(x, y, mark.radius);
      } else {
        g.lineStyle(IMPACT_LINE_WIDTH, impact.colour, mark.alpha);
        g.strokeCircle(x, y, mark.radius);
      }
    }
  }

  private drawSwingFlash(g: Phaser.GameObjects.Graphics, flash: SwingFlash): void {
    const alpha = swingFlashAlpha(flash);
    const { x, y } = flash.centre;
    const from = flash.angle - Math.PI / 4;
    const to = flash.angle + Math.PI / 4;
    g.lineStyle(2, flash.colour, alpha);
    g.beginPath();
    g.arc(x, y, flash.radius, from, to);
    g.strokePath();
    if (flash.own) {
      // Along the outer edge, as your circle gets its rim.
      g.lineStyle(1, SELF_RIM, alpha);
      g.beginPath();
      g.arc(x, y, flash.radius + 1.5, from, to);
      g.strokePath();
    }
  }

  /**
   * Shots in flight, over the actors: one sprite each, moved along its
   * flight against the match clock. Once a shot ends, by landing or by
   * leaving the state, it holds at its end point and fades out (#238),
   * timed on the scene's own clock, which keeps running after a match ends.
   * Under reduced motion it goes at once.
   */
  private updateProjectiles(now: number): void {
    const clock = this.clock.read(now);
    const flying = new Set<number>();
    const sent = new Set(this.snapshot.projectiles.map((shot) => shot.id));
    for (const id of this.endedShots) {
      if (!sent.has(id)) {
        this.endedShots.delete(id);
      }
    }
    for (const shot of this.snapshot.projectiles) {
      const position = projectilePosition(shot, clock);
      const shown = this.projectileImages.get(shot.id);
      // An ended shot never flies again, even while its id is still sent.
      if (position === undefined || this.endedShots.has(shot.id)) {
        continue;
      }
      flying.add(shot.id);
      if (shown === undefined) {
        const image = this.add
          .image(position.x, position.y, ATLAS, projectileFrame(shot.sprite))
          .setDepth(OVERLAY_DEPTH);
        image.setRotation(projectileHeading(shot));
        image.setTint(shot.colour);
        this.projectileImages.set(shot.id, { image, to: shot.to, endedAt: undefined });
      } else {
        shown.image.setPosition(position.x, position.y);
      }
    }
    const fade = !prefersReducedMotion();
    for (const [id, shown] of this.projectileImages) {
      if (flying.has(id)) {
        continue;
      }
      if (sent.has(id)) {
        this.endedShots.add(id);
      }
      if (shown.endedAt === undefined && fade) {
        shown.endedAt = now;
        shown.image.setPosition(shown.to.x, shown.to.y);
      }
      const alpha = shown.endedAt === undefined ? undefined : shotFadeAlpha(shown.endedAt, now);
      if (alpha === undefined) {
        shown.image.destroy();
        this.projectileImages.delete(id);
      } else {
        shown.image.setAlpha(alpha);
      }
    }
  }

  /**
   * One actor: its body on `g`, every mark on it on `marks`, over the
   * body glyphs (#1037). In a clump a neighbour's weapon now crosses your
   * body: the weapon is the more urgent read.
   */
  private drawActor(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
  ): void {
    const { x, y } = actor.position;

    if (actor.dead) {
      // A corpse stays visible but obviously inert: hollow, grey, no bars;
      // darker once a skill has exploited it (#466).
      const colour = actor.exploited ? EXPLOITED_CORPSE_COLOUR : DEAD_COLOUR;
      if (actor.creatureLook === undefined) {
        g.lineStyle(2, colour, 1);
        g.strokeCircle(x, y, actor.radius);
        return;
      }
      // A lying pet keeps its shape, dashed (#1162): a creature's corpse at a glance.
      g.lineStyle(BODY_EDGE_WIDTH, colour, 1);
      const outline = creatureOutline(x, y, actor.radius);
      for (const [from, to] of dashes(outline, actor.radius * DEAD_DASH, actor.radius * DEAD_GAP)) {
        g.lineBetween(from.x, from.y, to.x, to.y);
      }
      return;
    }

    if (actor.creatureLook !== undefined) {
      this.drawCreature(g, marks, actor, actor.creatureLook);
    } else if (actor.knockedDown) {
      this.drawLyingBody(g, marks, actor);
    } else {
      paintStandingBody(
        phaserPainter(g),
        {
          x,
          y,
          r: actor.radius,
          facing: actor.facing,
          team: actor.team,
          weaponId: actor.weaponId,
          offhandId: actor.offhandId,
          frame: this.weaponFrame(actor),
          cape: this.wornCape(actor),
        },
        phaserPainter(marks),
      );
    }
    // On the body layer, after the body and its self rim: every mark draws over the rings.
    this.drawBodyRings(g, actor);
    this.drawConditionCues(g, actor);

    if (actor.id === this.snapshot.targetId) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, y, actor.radius + TARGET_RING_OFFSET);
    }
    if (actor.id === this.snapshot.calledId) {
      this.drawCallChevron(marks, actor);
    }

    this.drawHealthBar(marks, actor);

    if (actor.castProgress !== undefined) {
      this.drawCastBar(marks, actor, actor.castProgress);
    }
  }

  /**
   * A living creature (#1162, #2047): its ornament, then its hexagon plate,
   * upright standing or knocked down; over the kind glyph, the weapon and
   * off-hand of an armed look, posed like a player's and dropped while it
   * lies, or else a facing tick.
   */
  private drawCreature(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    look: CreatureLook,
  ): void {
    const { x, y } = actor.position;
    const team = teamColour(actor.team);
    const colourOf = (colour: OrnamentColour): number =>
      colour === "team" ? team : colour === "ink" ? SELF_RIM : colour;
    for (const ornament of creatureOrnament(look, x, y, actor.radius)) {
      if (ornament.kind === "polygon") {
        tracePath(g, ornament.points);
        g.fillStyle(colourOf(ornament.colour), 1);
        g.fillPath();
        g.lineStyle(ornament.edge, BODY_EDGE, 1);
        g.strokePath();
      } else if (ornament.kind === "outline") {
        for (const [width, colour] of [
          [ornament.casing, BODY_EDGE],
          [ornament.width, colourOf(ornament.colour)],
        ] as const) {
          tracePath(g, ornament.points);
          g.lineStyle(width, colour, 1);
          g.strokePath();
        }
      } else {
        g.lineStyle(ornament.width + RING_CASING, BODY_EDGE, 1);
        g.strokeCircle(ornament.x, ornament.y, ornament.radius);
        g.lineStyle(ornament.width, colourOf(ornament.colour), 1);
        for (const arc of ornament.arcs) {
          g.beginPath();
          g.arc(ornament.x, ornament.y, ornament.radius, arc.from, arc.to);
          g.strokePath();
        }
      }
    }

    tracePath(g, creatureOutline(x, y, actor.radius));
    g.fillStyle(team, 1);
    g.fillPath();
    g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
    g.strokePath();

    if (CREATURE_ARMS[look] === undefined) {
      const [tip, left, right] = creatureTick(x, y, actor.radius, actor.facing);
      marks.fillStyle(SELF_RIM, 1);
      marks.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
      marks.lineStyle(TICK_EDGE, BODY_EDGE, 1);
      marks.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    } else if (!actor.knockedDown) {
      paintBodyMarks(phaserPainter(marks), {
        x,
        y,
        r: actor.radius,
        facing: actor.facing,
        team: actor.team,
        weaponId: actor.weaponId,
        offhandId: actor.offhandId,
        frame: this.weaponFrame(actor),
        cape: undefined,
      });
    }
  }

  /**
   * The enchantment and hex rings round a living body (#1117), and the
   * shimmer of an invulnerable one (#1233), circular even lying down.
   */
  private drawBodyRings(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const { x, y } = actor.position;
    const rings = bodyRings(actor.radius, actor);
    const shimmer = actor.invulnerable ? [invulnerableRing(actor.radius)] : [];
    for (const ring of [...rings, ...shimmer]) {
      const alpha =
        ring.kind === "invulnerable" ? invulnerableAlpha(this.now, this.reducedMotion) : 1;
      g.lineStyle(ring.width, ring.colour, alpha);
      for (const arc of ring.arcs) {
        g.beginPath();
        g.arc(x, y, ring.radius, arc.from, arc.to);
        g.strokePath();
      }
    }
  }

  /**
   * Flames, drops or bubbles on a burning, bleeding or poisoned body
   * (#1138), over its rings, round its centre even lying down.
   */
  private drawConditionCues(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    if (actor.conditionCues.length === 0) {
      return;
    }
    const { x, y } = actor.position;
    const phase = cuePhase(actor.id);
    for (const cue of actor.conditionCues) {
      for (const mark of conditionMarks(cue, actor.radius, this.now, phase, this.reducedMotion)) {
        if (mark.kind === "flame") {
          const [a, b, tip] = mark.points;
          g.fillStyle(mark.colour, 1);
          g.fillTriangle(x + a.x, y + a.y, x + b.x, y + b.y, x + tip.x, y + tip.y);
          g.lineStyle(CUE_EDGE_WIDTH, BODY_EDGE, 1);
          g.strokeTriangle(x + a.x, y + a.y, x + b.x, y + b.y, x + tip.x, y + tip.y);
        } else if (mark.kind === "drop") {
          g.fillStyle(mark.colour, mark.alpha);
          g.fillCircle(x + mark.x, y + mark.y, mark.radius);
          g.lineStyle(CUE_EDGE_WIDTH, BODY_EDGE, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
        } else {
          // A dark halo under the hollow stroke, so it reads on any team colour.
          g.lineStyle(CUE_EDGE_WIDTH + 1, BODY_EDGE, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
          g.lineStyle(CUE_EDGE_WIDTH, mark.colour, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
        }
      }
    }
  }

  /** One icon per status under every living actor; none under the dead. */
  private updateStatusIcons(): void {
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id);
      const statuses = actor.dead ? [] : this.knownStatuses(actor.statuses);
      const row = statusRowLayout(
        statuses.length,
        actor.position.x,
        actor.position.y,
        actor.radius,
      );

      const pool = this.statusIcons.get(actor.id) ?? [];
      this.statusIcons.set(actor.id, pool);
      row.icons.forEach((position, index) => {
        const frame = statusFrame(statuses[index] ?? "");
        let image = pool[index];
        if (image === undefined) {
          image = this.add.image(position.x, position.y, ATLAS, frame).setDepth(OVERLAY_DEPTH);
          pool.push(image);
        }
        image.setFrame(frame).setPosition(position.x, position.y).setVisible(true);
      });
      for (const unused of pool.slice(row.icons.length)) {
        unused.setVisible(false);
      }

      let more = this.statusOverflow.get(actor.id);
      if (row.overflow === undefined) {
        more?.setVisible(false);
        continue;
      }
      if (more === undefined) {
        more = this.add
          .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color: INK })
          .setOrigin(0.5, 0.5)
          .setDepth(OVERLAY_DEPTH);
        this.statusOverflow.set(actor.id, more);
      }
      screenSized(more, this.cameras.main.zoom);
      more
        .setText(`+${String(row.overflow.count)}`)
        .setPosition(row.overflow.position.x, row.overflow.position.y)
        .setVisible(true);
    }

    // An actor that left takes its icons with it.
    for (const [id, pool] of this.statusIcons) {
      if (!seen.has(id)) {
        for (const image of pool) {
          image.destroy();
        }
        this.statusIcons.delete(id);
        this.statusOverflow.get(id)?.destroy();
        this.statusOverflow.delete(id);
      }
    }
  }

  /**
   * Names above the bars (#53), shown only where `nameShown` says (#253):
   * your target, the body under the cursor, everyone while the names key is held.
   * Every actor keeps its label, hidden or not, so showing one is a
   * visibility flip, never a new texture. A corpse keeps its name, greyed,
   * so a player can still see who went down.
   */
  private updateNameLabels(): void {
    const zoom = this.cameras.main.zoom;
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id);
      let label = this.nameLabels.get(actor.id);
      if (label === undefined) {
        label = this.add
          .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color: INK })
          .setOrigin(0.5, 1)
          .setDepth(OVERLAY_DEPTH);
        this.nameLabels.set(actor.id, label);
      }
      // setText skips an unchanged string, but setColor redraws and
      // re-uploads the label's texture every call, so only on a change.
      const color = actor.dead ? DEAD_INK : INK;
      if (label.style.color !== color) {
        label.setColor(color);
      }
      const shown = nameShown(this.snapshot, actor);
      label.setText(
        taggedName({ name: playerLabelText(actor.name, actor.guildTag), bot: actor.bot }),
      );
      screenSized(label, zoom);
      // `width` is unscaled: the label's screen px.
      const layout = nameplateLayout(actor, label.width, zoom);
      label.setPosition(layout.textX, layout.bottom).setVisible(shown);
      this.updateNameGlyph(actor, layout, shown);
    }
    for (const [id, label] of this.nameLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.nameLabels.delete(id);
        this.nameGlyphs.get(id)?.destroy();
        this.nameGlyphs.delete(id);
      }
    }
  }

  /**
   * The glyph before `actor`'s name (#281): shown with the name, greyed with
   * a corpse's. Its frame and tint are set only when they change, as the
   * label's colour is, so a steady frame re-uploads nothing.
   */
  private updateNameGlyph(actor: RenderableActor, layout: NameplateLayout, shown: boolean): void {
    let glyph = this.nameGlyphs.get(actor.id);
    if (actor.profession === undefined || layout.glyphX === undefined) {
      glyph?.setVisible(false);
      return;
    }
    const frame = professionFrame(actor.profession);
    if (glyph === undefined) {
      glyph = this.add
        .image(0, 0, ATLAS, frame)
        .setOrigin(0.5, 1)
        .setTintMode(Phaser.TintModes.FILL)
        .setDepth(OVERLAY_DEPTH);
      this.nameGlyphs.set(actor.id, glyph);
    }
    if (glyph.frame.name !== frame) {
      glyph.setFrame(frame);
    }
    const tint = actor.dead ? DEAD_INK_TINT : INK_TINT;
    if (glyph.tint !== tint) {
      glyph.setTint(tint);
    }
    screenSized(glyph, this.cameras.main.zoom);
    glyph.setPosition(layout.glyphX, layout.bottom).setVisible(shown);
  }

  /**
   * Every ward on the ground (#1087): a translucent disc with a thin rim
   * in its side's colour, and its skill's icon at the centre, under
   * whoever stands in it; a trap (#1105) the same, with no disc. One that
   * ended takes its icon with it.
   */
  private updateGroundEffects(): void {
    const g = this.groundGraphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    // Each team's resurrection shrine (#1199): a ring in its side's colour,
    // under the wards, whether its priest stands or not.
    for (const shrine of this.snapshot.shrines) {
      g.lineStyle(2, teamColour(shrine.side), 0.7);
      g.strokeCircle(shrine.position.x, shrine.position.y, SHRINE_RADIUS);
    }
    const seen = new Set<number>();
    for (const effect of this.snapshot.groundEffects) {
      seen.add(effect.id);
      const { x, y } = effect.position;
      if (effect.filled) {
        g.fillStyle(effect.colour, 0.15);
        g.fillCircle(x, y, effect.radius);
      }
      g.lineStyle(1.5, effect.colour, 0.6);
      g.strokeCircle(x, y, effect.radius);
      const frame = groundFrame(effect.skillId);
      if (!this.textures.get(ATLAS).has(frame)) {
        continue;
      }
      let icon = this.groundIcons.get(effect.id);
      if (icon === undefined) {
        icon = this.add
          .image(x, y, ATLAS, frame)
          .setDisplaySize(GROUND_ICON_SIZE, GROUND_ICON_SIZE)
          .setAlpha(GROUND_ICON_ALPHA)
          .setDepth(GROUND_DEPTH);
        this.groundIcons.set(effect.id, icon);
      }
    }
    for (const [id, icon] of this.groundIcons) {
      if (!seen.has(id)) {
        icon.destroy();
        this.groundIcons.delete(id);
      }
    }
  }

  /**
   * The primary profession's glyph inside every body (#1037): upright,
   * world sized, between the bodies and their marks. Frame, tint and
   * alpha are set only when they change, as the name glyph's are; an actor
   * that left takes its glyph with it.
   */
  private updateBodyGlyphs(): void {
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id);
      const layout = bodyGlyphLayout(actor);
      let glyph = this.bodyGlyphs.get(actor.id);
      if (layout === undefined) {
        glyph?.setVisible(false);
        continue;
      }
      const frame =
        layout.glyph.kind === "creature"
          ? creatureFrame(layout.glyph.look)
          : bodyProfessionFrame(layout.glyph.profession);
      if (glyph === undefined) {
        glyph = this.add
          .image(0, 0, ATLAS, frame)
          .setTintMode(Phaser.TintModes.FILL)
          .setDepth(BODY_GLYPH_DEPTH);
        this.bodyGlyphs.set(actor.id, glyph);
      }
      if (glyph.frame.name !== frame) {
        glyph.setFrame(frame);
      }
      if (glyph.tint !== layout.tint) {
        glyph.setTint(layout.tint);
      }
      if (glyph.alpha !== layout.alpha) {
        glyph.setAlpha(layout.alpha);
      }
      glyph
        .setDisplaySize(layout.size, layout.size)
        .setPosition(layout.x, layout.y)
        .setVisible(true);
    }
    for (const [id, glyph] of this.bodyGlyphs) {
      if (!seen.has(id)) {
        glyph.destroy();
        this.bodyGlyphs.delete(id);
      }
    }
  }

  /**
   * The casting skill's type badge left of every cast bar (#1125): shown
   * and gone with the bar, none for a skill this client does not know. The
   * frame is set only when it changes; an actor that left takes its
   * badge with it.
   */
  private updateCastBadges(): void {
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id);
      let badge = this.castBadges.get(actor.id);
      if (actor.castType === undefined || actor.castProgress === undefined || actor.dead) {
        badge?.setVisible(false);
        continue;
      }
      const frame = skillTypeFrame(actor.castType);
      if (badge === undefined) {
        badge = this.add.image(0, 0, ATLAS, frame).setDepth(CAST_BADGE_DEPTH);
        this.castBadges.set(actor.id, badge);
      }
      if (badge.frame.name !== frame) {
        badge.setFrame(frame);
      }
      const centre = castBadgeLayout(actor.position.x, actor.position.y, actor.radius);
      badge
        .setDisplaySize(CAST_BADGE_SIZE, CAST_BADGE_SIZE)
        .setPosition(centre.x, centre.y)
        .setVisible(true);
    }
    for (const [id, badge] of this.castBadges) {
      if (!seen.has(id)) {
        badge.destroy();
        this.castBadges.delete(id);
      }
    }
  }

  /**
   * The statuses there is an icon for. A wire string this client does not
   * know (a newer server, say) is skipped and reported once, never thrown
   * on: the render loop must keep running.
   */
  private knownStatuses(ids: readonly string[]): StatusId[] {
    const known: StatusId[] = [];
    for (const id of ids) {
      if (isStatusId(id)) {
        known.push(id);
      } else if (!this.unknownStatuses.has(id)) {
        this.unknownStatuses.add(id);
        console.warn(`[arena] no icon for status "${id}"; not drawing it`);
      }
    }
    return known;
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const fraction = healthFraction(actor);
    const left = actor.position.x - HEALTH_BAR_WIDTH / 2;
    const top = actor.position.y - actor.radius - 12;

    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(fraction < 0.35 ? HEALTH_BAR_LOW : HEALTH_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * fraction, HEALTH_BAR_HEIGHT);
  }

  private drawCastBar(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    progress: number,
  ): void {
    const left = actor.position.x - HEALTH_BAR_WIDTH / 2;
    const top = actor.position.y - actor.radius - CAST_BAR_RISE;
    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(CAST_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * progress, HEALTH_BAR_HEIGHT);
  }

  private updateFloatingTexts(dt: number): void {
    const zoom = this.cameras.main.zoom;
    const survivors: FloatingText[] = [];
    for (const floating of this.floatingTexts) {
      floating.remainingSeconds -= dt;

      let object = this.floatingTextObjects.get(floating.id);
      if (object === undefined) {
        object = this.add.text(floating.position.x, floating.position.y, floating.text, {
          fontSize: FLOATING_FONT_SIZE[floating.weight],
          fontStyle: floating.weight === "critical" ? "bold" : "normal",
          fontFamily: "ui-monospace, monospace",
          color: `#${floating.colour.toString(16).padStart(6, "0")}`,
          stroke: TEXT_EDGE,
          strokeThickness: 3,
        });
        // Left-aligned, bottom on the position: it grows away from the bar.
        object.setOrigin(0, 1).setDepth(OVERLAY_DEPTH);
        this.floatingTextObjects.set(floating.id, object);
      }

      if (floating.remainingSeconds <= 0) {
        object.destroy();
        this.floatingTextObjects.delete(floating.id);
        continue;
      }

      // Drift upward and fade as it ages; placeFloatingText relies on
      // this rise to find room for the next one.
      screenSized(object, zoom);
      object.y = floatingTextY(floating, zoom);
      object.setAlpha(
        Math.min(floating.weight === "light" ? LIGHT_TEXT_ALPHA : 1, floating.remainingSeconds),
      );
      survivors.push(floating);
    }
    this.floatingTexts = survivors;
  }

  /** The grid and the walls, drawn again only when the bounds or the wall list change (#1353). */
  private drawMap(): void {
    const g = this.mapGraphics;
    const next: MapLayer = { ...this.arena, walls: this.snapshot.walls };
    if (g === undefined || !mapLayerChanged(this.drawnMap, next)) {
      return;
    }
    g.clear();
    this.drawGrid(g);
    for (const wall of next.walls) {
      this.drawWall(g, wall);
    }
    this.drawnMap = next;
  }

  private drawWall(g: Phaser.GameObjects.Graphics, wall: RenderableWall): void {
    g.fillStyle(WALL_FILL, 1);
    g.lineStyle(1, WALL_STROKE, 1);
    if (wall.kind === "rect") {
      g.fillRect(wall.x, wall.y, wall.width, wall.height);
      g.strokeRect(wall.x, wall.y, wall.width, wall.height);
      return;
    }
    // Triangulated here, once per map, and filled as triangles: Phaser
    // earcuts a `fillPoints` path again on every frame it renders (#1353).
    const flat = wall.points.flatMap((p) => [p.x, p.y]);
    const corners = Phaser.Geom.Polygon.Earcut(flat).map((index) => wall.points[index]);
    for (let i = 0; i + 2 < corners.length; i += 3) {
      const [a, b, c] = [corners[i], corners[i + 1], corners[i + 2]];
      if (a !== undefined && b !== undefined && c !== undefined) {
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
    }
    const points = wall.points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.strokePoints(points, true);
  }

  /** The grid over the arena's bounds, not the screen, and its edge in `wall-stroke`; outside is `bg`. */
  private drawGrid(g: Phaser.GameObjects.Graphics): void {
    const { width, height } = this.arena;
    const step = 64;
    g.lineStyle(1, GRID, 1);
    for (let x = 0; x <= width; x += step) {
      g.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += step) {
      g.lineBetween(0, y, width, y);
    }
    g.lineStyle(1, WALL_STROKE, 1);
    g.strokeRect(0, 0, width, height);
  }
}

/** Each layer's painter, made once: a body is painted every frame. */
const painters = new WeakMap<Phaser.GameObjects.Graphics, Painter>();

/** `g` as the painter a body is drawn through (#1250). */
function phaserPainter(g: Phaser.GameObjects.Graphics): Painter {
  let painter = painters.get(g);
  if (painter === undefined) {
    painter = {
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillCircle: (x, y, radius) => g.fillCircle(x, y, radius),
      strokeCircle: (x, y, radius) => g.strokeCircle(x, y, radius),
      beginPath: () => g.beginPath(),
      moveTo: (x, y) => g.moveTo(x, y),
      lineTo: (x, y) => g.lineTo(x, y),
      arc: (x, y, radius, from, to) => g.arc(x, y, radius, from, to),
      strokePath: () => g.strokePath(),
      fillPoints: (points) =>
        g.fillPoints(
          points.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
          true,
        ),
    };
    painters.set(g, painter);
  }
  return painter;
}

/** Begins a closed path along `points` on `g`, to fill or stroke. */
function tracePath(g: Phaser.GameObjects.Graphics, points: readonly Point[]): void {
  const [first, ...rest] = points;
  g.beginPath();
  if (first !== undefined) {
    g.moveTo(first.x, first.y);
    for (const point of rest) {
      g.lineTo(point.x, point.y);
    }
  }
  g.closePath();
}

export type {
  AreaFlash,
  ArenaSnapshot,
  FloatingText,
  PolygonRenderableWall,
  RectRenderableWall,
  RenderableActor,
  RenderableWall,
} from "./arena-snapshot.js";
export { EMPTY_SNAPSHOT, actorAtPoint, healthFraction, teamColour } from "./arena-snapshot.js";

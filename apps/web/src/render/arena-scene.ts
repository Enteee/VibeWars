import Phaser from "phaser";

import {
  PROFESSIONS,
  isStatusId,
  isWeaponId,
  type ProfessionId,
  type StatusId,
  type Vec2,
} from "@vibewars/game-core";

import { professionIcon } from "../ui/icons.js";
import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import {
  EMPTY_SNAPSHOT,
  PROFESSION_GLYPH_SIZE,
  areaFlashAlpha,
  decayAreaFlashes,
  decaySwingFlashes,
  floatingTextY,
  healthFraction,
  nameShown,
  offhandMarkLayout,
  nameplateLayout,
  placeFloatingText,
  swingFlashAlpha,
  teamColour,
  type AreaFlash,
  type NameplateLayout,
  type SwingFlash,
} from "./arena-snapshot.js";
import {
  MatchClock,
  PROJECTILE_HEIGHT,
  PROJECTILE_SPRITES,
  PROJECTILE_WIDTH,
  projectileHeading,
  projectilePosition,
  projectileSpriteUrl,
  shotFadeAlpha,
} from "./projectiles.js";
import { NO_COVER, type CameraView, type Cover } from "./camera-rig.js";
import { edgeMarkers, type EdgeBody, type EdgeMarker } from "./edge-markers.js";
import { STATUS_ICON, STATUS_ICON_SIZE, statusRowLayout } from "./status-icons.js";
import {
  decayWalkMarker,
  walkMarkerAlpha,
  walkMarkerAt,
  walkMarkerTicks,
  type WalkMarker,
} from "./walk-marker.js";
import { AttackClock, REST_FRAME, shownFrame } from "./attack-clock.js";
import { lyingPose } from "./lying-pose.js";
import { weaponMarkLayout } from "./weapon-mark.js";
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
/**
 * The target ring's radius past the body's edge (operator Q26): its 2 px
 * stroke spans r + 8 … r + 10, clear of the weapon mark (r + 7.5) and the
 * off-hand mark (inside r + 7).
 */
const TARGET_RING_OFFSET = 9;
const GRID = 0x1a212c;
const HEALTH_BAR_BG = 0x11161d;
const HEALTH_BAR_FILL = 0x7ee787;
const HEALTH_BAR_LOW = 0xff7b72;
// Ink, not blue: a blue bar over an enemy would read as "an ally".
const CAST_BAR_FILL = 0xd7dee8;
/** Marks the actor you control, inside its circle, in any team colour. */
const SELF_RIM = 0xd7dee8;
/** Edges every living body, darker than the grid and walls, so no body blends into what it stands on. */
const BODY_EDGE = 0x0b0f14;
const BODY_EDGE_WIDTH = 1.5;
const DEAD_COLOUR = 0x4a5464;
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
/** Over every world object, names and numbers included. */
const EDGE_MARKER_DEPTH = 10;

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  private graphics: Phaser.GameObjects.Graphics | undefined;
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
  private walkMarker: WalkMarker | undefined;
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
    const placed = placeFloatingText(this.floatingTexts, text);
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
  public addSwingFlash(flash: SwingFlash): void {
    if (!prefersReducedMotion()) {
      this.swingFlashes.push(flash);
    }
  }

  public preload(): void {
    for (const [id, url] of Object.entries(STATUS_ICON)) {
      this.load.svg(statusTexture(id), url, {
        width: STATUS_ICON_SIZE,
        height: STATUS_ICON_SIZE,
      });
    }
    // Drawn in ink, never the profession colour: in the arena, colour is team.
    for (const profession of Object.keys(PROFESSIONS) as ProfessionId[]) {
      this.load.svg(professionTexture(profession), professionIcon(profession), {
        width: PROFESSION_GLYPH_SIZE,
        height: PROFESSION_GLYPH_SIZE,
      });
    }
    for (const sprite of PROJECTILE_SPRITES) {
      this.load.svg(projectileTexture(sprite), projectileSpriteUrl(sprite), {
        width: PROJECTILE_WIDTH,
        height: PROJECTILE_HEIGHT,
      });
    }
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.markerGraphics = this.add.graphics().setDepth(EDGE_MARKER_DEPTH);
  }

  public override update(time: number, deltaMs: number): void {
    const g = this.graphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    this.now = time / 1000;
    this.reducedMotion = prefersReducedMotion();
    this.clock.observe(this.snapshot.clock, this.now);
    this.observeAttacks();
    this.drawGrid(g);
    for (const wall of this.snapshot.walls) {
      this.drawWall(g, wall);
    }
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
    for (const actor of this.snapshot.actors) {
      this.drawActor(g, actor);
    }
    this.swingFlashes = decaySwingFlashes(this.swingFlashes, deltaMs / 1000);
    for (const flash of this.swingFlashes) {
      this.drawSwingFlash(g, flash);
    }
    this.updateProjectiles(time / 1000);
    this.updateStatusIcons();
    this.updateNameLabels();
    this.updateFloatingTexts(deltaMs / 1000);
    this.updateEdgeMarkers();
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
      clock.observe(this.snapshot.clock, actor.swingElapsed, total, actor.weaponId);
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
   * your own, which the follow camera should never need. Drawn in world
   * space through the inverse of the camera, so it sits still on screen at
   * any zoom.
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
    const bodies: EdgeBody[] = this.snapshot.actors.map((actor) => ({
      id: actor.id,
      kind: actor.team === "self" ? "self" : actor.team === "ally" ? "friend" : "foe",
      position: actor.position,
      dead: actor.dead,
      targeted: actor.id === this.snapshot.targetId,
    }));
    for (const marker of edgeMarkers(bodies, view, screen, this.cover)) {
      this.drawEdgeMarker(g, marker, view, screen);
    }
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
   * The off-hand mark (#276): an `edge` casing under an `ink` core, like
   * the weapon mark. The shield is one arc path stroked twice, the focus
   * one circle per colour.
   */
  private drawOffhandMark(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const { x, y } = actor.position;
    const mark = offhandMarkLayout(x, y, actor.radius, actor.facing, actor.offhandId);
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
   * A knocked-down body (#545): the disc flattened along its facing, edged
   * as a standing one is, with the weapon mark dropped beside it. The
   * off-hand is not drawn: one dropped thing reads, two clutter.
   */
  private drawLyingBody(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const { x, y } = actor.position;
    const pose = lyingPose(x, y, actor.radius, actor.facing);
    const outline = (points: readonly { readonly x: number; readonly y: number }[]) => {
      const [first, ...rest] = points;
      g.beginPath();
      if (first !== undefined) {
        g.moveTo(first.x, first.y);
        for (const point of rest) {
          g.lineTo(point.x, point.y);
        }
      }
      g.closePath();
    };
    g.fillStyle(teamColour(actor.team), 1);
    outline(pose.body);
    g.fillPath();
    g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
    g.strokePath();
    if (actor.team === "self") {
      g.lineStyle(2, SELF_RIM, 1);
      outline(lyingPose(x, y, actor.radius - 2, actor.facing).body);
      g.strokePath();
    }
    this.drawWeaponMark(g, actor, pose.weapon);
  }

  /**
   * The weapon mark (#188, #418): a 4 px `edge` casing, then a 2 px `ink` core,
   * so the line reads on either team's colour. The casing also outlines the
   * filled shapes, which the core then fills. Bow strings are one extra
   * pass, thinner: a 3 px casing under a 1 px core.
   */
  private drawWeaponMark(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    // Where a knocked-down body dropped it (#545): lying still, at rest.
    dropped?: {
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly facing: number;
    },
  ): void {
    const at = dropped ?? { ...actor.position, r: actor.radius, facing: actor.facing };
    const frame =
      actor.weaponId === undefined || !isWeaponId(actor.weaponId)
        ? undefined
        : dropped !== undefined
          ? REST_FRAME
          : shownFrame(
              this.attackClocks.get(actor.id),
              this.clock.read(this.now),
              actor.weaponId,
              this.reducedMotion,
            );
    if (frame === undefined) {
      return;
    }
    const { strokes, fills, strings, alpha } = weaponMarkLayout(
      at.x,
      at.y,
      at.r,
      at.facing,
      actor.weaponId,
      frame,
    );
    if ((strokes.length === 0 && fills.length === 0) || alpha <= 0) {
      return;
    }
    const trace = (
      points: readonly { readonly x: number; readonly y: number }[],
      close: boolean,
    ) => {
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
      g.fillPoints(
        shape.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
        true,
      );
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
        const image = this.add.image(position.x, position.y, projectileTexture(shot.sprite));
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

  private drawActor(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const { x, y } = actor.position;

    if (actor.dead) {
      // A corpse stays visible but obviously inert: hollow, grey, no bars.
      g.lineStyle(2, DEAD_COLOUR, 1);
      g.strokeCircle(x, y, actor.radius);
      return;
    }

    if (actor.knockedDown) {
      this.drawLyingBody(g, actor);
    } else {
      g.fillStyle(teamColour(actor.team), 1);
      g.fillCircle(x, y, actor.radius);
      // Centred half its width in, so the edge stays inside the collision
      // radius (#166) and only touches the self rim inside it.
      g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
      g.strokeCircle(x, y, actor.radius - BODY_EDGE_WIDTH / 2);

      if (actor.team === "self") {
        g.lineStyle(2, SELF_RIM, 1);
        g.strokeCircle(x, y, actor.radius - 2);
      }

      // Off-hand, then weapon mark, then target ring: the order #275 gives.
      this.drawOffhandMark(g, actor);
      this.drawWeaponMark(g, actor);
    }

    if (actor.id === this.snapshot.targetId) {
      g.lineStyle(2, TARGET_RING, 1);
      g.strokeCircle(x, y, actor.radius + TARGET_RING_OFFSET);
    }

    this.drawHealthBar(g, actor);

    if (actor.castProgress !== undefined) {
      this.drawCastBar(g, actor, actor.castProgress);
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
        const texture = statusTexture(statuses[index] ?? "");
        let image = pool[index];
        if (image === undefined) {
          image = this.add.image(position.x, position.y, texture);
          pool.push(image);
        }
        image.setTexture(texture).setPosition(position.x, position.y).setVisible(true);
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
          .setOrigin(0.5, 0.5);
        this.statusOverflow.set(actor.id, more);
      }
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
    const seen = new Set<string>();
    for (const actor of this.snapshot.actors) {
      seen.add(actor.id);
      let label = this.nameLabels.get(actor.id);
      if (label === undefined) {
        label = this.add
          .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color: INK })
          .setOrigin(0.5, 1);
        this.nameLabels.set(actor.id, label);
      }
      // setText skips an unchanged string, but setColor redraws and
      // re-uploads the label's texture every call, so only on a change.
      const color = actor.dead ? DEAD_INK : INK;
      if (label.style.color !== color) {
        label.setColor(color);
      }
      const shown = nameShown(this.snapshot, actor);
      label.setText(actor.name);
      const layout = nameplateLayout(actor, label.width);
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
   * a corpse's. Its texture and tint are set only when they change, as the
   * label's colour is, so a steady frame re-uploads nothing.
   */
  private updateNameGlyph(actor: RenderableActor, layout: NameplateLayout, shown: boolean): void {
    let glyph = this.nameGlyphs.get(actor.id);
    if (actor.profession === undefined || layout.glyphX === undefined) {
      glyph?.setVisible(false);
      return;
    }
    const texture = professionTexture(actor.profession);
    if (glyph === undefined) {
      glyph = this.add.image(0, 0, texture).setOrigin(0.5, 1).setTintMode(Phaser.TintModes.FILL);
      this.nameGlyphs.set(actor.id, glyph);
    }
    if (glyph.texture.key !== texture) {
      glyph.setTexture(texture);
    }
    const tint = actor.dead ? DEAD_INK_TINT : INK_TINT;
    if (glyph.tint !== tint) {
      glyph.setTint(tint);
    }
    glyph.setPosition(layout.glyphX, layout.bottom).setVisible(shown);
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
    const top = actor.position.y - actor.radius - 19;
    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(CAST_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * progress, HEALTH_BAR_HEIGHT);
  }

  private updateFloatingTexts(dt: number): void {
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
        object.setOrigin(0, 1);
        this.floatingTextObjects.set(floating.id, object);
      }

      if (floating.remainingSeconds <= 0) {
        object.destroy();
        this.floatingTextObjects.delete(floating.id);
        continue;
      }

      // Drift upward and fade as it ages; placeFloatingText relies on
      // this rise to find room for the next one.
      object.y = floatingTextY(floating);
      object.setAlpha(
        Math.min(floating.weight === "light" ? LIGHT_TEXT_ALPHA : 1, floating.remainingSeconds),
      );
      survivors.push(floating);
    }
    this.floatingTexts = survivors;
  }

  private drawWall(g: Phaser.GameObjects.Graphics, wall: RenderableWall): void {
    g.fillStyle(WALL_FILL, 1);
    g.lineStyle(1, WALL_STROKE, 1);
    if (wall.kind === "rect") {
      g.fillRect(wall.x, wall.y, wall.width, wall.height);
      g.strokeRect(wall.x, wall.y, wall.width, wall.height);
      return;
    }
    const points = wall.points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.fillPoints(points, true);
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

function projectileTexture(sprite: string): string {
  return `projectile:${sprite}`;
}

function professionTexture(profession: ProfessionId): string {
  return `profession:${profession}`;
}

function statusTexture(id: string): string {
  return `status:${id}`;
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

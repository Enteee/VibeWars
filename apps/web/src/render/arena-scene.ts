import Phaser from "phaser";

import { isStatusId, type StatusId } from "@vibewars/game-core";

import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import {
  EMPTY_SNAPSHOT,
  areaFlashAlpha,
  decayAreaFlashes,
  decaySwingFlashes,
  floatingTextY,
  healthFraction,
  nameLabelBottom,
  placeFloatingText,
  swingFlashAlpha,
  teamColour,
  type AreaFlash,
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
} from "./projectiles.js";
import { STATUS_ICON, STATUS_ICON_SIZE, statusRowLayout } from "./status-icons.js";
import { weaponFamily, weaponLineLayout } from "./weapon-line.js";
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
const INK = "#d7dee8";
const DEAD_INK = "#4a5464";

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  private graphics: Phaser.GameObjects.Graphics | undefined;
  private snapshot: ArenaSnapshot = EMPTY_SNAPSHOT;
  private floatingTexts: FloatingText[] = [];
  private areaFlashes: AreaFlash[] = [];
  private swingFlashes: SwingFlash[] = [];
  /** One sprite per shot in flight, by projectile id. */
  private projectileImages = new Map<number, Phaser.GameObjects.Image>();
  private readonly clock = new MatchClock();
  private floatingTextObjects = new Map<number, Phaser.GameObjects.Text>();
  /**
   * Status icons per actor id, reused frame to frame: hidden when not
   * needed, created only when an actor shows more than it ever has.
   */
  private statusIcons = new Map<string, Phaser.GameObjects.Image[]>();
  private statusOverflow = new Map<string, Phaser.GameObjects.Text>();
  /** One name label per actor id, reused frame to frame like the icons. */
  private nameLabels = new Map<string, Phaser.GameObjects.Text>();
  /** Status ids the server sent that this client has no icon for. */
  private readonly unknownStatuses = new Set<string>();

  public constructor() {
    super(ArenaScene.KEY);
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
    for (const sprite of PROJECTILE_SPRITES) {
      this.load.svg(projectileTexture(sprite), projectileSpriteUrl(sprite), {
        width: PROJECTILE_WIDTH,
        height: PROJECTILE_HEIGHT,
      });
    }
  }

  public create(): void {
    this.graphics = this.add.graphics();
  }

  public override update(time: number, deltaMs: number): void {
    const g = this.graphics;
    if (g === undefined) {
      return;
    }
    g.clear();
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
  }

  /**
   * The weapon mark (#188): a 4 px `edge` casing, then a 2 px `ink` core,
   * so the line reads on either team's colour. The casing also outlines the
   * filled tips, which the core then fills.
   */
  private drawWeaponLine(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const family = weaponFamily(actor.weaponId);
    if (family === undefined) {
      return;
    }
    const { x, y } = actor.position;
    const { strokes, fills } = weaponLineLayout(x, y, actor.radius, actor.facing, family);
    if (strokes.length === 0) {
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

    g.lineStyle(4, BODY_EDGE, 1);
    g.beginPath();
    for (const line of strokes) {
      trace(line, false);
    }
    for (const shape of fills) {
      trace(shape, true);
    }
    g.strokePath();

    g.lineStyle(2, SELF_RIM, 1);
    g.beginPath();
    for (const line of strokes) {
      trace(line, false);
    }
    g.strokePath();
    g.fillStyle(SELF_RIM, 1);
    for (const shape of fills) {
      g.fillPoints(
        shape.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
        true,
      );
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
   * flight against the match clock, gone once it lands or leaves the state.
   */
  private updateProjectiles(now: number): void {
    this.clock.observe(this.snapshot.clock, now);
    const clock = this.clock.read(now);
    const flying = new Set<number>();
    for (const shot of this.snapshot.projectiles) {
      const position = projectilePosition(shot, clock);
      if (position === undefined) {
        continue;
      }
      flying.add(shot.id);
      let image = this.projectileImages.get(shot.id);
      if (image === undefined) {
        image = this.add.image(position.x, position.y, projectileTexture(shot.sprite));
        image.setRotation(projectileHeading(shot));
        image.setTint(shot.colour);
        this.projectileImages.set(shot.id, image);
      }
      image.setPosition(position.x, position.y);
    }
    for (const [id, image] of this.projectileImages) {
      if (!flying.has(id)) {
        image.destroy();
        this.projectileImages.delete(id);
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

    // Under the target ring, which covers the pixel the casing overlaps.
    this.drawWeaponLine(g, actor);

    if (actor.id === this.snapshot.targetId) {
      g.lineStyle(2, TARGET_RING, 1);
      g.strokeCircle(x, y, actor.radius + 5);
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
   * Every actor's name above its bars (#53). A corpse keeps its name, greyed,
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
      label.setText(actor.name).setPosition(actor.position.x, nameLabelBottom(actor));
    }
    for (const [id, label] of this.nameLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.nameLabels.delete(id);
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
          fontSize: floating.weight === "light" ? "11px" : "13px",
          fontFamily: "ui-monospace, monospace",
          color: `#${floating.colour.toString(16).padStart(6, "0")}`,
        });
        object.setOrigin(0.5, 1);
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

  private drawGrid(g: Phaser.GameObjects.Graphics): void {
    const { width, height } = this.scale;
    const step = 64;
    g.lineStyle(1, GRID, 1);
    for (let x = 0; x <= width; x += step) {
      g.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += step) {
      g.lineBetween(0, y, width, y);
    }
  }
}

function projectileTexture(sprite: string): string {
  return `projectile:${sprite}`;
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

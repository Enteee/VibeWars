import Phaser from "phaser";

import { EMPTY_SNAPSHOT, healthFraction, teamColour } from "./arena-snapshot.js";
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
const CAST_BAR_FILL = 0x59c2ff;
const DEAD_COLOUR = 0x4a5464;
const STATUS_MARKER = 0xffa657;

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  private graphics: Phaser.GameObjects.Graphics | undefined;
  private snapshot: ArenaSnapshot = EMPTY_SNAPSHOT;
  private floatingTexts: FloatingText[] = [];
  private floatingTextObjects = new Map<number, Phaser.GameObjects.Text>();

  public constructor() {
    super(ArenaScene.KEY);
  }

  /** Replace the snapshot to draw on the next frame. */
  public setSnapshot(snapshot: ArenaSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Queue a floating number/label above a world position. */
  public addFloatingText(text: FloatingText): void {
    this.floatingTexts.push(text);
  }

  public create(): void {
    this.graphics = this.add.graphics();
  }

  public override update(_time: number, deltaMs: number): void {
    const g = this.graphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    this.drawGrid(g);
    for (const wall of this.snapshot.walls) {
      this.drawWall(g, wall);
    }
    for (const actor of this.snapshot.actors) {
      this.drawActor(g, actor);
    }
    this.updateFloatingTexts(deltaMs / 1000);
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

    if (actor.id === this.snapshot.targetId) {
      g.lineStyle(2, TARGET_RING, 1);
      g.strokeCircle(x, y, actor.radius + 5);
    }

    this.drawHealthBar(g, actor);

    if (actor.castProgress !== undefined) {
      this.drawCastBar(g, actor, actor.castProgress);
    }

    if (actor.statuses.length > 0) {
      // One small marker per active status, in a row under the actor.
      // Deliberately unlabelled geometry: at a glance a player needs
      // "something is on them and how much", not a legend to read.
      g.fillStyle(STATUS_MARKER, 1);
      const startX = x - (actor.statuses.length - 1) * 4;
      for (let i = 0; i < actor.statuses.length; i += 1) {
        g.fillCircle(startX + i * 8, y + actor.radius + 8, 2.5);
      }
    }
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
          fontSize: "13px",
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

      // Drift upward and fade as it ages, so overlapping hits stay readable.
      object.y -= 24 * dt;
      object.setAlpha(Math.min(1, floating.remainingSeconds));
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

export type {
  ArenaSnapshot,
  FloatingText,
  PolygonRenderableWall,
  RectRenderableWall,
  RenderableActor,
  RenderableWall,
} from "./arena-snapshot.js";
export { EMPTY_SNAPSHOT, actorAtPoint, healthFraction, teamColour } from "./arena-snapshot.js";

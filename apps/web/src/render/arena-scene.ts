import Phaser from "phaser";

import { EMPTY_SNAPSHOT } from "./arena-snapshot.js";
import type { ArenaSnapshot, RenderableWall } from "./arena-snapshot.js";

/**
 * Minimal geometric renderer.
 *
 * This scene is a *view*. It reads a snapshot and draws it; it never decides
 * anything about the game (brief §41). Keeping it dumb is what allows the
 * simulation to be tested headlessly. The snapshot shape and its pure
 * helpers live in `arena-snapshot.ts`, which has no Phaser dependency — see
 * that file for why that split exists.
 */

const WALL_FILL = 0x202836;
const WALL_STROKE = 0x3b4759;
const TARGET_RING = 0xffd866;
const GRID = 0x1a212c;

const TEAM_COLOURS = {
  self: 0x59c2ff,
  ally: 0x7ee787,
  enemy: 0xff7b72,
} as const;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  private graphics: Phaser.GameObjects.Graphics | undefined;
  private snapshot: ArenaSnapshot = EMPTY_SNAPSHOT;

  public constructor() {
    super(ArenaScene.KEY);
  }

  /** Replace the snapshot to draw on the next frame. */
  public setSnapshot(snapshot: ArenaSnapshot): void {
    this.snapshot = snapshot;
  }

  public create(): void {
    this.graphics = this.add.graphics();
  }

  public override update(): void {
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
      g.fillStyle(TEAM_COLOURS[actor.team], 1);
      g.fillCircle(actor.position.x, actor.position.y, actor.radius);
      if (actor.id === this.snapshot.targetId) {
        g.lineStyle(2, TARGET_RING, 1);
        g.strokeCircle(actor.position.x, actor.position.y, actor.radius + 5);
      }
    }
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
  PolygonRenderableWall,
  RectRenderableWall,
  RenderableActor,
  RenderableWall,
} from "./arena-snapshot.js";
export { EMPTY_SNAPSHOT, actorAtPoint, teamColour } from "./arena-snapshot.js";

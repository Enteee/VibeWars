import Phaser from "phaser";

import { Vec, type Vec2 } from "@vibewars/game-core";

/**
 * Minimal geometric renderer.
 *
 * This scene is a *view*. It reads a snapshot and draws it; it never decides
 * anything about the game (brief §41). Keeping it dumb is what allows the
 * simulation to be tested headlessly.
 */

export interface RenderableActor {
  readonly id: string;
  readonly position: Vec2;
  readonly radius: number;
  readonly team: "ally" | "enemy" | "self";
}

export interface RenderableWall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  readonly targetId: string | undefined;
}

const TEAM_COLOURS: Record<RenderableActor["team"], number> = {
  self: 0x59c2ff,
  ally: 0x7ee787,
  enemy: 0xff7b72,
};

const WALL_FILL = 0x202836;
const WALL_STROKE = 0x3b4759;
const TARGET_RING = 0xffd866;
const GRID = 0x1a212c;

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  targetId: undefined,
};

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
      g.fillStyle(WALL_FILL, 1);
      g.fillRect(wall.x, wall.y, wall.width, wall.height);
      g.lineStyle(1, WALL_STROKE, 1);
      g.strokeRect(wall.x, wall.y, wall.width, wall.height);
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

/** Exposed for tests: colour lookup must stay total over the team union. */
export function teamColour(team: RenderableActor["team"]): number {
  return TEAM_COLOURS[team];
}

/** Hit-test a point against actors; used by click-to-target (Sprint 5). */
export function actorAtPoint(snapshot: ArenaSnapshot, point: Vec2): RenderableActor | undefined {
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of snapshot.actors) {
    const d = Vec.distance(actor.position, point);
    if (d <= actor.radius && d < bestDistance) {
      best = actor;
      bestDistance = d;
    }
  }
  return best;
}

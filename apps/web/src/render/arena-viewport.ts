import type Phaser from "phaser";

import { vec2, type Vec2 } from "@vibewars/game-core";

import type { ArenaScene } from "./arena-scene.js";
import { WHEEL_IDLE, feedWheel, type CameraView, type Size } from "./camera-rig.js";

/** A running Phaser host for one `ArenaScene`, whatever feeds it snapshots. */
export interface ArenaViewport {
  readonly scene: ArenaScene;
  /** Called once per rendered frame; returns the unsubscribe. */
  onFrame(handler: (deltaSeconds: number) => void): () => void;
  /**
   * A left click or a tap on the arena, in world units; returns the
   * unsubscribe. Other buttons do nothing yet, and their menus stay.
   */
  onPointerDown(handler: (world: Vec2) => void): () => void;
  /**
   * A wheel notch over the canvas: `1` down, `-1` up (#440). Over the
   * canvas only, the page neither scrolls nor zooms, Ctrl held or not, so
   * a trackpad pinch never zooms the page. Returns the unsubscribe.
   */
  onWheelNotch(handler: (direction: -1 | 1) => void): () => void;
  /**
   * The world point under the cursor through the camera as it is now, or
   * `undefined` off the canvas: a still cursor over a moving camera is
   * over a new point every frame, so a name under it follows (#253).
   */
  pointerWorld(): Vec2 | undefined;
  /** The cursor on the canvas, CSS px, or `undefined` off it. */
  pointerScreen(): Vec2 | undefined;
  /** The canvas, CSS px. */
  size(): Size;
  /** Point the camera; the scene draws through it from this frame. */
  setCamera(view: CameraView): void;
  /** The arena's bounds, for the grid, its edge and the camera's clamp. */
  setArenaBounds(width: number, height: number): void;
  /** Re-measure the parent, after the layout around it changed. */
  refreshScale(): void;
  destroy(): void;
}

/**
 * Start a Phaser game in `parent` with the arena scene, resolved once the
 * scene exists. Only this and `ArenaScene` touch Phaser (ADR-0010); the
 * callers wire a connection to it.
 */
export async function createArenaViewport(parent: HTMLElement): Promise<ArenaViewport> {
  // Loaded on first use, not at import: the build editor imports this
  // module through the training panel, and its pure functions are tested
  // in node, where Phaser cannot even be imported.
  const [{ default: Phaser }, { ArenaScene }] = await Promise.all([
    import("phaser"),
    import("./arena-scene.js"),
  ]);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0e1116",
    // The canvas is its parent's size in CSS px; the camera decides how
    // much world that shows (camera-rig.ts).
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArenaScene],
  });

  const scene = await new Promise<ArenaScene>((resolve) => {
    game.events.once(Phaser.Core.Events.READY, () => {
      const candidate = game.scene.getScene(ArenaScene.KEY);
      if (candidate instanceof ArenaScene) {
        resolve(candidate);
      }
    });
  });

  /** The cursor on the canvas, game px, which RESIZE makes CSS px. */
  let pointer: Vec2 | undefined;
  const onMove = (moved: Phaser.Input.Pointer): void => {
    pointer = vec2(moved.x, moved.y);
  };
  const onOut = (): void => {
    pointer = undefined;
  };
  scene.input.on("pointermove", onMove);
  scene.input.on("gameout", onOut);

  return {
    scene,
    onFrame(handler) {
      // STEP passes the frame's delta in milliseconds.
      const onStep = (_time: number, deltaMs: number): void => {
        handler(deltaMs / 1000);
      };
      game.events.on(Phaser.Core.Events.STEP, onStep);
      return () => {
        game.events.off(Phaser.Core.Events.STEP, onStep);
      };
    },
    onPointerDown(handler) {
      const onDown = (pointer: Phaser.Input.Pointer): void => {
        if (pointer.button === 0) {
          handler(vec2(pointer.worldX, pointer.worldY));
        }
      };
      scene.input.on("pointerdown", onDown);
      return () => {
        scene.input.off("pointerdown", onDown);
      };
    },
    onWheelNotch(handler) {
      let wheel = WHEEL_IDLE;
      const onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        const fed = feedWheel(wheel, event.deltaY, event.deltaMode, event.timeStamp);
        wheel = fed.state;
        if (fed.notch !== undefined) {
          handler(fed.notch);
        }
      };
      game.canvas.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        game.canvas.removeEventListener("wheel", onWheel);
      };
    },
    pointerWorld() {
      if (pointer === undefined) {
        return undefined;
      }
      const world = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      return vec2(world.x, world.y);
    },
    pointerScreen() {
      return pointer;
    },
    size() {
      return { width: game.scale.width, height: game.scale.height };
    },
    setCamera(view) {
      scene.setCamera(view);
    },
    setArenaBounds(width, height) {
      scene.setArenaBounds(width, height);
    },
    refreshScale() {
      game.scale.refresh();
    },
    destroy() {
      scene.input.off("pointermove", onMove);
      scene.input.off("gameout", onOut);
      game.destroy(true);
    },
  };
}

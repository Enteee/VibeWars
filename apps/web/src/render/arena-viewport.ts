import Phaser from "phaser";

import { vec2, type Vec2 } from "@vibewars/game-core";

import { ArenaScene } from "./arena-scene.js";

/**
 * How the arena fills its parent element.
 *
 * Not cosmetic: world units are screen pixels at scale 1, so `resize` in a
 * narrow column shows only the top-left corner of the map. `fit` gives the
 * game a fixed world-sized canvas and scales it to the parent, which also
 * keeps `pointer.worldX/worldY` in world units with no transform math.
 */
export type ArenaScaleMode =
  | { readonly mode: "resize" } // the match view
  | { readonly mode: "fit"; readonly width: number; readonly height: number }; // a fixed world, scaled to fit

/** A running Phaser host for one `ArenaScene`, whatever feeds it snapshots. */
export interface ArenaViewport {
  readonly scene: ArenaScene;
  /** Called once per rendered frame; returns the unsubscribe. */
  onFrame(handler: (deltaSeconds: number) => void): () => void;
  /** A click or tap on the arena, in world units; returns the unsubscribe. */
  onPointerDown(handler: (world: Vec2) => void): () => void;
  /** Re-measure the parent, after the layout around it changed. */
  refreshScale(): void;
  destroy(): void;
}

/**
 * Start a Phaser game in `parent` with the arena scene, resolved once the
 * scene exists. Only this and `ArenaScene` touch Phaser (ADR-0010); the
 * callers wire a connection to it.
 */
export async function createArenaViewport(
  parent: HTMLElement,
  scale: ArenaScaleMode,
): Promise<ArenaViewport> {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0e1116",
    scale:
      scale.mode === "resize"
        ? { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
        : {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: scale.width,
            height: scale.height,
          },
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
        handler(vec2(pointer.worldX, pointer.worldY));
      };
      scene.input.on("pointerdown", onDown);
      return () => {
        scene.input.off("pointerdown", onDown);
      };
    },
    refreshScale() {
      game.scale.refresh();
    },
    destroy() {
      game.destroy(true);
    },
  };
}

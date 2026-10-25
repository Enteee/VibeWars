import type Phaser from "phaser";

import { vec2, type Vec2 } from "@vibewars/game-core";

import type { ArenaScene } from "./arena-scene.js";
import { buttonChanges, type MouseButton } from "./pointer-buttons.js";

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

/** One mouse button going down or up over the arena (#438). */
export interface ButtonEvent {
  readonly button: MouseButton;
  readonly phase: "down" | "up";
  /** Where, in world units. */
  readonly world: Vec2;
  /** Where, in CSS pixels from the canvas's top-left corner. */
  readonly screen: Vec2;
}

/** A running Phaser host for one `ArenaScene`, whatever feeds it snapshots. */
export interface ArenaViewport {
  readonly scene: ArenaScene;
  /** Called once per rendered frame; returns the unsubscribe. */
  onFrame(handler: (deltaSeconds: number) => void): () => void;
  /**
   * A mouse button went down or up over the arena, a chorded press
   * included (#438); returns the unsubscribe. Only a press that began
   * over the arena counts, and its release arrives wherever the pointer
   * is by then. A tap is the left button. The browser's menu does not
   * open over the arena.
   */
  onButton(handler: (event: ButtonEvent) => void): () => void;
  /**
   * The cursor moved over the arena, in world units, or left it
   * (`undefined`), so a name shown under it does not stay (#253).
   * Returns the unsubscribe.
   */
  onPointerMove(handler: (world: Vec2 | undefined) => void): () => void;
  /** Re-measure the parent, after the layout around it changed. */
  refreshScale(): void;
  /**
   * A new world size for a `fit` viewport, e.g. another training map.
   * Resizes the game rather than replacing it: recreating a Phaser game
   * is the leak-prone thing this whole module exists to avoid.
   */
  setWorldSize(width: number, height: number): void;
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
    onButton(handler) {
      // DOM pointer events rather than Phaser's: a second button pressed
      // while one is held arrives as a move with a new `buttons` mask, and
      // a release over the HUD only arrives through pointer capture.
      const canvas = game.canvas;
      let held = 0;
      let last: { world: Vec2; screen: Vec2 } = { world: vec2(0, 0), screen: vec2(0, 0) };
      const emit = (pressed: readonly MouseButton[], released: readonly MouseButton[]): void => {
        for (const button of pressed) {
          handler({ button, phase: "down", ...last });
        }
        for (const button of released) {
          handler({ button, phase: "up", ...last });
        }
      };
      const onPointer = (event: PointerEvent): void => {
        // Buttons held with none tracked were pressed elsewhere first.
        if (event.type !== "pointerdown" && held === 0) {
          return;
        }
        const bounds = canvas.getBoundingClientRect();
        const world = scene.cameras.main.getWorldPoint(
          game.scale.transformX(event.pageX),
          game.scale.transformY(event.pageY),
        );
        last = {
          world: vec2(world.x, world.y),
          screen: vec2(event.clientX - bounds.left, event.clientY - bounds.top),
        };
        const { pressed, released } = buttonChanges(held, event.buttons);
        held = event.buttons & 7;
        if (event.type === "pointerdown") {
          canvas.setPointerCapture(event.pointerId);
        }
        emit(pressed, released);
      };
      const releaseAll = (): void => {
        const { released } = buttonChanges(held, 0);
        held = 0;
        emit([], released);
      };
      const onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
      };
      canvas.addEventListener("pointerdown", onPointer);
      canvas.addEventListener("pointermove", onPointer);
      canvas.addEventListener("pointerup", onPointer);
      canvas.addEventListener("pointercancel", releaseAll);
      canvas.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("blur", releaseAll);
      return () => {
        canvas.removeEventListener("pointerdown", onPointer);
        canvas.removeEventListener("pointermove", onPointer);
        canvas.removeEventListener("pointerup", onPointer);
        canvas.removeEventListener("pointercancel", releaseAll);
        canvas.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("blur", releaseAll);
      };
    },
    onPointerMove(handler) {
      const onMove = (pointer: Phaser.Input.Pointer): void => {
        handler(vec2(pointer.worldX, pointer.worldY));
      };
      const onOut = (): void => {
        handler(undefined);
      };
      scene.input.on("pointermove", onMove);
      scene.input.on("gameout", onOut);
      return () => {
        scene.input.off("pointermove", onMove);
        scene.input.off("gameout", onOut);
      };
    },
    refreshScale() {
      game.scale.refresh();
    },
    setWorldSize(width, height) {
      game.scale.setGameSize(width, height);
    },
    destroy() {
      game.destroy(true);
    },
  };
}

import type Phaser from "phaser";

import { vec2, type Vec2 } from "@vibewars/game-core";

import type { ArenaScene } from "./arena-scene.js";
import { WHEEL_IDLE, feedWheel, type CameraView, type Cover, type Size } from "./camera-rig.js";
import { buttonChanges, type MouseButton } from "./pointer-buttons.js";

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
  /** Point the camera, with what the HUD covers; the scene draws through it from this frame. */
  setCamera(view: CameraView, cover: Cover): void;
  /** The arena's bounds, for the grid, its edge and the camera's clamp. */
  setArenaBounds(width: number, height: number): void;
  /** Re-measure the parent, after the layout around it changed. */
  refreshScale(): void;
  destroy(): void;
}

/**
 * Thrown by `createArenaViewport` where the browser has no WebGL (#655).
 * There is no canvas-renderer fallback: the scene's tints draw only on
 * WebGL, so the caller says so plainly instead of showing an empty arena.
 */
export class NoWebGlError extends Error {}

/** Whether this browser can make a WebGL context at all. */
export function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) !== null;
  } catch {
    return false;
  }
}

/**
 * Start a Phaser game in `parent` with the arena scene, resolved once the
 * scene exists. Only this and `ArenaScene` touch Phaser (ADR-0010); the
 * callers wire a connection to it. Throws `NoWebGlError` without WebGL.
 */
export async function createArenaViewport(parent: HTMLElement): Promise<ArenaViewport> {
  if (!hasWebGl()) {
    throw new NoWebGlError("no WebGL");
  }
  // Loaded on first use, not at import: the build editor imports this
  // module through the training panel, and its pure functions are tested
  // in node, where Phaser cannot even be imported.
  const [{ default: Phaser }, { ArenaScene }] = await Promise.all([
    import("phaser"),
    import("./arena-scene.js"),
  ]);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
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
    setCamera(view, cover) {
      scene.setCamera(view, cover);
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

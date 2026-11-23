import type Phaser from "phaser";

import { vec2, type Vec2 } from "@vibewars/game-core";

import type { ArenaScene } from "./arena-scene.js";
import { ARENA_BACKGROUND } from "./arena-palette.js";
import {
  WHEEL_IDLE,
  feedWheel,
  frameClock,
  type CameraView,
  type Cover,
  type Size,
} from "./camera-rig.js";
import { createTouchGesture } from "../input/touch-gesture.js";
import { frameTiming } from "./frame-timing.js";
import { buttonChanges, type MouseButton } from "./pointer-buttons.js";

/** One mouse button going down or up over the arena (#438), or moving while held (#442). */
export interface ButtonEvent {
  readonly button: MouseButton;
  readonly phase: "down" | "up" | "move";
  /** Where, in world units. */
  readonly world: Vec2;
  /** Whether Alt was held: a click goes to the layer below (#2831). */
  readonly altKey: boolean;
  /** Where, in CSS pixels from the canvas's top-left corner. */
  readonly screen: Vec2;
}

/** What a finger on the arena did (#3781). */
export type FingerEvent =
  /** A tap: where it was pressed, world units and CSS px from the canvas's corner. */
  | { readonly kind: "tap"; readonly world: Vec2; readonly screen: Vec2 }
  /** A long-press (#3878): where it was pressed, as a tap. */
  | { readonly kind: "long-press"; readonly world: Vec2; readonly screen: Vec2 }
  /** A one-finger drag, CSS px since the last. */
  | { readonly kind: "pan"; readonly delta: Vec2 }
  | { readonly kind: "pan-end" }
  /** A pinch notch, as a wheel notch: `-1` closer in. */
  | { readonly kind: "pinch"; readonly notch: -1 | 1 };

/** A running Phaser host for one `ArenaScene`, whatever feeds it snapshots. */
export interface ArenaViewport {
  readonly scene: ArenaScene;
  /** The canvas the arena draws on, until it is destroyed. */
  readonly canvas: HTMLCanvasElement;
  /** Called once per rendered frame; returns the unsubscribe. */
  onFrame(handler: (deltaSeconds: number) => void): () => void;
  /**
   * A mouse button went down or up over the arena, a chorded press
   * included (#438); returns the unsubscribe. Only a press that began
   * over the arena counts, and its release arrives wherever the pointer
   * is by then. While it is held, every pointer move is a `"move"` of it
   * (#442). A finger is never a button: it goes to `onFinger`. The
   * browser's menu does not open over the arena.
   */
  onButton(handler: (event: ButtonEvent) => void): () => void;
  /**
   * What fingers on the arena did (#3781): a tap, a drag or a pinch;
   * returns the unsubscribe. Each event is routed by its own
   * `pointerType`, so a touchscreen laptop's mouse stays a mouse.
   */
  onFinger(handler: (event: FingerEvent) => void): () => void;
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
  /** The canvas, CSS px. */
  size(): Size;
  /** Point the camera, with what the HUD covers; the scene draws through it from this frame. */
  setCamera(view: CameraView, cover: Cover): void;
  /** The arena's bounds, for the grid, its edge and the camera's clamp. */
  setArenaBounds(width: number, height: number): void;
  /** Re-measure the parent, after the layout around it changed. */
  refreshScale(): void;
  /**
   * Draw nothing more after this frame (#3157): a still picture costs
   * nothing to keep. A resize clears the canvas, so it draws again from
   * the next frame, until held again.
   */
  hold(): void;
  /**
   * Phaser destroys a game on its next loop step, not at once: resolves
   * once it has, its WebGL context released and its canvas gone, or after
   * `DESTROY_WAIT_MS` if the loop does not step, its canvas then removed
   * here. Either way, once resolved the canvas is out of the DOM. Called
   * again, the same.
   */
  destroy(): Promise<void>;
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

/** How a viewport runs, where it differs from a match's. */
export interface ArenaViewportOptions {
  /** At most this many frames a second (#3119); a match's is not capped. */
  readonly fpsLimit?: number;
}

/** The pointer events a finger sends, in `onFinger`. */
const FINGER_TYPES = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;

function isFingerType(type: string): type is (typeof FINGER_TYPES)[number] {
  return (FINGER_TYPES as readonly string[]).includes(type);
}

/** The longest `destroy` waits for Phaser's next step to run it. */
const DESTROY_WAIT_MS = 500;

/**
 * Phaser's renderer config (#3627). Its `pathDetailThreshold` (1 game px by
 * default) drops every path point that close to the one before, and a cape
 * emblem's cells are about half a px at Default zoom: they collapsed to
 * nothing. Zero keeps every point; a `Graphics` cannot go below the game's.
 */
export const ARENA_RENDER = { pathDetailThreshold: 0 } as const;

/**
 * Start a Phaser game in `parent` with the arena scene, resolved once the
 * scene exists. Only this and `ArenaScene` touch Phaser (ADR-0010); the
 * callers wire a connection to it. Throws `NoWebGlError` without WebGL.
 */
export async function createArenaViewport(
  parent: HTMLElement,
  options: ArenaViewportOptions = {},
): Promise<ArenaViewport> {
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
    backgroundColor: ARENA_BACKGROUND,
    render: ARENA_RENDER,
    // The canvas is its parent's size in CSS px; the camera decides how
    // much world that shows (camera-rig.ts).
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArenaScene],
    ...(options.fpsLimit === undefined ? {} : { fps: { limit: options.fpsLimit } }),
  });

  const scene = await new Promise<ArenaScene>((resolve) => {
    game.events.once(Phaser.Core.Events.READY, () => {
      const candidate = game.scene.getScene(ArenaScene.KEY);
      if (candidate instanceof ArenaScene) {
        resolve(candidate);
      }
    });
  });

  // A finger on the arena is a tap, drag, pinch or long-press of ours
  // (#3781, #3878): the browser neither scrolls, zooms, selects nor opens
  // a menu or callout over it.
  game.canvas.style.touchAction = "none";
  game.canvas.style.userSelect = "none";
  game.canvas.style.setProperty("-webkit-touch-callout", "none");

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

  const stats = frameTiming();
  if (stats !== undefined) {
    let stepped = 0;
    let rendering = 0;
    game.events.on(Phaser.Core.Events.PRE_STEP, () => {
      stepped = performance.now();
    });
    game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
      rendering = performance.now();
      stats.update.push(rendering - stepped);
    });
    game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      stats.render.push(performance.now() - rendering);
    });
  }

  const wake = (): void => {
    game.loop.wake();
  };
  game.scale.on(Phaser.Scale.Events.RESIZE, wake);

  /** Set by the first `destroy`; a second returns it. */
  let destroyed: Promise<void> | undefined;
  return {
    scene,
    canvas: game.canvas,
    onFrame(handler) {
      // STEP passes the frame's timestamp, then a delta Phaser clamps.
      const seconds = frameClock();
      const onStep = (time: number): void => {
        handler(seconds(time));
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
      let last: { world: Vec2; altKey: boolean; screen: Vec2 } = {
        world: vec2(0, 0),
        altKey: false,
        screen: vec2(0, 0),
      };
      const emit = (
        pressed: readonly MouseButton[],
        released: readonly MouseButton[],
        moved: readonly MouseButton[],
      ): void => {
        for (const button of pressed) {
          handler({ button, phase: "down", ...last });
        }
        for (const button of released) {
          handler({ button, phase: "up", ...last });
        }
        for (const button of moved) {
          handler({ button, phase: "move", ...last });
        }
      };
      const onPointer = (event: PointerEvent): void => {
        // Buttons held with none tracked were pressed elsewhere first.
        if (event.pointerType === "touch" || (event.type !== "pointerdown" && held === 0)) {
          return;
        }
        const bounds = canvas.getBoundingClientRect();
        const world = scene.cameras.main.getWorldPoint(
          game.scale.transformX(event.pageX),
          game.scale.transformY(event.pageY),
        );
        last = {
          world: vec2(world.x, world.y),
          altKey: event.altKey,
          screen: vec2(event.clientX - bounds.left, event.clientY - bounds.top),
        };
        const { pressed, released } = buttonChanges(held, event.buttons);
        // What was held before and still is: it moved, if this was a move.
        const moved =
          event.type === "pointermove" ? buttonChanges(0, held & event.buttons).pressed : [];
        held = event.buttons & 7;
        if (event.type === "pointerdown") {
          canvas.setPointerCapture(event.pointerId);
        }
        emit(pressed, released, moved);
      };
      const releaseAll = (event?: Event): void => {
        if (event instanceof PointerEvent && event.pointerType === "touch") {
          return;
        }
        const { released } = buttonChanges(held, 0);
        held = 0;
        emit([], released, []);
      };
      const onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
      };
      // A wheel click is a call (#443), never the browser's autoscroll.
      const onMouseDown = (event: MouseEvent): void => {
        if (event.button === 1) {
          event.preventDefault();
        }
      };
      canvas.addEventListener("pointerdown", onPointer);
      canvas.addEventListener("pointermove", onPointer);
      canvas.addEventListener("pointerup", onPointer);
      canvas.addEventListener("pointercancel", releaseAll);
      canvas.addEventListener("contextmenu", onContextMenu);
      canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("blur", releaseAll);
      return () => {
        canvas.removeEventListener("pointerdown", onPointer);
        canvas.removeEventListener("pointermove", onPointer);
        canvas.removeEventListener("pointerup", onPointer);
        canvas.removeEventListener("pointercancel", releaseAll);
        canvas.removeEventListener("contextmenu", onContextMenu);
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("blur", releaseAll);
      };
    },
    onFinger(handler) {
      const canvas = game.canvas;
      const gesture = createTouchGesture();
      /** Each finger's world point as it was pressed: the camera may move before the tap ends. */
      const pressed = new Map<number, { world: Vec2; screen: Vec2 }>();
      const phases = {
        pointerdown: "down",
        pointermove: "move",
        pointerup: "up",
        pointercancel: "cancel",
      } as const;
      const onTouch = (event: PointerEvent): void => {
        if (event.pointerType !== "touch" || !isFingerType(event.type)) {
          return;
        }
        const phase = phases[event.type];
        const bounds = canvas.getBoundingClientRect();
        const screen = vec2(event.clientX - bounds.left, event.clientY - bounds.top);
        if (phase === "down") {
          canvas.setPointerCapture(event.pointerId);
          // From the canvas's box now, not Phaser's cached one, which lags
          // a page that scrolled or reflowed since its last refresh.
          const world = scene.cameras.main.getWorldPoint(
            screen.x * game.scale.displayScale.x,
            screen.y * game.scale.displayScale.y,
          );
          pressed.set(event.pointerId, { world: vec2(world.x, world.y), screen });
        }
        const outcome = gesture.feed({
          id: event.pointerId,
          phase,
          x: screen.x,
          y: screen.y,
          t: event.timeStamp,
        });
        const press = pressed.get(event.pointerId);
        if (phase === "up" || phase === "cancel") {
          pressed.delete(event.pointerId);
        }
        switch (outcome.kind) {
          case "tap":
          case "long-press":
            if (press !== undefined) {
              handler({ kind: outcome.kind, world: press.world, screen: press.screen });
            }
            break;
          case "pan":
          case "pan-end":
          case "pinch":
            handler(outcome);
            break;
          case "none":
            break;
        }
      };
      for (const type of FINGER_TYPES) {
        canvas.addEventListener(type, onTouch);
      }
      return () => {
        for (const type of FINGER_TYPES) {
          canvas.removeEventListener(type, onTouch);
        }
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
      // `refresh` alone sizes to the parent as last polled; measure it now.
      game.scale.getParentBounds();
      game.scale.refresh();
    },
    hold() {
      game.loop.sleep();
    },
    destroy() {
      if (destroyed !== undefined) {
        return destroyed;
      }
      game.scale.off(Phaser.Scale.Events.RESIZE, wake);
      scene.input.off("pointermove", onMove);
      scene.input.off("gameout", onOut);
      // A loop that does not step (a hidden tab draws no frames) never gets
      // to the destroy: waiting is bounded, so nobody waits on it forever.
      // Its canvas leaves the DOM then all the same, or the next viewport
      // in the parent mounts beside it (#3196); Phaser's own removal, if
      // it ever steps, finds it gone.
      destroyed = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          game.canvas.remove();
          resolve();
        }, DESTROY_WAIT_MS);
        game.events.once(Phaser.Core.Events.DESTROY, () => {
          clearTimeout(timer);
          resolve();
        });
      });
      game.destroy(true);
      // A held loop steps again, so that it gets to the destroy.
      wake();
      return destroyed;
    },
  };
}

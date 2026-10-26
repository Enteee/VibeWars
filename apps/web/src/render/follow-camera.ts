import type { Vec2 } from "@vibewars/game-core";

import { createSecondaryPress } from "../input/secondary-press.js";
import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import type { ArenaViewport } from "./arena-viewport.js";
import {
  NO_COVER,
  VIEW_STEPS,
  createCameraRig,
  dropPan,
  panBy,
  releasePan,
  stepCamera,
  wheelNotch,
  type Cover,
  type Size,
} from "./camera-rig.js";

/**
 * The follow camera's per-frame wiring (#440), one helper the match view
 * and the Training Ground both call, so the two cameras cannot drift. It
 * owns the right button (#442): a drag pans, a click goes to
 * `onSecondaryClick`.
 *
 * The stage carries `data-zoom-step`, `data-zoom` (CSS px per world
 * unit) and `data-camera="<x>,<y>"` for the e2e specs, written only when
 * they change.
 */
/** Where you are, and whether you are dead. */
export interface Body extends Vec2 {
  readonly dead: boolean;
}

export interface FollowCamera {
  /**
   * Step the camera toward `self`, or hold it where it is without one.
   * A dead `self` drops a pan at once, with no glide (#442).
   */
  frame(deltaSeconds: number, self: Body | undefined): void;
  /** An RMB click, not a drag, at the world point under the pointer on release (#438). */
  onSecondaryClick(handler: (world: Vec2) => void): void;
  /**
   * A new session on `arena`, e.g. another training scenario: back to
   * `Default`, and the view snaps there with no glide.
   */
  restart(arena: Size): void;
  /** What the HUD covers from now on, kept clear by the edge markers; none until this is called. */
  setCover(next: Cover): void;
  dispose(): void;
}

export function attachFollowCamera(
  viewport: ArenaViewport,
  stage: HTMLElement,
  arena: Size,
  /** The canvas whose view box sets the zoom: a match's (#709). */
  scaleTo: () => Size,
): FollowCamera {
  let rig = createCameraRig();
  let cover = NO_COVER;
  viewport.setArenaBounds(arena.width, arena.height);
  const offWheel = viewport.onWheelNotch((direction) => {
    rig = wheelNotch(rig, direction);
  });
  const press = createSecondaryPress();
  let onClick: (world: Vec2) => void = () => undefined;
  const offButton = viewport.onButton(({ button, phase, world, screen }) => {
    if (button !== "right") {
      return;
    }
    if (phase === "down") {
      press.down(screen, performance.now());
      return;
    }
    const outcome = phase === "move" ? press.move(screen) : press.up(performance.now());
    switch (outcome.kind) {
      case "pan-start":
      case "pan-move":
        rig = panBy(rig, outcome.delta, viewport.size(), scaleTo());
        break;
      case "click":
        rig = releasePan(rig);
        onClick(world);
        break;
      case "pan-end":
        rig = releasePan(rig);
        break;
      case "none":
        if (phase === "up") {
          rig = releasePan(rig);
        }
        break;
    }
  });

  const mark = (name: string, value: string): void => {
    if (stage.dataset[name] !== value) {
      stage.dataset[name] = value;
    }
  };

  return {
    frame(deltaSeconds, self) {
      if (self === undefined) {
        return;
      }
      if (self.dead) {
        rig = dropPan(rig);
      }
      const stepped = stepCamera(
        rig,
        {
          self: { x: self.x, y: self.y },
          viewport: viewport.size(),
          scaleTo: scaleTo(),
          pointer: viewport.pointerScreen(),
          reducedMotion: prefersReducedMotion(),
        },
        deltaSeconds,
      );
      rig = stepped.rig;
      viewport.setCamera(stepped.view, cover);
      mark("zoomStep", VIEW_STEPS[rig.step]?.name ?? "");
      mark("zoom", stepped.view.zoom.toFixed(4));
      mark("camera", `${String(Math.round(stepped.view.x))},${String(Math.round(stepped.view.y))}`);
    },
    onSecondaryClick(handler) {
      onClick = handler;
    },
    restart(next) {
      viewport.setArenaBounds(next.width, next.height);
      rig = createCameraRig();
    },
    setCover(next) {
      cover = next;
    },
    dispose() {
      offWheel();
      offButton();
      delete stage.dataset.zoomStep;
      delete stage.dataset.zoom;
      delete stage.dataset.camera;
    },
  };
}

import type { Vec2 } from "@vibewars/game-core";

import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import type { ArenaViewport } from "./arena-viewport.js";
import { VIEW_STEPS, createCameraRig, stepCamera, wheelNotch, type Size } from "./camera-rig.js";

/**
 * The follow camera's per-frame wiring (#440), one helper the match view
 * and the Training Ground both call, so the two cameras cannot drift.
 *
 * The stage carries `data-zoom-step` and `data-camera="<x>,<y>"` for the
 * e2e specs, written only when they change.
 */
export interface FollowCamera {
  /** Step the camera toward `self`, or hold it where it is without one. */
  frame(deltaSeconds: number, self: Vec2 | undefined): void;
  /**
   * A new session on `arena`, e.g. another training scenario: back to
   * `Default`, and the view snaps there with no glide.
   */
  restart(arena: Size): void;
  dispose(): void;
}

export function attachFollowCamera(
  viewport: ArenaViewport,
  stage: HTMLElement,
  arena: Size,
): FollowCamera {
  let rig = createCameraRig();
  let bounds = arena;
  viewport.setArenaBounds(bounds.width, bounds.height);
  const offWheel = viewport.onWheelNotch((direction) => {
    rig = wheelNotch(rig, direction);
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
      const stepped = stepCamera(
        rig,
        {
          self,
          viewport: viewport.size(),
          pointer: viewport.pointerScreen(),
          reducedMotion: prefersReducedMotion(),
          arena: bounds,
        },
        deltaSeconds,
      );
      rig = stepped.rig;
      viewport.setCamera(stepped.view);
      mark("zoomStep", VIEW_STEPS[rig.step]?.name ?? "");
      mark("camera", `${String(Math.round(stepped.view.x))},${String(Math.round(stepped.view.y))}`);
    },
    restart(next) {
      bounds = next;
      viewport.setArenaBounds(next.width, next.height);
      rig = createCameraRig();
    },
    dispose() {
      offWheel();
      delete stage.dataset.zoomStep;
      delete stage.dataset.camera;
    },
  };
}

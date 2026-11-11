import {
  FIRST_CHOICE,
  menuBackgroundMap,
  sameChoice,
  type MenuBackgroundChoice,
} from "./menu-background-choice.js";
import { prefersReducedMotion } from "./recharge-overlay.js";
import type { SplashFightOptions } from "./splash-fight.js";

/** Draws a fight into the element; resolves to what stops it. */
export type StartFight = (parent: HTMLElement, fight: SplashFightOptions) => Promise<() => void>;

/**
 * The fight behind every menu screen (#3119). There is only ever one,
 * and never two WebGL contexts: the old one is stopped before the next
 * starts. Phaser itself stops stepping and drawing while the tab is
 * hidden, and a long frame after is not caught up on (`splash-fight`).
 */
/**
 * Why the fight is not shown: `away` from the menu, before it and in a
 * match, or a `training` arena of the build editor's beside it.
 */
export type SuspendReason = "away" | "training";

export interface MenuBackground {
  /**
   * Fight on `choice` from now on: a new map or size restarts the fight,
   * walking in again; the same one leaves it running.
   */
  setChoice(choice: MenuBackgroundChoice): void;
  /** The fight is stopped and its canvas gone until `reason` is resumed. */
  suspend(reason: SuspendReason): void;
  /**
   * `reason` is over; with no other left, the fight for the choice runs.
   * Resolves to whether it draws.
   */
  resume(reason: SuspendReason): Promise<boolean>;
}

interface Shown {
  readonly choice: MenuBackgroundChoice;
  readonly stop: () => void;
}

/**
 * The menu background in `root`, a layer under the screens: `away`
 * until it is first resumed. Each fight it starts has an id of its own,
 * `data-fight`. Where it cannot draw, or loses its WebGL
 * context, `root` is left empty, the page's plain background, and the
 * player is told nothing.
 */
export function createMenuBackground(root: HTMLElement, startFight: StartFight): MenuBackground {
  let wanted = FIRST_CHOICE;
  const suspended = new Set<SuspendReason>(["away"]);
  let fights = 0;
  /** The fight running, or the choice that could not draw one. */
  let shown: Shown | undefined;
  /**
   * One sync at a time, so a fight is always stopped before the next
   * starts. Each does what is wanted when its turn comes, so a burst of
   * changes starts only the last.
   */
  let queue: Promise<boolean> = Promise.resolve(false);

  const stopShown = (): void => {
    shown?.stop();
    shown = undefined;
    delete root.dataset.map;
    delete root.dataset.teamSize;
    delete root.dataset.fight;
  };
  const start = async (choice: MenuBackgroundChoice): Promise<boolean> => {
    const fight = { ...menuBackgroundMap(choice, Math.random), still: prefersReducedMotion() };
    try {
      const stop = await startFight(root, fight);
      const canvas = root.querySelector("canvas");
      const onLost = (): void => {
        if (shown?.stop === stopFight) {
          stopShown();
          shown = { choice, stop: () => undefined };
        }
      };
      const stopFight = (): void => {
        canvas?.removeEventListener("webglcontextlost", onLost);
        stop();
      };
      canvas?.addEventListener("webglcontextlost", onLost);
      shown = { choice, stop: stopFight };
      root.dataset.map = fight.mapId;
      root.dataset.teamSize = String(fight.teamSize);
      fights += 1;
      root.dataset.fight = String(fights);
      return true;
    } catch (error) {
      // Not tried again for the same choice: a lobby update would only fail again.
      console.warn("[web] no menu background", error);
      shown = { choice, stop: () => undefined };
      return false;
    }
  };
  const sync = (): Promise<boolean> => {
    queue = queue.then(async () => {
      if (suspended.size > 0) {
        stopShown();
        return false;
      }
      if (shown !== undefined && sameChoice(shown.choice, wanted)) {
        return root.dataset.map !== undefined;
      }
      stopShown();
      return start(wanted);
    });
    return queue;
  };

  return {
    setChoice(choice) {
      if (sameChoice(wanted, choice)) {
        return;
      }
      wanted = choice;
      void sync();
    },
    suspend(reason) {
      if (suspended.has(reason)) {
        return;
      }
      suspended.add(reason);
      void sync();
    },
    resume(reason) {
      suspended.delete(reason);
      return sync();
    },
  };
}

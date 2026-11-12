import {
  FIRST_CHOICE,
  menuBackgroundMap,
  sameChoice,
  type MenuBackgroundChoice,
} from "./menu-background-choice.js";
import { prefersReducedMotion } from "./recharge-overlay.js";
import type { SplashFight, SplashFightOptions } from "./splash-fight.js";

/** Draws a fight into the element. */
export type StartFight = (parent: HTMLElement, fight: SplashFightOptions) => Promise<SplashFight>;

/**
 * The fight behind every menu screen (#3119). There is only ever one,
 * and never two WebGL contexts: the next starts only once the old one's
 * context is released. Phaser itself stops stepping and drawing while the tab is
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

/** How long the fight fades out before it stops, and in once drawn (#3131). */
export const MENU_FADE_MS = { out: 250, in: 400 } as const;

/** The longest a new fight stays hidden waiting for its first frame. */
export const FIRST_FRAME_CAP_MS = 2000;

interface Shown {
  readonly choice: MenuBackgroundChoice;
  readonly stop: () => Promise<void>;
  /** Resolves once it is drawn; never for a choice that could not draw. */
  readonly firstFrame: Promise<void>;
}

const NOTHING_TO_STOP = (): Promise<void> => Promise.resolve();
const NEVER = new Promise<void>(() => undefined);

/** A fade's duration: none under reduced motion. */
const fadeMs = (which: keyof typeof MENU_FADE_MS): number =>
  prefersReducedMotion() ? 0 : MENU_FADE_MS[which];

/** Resolves after `ms`; a timer, as `transitionend` never fires in a hidden tab. */
const after = (ms: number): Promise<void> =>
  ms === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The menu background in `root`, a layer under the screens: `away`
 * until it is first resumed. Each fight it starts has an id of its own,
 * `data-fight`, and is hidden until its first frame is drawn, then fades
 * in, `data-shown`; a restart fades the old one out first. Where it cannot draw, or loses its WebGL
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
  /** Ends a wait for a first frame early: what is wanted has changed. */
  let interrupt = (): void => undefined;
  root.style.setProperty("--menu-fade-out", `${String(MENU_FADE_MS.out)}ms`);
  root.style.setProperty("--menu-fade-in", `${String(MENU_FADE_MS.in)}ms`);

  const stopShown = async (): Promise<void> => {
    const stopping = shown?.stop();
    shown = undefined;
    delete root.dataset.shown;
    delete root.dataset.map;
    delete root.dataset.teamSize;
    delete root.dataset.fight;
    await stopping;
  };
  const start = async (choice: MenuBackgroundChoice): Promise<boolean> => {
    const fight = { ...menuBackgroundMap(choice, Math.random), still: prefersReducedMotion() };
    try {
      const { canvas, stop, firstFrame } = await startFight(root, fight);
      const onLost = (): void => {
        if (shown?.stop === stopFight) {
          // Queued, so a sync already waiting does not overlap the stop.
          queue = queue.then(async () => {
            if (shown?.stop === stopFight) {
              await stopShown();
              shown = { choice, stop: NOTHING_TO_STOP, firstFrame: NEVER };
            }
            return false;
          });
        }
      };
      const stopFight = (): Promise<void> => {
        canvas.removeEventListener("webglcontextlost", onLost);
        return stop();
      };
      canvas.addEventListener("webglcontextlost", onLost);
      shown = { choice, stop: stopFight, firstFrame };
      root.dataset.map = fight.mapId;
      root.dataset.teamSize = String(fight.teamSize);
      fights += 1;
      root.dataset.fight = String(fights);
      return true;
    } catch (error) {
      // Not tried again for the same choice: a lobby update would only fail again.
      console.warn("[web] no menu background", error);
      shown = { choice, stop: NOTHING_TO_STOP, firstFrame: NEVER };
      return false;
    }
  };
  /**
   * Shows the fight once it is drawn, or after the cap: a hidden tab
   * draws nothing, and nobody sees it there. Left hidden when what is
   * wanted changes meanwhile; the next sync takes over.
   */
  const reveal = async (): Promise<void> => {
    const revealing = shown;
    if (revealing === undefined || root.dataset.map === undefined) {
      return;
    }
    const changed = new Promise<void>((resolve) => {
      interrupt = resolve;
    });
    let capped = (): void => undefined;
    const cap = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, FIRST_FRAME_CAP_MS);
      capped = () => {
        clearTimeout(timer);
      };
    });
    await Promise.race([revealing.firstFrame, cap, changed]);
    capped();
    interrupt = () => undefined;
    if (shown === revealing && sameChoice(revealing.choice, wanted) && suspended.size === 0) {
      root.dataset.shown = "";
    }
  };
  const sync = (): Promise<boolean> => {
    queue = queue.then(async () => {
      if (suspended.size > 0) {
        await stopShown();
        return false;
      }
      if (shown !== undefined && sameChoice(shown.choice, wanted)) {
        if (root.dataset.shown === undefined) {
          await reveal();
        }
        return root.dataset.map !== undefined;
      }
      if (root.dataset.shown !== undefined) {
        delete root.dataset.shown;
        await after(fadeMs("out"));
      }
      await stopShown();
      const drawing = await start(wanted);
      await reveal();
      return drawing;
    });
    return queue;
  };

  return {
    setChoice(choice) {
      if (sameChoice(wanted, choice)) {
        return;
      }
      wanted = choice;
      interrupt();
      void sync();
    },
    suspend(reason) {
      if (suspended.has(reason)) {
        return;
      }
      suspended.add(reason);
      interrupt();
      void sync();
    },
    resume(reason) {
      suspended.delete(reason);
      return sync();
    },
  };
}

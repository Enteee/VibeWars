import type { SlotRecharge } from "../net/match-connection.js";

/**
 * The recharge clock-wipe on a skill slot (#152), shared by the match HUD
 * and the Training Ground so the two cannot drift apart. Both read only
 * `MatchConnection.getRecharges()`; neither knows where it came from.
 */

/** How long a slot's border flashes when its skill is ready again. */
export const READY_FLASH_MS = 200;

/** Steps the wipe snaps to when the player asked for reduced motion. */
const REDUCED_MOTION_STEPS = 8;

export interface RechargeView {
  /** `--recharge`: the share of the slot still shaded, in (0, 1]. */
  readonly fraction: number;
  /** Whole seconds left, or "" in the last second, where only the wipe shows. */
  readonly seconds: string;
  /** What a screen reader hears, changing at most once a second. */
  readonly label: string;
}

/**
 * What a slot shows for `recharge`, or `undefined` when the skill is
 * ready. With reduced motion, the wipe moves in eighths, rounded up so it
 * never looks readier than it is.
 */
export function rechargeView(
  recharge: SlotRecharge,
  skillName: string,
  reducedMotion: boolean,
): RechargeView | undefined {
  if (recharge.remaining <= 0 || recharge.total <= 0) {
    return undefined;
  }
  const exact = Math.min(1, recharge.remaining / recharge.total);
  const fraction = reducedMotion
    ? Math.ceil(exact * REDUCED_MOTION_STEPS) / REDUCED_MOTION_STEPS
    : exact;
  const whole = Math.floor(recharge.remaining);
  const spoken = Math.max(1, whole);
  return {
    fraction,
    seconds: whole >= 1 ? String(whole) : "",
    label: `${skillName}, recharging, ${String(spoken)} second${spoken === 1 ? "" : "s"}`,
  };
}

let reducedMotionQuery: MediaQueryList | undefined;

/** Whether the player asked the system for less motion; live, so a change applies at once. */
export function prefersReducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

/**
 * Paint `recharge` onto one slot element, from the render loop. Writes
 * only what changed, so a frame with nothing new touches nothing.
 */
export function paintRecharge(
  slot: HTMLElement,
  recharge: SlotRecharge | undefined,
  skillName: string,
  reducedMotion: boolean,
): void {
  const view =
    recharge === undefined ? undefined : rechargeView(recharge, skillName, reducedMotion);
  let overlay = slot.querySelector<HTMLElement>(":scope > .recharge-overlay");

  if (view === undefined) {
    if (overlay !== null) {
      // Overlay, number and label go in the same frame as the flash, so
      // the cue is never colour alone.
      overlay.remove();
      slot.removeAttribute("aria-label");
      if (!reducedMotion) {
        flashReady(slot);
      }
    }
    return;
  }

  if (overlay === null) {
    overlay = document.createElement("span");
    overlay.className = "recharge-overlay";
    overlay.setAttribute("aria-hidden", "true");
    slot.appendChild(overlay);
  }
  const fraction = String(view.fraction);
  if (overlay.style.getPropertyValue("--recharge") !== fraction) {
    overlay.style.setProperty("--recharge", fraction);
  }
  if (overlay.textContent !== view.seconds) {
    overlay.textContent = view.seconds;
  }
  if (slot.getAttribute("aria-label") !== view.label) {
    slot.setAttribute("aria-label", view.label);
  }
}

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function flashReady(slot: HTMLElement): void {
  slot.classList.add("is-ready-flash");
  const previous = flashTimers.get(slot);
  if (previous !== undefined) {
    clearTimeout(previous);
  }
  flashTimers.set(
    slot,
    setTimeout(() => {
      slot.classList.remove("is-ready-flash");
    }, READY_FLASH_MS),
  );
}

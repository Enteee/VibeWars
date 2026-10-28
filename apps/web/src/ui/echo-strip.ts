import { STATUS_DEFINITIONS } from "@vibewars/game-core";
import type { SkillSlot } from "@vibewars/game-session";

/**
 * How long an echo's copy has left in its slot (#1154, #469): a thin
 * strip along the slot's top edge, in the `enchantment` colour, draining
 * from full to empty, and a line in the slot's tooltip. Shared by the match
 * HUD and the Training Ground, whose slots carry the same strip.
 */

/**
 * A copy's whole life, seconds: the echo effect's own `seconds`, read from
 * the statuses that make copies rather than written here twice.
 */
export const ECHO_SECONDS = Math.max(
  ...Object.values(STATUS_DEFINITIONS).flatMap((definition) =>
    definition.triggers.flatMap((trigger) =>
      trigger.effects.flatMap((effect) => (effect.kind === "echo" ? [effect.seconds] : [])),
    ),
  ),
);

/** The strip, for a slot that holds a copy; nothing for a build slot. */
export function echoStripHtml(slot: SkillSlot): string {
  return slot.copyEndsAt === null ? "" : `<span class="echo-strip" aria-hidden="true"></span>`;
}

/** Whole seconds the copy has left at `now`, rounded up, 0 once it is due. */
export function echoSecondsLeft(copyEndsAt: number, now: number): number {
  return Math.max(0, Math.ceil(copyEndsAt - now));
}

/**
 * The strip's length, 1 full to 0 empty: smooth, or under reduced motion
 * stepping once a second.
 */
export function echoStripFraction(copyEndsAt: number, now: number, reducedMotion: boolean): number {
  const left = reducedMotion ? echoSecondsLeft(copyEndsAt, now) : copyEndsAt - now;
  return Math.max(0, Math.min(1, left / ECHO_SECONDS));
}

/** The tooltip's line, "Echoed: 12 s left"; none for a build slot. */
export function echoTooltipLine(slot: SkillSlot, now: number): string | undefined {
  return slot.copyEndsAt === null
    ? undefined
    : `Echoed: ${String(echoSecondsLeft(slot.copyEndsAt, now))} s left`;
}

/** Set `button`'s strip from the render loop, writing only what changed. */
export function paintEchoStrip(
  button: HTMLElement,
  slot: SkillSlot,
  now: number,
  reducedMotion: boolean,
): void {
  const strip = button.querySelector<HTMLElement>(":scope > .echo-strip");
  if (strip === null || slot.copyEndsAt === null) {
    return;
  }
  const fraction = String(echoStripFraction(slot.copyEndsAt, now, reducedMotion));
  if (strip.style.getPropertyValue("--echo") !== fraction) {
    strip.style.setProperty("--echo", fraction);
  }
}

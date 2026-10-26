import { distanceWithinRange, getSkill, hasLineOfSight, type Segment } from "@vibewars/game-core";
import type { CombatMessage, PlayerSnapshot, SkillSlot } from "@vibewars/game-session";

/**
 * Which skill-bar slot is casting, and which slot's cast just failed
 * (#300), as pure functions shared by the match HUD and the Training
 * Ground. A bar cannot hold a skill twice (`build.ts`), so a skill id
 * names one slot.
 */

/** How a cast that never went off ended, as the slot shows it. */
export type SlotFlashKind = "interrupted" | "cancelled";

/** How long a failed cast's slot flashes. */
export const SLOT_FLASH_MS = 400;

/**
 * The slot this player is casting from, or undefined. An instant skill has
 * no cast to light, so it never shows here.
 */
export function castingSlot(
  skillBar: readonly (SkillSlot | null)[],
  self: PlayerSnapshot | undefined,
): number | undefined {
  if (self?.castingSkillId === undefined || self.castTotal <= 0) {
    return undefined;
  }
  const slot = skillBar.findIndex((skill) => skill !== null && skill.id === self.castingSkillId);
  return slot === -1 ? undefined : slot;
}

/**
 * How far the casting slot's cast has got, from 0 as it starts to 1 as it
 * goes off (#485), or undefined when nothing is casting.
 */
export function castFill(
  skillBar: readonly (SkillSlot | null)[],
  self: PlayerSnapshot | undefined,
): { slot: number; fraction: number } | undefined {
  const slot = castingSlot(skillBar, self);
  if (slot === undefined || self === undefined) {
    return undefined;
  }
  const fraction = 1 - self.castRemaining / self.castTotal;
  return { slot, fraction: Math.max(0, Math.min(1, fraction)) };
}

/**
 * Paint `fraction` of a cast onto the slot it casts from, or clear it with
 * `undefined`. Writes only on change: this runs every frame.
 */
export function paintCastFill(button: HTMLElement, fraction: number | undefined): void {
  if (fraction === undefined) {
    if (button.style.getPropertyValue("--cast-fill") !== "") {
      button.style.removeProperty("--cast-fill");
    }
    return;
  }
  const value = String(fraction);
  if (button.style.getPropertyValue("--cast-fill") !== value) {
    button.style.setProperty("--cast-fill", value);
  }
}

/**
 * Which slots could not reach `target` from where `self` stands (#485):
 * too far, or a wall in the way. The same two game-core checks activation
 * makes, so the hint and the refusal cannot disagree. A hint, not a gate:
 * the press still goes to the host (brief §32).
 *
 * Nothing is out of range with no target, a dead one, or for a skill that
 * only targets its caster. An ally skill with a foe selected is not either:
 * the host casts it on the caster then, as the simulation's `#castTarget` does.
 */
export function outOfRange(
  skillBar: readonly (SkillSlot | null)[],
  self: PlayerSnapshot | undefined,
  target: PlayerSnapshot | undefined,
  walls: readonly Segment[],
): boolean[] {
  if (self === undefined || target === undefined || target.dead) {
    return skillBar.map(() => false);
  }
  const from = { x: self.x, y: self.y };
  const to = { x: target.x, y: target.y };
  // Measured once for the whole bar: only the range differs per skill.
  let sight: boolean | undefined;
  return skillBar.map((slot) => {
    const skill = slot === null ? undefined : getSkill(slot.id);
    if (skill === undefined || skill.target === "self") {
      return false;
    }
    if (skill.target === "single-ally" && target.team !== self.team) {
      return false;
    }
    if (!distanceWithinRange(from, to, skill.range)) {
      return true;
    }
    sight ??= hasLineOfSight(from, to, walls);
    return !sight;
  });
}

/**
 * The casts by `casterId` that this message ended without going off,
 * interrupted or cancelled, in order. Anyone else's are ignored. The skill
 * bar and the target frame's cast row (#484) both flash from this.
 */
export function castFailures(
  events: CombatMessage["events"],
  casterId: string,
): { skillId: string; kind: SlotFlashKind }[] {
  const failures: { skillId: string; kind: SlotFlashKind }[] = [];
  for (const event of events) {
    if (event.targetId !== casterId) {
      continue;
    }
    if (event.kind !== "interrupted" && event.kind !== "cancelled") {
      continue;
    }
    failures.push({ skillId: event.skillId, kind: event.kind });
  }
  return failures;
}

/**
 * The slots whose cast this message ended without going off: this
 * player's casts that were interrupted or cancelled. Anyone else's, and
 * a skill not on the bar, are ignored.
 */
export function slotFlashes(
  events: CombatMessage["events"],
  selfId: string,
  skillBar: readonly (SkillSlot | null)[],
): { slot: number; kind: SlotFlashKind }[] {
  return castFailures(events, selfId).flatMap(({ skillId, kind }) => {
    const slot = skillBar.findIndex((skill) => skill !== null && skill.id === skillId);
    return slot === -1 ? [] : [{ slot, kind }];
  });
}

const flashTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Flash `button` (a slot, or the target frame's cast row) as `kind` for SLOT_FLASH_MS. A new flash on the same slot
 * replaces the old one and restarts the clock, as `flashMessage` does.
 */
export function flashSlot(button: Element, kind: SlotFlashKind): void {
  button.classList.remove("is-interrupted", "is-cancelled");
  button.classList.add(`is-${kind}`);
  const previous = flashTimers.get(button);
  if (previous !== undefined) {
    clearTimeout(previous);
  }
  flashTimers.set(
    button,
    setTimeout(() => {
      button.classList.remove(`is-${kind}`);
      flashTimers.delete(button);
    }, SLOT_FLASH_MS),
  );
}

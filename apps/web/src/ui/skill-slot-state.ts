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
  skillBar: readonly SkillSlot[],
  self: PlayerSnapshot | undefined,
): number | undefined {
  if (self?.castingSkillId === undefined || self.castTotal <= 0) {
    return undefined;
  }
  const slot = skillBar.findIndex((skill) => skill.id === self.castingSkillId);
  return slot === -1 ? undefined : slot;
}

/**
 * The slots whose cast this message ended without going off: this
 * player's casts that were interrupted or cancelled. Anyone else's, and
 * a skill not on the bar, are ignored.
 */
export function slotFlashes(
  events: CombatMessage["events"],
  selfId: string,
  skillBar: readonly SkillSlot[],
): { slot: number; kind: SlotFlashKind }[] {
  const flashes: { slot: number; kind: SlotFlashKind }[] = [];
  for (const event of events) {
    if (event.targetId !== selfId) {
      continue;
    }
    if (event.kind !== "interrupted" && event.kind !== "cancelled") {
      continue;
    }
    const slot = skillBar.findIndex((skill) => skill.id === event.skillId);
    if (slot !== -1) {
      flashes.push({ slot, kind: event.kind });
    }
  }
  return flashes;
}

const flashTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Flash `button` as `kind` for SLOT_FLASH_MS. A new flash on the same slot
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

import type { WireWeaponSets } from "@vibewars/game-protocol";

import type { KeyLabeller } from "../input/key-labels.js";
import { WEAPON_SET_ACTIONS, actionLabel, codeLabel, type Keymap } from "../input/keymap.js";
import { offhandIcon, weaponIcon, type GearIcon } from "./icons.js";

/**
 * The four weapon-set slots at the skill bar's left end (#489), on the
 * HUD and the Training Ground alike: the set in hand lit, a queued one
 * pulsing, an empty one dimmed with no icon. Clicking one is pressing
 * its key.
 */

/**
 * Draw the four weapon-set slots once (#489); `updateWeaponSets` paints
 * them. Clicking one is pressing its key.
 */
export function renderWeaponSets(container: HTMLElement, onSwap: (set: number) => void): void {
  container.replaceChildren();
  WEAPON_SET_ACTIONS.forEach((_action, set) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weapon-set is-empty";
    button.disabled = true;
    button.innerHTML =
      `<img class="weapon-set-weapon" alt="" hidden>` +
      `<img class="weapon-set-offhand" alt="" hidden>` +
      `<span class="weapon-set-key"></span>`;
    button.addEventListener("click", () => {
      onSwap(set);
    });
    container.appendChild(button);
  });
}

function paintGearIcon(img: HTMLImageElement | null, icon: GearIcon | undefined): void {
  if (img === null) {
    return;
  }
  img.hidden = icon === undefined;
  if (icon === undefined) {
    img.removeAttribute("src");
  } else {
    img.src = icon.src;
  }
}

/** One weapon-set slot as it is shown (#489). */
export interface WeaponSetSlot {
  /** Its label and hover: "Weapon set 2: Sword", or "…: empty". */
  readonly name: string;
  /** No icon for an empty set, or a weapon this client does not know. */
  readonly weapon: GearIcon | undefined;
  readonly offhand: GearIcon | undefined;
  readonly empty: boolean;
  /** The set in hand: lit. */
  readonly active: boolean;
  /** Queued behind the action in progress: a pulsing outline. */
  readonly queued: boolean;
}

/**
 * The four slots as the host last sent the sets (#489). Until it has
 * said, every slot is empty.
 */
export function weaponSetSlots(sets: WireWeaponSets | undefined): WeaponSetSlot[] {
  return WEAPON_SET_ACTIONS.map((_action, index) => {
    const held = sets?.sets[index] ?? null;
    const weapon = held === null ? undefined : weaponIcon(held.weaponId);
    const offhand = held?.offhandId == null ? undefined : offhandIcon(held.offhandId);
    const number = String(index + 1);
    const names = [weapon?.name, offhand?.name].filter((name) => name !== undefined);
    return {
      name:
        held === null
          ? `Weapon set ${number}: empty`
          : `Weapon set ${number}: ${names.join(" and ")}`,
      weapon,
      offhand,
      empty: held === null,
      active: sets?.active === index,
      queued: sets?.pending === index,
    };
  });
}

/** Paint the weapon-set slots from `weaponSetSlots`, every frame (#489). */
export function updateWeaponSets(container: HTMLElement, sets: WireWeaponSets | undefined): void {
  const slots = weaponSetSlots(sets);
  container.querySelectorAll("button").forEach((button, index) => {
    const slot = slots[index];
    if (slot === undefined) {
      return;
    }
    // Only on a change: the render loop calls this every frame.
    if (button.dataset.painted !== slot.name) {
      button.dataset.painted = slot.name;
      button.setAttribute("aria-label", slot.name);
      button.title = slot.name;
      paintGearIcon(button.querySelector<HTMLImageElement>(".weapon-set-weapon"), slot.weapon);
      paintGearIcon(button.querySelector<HTMLImageElement>(".weapon-set-offhand"), slot.offhand);
    }
    button.disabled = slot.empty;
    button.classList.toggle("is-empty", slot.empty);
    button.classList.toggle("is-active", slot.active);
    button.classList.toggle("is-queued", slot.queued);
  });
}

/** Label each slot with its key, as `renderKeyLabels` does the skills. */
export function labelWeaponSets(
  container: HTMLElement,
  keymap: Keymap,
  label: KeyLabeller = codeLabel,
): void {
  container.querySelectorAll(".weapon-set-key").forEach((node, index) => {
    const action = WEAPON_SET_ACTIONS[index];
    node.textContent = action === undefined ? "" : actionLabel(keymap, action, label);
  });
}

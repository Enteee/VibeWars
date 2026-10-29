import type { WireWeaponSets } from "@vibewars/game-protocol";

import type { KeyLabeller } from "../input/key-labels.js";
import { WEAPON_SET_ACTIONS, actionLabel, codeLabel, type Keymap } from "../input/keymap.js";
import { offhandIcon, weaponIcon, type GearIcon } from "./icons.js";
import { setIfChanged } from "./kit.js";

/**
 * The four weapon-set slots at the skill bar's left end (#489), on the
 * match HUD and the Training Ground alike: each set's weapon, its
 * off-hand smaller, and its key. A click is the key.
 */

/** Four empty slots, set 1 first, two by two. */
export function weaponSetSlots(onSwap: (set: number) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "weapon-sets";
  for (const index of [0, 1, 2, 3]) {
    const slot = root.appendChild(document.createElement("button"));
    slot.type = "button";
    slot.className = "weapon-set is-empty";
    slot.disabled = true;
    // Not focusable, and pressing it does not move focus: a swap from the
    // bar must not take the keyboard away from the arena.
    slot.tabIndex = -1;
    slot.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    slot.addEventListener("click", () => {
      onSwap(index);
    });
    slot.innerHTML = `<span class="weapon-set-icons"></span><span class="weapon-set-key"></span>`;
  }
  return root;
}

/** Label each slot with its key under `keymap`. */
export function labelWeaponSets(
  root: HTMLElement,
  keymap: Keymap,
  label: KeyLabeller = codeLabel,
): void {
  root.querySelectorAll(".weapon-set-key").forEach((node, index) => {
    const action = WEAPON_SET_ACTIONS[index];
    node.textContent = action === undefined ? "" : actionLabel(keymap, action, label);
  });
}

/**
 * Paint the slots from `sets`, from the render loop: the set in hand lit,
 * a queued one outlined, an empty one dimmed and blank. Icons are redrawn
 * only when a set's gear changes. Before the host has said, every slot
 * is empty.
 */
export function renderWeaponSets(root: HTMLElement, sets: WireWeaponSets | undefined): void {
  root.querySelectorAll<HTMLButtonElement>(".weapon-set").forEach((slot, index) => {
    const held = sets?.sets[index] ?? null;
    slot.classList.toggle("is-empty", held === null);
    slot.classList.toggle("is-active", held !== null && sets?.active === index);
    slot.classList.toggle("is-queued", held !== null && sets?.pending === index);
    setIfChanged(slot, "disabled", held === null);
    const signature = held === null ? "" : `${held.weaponId}|${held.offhandId ?? ""}`;
    if (slot.dataset.shown === signature) {
      return;
    }
    slot.dataset.shown = signature;
    const main = held === null ? undefined : weaponIcon(held.weaponId);
    const offhandId = held?.offhandId ?? null;
    const off = offhandId === null ? undefined : offhandIcon(offhandId);
    const name = `Weapon set ${String(index + 1)}`;
    const gear = [main?.name, off?.name].filter((part) => part !== undefined).join(", ");
    slot.setAttribute("aria-label", held === null ? `${name}: empty` : `${name}: ${gear}`);
    slot.title = slot.getAttribute("aria-label") ?? "";
    slot
      .querySelector(".weapon-set-icons")
      ?.replaceChildren(
        ...(main === undefined ? [] : [gearImg(main, "weapon-set-main")]),
        ...(off === undefined ? [] : [gearImg(off, "weapon-set-off")]),
      );
  });
}

function gearImg(icon: GearIcon, className: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = className;
  img.src = icon.src;
  img.alt = "";
  return img;
}

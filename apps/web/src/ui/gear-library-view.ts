import { ALL_OFFHANDS, ALL_WEAPONS } from "@vibewars/game-core";

import type { StoredCharacter } from "../storage/schema.js";
import type { BuildHost, GearHost } from "./build-editor.js";
import {
  droppedModNotes,
  encodeGearDrag,
  setOffhand,
  setWeapon,
  type GearDragSource,
} from "./gear-editor.js";
import { gearIconImg, offhandIcon, weaponIcon, type GearIcon } from "./icons.js";
import { h, toast } from "./kit.js";
import type { LibraryBody } from "./skill-library-view.js";

/**
 * `commit` a gear change, toasting each mod a new weapon or off-hand
 * could not keep (#2008); a change that drops none is silent.
 */
export function commitGear(context: BuildHost, next: StoredCharacter): void {
  const notes = droppedModNotes(context.current(), next);
  context.commit(next);
  for (const note of notes) {
    toast(note);
  }
}

/**
 * The gear library: everything you could equip, grouped and draggable.
 *
 * Deliberately the same box-and-drag vocabulary as the skill library —
 * same markup, same gestures. A player who has learned to build a skill
 * bar already knows how to use this.
 */
export function mountGearLibrary(
  context: Pick<GearHost, "current" | "commit" | "weaponSet">,
): LibraryBody {
  const { current } = context;
  const host = h("div", "skill-groups");

  function box(options: {
    readonly name: string;
    readonly icon?: GearIcon | undefined;
    readonly detail: string;
    readonly drag: GearDragSource;
    readonly onClick: () => void;
  }): HTMLElement {
    const node = h("div", "skill-box gear-box");
    node.draggable = true;
    const name = h("span", "skill-box-name");
    const icon = gearIconImg(options.icon);
    if (icon !== undefined) {
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(options.name));
    node.appendChild(name);
    node.appendChild(h("span", "skill-box-cost", options.detail));
    node.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(options.drag));
    });
    // Click-to-equip alongside dragging, as the skill library's Equip:
    // dragging is the nicer gesture and a poor only option on a trackpad.
    node.addEventListener("click", options.onClick);
    return node;
  }

  function group(name: string): HTMLElement {
    const section = h("div", "skill-group");
    section.dataset.group = name;
    const header = h("div", "skill-group-header");
    header.appendChild(h("span", "skill-group-name", name));
    section.appendChild(header);
    host.appendChild(section);
    return section;
  }

  // --- weapons ---------------------------------------------------------
  const weapons = group("weapons");
  const weaponBoxes = ALL_WEAPONS.map((weapon) => {
    const node = box({
      name: weapon.name,
      icon: weaponIcon(weapon.id),
      detail: `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
      drag: { from: "weapon-library", weaponId: weapon.id },
      onClick: () => {
        commitGear(context, setWeapon(current(), context.weaponSet(), weapon.id));
      },
    });
    weapons.appendChild(node);
    return { id: weapon.id, node };
  });

  // --- off-hands -------------------------------------------------------
  const offhands = group("off-hands");
  const offhandBoxes = ALL_OFFHANDS.map((offhand) => {
    const node = box({
      name: offhand.name,
      icon: offhandIcon(offhand.id),
      detail: `+${String(offhand.baseBonus + offhand.metRequirementBonus)} ${offhand.kind}`,
      drag: { from: "offhand-library", offhandId: offhand.id },
      onClick: () => {
        commitGear(context, setOffhand(current(), context.weaponSet(), offhand.id));
      },
    });
    offhands.appendChild(node);
    return { id: offhand.id, node };
  });

  return {
    elements: [host],
    scroller: host,
    update(character) {
      const held = character.equipment.weaponSets[context.weaponSet()];
      for (const { id, node } of weaponBoxes) {
        node.classList.toggle("is-equipped", id === held?.mainHand.weaponId);
      }
      for (const { id, node } of offhandBoxes) {
        node.classList.toggle("is-equipped", id === held?.offHand?.offhandId);
      }
    },
  };
}

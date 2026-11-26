import {
  getOffhand,
  getWeapon,
  getWeaponMod,
  type ItemUpgrades,
  MOD_SLOT_KEYS,
  type ModSlot,
  type OffhandId,
  type WeaponId,
  type WeaponSetIndex,
} from "@vibewars/game-core";

import { attributeName, itemName } from "../i18n/game-names.js";
import { t, type MessageKey } from "../i18n/index.js";
import type { StoredCharacter } from "../storage/schema.js";
import {
  modChoices,
  modSlotsOf,
  offhandAttributeChoices,
  setAt,
  setRequirementAttribute,
  setUpgrade,
  weaponAttributeChoices,
} from "./gear-editor.js";
import { button, h, syncList } from "./kit.js";
import { choice, chosen, note, type PaperDollContext } from "./paper-doll.js";

export type Hand = "mainHand" | "offHand";

export const HANDS: readonly Hand[] = ["mainHand", "offHand"];

export const HAND_NUMBER: Readonly<Record<Hand, string>> = { mainHand: "⑥", offHand: "⑦" };

export const HAND_KEY: Readonly<Record<Hand, MessageKey>> = {
  mainHand: "paperDoll.mainHand",
  offHand: "paperDoll.offHand",
};

export const MOD_SLOT_KEY: Readonly<Record<ModSlot, MessageKey>> = {
  prefix: "paperDoll.modPrefix",
  suffix: "paperDoll.modSuffix",
  inscription: "paperDoll.modInscription",
};

/** A mod slot left empty, as a hand's title lists it: "no prefix". */
export const NO_MOD_KEY: Readonly<Record<ModSlot, MessageKey>> = {
  prefix: "paperDoll.noPrefix",
  suffix: "paperDoll.noSuffix",
  inscription: "paperDoll.noInscription",
};

/** What a hand of a set holds, as the paper-doll shows it. */
export interface Held {
  readonly item: Exclude<WeaponId, "unarmed"> | OffhandId;
  readonly name: string;
  /** The attribute it is linked to: a sword's own, a staff's chosen one; `null` if none is chosen. */
  readonly attributeId: string | null;
  /** The attributes it may be linked to; none for a fixed-requirement item. */
  readonly attributeChoices: readonly string[];
  readonly slots: readonly ModSlot[];
  readonly upgrades: ItemUpgrades;
}

/** What `hand` of set `set` holds; nothing for bare hands or an empty hand. */
export function heldIn(
  character: StoredCharacter,
  set: WeaponSetIndex,
  hand: Hand,
): Held | undefined {
  const held = setAt(character, set);
  if (held === null) {
    return undefined;
  }
  if (hand === "mainHand") {
    const worn = held.mainHand;
    const weapon = getWeapon(worn.weaponId);
    if (weapon === undefined || worn.weaponId === "unarmed") {
      return undefined;
    }
    return {
      item: worn.weaponId,
      name: itemName(weapon.id),
      attributeId:
        weapon.requirement.kind === "fixed"
          ? weapon.requirement.attributeId
          : worn.requirementAttributeId,
      attributeChoices: weaponAttributeChoices(character, set),
      slots: modSlotsOf(worn.weaponId),
      upgrades: worn.upgrades,
    };
  }
  const worn = held.offHand;
  const offhand = worn === null ? undefined : getOffhand(worn.offhandId);
  if (worn === null || offhand === undefined) {
    return undefined;
  }
  return {
    item: worn.offhandId,
    name: itemName(offhand.id),
    attributeId:
      offhand.requirement.kind === "fixed"
        ? offhand.requirement.attributeId
        : worn.requirementAttributeId,
    attributeChoices: offhandAttributeChoices(character, worn.offhandId),
    slots: modSlotsOf(worn.offhandId),
    upgrades: worn.upgrades,
  };
}

export interface HandPopover {
  /** The attribute pills, under the title. */
  readonly attribute: HTMLElement;
  /** A column per mod slot; those the item lacks are hidden. */
  readonly columns: readonly HTMLElement[];
  /** Lists `held` in `hand` of the shown set; kept, not rebuilt, so focus survives a pick. */
  fill(hand: Hand, held: Held): void;
  /** Where the focus goes on opening: the held attribute, else the first worn mod. */
  focusTarget(): HTMLElement | null;
}

/**
 * The weapon popover's body (#2151): the attribute as pills, when the item
 * has a choice, then a list per mod slot it takes, None first.
 */
export function mountHandPopover(context: PaperDollContext): HandPopover {
  const { current, commit } = context;
  let hand: Hand = "mainHand";

  const pills = h("div", "paper-doll-pills");
  pills.setAttribute("role", "radiogroup");
  pills.setAttribute("aria-label", t("paperDoll.attribute"));
  const attribute = h("div", "paper-doll-attribute");
  attribute.append(h("div", "paper-doll-popover-heading", t("paperDoll.attribute")), pills);
  // A radio group: arrows walk it, and what they land on is picked.
  pills.addEventListener("keydown", (event: KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    const target = event.target;
    if (step === 0 || !(target instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const entries = Array.from(pills.children);
    const next = entries[(entries.indexOf(target) + step + entries.length) % entries.length];
    if (next instanceof HTMLElement) {
      next.click();
      next.focus();
    }
  });

  const slots = MOD_SLOT_KEYS.map((slot) => {
    const list = h("div", "paper-doll-list is-plain");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", t(MOD_SLOT_KEY[slot]));
    const column = h("div", "paper-doll-popover-column");
    column.dataset.slot = slot;
    column.append(h("div", "paper-doll-popover-heading", t(MOD_SLOT_KEY[slot])), list);
    return { slot, column, list };
  });
  const columns = slots.map((entry) => entry.column);

  return {
    attribute,
    columns,
    fill(next, held) {
      hand = next;
      attribute.hidden = held.attributeChoices.length === 0;
      syncList<string>(
        pills,
        held.attributeChoices,
        (id) => id,
        (id) => {
          const pill = button(attributeName(id), "paper-doll-pill", () => {
            commit(setRequirementAttribute(current(), context.weaponSet(), hand, id));
          });
          pill.setAttribute("role", "radio");
          return pill;
        },
        (node, id) => {
          const on = id === held.attributeId;
          node.classList.toggle("is-chosen", on);
          node.setAttribute("aria-checked", String(on));
          node.tabIndex = on ? 0 : -1;
        },
      );
      // None held: the first pill takes the Tab stop, so the group can be reached.
      const first = pills.querySelector<HTMLElement>(".paper-doll-pill");
      if (first !== null && pills.querySelector(".is-chosen") === null) {
        first.tabIndex = 0;
      }

      for (const { slot, column, list } of slots) {
        column.hidden = !held.slots.includes(slot);
        if (column.hidden) {
          continue;
        }
        const worn = held.upgrades[slot];
        syncList<string | null>(
          list,
          [null, ...modChoices(held.item, slot).map((mod) => mod.id)],
          (id) => id ?? "none",
          (id) =>
            choice(id === null ? t("paperDoll.none") : itemName(id), undefined, () => {
              commit(setUpgrade(current(), context.weaponSet(), hand, slot, id));
            }),
          (node, id) => {
            chosen(node, id === worn);
            note(node, id === null ? "" : (getWeaponMod(id)?.text ?? ""));
          },
        );
      }
    },
    focusTarget() {
      if (!attribute.hidden) {
        const pill =
          pills.querySelector<HTMLElement>(".is-chosen") ??
          pills.querySelector<HTMLElement>(".paper-doll-pill");
        if (pill !== null) {
          return pill;
        }
      }
      const column = columns.find((each) => !each.hidden);
      return column?.querySelector<HTMLElement>(".is-chosen") ?? null;
    },
  };
}

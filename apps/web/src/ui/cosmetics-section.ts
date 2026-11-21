import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  type CosmeticEntry,
  type CosmeticSlot,
} from "../cosmetics/catalog.js";
import { cosmeticsStore, type CosmeticsStore } from "../cosmetics/store.js";
import { isUnlocked } from "../cosmetics/unlocks.js";
import { t, type MessageKey } from "../i18n/index.js";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * Options > Cosmetics (ADR-0056, #3577): one picker per slot, each item
 * wearable or locked with what earns it, and whether other players'
 * cosmetics are drawn. A pick applies at once and is kept per key, for
 * every character. Locked is read off your last known leaderboard entry.
 */

const SLOT_LABEL: Record<CosmeticSlot, MessageKey> = {
  frame: "cosmetics.slot.frame",
  title: "cosmetics.slot.title",
  flame: "cosmetics.slot.flame",
  aura: "cosmetics.slot.aura",
  trail: "cosmetics.slot.trail",
};

/** What earns `entry`, as the picker says it. */
export function requirementText(entry: CosmeticEntry): string {
  const { requires } = entry;
  if ("wins" in requires) {
    return t("cosmetics.requires.wins", { count: requires.wins });
  }
  if ("rankAtMost" in requires) {
    return t("cosmetics.requires.top", { rank: requires.rankAtMost });
  }
  return t("cosmetics.requires.streak", { count: requires.streakAtLeast });
}

/** One slot's picker: None, then each item, the picked one pressed. */
function slotPicker(store: CosmeticsStore, slot: CosmeticSlot): HTMLElement {
  const group = h("fieldset", "cosmetics-slot");
  group.dataset.slot = slot;
  group.appendChild(h("legend", undefined, t(SLOT_LABEL[slot])));
  const facts = store.lastFacts();
  const picked = store.choice()[slot];
  const option = (
    id: string | undefined,
    label: string,
    detail: string | undefined,
    locked: boolean,
  ) => {
    const button = document.createElement("button");
    button.className = "cosmetics-item";
    button.type = "button";
    button.dataset.item = id ?? "none";
    button.setAttribute("aria-pressed", String(id === picked));
    button.classList.toggle("locked", locked);
    // A locked item stays picked if it was (you lost Top 100), but cannot be newly picked.
    button.disabled = locked && id !== picked;
    button.appendChild(h("span", "cosmetics-item-name", label));
    if (detail !== undefined) {
      button.appendChild(h("span", "cosmetics-item-detail", detail));
    }
    if (locked) {
      button.appendChild(h("span", "cosmetics-item-locked", t("cosmetics.locked")));
    }
    button.addEventListener("click", () => {
      store.pick(slot, id);
    });
    return button;
  };
  group.appendChild(option(undefined, t("cosmetics.none"), undefined, false));
  for (const entry of COSMETIC_CATALOG) {
    if (entry.slot === slot) {
      group.appendChild(
        option(entry.id, t(entry.name), requirementText(entry), !isUnlocked(entry, facts)),
      );
    }
  }
  return group;
}

/** The section over `store`: the page's own by default, a test's own in a test. */
export function cosmeticsSection(store: CosmeticsStore = cosmeticsStore): OptionsSection {
  return {
    id: "cosmetics",
    get title() {
      return t("options.cosmetics");
    },
    mount: (container) => {
      const draw = (): void => {
        const field = h("label", "sound-toggle cosmetics-show-others");
        const show = document.createElement("input");
        show.type = "checkbox";
        show.checked = store.showOthers();
        show.addEventListener("change", () => {
          store.setShowOthers(show.checked);
        });
        field.append(show, h("span", undefined, t("cosmetics.showOthers")));
        container.replaceChildren(
          h("p", "cosmetics-note", t("cosmetics.note")),
          field,
          ...COSMETIC_SLOTS.map((slot) => slotPicker(store, slot)),
        );
      };
      draw();
      return store.onChange(draw);
    },
  };
}

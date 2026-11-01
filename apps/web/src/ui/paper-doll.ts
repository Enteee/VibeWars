import {
  ARMOR_SLOTS,
  getInsignia,
  getUniversalRune,
  perSlotAmount,
  type ArmorSlot,
  type EquippedRune,
  type InsigniaId,
  type ProfessionId,
  type RuneEffect,
  type WeaponSetIndex,
} from "@vibewars/game-core";

import type { StoredCharacter } from "../storage/schema.js";
import {
  encodeRune,
  insigniaChoices,
  insigniaEffectNote,
  runeChoices,
  setInsignia,
  setInsigniaOnAll,
  setRune,
  type RuneChoice,
} from "./gear-editor.js";
import { gearIconImg, insigniaIcon, offhandIcon, runeIcon, weaponIcon } from "./icons.js";
import { button, h, syncList } from "./kit.js";
import { PAPER_DOLL_ANCHORS, PAPER_DOLL_SIZE } from "./paper-doll-figure.js";

/** What the paper-doll needs of the editor: the character, a way to change it, the set shown. */
export interface PaperDollContext {
  readonly current: () => StoredCharacter;
  readonly commit: (next: StoredCharacter) => void;
  readonly weaponSet: () => WeaponSetIndex;
}

export interface PaperDoll {
  readonly element: HTMLElement;
  /** The headgear row's own control (#1140), placed after its upgrades. */
  readonly headgearSlot: HTMLElement;
  update(character: StoredCharacter): void;
  isOpen(): boolean;
  /** Put the popover away, if open. */
  close(): void;
}

/** A piece's name as the player reads it, and its place on the figure. */
export const PIECE_NAME: Readonly<Record<ArmorSlot, string>> = {
  head: "Headgear",
  chest: "Chest",
  hands: "Gloves",
  legs: "Leggings",
  feet: "Boots",
};

const PIECE_NUMBER: Readonly<Record<ArmorSlot, string>> = {
  head: "①",
  chest: "②",
  hands: "③",
  legs: "④",
  feet: "⑤",
};

/** The figure takes the primary's colour, the colour of its icon (scripts/assets/icon-kit.mjs). */
const PROFESSION_TINT: Readonly<Record<ProfessionId, string>> = {
  warrior: "#e3b341",
  ranger: "#8fd36b",
  monk: "#9ecbff",
  necromancer: "#3fb68b",
  mesmer: "#e87fd0",
  elementalist: "#ff6e5a",
  assassin: "#c0405e",
  ritualist: "#a9e5e0",
  paragon: "#f0883e",
  dervish: "#c9a27e",
};

/** The figure (#2058); the stylesheet draws it, and tints it through it as a mask. */
const FIGURE_URL = `${import.meta.env.BASE_URL}icons/paper-doll/figure.svg`;

/** Under this width the popover is a sheet along the bottom, placed by the stylesheet. */
const SHEET_BELOW = 700;
const MARGIN = 8;

/**
 * The armor paper-doll (#2059): a figure with a numbered hotspot on each
 * piece, its insignia and rune beside it, the shown set's weapons in its
 * hands; a summary row per piece; and one popover that picks a piece's
 * insignia and rune. It replaces the armor grid and the library's
 * insignia and rune groups: this is the one way to pick them.
 */
export function mountPaperDoll(context: PaperDollContext): PaperDoll {
  const { current, commit } = context;
  const element = h("div", "paper-doll");

  // --- the figure -----------------------------------------------------
  const stage = h("div", "paper-doll-stage");
  const figure = h("div", "paper-doll-figure");
  figure.setAttribute("aria-hidden", "true");
  figure.style.setProperty("--figure", `url("${FIGURE_URL}")`);
  stage.appendChild(figure);
  const at = (node: HTMLElement, anchor: { readonly x: number; readonly y: number }): void => {
    node.style.left = `${String((anchor.x / PAPER_DOLL_SIZE.width) * 100)}%`;
    node.style.top = `${String((anchor.y / PAPER_DOLL_SIZE.height) * 100)}%`;
  };

  const hands = (["mainHand", "offHand"] as const).map((hand) => {
    const node = h("span", "paper-doll-hand");
    node.dataset.hand = hand;
    at(node, PAPER_DOLL_ANCHORS[hand]);
    stage.appendChild(node);
    return { hand, node, shown: "" };
  });

  // --- the summary ----------------------------------------------------
  const summary = h("div", "paper-doll-summary");
  const headgearSlot = h("div", "paper-doll-headgear");

  const pieces = ARMOR_SLOTS.map((slot, index) => {
    const hotspot = button("", "paper-doll-hotspot", () => {
      toggle(slot);
    });
    hotspot.dataset.slot = slot;
    hotspot.dataset.cause = `equipment.armor.${slot}`;
    hotspot.setAttribute("aria-haspopup", "dialog");
    hotspot.setAttribute("aria-expanded", "false");
    hotspot.setAttribute("aria-label", PIECE_NAME[slot]);
    at(hotspot, PAPER_DOLL_ANCHORS[slot]);
    const icons = h("span", "paper-doll-hotspot-icons");
    hotspot.append(h("span", "paper-doll-hotspot-number", String(index + 1)), icons);
    stage.appendChild(hotspot);

    const row = h("div", "paper-doll-row");
    row.dataset.slot = slot;
    row.dataset.cause = `equipment.armor.${slot}`;
    const pick = button("", "paper-doll-row-pick", () => {
      toggle(slot);
    });
    pick.setAttribute("aria-haspopup", "dialog");
    const insignia = h("span", "paper-doll-row-part");
    const rune = h("span", "paper-doll-row-part");
    pick.append(
      h("span", "paper-doll-row-name", PIECE_NAME[slot]),
      h("span", "paper-doll-row-dot", "·"),
      insignia,
      h("span", "paper-doll-row-dot", "·"),
      rune,
    );
    row.appendChild(pick);
    if (slot === "head") {
      row.appendChild(headgearSlot);
    }
    summary.appendChild(row);
    return { slot, hotspot, icons, row, pick, insignia, rune, shown: "" };
  });

  // --- the popover ----------------------------------------------------
  const popover = h("div", "paper-doll-popover");
  popover.setAttribute("role", "dialog");
  popover.hidden = true;
  const title = h("div", "paper-doll-popover-title");
  const insigniaList = h("div", "paper-doll-list");
  insigniaList.setAttribute("role", "listbox");
  insigniaList.setAttribute("aria-label", "Insignia");
  const runeList = h("div", "paper-doll-list");
  runeList.setAttribute("role", "listbox");
  runeList.setAttribute("aria-label", "Rune");
  const applyAll = button("Apply insignia to all 5", "paper-doll-apply-all", () => {
    if (open === undefined) {
      return;
    }
    commit(setInsigniaOnAll(current(), current().equipment.armor[open].insigniaId));
  });
  // Side by side, each list scrolling on its own, so neither pushes the other out of sight.
  const insignias = h("div", "paper-doll-popover-column");
  insignias.append(h("div", "paper-doll-popover-heading", "Insignia"), insigniaList, applyAll);
  const runes = h("div", "paper-doll-popover-column");
  runes.append(h("div", "paper-doll-popover-heading", "Rune"), runeList);
  popover.append(title, insignias, runes);
  // Arrow keys walk a list; Esc closes and goes back to the piece.
  popover.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // The popover's, not the editor's: Esc here closes it and nothing else.
      event.preventDefault();
      event.stopPropagation();
      const slot = open;
      close();
      pieces.find((piece) => piece.slot === slot)?.hotspot.focus();
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const target = event.target;
    if (step === 0 || !(target instanceof HTMLElement)) {
      return;
    }
    const list = target.parentElement;
    if (!list?.classList.contains("paper-doll-list")) {
      return;
    }
    event.preventDefault();
    const entries = Array.from(list.children);
    const next = entries[entries.indexOf(target) + step];
    if (next instanceof HTMLElement) {
      next.focus();
    }
  });
  element.append(stage, summary, popover);

  let open: ArmorSlot | undefined;

  const onOutside = (event: PointerEvent): void => {
    const target = event.target;
    if (
      target instanceof Node &&
      !popover.contains(target) &&
      !pieces.some((piece) => piece.hotspot.contains(target) || piece.pick.contains(target))
    ) {
      close();
    }
  };
  const onMove = (): void => {
    place();
  };

  function close(): void {
    if (open === undefined) {
      return;
    }
    open = undefined;
    popover.hidden = true;
    document.removeEventListener("pointerdown", onOutside, { capture: true });
    window.removeEventListener("resize", onMove);
    document.removeEventListener("scroll", onMove, { capture: true });
    for (const piece of pieces) {
      piece.hotspot.setAttribute("aria-expanded", "false");
      piece.row.classList.remove("is-open");
    }
  }

  function toggle(slot: ArmorSlot): void {
    if (open === slot) {
      close();
      return;
    }
    const opening = open === undefined;
    open = slot;
    popover.hidden = false;
    if (opening) {
      document.addEventListener("pointerdown", onOutside, { capture: true });
      window.addEventListener("resize", onMove);
      document.addEventListener("scroll", onMove, { capture: true });
    }
    for (const piece of pieces) {
      piece.hotspot.setAttribute("aria-expanded", String(piece.slot === slot));
      piece.row.classList.toggle("is-open", piece.slot === slot);
    }
    fill(current());
    place();
    insigniaList.querySelector<HTMLElement>(".is-chosen")?.focus();
  }

  /**
   * Beside the open piece's hotspot, inside the window: to its right, or
   * flipped to its left when there is no room, and lifted to fit. A
   * narrow window gets a sheet along the bottom from the stylesheet.
   */
  function place(): void {
    const piece = pieces.find((candidate) => candidate.slot === open);
    if (piece === undefined) {
      return;
    }
    if (window.innerWidth < SHEET_BELOW) {
      popover.style.left = "";
      popover.style.top = "";
      return;
    }
    const anchor = piece.hotspot.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const right = anchor.right + MARGIN;
    const left =
      right + box.width <= window.innerWidth - MARGIN
        ? right
        : Math.max(MARGIN, anchor.left - MARGIN - box.width);
    const top = Math.max(
      MARGIN,
      Math.min(anchor.top - MARGIN, window.innerHeight - MARGIN - box.height),
    );
    popover.style.left = `${String(left)}px`;
    popover.style.top = `${String(top)}px`;
  }

  /** The open piece's lists, as `character` has it; kept, not rebuilt, so focus survives a pick. */
  function fill(character: StoredCharacter): void {
    const slot = open;
    if (slot === undefined) {
      return;
    }
    const piece = character.equipment.armor[slot];
    title.textContent = `${PIECE_NUMBER[slot]} ${PIECE_NAME[slot]}`;
    popover.setAttribute("aria-label", PIECE_NAME[slot]);
    applyAll.disabled = piece.insigniaId === null;

    syncList<InsigniaEntry>(
      insigniaList,
      [{ id: null }, ...insigniaChoices(character).map((insignia) => ({ id: insignia.id }))],
      (entry) => entry.id ?? "none",
      (entry) =>
        choice(
          entry.id === null ? "None" : (getInsignia(entry.id)?.name ?? entry.id),
          entry.id === null ? undefined : insigniaIcon(entry.id),
          () => {
            if (open !== undefined) {
              commit(setInsignia(current(), open, entry.id));
            }
          },
        ),
      (node, entry) => {
        chosen(node, entry.id === piece.insigniaId);
        // Worth more on the chest than the gloves: said for this piece.
        note(node, entry.id === null ? "" : insigniaNote(entry.id, slot));
      },
    );

    const worn = piece.rune === null ? "none" : encodeRune(piece.rune);
    // The primary's attribute runes, then the universal ones.
    const runes = runeChoices(character);
    syncList<RuneChoice | null>(
      runeList,
      [
        null,
        ...runes.filter((entry) => entry.rune.kind === "attribute"),
        ...runes.filter((entry) => entry.rune.kind === "universal"),
      ],
      (entry) => entry?.key ?? "none",
      (entry) =>
        choice(
          entry === null ? "None" : entry.label,
          entry === null ? undefined : runeIcon(entry.rune),
          () => {
            if (open !== undefined) {
              commit(setRune(current(), open, entry?.rune ?? null));
            }
          },
        ),
      (node, entry) => {
        chosen(node, (entry?.key ?? "none") === worn);
        note(node, entry === null ? "" : runeNote(entry.rune));
      },
    );
  }

  return {
    element,
    headgearSlot,
    isOpen: () => open !== undefined,
    close,
    update(character) {
      figure.style.setProperty("--tint", PROFESSION_TINT[character.primaryProfession]);

      for (const piece of pieces) {
        const worn = character.equipment.armor[piece.slot];
        const signature = `${worn.insigniaId ?? ""}|${worn.rune === null ? "" : encodeRune(worn.rune)}`;
        if (signature === piece.shown) {
          continue;
        }
        piece.shown = signature;
        const insignia = worn.insigniaId === null ? undefined : insigniaIcon(worn.insigniaId);
        const rune = worn.rune === null ? undefined : runeIcon(worn.rune);
        piece.icons.replaceChildren(slotIcon(insignia), slotIcon(rune));
        piece.insignia.replaceChildren(...named(insignia));
        piece.rune.replaceChildren(...named(rune));
        piece.hotspot.title = `${PIECE_NAME[piece.slot]}: ${insignia?.name ?? "no insignia"}, ${rune?.name ?? "no rune"}`;
      }

      // The shown set's weapons in the hands; display only. Bare hands hold nothing.
      const held = character.equipment.weaponSets[context.weaponSet()];
      const mainHand = held?.mainHand.weaponId;
      const offHand = held?.offHand?.offhandId;
      for (const entry of hands) {
        const icon =
          entry.hand === "mainHand"
            ? mainHand === undefined || mainHand === "unarmed"
              ? undefined
              : weaponIcon(mainHand)
            : offHand === undefined
              ? undefined
              : offhandIcon(offHand);
        const signature = icon?.src ?? "";
        if (signature !== entry.shown) {
          entry.shown = signature;
          const img = gearIconImg(icon);
          entry.node.replaceChildren(...(img === undefined ? [] : [img]));
        }
      }

      // An open popover re-lists: a new primary changes which fit.
      fill(character);
    },
  };
}

/** An insignia list entry: None, or one to wear. */
interface InsigniaEntry {
  readonly id: InsigniaId | null;
}

/** An insignia or rune icon beside a hotspot, or a dashed empty slot. */
function slotIcon(icon: Parameters<typeof gearIconImg>[0]): HTMLElement {
  return gearIconImg(icon) ?? h("span", "paper-doll-empty");
}

/** A summary row's part: its icon before its name, or "—". */
function named(icon: Parameters<typeof gearIconImg>[0]): HTMLElement[] {
  const img = gearIconImg(icon);
  return img === undefined || icon === undefined
    ? [h("span", "paper-doll-none", "—")]
    : [img, h("span", "paper-doll-part-name", icon.name)];
}

function choice(
  name: string,
  icon: Parameters<typeof gearIconImg>[0],
  onPick: () => void,
): HTMLElement {
  const node = button("", "paper-doll-choice", onPick);
  node.setAttribute("role", "option");
  const img = gearIconImg(icon);
  node.append(
    img ?? h("span", "paper-doll-choice-blank"),
    h("span", "paper-doll-choice-name", name),
    h("span", "paper-doll-choice-note"),
  );
  return node;
}

/** An entry's effect text; the note is its last child. */
function note(node: HTMLElement, text: string): void {
  const last = node.lastElementChild;
  if (last !== null && last.textContent !== text) {
    last.textContent = text;
  }
}

function chosen(node: HTMLElement, on: boolean): void {
  node.classList.toggle("is-chosen", on);
  node.setAttribute("aria-selected", String(on));
}

/** What an insignia is worth on *this* piece: Survivor gives more on the chest than the gloves. */
function insigniaNote(insigniaId: InsigniaId, slot: ArmorSlot): string {
  const effect = getInsignia(insigniaId)?.effect;
  if (effect === undefined) {
    return "";
  }
  return effect.kind === "health" || effect.kind === "energy"
    ? `+${String(perSlotAmount(effect, slot))} ${effect.kind}`
    : insigniaEffectNote(effect);
}

/** What a universal rune does; an attribute rune's label already says it. */
function runeNote(rune: EquippedRune): string {
  if (rune.kind === "attribute") {
    return "";
  }
  const effect = getUniversalRune(rune.runeId)?.byTier[rune.tier];
  return effect === undefined ? "" : runeEffectNote(effect);
}

function runeEffectNote(effect: RuneEffect): string {
  switch (effect.kind) {
    case "health":
    case "energy":
      return `+${String(effect.amount)} ${effect.kind}`;
    case "flat-physical-reduction":
      return `−${String(effect.amount)} physical damage taken`;
    case "status-duration":
      return `${effect.statusIds.map((id) => id.replace("-", " ")).join(", ")} −${String(Math.round(effect.reduction * 100))}% duration`;
  }
}

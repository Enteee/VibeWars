import { PROFESSIONS, type ProfessionId } from "@vibewars/game-core";
import type { WireCape } from "@vibewars/game-protocol";

import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  cosmeticById,
  type CosmeticEntry,
  type CosmeticLook,
  type CosmeticSlot,
} from "../cosmetics/catalog.js";
import { ownCosmetics, type WornCosmetics } from "../cosmetics/selection.js";
import type { CosmeticsStore } from "../cosmetics/store.js";
import { isUnlocked } from "../cosmetics/unlocks.js";
import { professionName } from "../i18n/game-names.js";
import { locale, t, type MessageKey } from "../i18n/index.js";
import { LANGUAGES } from "../i18n/languages.js";
import type { FigureLook } from "./character-card.js";
import type { createCosmeticsPreview } from "./cosmetics-preview.js";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";
import { loadPlayerName, playerGuildTag } from "./player-section.js";

/**
 * Options > Cosmetics (ADR-0056, #3577): one row of swatches per slot
 * (#3988), each item wearable or locked with what earns it, said on the
 * line under the row. A pick applies at once and is kept per key, for
 * every character. Locked is read off your last known leaderboard entry.
 */

const SLOT_LABEL: Record<CosmeticSlot, MessageKey> = {
  frame: "cosmetics.slot.frame",
  title: "cosmetics.slot.title",
  flame: "cosmetics.slot.flame",
  aura: "cosmetics.slot.aura",
  trail: "cosmetics.slot.trail",
  swing: "cosmetics.slot.swing",
  cape: "cosmetics.slot.cape",
  spawn: "cosmetics.slot.spawn",
  dissolve: "cosmetics.slot.dissolve",
  emblemFrame: "cosmetics.slot.emblemFrame",
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

/** The cape a swatch draws a pattern or a trim frame in: the player's own. */
export type SwatchCape = Pick<WireCape, "main" | "trim">;

/** A cape's colours for a player with none, as a cape's are spelt: a plain grey cloth. */
const PLAIN_CAPE: SwatchCape = { main: "6b6f78", trim: "c9ccd2" };

/**
 * How a swatch draws `entry` (#3988), in CSS: `kind` picks the drawing
 * (a ring, a flame, a wave…), `variant` a cape's pattern, a spawn or
 * dissolve's motif or an emblem frame's studs, and `colours` the custom
 * properties it is drawn in, `--swatch` always.
 */
export interface SwatchStyle {
  readonly kind: CosmeticLook["kind"];
  readonly variant: string | null;
  readonly colours: Readonly<Record<string, string>>;
}

/** `colour`, 0xRRGGBB, as CSS spells it. */
function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/** The swatch of `entry`, a cape's in `cape`'s colours. */
export function swatchStyle(entry: CosmeticEntry, cape: SwatchCape | null): SwatchStyle {
  const { look } = entry;
  const worn = cape ?? PLAIN_CAPE;
  switch (look.kind) {
    case "title":
      return {
        kind: look.kind,
        variant: null,
        colours: { "--swatch": css(look.colour), "--swatch-glow": css(look.glow) },
      };
    case "cape":
      return {
        kind: look.kind,
        variant: look.pattern,
        colours: { "--swatch": `#${worn.main}`, "--swatch-trim": `#${worn.trim}` },
      };
    case "spawn":
    case "dissolve":
      return { kind: look.kind, variant: look.motif, colours: { "--swatch": css(look.colour) } };
    case "emblemFrame":
      return {
        kind: look.kind,
        variant: look.studs ? "studs" : null,
        colours: {
          "--swatch": look.colour === "trim" ? `#${worn.trim}` : css(look.colour),
        },
      };
    default:
      return { kind: look.kind, variant: null, colours: { "--swatch": css(look.colour) } };
  }
}

/** What a swatch holds: an item's id, or `undefined` for None. */
export type SwatchItem = string | undefined;

/**
 * A press on a swatch (#3989): the swatch pressed, whether it has been
 * held long enough to preview, and whether the click a released hold
 * sends after it is to be swallowed.
 */
export interface PressState {
  readonly pressing: { readonly item: SwatchItem; readonly held: boolean } | null;
  readonly swallowClick: boolean;
}

export const NO_PRESS: PressState = { pressing: null, swallowClick: false };

/** What happens to a swatch: pressed, held `HOLD_MS`, let go, left, cancelled, or clicked. */
export type PressEvent =
  | { readonly kind: "down"; readonly item: SwatchItem }
  | { readonly kind: "held" }
  | { readonly kind: "up" }
  | { readonly kind: "leave" }
  | { readonly kind: "cancel" }
  | { readonly kind: "click"; readonly item: SwatchItem };

/** A press's outcome: the next state, what the figure previews, and what is picked. */
export interface PressOutcome {
  readonly state: PressState;
  readonly preview: { readonly item: SwatchItem } | null;
  readonly pick: { readonly item: SwatchItem } | null;
}

/** How long a press is held before it previews, ms. */
export const HOLD_MS = 300;

/**
 * The swatch press (#3989), as a pure step: a press held `HOLD_MS`
 * previews its item on the figure, earned or not; let go, an earned one
 * is picked, a locked one only stops previewing. Leaving the swatch or a
 * cancel stops it and picks nothing. A plain click picks an earned item
 * and does nothing to a locked one; the click a released hold sends after
 * it is swallowed, as the hold already did what it meant.
 */
export function previewPress(
  state: PressState,
  event: PressEvent,
  { unlocked }: { readonly unlocked: (item: SwatchItem) => boolean },
): PressOutcome {
  const { pressing } = state;
  switch (event.kind) {
    case "down":
      return {
        state: { pressing: { item: event.item, held: false }, swallowClick: false },
        preview: null,
        pick: null,
      };
    case "held":
      return pressing === null
        ? { state, preview: null, pick: null }
        : {
            state: { ...state, pressing: { ...pressing, held: true } },
            preview: { item: pressing.item },
            pick: null,
          };
    case "up":
      if (pressing?.held !== true) {
        return { state: NO_PRESS, preview: null, pick: null };
      }
      return {
        state: { pressing: null, swallowClick: true },
        preview: null,
        pick: unlocked(pressing.item) ? { item: pressing.item } : null,
      };
    case "leave":
    case "cancel":
      return { state: NO_PRESS, preview: null, pick: null };
    case "click":
      if (state.swallowClick) {
        return { state: NO_PRESS, preview: null, pick: null };
      }
      return {
        state: NO_PRESS,
        preview: null,
        pick: unlocked(event.item) ? { item: event.item } : null,
      };
  }
}

/** One swatch: what it draws, what it says, and whether it may be picked. */
interface Swatch {
  readonly id: SwatchItem;
  readonly style: SwatchStyle | null;
  readonly detail: string;
  /** What the detail line says while it is previewed (#3989). */
  readonly previewing: string;
  readonly locked: boolean;
}

/** What the detail line says of `entry`: its name, what earns it, and whether that is still to come. */
function detailOf(entry: CosmeticEntry, locked: boolean): string {
  const said = t("cosmetics.detail", { name: t(entry.name), requirement: requirementText(entry) });
  return locked ? `${said} · ${t("cosmetics.locked")}` : said;
}

/** What the detail line says while `entry` is previewed: its name, and what earns it while locked. */
function previewingOf(entry: CosmeticEntry, locked: boolean): string {
  const said = t("cosmetics.previewing", { name: t(entry.name) });
  return locked ? `${said} · ${requirementText(entry)}` : said;
}

/** How far a touch may move before it is a scroll and not a hold, CSS px. */
const SCROLL_SLOP_PX = 10;

/**
 * The page's one swatch press (#3989): only the first pointer counts, so a
 * second finger does nothing while one holds a swatch.
 */
interface Presses {
  state: PressState;
  pointer: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * One slot's row: None, then a swatch per item, the picked one pressed.
 * The line under it names the swatch hovered or focused, else the picked
 * one, and the item previewed while a press is held (#3989). The row is
 * one tab stop; the arrow keys move along it. `onPreview` hears the
 * item held, and `null` when the hold ends.
 */
function slotPicker(
  store: CosmeticsStore,
  slot: CosmeticSlot,
  cape: SwatchCape | null,
  presses: Presses,
  onPreview: (item: { readonly item: SwatchItem } | null) => void,
): HTMLElement {
  const group = h("fieldset", "cosmetics-slot");
  group.dataset.slot = slot;
  group.appendChild(h("legend", undefined, t(SLOT_LABEL[slot])));
  const facts = store.lastFacts();
  const picked = store.choice()[slot];
  const swatches: Swatch[] = [
    {
      id: undefined,
      style: null,
      detail: t("cosmetics.none"),
      previewing: t("cosmetics.previewing", { name: t("cosmetics.none") }),
      locked: false,
    },
    ...COSMETIC_CATALOG.filter((entry) => entry.slot === slot).map((entry) => {
      const locked = !isUnlocked(entry, facts);
      return {
        id: entry.id,
        style: swatchStyle(entry, cape),
        detail: detailOf(entry, locked),
        previewing: previewingOf(entry, locked),
        locked,
      };
    }),
  ];
  // A locked item stays picked if it was (you lost Top 100), but cannot be newly picked.
  const pickable = (swatch: Swatch): boolean => !swatch.locked || swatch.id === picked;
  const unlocked = (item: SwatchItem): boolean =>
    swatches.some((swatch) => swatch.id === item && pickable(swatch));
  const row = h("div", "cosmetics-row");
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", t(SLOT_LABEL[slot]));
  const detail = h("p", "cosmetics-detail");
  const pickedDetail =
    (swatches.find((swatch) => swatch.id === picked) ?? swatches[0])?.detail ?? "";
  detail.textContent = pickedDetail;
  // Back to the swatch with focus, if the row has it, else the picked one.
  const restore = (): void => {
    const focused = buttons.find((each) => each === document.activeElement);
    detail.textContent = focused?.getAttribute("aria-label") ?? pickedDetail;
  };
  const press = (event: PressEvent, swatch: Swatch): void => {
    const outcome = previewPress(presses.state, event, { unlocked });
    presses.state = outcome.state;
    if (outcome.state.pressing?.held !== true && presses.timer !== undefined) {
      clearTimeout(presses.timer);
      presses.timer = undefined;
    }
    if (event.kind === "down") {
      presses.timer = setTimeout(() => {
        presses.timer = undefined;
        press({ kind: "held" }, swatch);
      }, HOLD_MS);
    }
    if (outcome.preview !== null) {
      detail.textContent = swatch.previewing;
      onPreview(outcome.preview);
    } else if (outcome.state.pressing === null) {
      if (event.kind !== "click") {
        presses.pointer = undefined;
        restore();
        onPreview(null);
      }
    }
    if (outcome.pick !== null) {
      store.pick(slot, outcome.pick.item);
    }
  };
  const buttons = swatches.map((swatch) => {
    const button = document.createElement("button");
    button.className = "cosmetics-swatch";
    button.type = "button";
    button.dataset.item = swatch.id ?? "none";
    button.dataset.kind = swatch.style?.kind ?? "none";
    const variant = swatch.style?.variant ?? null;
    if (variant !== null) {
      button.dataset.variant = variant;
    }
    for (const [name, value] of Object.entries(swatch.style?.colours ?? {})) {
      button.style.setProperty(name, value);
    }
    button.setAttribute("aria-pressed", String(swatch.id === picked));
    button.setAttribute("aria-label", swatch.detail);
    button.title = swatch.detail;
    button.classList.toggle("locked", swatch.locked);
    // Not `disabled`: a locked swatch still takes a press, to be previewed (#3989).
    if (!pickable(swatch)) {
      button.setAttribute("aria-disabled", "true");
    }
    button.appendChild(h("span", "cosmetics-swatch-art"));
    if (swatch.locked) {
      button.appendChild(h("span", "cosmetics-swatch-lock"));
    }
    const show = (): void => {
      if (presses.state.pressing === null) {
        detail.textContent = swatch.detail;
      }
    };
    const hide = (): void => {
      if (presses.state.pressing === null) {
        restore();
      }
    };
    button.addEventListener("pointerenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("pointerleave", (event: PointerEvent) => {
      if (presses.pointer !== undefined && event.pointerId === presses.pointer) {
        press({ kind: "leave" }, swatch);
      }
      hide();
    });
    button.addEventListener("blur", () => {
      if (presses.state.pressing !== null && presses.pointer === undefined) {
        press({ kind: "cancel" }, swatch);
      }
      hide();
    });
    let from = { x: 0, y: 0 };
    button.addEventListener("pointerdown", (event: PointerEvent) => {
      if (presses.pointer !== undefined || event.button !== 0) {
        return;
      }
      presses.pointer = event.pointerId;
      from = { x: event.clientX, y: event.clientY };
      press({ kind: "down", item: swatch.id }, swatch);
    });
    button.addEventListener("pointermove", (event: PointerEvent) => {
      const pressing = presses.state.pressing;
      if (event.pointerId !== presses.pointer || pressing === null) {
        return;
      }
      if (!pressing.held) {
        // Moved before the hold: a scroll, not a hold.
        if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > SCROLL_SLOP_PX) {
          press({ kind: "cancel" }, swatch);
        }
        return;
      }
      // A touch keeps its swatch's pointer events: off its box is a drag away.
      const box = button.getBoundingClientRect();
      const off =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
      if (off) {
        press({ kind: "leave" }, swatch);
      }
    });
    button.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.pointerId === presses.pointer) {
        press({ kind: "up" }, swatch);
      }
    });
    button.addEventListener("pointercancel", (event: PointerEvent) => {
      if (event.pointerId === presses.pointer) {
        press({ kind: "cancel" }, swatch);
      }
    });
    // Held Space is a hold; the click it sends on release is the press's to keep or swallow.
    button.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === " " && !event.repeat && presses.state.pressing === null) {
        press({ kind: "down", item: swatch.id }, swatch);
      }
    });
    button.addEventListener("keyup", (event: KeyboardEvent) => {
      if (event.key === " " && presses.pointer === undefined && presses.state.pressing !== null) {
        press({ kind: "up" }, swatch);
      }
    });
    // A long press on a phone opens no menu over the swatch.
    button.addEventListener("contextmenu", (event: Event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      press({ kind: "click", item: swatch.id }, swatch);
      show();
    });
    row.appendChild(button);
    return button;
  });
  // A roving tab stop: the picked swatch, or None if the picked one is gone.
  const stop = Math.max(
    0,
    swatches.findIndex((swatch) => swatch.id === picked),
  );
  buttons.forEach((button, index) => {
    button.tabIndex = index === stop ? 0 : -1;
  });
  row.addEventListener("keydown", (event) => {
    const step = arrowStep(event.key);
    if (step === 0) {
      return;
    }
    event.preventDefault();
    // A locked swatch is focused too: held Space previews it.
    const at = Math.max(
      0,
      buttons.findIndex((button) => button === event.target),
    );
    const next = buttons[(at + step + buttons.length) % buttons.length];
    if (next === undefined) {
      return;
    }
    for (const button of buttons) {
      button.tabIndex = button === next ? 0 : -1;
    }
    next.focus();
  });
  // The detail ends the row while there is room for it, and goes under it on a phone.
  const line = h("div", "cosmetics-line");
  line.append(row, detail);
  group.appendChild(line);
  return group;
}

/** How far `key` moves along a row: in a right-to-left language the row is mirrored. */
function arrowStep(key: string | undefined): number {
  const mirrored = LANGUAGES.find((language) => language.code === locale())?.rtl === true;
  switch (key) {
    case "ArrowRight":
      return mirrored ? -1 : 1;
    case "ArrowLeft":
      return mirrored ? 1 : -1;
    default:
      return 0;
  }
}

/**
 * The look `choice` wears with `preview` on top (#3989): the held item
 * in its slot, or the slot bare for None.
 */
export function shownLook(
  choice: WornCosmetics,
  preview: { readonly slot: CosmeticSlot; readonly item: SwatchItem } | null,
): WornCosmetics {
  if (preview === null) {
    return choice;
  }
  const entry = preview.item === undefined ? undefined : cosmeticById(preview.item);
  const { [preview.slot]: _replaced, ...rest } = choice;
  return entry === undefined ? rest : { ...rest, [preview.slot]: entry };
}

const PROFESSION_IDS = Object.keys(PROFESSIONS) as ProfessionId[];

/** `primary` and a secondary other than it: `secondary` if it is, else the first other. */
export function professionPair(
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): { readonly primary: ProfessionId; readonly secondary: ProfessionId } {
  const other = PROFESSION_IDS.find((id) => id !== primary) ?? primary;
  return {
    primary,
    secondary: secondary === undefined || secondary === primary ? other : secondary,
  };
}

/** The preview's profession pickers (#4177). */
interface ProfessionPickers {
  readonly element: HTMLElement;
  /** Show `primary`/`secondary` picked, telling no one. */
  set(primary: ProfessionId, secondary: ProfessionId | undefined): void;
  /** The pair picked now. */
  shown(): { readonly primary: ProfessionId; readonly secondary: ProfessionId };
}

/**
 * The Primary and Secondary pickers under the preview (#4177): every
 * profession, Secondary never the picked Primary. A look only: nothing
 * picked is kept or sent.
 */
function professionPickers(
  picked: (primary: ProfessionId, secondary: ProfessionId) => void,
): ProfessionPickers {
  const element = h("div", "cosmetics-professions");
  const picker = (label: MessageKey, className: string): HTMLSelectElement => {
    const field = h("label", "field");
    field.appendChild(h("span", "field-label", t(label)));
    const select = document.createElement("select");
    select.className = className;
    field.appendChild(select);
    element.appendChild(field);
    return select;
  };
  const primaryPicker = picker("cosmetics.previewPrimary", "cosmetics-primary");
  const secondaryPicker = picker("cosmetics.previewSecondary", "cosmetics-secondary");
  const options = (select: HTMLSelectElement, ids: readonly ProfessionId[]): void => {
    select.replaceChildren(
      ...ids.map((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = professionName(id);
        return option;
      }),
    );
  };
  options(primaryPicker, PROFESSION_IDS);
  let shown = professionPair(PROFESSION_IDS[0] ?? "warrior", undefined);
  const set = (primary: ProfessionId, secondary: ProfessionId | undefined): void => {
    shown = professionPair(primary, secondary);
    options(
      secondaryPicker,
      PROFESSION_IDS.filter((id) => id !== shown.primary),
    );
    primaryPicker.value = shown.primary;
    secondaryPicker.value = shown.secondary;
  };
  const read = (select: HTMLSelectElement): ProfessionId | undefined =>
    PROFESSION_IDS.find((id) => id === select.value);
  primaryPicker.addEventListener("change", () => {
    set(read(primaryPicker) ?? shown.primary, shown.secondary);
    picked(shown.primary, shown.secondary);
  });
  secondaryPicker.addEventListener("change", () => {
    set(shown.primary, read(secondaryPicker) ?? shown.secondary);
    picked(shown.primary, shown.secondary);
  });
  set(shown.primary, shown.secondary);
  return { element, set, shown: () => shown };
}

/** What the section draws the figure with: the page's own, or a test's. */
export interface SectionFigure {
  /** Your character's look, once it is known; `undefined` for none. */
  readonly look: () => Promise<FigureLook | undefined>;
  readonly preview: typeof createCosmeticsPreview;
}

/**
 * The section over `store`, the page's own or a test's. `cape` is the player's guild cape, `null` for none: the cape
 * patterns are drawn in its colours, and the emblem frame's row (#3581)
 * shows only while there is a cape for it to frame. Above the rows,
 * `figure`'s character wears the shown look (#3989).
 */
export function cosmeticsSection(
  store: CosmeticsStore,
  cape: () => SwatchCape | null,
  figure: SectionFigure,
): OptionsSection {
  return {
    id: "cosmetics",
    get title() {
      return t("options.cosmetics");
    },
    mount: (container) => {
      let groups: HTMLElement[] = [];
      let held: { readonly slot: CosmeticSlot; readonly item: SwatchItem } | null = null;
      const presses: Presses = { state: NO_PRESS, pointer: undefined, timer: undefined };
      const character = figure.look();
      const preview = figure.preview(
        () => shownLook(ownCosmetics(store.choice(), store.lastFacts()), held),
        character,
        () => ({ name: loadPlayerName(), guildTag: playerGuildTag() }),
      );
      // The pickers start on the character's professions, once known, unless one was picked first.
      let picked = false;
      const professions = professionPickers((primary, secondary) => {
        picked = true;
        preview.setProfessions(primary, secondary);
      });
      character
        .then((known) => {
          if (picked) {
            return;
          }
          if (known === undefined) {
            // No character: the figure wears the pickers' first pair, as they show it.
            const first = professions.shown();
            preview.setProfessions(first.primary, first.secondary);
          } else {
            professions.set(known.primary, known.secondary);
          }
        })
        // The preview says when the character could not be read.
        .catch(() => undefined);
      const onPreview =
        (slot: CosmeticSlot) =>
        (item: { readonly item: SwatchItem } | null): void => {
          held = item === null ? null : { slot, item: item.item };
          // A spawn or dissolve shows itself: the figure dissolves, then spawns back.
          if (held !== null && (slot === "spawn" || slot === "dissolve")) {
            preview.replayReactions();
          }
        };
      // The rows close together, not spaced as the pane's sections are.
      const slots = h("div", "cosmetics-slots");
      // The figure stays in view at the side, or on top on a phone, while the rows scroll.
      const column = h("div", "cosmetics-preview-column");
      column.append(preview.element, professions.element);
      const layout = h("div", "cosmetics-layout");
      layout.append(column, slots);
      container.replaceChildren(layout);
      const draw = (): void => {
        // The rows drawn again end any press on the old ones: a pick's click lands on no swatch.
        if (presses.timer !== undefined) {
          clearTimeout(presses.timer);
        }
        presses.state = NO_PRESS;
        presses.pointer = undefined;
        presses.timer = undefined;
        held = null;
        // A keyboard pick redraws the row under focus: focus comes back to its picked swatch.
        const active = document.activeElement;
        const focusedSlot = groups.find((group) => active !== null && group.contains(active))
          ?.dataset.slot;
        const worn = cape();
        groups = COSMETIC_SLOTS.filter((slot) => slot !== "emblemFrame" || worn !== null).map(
          (slot) => slotPicker(store, slot, worn, presses, onPreview(slot)),
        );
        slots.replaceChildren(...groups);
        const group = groups.find((each) => each.dataset.slot === focusedSlot);
        Array.from(group?.querySelectorAll<HTMLElement>(".cosmetics-swatch") ?? [])
          .find((swatch) => swatch.tabIndex === 0)
          ?.focus();
      };
      draw();
      preview.start();
      const offChange = store.onChange(draw);
      return () => {
        offChange();
        preview.stop();
        if (presses.timer !== undefined) {
          clearTimeout(presses.timer);
        }
      };
    },
  };
}

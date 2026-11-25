import type { WireCape } from "@vibewars/game-protocol";

import {
  COSMETIC_CATALOG,
  COSMETIC_SLOTS,
  type CosmeticEntry,
  type CosmeticLook,
  type CosmeticSlot,
} from "../cosmetics/catalog.js";
import { cosmeticsStore, type CosmeticsStore } from "../cosmetics/store.js";
import { isUnlocked } from "../cosmetics/unlocks.js";
import { locale, t, type MessageKey } from "../i18n/index.js";
import { LANGUAGES } from "../i18n/languages.js";
import { h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";
import { playerGuild } from "./player-section.js";

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

/** One swatch: what it draws, what it says, and whether it may be picked. */
interface Swatch {
  readonly id: string | undefined;
  readonly style: SwatchStyle | null;
  readonly detail: string;
  readonly locked: boolean;
}

/** What the detail line says of `entry`: its name, what earns it, and whether that is still to come. */
function detailOf(entry: CosmeticEntry, locked: boolean): string {
  const said = t("cosmetics.detail", { name: t(entry.name), requirement: requirementText(entry) });
  return locked ? `${said} · ${t("cosmetics.locked")}` : said;
}

/**
 * One slot's row: None, then a swatch per item, the picked one pressed.
 * The line under it names the swatch hovered or focused, else the
 * picked one. The row is one tab stop; the arrow keys move along it.
 */
function slotPicker(
  store: CosmeticsStore,
  slot: CosmeticSlot,
  cape: SwatchCape | null,
): HTMLElement {
  const group = h("fieldset", "cosmetics-slot");
  group.dataset.slot = slot;
  group.appendChild(h("legend", undefined, t(SLOT_LABEL[slot])));
  const facts = store.lastFacts();
  const picked = store.choice()[slot];
  const swatches: Swatch[] = [
    { id: undefined, style: null, detail: t("cosmetics.none"), locked: false },
    ...COSMETIC_CATALOG.filter((entry) => entry.slot === slot).map((entry) => {
      const locked = !isUnlocked(entry, facts);
      return {
        id: entry.id,
        style: swatchStyle(entry, cape),
        detail: detailOf(entry, locked),
        locked,
      };
    }),
  ];
  const row = h("div", "cosmetics-row");
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", t(SLOT_LABEL[slot]));
  const detail = h("p", "cosmetics-detail");
  const pickedDetail =
    (swatches.find((swatch) => swatch.id === picked) ?? swatches[0])?.detail ?? "";
  detail.textContent = pickedDetail;
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
    // A locked item stays picked if it was (you lost Top 100), but cannot be newly picked.
    button.disabled = swatch.locked && swatch.id !== picked;
    button.appendChild(h("span", "cosmetics-swatch-art"));
    if (swatch.locked) {
      button.appendChild(h("span", "cosmetics-swatch-lock"));
    }
    const show = (): void => {
      detail.textContent = swatch.detail;
    };
    const hide = (): void => {
      detail.textContent = pickedDetail;
    };
    button.addEventListener("pointerenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("blur", hide);
    button.addEventListener("click", () => {
      store.pick(slot, swatch.id);
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
    // A locked swatch cannot be focused: the arrows pass it by.
    const enabled = buttons.filter((button) => !button.disabled);
    const at = Math.max(
      0,
      enabled.findIndex((button) => button === event.target),
    );
    const next = enabled[(at + step + enabled.length) % enabled.length];
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
 * The section over `store`: the page's own by default, a test's own in a
 * test. `cape` is the player's guild cape, `null` for none: the cape
 * patterns are drawn in its colours, and the emblem frame's row (#3581)
 * shows only while there is a cape for it to frame.
 */
export function cosmeticsSection(
  store: CosmeticsStore = cosmeticsStore,
  cape: () => SwatchCape | null = () => playerGuild().guildCape,
): OptionsSection {
  return {
    id: "cosmetics",
    get title() {
      return t("options.cosmetics");
    },
    mount: (container) => {
      const draw = (): void => {
        const worn = cape();
        // The rows close together, not spaced as the pane's sections are.
        const slots = h("div", "cosmetics-slots");
        slots.append(
          ...COSMETIC_SLOTS.filter((slot) => slot !== "emblemFrame" || worn !== null).map((slot) =>
            slotPicker(store, slot, worn),
          ),
        );
        container.replaceChildren(h("p", "cosmetics-note", t("cosmetics.note")), slots);
      };
      draw();
      return store.onChange(draw);
    },
  };
}

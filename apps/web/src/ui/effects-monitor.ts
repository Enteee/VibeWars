import {
  STATUS_DEFINITIONS,
  describeStatus,
  type StatusCategory,
  type StatusId,
} from "@vibewars/game-core";
import type { StatusSnapshot } from "@vibewars/game-session";

import { STATUS_ICON } from "../render/status-icons.js";
import { placeTip } from "./skill-tooltip.js";
import { SLOT_TOOLTIP_DELAY_MS } from "./slot-tooltip.js";

/**
 * The effects monitor (#834, #483): one icon per status on a player, in
 * the order the host applied them (a refresh goes to the end, GW1), each
 * with a thin bar that drains as it runs out. No seconds on the icon, as
 * in GW1: they are in the hover, with what it does and who put it there.
 */

/** What a player reads a category as, in the hover. */
export const STATUS_CATEGORY_NAME: Readonly<Record<StatusCategory, string>> = {
  condition: "Condition",
  hex: "Hex",
  enchantment: "Enchantment",
  stance: "Stance",
  preparation: "Preparation",
  glyph: "Glyph",
  shout: "Shout",
  chant: "Chant",
  "weapon-spell": "Weapon Spell",
  "skill-effect": "Effect",
};

export interface EffectRow {
  readonly id: StatusId;
  readonly name: string;
  readonly category: StatusCategory;
  /** How much of its duration is left, 0 to 1; `undefined`: no bar. */
  readonly fraction: number | undefined;
  /** Whole seconds left, rounded up, never below 0. */
  readonly secondsLeft: number;
  /** An enchantment the player put on themselves: the corner tick. */
  readonly yours: boolean;
  /** "you", the caster's name, or "someone" for a caster no longer here. */
  readonly casterName: string;
}

/**
 * The monitor's rows for `statuses`, as sent, at match clock `now`.
 * `names` maps a session id to the name the host settled on.
 */
export function effectRows(
  statuses: readonly StatusSnapshot[],
  selfId: string,
  names: ReadonlyMap<string, string>,
  now: number,
): EffectRow[] {
  return statuses.map((status) => {
    const definition = STATUS_DEFINITIONS[status.id];
    const left = status.endsAt - now;
    const mine = status.casterId === selfId;
    return {
      id: status.id,
      name: definition.name,
      category: definition.category,
      fraction:
        status.durationSeconds > 0
          ? Math.min(1, Math.max(0, left / status.durationSeconds))
          : undefined,
      secondsLeft: Math.max(0, Math.ceil(left)),
      yours: mine && definition.category === "enchantment",
      casterName: mine ? "you" : (names.get(status.casterId) ?? "someone"),
    };
  });
}

export interface EffectsMonitor {
  readonly root: HTMLElement;
  update(rows: readonly EffectRow[]): void;
  dispose(): void;
}

interface Icon {
  readonly item: HTMLElement;
  readonly bar: HTMLElement;
  readonly fill: HTMLElement;
  /** The fill's width as last set, in whole pixels, or -1 for none yet. */
  shownPx: number;
}

/** The hover's lines for `row`. */
function renderTip(node: HTMLElement, row: EffectRow): void {
  const title = document.createElement("div");
  title.className = "tip-title";
  title.textContent = row.name;
  const type = document.createElement("div");
  type.className = "tip-type";
  type.textContent = STATUS_CATEGORY_NAME[row.category];
  const effect = document.createElement("div");
  effect.className = "tip-effect";
  effect.textContent = describeStatus(row.id);
  const from = document.createElement("div");
  from.className = "tip-effect";
  from.textContent = `from ${row.casterName}`;
  node.replaceChildren(title, type, effect, from);
  if (row.fraction !== undefined) {
    const left = document.createElement("div");
    left.className = "tip-effect";
    left.textContent = `${String(row.secondsLeft)} s left`;
    node.appendChild(left);
  }
}

/**
 * The monitor, in `parent`, with icons `size` px square. `update` reuses
 * each status's icon by id, so a frame touches only what changed.
 */
export function createEffectsMonitor(
  parent: HTMLElement,
  size: number,
  label: string,
): EffectsMonitor {
  const root = document.createElement("div");
  root.className = "effects-monitor";
  root.setAttribute("role", "list");
  root.setAttribute("aria-label", label);
  root.style.setProperty("--effect-size", `${String(size)}px`);
  root.hidden = true;
  parent.appendChild(root);

  const icons = new Map<StatusId, Icon>();
  let rows = new Map<StatusId, EffectRow>();

  // One tooltip for every icon, made on the first hover.
  let tip: HTMLElement | undefined;
  let tipFor: StatusId | undefined;
  /** The row the open hover shows, to redraw it only when that changes. */
  let tipRow: EffectRow | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    tipFor = undefined;
    tipRow = undefined;
    if (tip !== undefined) {
      tip.style.display = "none";
    }
  };
  const show = (id: StatusId): void => {
    const row = rows.get(id);
    const icon = icons.get(id);
    if (row === undefined || icon === undefined) {
      hide();
      return;
    }
    if (tip === undefined) {
      tip = document.createElement("div");
      tip.className = "skill-tip effect-tip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    tipFor = id;
    tipRow = row;
    renderTip(tip, row);
    placeTip(tip, icon.item, "above");
  };

  const iconFor = (id: StatusId, name: string): Icon => {
    const known = icons.get(id);
    if (known !== undefined) {
      return known;
    }
    const item = document.createElement("div");
    item.className = "effect";
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    const image = document.createElement("img");
    image.className = "effect-icon";
    image.src = STATUS_ICON[id];
    image.alt = name;
    image.width = size;
    image.height = size;
    image.draggable = false;
    const bar = document.createElement("div");
    bar.className = "effect-bar";
    const fill = document.createElement("div");
    fill.className = "effect-bar-fill";
    bar.appendChild(fill);
    item.append(image, bar);
    const open = (): void => {
      hide();
      tipFor = id;
      timer = setTimeout(() => {
        timer = undefined;
        show(id);
      }, SLOT_TOOLTIP_DELAY_MS);
    };
    item.addEventListener("mouseenter", open);
    item.addEventListener("focus", open);
    item.addEventListener("mouseleave", hide);
    item.addEventListener("blur", hide);
    const icon: Icon = { item, bar, fill, shownPx: -1 };
    icons.set(id, icon);
    return icon;
  };

  return {
    root,
    update(next) {
      rows = new Map(next.map((row) => [row.id, row]));
      for (const [id, icon] of icons) {
        if (!rows.has(id)) {
          icon.item.remove();
          icons.delete(id);
          if (tipFor === id) {
            hide();
          }
        }
      }
      next.forEach((row, index) => {
        const icon = iconFor(row.id, row.name);
        // In the order sent: a refreshed status moves to the end.
        if (root.children[index] !== icon.item) {
          root.insertBefore(icon.item, root.children[index] ?? null);
        }
        icon.item.classList.toggle("is-yours", row.yours);
        icon.bar.hidden = row.fraction === undefined;
        // Only a whole pixel's change touches the DOM.
        const px = Math.round((row.fraction ?? 0) * size);
        if (px !== icon.shownPx) {
          icon.shownPx = px;
          icon.fill.style.width = `${String(px)}px`;
        }
      });
      root.hidden = next.length === 0;
      // An open hover counts down with its bar.
      const open = tipFor === undefined ? undefined : rows.get(tipFor);
      if (
        tipFor !== undefined &&
        timer === undefined &&
        (open?.secondsLeft !== tipRow?.secondsLeft || open?.casterName !== tipRow?.casterName)
      ) {
        show(tipFor);
      }
    },
    dispose() {
      hide();
      tip?.remove();
      root.remove();
    },
  };
}

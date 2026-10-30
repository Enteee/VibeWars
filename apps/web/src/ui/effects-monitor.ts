import {
  STATUS_DEFINITIONS,
  describeStatus,
  type StatusCategory,
  type StatusId,
} from "@vibewars/game-core";
import type { PlayerSnapshot } from "@vibewars/game-session";

import { STATUS_ICON } from "../render/status-icons.js";
import { setHidden } from "./dom-write.js";
import { placeTip, type SkillTooltipPlacement } from "./skill-tooltip.js";
import { SLOT_TOOLTIP_DELAY_MS } from "./slot-tooltip.js";

/**
 * The effects monitor (#834, #483): one icon per status on a player, in
 * the order the host applied them (a refresh goes to the end, GW1), each
 * with a thin bar that drains as it runs out. No seconds on the icon, as
 * in GW1: they are in the hover, with what it does and who put it there.
 * After your own come the enchantments you maintain on others (#838), as
 * GW1's upkeep monitor; a double-click ends one you maintain.
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
  echo: "Echo",
  "weapon-spell": "Weapon Spell",
  item: "Item Spell",
  form: "Form",
  "skill-effect": "Effect",
};

export interface EffectRow {
  readonly id: StatusId;
  /** Who bears it: with `id`, the row's identity, as two allies may bear one status. */
  readonly bearerId: string;
  /** The bearer's name, for a row you maintain on someone else (#838); otherwise `undefined`. */
  readonly bearerName: string | undefined;
  readonly name: string;
  readonly category: StatusCategory;
  /** How much of its duration is left, 0 to 1; `undefined`: no bar. */
  readonly fraction: number | undefined;
  /**
   * Whole seconds left, rounded up, never below 0; `undefined` for a
   * maintained enchantment (#837), which lasts until something ends it.
   */
  readonly secondsLeft: number | undefined;
  /** An enchantment the player put on themselves: the corner tick. */
  readonly yours: boolean;
  /** "you", the caster's name, or "someone" for a caster no longer here. */
  readonly casterName: string;
  /** A maintained enchantment of yours (#838): a double-click ends it. */
  readonly endable: boolean;
}

/**
 * The monitor's rows for `bearer`'s statuses, as sent, at match clock
 * `now`. `names` maps a session id to the name the host settled on.
 */
export function effectRows(
  bearer: Pick<PlayerSnapshot, "sessionId" | "statuses">,
  selfId: string,
  names: ReadonlyMap<string, string>,
  now: number,
): EffectRow[] {
  return bearer.statuses.map((status) => {
    const definition = STATUS_DEFINITIONS[status.id];
    const mine = status.casterId === selfId;
    const timed =
      status.endsAt === null || status.durationSeconds === null
        ? undefined
        : { left: status.endsAt - now, duration: status.durationSeconds };
    return {
      id: status.id,
      bearerId: bearer.sessionId,
      bearerName: undefined,
      name: definition.name,
      category: definition.category,
      // A maintained one has no bar: it is not running out.
      fraction:
        timed !== undefined && timed.duration > 0
          ? Math.min(1, Math.max(0, timed.left / timed.duration))
          : undefined,
      secondsLeft: timed === undefined ? undefined : Math.max(0, Math.ceil(timed.left)),
      yours: mine && definition.category === "enchantment",
      casterName: mine ? "you" : (names.get(status.casterId) ?? "someone"),
      endable: mine && timed === undefined,
    };
  });
}

/**
 * The enchantments `selfId` maintains on the other `players` (#838), in
 * the order they come: what GW1's upkeep monitor adds to your own. Derived
 * from everyone's statuses, so a bearer who leaves takes theirs along. One
 * you maintain on yourself is already among your own.
 */
export function maintainedRows(players: readonly PlayerSnapshot[], selfId: string): EffectRow[] {
  return players.flatMap((player) =>
    player.sessionId === selfId
      ? []
      : player.statuses
          .filter((status) => status.casterId === selfId && status.durationSeconds === null)
          .map((status) => {
            const definition = STATUS_DEFINITIONS[status.id];
            return {
              id: status.id,
              bearerId: player.sessionId,
              bearerName: player.name,
              name: definition.name,
              category: definition.category,
              fraction: undefined,
              secondsLeft: undefined,
              yours: definition.category === "enchantment",
              casterName: "you",
              endable: true,
            };
          }),
  );
}

/** A row's identity in the monitor. */
function rowKey(row: Pick<EffectRow, "bearerId" | "id">): string {
  return `${row.bearerId} ${row.id}`;
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

/** The hover's lines for `row`; `canEnd` when this monitor ends an endable row on a double-click. */
function renderTip(node: HTMLElement, row: EffectRow, canEnd: boolean): void {
  const title = document.createElement("div");
  title.className = "tip-title";
  title.textContent = row.bearerName === undefined ? row.name : `${row.name} on ${row.bearerName}`;
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
  if (row.secondsLeft === undefined || row.fraction !== undefined) {
    const left = document.createElement("div");
    left.className = "tip-effect";
    // No end of its own: a maintained enchantment, or, of any other
    // category, a spirit's aura (#1064), worn while in its range.
    left.textContent =
      row.secondsLeft === undefined
        ? row.category !== "enchantment"
          ? "while in its range"
          : row.endable
            ? "maintained, −1 energy"
            : "maintained"
        : `${String(row.secondsLeft)} s left`;
    node.appendChild(left);
  }
  // Nothing else says a double-click ends it (#907).
  if (row.endable && canEnd) {
    const hint = document.createElement("div");
    hint.className = "tip-effect";
    hint.textContent = "double-click to end";
    node.appendChild(hint);
  }
}

/**
 * The monitor, in `parent`, with icons `size` px square. `update` reuses
 * each row's icon by bearer and id, so a frame touches only what changed.
 * Its tooltips open on the `placement` side of the icon (#1042).
 * A double-click on an endable row calls `onEnd` (#838); on any other,
 * or with no `onEnd`, it does nothing.
 */
export function createEffectsMonitor(
  parent: HTMLElement,
  size: number,
  label: string,
  placement: SkillTooltipPlacement,
  onEnd?: (bearerId: string, statusId: StatusId) => void,
): EffectsMonitor {
  const root = document.createElement("div");
  root.className = "effects-monitor";
  root.setAttribute("role", "list");
  root.setAttribute("aria-label", label);
  root.style.setProperty("--effect-size", `${String(size)}px`);
  root.hidden = true;
  parent.appendChild(root);

  const icons = new Map<string, Icon>();
  let rows = new Map<string, EffectRow>();

  // One tooltip for every icon, made on the first hover.
  let tip: HTMLElement | undefined;
  let tipFor: string | undefined;
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
  const show = (key: string): void => {
    const row = rows.get(key);
    const icon = icons.get(key);
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
    tipFor = key;
    tipRow = row;
    renderTip(tip, row, onEnd !== undefined);
    placeTip(tip, icon.item, placement);
  };

  const iconFor = (key: string, id: StatusId, name: string): Icon => {
    const known = icons.get(key);
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
      tipFor = key;
      timer = setTimeout(() => {
        timer = undefined;
        show(key);
      }, SLOT_TOOLTIP_DELAY_MS);
    };
    item.addEventListener("mouseenter", open);
    item.addEventListener("focus", open);
    item.addEventListener("mouseleave", hide);
    item.addEventListener("blur", hide);
    item.addEventListener("dblclick", () => {
      const row = rows.get(key);
      if (row?.endable === true) {
        onEnd?.(row.bearerId, row.id);
      }
    });
    const icon: Icon = { item, bar, fill, shownPx: -1 };
    icons.set(key, icon);
    return icon;
  };

  return {
    root,
    update(next) {
      rows = new Map(next.map((row) => [rowKey(row), row]));
      for (const [key, icon] of icons) {
        if (!rows.has(key)) {
          icon.item.remove();
          icons.delete(key);
          if (tipFor === key) {
            hide();
          }
        }
      }
      next.forEach((row, index) => {
        const icon = iconFor(rowKey(row), row.id, row.name);
        // In the order sent: a refreshed status moves to the end.
        if (root.children[index] !== icon.item) {
          root.insertBefore(icon.item, root.children[index] ?? null);
        }
        icon.item.classList.toggle("is-yours", row.yours);
        setHidden(icon.bar, row.fraction === undefined);
        // Only a whole pixel's change touches the DOM.
        const px = Math.round((row.fraction ?? 0) * size);
        if (px !== icon.shownPx) {
          icon.shownPx = px;
          icon.fill.style.width = `${String(px)}px`;
        }
      });
      setHidden(root, next.length === 0);
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

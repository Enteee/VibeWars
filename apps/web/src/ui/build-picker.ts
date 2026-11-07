import type { ProfessionId, SkillDescription, WeaponSetIndex } from "@vibewars/game-core";

import { loadLayoutLabeller, type KeyLabeller } from "../input/key-labels.js";
import {
  SKILL_ACTIONS,
  actionForCode,
  actionLabel,
  codeLabel,
  isShortcut,
} from "../input/keymap.js";
import { loadKeymap } from "../input/keymap-preference.js";
import type { TeamCharacter } from "../storage/schema.js";
import {
  describeProfessionChange,
  followTip,
  setProfessions,
  type BuildHost,
  type TippedSkill,
} from "./build-editor.js";
import {
  decodeSkillDrag,
  dropSkill,
  encodeSkillDrag,
  equipOnBar,
  type BarSlot,
  type SkillDrag,
} from "./build-drop.js";
import { applyGearDrop, decodeGearDrag } from "./gear-editor.js";
import { commitGear, mountGearLibrary } from "./gear-library-view.js";
import { TAKES_TYPING, button, h, toast } from "./kit.js";
import { mountSkillLibrary, type LibraryBody } from "./skill-library-view.js";
import type { SkillTooltip } from "./skill-tooltip.js";

/**
 * The build picker (#2565): the skill and gear libraries, under one tab
 * strip, and the rules for dropping a skill on a bar. One component for
 * the Character Builder and the Team Builder, so the two never drift: a
 * screen hands it the bars it shows, and binds its own slots to it.
 */

/** A tab the screen adds before Skills and Gear (the Team Builder's My characters). */
export interface PickerTab {
  readonly id: string;
  readonly label: string;
  readonly element: HTMLElement;
}

/** What the picker needs of the screen it sits on. */
export interface BuildPickerHost<C extends TeamCharacter> extends BuildHost {
  /**
   * Every bar a skill can be dragged between: the Character Builder's
   * one, or every member's. `current` is one of them, at `shown`.
   */
  readonly bars: () => readonly C[];
  /** Which of `bars` is `current`: what the libraries show and equip. */
  readonly shown: () => number;
  /** Keep the bars after a drop or an equip, telling the player `notice` if given. */
  readonly commitBars: (bars: readonly C[], notice: string | undefined) => void;
  /** The slot of `current`'s bar picked for the next equip (#564), if any. */
  readonly selected: () => number | undefined;
  readonly select: (slot: number | undefined) => void;
  /** Show the screen again: the picker's own state changed. */
  readonly refresh: () => void;
  readonly tooltip: SkillTooltip;
  /** Tabs before Skills and Gear. */
  readonly extraTabs?: readonly PickerTab[];
  /** The tab open first. */
  readonly tab?: string;
  /** Told each tab opened, to open it again next time. */
  readonly onTab?: (tab: string) => void;
  /** While true, a skill key over a library skill does nothing. */
  readonly keysBlocked?: () => boolean;
  /**
   * Whose gear the Gear tab equips, when not `current`'s: the Team
   * Builder's open member. With none, the tab is not offered.
   */
  readonly gearOwner?: () => BuildHost | undefined;
}

export interface BuildPicker {
  readonly element: HTMLElement;
  /** Show the libraries at the bars as they are now. */
  update(): void;
  /** Open `tab`, scrolled to the group named `group` if given (#570). */
  showLibrary(tab: string, group?: string): void;
  /**
   * Show the tooltip at `anchor`, with what `describe` says now; `update`
   * redraws it in place from `describe` again (#1932).
   */
  showTip(anchor: HTMLElement, describe: () => SkillDescription | undefined): void;
  /** A bar slot's key, from the player's keymap, as the arena's bar labels it. */
  slotLabel(slot: number): string;
  /** The weapon set the gear panel shows and edits (#489); screen state, never stored. */
  weaponSet(): WeaponSetIndex;
  selectWeaponSet(set: WeaponSetIndex): void;
  /** `commit` new professions on `on`, toasting what they dropped with an Undo (#569). */
  changeProfessions(
    on: BuildHost,
    primary: ProfessionId,
    secondary: ProfessionId | undefined,
  ): void;
  /** Let the last profession change's Undo go: another edit came after it. */
  dropUndo(): void;
  /** Say what a drop on `anchor` would do, or why it is refused, beside it. */
  showReason(anchor: HTMLElement, text: string, refused: boolean): void;
  hideReason(): void;
  /** Make `cell` a bar slot, `at()`, that skills drag from and drop on. */
  bindSlot(cell: HTMLElement, at: () => BarSlot): void;
  destroy(): void;
}

/** The skill being dragged, and the slot it came from, to dim. */
interface Dragging {
  readonly drag: SkillDrag;
  readonly origin: HTMLElement | undefined;
}

export function mountBuildPicker<C extends TeamCharacter>(
  container: HTMLElement,
  host: BuildPickerHost<C>,
): BuildPicker {
  const { tooltip } = host;
  const element = h("aside", "skill-library build-picker");
  container.appendChild(element);

  // Read once per mount, as the arena's bar does; labels by code until
  // the browser says what the layout is.
  const keymap = loadKeymap();
  let keyLabel: KeyLabeller = codeLabel;
  let destroyed = false;
  void loadLayoutLabeller().then((label) => {
    if (label !== undefined && !destroyed) {
      keyLabel = label;
      host.refresh();
    }
  });
  const slotLabel = (slot: number): string => {
    const action = SKILL_ACTIONS[slot];
    return action === undefined ? "" : actionLabel(keymap, action, keyLabel);
  };

  let weaponSet: WeaponSetIndex = 0;
  // The Undo of the last profession change (#569): one step, and gone
  // with the next edit of any kind.
  let dismissUndo: (() => void) | undefined;
  const dropUndo = (): void => {
    dismissUndo?.();
    dismissUndo = undefined;
  };
  // What the tooltip last showed a description of, to redraw on a change.
  let tipped: TippedSkill | undefined;
  const showTip = (anchor: HTMLElement, describe: () => SkillDescription | undefined): void => {
    const described = describe();
    if (described !== undefined) {
      tipped = { anchor, describe };
      tooltip.show(anchor, described);
    }
  };

  /** Drop `drag` on `to`; a refused drop changes nothing. */
  const drop = (drag: SkillDrag, to: BarSlot, copy: boolean): void => {
    const dropped = dropSkill(host.bars(), drag, to, copy, host.shown());
    if ("bars" in dropped) {
      host.commitBars(dropped.bars, dropped.notice);
    }
  };
  /** Equip `skillId` to `slot` of the shown bar; the pick, used, is let go. */
  const equipTo = (skillId: string, slot: number): void => {
    host.select(undefined);
    drop({ from: "library", skillId }, { member: host.shown(), slot }, false);
  };

  // Every library is kept, built and up to date; only the open one is in
  // the page, and each keeps its own scroll. Two libraries in one column
  // rather than two columns: the panel is already the full height of the
  // screen, and a second permanent column would squeeze the build for
  // something you only use while picking one kind of thing.
  const skills = mountSkillLibrary({
    current: host.current,
    tooltip,
    showTip,
    selected: host.selected,
    equipTo,
    slotLabel,
  });
  const gearOwner = (): BuildHost | undefined => (host.gearOwner ?? (() => host))();
  const gearHost: BuildHost = {
    current: () => {
      const owner = gearOwner();
      if (owner === undefined) {
        throw new Error("the Gear tab has no one to equip");
      }
      return owner.current();
    },
    commit: (next) => {
      gearOwner()?.commit(next);
    },
  };
  const gear = mountGearLibrary({ ...gearHost, weaponSet: () => weaponSet });
  const extraTabs = host.extraTabs ?? [];
  const bodies = new Map<string, Pick<LibraryBody, "elements" | "scroller">>([
    ...extraTabs.map(
      (tab) => [tab.id, { elements: [tab.element], scroller: tab.element }] as const,
    ),
    ["skills", skills],
    ["gear", gear],
  ]);
  const scrolled = new Map<string, number>();
  let active = host.tab !== undefined && bodies.has(host.tab) ? host.tab : "skills";

  const tabs = h("div", "library-tabs");
  tabs.setAttribute("role", "tablist");
  const tabButtons = [
    ...extraTabs.map((tab) => [tab.id, tab.label] as const),
    ["skills", "Skills"] as const,
    ["gear", "Gear"] as const,
  ].map(([id, label]) => {
    const node = button(label, "library-tab", () => {
      open(id);
    });
    node.setAttribute("role", "tab");
    tabs.appendChild(node);
    return [id, node] as const;
  });
  /** Offer the Gear tab only while it has someone to equip, leaving it if it had. */
  const markGear = (): boolean => {
    const offered = gearOwner() !== undefined;
    for (const [id, node] of tabButtons) {
      if (id === "gear") {
        node.hidden = !offered;
      }
    }
    if (!offered && active === "gear") {
      open("skills");
    }
    return offered;
  };
  const markTabs = (): void => {
    for (const [id, node] of tabButtons) {
      node.classList.toggle("is-active", id === active);
      node.setAttribute("aria-selected", String(id === active));
    }
  };
  const open = (tab: string): void => {
    const from = bodies.get(active);
    const to = bodies.get(tab);
    if (active === tab || from === undefined || to === undefined) {
      return;
    }
    scrolled.set(active, from.scroller.scrollTop);
    for (const node of from.elements) {
      node.remove();
    }
    active = tab;
    element.append(...to.elements);
    to.scroller.scrollTop = scrolled.get(tab) ?? 0;
    markTabs();
    host.onTab?.(tab);
  };
  element.append(tabs, ...(bodies.get(active)?.elements ?? []));
  markTabs();

  // Why a drop is refused, beside the slot (#2225): never colour alone.
  const reason = h("div", "drop-reason");
  reason.setAttribute("role", "status");
  reason.hidden = true;
  element.appendChild(reason);
  const showReason = (anchor: HTMLElement, text: string, refused: boolean): void => {
    const box = anchor.getBoundingClientRect();
    reason.textContent = text;
    reason.classList.toggle("is-refused", refused);
    reason.style.left = `${String(box.left)}px`;
    reason.style.top = `${String(box.bottom + 6)}px`;
    reason.hidden = false;
  };

  // What is being dragged: browsers keep a drag's data from everything
  // but the drop, and a slot must say on the way over whether it takes it.
  let dragging: Dragging | undefined;
  const marked = new Set<HTMLElement>();
  const unmark = (cell: HTMLElement): void => {
    cell.classList.remove("is-drop-target", "is-drop-refused");
    marked.delete(cell);
  };
  const endDrag = (): void => {
    dragging?.origin?.classList.remove("is-dragging");
    dragging = undefined;
    reason.hidden = true;
    for (const cell of [...marked]) {
      unmark(cell);
    }
  };
  element.addEventListener("dragstart", (event: DragEvent) => {
    const drag = decodeSkillDrag(event.dataTransfer?.getData("text/plain") ?? "");
    dragging = drag === undefined ? undefined : { drag, origin: undefined };
  });
  element.addEventListener("dragend", endDrag);

  // Dropping worn things back onto the library takes them off: a bar skill
  // on the skills tab, gear on the gear tab. The gesture players reach for
  // after dragging something out of a slot.
  element.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  element.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const drag = dragging?.drag;
    endDrag();
    if (active === "skills") {
      const bars = host.bars();
      const bar = drag?.from === "slot" ? bars[drag.member] : undefined;
      if (drag?.from === "slot" && bar !== undefined) {
        const next = [...bars];
        next[drag.member] = {
          ...bar,
          skillBar: equipOnBar(bar.skillBar, drag.slot, null).skillBar,
        };
        host.commitBars(next, undefined);
      }
      return;
    }
    const source = decodeGearDrag(event.dataTransfer?.getData("text/plain") ?? "");
    if (active === "gear" && source !== undefined) {
      commitGear(gearHost, applyGearDrop(gearHost.current(), source, { kind: "library" }));
    }
  });

  // A skill key over a library skill, hovered or focused, equips it to
  // that key's slot (#564). Not while typing, nor while the arena has the
  // keyboard, nor while the screen asks something.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat) {
      return;
    }
    const target = event.target;
    if (
      isShortcut(event) ||
      host.keysBlocked?.() === true ||
      (target instanceof Element && target.closest(`${TAKES_TYPING}, .training`) !== null)
    ) {
      return;
    }
    const action = actionForCode(keymap, event.code);
    const slot = action === undefined ? -1 : SKILL_ACTIONS.indexOf(action);
    const focused = document.activeElement?.closest<HTMLElement>(".skill-box");
    const box = focused ?? element.querySelector<HTMLElement>(".skill-box:hover");
    const skillId = box?.dataset.skillId;
    if (slot < 0 || skillId === undefined || !element.contains(box ?? null)) {
      return;
    }
    event.preventDefault();
    equipTo(skillId, slot);
  };
  document.addEventListener("keydown", onKeyDown);

  /** What a drop of `drag` on `to` would do, as the slot says it on the way over. */
  const dropText = (drag: SkillDrag, to: BarSlot, copy: boolean): string | undefined => {
    if (drag.from === "library" || drag.member === to.member) {
      return undefined;
    }
    const bars = host.bars();
    const where = `${bars[to.member]?.name ?? ""} slot ${String(to.slot + 1)}`;
    return copy
      ? `Shift: Copy to ${where} (stays on ${bars[drag.member]?.name ?? ""})`
      : `Move to ${where}`;
  };

  return {
    element,
    update() {
      skills.update(host.current());
      if (markGear()) {
        gear.update(gearHost.current());
      }
      tipped = followTip(tooltip, tipped);
    },
    showLibrary(tab, group) {
      open(tab);
      const heading = [...element.querySelectorAll<HTMLElement>(".skill-group")].find(
        (node) => node.dataset.group === group,
      );
      const scroller = bodies.get(active)?.scroller;
      if (heading !== undefined && scroller !== undefined) {
        scroller.scrollTop +=
          heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      }
    },
    showTip,
    slotLabel,
    weaponSet: () => weaponSet,
    selectWeaponSet(set) {
      weaponSet = set;
      host.refresh();
    },
    changeProfessions(on, primary, secondary) {
      const before = on.current();
      const after = setProfessions(before, primary, secondary);
      dropUndo();
      on.commit(after);
      const removed = describeProfessionChange(before, after);
      if (removed.length > 0) {
        dismissUndo = toast(`Removed: ${removed.join(", ")}`, {
          undo: () => {
            dropUndo();
            on.commit(before);
          },
        });
      }
    },
    dropUndo,
    showReason,
    hideReason() {
      reason.hidden = true;
    },
    bindSlot(cell, at) {
      // A filled slot drags its skill to another (#2227): a move, or with
      // Shift onto another member a copy, Shift as it is at the drop.
      cell.addEventListener("dragstart", (event: DragEvent) => {
        event.stopPropagation();
        const { member, slot } = at();
        if (dragging !== undefined || (host.bars()[member]?.skillBar[slot] ?? null) === null) {
          return;
        }
        tooltip.hide();
        const drag: SkillDrag = { from: "slot", member, slot };
        dragging = { drag, origin: cell };
        event.dataTransfer?.setData("text/plain", encodeSkillDrag(drag));
        if (event.dataTransfer !== null) {
          event.dataTransfer.effectAllowed = "copyMove";
        }
        cell.classList.add("is-dragging");
      });
      cell.addEventListener("dragend", endDrag);
      cell.addEventListener("dragover", (event: DragEvent) => {
        if (dragging === undefined) {
          // Something unrelated is dragged over: it may not land.
          return;
        }
        const to = at();
        const dropped = dropSkill(host.bars(), dragging.drag, to, event.shiftKey, host.shown());
        const refused = "refused" in dropped;
        cell.classList.toggle("is-drop-refused", refused);
        cell.classList.toggle("is-drop-target", !refused);
        marked.add(cell);
        if (refused) {
          showReason(cell, `⊘ ${dropped.refused}`, true);
          return;
        }
        event.preventDefault();
        const text = dropText(dragging.drag, to, event.shiftKey);
        if (text === undefined) {
          reason.hidden = true;
        } else {
          showReason(cell, text, false);
        }
      });
      cell.addEventListener("dragleave", () => {
        unmark(cell);
        reason.hidden = true;
      });
      cell.addEventListener("drop", (event: DragEvent) => {
        const drag = dragging?.drag;
        if (drag === undefined) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        endDrag();
        drop(drag, at(), event.shiftKey);
      });
    },
    destroy() {
      destroyed = true;
      dropUndo();
      document.removeEventListener("keydown", onKeyDown);
      skills.dispose();
    },
  };
}

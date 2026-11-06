import {
  describeSkill,
  MAX_ATTRIBUTE_RANK,
  skillProfessionName,
  IMPLEMENTED_SKILLS,
  type Skill,
  type SkillDescription,
  type SkillType,
} from "@vibewars/game-core";

import { equippableSkills } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import { encodeSkillDrag, equipTarget } from "./build-drop.js";
import { characterRanks } from "./character-ranks.js";
import { SKILL_TYPE_NAME, skillIcon, skillIconHtml, skillTypeBadgeHtml } from "./icons.js";
import { button, h, syncList } from "./kit.js";
import {
  filterEliteSkills,
  filterSkillsByText,
  filterSkillsByType,
  groupSkillsByAttribute,
  lockedSkills,
  skillTypesOf,
  type SkillGroup,
} from "./skill-library.js";
import { appendParts, renderSkillDescription, type SkillTooltip } from "./skill-tooltip.js";
import { attachTopbarPopover } from "./topbar-popover.js";

/**
 * The skill library (#2225): the Character Builder's, and the Team
 * Builder's for its focused member. Attribute groups folded by default
 * (#2161), search, type chips, the skills not in the game yet, and
 * locked cards of other professions. Its cards drag as
 * `encodeSkillDrag({ from: "library" })`; where they drop is the
 * screen's.
 */

/** What the library shows skills for, and where its Equip puts one. */
export interface SkillLibraryHost {
  /** The character whose professions and ranks it shows. */
  readonly current: () => TeamCharacter;
  readonly tooltip: SkillTooltip;
  /** Show the tooltip at `anchor`, with what `describe` says now. */
  readonly showTip: (anchor: HTMLElement, describe: () => SkillDescription | undefined) => void;
  /** The bar slot picked for the next equip, if any. */
  readonly selected: () => number | undefined;
  /** Equip `skillId` to `slot` of `current`. */
  readonly equipTo: (skillId: string, slot: number) => void;
  /** A bar slot's key, from the player's keymap. */
  readonly slotLabel: (slot: number) => string;
}

const LIBRARY_ICON_PX = 24;

/** The drag image's size, px (#2533). */
const DRAG_ICON_PX = 32;

/**
 * Drag `skillId`'s icon alone, the pointer at its top-left (#2533): the
 * browser's default image, the whole box, covers the bar it is dropped
 * on. The icon must be rendered when the browser takes its snapshot, at
 * once, so it waits off-screen and goes on the next frame. Eager: a lazy
 * image not yet loaded draws as nothing.
 */
function dragIcon(event: DragEvent, skillId: string): void {
  // Absent, not only null, on a synthetic event.
  const transfer = event.dataTransfer;
  if (transfer == null) {
    return;
  }
  const icon = document.createElement("img");
  icon.width = DRAG_ICON_PX;
  icon.height = DRAG_ICON_PX;
  icon.className = "skill-icon skill-drag-image";
  icon.alt = "";
  icon.src = skillIcon(skillId);
  document.body.appendChild(icon);
  transfer.setDragImage(icon, 0, 0);
  requestAnimationFrame(() => {
    icon.remove();
  });
}

/**
 * A library tab's body: the elements it puts under the tabs, and the one
 * of them that scrolls (#2161), under filters that stay put.
 */
export interface LibraryBody {
  update(character: TeamCharacter): void;
  readonly elements: readonly HTMLElement[];
  readonly scroller: HTMLElement;
}

/**
 * A card's inline details (#567): its description at your rank, and the
 * 0-12 scale of its attribute with your rank marked.
 */
function renderDetails(
  node: HTMLElement,
  description: SkillDescription,
  ranks: ReadonlyMap<string, number>,
): void {
  renderSkillDescription(node, description, { title: false });
  const { attributeId, attributeName } = description;
  if (attributeId === undefined || attributeName === undefined) {
    return;
  }
  const rank = ranks.get(attributeId) ?? 0;
  const scale = h("div", "skill-scale");
  scale.setAttribute("role", "img");
  scale.setAttribute(
    "aria-label",
    `${attributeName} rank ${String(rank)} of ${String(MAX_ATTRIBUTE_RANK)}`,
  );
  for (let step = 0; step <= MAX_ATTRIBUTE_RANK; step++) {
    const mark = h("span", "skill-scale-step", String(step));
    mark.classList.toggle("is-current", step === rank);
    mark.classList.toggle("is-reached", step < rank);
    scale.appendChild(mark);
  }
  node.appendChild(scale);
}

/** The skill library's body, and how to let go of its filter popover's page listener. */
export interface SkillLibraryBody extends LibraryBody {
  dispose(): void;
}

export function mountSkillLibrary(context: SkillLibraryHost): SkillLibraryBody {
  const { tooltip } = context;
  const search = document.createElement("input");
  search.className = "field-input skill-search";
  search.type = "search";
  search.placeholder = "Search names and text";
  search.setAttribute("aria-label", "search skills");
  // The library's "Elite" toggle (#459): only elite skills listed.
  let eliteOnly = false;
  // One chip per type the catalogue has (#567); several may be on.
  const types = new Set<SkillType>();
  const typeOrder = skillTypesOf(IMPLEMENTED_SKILLS, Object.keys(SKILL_TYPE_NAME) as SkillType[]);
  const typeLabel = (type: SkillType): string => SKILL_TYPE_NAME[type].toLowerCase();
  const chip = (label: string, onClick: () => void): HTMLButtonElement => {
    const made = button(label, "skill-type-chip", onClick);
    made.setAttribute("aria-pressed", "false");
    return made;
  };
  const typeChips = new Map<SkillType, HTMLButtonElement>();
  const chips = h("div", "skill-type-chips");
  for (const type of typeOrder) {
    const made = chip(typeLabel(type), () => {
      if (types.has(type)) {
        types.delete(type);
      } else {
        types.add(type);
      }
      filtersChanged();
    });
    typeChips.set(type, made);
    chips.appendChild(made);
  }
  const eliteChip = chip("Elite only", () => {
    eliteOnly = !eliteOnly;
    filtersChanged();
  });
  const showChips = h("div", "skill-type-chips");
  showChips.append(eliteChip);

  // The filters in one popover (#2463), under a "Filters · N" button, and
  // what is on shown beside it as tags that each turn theirs off.
  const filterButton = button("Filters", "skill-filter-button", () => {
    // The popover opens and shuts it.
  });
  const filterPopover = h("div", "skill-filter-popover");
  filterPopover.setAttribute("aria-label", "Skill filters");
  /** The open popover's own close, which refocuses the button. */
  let closeFilters: (() => void) | undefined;
  const done = button("Done", "skill-filter-done", () => {
    closeFilters?.();
  });
  filterPopover.append(
    h("div", "skill-filter-heading", "Skill type"),
    chips,
    h("div", "skill-filter-heading", "Show"),
    showChips,
    done,
  );
  const tags = h("div", "skill-filter-tags");
  let tagButtons: readonly HTMLButtonElement[] = [];
  const filters = h("div", "skill-filters");
  filters.append(search, filterButton, tags);
  const filterPopoverHandle = attachTopbarPopover(filterButton, filters, (close) => {
    closeFilters = close;
    return {
      element: filterPopover,
      focus: chips.querySelector("button") ?? done,
      dispose() {
        closeFilters = undefined;
      },
    };
  });

  /**
   * A tag that turns one filter off, focus going to the filter tag after
   * it, else the last one left, else the button: never to clear, where a
   * second Enter would wipe every filter.
   */
  const tag = (label: string, name: string, off: () => void): HTMLButtonElement => {
    const made = button(`${label} ×`, "skill-filter-tag", () => {
      const at = tagButtons.indexOf(made);
      off();
      filtersChanged();
      (tagButtons[at] ?? tagButtons.at(-1) ?? filterButton).focus();
    });
    made.setAttribute("aria-label", `remove ${name} filter`);
    return made;
  };
  const paintFilters = (): void => {
    for (const [type, made] of typeChips) {
      made.setAttribute("aria-pressed", String(types.has(type)));
    }
    eliteChip.setAttribute("aria-pressed", String(eliteOnly));
    const active = [
      ...typeOrder
        .filter((type) => types.has(type))
        .map((type) =>
          tag(typeLabel(type), typeLabel(type), () => {
            types.delete(type);
          }),
        ),
      ...(eliteOnly
        ? [
            tag("elite", "elite", () => {
              eliteOnly = false;
            }),
          ]
        : []),
    ];
    const count = active.length;
    filterButton.textContent = count === 0 ? "Filters" : `Filters · ${String(count)}`;
    filterButton.setAttribute(
      "aria-label",
      count === 0 ? "Filters" : `Filters, ${String(count)} active`,
    );
    tagButtons = [...active];
    if (count >= 2) {
      active.push(
        tag("clear", "every", () => {
          types.clear();
          eliteOnly = false;
        }),
      );
    }
    tags.replaceChildren(...active);
  };
  const filtersChanged = (): void => {
    paintFilters();
    render(context.current());
  };
  /** The card whose details are open; one at a time (#567). */
  let open: string | undefined;
  /**
   * The attribute groups the player opened (#2161): all start folded, and
   * this outlives a character or tab switch but not the editor.
   */
  const openGroups = new Set<string>();
  const groupList = h("div", "skill-group-list");

  /**
   * A click on a library skill: to the picked slot or the first empty one,
   * as its Equip says. One already on the bar stays where it is, and a
   * full bar with no pick takes nothing (#564).
   */
  const equipFromLibrary = (skill: Skill): void => {
    const character = context.current();
    const target = equipTarget(character.skillBar, context.selected());
    if (target !== undefined && !character.skillBar.includes(skill.id)) {
      context.equipTo(skill.id, target.slot);
    }
  };

  /**
   * A card (#567): a button with the name, type, cost and the number that
   * matters at your rank, which opens its details inline; then Equip, or
   * where it is on the bar. Dragging the card equips too.
   */
  const createBox = (skill: Skill): HTMLElement => {
    const box = h("div", "skill-box");
    box.draggable = true;
    box.dataset.skillId = skill.id;
    box.classList.toggle("is-elite", skill.elite);
    const card = button("", "skill-box-card", () => {
      open = open === skill.id ? undefined : skill.id;
      render(context.current());
    });
    card.setAttribute("aria-expanded", "false");
    card.insertAdjacentHTML("beforeend", skillIconHtml(skill.id, LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
    card.appendChild(h("span", "skill-box-cost"));
    card.appendChild(h("span", "skill-box-headline"));
    box.appendChild(card);
    box.appendChild(
      button("", "skill-box-equip", () => {
        equipFromLibrary(skill);
      }),
    );
    box.appendChild(h("span", "skill-box-on"));
    const details = h("div", "skill-box-details");
    details.hidden = true;
    box.appendChild(details);
    box.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData(
        "text/plain",
        encodeSkillDrag({ from: "library", skillId: skill.id }),
      );
      dragIcon(event, skill.id);
    });
    // The hover tooltip stays beside the inline details (#549 Q3), as in
    // GW1's skill window.
    box.addEventListener("mouseenter", () => {
      context.showTip(box, () => describeSkill(skill, characterRanks(context.current())));
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    return box;
  };

  /**
   * A locked card (#568): a skill of a profession you do not have, tagged
   * with the one it needs. It opens its details, but has no Equip and
   * does not drag.
   */
  const createLockedBox = (skill: Skill): HTMLElement => {
    const box = h("div", "skill-locked-box");
    box.dataset.skillId = skill.id;
    box.classList.toggle("is-elite", skill.elite);
    const card = button("", "skill-box-card", () => {
      open = open === skill.id ? undefined : skill.id;
      render(context.current());
    });
    card.setAttribute("aria-expanded", "false");
    card.insertAdjacentHTML("beforeend", skillIconHtml(skill.id, LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
    card.appendChild(h("span", "skill-box-cost"));
    card.appendChild(h("span", "skill-box-headline"));
    box.appendChild(card);
    box.appendChild(h("span", "skill-box-needs", `needs ${skillProfessionName(skill.profession)}`));
    const details = h("div", "skill-box-details");
    details.hidden = true;
    box.appendChild(details);
    box.addEventListener("mouseenter", () => {
      context.showTip(box, () => describeSkill(skill, characterRanks(context.current())));
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    return box;
  };

  /** A card's cost, headline and open details, as of `ranks`: the same for a locked card. */
  const paintCard = (box: HTMLElement, skill: Skill, ranks: ReadonlyMap<string, number>): void => {
    const description = describeSkill(skill, ranks);
    const cost = box.querySelector(".skill-box-cost");
    if (cost !== null && cost.textContent !== description.cost) {
      cost.textContent = description.cost;
    }
    const headline = box.querySelector<HTMLElement>(".skill-box-headline");
    const headlineText = description.headline ?? "";
    if (headline !== null && headline.textContent !== headlineText) {
      headline.replaceChildren();
      appendParts(headline, description.headlineParts ?? []);
    }
    const isOpen = open === skill.id;
    box.classList.toggle("is-open", isOpen);
    box.querySelector(".skill-box-card")?.setAttribute("aria-expanded", String(isOpen));
    const details = box.querySelector<HTMLElement>(".skill-box-details");
    if (details !== null) {
      details.hidden = !isOpen;
      if (isOpen) {
        renderDetails(details, description, ranks);
      } else if (details.childElementCount > 0) {
        details.replaceChildren();
      }
    }
  };

  // Below the groups, collapsed: what other professions would bring (#568).
  const locked = document.createElement("details");
  locked.className = "skill-locked";
  const lockedSummary = document.createElement("summary");
  locked.appendChild(lockedSummary);
  const lockedBoxes = h("div", "skill-group-boxes");
  locked.appendChild(lockedBoxes);
  // Only this scrolls: the search and chips above it stay in view (#2161).
  const groupHost = h("div", "skill-groups");
  groupHost.append(groupList, locked);

  const groupKey = (group: SkillGroup): string => group.attributeId ?? group.attributeName;

  /** A group: its header a button that opens and folds it (#2161). */
  const createGroup = (group: SkillGroup): HTMLElement => {
    const section = h("div", "skill-group");
    const key = groupKey(group);
    const header = button("", "skill-group-header", () => {
      if (openGroups.has(key)) {
        openGroups.delete(key);
      } else {
        openGroups.add(key);
      }
      render(context.current());
    });
    header.append(
      h("span", "skill-group-marker"),
      h("span", "skill-group-name"),
      h("span", "skill-group-count"),
    );
    section.appendChild(header);
    section.appendChild(h("div", "skill-group-boxes"));
    return section;
  };

  const render = (character: TeamCharacter): void => {
    const ranks = characterRanks(character);
    const target = equipTarget(character.skillBar, context.selected());
    const equipText =
      target === undefined
        ? "pick a slot"
        : `Equip → ${context.slotLabel(target.slot)}${target.replaces ? " (replace)" : ""}`;
    const filtered = (list: readonly Skill[]): readonly Skill[] =>
      filterSkillsByType(
        filterSkillsByText(eliteOnly ? filterEliteSkills(list) : list, search.value),
        types,
      );
    const matches = filtered(equippableSkills(character));
    const lockedMatches = filtered(
      lockedSkills(IMPLEMENTED_SKILLS, character.primaryProfession, character.secondaryProfession),
    );
    const groups = groupSkillsByAttribute(matches);
    // A filter opens every group it matches in, so a search never looks
    // empty; the player's own folds come back once it is cleared (#2161).
    const filtering = search.value.trim() !== "" || eliteOnly || types.size > 0;
    const isOpen = (group: SkillGroup): boolean => filtering || openGroups.has(groupKey(group));
    // A card the filters took away, or a fold hid, closes; it does not
    // reopen on its own.
    const shown = [
      ...groups.filter(isOpen).flatMap((group) => group.skills),
      ...(locked.open ? lockedMatches : []),
    ];
    if (!shown.some((skill) => skill.id === open)) {
      open = undefined;
    }
    syncList(groupList, groups, groupKey, createGroup, (section, group) => {
      const [header, boxes] = Array.from(section.children);
      const folded = !isOpen(group);
      if (header instanceof HTMLButtonElement) {
        header.setAttribute("aria-expanded", String(!folded));
        // Under a filter every group is open, and folding one is not on.
        header.disabled = filtering;
      }
      const marker = header?.querySelector(".skill-group-marker");
      if (marker !== null && marker !== undefined) {
        marker.textContent = folded ? "▸" : "▾";
      }
      const name = header?.querySelector(".skill-group-name");
      if (name !== null && name !== undefined) {
        name.textContent = group.attributeName;
      }
      const count = header?.querySelector(".skill-group-count");
      if (count !== null && count !== undefined) {
        count.textContent = `· ${String(group.skills.length)}`;
      }
      // The rank is shown here because it is exactly what makes every
      // skill under this heading better — the reason to group this way.
      // "No Attribute" skills have none to show.
      let rank = header?.querySelector(".skill-group-rank");
      if (group.attributeId === undefined) {
        rank?.remove();
      } else {
        if (rank === null || rank === undefined) {
          rank = h("span", "skill-group-rank");
          header?.appendChild(rank);
        }
        rank.textContent = `rank ${String(ranks.get(group.attributeId) ?? 0)}`;
      }
      if (boxes instanceof HTMLElement) {
        boxes.hidden = folded;
        // A folded group's cards are not laid out: none is seen.
        syncList(
          boxes,
          folded ? [] : group.skills,
          (skill) => skill.id,
          createBox,
          (box, skill) => {
            const on = character.skillBar.indexOf(skill.id);
            box.classList.toggle("is-equipped", on >= 0);
            // On the bar: where, and no Equip. Else where an equip goes.
            const equip = box.querySelector<HTMLButtonElement>(".skill-box-equip");
            const onLabel = box.querySelector(".skill-box-on");
            if (equip !== null) {
              equip.hidden = on >= 0;
              equip.disabled = target === undefined;
              if (equip.textContent !== equipText) {
                equip.textContent = equipText;
              }
            }
            if (onLabel !== null) {
              const text = on >= 0 ? `on ${context.slotLabel(on)}` : "";
              if (onLabel.textContent !== text) {
                onLabel.textContent = text;
              }
            }
            paintCard(box, skill, ranks);
          },
        );
      }
    });
    lockedSummary.textContent = `Other professions (${String(lockedMatches.length)})`;
    // Collapsed, the near thousand skills of other professions are
    // counted, not laid out: they come in as it opens (#1220, #2518).
    syncList(
      lockedBoxes,
      locked.open ? lockedMatches : [],
      (skill) => skill.id,
      createLockedBox,
      (box, skill) => {
        paintCard(box, skill, ranks);
      },
    );
    locked.hidden = lockedMatches.length === 0;
  };

  search.addEventListener("input", () => {
    render(context.current());
  });
  locked.addEventListener("toggle", () => {
    render(context.current());
  });
  paintFilters();

  return {
    elements: [filters, groupHost],
    scroller: groupHost,
    update: render,
    dispose() {
      filterPopoverHandle.dispose();
    },
  };
}

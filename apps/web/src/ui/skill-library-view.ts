import {
  describeSkill,
  MAX_ATTRIBUTE_RANK,
  skillProfessionName,
  IMPLEMENTED_SKILLS,
  type Skill,
  type SkillDescription,
  type SkillType,
} from "@vibewars/game-core";
import type { CorpusSkill } from "@vibewars/game-data/corpus";

import { equippableSkills } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import { encodeDragSource, equipTarget } from "./build-editor.js";
import { characterRanks } from "./character-ranks.js";
import { loadShowCorpus, saveShowCorpus } from "./corpus-preference.js";
import { SKILL_TYPE_NAME, skillIconHtml, skillTypeBadgeHtml } from "./icons.js";
import { button, h, syncList } from "./kit.js";
import {
  corpusByAccess,
  corpusCostText,
  filterCorpus,
  filterEliteSkills,
  filterSkillsByText,
  filterSkillsByType,
  groupSkillsByAttribute,
  lockedSkills,
  missingFromCatalog,
  skillTypesOf,
  type SkillGroup,
} from "./skill-library.js";
import { appendParts, renderSkillDescription, type SkillTooltip } from "./skill-tooltip.js";

/**
 * The skill library (#2225): the Character Builder's, and the Team
 * Builder's for its focused member. Attribute groups folded by default
 * (#2161), search, type chips, the skills not in the game yet, and
 * locked cards of other professions. Its cards drag as
 * `encodeDragSource({ from: "library" })`; where they drop is the
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

/** A GW1 skill not in the game yet (#1220), told from a playable one by its lack of an id. */
function isCorpus(skill: Skill | CorpusSkill): skill is CorpusSkill {
  return !("id" in skill);
}

/** A library card's key: a skill's id, or a corpus entry's GW1 id, which no skill id looks like. */
function libraryKey(skill: Skill | CorpusSkill): string {
  return isCorpus(skill) ? `gw:${String(skill.gwId)}` : skill.id;
}

export function mountSkillLibrary(context: SkillLibraryHost): LibraryBody {
  const { tooltip } = context;
  const search = document.createElement("input");
  search.className = "field-input skill-search";
  search.type = "search";
  search.placeholder = "Search names and text";
  search.setAttribute("aria-label", "search skills");
  // The library's "Elite" toggle (#459): only elite skills listed.
  const eliteOnly = document.createElement("input");
  eliteOnly.type = "checkbox";
  const eliteFilter = h("label", "skill-elite-filter");
  eliteFilter.append(eliteOnly, " Elite");
  // On the search's own row, so the library is no taller for it.
  const filters = h("div", "skill-filters");
  filters.append(search, eliteFilter);
  // The GW1 skills not in the game yet (#1220), off by default and
  // remembered. Their data is a chunk of its own, loaded the first time
  // this is on; until it arrives the library lists what it has.
  const showCorpus = document.createElement("input");
  showCorpus.type = "checkbox";
  showCorpus.checked = loadShowCorpus();
  const corpusToggle = h("label", "skill-corpus-toggle");
  corpusToggle.append(showCorpus, " Show skills not in the game yet");
  let corpus: readonly CorpusSkill[] | undefined;
  let corpusLoading = false;
  const loadCorpus = (): void => {
    if (corpus !== undefined || corpusLoading) {
      return;
    }
    corpusLoading = true;
    import("@vibewars/game-data/corpus")
      .then(({ corpusSkills }) => {
        corpus = missingFromCatalog(corpusSkills(), IMPLEMENTED_SKILLS);
        render(context.current());
      })
      .catch(() => {
        // A chunk that failed to load is asked for again at the next toggle.
      })
      .finally(() => {
        corpusLoading = false;
      });
  };
  if (showCorpus.checked) {
    loadCorpus();
  }
  // One chip per type the catalogue has (#567); several may be on.
  const types = new Set<SkillType>();
  const chips = h("div", "skill-type-chips");
  for (const type of skillTypesOf(
    IMPLEMENTED_SKILLS,
    Object.keys(SKILL_TYPE_NAME) as SkillType[],
  )) {
    const chip = button(SKILL_TYPE_NAME[type].toLowerCase(), "skill-type-chip", () => {
      if (types.has(type)) {
        types.delete(type);
      } else {
        types.add(type);
      }
      chip.setAttribute("aria-pressed", String(types.has(type)));
      render(context.current());
    });
    chip.setAttribute("aria-pressed", "false");
    chips.appendChild(chip);
  }
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
        encodeDragSource({ from: "library", skillId: skill.id }),
      );
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

  /**
   * A GW1 skill not in the game yet (#1220): greyed, badged, with GW1's
   * fields on hover. It neither opens, equips nor drags. Nothing on it
   * changes, so each is built once and kept: a search cleared brings a
   * thousand back without building one (#1220 "stays responsive").
   */
  const corpusBoxes = new Map<number, HTMLElement>();
  const createCorpusBox = (skill: CorpusSkill): HTMLElement => {
    const built = corpusBoxes.get(skill.gwId);
    if (built !== undefined) {
      return built;
    }
    const box = h("div", "skill-corpus-box");
    corpusBoxes.set(skill.gwId, box);
    box.dataset.gwId = String(skill.gwId);
    box.classList.toggle("is-elite", skill.elite);
    const card = h("div", "skill-box-card");
    card.insertAdjacentHTML("beforeend", skillIconHtml("", LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    if (skill.skillType !== undefined) {
      card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.skillType));
    }
    card.appendChild(h("span", "skill-box-cost", corpusCostText(skill)));
    box.appendChild(card);
    box.appendChild(h("span", "skill-corpus-badge", "not in the game yet"));
    box.addEventListener("mouseenter", () => {
      tooltip.showCorpus(box, skill);
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
        filterSkillsByText(eliteOnly.checked ? filterEliteSkills(list) : list, search.value),
        types,
      );
    const matches = filtered(equippableSkills(character));
    const lockedMatches = filtered(
      lockedSkills(IMPLEMENTED_SKILLS, character.primaryProfession, character.secondaryProfession),
    );
    const corpusMatches = corpusByAccess(
      showCorpus.checked && corpus !== undefined
        ? filterCorpus(corpus, search.value, types, eliteOnly.checked)
        : [],
      character.primaryProfession,
      character.secondaryProfession,
    );
    const groups = groupSkillsByAttribute(matches, corpusMatches.open);
    // A filter opens every group it matches in, so a search never looks
    // empty; the player's own folds come back once it is cleared (#2161).
    const filtering = search.value.trim() !== "" || eliteOnly.checked || types.size > 0;
    const isOpen = (group: SkillGroup): boolean => filtering || openGroups.has(groupKey(group));
    // A card the filters took away, or a fold hid, closes; it does not
    // reopen on its own.
    const shown = [...groups.filter(isOpen).flatMap((group) => group.skills), ...lockedMatches];
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
        count.textContent = `· ${String(group.skills.length + group.corpus.length)}`;
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
          folded ? [] : [...group.skills, ...group.corpus],
          libraryKey,
          (skill) => (isCorpus(skill) ? createCorpusBox(skill) : createBox(skill)),
          (box, skill) => {
            if (isCorpus(skill)) {
              return;
            }
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
    const lockedAll = [...lockedMatches, ...corpusMatches.locked];
    lockedSummary.textContent = `Other professions (${String(lockedAll.length)})`;
    // Collapsed, the near thousand GW1 skills of other professions are
    // counted, not laid out: they come in as it opens (#1220).
    syncList(
      lockedBoxes,
      locked.open ? lockedAll : lockedMatches,
      libraryKey,
      (skill) => (isCorpus(skill) ? createCorpusBox(skill) : createLockedBox(skill)),
      (box, skill) => {
        if (!isCorpus(skill)) {
          paintCard(box, skill, ranks);
        }
      },
    );
    locked.hidden = lockedAll.length === 0;
  };

  search.addEventListener("input", () => {
    render(context.current());
  });
  eliteOnly.addEventListener("change", () => {
    render(context.current());
  });
  locked.addEventListener("toggle", () => {
    if (showCorpus.checked) {
      render(context.current());
    }
  });
  showCorpus.addEventListener("change", () => {
    saveShowCorpus(showCorpus.checked);
    if (showCorpus.checked) {
      loadCorpus();
    }
    render(context.current());
  });

  return {
    elements: [corpusToggle, filters, chips, groupHost],
    scroller: groupHost,
    update: render,
  };
}

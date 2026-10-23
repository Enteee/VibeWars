import {
  MAX_ATTRIBUTE_RANK,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PROFESSIONS,
  accessibleAttributeIds,
  cumulativeCostForRank,
  getAttribute,
  totalCost,
  type ProfessionId,
} from "@vibewars/game-core";

import { SKILL_BAR_SLOTS, equippableSkills, validateBuild } from "../storage/build-validation.js";
import { CURRENT_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";

/**
 * The character/build editor (brief §17).
 *
 * Plain DOM, rebuilt from state on every change. The builds here are
 * small enough (a dozen attributes, eight skill slots) that a full
 * re-render is simpler and less bug-prone than diffing, and it guarantees
 * what is shown always matches the model.
 */

export interface BuildEditorCallbacks {
  readonly onSave: (character: StoredCharacter) => void;
  readonly onDelete: (id: string) => void;
  readonly onDuplicate: (character: StoredCharacter) => void;
  readonly onClose: () => void;
}

export function newCharacter(id: string): StoredCharacter {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name: "New Character",
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: SKILL_BAR_SLOTS }, () => null),
    updatedAt: Date.now(),
  };
}

/** Attribute points left to spend, given the ruleset's budget. */
export function remainingPoints(character: StoredCharacter): number {
  const spent = totalCost(
    character.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
  );
  return MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget - spent;
}

/**
 * Whether one more rank in `attributeId` is affordable.
 *
 * Exposed (and tested) separately from the DOM so the "can I raise this?"
 * rule is verifiable without a browser — the same reason the renderer's
 * pure helpers live apart from the Phaser scene.
 */
export function canRaise(character: StoredCharacter, attributeId: string): boolean {
  const current = character.attributes.find((a) => a.attributeId === attributeId)?.rank ?? 0;
  if (current >= MAX_ATTRIBUTE_RANK) {
    return false;
  }
  const delta = cumulativeCostForRank(current + 1) - cumulativeCostForRank(current);
  return remainingPoints(character) >= delta;
}

export function setRank(
  character: StoredCharacter,
  attributeId: string,
  rank: number,
): StoredCharacter {
  const others = character.attributes.filter((a) => a.attributeId !== attributeId);
  const attributes = rank > 0 ? [...others, { attributeId, rank }] : others;
  return { ...character, attributes, updatedAt: Date.now() };
}

/**
 * Change profession, dropping anything the new combination can no longer
 * access.
 *
 * Silently keeping now-inaccessible attribute ranks or skills would mean
 * saving a build that fails validation on load — better to drop them at
 * the moment of the change, when the player can see it happen.
 */
export function setProfessions(
  character: StoredCharacter,
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): StoredCharacter {
  const effectiveSecondary = secondary === primary ? undefined : secondary;
  const accessible = new Set(accessibleAttributeIds(primary, effectiveSecondary));

  const next: StoredCharacter = {
    ...character,
    primaryProfession: primary,
    secondaryProfession: effectiveSecondary,
    attributes: character.attributes.filter((a) => accessible.has(a.attributeId)),
    updatedAt: Date.now(),
  };

  const stillEquippable = new Set(equippableSkills(next).map((s) => s.id));
  return {
    ...next,
    skillBar: next.skillBar.map((id) => (id !== null && stillEquippable.has(id) ? id : null)),
  };
}

export function setSkill(
  character: StoredCharacter,
  slot: number,
  skillId: string | null,
): StoredCharacter {
  const skillBar = [...character.skillBar];
  // Equipping a skill already on the bar moves it rather than duplicating
  // it, which is what a player dragging a skill onto a new slot means.
  if (skillId !== null) {
    const existing = skillBar.indexOf(skillId);
    if (existing >= 0) {
      skillBar[existing] = null;
    }
  }
  skillBar[slot] = skillId;
  return { ...character, skillBar, updatedAt: Date.now() };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function renderBuildEditor(
  root: HTMLElement,
  character: StoredCharacter,
  callbacks: BuildEditorCallbacks,
  rerender: (next: StoredCharacter) => void,
): void {
  root.replaceChildren();
  const panel = h("div", "editor");
  root.appendChild(panel);

  const header = h("div", "editor-header");
  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.value = character.name;
  nameInput.addEventListener("input", () => {
    character = { ...character, name: nameInput.value };
  });
  header.appendChild(nameInput);
  panel.appendChild(header);

  // --- professions ---------------------------------------------------
  const professionRow = h("div", "editor-row");
  const professionIds = Object.keys(PROFESSIONS) as ProfessionId[];

  const makeProfessionSelect = (
    label: string,
    selected: ProfessionId | undefined,
    includeNone: boolean,
    onChange: (value: ProfessionId | undefined) => void,
  ): HTMLElement => {
    const wrapper = h("label", "editor-field");
    wrapper.appendChild(h("span", "editor-label", label));
    const select = document.createElement("select");
    if (includeNone) {
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "(none)";
      select.appendChild(none);
    }
    for (const id of professionIds) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = PROFESSIONS[id].name;
      select.appendChild(option);
    }
    select.value = selected ?? "";
    select.addEventListener("change", () => {
      onChange(select.value === "" ? undefined : (select.value as ProfessionId));
    });
    wrapper.appendChild(select);
    return wrapper;
  };

  professionRow.appendChild(
    makeProfessionSelect("primary", character.primaryProfession, false, (value) => {
      if (value !== undefined) {
        rerender(setProfessions(character, value, character.secondaryProfession));
      }
    }),
  );
  professionRow.appendChild(
    makeProfessionSelect("secondary", character.secondaryProfession, true, (value) => {
      rerender(setProfessions(character, character.primaryProfession, value));
    }),
  );
  panel.appendChild(professionRow);

  // --- attributes ----------------------------------------------------
  const points = remainingPoints(character);
  panel.appendChild(h("div", "editor-points", `${String(points)} attribute points remaining`));

  const attributeList = h("div", "editor-attributes");
  for (const attributeId of accessibleAttributeIds(
    character.primaryProfession,
    character.secondaryProfession,
  )) {
    const definition = getAttribute(attributeId);
    if (definition === undefined) {
      continue;
    }
    const rank = character.attributes.find((a) => a.attributeId === attributeId)?.rank ?? 0;

    const row = h("div", "editor-attribute");
    row.appendChild(
      h("span", "editor-attribute-name", `${definition.name}${definition.isPrimary ? " ★" : ""}`),
    );

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.disabled = rank <= 0;
    minus.addEventListener("click", () => {
      rerender(setRank(character, attributeId, rank - 1));
    });

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.disabled = !canRaise(character, attributeId);
    plus.addEventListener("click", () => {
      rerender(setRank(character, attributeId, rank + 1));
    });

    row.appendChild(minus);
    row.appendChild(h("span", "editor-attribute-rank", String(rank)));
    row.appendChild(plus);
    attributeList.appendChild(row);
  }
  panel.appendChild(attributeList);

  // --- skill bar -----------------------------------------------------
  const available = equippableSkills(character);
  const skillSection = h("div", "editor-skills");
  skillSection.appendChild(h("div", "editor-label", "skill bar"));

  character.skillBar.forEach((skillId, slot) => {
    const row = h("div", "editor-skill-slot");
    row.appendChild(h("span", "editor-slot-index", String(slot + 1)));

    const select = document.createElement("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "(empty)";
    select.appendChild(empty);
    for (const skill of available) {
      const option = document.createElement("option");
      option.value = skill.id;
      option.textContent = skill.name;
      select.appendChild(option);
    }
    select.value = skillId ?? "";
    select.addEventListener("change", () => {
      rerender(setSkill(character, slot, select.value === "" ? null : select.value));
    });
    row.appendChild(select);
    skillSection.appendChild(row);
  });
  panel.appendChild(skillSection);

  // --- validation + actions ------------------------------------------
  const problems = validateBuild(character);
  if (problems.length > 0) {
    const list = h("div", "editor-problems");
    for (const problem of problems) {
      list.appendChild(h("div", "editor-problem", `${problem.field}: ${problem.message}`));
    }
    panel.appendChild(list);
  }

  const actions = h("div", "editor-actions");

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "save";
  // An invalid build cannot be saved — brief §23 requires validation
  // before saving, and allowing a save here would just move the failure
  // to load time.
  save.disabled = problems.length > 0;
  save.addEventListener("click", () => {
    callbacks.onSave({ ...character, name: nameInput.value, updatedAt: Date.now() });
  });

  const duplicate = document.createElement("button");
  duplicate.type = "button";
  duplicate.textContent = "duplicate";
  duplicate.addEventListener("click", () => {
    callbacks.onDuplicate(character);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "delete";
  remove.addEventListener("click", () => {
    callbacks.onDelete(character.id);
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "close";
  close.addEventListener("click", callbacks.onClose);

  actions.append(save, duplicate, remove, close);
  panel.appendChild(actions);
}

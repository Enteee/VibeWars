import {
  describePrimaryAttribute,
  describeSkill,
  MAX_ATTRIBUTE_RANK,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PROFESSIONS,
  accessibleAttributeIds,
  ALL_INSIGNIAS,
  ALL_OFFHANDS,
  ALL_WEAPONS,
  ARMOR_SLOTS,
  allowsOffhand,
  cumulativeCostForRank,
  defaultBuildEquipment,
  defaultEquipmentFor,
  getAttribute,
  getInsignia,
  getOffhand,
  getSkill,
  getWeapon,
  perSlotAmount,
  reconcileEquipment,
  runeDisplayName,
  totalCost,
  weaponReachable,
  type ArmorSlot,
  type BuildEquipment,
  type InsigniaEffect,
  type InsigniaId,
  type ProfessionId,
} from "@vibewars/game-core";

import { exportBuild, importBuild } from "../storage/build-transfer.js";
import { SKILL_BAR_SLOTS, equippableSkills, validateBuild } from "../storage/build-validation.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  canEquipOffhand,
  clearArmorUpgrades,
  applyGearDrop,
  decodeGearDrag,
  encodeGearDrag,
  encodeRune,
  firstFreeArmorSlot,
  offhandAttributeChoices,
  runeChoices,
  setInsignia,
  setOffhand,
  setRequirementAttribute,
  setRune,
  setWeapon,
  summariseGear,
  weaponAttributeChoices,
  type GearDragSource,
  type GearDropTarget,
} from "./gear-editor.js";
import {
  offhandIcon,
  professionIcon,
  skillTypeBadgeHtml,
  weaponIcon,
  type GearIcon,
} from "./icons.js";
import { filterEliteSkills, filterSkillsByName, groupSkillsByAttribute } from "./skill-library.js";
import { createSkillTooltip, type SkillTooltip } from "./skill-tooltip.js";
import { createTrainingPanel, type TrainingPanel } from "./training-panel.js";

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
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: "New Character",
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: SKILL_BAR_SLOTS }, () => null),
    equipment: defaultBuildEquipment("warrior"),
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
    // Gear follows the same drop-what-is-no-longer-reachable rule as
    // attributes and skills, and a weapon nothing can govern any more
    // becomes the new primary's default (#614).
    equipment: fitWeapon(
      reconcileEquipment(next.equipment, {
        primaryProfession: primary,
        accessibleAttributeIds: accessible,
      }),
      primary,
      accessible,
    ),
  };
}

/**
 * `equipment` with its weapon swapped for `primary`'s default when no
 * attribute in `accessible` can govern it (#614): a Warrior's Sword on
 * an Assassin becomes Daggers, so Dagger Mastery works at once. A weapon
 * still reachable stays, because it is a choice. The off hand stays if
 * the new weapon leaves a hand free and it survived reconciling, and is
 * the default's otherwise.
 */
function fitWeapon(
  equipment: BuildEquipment,
  primary: ProfessionId,
  accessible: ReadonlySet<string>,
): BuildEquipment {
  const weapon = getWeapon(equipment.mainHand.weaponId);
  if (weapon === undefined || weaponReachable(weapon.requirement, accessible)) {
    return equipment;
  }
  const fallback = defaultEquipmentFor(primary);
  const fallbackWeapon = getWeapon(fallback.mainHand.weaponId);
  const keepOffhand =
    equipment.offHand !== null && fallbackWeapon !== undefined && allowsOffhand(fallbackWeapon);
  return {
    ...equipment,
    mainHand: fallback.mainHand,
    offHand: keepOffhand ? equipment.offHand : fallback.offHand,
  };
}

/**
 * The slot of the elite that equipping `skillId` into `slot` pushes off
 * the bar (#459), or -1. Only one elite per bar, and the new one wins:
 * the one already in `slot` is simply replaced, and an elite moving
 * between slots displaces nothing.
 */
export function displacedEliteSlot(
  character: StoredCharacter,
  slot: number,
  skillId: string | null,
): number {
  if (skillId === null || getSkill(skillId)?.elite !== true) {
    return -1;
  }
  return character.skillBar.findIndex(
    (id, index) => index !== slot && id !== null && id !== skillId && getSkill(id)?.elite === true,
  );
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
  const displaced = displacedEliteSlot(character, slot, skillId);
  if (displaced >= 0) {
    skillBar[displaced] = null;
  }
  skillBar[slot] = skillId;
  return { ...character, skillBar, updatedAt: Date.now() };
}

/**
 * `setSkill`, with what to tell the player when an elite took another
 * elite's place (#459); `undefined` when nothing needs saying.
 */
export function equipSkill(
  character: StoredCharacter,
  slot: number,
  skillId: string,
): { readonly character: StoredCharacter; readonly notice: string | undefined } {
  const displaced = character.skillBar[displacedEliteSlot(character, slot, skillId)];
  const next = setSkill(character, slot, skillId);
  if (displaced === undefined || displaced === null) {
    return { character: next, notice: undefined };
  }
  const name = (id: string): string => getSkill(id)?.name ?? id;
  return {
    character: next,
    notice: `${name(skillId)} replaced ${name(displaced)}: only one elite skill per bar.`,
  };
}

/**
 * Exchange two bar slots.
 *
 * Distinct from `setSkill`, which *moves* a skill and clears wherever it
 * came from — correct when equipping from the library, but it would
 * silently delete a skill when a player drags one slot onto another to
 * reorder their bar.
 */
export function swapSkillSlots(character: StoredCharacter, a: number, b: number): StoredCharacter {
  if (a === b) {
    return character;
  }
  const skillBar = [...character.skillBar];
  const first = skillBar[a] ?? null;
  const second = skillBar[b] ?? null;
  skillBar[a] = second;
  skillBar[b] = first;
  return { ...character, skillBar, updatedAt: Date.now() };
}

/** Where a drag started: a library entry, or an existing bar slot. */
export type SkillDragSource =
  | { readonly from: "library"; readonly skillId: string }
  | { readonly from: "slot"; readonly slot: number };

/** Serialised onto the drag event; parsed back on drop. */
export function encodeDragSource(source: SkillDragSource): string {
  return source.from === "library" ? `library:${source.skillId}` : `slot:${String(source.slot)}`;
}

/**
 * Parse a drag payload.
 *
 * Returns `undefined` for anything unrecognised: a drop can carry text
 * dragged from anywhere on the desktop, and that must do nothing rather
 * than throw or equip something nonsensical.
 */
export function decodeDragSource(raw: string): SkillDragSource | undefined {
  const [kind, value] = raw.split(":");
  if (kind === "library" && value !== undefined && value !== "") {
    return { from: "library", skillId: value };
  }
  // `value !== ""` matters: `Number("")` is 0, so a bare "slot:" would
  // otherwise decode as a valid drag from slot 0.
  if (kind === "slot" && value !== undefined && value !== "") {
    const slot = Number(value);
    if (Number.isInteger(slot) && slot >= 0 && slot < SKILL_BAR_SLOTS) {
      return { from: "slot", slot };
    }
  }
  return undefined;
}

/** Apply a completed drag onto `targetSlot`, with `equipSkill`'s notice. */
export function applySkillDrop(
  character: StoredCharacter,
  source: SkillDragSource,
  targetSlot: number,
): { readonly character: StoredCharacter; readonly notice: string | undefined } {
  return source.from === "library"
    ? equipSkill(character, targetSlot, source.skillId)
    : { character: swapSkillSlots(character, source.slot, targetSlot), notice: undefined };
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

/**
 * One tooltip for the whole editor, created lazily and reused.
 *
 * The editor re-renders on every change, so a tooltip owned by the
 * render would be destroyed and rebuilt constantly — and any tooltip
 * visible at that moment would be orphaned on screen.
 */
let sharedTooltip: SkillTooltip | undefined;

function tooltipInstance(): SkillTooltip {
  sharedTooltip ??= createSkillTooltip();
  return sharedTooltip;
}

/**
 * The library's name filter, kept outside the render.
 *
 * Re-rendering on every attribute click would otherwise clear what the
 * player had typed mid-search.
 */
let librarySearch = "";

/**
 * Which library the right-hand column is showing.
 *
 * Module-level for the same reason as the search text: the panel
 * re-renders on every change, and a tab that reset itself whenever you
 * equipped something would be unusable.
 */
let activeLibrary: "skills" | "gear" = "skills";

/** The library's "Elite" toggle (#459): only elite skills listed. */
let eliteOnly = false;

/**
 * What the last equip has to tell the player (#459), shown by the next
 * render and gone after it: it is about that one change.
 */
let barNotice: string | undefined;

/** Re-render with `barNotice` set for that one render. */
function rerenderWithNotice(
  rerender: (next: StoredCharacter) => void,
  change: { readonly character: StoredCharacter; readonly notice: string | undefined },
): void {
  barNotice = change.notice;
  rerender(change.character);
}

/**
 * The Training Ground arena, created once and moved into every render,
 * for the same reason as the tooltip: a Phaser game rebuilt on every `+`
 * click would lose its WebGL context and leak (#2 §6.2).
 *
 * `disposeBuildEditor` is the one place it is torn down. That is enough
 * because every way out of the editor (save, delete, duplicate, close)
 * goes through `main.ts`'s `showMenu()`, which calls it.
 */
let sharedTraining: TrainingPanel | undefined;

/** Set once the arena could not be created, so it is not retried on every render. */
let trainingUnavailable = false;

function trainingInstance(): TrainingPanel | undefined {
  if (sharedTraining === undefined && !trainingUnavailable) {
    try {
      sharedTraining = createTrainingPanel();
    } catch (error) {
      // No WebGL: the editor stays the two-column screen it always was.
      trainingUnavailable = true;
      console.info("[web] training ground unavailable", error);
    }
  }
  return sharedTraining;
}

/** Drops the shared tooltip and the training arena; call when leaving the editor. */
export function disposeBuildEditor(): void {
  sharedTooltip?.dispose();
  sharedTooltip = undefined;
  sharedTraining?.dispose();
  sharedTraining = undefined;
  librarySearch = "";
  eliteOnly = false;
  barNotice = undefined;
  // Re-entering the editor should land on the skill library, not on
  // whichever tab happened to be open when it was last closed.
  activeLibrary = "skills";
}

export function renderBuildEditor(
  root: HTMLElement,
  character: StoredCharacter,
  callbacks: BuildEditorCallbacks,
  rerender: (next: StoredCharacter) => void,
): void {
  const tooltip = tooltipInstance();
  tooltip.hide();

  root.replaceChildren();
  const layout = h("div", "editor-layout");
  root.appendChild(layout);
  // Moving the existing panel in, in the same task as the re-render, so
  // the canvas is never detached across a paint.
  const training = trainingInstance();
  if (training !== undefined) {
    layout.classList.add("has-training");
    training.attach(layout);
    training.setBuild(character);
    training.setDisplayName(character.name);
  }
  const panel = h("div", "editor");
  layout.appendChild(panel);

  const header = h("div", "editor-header");
  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.value = character.name;
  nameInput.addEventListener("input", () => {
    character = { ...character, name: nameInput.value };
    // The name field never re-renders (it would drop the caret), so the
    // arena hears about a new name directly.
    training?.setDisplayName(nameInput.value);
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
    // An <option> cannot hold an image, so the chosen profession's icon
    // sits beside the picker. Menus only: in the arena, colour means team.
    const picker = h("span", "editor-profession");
    if (selected !== undefined) {
      const icon = document.createElement("img");
      icon.className = "profession-icon";
      icon.src = professionIcon(selected);
      icon.alt = "";
      picker.appendChild(icon);
    }
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
    picker.appendChild(select);
    wrapper.appendChild(picker);
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
    const name = h(
      "span",
      "editor-attribute-name",
      `${definition.name}${definition.isPrimary ? " ★" : ""}`,
    );
    // What the primary does at this rank (#531), under its name.
    const effect = describePrimaryAttribute(attributeId, rank);
    if (effect !== undefined) {
      name.appendChild(h("span", "editor-attribute-effect", effect));
    }
    row.appendChild(name);

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
  // Boxes rather than dropdowns: a bar is a spatial thing, and ordering
  // it by picking from eight identical `<select>`s never matched how
  // players think about it.
  const available = equippableSkills(character);
  const ranks = new Map(character.attributes.map((a) => [a.attributeId, a.rank]));
  const equippedIds = new Set(character.skillBar.filter((id): id is string => id !== null));

  const skillSection = h("div", "editor-skills");
  skillSection.appendChild(h("div", "editor-label", "skill bar"));
  skillSection.appendChild(
    h("div", "editor-hint", "Drag skills from the right, or click one to equip it."),
  );

  const barGrid = h("div", "skill-bar-grid");
  character.skillBar.forEach((skillId, slot) => {
    const cell = h("div", "skill-slot");
    cell.dataset.slot = String(slot);
    cell.appendChild(h("span", "skill-slot-index", String(slot + 1)));

    const skill = skillId === null ? undefined : available.find((s) => s.id === skillId);
    if (skill === undefined) {
      cell.classList.add("is-empty");
      cell.appendChild(h("span", "skill-slot-empty", "empty"));
    } else {
      const description = describeSkill(skill, ranks);
      cell.classList.toggle("is-elite", skill.elite);
      cell.appendChild(h("span", "skill-slot-name", skill.name));
      cell.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
      cell.appendChild(h("span", "skill-slot-cost", description.cost));
      cell.draggable = true;
      cell.addEventListener("dragstart", (event: DragEvent) => {
        event.dataTransfer?.setData("text/plain", encodeDragSource({ from: "slot", slot }));
      });
      cell.addEventListener("mouseenter", () => {
        tooltip.show(cell, description);
      });
      cell.addEventListener("mouseleave", () => {
        tooltip.hide();
      });

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "skill-slot-clear";
      clear.textContent = "×";
      clear.title = `Remove ${skill.name}`;
      clear.addEventListener("click", (event) => {
        // Without this the click also lands on the cell, which would
        // immediately re-equip whatever the library had selected.
        event.stopPropagation();
        tooltip.hide();
        rerender(setSkill(character, slot, null));
      });
      cell.appendChild(clear);
    }

    cell.addEventListener("dragover", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.add("is-drop-target");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("is-drop-target");
    });
    cell.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.remove("is-drop-target");
      const raw = event.dataTransfer?.getData("text/plain") ?? "";
      const source = decodeDragSource(raw);
      if (source === undefined) {
        // Something unrelated was dragged in. Do nothing, loudly nowhere.
        return;
      }
      tooltip.hide();
      rerenderWithNotice(rerender, applySkillDrop(character, source, slot));
    });

    barGrid.appendChild(cell);
  });
  skillSection.appendChild(barGrid);
  if (barNotice !== undefined) {
    const notice = h("div", "editor-notice", barNotice);
    notice.setAttribute("role", "status");
    skillSection.appendChild(notice);
    barNotice = undefined;
  }
  panel.appendChild(skillSection);

  renderGear(panel, () => character, rerender);

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

  // --- share -----------------------------------------------------------
  // A textarea rather than a clipboard-only button: clipboard access is
  // permission-gated and fails silently in some browsers, and a build you
  // can see is one you can paste into chat by hand when it does.
  const share = h("div", "editor-share");
  share.appendChild(h("div", "editor-label", "share build"));

  const transfer = document.createElement("textarea");
  transfer.className = "editor-transfer";
  transfer.rows = 6;
  transfer.spellcheck = false;
  transfer.placeholder = "Paste a build here to import it, or press export to share this one.";
  share.appendChild(transfer);

  const shareStatus = h("div", "editor-share-status");
  share.appendChild(shareStatus);

  const setStatus = (message: string, ok: boolean): void => {
    shareStatus.replaceChildren();
    shareStatus.className = ok ? "editor-share-status is-ok" : "editor-share-status is-error";
    shareStatus.appendChild(h("div", undefined, message));
  };

  const shareActions = h("div", "editor-actions");

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "export";
  exportButton.addEventListener("click", () => {
    transfer.value = exportBuild({ ...character, name: nameInput.value });
    transfer.select();
    setStatus("Build copied into the box above — select it and copy.", true);
  });

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "import";
  importButton.addEventListener("click", () => {
    const result = importBuild(transfer.value, character.id, Date.now());
    if (!result.ok) {
      // Every problem at once. Someone fixing a pasted build should not
      // have to discover its faults one round trip at a time.
      shareStatus.replaceChildren();
      shareStatus.className = "editor-share-status is-error";
      shareStatus.appendChild(h("div", undefined, "Could not import this build:"));
      for (const problem of result.problems) {
        shareStatus.appendChild(h("div", "editor-problem", problem));
      }
      return;
    }
    // Loaded into the editor, not saved: the player sees exactly what
    // arrived and chooses to keep it. An import that silently overwrote
    // the open character would be a bad surprise.
    rerender(result.character);
  });

  shareActions.append(exportButton, importButton);
  share.appendChild(shareActions);
  panel.appendChild(share);

  // --- library (right column) -----------------------------------------
  const library = h("aside", "skill-library");
  layout.appendChild(library);

  // Two libraries in one column rather than two columns: the panel is
  // already the full height of the editor, and a second permanent column
  // would squeeze the character sheet for something you only use while
  // picking one kind of thing.
  const tabs = h("div", "library-tabs");
  for (const tab of ["skills", "gear"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-tab";
    button.textContent = tab;
    if (activeLibrary === tab) {
      button.classList.add("is-active");
    }
    button.addEventListener("click", () => {
      if (activeLibrary !== tab) {
        activeLibrary = tab;
        rerender(character);
      }
    });
    tabs.appendChild(button);
  }
  library.appendChild(tabs);

  if (activeLibrary === "gear") {
    renderGearLibrary(library, () => character, rerender);
    return;
  }

  const search = document.createElement("input");
  search.className = "field-input skill-search";
  search.type = "search";
  search.placeholder = "filter by name";
  search.value = librarySearch;
  search.addEventListener("input", () => {
    librarySearch = search.value;
    // Only the list is rebuilt, so focus and caret position survive —
    // a full re-render would drop focus after every keystroke.
    renderGroups();
  });
  library.appendChild(search);

  const eliteToggle = h("label", "skill-elite-filter");
  const eliteBox = document.createElement("input");
  eliteBox.type = "checkbox";
  eliteBox.checked = eliteOnly;
  eliteBox.addEventListener("change", () => {
    eliteOnly = eliteBox.checked;
    renderGroups();
  });
  eliteToggle.append(eliteBox, " Elite");
  library.appendChild(eliteToggle);

  const groupHost = h("div", "skill-groups");
  library.appendChild(groupHost);

  const emptyNote = h(
    "div",
    "skill-library-empty",
    "No skill matches. Note that only skills your professions can access are listed.",
  );

  function renderGroups(): void {
    groupHost.replaceChildren();
    const matches = filterSkillsByName(
      eliteOnly ? filterEliteSkills(available) : available,
      librarySearch,
    );
    if (matches.length === 0) {
      groupHost.appendChild(emptyNote);
      return;
    }

    for (const group of groupSkillsByAttribute(matches)) {
      const section = h("div", "skill-group");
      const header = h("div", "skill-group-header");
      header.appendChild(h("span", "skill-group-name", group.attributeName));
      // The rank is shown here because it is exactly what makes every
      // skill under this heading better — the reason to group this way.
      // "No Attribute" skills have none to show.
      if (group.attributeId !== undefined) {
        const rank = ranks.get(group.attributeId) ?? 0;
        header.appendChild(h("span", "skill-group-rank", `rank ${String(rank)}`));
      }
      section.appendChild(header);

      for (const skill of group.skills) {
        const description = describeSkill(skill, ranks);
        const box = h("div", "skill-box");
        box.draggable = true;
        box.dataset.skillId = skill.id;
        if (equippedIds.has(skill.id)) {
          box.classList.add("is-equipped");
        }
        box.classList.toggle("is-elite", skill.elite);
        box.appendChild(h("span", "skill-box-name", skill.name));
        box.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
        box.appendChild(h("span", "skill-box-cost", description.cost));

        box.addEventListener("dragstart", (event: DragEvent) => {
          event.dataTransfer?.setData(
            "text/plain",
            encodeDragSource({ from: "library", skillId: skill.id }),
          );
        });
        box.addEventListener("mouseenter", () => {
          tooltip.show(box, description);
        });
        box.addEventListener("mouseleave", () => {
          tooltip.hide();
        });
        // Click-to-equip alongside dragging: dragging is the nicer
        // gesture but a poor only option on a trackpad, and it gives
        // the behaviour something testable to assert against.
        box.addEventListener("click", () => {
          const firstEmpty = character.skillBar.indexOf(null);
          const slot = firstEmpty === -1 ? 0 : firstEmpty;
          tooltip.hide();
          rerenderWithNotice(rerender, equipSkill(character, slot, skill.id));
        });

        section.appendChild(box);
      }
      groupHost.appendChild(section);
    }
  }

  renderGroups();

  // Dropping a bar skill back onto the library unequips it, which is the
  // gesture players reach for after dragging one out of a slot.
  library.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  library.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const source = decodeDragSource(event.dataTransfer?.getData("text/plain") ?? "");
    if (source?.from === "slot") {
      tooltip.hide();
      rerender(setSkill(character, source.slot, null));
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Gear                                                                        */
/* -------------------------------------------------------------------------- */

/** A labelled `<select>`, the shape this file already uses for professions. */
function selectRow(
  label: string,
  options: readonly { readonly value: string; readonly label: string }[],
  selected: string,
  onChange: (value: string) => void,
): HTMLElement {
  const field = h("label", "editor-field");
  field.appendChild(h("span", "editor-field-label", label));

  const select = document.createElement("select");
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === selected;
    select.appendChild(node);
  }
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  field.appendChild(select);
  return field;
}

/** A weapon or off-hand icon (#419), named for a screen reader and a hover. */
function gearIconImg(icon: GearIcon | undefined): HTMLImageElement | undefined {
  if (icon === undefined) {
    return undefined;
  }
  const img = document.createElement("img");
  img.className = "gear-icon";
  img.src = icon.src;
  img.alt = icon.name;
  img.title = icon.name;
  return img;
}

/**
 * A gear slot: a drop target that shows what is in it.
 *
 * Deliberately the same shape and gestures as `.skill-slot` — drag onto
 * it to fill it, drag out of it to empty it, click the × to clear. A
 * loadout is a thing you assemble, and two different interaction models
 * for assembling one would be two things to learn.
 */
function gearSlot(options: {
  readonly label: string;
  readonly filled: string | undefined;
  readonly icon?: GearIcon | undefined;
  readonly detail?: string | undefined;
  readonly disabledNote?: string | undefined;
  readonly dragSource?: GearDragSource | undefined;
  readonly onDrop: (source: GearDragSource) => void;
  readonly onClear?: (() => void) | undefined;
  readonly onHide?: (() => void) | undefined;
}): HTMLElement {
  const cell = h("div", "gear-slot");
  const disabled = options.disabledNote !== undefined;
  if (disabled) {
    cell.classList.add("is-disabled");
  } else if (options.filled === undefined) {
    cell.classList.add("is-empty");
  }

  cell.appendChild(h("span", "gear-slot-label", options.label));
  const name = h("span", "gear-slot-name");
  const slotIcon = disabled ? undefined : gearIconImg(options.icon);
  if (slotIcon !== undefined) {
    name.appendChild(slotIcon);
  }
  name.appendChild(document.createTextNode(options.disabledNote ?? options.filled ?? "empty"));
  cell.appendChild(name);
  if (options.detail !== undefined && !disabled) {
    cell.appendChild(h("span", "gear-slot-detail", options.detail));
  }

  if (!disabled && options.dragSource !== undefined) {
    const source = options.dragSource;
    cell.draggable = true;
    cell.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(source));
    });
  }

  if (!disabled) {
    cell.addEventListener("dragover", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.add("is-drop-target");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("is-drop-target");
    });
    cell.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.remove("is-drop-target");
      options.onHide?.();
      const decoded = decodeGearDrag(event.dataTransfer?.getData("text/plain") ?? "");
      // A skill dropped here decodes to nothing and is ignored, which is
      // the same do-nothing-loudly-nowhere behaviour the skill bar has.
      if (decoded !== undefined) {
        options.onDrop(decoded);
      }
    });
  }

  if (options.onClear !== undefined && options.filled !== undefined && !disabled) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "gear-slot-clear";
    clear.textContent = "×";
    clear.title = `clear ${options.label}`;
    clear.addEventListener("click", options.onClear);
    cell.appendChild(clear);
  }

  return cell;
}

/**
 * The gear panel: weapon, off-hand, five armor pieces, and what it all
 * adds up to.
 *
 * The slots are drop targets fed from the library on the right, exactly
 * like the skill bar above them. Attribute *nominations* stay as
 * dropdowns, because choosing which attribute a wand scales with is a
 * genuine list choice rather than a spatial one — dragging would be
 * ceremony.
 *
 * The summary at the bottom is not decoration. Every control here moves
 * a number, and a player weighing +3 Swordsmanship against 75 health
 * needs to see both sides of the trade as they make it.
 */
function renderGear(
  panel: HTMLElement,
  // A getter, not the value. `renderBuildEditor` reassigns its local
  // `character` as the name field is typed into, and every other control
  // in this file is an inline closure that therefore sees the live
  // binding. Taking a snapshot here instead would mean a gear change
  // silently reverted the name — and, worse, that a second gear change
  // discarded the first.
  current: () => StoredCharacter,
  rerender: (next: StoredCharacter) => void,
): void {
  const character = current();
  const tooltip = tooltipInstance();

  const section = h("div", "editor-gear");
  section.appendChild(h("div", "editor-label", "equipment"));
  section.appendChild(
    h("div", "editor-hint", "Drag gear from the right, or click a piece to equip it."),
  );

  const drop = (target: GearDropTarget) => (source: GearDragSource) => {
    tooltip.hide();
    rerender(applyGearDrop(current(), source, target));
  };

  // --- weapon and off-hand -------------------------------------------
  const weapon = getWeapon(character.equipment.mainHand.weaponId);
  const offHand = character.equipment.offHand;
  const offhandDefinition = offHand === null ? undefined : getOffhand(offHand.offhandId);
  const twoHanded = !canEquipOffhand(character);

  const handsGrid = h("div", "gear-hands");
  handsGrid.appendChild(
    gearSlot({
      label: "weapon",
      filled: weapon?.name,
      icon: weaponIcon(character.equipment.mainHand.weaponId),
      detail:
        weapon === undefined
          ? undefined
          : `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
      dragSource: { from: "hand", hand: "mainHand" },
      onDrop: drop({ kind: "main-hand" }),
    }),
  );
  handsGrid.appendChild(
    gearSlot({
      label: "off-hand",
      filled: offhandDefinition?.name,
      icon: offHand === null ? undefined : offhandIcon(offHand.offhandId),
      detail:
        offhandDefinition === undefined
          ? undefined
          : `+${String(offhandDefinition.baseBonus + offhandDefinition.metRequirementBonus)} ${offhandDefinition.kind}`,
      // Said in the slot itself rather than left for the player to
      // discover by dragging a shield onto it and seeing nothing happen.
      disabledNote: twoHanded ? "both hands full" : undefined,
      dragSource: offHand === null ? undefined : { from: "hand", hand: "offHand" },
      onDrop: drop({ kind: "off-hand" }),
      onClear:
        offHand === null
          ? undefined
          : () => {
              rerender(setOffhand(current(), null));
            },
    }),
  );
  section.appendChild(handsGrid);

  // --- attribute nominations ------------------------------------------
  // Only shown for gear that genuinely has a choice to make. A sword is
  // always Swordsmanship, and offering a one-option dropdown would imply
  // otherwise.
  const linkRow = h("div", "editor-row");
  let anyLinks = false;

  if (weapon?.requirement.kind === "chosen") {
    const choices = weaponAttributeChoices(character);
    if (choices.length > 0) {
      anyLinks = true;
      linkRow.appendChild(
        selectRow(
          `${weapon.name.toLowerCase()} attribute`,
          choices.map((id) => ({ value: id, label: getAttribute(id)?.name ?? id })),
          character.equipment.mainHand.requirementAttributeId ?? "",
          (value) => {
            rerender(setRequirementAttribute(current(), "mainHand", value));
          },
        ),
      );
    }
  }

  if (offHand !== null) {
    const choices = offhandAttributeChoices(character, offHand.offhandId);
    if (choices.length > 0) {
      anyLinks = true;
      linkRow.appendChild(
        selectRow(
          `${offhandDefinition?.name.toLowerCase() ?? "off-hand"} attribute`,
          choices.map((id) => ({ value: id, label: getAttribute(id)?.name ?? id })),
          offHand.requirementAttributeId ?? "",
          (value) => {
            rerender(setRequirementAttribute(current(), "offHand", value));
          },
        ),
      );
    }
  }
  if (anyLinks) {
    section.appendChild(linkRow);
  }

  // --- armor ----------------------------------------------------------
  const armorHeader = h("div", "editor-subheader");
  armorHeader.appendChild(h("span", "editor-label", "armor"));
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "editor-clear-armor";
  clear.textContent = "clear upgrades";
  clear.addEventListener("click", () => {
    rerender(clearArmorUpgrades(current()));
  });
  armorHeader.appendChild(clear);
  section.appendChild(armorHeader);

  const armorGrid = h("div", "armor-grid");
  for (const slot of ARMOR_SLOTS) {
    const piece = character.equipment.armor[slot];
    const row = h("div", "armor-row");
    row.appendChild(h("span", "armor-slot-name", slot));

    const insignia = piece.insigniaId === null ? undefined : getInsignia(piece.insigniaId);
    row.appendChild(
      gearSlot({
        label: "insignia",
        filled: insignia?.name,
        detail: piece.insigniaId === null ? undefined : insigniaAmountNote(piece.insigniaId, slot),
        dragSource:
          piece.insigniaId === null ? undefined : { from: "armor-slot", slot, part: "insignia" },
        onDrop: drop({ kind: "armor", slot, part: "insignia" }),
        onClear: () => {
          rerender(setInsignia(current(), slot, null));
        },
      }),
    );

    row.appendChild(
      gearSlot({
        label: "rune",
        filled: piece.rune === null ? undefined : runeDisplayName(piece.rune),
        dragSource: piece.rune === null ? undefined : { from: "armor-slot", slot, part: "rune" },
        onDrop: drop({ kind: "armor", slot, part: "rune" }),
        onClear: () => {
          rerender(setRune(current(), slot, null));
        },
      }),
    );

    armorGrid.appendChild(row);
  }
  section.appendChild(armorGrid);

  // --- the summary ------------------------------------------------------
  const summary = summariseGear(character);
  const stats = h("div", "gear-stats");
  stats.appendChild(statLine("health", String(summary.maxHealth)));
  stats.appendChild(statLine("energy", String(summary.maxEnergy)));
  stats.appendChild(statLine("energy regen", `${String(summary.baseEnergyPips)} pips`));
  stats.appendChild(statLine("armor", String(summary.armor)));
  if (!summary.requirementMet) {
    // Said out loud rather than left for the player to discover by
    // dying: an unmet requirement costs two thirds of the damage.
    stats.appendChild(
      h("div", "gear-warning", "requirement not met — this weapon deals a third of its damage"),
    );
  }
  for (const bonus of summary.runeBonuses) {
    stats.appendChild(
      statLine(
        getAttribute(bonus.attributeId)?.name ?? bonus.attributeId,
        `+${String(bonus.bonus)}`,
      ),
    );
  }
  for (const line of summary.conditionalArmor) {
    stats.appendChild(h("div", "gear-stat-note", line));
  }
  if (summary.flatPhysicalReduction > 0) {
    stats.appendChild(
      h(
        "div",
        "gear-stat-note",
        `−${String(summary.flatPhysicalReduction)} physical damage per hit`,
      ),
    );
  }
  section.appendChild(stats);

  panel.appendChild(section);
}

function statLine(label: string, value: string): HTMLElement {
  const row = h("div", "gear-stat");
  row.appendChild(h("span", "gear-stat-label", label));
  row.appendChild(h("span", "gear-stat-value", value));
  return row;
}

/**
 * What an insignia is worth on *this* piece.
 *
 * Survivor and Radiant give more on the chest than on the gloves, so a
 * single number would be wrong on four slots out of five.
 */
function insigniaAmountNote(insigniaId: InsigniaId, slot: ArmorSlot): string {
  const insignia = getInsignia(insigniaId);
  if (insignia === undefined) {
    return "";
  }
  const { effect } = insignia;
  return effect.kind === "conditional-armor"
    ? `+${String(effect.amount)} armor`
    : `+${String(perSlotAmount(effect, slot))} ${effect.kind}`;
}

/**
 * The gear library: everything you could equip, grouped and draggable.
 *
 * Deliberately the same box-and-drag vocabulary as the skill library —
 * same markup, same gestures, same click-to-equip fallback. A player
 * who has learned to build a skill bar already knows how to use this.
 */
function renderGearLibrary(
  library: HTMLElement,
  current: () => StoredCharacter,
  rerender: (next: StoredCharacter) => void,
): void {
  const character = current();
  const equippedWeapon = character.equipment.mainHand.weaponId;
  const equippedOffhand = character.equipment.offHand?.offhandId;
  const wornInsignias = new Set(
    ARMOR_SLOTS.map((slot) => character.equipment.armor[slot].insigniaId).filter(
      (id): id is InsigniaId => id !== null,
    ),
  );
  const wornRunes = new Set(
    ARMOR_SLOTS.map((slot) => character.equipment.armor[slot].rune)
      .filter((rune) => rune !== null)
      .map((rune) => encodeRune(rune)),
  );

  const host = h("div", "skill-groups");
  library.appendChild(host);

  function box(options: {
    readonly name: string;
    readonly icon?: GearIcon | undefined;
    readonly detail: string;
    readonly equipped: boolean;
    readonly drag: GearDragSource;
    readonly onClick: () => void;
  }): HTMLElement {
    const node = h("div", "skill-box gear-box");
    node.draggable = true;
    if (options.equipped) {
      node.classList.add("is-equipped");
    }
    const name = h("span", "skill-box-name");
    const icon = gearIconImg(options.icon);
    if (icon !== undefined) {
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(options.name));
    node.appendChild(name);
    node.appendChild(h("span", "skill-box-cost", options.detail));
    node.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(options.drag));
    });
    // Click-to-equip alongside dragging, for the same reason the skill
    // library has it: dragging is the nicer gesture and a poor only
    // option on a trackpad.
    node.addEventListener("click", options.onClick);
    return node;
  }

  function group(name: string): HTMLElement {
    const section = h("div", "skill-group");
    const header = h("div", "skill-group-header");
    header.appendChild(h("span", "skill-group-name", name));
    section.appendChild(header);
    host.appendChild(section);
    return section;
  }

  // --- weapons ---------------------------------------------------------
  const weapons = group("weapons");
  for (const weapon of ALL_WEAPONS) {
    weapons.appendChild(
      box({
        name: weapon.name,
        icon: weaponIcon(weapon.id),
        detail: `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
        equipped: weapon.id === equippedWeapon,
        drag: { from: "weapon-library", weaponId: weapon.id },
        onClick: () => {
          rerender(setWeapon(current(), weapon.id));
        },
      }),
    );
  }

  // --- off-hands -------------------------------------------------------
  const offhands = group("off-hands");
  for (const offhand of ALL_OFFHANDS) {
    offhands.appendChild(
      box({
        name: offhand.name,
        icon: offhandIcon(offhand.id),
        detail: `+${String(offhand.baseBonus + offhand.metRequirementBonus)} ${offhand.kind}`,
        equipped: offhand.id === equippedOffhand,
        drag: { from: "offhand-library", offhandId: offhand.id },
        onClick: () => {
          rerender(setOffhand(current(), offhand.id));
        },
      }),
    );
  }

  // --- insignias -------------------------------------------------------
  const insignias = group("insignias");
  for (const insignia of ALL_INSIGNIAS) {
    insignias.appendChild(
      box({
        name: insignia.name,
        detail: insigniaLibraryNote(insignia.effect),
        equipped: wornInsignias.has(insignia.id),
        drag: { from: "insignia-library", insigniaId: insignia.id },
        onClick: () => {
          const next = current();
          rerender(setInsignia(next, firstFreeArmorSlot(next, "insignia"), insignia.id));
        },
      }),
    );
  }

  // --- runes -----------------------------------------------------------
  const runes = group("runes");
  for (const choice of runeChoices(character)) {
    runes.appendChild(
      box({
        name: choice.label,
        detail: "",
        equipped: wornRunes.has(choice.key),
        drag: { from: "rune-library", rune: choice.rune },
        onClick: () => {
          const next = current();
          rerender(setRune(next, firstFreeArmorSlot(next, "rune"), choice.rune));
        },
      }),
    );
  }

  // Dropping worn gear back onto the library takes it off — the gesture
  // players reach for after dragging something out of a slot.
  library.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  library.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const source = decodeGearDrag(event.dataTransfer?.getData("text/plain") ?? "");
    if (source !== undefined) {
      rerender(applyGearDrop(current(), source, { kind: "library" }));
    }
  });
}

/** A one-line summary of what an insignia does, for the library list. */
function insigniaLibraryNote(effect: InsigniaEffect): string {
  if (effect.kind === "conditional-armor") {
    return `+${String(effect.amount)} armor`;
  }
  // The chest value, as the headline — the library cannot know which
  // slot it will land in, and the chest is the best case.
  return `+${String(effect.chest)} ${effect.kind} (chest)`;
}

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
  type Skill,
  type SkillDescription,
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
import { filterSkillsByName, groupSkillsByAttribute } from "./skill-library.js";
import { createSkillTooltip, type SkillTooltip } from "./skill-tooltip.js";
import { button, h, syncList } from "./kit.js";
import { createTrainingPanel, type TrainingPanel } from "./training-panel.js";

/**
 * The character/build editor (brief §17).
 *
 * Plain DOM, mounted once; each region updates in place (ADR-0030).
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

/** Apply a completed drag onto `targetSlot`. */
export function applySkillDrop(
  character: StoredCharacter,
  source: SkillDragSource,
  targetSlot: number,
): StoredCharacter {
  return source.from === "library"
    ? setSkill(character, targetSlot, source.skillId)
    : swapSkillSlots(character, source.slot, targetSlot);
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** What every region of the editor shares. */
interface EditorContext {
  /** The character as it stands, the name typed so far included. */
  readonly current: () => StoredCharacter;
  /** Make `next` the character, and have every region show it. */
  readonly commit: (next: StoredCharacter) => void;
  /** One tooltip for the whole editor. */
  readonly tooltip: SkillTooltip;
}

/** A part of the editor, built once, that shows whatever character it is given. */
interface Region {
  update(character: StoredCharacter): void;
}

export interface BuildEditorView {
  /** Tear down the tooltip and the Training Ground; call when leaving the editor. */
  dispose(): void;
}

/**
 * Mount the editor into `root`, once per open (ADR-0030). Every change
 * goes through one `commit`, which updates each region in place, so the
 * library keeps its scroll, the pressed control keeps focus, and a drag
 * or a hover survives a change made elsewhere. Reopening starts afresh:
 * the skills tab, an empty search.
 */
export function mountBuildEditor(
  root: HTMLElement,
  initial: StoredCharacter,
  callbacks: BuildEditorCallbacks,
): BuildEditorView {
  let character = initial;
  const tooltip = createSkillTooltip();
  const regions: Region[] = [];

  root.replaceChildren();
  const layout = h("div", "editor-layout");
  root.appendChild(layout);

  // The Training Ground arena (#2 §6), created once per editor: a Phaser
  // game must never be rebuilt on a `+` click, or it loses its WebGL
  // context and leaks.
  let training: TrainingPanel | undefined;
  try {
    training = createTrainingPanel();
  } catch (error) {
    // No WebGL: the editor stays the two-column screen it always was.
    console.info("[web] training ground unavailable", error);
  }
  if (training !== undefined) {
    layout.classList.add("has-training");
    training.attach(layout);
    training.setDisplayName(character.name);
  }

  const update = (): void => {
    for (const region of regions) {
      region.update(character);
    }
    training?.setBuild(character);
  };

  const context: EditorContext = {
    current: () => character,
    commit: (next) => {
      character = next;
      tooltip.hide();
      update();
      training?.refocus();
    },
    tooltip,
  };

  const panel = h("div", "editor");
  layout.appendChild(panel);
  regions.push(
    mountHeader(panel, context, (name) => {
      // Typing is no change any other region shows, so it updates none:
      // the arena hears about the new name directly.
      character = { ...character, name };
      training?.setDisplayName(name);
    }),
    mountProfessions(panel, context),
    mountAttributes(panel, context),
    mountSkillBar(panel, context),
    mountGear(panel, context),
    mountActions(panel, context, callbacks),
    mountShare(panel, context),
    mountLibrary(layout, context),
  );
  update();

  return {
    dispose() {
      tooltip.dispose();
      training?.dispose();
    },
  };
}

/* --- header ---------------------------------------------------------------- */

function mountHeader(
  panel: HTMLElement,
  context: EditorContext,
  onName: (name: string) => void,
): Region {
  const header = h("div", "editor-header");
  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.value = context.current().name;
  nameInput.addEventListener("input", () => {
    onName(nameInput.value);
  });
  header.appendChild(nameInput);
  panel.appendChild(header);
  return {
    update(character) {
      // Only an import changes the name from outside the field; setting
      // an unchanged value would still move the caret to the end.
      if (nameInput.value !== character.name) {
        nameInput.value = character.name;
      }
    },
  };
}

/* --- professions ----------------------------------------------------------- */

function mountProfessions(panel: HTMLElement, context: EditorContext): Region {
  const row = h("div", "editor-row");
  const primary = professionPicker("primary", false, (value) => {
    const character = context.current();
    if (value !== undefined) {
      context.commit(setProfessions(character, value, character.secondaryProfession));
    }
  });
  const secondary = professionPicker("secondary", true, (value) => {
    const character = context.current();
    context.commit(setProfessions(character, character.primaryProfession, value));
  });
  row.append(primary.element, secondary.element);
  panel.appendChild(row);
  return {
    update(character) {
      primary.update(character.primaryProfession);
      secondary.update(character.secondaryProfession);
    },
  };
}

function professionPicker(
  label: string,
  includeNone: boolean,
  onChange: (value: ProfessionId | undefined) => void,
): { readonly element: HTMLElement; update(selected: ProfessionId | undefined): void } {
  const wrapper = h("label", "editor-field");
  wrapper.appendChild(h("span", "editor-label", label));
  // An <option> cannot hold an image, so the chosen profession's icon
  // sits beside the picker. Menus only: in the arena, colour means team.
  const picker = h("span", "editor-profession");
  const icon = document.createElement("img");
  icon.className = "profession-icon";
  icon.alt = "";
  const select = document.createElement("select");
  if (includeNone) {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(none)";
    select.appendChild(none);
  }
  for (const id of Object.keys(PROFESSIONS) as ProfessionId[]) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = PROFESSIONS[id].name;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    onChange(select.value === "" ? undefined : (select.value as ProfessionId));
  });
  picker.appendChild(select);
  wrapper.appendChild(picker);
  return {
    element: wrapper,
    update(selected) {
      select.value = selected ?? "";
      if (selected === undefined) {
        icon.remove();
        return;
      }
      const src = professionIcon(selected);
      if (icon.getAttribute("src") !== src) {
        icon.src = src;
      }
      if (!icon.isConnected) {
        picker.prepend(icon);
      }
    },
  };
}

/* --- attributes ------------------------------------------------------------ */

function rankOf(character: StoredCharacter, attributeId: string): number {
  return character.attributes.find((a) => a.attributeId === attributeId)?.rank ?? 0;
}

function mountAttributes(panel: HTMLElement, context: EditorContext): Region {
  const points = h("div", "editor-points");
  const list = h("div", "editor-attributes");
  panel.append(points, list);

  const step = (attributeId: string, by: number) => () => {
    const character = context.current();
    context.commit(setRank(character, attributeId, rankOf(character, attributeId) + by));
  };

  const create = (attributeId: string): HTMLElement => {
    const row = h("div", "editor-attribute");
    row.appendChild(h("span", "editor-attribute-name"));
    row.appendChild(button("−", "", step(attributeId, -1)));
    row.appendChild(h("span", "editor-attribute-rank"));
    row.appendChild(button("+", "", step(attributeId, 1)));
    return row;
  };

  return {
    update(character) {
      points.textContent = `${String(remainingPoints(character))} attribute points remaining`;
      const shown = accessibleAttributeIds(
        character.primaryProfession,
        character.secondaryProfession,
      ).filter((attributeId) => getAttribute(attributeId) !== undefined);
      syncList(
        list,
        shown,
        (attributeId) => attributeId,
        create,
        (row, attributeId) => {
          const definition = getAttribute(attributeId);
          const rank = rankOf(character, attributeId);
          const [name, minus, rankText, plus] = Array.from(row.children);
          if (name !== undefined) {
            name.textContent = `${definition?.name ?? attributeId}${definition?.isPrimary === true ? " ★" : ""}`;
            // What the primary does at this rank (#531), under its name.
            const effect = describePrimaryAttribute(attributeId, rank);
            if (effect !== undefined) {
              name.appendChild(h("span", "editor-attribute-effect", effect));
            }
          }
          if (rankText !== undefined) {
            rankText.textContent = String(rank);
          }
          if (minus instanceof HTMLButtonElement) {
            minus.disabled = rank <= 0;
          }
          if (plus instanceof HTMLButtonElement) {
            plus.disabled = !canRaise(character, attributeId);
          }
        },
      );
    },
  };
}

/* --- skill bar ------------------------------------------------------------- */

function mountSkillBar(panel: HTMLElement, context: EditorContext): Region {
  const { tooltip } = context;
  // Boxes rather than dropdowns: a bar is a spatial thing, and ordering
  // it by picking from eight identical `<select>`s never matched how
  // players think about it.
  const section = h("div", "editor-skills");
  section.appendChild(h("div", "editor-label", "skill bar"));
  section.appendChild(
    h("div", "editor-hint", "Drag skills from the right, or click one to equip it."),
  );
  const grid = h("div", "skill-bar-grid");
  section.appendChild(grid);
  panel.appendChild(section);

  /** What each filled slot's tooltip shows, as of the last update. */
  const described = new Map<number, SkillDescription>();
  /** What each slot's contents were built from, so an unchanged slot is left alone. */
  const built = new Map<number, string>();

  const create = (slot: number): HTMLElement => {
    const cell = h("div", "skill-slot");
    cell.dataset.slot = String(slot);
    cell.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeDragSource({ from: "slot", slot }));
    });
    cell.addEventListener("mouseenter", () => {
      const description = described.get(slot);
      if (description !== undefined) {
        tooltip.show(cell, description);
      }
    });
    cell.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
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
      const source = decodeDragSource(event.dataTransfer?.getData("text/plain") ?? "");
      if (source === undefined) {
        // Something unrelated was dragged in. Do nothing, loudly nowhere.
        return;
      }
      context.commit(applySkillDrop(context.current(), source, slot));
    });
    return cell;
  };

  return {
    update(character) {
      const available = equippableSkills(character);
      const ranks = new Map(character.attributes.map((a) => [a.attributeId, a.rank]));
      const slots = character.skillBar.map((_, slot) => slot);
      syncList(grid, slots, String, create, (cell, slot) => {
        const skillId = character.skillBar[slot] ?? null;
        const skill = skillId === null ? undefined : available.find((s) => s.id === skillId);
        const description = skill === undefined ? undefined : describeSkill(skill, ranks);
        if (description === undefined) {
          described.delete(slot);
        } else {
          described.set(slot, description);
        }
        const signature = skill === undefined ? "" : `${skill.id}|${description?.cost ?? ""}`;
        if (built.get(slot) === signature) {
          return;
        }
        built.set(slot, signature);
        cell.replaceChildren(h("span", "skill-slot-index", String(slot + 1)));
        cell.classList.toggle("is-empty", skill === undefined);
        cell.draggable = skill !== undefined;
        if (skill === undefined || description === undefined) {
          cell.appendChild(h("span", "skill-slot-empty", "empty"));
          return;
        }
        cell.appendChild(h("span", "skill-slot-name", skill.name));
        cell.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
        cell.appendChild(h("span", "skill-slot-cost", description.cost));
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "skill-slot-clear";
        clear.textContent = "×";
        clear.title = `Remove ${skill.name}`;
        clear.addEventListener("click", (event) => {
          // Without this the click also lands on the cell, which would
          // immediately re-equip whatever the library had selected.
          event.stopPropagation();
          context.commit(setSkill(context.current(), slot, null));
        });
        cell.appendChild(clear);
      });
    },
  };
}

/* --- validation and actions ------------------------------------------------ */

function mountActions(
  panel: HTMLElement,
  context: EditorContext,
  callbacks: BuildEditorCallbacks,
): Region {
  const problems = h("div", "editor-problems");
  const actions = h("div", "editor-actions");
  const save = button("save", "", () => {
    callbacks.onSave({ ...context.current(), updatedAt: Date.now() });
  });
  actions.append(
    save,
    button("duplicate", "", () => {
      callbacks.onDuplicate(context.current());
    }),
    button("delete", "", () => {
      callbacks.onDelete(context.current().id);
    }),
    button("close", "", callbacks.onClose),
  );
  panel.appendChild(actions);

  return {
    update(character) {
      const found = validateBuild(character);
      problems.replaceChildren(
        ...found.map((problem) =>
          h("div", "editor-problem", `${problem.field}: ${problem.message}`),
        ),
      );
      if (found.length === 0) {
        problems.remove();
      } else if (!problems.isConnected) {
        actions.before(problems);
      }
      // An invalid build cannot be saved — brief §23 requires validation
      // before saving, and allowing a save here would just move the failure
      // to load time.
      save.disabled = found.length > 0;
    },
  };
}

/* --- share ----------------------------------------------------------------- */

function mountShare(panel: HTMLElement, context: EditorContext): Region {
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

  const exportButton = button("export", "", () => {
    transfer.value = exportBuild(context.current());
    transfer.select();
    shareStatus.className = "editor-share-status is-ok";
    shareStatus.replaceChildren(
      h("div", undefined, "Build copied into the box above — select it and copy."),
    );
  });

  const importButton = button("import", "", () => {
    const result = importBuild(transfer.value, context.current().id, Date.now());
    if (!result.ok) {
      // Every problem at once. Someone fixing a pasted build should not
      // have to discover its faults one round trip at a time.
      shareStatus.className = "editor-share-status is-error";
      shareStatus.replaceChildren(
        h("div", undefined, "Could not import this build:"),
        ...result.problems.map((problem) => h("div", "editor-problem", problem)),
      );
      return;
    }
    // Loaded into the editor, not saved: the player sees exactly what
    // arrived and chooses to keep it. An import that silently overwrote
    // the open character would be a bad surprise. The import worked, so
    // an earlier error or export note no longer holds.
    shareStatus.className = "editor-share-status";
    shareStatus.replaceChildren();
    context.commit(result.character);
  });

  const shareActions = h("div", "editor-actions");
  shareActions.append(exportButton, importButton);
  share.appendChild(shareActions);
  panel.appendChild(share);
  // Nothing here shows the character; export reads it when pressed.
  return { update: () => undefined };
}

/* --- library (right column) ------------------------------------------------ */

type LibraryTab = "skills" | "gear";

function mountLibrary(layout: HTMLElement, context: EditorContext): Region {
  const library = h("aside", "skill-library");
  layout.appendChild(library);

  // Two libraries in one column rather than two columns: the panel is
  // already the full height of the editor, and a second permanent column
  // would squeeze the character sheet for something you only use while
  // picking one kind of thing. Both are kept, built and up to date; only
  // the open one is in the page, and each keeps its own scroll.
  const skills = mountSkillLibrary(context);
  const gear = mountGearLibrary(context);
  const bodies: Readonly<Record<LibraryTab, readonly HTMLElement[]>> = {
    skills: skills.elements,
    gear: gear.elements,
  };
  const scrolled: Record<LibraryTab, number> = { skills: 0, gear: 0 };
  let active: LibraryTab = "skills";

  const tabs = h("div", "library-tabs");
  const tabButtons = (["skills", "gear"] as const).map((tab) => {
    const node = button(tab, "library-tab", () => {
      if (active === tab) {
        return;
      }
      scrolled[active] = library.scrollTop;
      for (const element of bodies[active]) {
        element.remove();
      }
      active = tab;
      library.append(...bodies[tab]);
      library.scrollTop = scrolled[tab];
      for (const [other, otherButton] of tabButtons) {
        otherButton.classList.toggle("is-active", other === tab);
      }
    });
    node.classList.toggle("is-active", tab === active);
    tabs.appendChild(node);
    return [tab, node] as const;
  });
  library.append(tabs, ...bodies[active]);

  // Dropping worn things back onto the library takes them off: a bar skill
  // on the skills tab, gear on the gear tab. The gesture players reach for
  // after dragging something out of a slot.
  library.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  library.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    if (active === "skills") {
      const source = decodeDragSource(raw);
      if (source?.from === "slot") {
        context.commit(setSkill(context.current(), source.slot, null));
      }
      return;
    }
    const source = decodeGearDrag(raw);
    if (source !== undefined) {
      context.commit(applyGearDrop(context.current(), source, { kind: "library" }));
    }
  });

  return {
    update(character) {
      skills.update(character);
      gear.update(character);
    },
  };
}

/** A library tab's body: the elements it puts under the tabs. */
interface LibraryBody extends Region {
  readonly elements: readonly HTMLElement[];
}

function mountSkillLibrary(context: EditorContext): LibraryBody {
  const { tooltip } = context;
  const search = document.createElement("input");
  search.className = "field-input skill-search";
  search.type = "search";
  search.placeholder = "filter by name";
  const groupHost = h("div", "skill-groups");
  const emptyNote = h(
    "div",
    "skill-library-empty",
    "No skill matches. Note that only skills your professions can access are listed.",
  );

  const ranksOf = (character: StoredCharacter): Map<string, number> =>
    new Map(character.attributes.map((a) => [a.attributeId, a.rank]));

  const createBox = (skill: Skill): HTMLElement => {
    const box = h("div", "skill-box");
    box.draggable = true;
    box.dataset.skillId = skill.id;
    box.appendChild(h("span", "skill-box-name", skill.name));
    box.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
    box.appendChild(h("span", "skill-box-cost"));
    box.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData(
        "text/plain",
        encodeDragSource({ from: "library", skillId: skill.id }),
      );
    });
    box.addEventListener("mouseenter", () => {
      tooltip.show(box, describeSkill(skill, ranksOf(context.current())));
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    // Click-to-equip alongside dragging: dragging is the nicer
    // gesture but a poor only option on a trackpad, and it gives
    // the behaviour something testable to assert against.
    box.addEventListener("click", () => {
      const character = context.current();
      const firstEmpty = character.skillBar.indexOf(null);
      context.commit(setSkill(character, firstEmpty === -1 ? 0 : firstEmpty, skill.id));
    });
    return box;
  };

  const createGroup = (): HTMLElement => {
    const section = h("div", "skill-group");
    const header = h("div", "skill-group-header");
    header.appendChild(h("span", "skill-group-name"));
    section.appendChild(header);
    section.appendChild(h("div", "skill-group-boxes"));
    return section;
  };

  const render = (character: StoredCharacter): void => {
    const ranks = ranksOf(character);
    const equipped = new Set(character.skillBar.filter((id): id is string => id !== null));
    const matches = filterSkillsByName(equippableSkills(character), search.value);
    const groups = groupSkillsByAttribute(matches);
    syncList(
      groupHost,
      groups,
      (group) => group.attributeId ?? group.attributeName,
      createGroup,
      (section, group) => {
        const [header, boxes] = Array.from(section.children);
        const name = header?.querySelector(".skill-group-name");
        if (name !== null && name !== undefined) {
          name.textContent = group.attributeName;
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
          syncList(
            boxes,
            group.skills,
            (skill) => skill.id,
            createBox,
            (box, skill) => {
              box.classList.toggle("is-equipped", equipped.has(skill.id));
              const cost = box.querySelector(".skill-box-cost");
              const text = describeSkill(skill, ranks).cost;
              if (cost !== null && cost.textContent !== text) {
                cost.textContent = text;
              }
            },
          );
        }
      },
    );
    if (groups.length === 0) {
      groupHost.appendChild(emptyNote);
    }
  };

  search.addEventListener("input", () => {
    render(context.current());
  });

  return { elements: [search, groupHost], update: render };
}

/* -------------------------------------------------------------------------- */
/* Gear                                                                        */
/* -------------------------------------------------------------------------- */

/** A labelled `<select>`, the shape this file already uses for professions, kept and refilled. */
function mountSelectRow(onChange: (value: string) => void): {
  readonly element: HTMLElement;
  update(
    label: string,
    options: readonly { readonly value: string; readonly label: string }[],
    selected: string,
  ): void;
} {
  const field = h("label", "editor-field");
  const caption = h("span", "editor-field-label");
  const select = document.createElement("select");
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  field.append(caption, select);
  let filled = "";
  return {
    element: field,
    update(label, options, selected) {
      caption.textContent = label;
      const signature = JSON.stringify(options);
      if (signature !== filled) {
        filled = signature;
        select.replaceChildren(
          ...options.map((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            return node;
          }),
        );
      }
      select.value = selected;
    },
  };
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

/** What a gear slot shows; see `mountGearSlot`. */
interface GearSlotState {
  readonly filled: string | undefined;
  readonly icon?: GearIcon | undefined;
  readonly detail?: string | undefined;
  readonly disabledNote?: string | undefined;
  readonly dragSource?: GearDragSource | undefined;
  readonly onClear?: (() => void) | undefined;
}

/** Put `node` in or take it out, never moving it when it is already where it should be. */
function present(node: HTMLElement, shown: boolean, place: (node: HTMLElement) => void): void {
  if (!shown) {
    node.remove();
  } else if (!node.isConnected) {
    place(node);
  }
}

/**
 * A gear slot: a drop target that shows what is in it.
 *
 * Deliberately the same shape and gestures as `.skill-slot` — drag onto
 * it to fill it, drag out of it to empty it, click the × to clear. A
 * loadout is a thing you assemble, and two different interaction models
 * for assembling one would be two things to learn.
 */
function mountGearSlot(
  label: string,
  context: EditorContext,
  onDrop: (source: GearDragSource) => void,
): { readonly element: HTMLElement; update(state: GearSlotState): void } {
  let state: GearSlotState = { filled: undefined };
  const disabled = (): boolean => state.disabledNote !== undefined;

  const cell = h("div", "gear-slot");
  const name = h("span", "gear-slot-name");
  const detail = h("span", "gear-slot-detail");
  const clear = button("×", "gear-slot-clear", () => {
    state.onClear?.();
  });
  clear.title = `clear ${label}`;
  cell.append(h("span", "gear-slot-label", label), name);
  let shownName = "";

  cell.addEventListener("dragstart", (event: DragEvent) => {
    if (state.dragSource !== undefined && !disabled()) {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(state.dragSource));
    }
  });
  cell.addEventListener("dragover", (event: DragEvent) => {
    if (disabled()) {
      return;
    }
    event.preventDefault();
    cell.classList.add("is-drop-target");
  });
  cell.addEventListener("dragleave", () => {
    cell.classList.remove("is-drop-target");
  });
  cell.addEventListener("drop", (event: DragEvent) => {
    if (disabled()) {
      return;
    }
    event.preventDefault();
    cell.classList.remove("is-drop-target");
    context.tooltip.hide();
    const decoded = decodeGearDrag(event.dataTransfer?.getData("text/plain") ?? "");
    // A skill dropped here decodes to nothing and is ignored, which is
    // the same do-nothing-loudly-nowhere behaviour the skill bar has.
    if (decoded !== undefined) {
      onDrop(decoded);
    }
  });

  return {
    element: cell,
    update(next) {
      state = next;
      const off = disabled();
      cell.classList.toggle("is-disabled", off);
      cell.classList.toggle("is-empty", !off && next.filled === undefined);
      const icon = off ? undefined : next.icon;
      const text = next.disabledNote ?? next.filled ?? "empty";
      const signature = `${icon?.src ?? ""}|${text}`;
      if (signature !== shownName) {
        shownName = signature;
        const img = gearIconImg(icon);
        name.replaceChildren(...(img === undefined ? [] : [img]), document.createTextNode(text));
      }
      detail.textContent = next.detail ?? "";
      present(detail, next.detail !== undefined && !off, (node) => {
        name.after(node);
      });
      cell.draggable = !off && next.dragSource !== undefined;
      present(clear, next.onClear !== undefined && next.filled !== undefined && !off, (node) => {
        cell.appendChild(node);
      });
    },
  };
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
function mountGear(panel: HTMLElement, context: EditorContext): Region {
  const { current, commit } = context;
  const section = h("div", "editor-gear");
  section.appendChild(h("div", "editor-label", "equipment"));
  section.appendChild(
    h("div", "editor-hint", "Drag gear from the right, or click a piece to equip it."),
  );

  const drop = (target: GearDropTarget) => (source: GearDragSource) => {
    commit(applyGearDrop(current(), source, target));
  };

  // --- weapon and off-hand -------------------------------------------
  const handsGrid = h("div", "gear-hands");
  const weaponSlot = mountGearSlot("weapon", context, drop({ kind: "main-hand" }));
  const offhandSlot = mountGearSlot("off-hand", context, drop({ kind: "off-hand" }));
  handsGrid.append(weaponSlot.element, offhandSlot.element);
  section.appendChild(handsGrid);

  // --- attribute nominations ------------------------------------------
  // Only shown for gear that genuinely has a choice to make. A sword is
  // always Swordsmanship, and offering a one-option dropdown would imply
  // otherwise.
  const linkRow = h("div", "editor-row");
  const weaponLink = mountSelectRow((value) => {
    commit(setRequirementAttribute(current(), "mainHand", value));
  });
  const offhandLink = mountSelectRow((value) => {
    commit(setRequirementAttribute(current(), "offHand", value));
  });

  // --- armor ----------------------------------------------------------
  const armorHeader = h("div", "editor-subheader");
  armorHeader.appendChild(h("span", "editor-label", "armor"));
  armorHeader.appendChild(
    button("clear upgrades", "editor-clear-armor", () => {
      commit(clearArmorUpgrades(current()));
    }),
  );
  section.appendChild(armorHeader);

  const armorGrid = h("div", "armor-grid");
  const armorSlots = ARMOR_SLOTS.map((slot) => {
    const row = h("div", "armor-row");
    row.appendChild(h("span", "armor-slot-name", slot));
    const insignia = mountGearSlot(
      "insignia",
      context,
      drop({ kind: "armor", slot, part: "insignia" }),
    );
    const rune = mountGearSlot("rune", context, drop({ kind: "armor", slot, part: "rune" }));
    row.append(insignia.element, rune.element);
    armorGrid.appendChild(row);
    return { slot, insignia, rune };
  });
  section.appendChild(armorGrid);

  // --- the summary ------------------------------------------------------
  const stats = h("div", "gear-stats");
  section.appendChild(stats);
  panel.appendChild(section);

  return {
    update(character) {
      const weapon = getWeapon(character.equipment.mainHand.weaponId);
      const offHand = character.equipment.offHand;
      const offhandDefinition = offHand === null ? undefined : getOffhand(offHand.offhandId);
      weaponSlot.update({
        filled: weapon?.name,
        icon: weaponIcon(character.equipment.mainHand.weaponId),
        detail:
          weapon === undefined
            ? undefined
            : `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
        dragSource: { from: "hand", hand: "mainHand" },
      });
      offhandSlot.update({
        filled: offhandDefinition?.name,
        icon: offHand === null ? undefined : offhandIcon(offHand.offhandId),
        detail:
          offhandDefinition === undefined
            ? undefined
            : `+${String(offhandDefinition.baseBonus + offhandDefinition.metRequirementBonus)} ${offhandDefinition.kind}`,
        // Said in the slot itself rather than left for the player to
        // discover by dragging a shield onto it and seeing nothing happen.
        disabledNote: canEquipOffhand(character) ? undefined : "both hands full",
        dragSource: offHand === null ? undefined : { from: "hand", hand: "offHand" },
        onClear: () => {
          commit(setOffhand(current(), null));
        },
      });

      const weaponChoices =
        weapon?.requirement.kind === "chosen" ? weaponAttributeChoices(character) : [];
      const offhandChoices =
        offHand === null ? [] : offhandAttributeChoices(character, offHand.offhandId);
      const attributeOptions = (ids: readonly string[]) =>
        ids.map((id) => ({ value: id, label: getAttribute(id)?.name ?? id }));
      if (weapon !== undefined && weaponChoices.length > 0) {
        weaponLink.update(
          `${weapon.name.toLowerCase()} attribute`,
          attributeOptions(weaponChoices),
          character.equipment.mainHand.requirementAttributeId ?? "",
        );
      }
      if (offHand !== null && offhandChoices.length > 0) {
        offhandLink.update(
          `${offhandDefinition?.name.toLowerCase() ?? "off-hand"} attribute`,
          attributeOptions(offhandChoices),
          offHand.requirementAttributeId ?? "",
        );
      }
      present(weaponLink.element, weaponChoices.length > 0, (node) => {
        linkRow.prepend(node);
      });
      present(offhandLink.element, offhandChoices.length > 0, (node) => {
        linkRow.appendChild(node);
      });
      present(linkRow, linkRow.children.length > 0, (node) => {
        handsGrid.after(node);
      });

      for (const { slot, insignia, rune } of armorSlots) {
        const piece = character.equipment.armor[slot];
        insignia.update({
          filled: piece.insigniaId === null ? undefined : getInsignia(piece.insigniaId)?.name,
          detail:
            piece.insigniaId === null ? undefined : insigniaAmountNote(piece.insigniaId, slot),
          dragSource:
            piece.insigniaId === null ? undefined : { from: "armor-slot", slot, part: "insignia" },
          onClear: () => {
            commit(setInsignia(current(), slot, null));
          },
        });
        rune.update({
          filled: piece.rune === null ? undefined : runeDisplayName(piece.rune),
          dragSource: piece.rune === null ? undefined : { from: "armor-slot", slot, part: "rune" },
          onClear: () => {
            commit(setRune(current(), slot, null));
          },
        });
      }

      stats.replaceChildren(...statLines(character));
    },
  };
}

/** The summary's lines; nothing in them takes focus, so they are rebuilt. */
function statLines(character: StoredCharacter): HTMLElement[] {
  const summary = summariseGear(character);
  const lines = [
    statLine("health", String(summary.maxHealth)),
    statLine("energy", String(summary.maxEnergy)),
    statLine("energy regen", `${String(summary.baseEnergyPips)} pips`),
    statLine("armor", String(summary.armor)),
  ];
  if (!summary.requirementMet) {
    // Said out loud rather than left for the player to discover by
    // dying: an unmet requirement costs two thirds of the damage.
    lines.push(
      h("div", "gear-warning", "requirement not met — this weapon deals a third of its damage"),
    );
  }
  for (const bonus of summary.runeBonuses) {
    lines.push(
      statLine(
        getAttribute(bonus.attributeId)?.name ?? bonus.attributeId,
        `+${String(bonus.bonus)}`,
      ),
    );
  }
  for (const line of summary.conditionalArmor) {
    lines.push(h("div", "gear-stat-note", line));
  }
  if (summary.flatPhysicalReduction > 0) {
    lines.push(
      h(
        "div",
        "gear-stat-note",
        `−${String(summary.flatPhysicalReduction)} physical damage per hit`,
      ),
    );
  }
  return lines;
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
function mountGearLibrary(context: EditorContext): LibraryBody {
  const { current, commit } = context;
  const host = h("div", "skill-groups");

  function box(options: {
    readonly name: string;
    readonly icon?: GearIcon | undefined;
    readonly detail: string;
    readonly drag: GearDragSource;
    readonly onClick: () => void;
  }): HTMLElement {
    const node = h("div", "skill-box gear-box");
    node.draggable = true;
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
  const weaponBoxes = ALL_WEAPONS.map((weapon) => {
    const node = box({
      name: weapon.name,
      icon: weaponIcon(weapon.id),
      detail: `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
      drag: { from: "weapon-library", weaponId: weapon.id },
      onClick: () => {
        commit(setWeapon(current(), weapon.id));
      },
    });
    weapons.appendChild(node);
    return { id: weapon.id, node };
  });

  // --- off-hands -------------------------------------------------------
  const offhands = group("off-hands");
  const offhandBoxes = ALL_OFFHANDS.map((offhand) => {
    const node = box({
      name: offhand.name,
      icon: offhandIcon(offhand.id),
      detail: `+${String(offhand.baseBonus + offhand.metRequirementBonus)} ${offhand.kind}`,
      drag: { from: "offhand-library", offhandId: offhand.id },
      onClick: () => {
        commit(setOffhand(current(), offhand.id));
      },
    });
    offhands.appendChild(node);
    return { id: offhand.id, node };
  });

  // --- insignias -------------------------------------------------------
  const insignias = group("insignias");
  const insigniaBoxes = ALL_INSIGNIAS.map((insignia) => {
    const node = box({
      name: insignia.name,
      detail: insigniaLibraryNote(insignia.effect),
      drag: { from: "insignia-library", insigniaId: insignia.id },
      onClick: () => {
        const next = current();
        commit(setInsignia(next, firstFreeArmorSlot(next, "insignia"), insignia.id));
      },
    });
    insignias.appendChild(node);
    return { id: insignia.id, node };
  });

  // --- runes -----------------------------------------------------------
  // Which runes there are depends on the primary profession, so this list
  // is the one that changes.
  const runes = group("runes");
  const runeBoxes = h("div", "skill-group-boxes");
  runes.appendChild(runeBoxes);

  return {
    elements: [host],
    update(character) {
      for (const { id, node } of weaponBoxes) {
        node.classList.toggle("is-equipped", id === character.equipment.mainHand.weaponId);
      }
      for (const { id, node } of offhandBoxes) {
        node.classList.toggle("is-equipped", id === character.equipment.offHand?.offhandId);
      }
      const worn = ARMOR_SLOTS.map((slot) => character.equipment.armor[slot]);
      const wornInsignias = new Set(worn.map((piece) => piece.insigniaId));
      for (const { id, node } of insigniaBoxes) {
        node.classList.toggle("is-equipped", wornInsignias.has(id));
      }
      const wornRunes = new Set(
        worn.flatMap((piece) => (piece.rune === null ? [] : [encodeRune(piece.rune)])),
      );
      syncList(
        runeBoxes,
        runeChoices(character),
        (choice) => choice.key,
        (choice) =>
          box({
            name: choice.label,
            detail: "",
            drag: { from: "rune-library", rune: choice.rune },
            onClick: () => {
              const next = current();
              commit(setRune(next, firstFreeArmorSlot(next, "rune"), choice.rune));
            },
          }),
        (node, choice) => {
          node.classList.toggle("is-equipped", wornRunes.has(choice.key));
        },
      );
    },
  };
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

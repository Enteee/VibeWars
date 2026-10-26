import {
  StatusSet,
  energyCostOf,
  getAttribute,
  getSkill,
  type SkillType,
} from "@vibewars/game-core";

import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import {
  createCharacterDot,
  equippedCount,
  professionBadge,
  professionLabel,
} from "./character-preview.js";
import { skillTypeBadgeHtml } from "./icons.js";
import {
  button,
  h,
  inlineConfirm,
  problemsChip,
  screenBar,
  syncList,
  toast,
  type InlineConfirm,
} from "./kit.js";
import {
  addMember,
  MAX_TEAM_SIZE,
  moveMember,
  removeMember,
  validateTeam,
} from "./team-builder.js";

/**
 * The team editor (#573, epic #554), mounted once per ADR-0030.
 *
 * Add, remove, reorder and rename change the team in memory and stay on
 * screen; nothing is stored until Save, which `validateTeam` gates. Back
 * with unsaved edits, and Delete always, ask inline first.
 */

export interface TeamEditorCallbacks {
  /** Store the team; the editor stays open once it has. */
  readonly onSave: (team: StoredTeam) => Promise<void>;
  readonly onDuplicate: (team: StoredTeam) => void;
  readonly onDelete: (id: string) => void;
  /** Leave the editor, without storing anything. */
  readonly onClose: () => void;
}

export interface TeamEditorView {
  dispose(): void;
}

/** Whether `current` differs from the team as it was opened or last saved. */
export function isTeamUnsaved(opened: StoredTeam, current: StoredTeam): boolean {
  return (
    opened.name !== current.name ||
    opened.members.length !== current.members.length ||
    opened.members.some(
      (member, index) => member.characterId !== current.members[index]?.characterId,
    )
  );
}

/** One line of the problems chip, as a plain sentence. */
export interface TeamEditorProblem {
  readonly text: string;
  readonly blocking: boolean;
}

/** A message as a sentence: capitalised, with a full stop. */
function sentence(message: string): string {
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
}

/**
 * What stops this team saving, in plain sentences (#573): `validateTeam`'s
 * problems, then a full team as a hint that never blocks.
 */
export function teamEditorProblems(
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): TeamEditorProblem[] {
  const blocking = validateTeam(team, characters).map((problem): TeamEditorProblem => ({
    text:
      problem.message === "team name must not be empty"
        ? "Give the team a name."
        : sentence(problem.message),
    blocking: true,
  }));
  const hints: TeamEditorProblem[] =
    team.members.length >= MAX_TEAM_SIZE
      ? [{ text: `The team is full: ${String(MAX_TEAM_SIZE)} members.`, blocking: false }]
      : [];
  return [...blocking, ...hints];
}

/** The characters the add list offers: everyone not on the team yet. */
export function addableCharacters(
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): StoredCharacter[] {
  const members = new Set(team.members.map((member) => member.characterId));
  return characters.filter((character) => !members.has(character.id));
}

/** How many more members the team can take. */
export function placesLeft(team: StoredTeam): number {
  return Math.max(0, MAX_TEAM_SIZE - team.members.length);
}

/** One filled cell of a member's bar in the team grid (#574). */
export interface TeamSkillCell {
  readonly skillId: string;
  readonly name: string;
  /** `undefined` for an id this client does not know. */
  readonly type: SkillType | undefined;
  /** As the HUD prints it: "5e", "8a", or empty for a free skill. */
  readonly cost: string;
  readonly elite: boolean;
}

/**
 * A member's eight bar slots as stored, `null` for an empty one (#574).
 * An illegal build still shows what it holds; `validateTeam` decides.
 */
export function memberSkillCells(character: StoredCharacter): (TeamSkillCell | null)[] {
  const ranks = new Map(character.attributes.map((a) => [a.attributeId, a.rank]));
  return Array.from({ length: SKILL_BAR_SLOTS }, (_, slot) => {
    const skillId = character.skillBar[slot] ?? null;
    if (skillId === null) {
      return null;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return { skillId, name: skillId, type: undefined, cost: "", elite: false };
    }
    const cost =
      skill.cost === undefined
        ? ""
        : skill.cost.kind === "adrenaline"
          ? `${String(skill.cost.amount)}a`
          : `${String(energyCostOf(skill, { attributeRanks: ranks, statuses: new StatusSet() }))}e`;
    return { skillId, name: skill.name, type: skill.type, cost, elite: skill.elite };
  });
}

/** A member's three highest attribute ranks, highest first: "Strength 12". */
export function topAttributes(character: StoredCharacter): string[] {
  return character.attributes
    .filter((attribute) => attribute.rank > 0)
    .map((attribute, order) => ({ attribute, order }))
    .sort((a, b) => b.attribute.rank - a.attribute.rank || a.order - b.order)
    .slice(0, 3)
    .map(
      ({ attribute }) =>
        `${getAttribute(attribute.attributeId)?.name ?? attribute.attributeId} ${String(attribute.rank)}`,
    );
}

/**
 * Drop the member at `from` onto place `to`, as that many ↑ or ↓ presses
 * would (#574), so a drag and the buttons can never disagree.
 */
export function dragMember(team: StoredTeam, from: number, to: number): StoredTeam {
  const step = to > from ? 1 : -1;
  let moved = team;
  for (let index = from; index !== to; index += step) {
    const next = moveMember(moved, index, step);
    if (next === moved) {
      return moved;
    }
    moved = next;
  }
  return moved;
}

export function mountTeamEditor(
  root: HTMLElement,
  initial: StoredTeam,
  characters: readonly StoredCharacter[],
  callbacks: TeamEditorCallbacks,
  /** False for a new team, which nothing has stored yet. */
  stored: boolean,
): TeamEditorView {
  let team = initial;
  let opened = initial;
  let isStored = stored;
  let asking: InlineConfirm | undefined;
  let disposed = false;

  const ask = (
    anchor: HTMLElement,
    question: string,
    confirmLabel: string,
    onConfirm: () => void,
    cancelLabel: string,
  ): void => {
    asking?.dismiss();
    asking = inlineConfirm(anchor, question, confirmLabel, onConfirm, cancelLabel);
  };

  const close = (): void => {
    if (!isTeamUnsaved(opened, team)) {
      callbacks.onClose();
      return;
    }
    ask(back, "Discard changes?", "Discard", callbacks.onClose, "Keep editing");
  };

  root.replaceChildren();
  const panel = h("div", "screen team-editor");

  const nameField = h("label", "field team-editor-name");
  nameField.appendChild(h("span", "field-label", "Team name"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.value = team.name;
  nameInput.addEventListener("input", () => {
    commit({ ...team, name: nameInput.value });
  });
  nameField.appendChild(nameInput);

  const chip = problemsChip([]);
  const unsaved = h("span", "editor-unsaved", "● unsaved");

  const save = button("Save", "primary", () => {
    const saving = { ...team, updatedAt: Date.now() };
    save.disabled = true;
    callbacks.onSave(saving).then(
      () => {
        if (disposed) {
          return;
        }
        opened = saving;
        isStored = true;
        // Edits made while it was storing stay, and stay unsaved.
        team = { ...team, updatedAt: saving.updatedAt };
        toast("Saved");
        update();
      },
      (error: unknown) => {
        if (disposed) {
          return;
        }
        toast(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
        update();
      },
    );
  });
  // Duplicate copies the stored team: with edits pending it would store
  // them unchecked, under the copy, and drop them from this one.
  const duplicate = button("Duplicate", "", () => {
    callbacks.onDuplicate(team);
  });
  const remove = button("Delete", "", () => {
    ask(
      remove,
      `Delete ${team.name.trim() === "" ? "this team" : team.name}?`,
      "Delete",
      () => {
        callbacks.onDelete(team.id);
      },
      "Cancel",
    );
  });

  const { element: bar, back } = screenBar({
    back: { label: "Back", onBack: close },
    title: [h("h2", "screen-title", "Edit team")],
    status: [chip.element, unsaved],
    actions: [save, duplicate, remove],
    // Esc closes the problem list before it is Back.
    putAway: () => {
      if (!chip.isOpen()) {
        return false;
      }
      chip.close();
      return true;
    },
  });
  panel.append(bar, nameField);

  const body = h("div", "team-editor-body");
  // The grid scrolls sideways on a narrow window; the picker wraps below.
  const gridScroll = h("div", "team-grid-scroll");
  const list = h("div", "team-grid team-members");
  list.setAttribute("role", "list");
  gridScroll.appendChild(list);
  const picker = h("aside", "team-picker");
  const pickerHeader = h("h3", "team-picker-header");
  const pickerList = h("div", "team-picker-list");
  const pickerEmpty = h("p", "team-picker-empty", "Every character is on the team.");
  picker.append(pickerHeader, pickerList, pickerEmpty);
  body.append(gridScroll, picker);
  panel.appendChild(body);

  // The row being dragged, by character; a drop moves it there.
  let dragging: string | undefined;
  const indexOfMember = (characterId: string): number =>
    team.members.findIndex((m) => m.characterId === characterId);

  const createRow = (characterId: string): HTMLElement => {
    const row = h("div", "team-row");
    row.setAttribute("role", "listitem");
    row.dataset.characterId = characterId;
    const indexOf = (): number => indexOfMember(characterId);

    const order = h("span", "team-row-order");
    order.append(h("span", "team-row-index"), h("span", "team-row-handle", "⠿"));
    // The top attribute ranks go under the professions, leaving the
    // width to the eight cells.
    const who = h("span", "team-row-character");
    who.append(
      h("span", "team-row-dot"),
      h("span", "team-row-name"),
      h("span", "team-row-professions"),
      h("span", "team-row-attributes"),
    );
    const skills = h("span", "team-row-skills");
    for (let slot = 0; slot < SKILL_BAR_SLOTS; slot += 1) {
      skills.appendChild(h("span", "team-skill"));
    }
    const controls = h("span", "team-row-controls");
    // A team's order is its slot order in the lobby; `moveMember` clamps.
    const up = button("↑", "member-up", () => {
      commit(moveMember(team, indexOf(), -1));
    });
    up.setAttribute("aria-label", "move up");
    const down = button("↓", "member-down", () => {
      commit(moveMember(team, indexOf(), 1));
    });
    down.setAttribute("aria-label", "move down");
    const drop = button("×", "member-remove", () => {
      commit(removeMember(team, indexOf()));
    });
    drop.setAttribute("aria-label", "remove");
    controls.append(up, down, drop);
    row.append(order, who, skills, controls);

    row.addEventListener("dragstart", (event: DragEvent) => {
      dragging = characterId;
      // Firefox starts no drag without data.
      event.dataTransfer?.setData("text/plain", characterId);
      if (event.dataTransfer !== null) {
        event.dataTransfer.effectAllowed = "move";
      }
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      dragging = undefined;
      row.classList.remove("is-dragging");
      for (const other of Array.from(list.children)) {
        other.classList.remove("is-drop-target");
      }
    });
    row.addEventListener("dragover", (event: DragEvent) => {
      if (dragging === undefined) {
        return;
      }
      event.preventDefault();
      row.classList.toggle("is-drop-target", dragging !== characterId);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("is-drop-target");
    });
    row.addEventListener("drop", (event: DragEvent) => {
      if (dragging === undefined) {
        return;
      }
      event.preventDefault();
      row.classList.remove("is-drop-target");
      const from = indexOfMember(dragging);
      dragging = undefined;
      commit(dragMember(team, from, indexOf()));
    });
    return row;
  };

  /** Fill a row's eight cells from what the character stores. */
  const fillSkills = (skills: Element, character: StoredCharacter): void => {
    memberSkillCells(character).forEach((cell, slot) => {
      const node = skills.children[slot];
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const signature = cell === null ? "" : `${cell.skillId}|${cell.cost}`;
      if (node.dataset.signature === signature) {
        return;
      }
      node.dataset.signature = signature;
      node.classList.toggle("is-empty", cell === null);
      node.classList.toggle("is-elite", cell?.elite === true);
      if (cell?.type === undefined) {
        delete node.dataset.skillType;
      } else {
        node.dataset.skillType = cell.type;
      }
      node.replaceChildren();
      node.title = cell === null ? "empty slot" : cell.name;
      if (cell === null) {
        return;
      }
      if (cell.type !== undefined) {
        node.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(cell.type));
      }
      node.append(h("span", "team-skill-name", cell.name), h("span", "team-skill-cost", cell.cost));
    });
  };

  const createPick = (characterId: string): HTMLElement => {
    const pick = h("div", "team-pick");
    pick.dataset.characterId = characterId;
    pick.append(h("span", "team-row-dot"), h("span", "team-pick-text"));
    const add = button("Add", "team-pick-add", () => {
      commit(addMember(team, characterId));
    });
    pick.appendChild(add);
    return pick;
  };

  /** Put `character`'s dot in `holder`, unless it already shows these professions. */
  const fillDot = (holder: Element | null, character: StoredCharacter): void => {
    if (!(holder instanceof HTMLElement)) {
      return;
    }
    const badge = professionBadge(character.primaryProfession, character.secondaryProfession);
    if (holder.dataset.badge !== badge) {
      holder.dataset.badge = badge;
      holder.replaceChildren(createCharacterDot(character));
    }
  };
  root.appendChild(panel);

  function update(): void {
    // Only the field itself changes the name; setting an unchanged value
    // would still move the caret to the end.
    if (nameInput.value !== team.name) {
      nameInput.value = team.name;
    }
    const problems = teamEditorProblems(team, characters);
    chip.update(problems);
    unsaved.hidden = !isTeamUnsaved(opened, team);
    // A team that does not validate cannot be saved; the button says why.
    const firstBlocking = problems.find((problem) => problem.blocking);
    save.disabled = firstBlocking !== undefined;
    save.title = firstBlocking?.text ?? "save this team";
    duplicate.disabled = !isStored || isTeamUnsaved(opened, team);
    duplicate.title = duplicate.disabled ? "Save first to duplicate" : "duplicate this team";
    // A new team has nothing to delete: Back leaves it.
    remove.disabled = !isStored;

    const last = team.members.length - 1;
    syncList(
      list,
      team.members.map((member) => member.characterId),
      (characterId) => characterId,
      createRow,
      (row, characterId) => {
        const index = team.members.findIndex((m) => m.characterId === characterId);
        const character = characters.find((c) => c.id === characterId);
        const setText = (selector: string, text: string): void => {
          const node = row.querySelector(selector);
          if (node !== null && node.textContent !== text) {
            node.textContent = text;
          }
        };
        setText(".team-row-index", String(index + 1));
        setText(".team-row-name", character?.name ?? "(missing character)");
        row.classList.toggle("is-missing", character === undefined);
        // A missing character can only be removed: no bar, no moving it.
        row.draggable = character !== undefined;
        if (character !== undefined) {
          fillDot(row.querySelector(".team-row-dot"), character);
          setText(
            ".team-row-professions",
            professionLabel(character.primaryProfession, character.secondaryProfession),
          );
          const skills = row.querySelector(".team-row-skills");
          if (skills !== null) {
            fillSkills(skills, character);
          }
          const ranks = topAttributes(character).join(" · ");
          setText(".team-row-attributes", ranks);
          row.querySelector<HTMLElement>(".team-row-attributes")?.setAttribute("title", ranks);
        }
        for (const selector of [".member-up", ".member-down"]) {
          const control = row.querySelector<HTMLButtonElement>(selector);
          if (control !== null) {
            control.hidden = character === undefined;
            control.disabled = selector === ".member-up" ? index === 0 : index === last;
          }
        }
      },
    );

    const offered = addableCharacters(team, characters);
    const left = placesLeft(team);
    pickerHeader.textContent = `${String(left)} ${left === 1 ? "place" : "places"} left`;
    pickerEmpty.hidden = offered.length > 0;
    syncList(
      pickerList,
      offered.map((character) => character.id),
      (characterId) => characterId,
      createPick,
      (pick, characterId) => {
        const character = characters.find((c) => c.id === characterId);
        if (character === undefined) {
          return;
        }
        fillDot(pick.querySelector(".team-row-dot"), character);
        const text = pick.querySelector(".team-pick-text");
        if (text !== null) {
          text.replaceChildren(
            h("span", "team-pick-name", character.name),
            h(
              "span",
              "team-pick-sub",
              `${professionLabel(character.primaryProfession, character.secondaryProfession)} · ${String(equippedCount(character))}/${String(SKILL_BAR_SLOTS)} skills`,
            ),
          );
        }
        const add = pick.querySelector<HTMLButtonElement>(".team-pick-add");
        if (add !== null) {
          add.disabled = left === 0;
          add.setAttribute("aria-label", `add ${character.name}`);
          add.title = left === 0 ? "The team is full" : `add ${character.name} to the team`;
        }
      },
    );
  }

  function commit(next: StoredTeam): void {
    team = next;
    update();
  }

  update();

  // A press anywhere else puts the problem list away.
  const onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && !chip.element.contains(event.target)) {
      chip.close();
    }
  };
  document.addEventListener("pointerdown", onPointerDown);

  return {
    dispose() {
      disposed = true;
      document.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

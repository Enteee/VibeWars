import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
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

export function mountTeamEditor(
  root: HTMLElement,
  initial: StoredTeam,
  characters: readonly StoredCharacter[],
  callbacks: TeamEditorCallbacks,
): TeamEditorView {
  let team = initial;
  let opened = initial;
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
    ask(back, "Discard changes?", "discard", callbacks.onClose, "keep editing");
  };

  root.replaceChildren();
  const panel = h("div", "screen team-editor");

  const nameField = h("label", "field team-editor-name");
  nameField.appendChild(h("span", "field-label", "team name"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.value = team.name;
  nameInput.addEventListener("input", () => {
    commit({ ...team, name: nameInput.value });
  });
  nameField.appendChild(nameInput);

  const chip = problemsChip([]);
  const unsaved = h("span", "editor-unsaved", "● unsaved");

  const save = button("save", "primary", () => {
    const saving = { ...team, updatedAt: Date.now() };
    save.disabled = true;
    void callbacks.onSave(saving).then(() => {
      if (disposed) {
        return;
      }
      opened = saving;
      // Edits made while it was storing stay, and stay unsaved.
      team = { ...team, updatedAt: saving.updatedAt };
      toast("Saved");
      update();
    });
  });
  const duplicate = button("duplicate", "", () => {
    callbacks.onDuplicate(team);
  });
  const remove = button("delete", "", () => {
    ask(
      remove,
      `Delete ${team.name.trim() === "" ? "this team" : team.name}?`,
      "delete",
      () => {
        callbacks.onDelete(team.id);
      },
      "cancel",
    );
  });

  const { element: bar, back } = screenBar({
    back: { label: "back", onBack: close },
    title: [h("h2", "screen-title", "edit team")],
    status: [chip.element, unsaved],
    actions: [save, duplicate, remove],
  });
  panel.append(bar, nameField);

  const list = h("div", "entity-list team-members");
  panel.appendChild(list);

  const createRow = (characterId: string): HTMLElement => {
    const row = h("div", "entity-row");
    row.dataset.characterId = characterId;
    row.appendChild(h("span", "entity-name"));
    const indexOf = (): number => team.members.findIndex((m) => m.characterId === characterId);
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
    row.append(up, down, drop);
    return row;
  };

  const addRow = h("div", "menu-row");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "character to add");
  const add = button("add member", "", () => {
    if (select.value !== "") {
      commit(addMember(team, select.value));
    }
  });
  addRow.append(select, add);
  panel.appendChild(addRow);
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

    const last = team.members.length - 1;
    syncList(
      list,
      team.members.map((member) => member.characterId),
      (characterId) => characterId,
      createRow,
      (row, characterId) => {
        const index = team.members.findIndex((m) => m.characterId === characterId);
        const character = characters.find((c) => c.id === characterId);
        const name = row.querySelector(".entity-name");
        if (name !== null) {
          name.textContent = `${String(index + 1)}. ${character?.name ?? "(missing character)"}`;
        }
        row.classList.toggle("is-missing", character === undefined);
        // A missing character can only be removed.
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
    const chosen = select.value;
    select.replaceChildren(
      ...offered.map((character) => {
        const option = document.createElement("option");
        option.value = character.id;
        option.textContent = character.name;
        return option;
      }),
    );
    if (offered.some((character) => character.id === chosen)) {
      select.value = chosen;
    }
    select.disabled = offered.length === 0;
    add.disabled = offered.length === 0 || team.members.length >= MAX_TEAM_SIZE;
  }

  function commit(next: StoredTeam): void {
    team = next;
    update();
  }

  update();

  // Esc puts away what is open, else is Back (#566's rule), unless the
  // page used it already.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented || event.repeat) {
      return;
    }
    event.preventDefault();
    if (asking?.isOpen() === true) {
      asking.dismiss();
      return;
    }
    if (chip.isOpen()) {
      chip.close();
      return;
    }
    close();
  };
  document.addEventListener("keydown", onKeyDown);

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
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

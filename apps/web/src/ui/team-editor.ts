import {
  energyCostOf,
  getAttribute,
  getSkill,
  outsideMatch,
  type SkillType,
} from "@vibewars/game-core";

import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import {
  exportTeam,
  importTeam,
  looksLikeTeam,
  type TeamImportResult,
} from "../storage/team-transfer.js";
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
  listenForPaste,
  problemsChip,
  screenBar,
  shareLine,
  syncList,
  toast,
  type InlineConfirm,
} from "./kit.js";
import {
  addMember,
  MAX_TEAM_SIZE,
  moveMember,
  professionMix,
  removeMember,
  teamCounters,
  validateTeam,
  type TeamCounter,
  type TeamCounterId,
} from "./team-builder.js";

/**
 * The team editor (#573, epic #554), mounted once per ADR-0030.
 *
 * Add, remove, reorder and rename change the team in memory and stay on
 * screen; nothing is stored until Save, which `validateTeam` gates. Back
 * with unsaved edits, and Delete always, ask inline first. A member's name
 * opens them in the build editor, and the way back hands the editor its
 * own state again (#576), so nothing unsaved is lost on the trip. Share
 * copies the team as a code; a team code pasted here opens that team
 * instead, unsaved (#577).
 */

/** Everything the editor holds that is not stored, to leave and come back to. */
export interface TeamEditorState {
  /** The team as opened or last saved: what "unsaved" compares against. */
  readonly opened: StoredTeam;
  /** The team as edited. */
  readonly team: StoredTeam;
  /** False for a new team, which nothing has stored yet. */
  readonly stored: boolean;
}

/** The editor's state for `team`, fresh from the list or a new one. */
export function openedTeam(team: StoredTeam, stored: boolean): TeamEditorState {
  return { opened: team, team, stored };
}

/**
 * The editor's state for a pasted team (#577): nothing stored, and every
 * part of it unsaved, as if pasted into a blank team, so Back asks first.
 */
export function pastedTeam(team: StoredTeam): TeamEditorState {
  return { opened: { ...team, name: "", members: [] }, team, stored: false };
}

export interface TeamEditorCallbacks {
  /** Store the team; the editor stays open once it has. */
  readonly onSave: (team: StoredTeam) => Promise<void>;
  readonly onDuplicate: (team: StoredTeam) => void;
  readonly onDelete: (id: string) => void;
  /** Leave the editor, without storing anything. */
  readonly onClose: () => void;
  /** Open a member in the build editor; `state` is what to come back to. */
  readonly onOpenMember: (characterId: string, state: TeamEditorState) => void;
  /** Store a pasted team's new characters and open it, unsaved (#577). */
  readonly onImportTeam: (imported: Extract<TeamImportResult, { ok: true }>) => void;
}

export interface TeamEditorView {
  /** Leave for `then`, as Back does: unsaved edits ask first (#1268). */
  leave(then: () => void): void;
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
          : `${String(energyCostOf(skill, outsideMatch(ranks)))}e`;
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

/**
 * What the grid highlights (#575), one mode at a time: the cells a
 * counter counts, or every copy of one skill (find-a-skill).
 */
export type TeamHighlight =
  | { readonly kind: "counter"; readonly id: TeamCounterId }
  | { readonly kind: "skill"; readonly skillId: string };

/** A cell's key in `markedCells`: "characterId:slot". */
export function cellKey(characterId: string, slot: number): string {
  return `${characterId}:${String(slot)}`;
}

/** The cells `highlight` marks, by `cellKey`; the rest of the grid dims. */
export function markedCells(
  highlight: TeamHighlight,
  counters: readonly TeamCounter[],
  team: StoredTeam,
  characters: readonly StoredCharacter[],
): Set<string> {
  if (highlight.kind === "counter") {
    const counter = counters.find((c) => c.id === highlight.id);
    return new Set(counter?.cells.map((cell) => cellKey(cell.characterId, cell.slot)));
  }
  const marked = new Set<string>();
  for (const member of team.members) {
    const character = characters.find((c) => c.id === member.characterId);
    character?.skillBar.forEach((skillId, slot) => {
      if (skillId === highlight.skillId) {
        marked.add(cellKey(character.id, slot));
      }
    });
  }
  return marked;
}

export function mountTeamEditor(
  root: HTMLElement,
  initial: TeamEditorState,
  characters: readonly StoredCharacter[],
  callbacks: TeamEditorCallbacks,
): TeamEditorView {
  let team = initial.team;
  let opened = initial.opened;
  let isStored = initial.stored;
  let asking: InlineConfirm | undefined;
  let highlight: TeamHighlight | undefined;
  let disposed = false;

  /** Turn `next` on, or off if it is the one already on. */
  const toggleHighlight = (next: TeamHighlight): void => {
    const same =
      highlight !== undefined &&
      (next.kind === "counter"
        ? highlight.kind === "counter" && highlight.id === next.id
        : highlight.kind === "skill" && highlight.skillId === next.skillId);
    highlight = same ? undefined : next;
    update();
  };

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

  const leave = (then: () => void): void => {
    if (!isTeamUnsaved(opened, team)) {
      then();
      return;
    }
    ask(back, "Discard changes?", "Discard", then, "Keep editing");
  };
  const close = (): void => {
    leave(callbacks.onClose);
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
  // Share (#577): the team, every build inline, as one line with Copy.
  const share = shareLine("team to share");
  const shareButton = button("Share", "", () => {
    const text = exportTeam(team, characters);
    if (text !== undefined) {
      share.show(text);
    }
  });
  const shareWrap = h("span", "editor-more-wrap");
  shareWrap.append(shareButton, share.element);
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

  const { back } = screenBar({
    crumbs: ["VibeWars", "Teams", "Edit team"],
    back: { label: "Back", onBack: close },
    status: [chip.element, unsaved],
    actions: [save, shareWrap, duplicate, remove],
    // Esc puts away Share and the problem list, then clears the counter's
    // marks, before it is Back.
    putAway: () => {
      if (share.isOpen()) {
        share.hide();
        return true;
      }
      if (chip.isOpen()) {
        chip.close();
        return true;
      }
      if (highlight !== undefined) {
        highlight = undefined;
        update();
        return true;
      }
      return false;
    },
  });
  panel.append(nameField);

  // What the bars hold; a counter marks its cells in the grid (#575).
  const counterBar = h("div", "team-counters");
  const counterButtons = new Map<TeamCounterId, HTMLButtonElement>();
  for (const counter of teamCounters([], characters)) {
    const counterButton = button("", "team-counter", () => {
      toggleHighlight({ kind: "counter", id: counter.id });
    });
    counterButton.dataset.counter = counter.id;
    counterButton.title = counter.title;
    counterButton.append(
      h("span", "team-counter-label", counter.label),
      h("span", "team-counter-count"),
    );
    counterButtons.set(counter.id, counterButton);
    counterBar.appendChild(counterButton);
  }
  const mix = h("span", "team-counter-mix");
  mix.title = "the team's professions";
  counterBar.appendChild(mix);
  panel.appendChild(counterBar);

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
      button("", "team-row-name", () => {
        asking?.dismiss();
        callbacks.onOpenMember(characterId, { opened, team, stored: isStored });
      }),
      h("span", "team-row-professions"),
      h("span", "team-row-attributes"),
    );
    const skills = h("span", "team-row-skills");
    for (let slot = 0; slot < SKILL_BAR_SLOTS; slot += 1) {
      const cell = h("span", "team-skill");
      // A filled cell finds every copy of its skill on the team (#575).
      const find = (): void => {
        const skillId = cell.dataset.skillId;
        if (skillId !== undefined) {
          toggleHighlight({ kind: "skill", skillId });
        }
      };
      cell.addEventListener("click", find);
      cell.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          find();
        }
      });
      skills.appendChild(cell);
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
      node.title = cell === null ? "empty slot" : `${cell.name}: find it on the team`;
      if (cell === null) {
        delete node.dataset.skillId;
        node.removeAttribute("role");
        node.removeAttribute("tabindex");
        return;
      }
      node.dataset.skillId = cell.skillId;
      node.setAttribute("role", "button");
      node.tabIndex = 0;
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
    // A team that cannot be saved cannot be shared: a member is missing.
    const missing = team.members.some((m) => !characters.some((c) => c.id === m.characterId));
    shareButton.disabled = missing;
    shareButton.title = missing
      ? "A member's character is missing: remove it to share"
      : "share this team as one line";
    if (missing) {
      share.hide();
    }
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
        const name = row.querySelector<HTMLButtonElement>(".team-row-name");
        if (name !== null) {
          name.disabled = character === undefined;
          name.title = character === undefined ? "" : `edit ${character.name} in the build editor`;
        }
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

    const counters = teamCounters(team.members, characters);
    for (const counter of counters) {
      const counterButton = counterButtons.get(counter.id);
      if (counterButton === undefined) {
        continue;
      }
      const count = counterButton.querySelector(".team-counter-count");
      if (count !== null) {
        count.textContent = String(counter.cells.length);
      }
      counterButton.classList.toggle("is-lacking", counter.wanted && counter.cells.length === 0);
      counterButton.setAttribute(
        "aria-pressed",
        String(highlight?.kind === "counter" && highlight.id === counter.id),
      );
    }
    mix.textContent = professionMix(team.members, characters);
    const marked =
      highlight === undefined ? undefined : markedCells(highlight, counters, team, characters);
    list.classList.toggle("is-highlighting", marked !== undefined);
    for (const row of Array.from(list.children)) {
      if (!(row instanceof HTMLElement)) {
        continue;
      }
      const characterId = row.dataset.characterId ?? "";
      Array.from(row.querySelectorAll(".team-skill")).forEach((cell, slot) => {
        const isMarked = marked?.has(cellKey(characterId, slot)) === true;
        cell.classList.toggle("is-marked", isMarked);
        if (cell.hasAttribute("role")) {
          cell.setAttribute(
            "aria-pressed",
            String(
              highlight?.kind === "skill" &&
                highlight.skillId === cell.getAttribute("data-skill-id"),
            ),
          );
        } else {
          cell.removeAttribute("aria-pressed");
        }
      });
    }

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

  // A press anywhere else puts the problem list and Share away.
  const onPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Node)) {
      return;
    }
    if (!chip.element.contains(event.target)) {
      chip.close();
    }
    if (!shareWrap.contains(event.target)) {
      share.hide();
    }
  };
  document.addEventListener("pointerdown", onPointerDown);

  // A team code pasted anywhere but a field opens that team, unsaved
  // (#577); edits here are only discarded once the player says so. A
  // single build code is not a team, and is ignored.
  const stopPaste = listenForPaste((text) => {
    if (!looksLikeTeam(text)) {
      return false;
    }
    const result = importTeam(text, characters, () => crypto.randomUUID(), Date.now());
    if (!result.ok) {
      toast("Could not import", { problems: result.problems });
      return true;
    }
    if (!isTeamUnsaved(opened, team)) {
      callbacks.onImportTeam(result);
      return true;
    }
    ask(
      back,
      "Discard your edits and open the pasted team?",
      "Discard",
      () => {
        callbacks.onImportTeam(result);
      },
      "Keep editing",
    );
    return true;
  });

  return {
    leave,
    dispose() {
      disposed = true;
      document.removeEventListener("pointerdown", onPointerDown);
      stopPaste();
    },
  };
}

import {
  describeSkill,
  energyCostOf,
  getAttribute,
  getSkill,
  outsideMatch,
  type ProfessionId,
  type SkillType,
  type WeaponSetIndex,
} from "@vibewars/game-core";

import { SKILL_BAR_SLOTS, equippableSkills } from "../storage/build-validation.js";
import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamBuildSize,
  type TeamCharacter,
} from "../storage/schema.js";
import { exportTeam, importTeam, looksLikeTeam } from "../storage/team-transfer.js";
import {
  decodeDragSource,
  describeProfessionChange,
  equipSkill,
  mountAttributes,
  mountGear,
  mountGearLibrary,
  mountProfessions,
  setProfessions,
  type GearHost,
  type Region,
} from "./build-editor.js";
import { createCharacterDot } from "./character-figure.js";
import { characterRanks } from "./character-ranks.js";
import { equippedCount, professionLabel } from "./character-preview.js";
import { summariseGear } from "./gear-editor.js";
import { professionIcon, skillIconHtml } from "./icons.js";
import {
  button,
  h,
  inlineConfirm,
  listenForPaste,
  moreMenu,
  problemsChip,
  screenBar,
  shareLine,
  syncList,
  toast,
  type InlineConfirm,
} from "./kit.js";
import {
  dragSkill,
  moveMember,
  professionMix,
  replaceMember,
  teamCharacter,
  teamCounters,
  validateTeam,
  type TeamCounter,
  type TeamProblem,
  type ProfessionMixEntry,
  type TeamCounterId,
} from "./team-builder.js";
import { mountPaperDoll } from "./paper-doll.js";
import { teamSizeStepper } from "./rail.js";
import { mountSkillLibrary } from "./skill-library-view.js";
import { createSkillTooltip } from "./skill-tooltip.js";

/**
 * The team editor (#573, epic #554), mounted once per ADR-0030.
 *
 * Reorder, rename, and a character or a skill dragged onto a member
 * (#2225) change the team in memory and stay on screen; a team is always
 * its size, its members replaced, never added or taken off. Nothing is
 * stored until Save, which always stores, problems and all
 * (#2110), and leaves once it has stored (#1902). Esc with unsaved edits, and
 * Delete always, ask inline first. A member's name
 * opens them in the build editor, and the way back hands the editor its
 * own state again (#576), so nothing unsaved is lost on the trip. Share
 * copies the team as a code; a team code pasted here opens that team
 * instead, unsaved (#577). Every member is the team's own character
 * (#1452): blank, or a copy of one of the player's Solo characters.
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
  /** Store the team; the editor then says so and leaves through `onClose` (#1902). */
  readonly onSave: (team: StoredTeam) => Promise<void>;
  readonly onDuplicate: (team: StoredTeam) => void;
  readonly onDelete: (id: string) => void;
  /** Leave the editor, without storing anything. */
  readonly onClose: () => void;
  /** Open a member in the build editor; `state` is what to come back to. */
  readonly onOpenMember: (memberId: string, state: TeamEditorState) => void;
  /** Open a pasted team, unsaved (#577). */
  readonly onImportTeam: (team: StoredTeam) => void;
}

export interface TeamEditorView {
  /** Leave for `then`, as Esc does: unsaved edits ask first (#1268). */
  leave(then: () => void): void;
  dispose(): void;
}

/** Save's title (#2110): it always stores, and names the first problem that makes the team not playable. */
export function saveTitle(problems: readonly TeamEditorProblem[]): string {
  const first = problems.find((problem) => problem.blocking);
  return first === undefined ? "Save this team" : `Save this team (it has problems: ${first.text})`;
}

/** `value` as JSON with every object's keys sorted, to compare two builds. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${(value as readonly unknown[]).map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    // An undefined field is left out, as JSON.stringify leaves it out.
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Whether `current` differs from the team as it was opened or last saved:
 * its name, its order, or any member's build (#1452).
 */
export function isTeamUnsaved(opened: StoredTeam, current: StoredTeam): boolean {
  return opened.name !== current.name || canonical(opened.members) !== canonical(current.members);
}

/** One line of the problems chip, as a plain sentence. */
export interface TeamEditorProblem {
  readonly text: string;
  /** Whether it makes the team not playable: it saves, but cannot be proposed (#2110). */
  readonly blocking: boolean;
}

/** A message as a sentence: capitalised, with a full stop. */
function sentence(message: string): string {
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
}

/**
 * What makes this team not playable, in plain sentences (#573): `validateTeam`'s
 * problems. A team is always full (#2225): no empty slot to count.
 */
export function teamEditorProblems(team: StoredTeam): TeamEditorProblem[] {
  return validateTeam(team).map((problem): TeamEditorProblem => ({
    text:
      problem.message === "team name must not be empty"
        ? "Give the team a name."
        : sentence(problem.message),
    blocking: true,
  }));
}

/**
 * `team` with the member `memberId` replaced by a copy of the Solo
 * `character` (#1452, #2225), under the member's id: the two are apart
 * from here on, edits to either unseen by the other.
 */
export function copyOntoMember(
  team: StoredTeam,
  memberId: string,
  character: TeamCharacter,
): StoredTeam {
  return replaceMember(team, teamCharacter(character, memberId));
}

/** A member's maximum Health and Energy (#2225), with weapon set 1 in hand. */
export interface MemberStats {
  readonly health: number;
  readonly energy: number;
}

/** `character`'s stats as the Character Builder's stat panel reads them; none for no set 1. */
export function memberStats(character: TeamCharacter): MemberStats | undefined {
  const summary = summariseGear(character, 0);
  return summary === undefined
    ? undefined
    : { health: summary.maxHealth, energy: summary.maxEnergy };
}

/**
 * Why `skillId` may not be dropped on `member`'s bar (#2225), or
 * `undefined` when it may: a skill of another profession, or one already
 * on the bar. Another elite is no refusal: it takes the old one's place.
 */
export function skillDropRefusal(member: TeamCharacter, skillId: string): string | undefined {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    return "Not a skill in the game";
  }
  if (member.skillBar.includes(skillId)) {
    return `${skill.name} is already on ${member.name}'s bar`;
  }
  if (!equippableSkills(member).some((each) => each.id === skillId)) {
    return `${professionLabel(member.primaryProfession, member.secondaryProfession)} can't use ${skill.name}`;
  }
  return undefined;
}

/**
 * `team` with `skillId` equipped to `slot` of the member `memberId`
 * (#2225), by the Character Builder's rules, and what to tell the player;
 * a refused drop leaves the team as it was.
 */
export function dropSkill(
  team: StoredTeam,
  memberId: string,
  slot: number,
  skillId: string,
): { readonly team: StoredTeam; readonly notice: string | undefined } {
  const member = team.members.find((each) => each.character.id === memberId)?.character;
  if (member === undefined || skillDropRefusal(member, skillId) !== undefined) {
    return { team, notice: undefined };
  }
  const change = equipSkill(
    { ...member, schemaVersion: CHARACTER_SCHEMA_VERSION, updatedAt: Date.now() },
    slot,
    skillId,
  );
  return {
    team: replaceMember(team, teamCharacter(change.character, memberId)),
    notice: change.notice,
  };
}

/** The editor's team size title (#2109): the size a build was made at stays. */
export const TEAM_SIZE_FIXED = "A Team Build's size is fixed: make a new one for another size";

/** The team size stepper in the editor's bar (#2109, #2141), locked at the build's size. */
function lockedTeamSize(size: TeamBuildSize): HTMLElement {
  const field = h("div", "team-lobby-size");
  field.title = TEAM_SIZE_FIXED;
  field.append(
    h("span", "field-label", "Team size"),
    teamSizeStepper("teams", size, true, () => undefined),
  );
  return field;
}

/** A team grid cell's skill icon, in px (#2197). */
const TEAM_SKILL_ICON_PX = 32;

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
 * The team's professions as icons (#1785): per pair, its count when more
 * than one, then the primary's and the secondary's icons, their names on
 * hover; " · " between pairs.
 */
export function professionMixNodes(mix: readonly ProfessionMixEntry[]): (HTMLElement | string)[] {
  return mix.flatMap(({ count, primary, secondary }, index) => {
    const entry = h("span", "team-mix-entry");
    entry.title = professionLabel(primary, secondary);
    if (count > 1) {
      entry.appendChild(h("span", "team-mix-count", String(count)));
    }
    for (const profession of secondary === undefined ? [primary] : [primary, secondary]) {
      const icon = document.createElement("img");
      icon.className = "team-mix-icon";
      icon.src = professionIcon(profession);
      icon.alt = "";
      entry.appendChild(icon);
    }
    return index === 0 ? [entry] : [" · ", entry];
  });
}

/**
 * A member's eight bar slots as stored, `null` for an empty one (#574).
 * An illegal build still shows what it holds; `validateTeam` decides.
 */
export function memberSkillCells(character: TeamCharacter): (TeamSkillCell | null)[] {
  const ranks = characterRanks(character);
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
export function topAttributes(character: TeamCharacter): string[] {
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

/** A cell's key in `markedCells`: "<member id>:slot". */
export function cellKey(characterId: string, slot: number): string {
  return `${characterId}:${String(slot)}`;
}

/** The cells `highlight` marks, by `cellKey`; the rest of the grid dims. */
export function markedCells(
  highlight: TeamHighlight,
  counters: readonly TeamCounter[],
  team: StoredTeam,
): Set<string> {
  if (highlight.kind === "counter") {
    const counter = counters.find((c) => c.id === highlight.id);
    return new Set(counter?.cells.map((cell) => cellKey(cell.characterId, cell.slot)));
  }
  const marked = new Set<string>();
  for (const { character } of team.members) {
    character.skillBar.forEach((skillId, slot) => {
      if (skillId === highlight.skillId) {
        marked.add(cellKey(character.id, slot));
      }
    });
  }
  return marked;
}

/** The Team Builder's right panel tabs (#2225); Gear only while a member is open (#2226). */
type TeamPanelTab = "characters" | "skills" | "gear";

/** The tab last open, kept for this session (#2225). */
let lastPanelTab: TeamPanelTab = "characters";

/** What a Team Builder drag carries (#2225). */
type TeamDrag =
  | { readonly kind: "member"; readonly id: string }
  | { readonly kind: "character"; readonly id: string }
  | { readonly kind: "skill"; readonly skillId: string }
  | { readonly kind: "slot"; readonly id: string; readonly slot: number };

/** The list key of the open member's editor (#2226), which no character id is. */
const MEMBER_EDITOR_KEY = "member-editor";

/**
 * The team editor for `initial`; `characters` are the player's Solo
 * characters, offered to copy in.
 */
export function mountTeamEditor(
  root: HTMLElement,
  initial: TeamEditorState,
  characters: readonly StoredCharacter[],
  callbacks: TeamEditorCallbacks,
): TeamEditorView {
  let team = initial.team;
  const opened = initial.opened;
  const isStored = initial.stored;
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
    ask(save, "Discard changes?", "Discard", then, "Keep editing");
  };

  root.replaceChildren();
  const panel = h("div", "screen team-editor");

  // The name is the last crumb: the place is the team (#1902).
  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.setAttribute("aria-label", "team name");
  nameInput.placeholder = "Team name";
  nameInput.value = team.name;
  nameInput.addEventListener("input", () => {
    commit({ ...team, name: nameInput.value });
  });

  const chip = problemsChip([]);
  const unsaved = h("span", "editor-unsaved", "● unsaved");

  // Save is the way out (#1902): it stores, then leaves as Esc would.
  const save = button("Save", "primary", () => {
    save.disabled = true;
    callbacks.onSave({ ...team, updatedAt: Date.now() }).then(
      () => {
        if (disposed) {
          return;
        }
        // After leaving, which puts the last screen's toast away.
        callbacks.onClose();
        toast("Saved");
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
    share.show(exportTeam(team));
  });
  shareButton.title = "share this team as one line";
  const remove = button("Delete", "", () => {
    ask(
      more.toggle,
      `Delete ${team.name.trim() === "" ? "this team" : team.name}?`,
      "Delete",
      () => {
        callbacks.onDelete(team.id);
      },
      "Cancel",
    );
  });
  const more = moreMenu([shareButton, duplicate, remove], [share.element]);

  screenBar({
    crumbs: ["VibeWars", "Team Builder", nameInput],
    escape: () => {
      leave(callbacks.onClose);
    },
    status: [lockedTeamSize(team.size), chip.element, unsaved],
    actions: [save, more.element],
    // Esc puts away the ⋯ menu, Share and the problem list, then clears
    // the counter's marks, before it leaves.
    putAway: () => {
      if (more.isOpen()) {
        more.close();
        return true;
      }
      if (share.isOpen()) {
        share.hide();
        return true;
      }
      if (chip.isOpen()) {
        chip.close();
        return true;
      }
      if (doll.isOpen()) {
        doll.close();
        return true;
      }
      if (highlight !== undefined) {
        highlight = undefined;
        update();
        return true;
      }
      if (openMember !== undefined) {
        toggleOpen(openMember);
        return true;
      }
      return false;
    },
  });

  // What the bars hold; a counter marks its cells in the grid (#575).
  const counterBar = h("div", "team-counters");
  const counterButtons = new Map<TeamCounterId, HTMLButtonElement>();
  for (const counter of teamCounters([])) {
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
  // One skill tooltip for the grid (#2197); it is fixed, so it hides
  // rather than drift when the grid scrolls under it.
  const tooltip = createSkillTooltip();
  gridScroll.addEventListener("scroll", () => {
    tooltip.hide();
  });
  const list = h("div", "team-grid team-members");
  list.setAttribute("role", "list");
  gridScroll.appendChild(list);
  /** The member the Skills tab shows (#2225): the last row pressed, else the first. */
  let focused = team.members[0]?.character.id ?? "";
  const focusedMember = (): TeamCharacter => {
    const member = team.members.find((each) => each.character.id === focused) ?? team.members[0];
    if (member === undefined) {
      throw new Error("a team always has members");
    }
    return member.character;
  };

  // The right panel (#2225): My characters, to drag onto a member, or
  // the Skills library of the focused member, to drag onto a slot.
  const picker = h("aside", "team-picker");
  const tabs = h("div", "team-picker-tabs");
  tabs.setAttribute("role", "tablist");
  const charactersPane = h("div", "team-picker-pane team-picker-characters");
  const pickerHint = h("p", "team-picker-hint");
  const pickerList = h("div", "team-picker-list");
  const pickerEmpty = h("p", "team-picker-empty", "You have no characters to copy.");
  charactersPane.append(pickerHint, pickerList, pickerEmpty);
  const skillsPane = h("div", "team-picker-pane team-picker-skills skill-library");
  const skillsHint = h("p", "team-picker-hint");
  const library = mountSkillLibrary({
    current: () => focusedMember(),
    tooltip,
    showTip: (anchor, describe) => {
      const described = describe();
      if (described !== undefined) {
        tooltip.show(anchor, described);
      }
    },
    // No slot is picked here: Equip takes the focused member's first empty one.
    selected: () => undefined,
    equipTo: (skillId, slot) => {
      equipOn(focused, slot, skillId);
    },
    slotLabel: (slot) => `slot ${String(slot + 1)}`,
  });
  skillsPane.append(skillsHint, ...library.elements);
  const tabButtons = new Map<TeamPanelTab, HTMLButtonElement>();
  const openTab = (tab: TeamPanelTab): void => {
    lastPanelTab = tab;
    update();
  };
  for (const [tab, label] of [
    ["characters", "My characters"],
    ["skills", "Skills"],
    ["gear", "Gear"],
  ] as const) {
    const tabButton = button(label, "team-picker-tab", () => {
      openTab(tab);
    });
    tabButton.setAttribute("role", "tab");
    tabButtons.set(tab, tabButton);
    tabs.appendChild(tabButton);
  }
  const gearPane = h("div", "team-picker-pane team-picker-gear skill-library");
  picker.append(tabs, charactersPane, skillsPane, gearPane);
  body.append(gridScroll, picker);
  panel.appendChild(body);
  // Why a drop is refused, beside the slot (#2225): never colour alone.
  const dropReason = h("div", "team-drop-reason");
  dropReason.setAttribute("role", "status");
  dropReason.hidden = true;
  panel.appendChild(dropReason);

  /** Equip `skillId` to `slot` of member `memberId`, saying what an elite replaced. */
  const equipOn = (memberId: string, slot: number, skillId: string): void => {
    const dropped = dropSkill(team, memberId, slot, skillId);
    commit(dropped.team);
    if (dropped.notice !== undefined) {
      toast(dropped.notice);
    }
  };

  // What is being dragged: a row, to reorder; one of my characters, to
  // copy onto a member; a library skill, to equip on a slot; or a
  // member's skill, to move or copy to another slot (#2227).
  let dragging: TeamDrag | undefined;
  const showReason = (anchor: HTMLElement, text: string, refused: boolean): void => {
    const box = anchor.getBoundingClientRect();
    dropReason.textContent = text;
    dropReason.classList.toggle("is-refused", refused);
    dropReason.style.left = `${String(box.left)}px`;
    dropReason.style.top = `${String(box.bottom + 6)}px`;
    dropReason.hidden = false;
  };
  const endDrag = (): void => {
    dragging = undefined;
    dropReason.hidden = true;
    for (const node of Array.from(
      panel.querySelectorAll(".is-dragging, .is-drop-target, .is-drop-refused"),
    )) {
      node.classList.remove("is-dragging", "is-drop-target", "is-drop-refused");
    }
  };
  // Esc, or a drop anywhere else, ends a drag with nothing done.
  panel.addEventListener("dragend", endDrag);
  skillsPane.addEventListener("dragstart", (event: DragEvent) => {
    const source = decodeDragSource(event.dataTransfer?.getData("text/plain") ?? "");
    if (source?.from === "library") {
      dragging = { kind: "skill", skillId: source.skillId };
    }
  });
  const indexOfMember = (characterId: string): number =>
    team.members.findIndex((m) => m.character.id === characterId);
  const memberOf = (characterId: string): TeamCharacter | undefined =>
    team.members[indexOfMember(characterId)]?.character;
  // A member's skill dropped on `slot` of member `characterId` (#2227).
  const slotDrop = (
    drag: { readonly id: string; readonly slot: number },
    characterId: string,
    slot: number,
    copy: boolean,
  ): StoredTeam | TeamProblem =>
    dragSkill(
      team,
      { member: indexOfMember(drag.id), slot: drag.slot },
      { member: indexOfMember(characterId), slot },
      copy,
    );
  // What that drop would do, as the mockup's ghost says it.
  const slotDropText = (
    drag: { readonly id: string; readonly slot: number },
    characterId: string,
    slot: number,
    copy: boolean,
    dropped: StoredTeam | TeamProblem,
  ): string => {
    if ("message" in dropped) {
      return `⊘ ${dropped.message}`;
    }
    const where = `${memberOf(characterId)?.name ?? ""} slot ${String(slot + 1)}`;
    return copy && drag.id !== characterId
      ? `Shift: Copy to ${where} (stays on ${memberOf(drag.id)?.name ?? ""})`
      : `Move to ${where}`;
  };

  // One member at a time opens in place (#2226): its professions, name,
  // attributes and gear, by the Character Builder's own parts.
  let openMember: string | undefined;
  let weaponSet: WeaponSetIndex = 0;
  const openCharacter = (): StoredCharacter => {
    const member = memberOf(openMember ?? "");
    if (member === undefined) {
      throw new Error("no member is open");
    }
    return { ...member, schemaVersion: CHARACTER_SCHEMA_VERSION, updatedAt: Date.now() };
  };
  const commitMember = (next: StoredCharacter): void => {
    commit(replaceMember(team, teamCharacter(next, next.id)));
  };
  const host: GearHost & {
    readonly changeProfessions: (
      primary: ProfessionId,
      secondary: ProfessionId | undefined,
    ) => void;
  } = {
    current: openCharacter,
    commit: commitMember,
    // What new professions dropped is said, with an Undo, as the Character Builder does (#569).
    changeProfessions: (primary, secondary) => {
      const before = openCharacter();
      const after = setProfessions(before, primary, secondary);
      commitMember(after);
      const removed = describeProfessionChange(before, after);
      if (removed.length > 0) {
        toast(`Removed: ${removed.join(", ")}`, {
          undo: () => {
            commitMember(before);
          },
        });
      }
    },
    tooltip,
    weaponSet: () => weaponSet,
    selectWeaponSet: (set) => {
      weaponSet = set;
      update();
    },
    showLibrary: (_tab, group) => {
      openTab("gear");
      const heading = Array.from(gearPane.querySelectorAll<HTMLElement>(".skill-group")).find(
        (node) => node.dataset.group === group,
      );
      if (heading !== undefined) {
        gearLibrary.scroller.scrollTop +=
          heading.getBoundingClientRect().top - gearLibrary.scroller.getBoundingClientRect().top;
      }
    },
  };
  const gearLibrary = mountGearLibrary(host);
  gearPane.append(
    h("p", "team-picker-hint", "Drag a weapon or an off-hand onto the open member's hands."),
    ...gearLibrary.elements,
  );
  const memberEditor = h("div", "team-member-editor");
  memberEditor.setAttribute("role", "group");
  const identity = h("div", "team-member-editor-column");
  const professions = mountProfessions(host);
  const memberName = document.createElement("input");
  memberName.className = "team-member-name";
  memberName.setAttribute("aria-label", "member name");
  memberName.addEventListener("input", () => {
    commitMember({ ...openCharacter(), name: memberName.value });
  });
  identity.append(
    h("h4", "team-member-editor-heading", "Professions"),
    professions.element,
    h("h4", "team-member-editor-heading", "Name"),
    memberName,
  );
  const attributes = h("div", "team-member-editor-column");
  attributes.appendChild(h("h4", "team-member-editor-heading", "Attributes"));
  const equipment = h("div", "team-member-editor-column team-member-editor-equipment");
  const doll = mountPaperDoll(host);
  const regions: readonly Region[] = [
    professions,
    mountAttributes(attributes, host),
    mountGear(equipment, host, doll),
  ];
  // Opening it in the Character screen stays (#2226).
  equipment.appendChild(
    button("Open in the Character screen ›", "team-member-open", () => {
      if (openMember !== undefined) {
        asking?.dismiss();
        callbacks.onOpenMember(openMember, { opened, team, stored: isStored });
      }
    }),
  );
  memberEditor.append(identity, attributes, equipment);
  const fillMemberEditor = (): void => {
    const character = openCharacter();
    memberEditor.setAttribute("aria-label", `editing ${character.name}`);
    // Setting an unchanged value would still move the caret to the end.
    if (memberName.value !== character.name) {
      memberName.value = character.name;
    }
    for (const region of regions) {
      region.update(character);
    }
    gearLibrary.update(character);
  };
  /** Open `characterId` in place, closing the one open; or close it, if it is the one. */
  const toggleOpen = (characterId: string): void => {
    doll.close();
    weaponSet = 0;
    openMember = openMember === characterId ? undefined : characterId;
    if (openMember !== undefined) {
      // The Skills tab follows the member being edited.
      focused = openMember;
    }
    update();
  };

  const createRow = (characterId: string): HTMLElement => {
    const row = h("div", "team-row");
    row.setAttribute("role", "listitem");
    row.dataset.characterId = characterId;
    const indexOf = (): number => indexOfMember(characterId);
    row.addEventListener("pointerdown", () => {
      if (focused !== characterId) {
        focused = characterId;
        update();
      }
    });

    const order = h("span", "team-row-order");
    order.append(h("span", "team-row-handle", "⠿"));
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
    // Maximum Health and Energy, with set 1 in hand (#2225).
    const stats = h("span", "team-row-stats");
    stats.append(h("span", "team-row-health"), h("span", "team-row-energy"));
    const skills = h("span", "team-row-skills");
    for (let slot = 0; slot < SKILL_BAR_SLOTS; slot += 1) {
      const cell = h("span", "team-skill");
      cell.dataset.slot = String(slot);
      // A filled cell finds every copy of its skill on the team (#575).
      const find = (): void => {
        const skillId = cell.dataset.skillId;
        if (skillId !== undefined) {
          toggleHighlight({ kind: "skill", skillId });
        }
      };
      // The Character Builder's tooltip (#2197), at this member's ranks.
      const showTip = (): void => {
        const skill = getSkill(cell.dataset.skillId ?? "");
        const member = team.members[indexOf()];
        if (skill !== undefined && member !== undefined) {
          tooltip.show(cell, describeSkill(skill, characterRanks(member.character)));
        }
      };
      cell.addEventListener("mouseenter", showTip);
      cell.addEventListener("focus", showTip);
      cell.addEventListener("mouseleave", () => {
        tooltip.hide();
      });
      cell.addEventListener("blur", () => {
        tooltip.hide();
      });
      cell.addEventListener("click", find);
      cell.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          find();
        }
      });
      // A filled slot drags its skill to another (#2227): a move, or with
      // Shift onto another member a copy, Shift as it is at the drop.
      cell.addEventListener("dragstart", (event: DragEvent) => {
        event.stopPropagation();
        const skillId = cell.dataset.skillId;
        if (dragging !== undefined || skillId === undefined) {
          return;
        }
        tooltip.hide();
        dragging = { kind: "slot", id: characterId, slot };
        event.dataTransfer?.setData("text/plain", skillId);
        if (event.dataTransfer !== null) {
          event.dataTransfer.effectAllowed = "copyMove";
        }
        cell.classList.add("is-dragging");
      });
      // A library skill dropped here is equipped, if this member may
      // hold it: checked against this member, whoever the library shows.
      cell.addEventListener("dragover", (event: DragEvent) => {
        if (dragging?.kind === "slot") {
          const dropped = slotDrop(dragging, characterId, slot, event.shiftKey);
          const refused = "message" in dropped;
          cell.classList.toggle("is-drop-refused", refused);
          cell.classList.toggle("is-drop-target", !refused);
          if (!refused) {
            event.preventDefault();
          }
          showReason(
            cell,
            slotDropText(dragging, characterId, slot, event.shiftKey, dropped),
            refused,
          );
          return;
        }
        if (dragging?.kind !== "skill") {
          return;
        }
        const member = memberOf(characterId);
        const refusal =
          member === undefined ? "No member" : skillDropRefusal(member, dragging.skillId);
        cell.classList.toggle("is-drop-refused", refusal !== undefined);
        cell.classList.toggle("is-drop-target", refusal === undefined);
        if (refusal === undefined) {
          event.preventDefault();
          dropReason.hidden = true;
        } else {
          showReason(cell, `⊘ ${refusal}`, true);
        }
      });
      cell.addEventListener("dragleave", () => {
        cell.classList.remove("is-drop-target", "is-drop-refused");
        dropReason.hidden = true;
      });
      cell.addEventListener("drop", (event: DragEvent) => {
        if (dragging?.kind === "slot") {
          event.preventDefault();
          event.stopPropagation();
          const dropped = slotDrop(dragging, characterId, slot, event.shiftKey);
          endDrag();
          if (!("message" in dropped)) {
            commit(dropped);
          }
          return;
        }
        if (dragging?.kind !== "skill") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const { skillId } = dragging;
        endDrag();
        equipOn(characterId, slot, skillId);
      });
      skills.appendChild(cell);
    }
    const edit = button("✎", "team-row-edit", () => {
      toggleOpen(characterId);
    });
    row.append(order, who, stats, skills, edit);

    row.addEventListener("dragstart", (event: DragEvent) => {
      if (dragging !== undefined) {
        return;
      }
      dragging = { kind: "member", id: characterId };
      // Firefox starts no drag without data.
      event.dataTransfer?.setData("text/plain", characterId);
      if (event.dataTransfer !== null) {
        event.dataTransfer.effectAllowed = "move";
      }
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragover", (event: DragEvent) => {
      if (dragging?.kind === "member") {
        event.preventDefault();
        row.classList.toggle("is-drop-target", dragging.id !== characterId);
        return;
      }
      const drag = dragging;
      if (drag?.kind === "character") {
        event.preventDefault();
        row.classList.add("is-drop-target");
        const from = characters.find((c) => c.id === drag.id);
        const member = memberOf(characterId);
        if (from !== undefined && member !== undefined) {
          showReason(row, `Replace ${member.name} with ${from.name}`, false);
        }
      }
    });
    row.addEventListener("dragleave", (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) {
        row.classList.remove("is-drop-target");
      }
    });
    row.addEventListener("drop", (event: DragEvent) => {
      const drag = dragging;
      if (drag === undefined || drag.kind === "skill" || drag.kind === "slot") {
        return;
      }
      event.preventDefault();
      endDrag();
      if (drag.kind === "member") {
        commit(dragMember(team, indexOfMember(drag.id), indexOf()));
        return;
      }
      // Onto the member it was copied from, too: a fresh copy (#2225).
      const character = characters.find((c) => c.id === drag.id);
      if (character !== undefined) {
        focused = characterId;
        commit(copyOntoMember(team, characterId, character));
      }
    });
    return row;
  };

  /** Fill a row's eight cells from what the member's bar holds. */
  const fillSkills = (skills: Element, character: TeamCharacter): void => {
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
      if (cell === null) {
        node.title = "empty slot";
        delete node.dataset.skillId;
        node.removeAttribute("role");
        node.removeAttribute("tabindex");
        node.removeAttribute("aria-label");
        node.draggable = false;
        return;
      }
      // The icon alone (#2197): the tooltip carries name, cost and type.
      node.removeAttribute("title");
      node.dataset.skillId = cell.skillId;
      node.draggable = true;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", cell.name);
      node.tabIndex = 0;
      if (cell.type === undefined) {
        node.appendChild(h("span", "team-skill-name", cell.name));
      } else {
        node.insertAdjacentHTML("beforeend", skillIconHtml(cell.skillId, TEAM_SKILL_ICON_PX));
      }
    });
  };

  const createPick = (characterId: string): HTMLElement => {
    const pick = h("div", "team-pick");
    pick.dataset.characterId = characterId;
    pick.append(h("span", "team-row-dot"), h("span", "team-pick-text"));
    // Dragged onto a member, it replaces them with a copy (#2225).
    pick.draggable = true;
    pick.addEventListener("dragstart", (event: DragEvent) => {
      dragging = { kind: "character", id: characterId };
      event.dataTransfer?.setData("text/plain", characterId);
      if (event.dataTransfer !== null) {
        event.dataTransfer.effectAllowed = "copy";
      }
      pick.classList.add("is-dragging");
    });
    return pick;
  };

  /**
   * Put `character`'s ball in `holder`, unless it already shows this
   * build: what it holds turns on its whole build being legal.
   */
  const fillDot = (holder: Element | null, character: TeamCharacter): void => {
    if (!(holder instanceof HTMLElement)) {
      return;
    }
    const { name: _name, ...build } = character;
    const look = JSON.stringify(build);
    if (holder.dataset.look !== look) {
      holder.dataset.look = look;
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
    const problems = teamEditorProblems(team);
    chip.update(problems);
    unsaved.hidden = !isTeamUnsaved(opened, team);
    // Save always stores (#2110): a team with problems is only not playable.
    save.disabled = false;
    save.title = saveTitle(problems);
    duplicate.disabled = !isStored || isTeamUnsaved(opened, team);
    duplicate.title = duplicate.disabled ? "Save first to duplicate" : "duplicate this team";
    // A new team has nothing to delete: Esc leaves it.
    remove.disabled = !isStored;

    if (openMember !== undefined && memberOf(openMember) === undefined) {
      openMember = undefined;
    }
    syncList(
      list,
      team.members.flatMap((member) =>
        member.character.id === openMember
          ? [member.character.id, MEMBER_EDITOR_KEY]
          : [member.character.id],
      ),
      (key) => key,
      (key) => (key === MEMBER_EDITOR_KEY ? memberEditor : createRow(key)),
      (row, characterId) => {
        if (characterId === MEMBER_EDITOR_KEY) {
          fillMemberEditor();
          return;
        }
        const index = indexOfMember(characterId);
        const character = team.members[index]?.character;
        if (character === undefined) {
          return;
        }
        const setText = (selector: string, text: string): void => {
          const node = row.querySelector(selector);
          if (node !== null && node.textContent !== text) {
            node.textContent = text;
          }
        };
        setText(".team-row-name", character.name);
        const name = row.querySelector<HTMLButtonElement>(".team-row-name");
        if (name !== null) {
          name.title = `edit ${character.name} in the build editor`;
        }
        row.draggable = true;
        fillDot(row.querySelector(".team-row-dot"), character);
        row.classList.toggle("is-focused", characterId === focused);
        row.classList.toggle("is-open", characterId === openMember);
        const edit = row.querySelector<HTMLButtonElement>(".team-row-edit");
        if (edit !== null) {
          edit.setAttribute("aria-expanded", String(characterId === openMember));
          edit.setAttribute(
            "aria-label",
            characterId === openMember ? `close ${character.name}` : `edit ${character.name} here`,
          );
        }
        const stats = memberStats(character);
        setText(".team-row-health", stats === undefined ? "–" : String(stats.health));
        setText(".team-row-energy", stats === undefined ? "–" : String(stats.energy));
        row.querySelector(".team-row-health")?.setAttribute("title", "maximum Health");
        row.querySelector(".team-row-energy")?.setAttribute("title", "maximum Energy");
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
      },
    );

    const counters = teamCounters(team.members);
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
    mix.replaceChildren(...professionMixNodes(professionMix(team.members)));
    const marked = highlight === undefined ? undefined : markedCells(highlight, counters, team);
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

    // Gear has a member to equip only while one is open.
    const shownTab = lastPanelTab === "gear" && openMember === undefined ? "skills" : lastPanelTab;
    for (const [tab, tabButton] of tabButtons) {
      tabButton.setAttribute("aria-selected", String(tab === shownTab));
      tabButton.classList.toggle("is-active", tab === shownTab);
    }
    const gearTab = tabButtons.get("gear");
    if (gearTab !== undefined) {
      gearTab.hidden = openMember === undefined;
    }
    charactersPane.hidden = shownTab !== "characters";
    skillsPane.hidden = shownTab !== "skills";
    gearPane.hidden = shownTab !== "gear";
    const member = focusedMember();
    skillsHint.textContent = `Showing ${member.name}: drag a skill onto any member's slot.`;
    library.update(member);
    pickerHint.textContent = `${String(characters.length)} ${characters.length === 1 ? "character" : "characters"} · drag one onto a member to copy it there`;
    pickerHint.hidden = characters.length === 0;
    pickerEmpty.hidden = characters.length > 0;
    syncList(
      pickerList,
      characters.map((character) => character.id),
      (characterId) => characterId,
      createPick,
      (pick, characterId) => {
        const character = characters.find((c) => c.id === characterId);
        if (character === undefined) {
          return;
        }
        fillDot(pick.querySelector(".team-row-dot"), character);
        pick.title = `drag onto a member to replace them with a copy of ${character.name}`;
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
      },
    );
  }

  function commit(next: StoredTeam): void {
    team = next;
    update();
  }

  update();

  // A press anywhere else puts the problem list, ⋯ and Share away.
  const onPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Node)) {
      return;
    }
    if (!chip.element.contains(event.target)) {
      chip.close();
    }
    if (!more.element.contains(event.target)) {
      more.close();
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
    const result = importTeam(text, () => crypto.randomUUID(), Date.now());
    if (!result.ok) {
      toast("Could not import", { problems: result.problems });
      return true;
    }
    if (!isTeamUnsaved(opened, team)) {
      callbacks.onImportTeam(result.team);
      return true;
    }
    ask(
      save,
      "Discard your edits and open the pasted team?",
      "Discard",
      () => {
        callbacks.onImportTeam(result.team);
      },
      "Keep editing",
    );
    return true;
  });

  return {
    leave,
    dispose() {
      disposed = true;
      doll.close();
      library.dispose();
      tooltip.dispose();
      document.removeEventListener("pointerdown", onPointerDown);
      stopPaste();
    },
  };
}

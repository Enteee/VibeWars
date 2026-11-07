import {
  describeSkill,
  energyCostOf,
  getAttribute,
  getSkill,
  outsideMatch,
  type SkillType,
} from "@vibewars/game-core";

import { t } from "../i18n/index.js";
import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamBuildSize,
  type TeamCharacter,
} from "../storage/schema.js";
import { exportTeam, importTeam, looksLikeTeam } from "../storage/team-transfer.js";
import {
  mountAttributes,
  mountGear,
  mountProfessions,
  mountSkillBar,
  type BuildHost,
  type GearHost,
  type ProfessionsHost,
  type Region,
} from "./build-editor.js";
import { mountBuildPicker } from "./build-picker.js";
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
  moveMember,
  professionMix,
  replaceMember,
  teamCharacter,
  teamCounters,
  validateTeam,
  type TeamCounter,
  type ProfessionMixEntry,
  type TeamCounterId,
} from "./team-builder.js";
import { mountPaperDoll } from "./paper-doll.js";
import { teamSizeStepper } from "./rail.js";
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
  return first === undefined
    ? t("teamEditor.saveTitle")
    : t("teamEditor.saveTitleProblem", { problem: first.text });
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

/**
 * What makes this team not playable, in plain sentences (#573): `validateTeam`'s
 * problems. A team is always full (#2225): no empty slot to count.
 */
export function teamEditorProblems(team: StoredTeam): TeamEditorProblem[] {
  return validateTeam(team).map((problem): TeamEditorProblem => ({
    text: problem.sentence,
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

/** The team size stepper in the editor's bar (#2109, #2141), locked at the build's size. */
function lockedTeamSize(size: TeamBuildSize): HTMLElement {
  const field = h("div", "team-lobby-size");
  // The size a build was made at stays (#2109).
  field.title = t("teamEditor.sizeFixed");
  field.append(
    h("span", "field-label", t("teamEditor.sizeLabel")),
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
          ? t("teamEditor.costAdrenaline", { amount: skill.cost.amount })
          : t("teamEditor.costEnergy", { amount: energyCostOf(skill, outsideMatch(ranks)) });
    return { skillId, name: skill.name, type: skill.type, cost, elite: skill.elite };
  });
}

/** A member's three highest attribute ranks, highest first: "Strength 12". */
export function topAttributes(character: Pick<TeamCharacter, "attributes">): string[] {
  return character.attributes
    .filter((attribute) => attribute.rank > 0)
    .map((attribute, order) => ({ attribute, order }))
    .sort((a, b) => b.attribute.rank - a.attribute.rank || a.order - b.order)
    .slice(0, 3)
    .map(({ attribute }) =>
      t("teamEditor.attributeRank", {
        attribute: getAttribute(attribute.attributeId)?.name ?? attribute.attributeId,
        rank: attribute.rank,
      }),
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

/** A member row's open/close button (#2536): ▼ while closed, ▲ while open. */
export interface MemberToggle {
  readonly glyph: "▼" | "▲";
  readonly expanded: boolean;
  readonly label: string;
}

/** `character`'s open/close button, with `openMember` the one open, if any. */
export function memberToggle(
  character: TeamCharacter,
  openMember: string | undefined,
): MemberToggle {
  const open = character.id === openMember;
  return {
    glyph: open ? "▲" : "▼",
    expanded: open,
    label: t(open ? "teamEditor.closeMember" : "teamEditor.editMember", { name: character.name }),
  };
}

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

/** The right panel's tab last open, kept for this session (#2225): My characters first. */
let lastPanelTab = "characters";

/** What a Team Builder drag carries (#2225). */
type TeamDrag =
  | { readonly kind: "member"; readonly id: string }
  | { readonly kind: "character"; readonly id: string };

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
    ask(
      save,
      t("teamEditor.discardChanges"),
      t("teamEditor.discard"),
      then,
      t("teamEditor.keepEditing"),
    );
  };

  root.replaceChildren();
  const panel = h("div", "screen team-editor");

  // The name is the last crumb: the place is the team (#1902).
  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.setAttribute("aria-label", t("teamEditor.teamNameLabel"));
  nameInput.placeholder = t("teamEditor.teamName");
  nameInput.value = team.name;
  nameInput.addEventListener("input", () => {
    commit({ ...team, name: nameInput.value });
  });

  const chip = problemsChip([]);
  const unsaved = h("span", "editor-unsaved", t("teamEditor.unsaved"));

  // Save is the way out (#1902): it stores, then leaves as Esc would.
  const save = button(t("teamEditor.save"), "primary", () => {
    save.disabled = true;
    callbacks.onSave({ ...team, updatedAt: Date.now() }).then(
      () => {
        if (disposed) {
          return;
        }
        // After leaving, which puts the last screen's toast away.
        callbacks.onClose();
        toast(t("teamEditor.saved"));
      },
      (error: unknown) => {
        if (disposed) {
          return;
        }
        toast(
          t("teamEditor.notSaved", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        update();
      },
    );
  });
  // Duplicate copies the stored team: with edits pending it would store
  // them unchecked, under the copy, and drop them from this one.
  const duplicate = button(t("teamEditor.duplicate"), "", () => {
    callbacks.onDuplicate(team);
  });
  // Share (#577): the team, every build inline, as one line with Copy.
  const share = shareLine(t("teamEditor.shareLabel"));
  const shareButton = button(t("teamEditor.share"), "", () => {
    share.show(exportTeam(team));
  });
  shareButton.title = t("teamEditor.shareTitle");
  const remove = button(t("teamEditor.delete"), "", () => {
    ask(
      more.toggle,
      team.name.trim() === ""
        ? t("teamEditor.deleteUnnamed")
        : t("teamEditor.deleteNamed", { name: team.name }),
      t("teamEditor.delete"),
      () => {
        callbacks.onDelete(team.id);
      },
      t("teamEditor.cancel"),
    );
  });
  const more = moreMenu([shareButton, duplicate, remove], [share.element]);

  screenBar({
    crumbs: ["VibeWars", t("teamEditor.crumb"), nameInput],
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
  mix.title = t("teamEditor.professionsTitle");
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
  body.appendChild(gridScroll);
  /** The member the Skills tab shows (#2225): the last row pressed, else the first. */
  let focused = team.members[0]?.character.id ?? "";
  const focusedMember = (): TeamCharacter => {
    const member = team.members.find((each) => each.character.id === focused) ?? team.members[0];
    if (member === undefined) {
      throw new Error("a team always has members");
    }
    return member.character;
  };

  // The right panel (#2225): My characters, to drag onto a member, and
  // the build picker (#2565) on the focused member: its Skills to drag
  // onto any member's slot, its Gear for the open member.
  const charactersPane = h("div", "team-picker-pane team-picker-characters");
  const pickerList = h("div", "team-picker-list");
  const pickerEmpty = h("p", "team-picker-empty", t("teamEditor.noCharacters"));
  charactersPane.append(pickerList, pickerEmpty);
  const indexOfMember = (characterId: string): number =>
    team.members.findIndex((m) => m.character.id === characterId);
  const memberOf = (characterId: string): TeamCharacter | undefined =>
    team.members[indexOfMember(characterId)]?.character;
  /** `member` as the build editor's parts take it. */
  const stored = (member: TeamCharacter): StoredCharacter => ({
    ...member,
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    updatedAt: Date.now(),
  });

  // One member at a time opens in place (#2226): its professions, name,
  // attributes, skill bar and gear, by the Character Builder's own parts.
  let openMember: string | undefined;
  /** The slot of the open member's bar picked for the next equip (#564), if any. */
  let selected: number | undefined;
  const commitMember = (next: StoredCharacter): void => {
    const before = memberOf(next.id);
    // New professions let the picked slot go, as the Character Builder does.
    if (
      before?.primaryProfession !== next.primaryProfession ||
      before.secondaryProfession !== next.secondaryProfession
    ) {
      selected = undefined;
    }
    commit(replaceMember(team, teamCharacter(next, next.id)));
  };
  const openCharacter = (): StoredCharacter => {
    const member = memberOf(openMember ?? "");
    if (member === undefined) {
      throw new Error("no member is open");
    }
    return stored(member);
  };
  const openHost: BuildHost = { current: openCharacter, commit: commitMember };
  const picker = mountBuildPicker<TeamCharacter>(body, {
    current: () => stored(focusedMember()),
    commit: commitMember,
    bars: () => team.members.map((member) => member.character),
    shown: () => indexOfMember(focusedMember().id),
    commitBars: (bars, notice) => {
      commit({
        ...team,
        members: bars.map((character) => ({ character })),
        updatedAt: Date.now(),
      });
      if (notice !== undefined) {
        toast(notice);
      }
    },
    // A slot is picked on the open member's bar, and only it takes the pick.
    selected: () => (openMember !== undefined && focused === openMember ? selected : undefined),
    select: (slot) => {
      selected = slot;
      if (openMember !== undefined) {
        focused = openMember;
      }
      update();
    },
    refresh: update,
    tooltip,
    extraTabs: [{ id: "characters", label: t("teamEditor.myCharacters"), element: charactersPane }],
    tab: lastPanelTab,
    onTab: (tab) => {
      lastPanelTab = tab;
    },
    keysBlocked: () => asking?.isOpen() === true,
    // Gear is the open member's alone (#2226), and not offered with none open.
    gearOwner: () => (openMember === undefined ? undefined : openHost),
  });
  picker.element.classList.add("team-picker");
  panel.appendChild(body);

  // What is being dragged: a row, to reorder; or one of my characters, to
  // copy onto a member. Skills drag by the build picker's rules.
  let dragging: TeamDrag | undefined;
  const endDrag = (): void => {
    dragging = undefined;
    picker.hideReason();
    for (const node of Array.from(
      panel.querySelectorAll(
        ".team-row.is-dragging, .team-pick.is-dragging, .team-row.is-drop-target",
      ),
    )) {
      node.classList.remove("is-dragging", "is-drop-target");
    }
  };
  // Esc, or a drop anywhere else, ends a drag with nothing done.
  panel.addEventListener("dragend", endDrag);

  const host: GearHost & ProfessionsHost = {
    ...openHost,
    // What new professions dropped is said, with an Undo, as the Character Builder does (#569).
    changeProfessions: (primary, secondary) => {
      picker.changeProfessions(openHost, primary, secondary);
    },
    tooltip,
    weaponSet: () => picker.weaponSet(),
    selectWeaponSet: (set) => {
      picker.selectWeaponSet(set);
    },
    showLibrary: (tab, group) => {
      picker.showLibrary(tab, group);
    },
  };
  const memberEditor = h("div", "team-member-editor");
  memberEditor.setAttribute("role", "group");
  const identity = h("div", "team-member-editor-column");
  const professions = mountProfessions(host);
  const memberName = document.createElement("input");
  memberName.className = "team-member-name";
  memberName.setAttribute("aria-label", t("teamEditor.memberName"));
  memberName.addEventListener("input", () => {
    commitMember({ ...openCharacter(), name: memberName.value });
  });
  identity.append(
    h("h4", "team-member-editor-heading", t("teamEditor.professions")),
    professions.element,
    h("h4", "team-member-editor-heading", t("teamEditor.name")),
    memberName,
  );
  const attributes = h("div", "team-member-editor-column");
  attributes.appendChild(h("h4", "team-member-editor-heading", t("teamEditor.attributes")));
  const equipment = h("div", "team-member-editor-column team-member-editor-equipment");
  const bar = h("div", "team-member-editor-column team-member-editor-bar");
  const doll = mountPaperDoll(host);
  const regions: readonly Region[] = [
    professions,
    mountAttributes(attributes, host),
    mountSkillBar(bar, {
      ...openHost,
      tooltip,
      // An elite's notice is a toast here, as for a drop on the grid.
      notice: () => undefined,
      selected: () => selected,
      select: (slot) => {
        selected = slot;
        focused = openMember ?? focused;
        update();
      },
      picker,
      bindSlot: (cell, slot) => {
        picker.bindSlot(cell, () => ({ member: indexOfMember(openMember ?? ""), slot }));
      },
    }),
    mountGear(equipment, host, doll),
  ];
  // Opening it in the Character screen stays (#2226).
  equipment.appendChild(
    button(t("teamEditor.openInCharacter"), "team-member-open", () => {
      if (openMember !== undefined) {
        asking?.dismiss();
        callbacks.onOpenMember(openMember, { opened, team, stored: isStored });
      }
    }),
  );
  memberEditor.append(identity, attributes, equipment, bar);
  const fillMemberEditor = (): void => {
    const character = openCharacter();
    memberEditor.setAttribute("aria-label", t("teamEditor.editing", { name: character.name }));
    // Setting an unchanged value would still move the caret to the end.
    if (memberName.value !== character.name) {
      memberName.value = character.name;
    }
    for (const region of regions) {
      region.update(character);
    }
  };
  /** Open `characterId` in place, closing the one open; or close it, if it is the one. */
  const toggleOpen = (characterId: string): void => {
    doll.close();
    openMember = openMember === characterId ? undefined : characterId;
    if (openMember !== undefined) {
      // The libraries follow the member being edited.
      focused = openMember;
    }
    picker.selectWeaponSet(0);
  };

  const createRow = (characterId: string): HTMLElement => {
    const row = h("div", "team-row");
    row.setAttribute("role", "listitem");
    row.dataset.characterId = characterId;
    const indexOf = (): number => indexOfMember(characterId);
    row.addEventListener("pointerdown", () => {
      if (focused !== characterId) {
        focused = characterId;
        // A pick is on the open member's bar: off it, it is let go.
        if (characterId !== openMember) {
          selected = undefined;
        }
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
      // A filled slot drags its skill to another member's (#2227), and a
      // library skill drops here (#2225), by the build picker's rules:
      // checked against this member, whoever the library shows.
      picker.bindSlot(cell, () => ({ member: indexOf(), slot }));
      skills.appendChild(cell);
    }
    const edit = button("▼", "team-row-edit", () => {
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
          picker.showReason(
            row,
            t("teamEditor.replaceMember", { member: member.name, character: from.name }),
            false,
          );
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
      if (drag === undefined) {
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
        node.title = t("teamEditor.emptySlot");
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
    duplicate.title = t(
      duplicate.disabled ? "teamEditor.duplicateUnsaved" : "teamEditor.duplicateTitle",
    );
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
          name.title = t("teamEditor.editInBuilder", { name: character.name });
        }
        row.draggable = true;
        fillDot(row.querySelector(".team-row-dot"), character);
        row.classList.toggle("is-focused", characterId === focused);
        row.classList.toggle("is-open", characterId === openMember);
        const edit = row.querySelector<HTMLButtonElement>(".team-row-edit");
        if (edit !== null) {
          const toggle = memberToggle(character, openMember);
          edit.textContent = toggle.glyph;
          edit.setAttribute("aria-expanded", String(toggle.expanded));
          edit.setAttribute("aria-label", toggle.label);
        }
        const stats = memberStats(character);
        setText(".team-row-health", stats === undefined ? "–" : String(stats.health));
        setText(".team-row-energy", stats === undefined ? "–" : String(stats.energy));
        row.querySelector(".team-row-health")?.setAttribute("title", t("teamEditor.maxHealth"));
        row.querySelector(".team-row-energy")?.setAttribute("title", t("teamEditor.maxEnergy"));
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

    picker.update();
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
        pick.title = t("teamEditor.dragToReplace", { name: character.name });
        const text = pick.querySelector(".team-pick-text");
        if (text !== null) {
          text.replaceChildren(
            h("span", "team-pick-name", character.name),
            h(
              "span",
              "team-pick-sub",
              t("character.skillsLine", {
                professions: professionLabel(
                  character.primaryProfession,
                  character.secondaryProfession,
                ),
                equipped: equippedCount(character),
                slots: SKILL_BAR_SLOTS,
              }),
            ),
          );
        }
      },
    );
  }

  function commit(next: StoredTeam): void {
    // Any edit lets the last profession change's Undo go (#569).
    picker.dropUndo();
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
      t("teamEditor.discardForPaste"),
      t("teamEditor.discard"),
      () => {
        callbacks.onImportTeam(result.team);
      },
      t("teamEditor.keepEditing"),
    );
    return true;
  });

  return {
    leave,
    dispose() {
      disposed = true;
      doll.close();
      picker.destroy();
      tooltip.dispose();
      document.removeEventListener("pointerdown", onPointerDown);
      stopPaste();
    },
  };
}

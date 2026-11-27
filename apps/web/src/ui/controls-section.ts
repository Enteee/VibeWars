import { t, type MessageKey } from "../i18n/index.js";
import { loadLayoutLabeller, type KeyLabeller } from "../input/key-labels.js";
import {
  KEYMAP_PRESETS,
  KEY_ACTIONS,
  MODIFIERS,
  SINGLE_KEY_ACTIONS,
  SKILL_ACTIONS,
  WEAPON_SET_ACTIONS,
  actionForBinding,
  bindingLabel,
  codeLabel,
  isBindable,
  isModifierCode,
  isReservedCombo,
  modsOf,
  presetOf,
  rebind,
  sameBinding,
  type KeyAction,
  type KeyBinding,
  type KeyPress,
  type Keymap,
  type Modifier,
} from "../input/keymap.js";
import { loadKeymap, saveKeymap } from "../input/keymap-preference.js";

import type { OptionsSection } from "./options-sections.js";
import { h } from "./kit.js";

/**
 * Controls (#309, #423): pick a preset, or rebind any action, and every
 * change is saved at once. A section of the Options screen, not an overlay
 * in a match; the next match or Training Ground session plays the new map.
 *
 * `KeysEditor` holds the rules and is plain data, so they are tested
 * without a DOM; `controlsSection` only draws it and forwards keys.
 */

export const ACTION_NAMES: Readonly<Record<KeyAction, MessageKey>> = {
  "skill-1": "controls.skill1",
  "skill-2": "controls.skill2",
  "skill-3": "controls.skill3",
  "skill-4": "controls.skill4",
  "skill-5": "controls.skill5",
  "skill-6": "controls.skill6",
  "skill-7": "controls.skill7",
  "skill-8": "controls.skill8",
  "move-up": "controls.moveUp",
  "move-down": "controls.moveDown",
  "move-left": "controls.moveLeft",
  "move-right": "controls.moveRight",
  "target-next": "controls.targetNext",
  "target-closest": "controls.targetClosest",
  "target-called": "controls.targetCalled",
  "target-self": "controls.targetSelf",
  attack: "controls.attack",
  "call-target": "controls.callTarget",
  ping: "controls.ping",
  "show-names": "controls.showNames",
  mute: "controls.mute",
  "weapon-set-1": "controls.weaponSet1",
  "weapon-set-2": "controls.weaponSet2",
  "weapon-set-3": "controls.weaponSet3",
  "weapon-set-4": "controls.weaponSet4",
  "drop-bundle": "controls.dropBundle",
};

export const PRESET_NAMES: Readonly<Record<keyof typeof KEYMAP_PRESETS, MessageKey>> = {
  classic: "controls.presetClassic",
  vibewars: "controls.presetVibeWars",
};

/** One key cell: an action's primary (0) or secondary (1). */
export interface KeyCell {
  readonly action: KeyAction;
  readonly index: 0 | 1;
}

/** The modifier a modifier key is, or `undefined` for Meta and any other key. */
function modifierOf(code: string): Modifier | undefined {
  return code.startsWith("Shift")
    ? "shift"
    : code.startsWith("Control")
      ? "ctrl"
      : code.startsWith("Alt")
        ? "alt"
        : undefined;
}

const MOVE_ACTIONS: readonly KeyAction[] = ["move-up", "move-down", "move-left", "move-right"];

/** The muted warning on a row with no key, or "" when it needs none. */
export function noKeyWarning(map: Keymap, action: KeyAction): string {
  if (map[action].length > 0) {
    return "";
  }
  if (MOVE_ACTIONS.includes(action)) {
    return t("controls.noKeyWalk");
  }
  return SKILL_ACTIONS.includes(action) ? t("controls.noKey") : "";
}

export class KeysEditor {
  #map: Keymap;
  #capturing: KeyCell | undefined;
  /**
   * The modifier keys held while a cell waits (#4183), by modifier: a key
   * pressed with them binds the combination, and letting the last go with
   * none pressed binds that modifier alone.
   */
  readonly #held = new Map<Modifier, string>();
  /** A key was pressed while modifiers were held, so letting them go binds nothing. */
  #heldUsed = false;
  #line = "";
  #flashed: KeyCell | undefined;
  readonly #save: (map: Keymap) => void;
  /** How a code reads; swapped once the layout is known. */
  label: KeyLabeller;

  /** @param save called with the new map on every change */
  constructor(map: Keymap, save: (map: Keymap) => void, label: KeyLabeller = codeLabel) {
    this.#map = map;
    this.#save = save;
    this.label = label;
  }

  get map(): Keymap {
    return this.#map;
  }

  /** The cell waiting for a key, if one is. */
  get capturing(): KeyCell | undefined {
    return this.#capturing;
  }

  /** The line under the table: why a key was refused, or what moved. */
  get line(): string {
    return this.#line;
  }

  /** The cell the last bind emptied, which flashes once. */
  get flashed(): KeyCell | undefined {
    return this.#flashed;
  }

  /** The picker's choice: a preset's id, or "custom". */
  get preset(): keyof typeof KEYMAP_PRESETS | "custom" {
    return presetOf(this.#map) ?? "custom";
  }

  /** What a cell shows: its key, "press a key...", or "-". */
  cellText(cell: KeyCell): string {
    if (this.#isCapturing(cell)) {
      const held = MODIFIERS.filter((mod) => this.#held.has(mod));
      return held.length === 0
        ? t("controls.pressAKey")
        : t("controls.combo", {
            mods: held.map((mod) => this.#modLabel(mod)).join(" + "),
            key: "…",
          });
    }
    const binding = this.#map[cell.action][cell.index];
    return binding === undefined ? "-" : this.#bindingLabel(binding);
  }

  /**
   * What a Previous target cell shows (#3630): Shift with that Next target
   * key, which cycles backwards. With no first key, "no key"; a Shift key
   * cannot be held with itself, a combination takes no more, and Shift
   * with a key bound to something else is that (#4183), so each reads
   * "no key" too.
   */
  previousTargetText(index: 0 | 1): string {
    const next = this.#map["target-next"][index];
    if (next === undefined) {
      return index === 0 ? t("controls.noKey") : "";
    }
    const shifted: KeyBinding = { code: next.code, mods: ["shift"] };
    return next.mods.length > 0 ||
      isModifierCode(next.code) ||
      actionForBinding(this.#map, shifted) !== undefined
      ? t("controls.noKey")
      : this.#bindingLabel(shifted);
  }

  choosePreset(name: keyof typeof KEYMAP_PRESETS): void {
    this.#capturing = undefined;
    this.#letGo();
    this.#flashed = undefined;
    this.#line = "";
    this.#change(KEYMAP_PRESETS[name]);
  }

  /**
   * Wait for a key for `cell`. Asking again for the cell already waiting
   * changes nothing, so the Enter that a refused press lets through to
   * the button does not wipe the line saying why.
   */
  startCapture(cell: KeyCell): void {
    if (this.#isCapturing(cell)) {
      return;
    }
    this.#capturing = cell;
    this.#letGo();
    this.#flashed = undefined;
    this.#line = "";
  }

  /**
   * A keydown while a cell waits. Esc cancels; Backspace or Delete with
   * no modifier clears; Shift, Ctrl or Alt waits for the key held with it
   * (#4183); a bindable key or combination binds; anything else binds
   * nothing and says why, and the cell keeps waiting.
   *
   * @returns whether the press was used, and so is the game's to swallow;
   *   a refused one stays the browser's
   */
  press(key: KeyPress): boolean {
    const cell = this.#capturing;
    if (cell === undefined) {
      return false;
    }
    if (key.code === "Escape") {
      this.#capturing = undefined;
      this.#letGo();
      return true;
    }
    const modifier = modifierOf(key.code);
    if (key.metaKey || (modifier === undefined && isModifierCode(key.code))) {
      this.#line = t("controls.shortcutRefusal");
      return false;
    }
    if (modifier !== undefined) {
      this.#held.set(modifier, key.code);
      this.#line = "";
      return true;
    }
    this.#heldUsed = this.#held.size > 0;
    const mods = modsOf(key);
    if (mods.length === 0 && (key.code === "Backspace" || key.code === "Delete")) {
      this.#bind(cell, null);
      return true;
    }
    if (!isBindable(key.code)) {
      this.#line = t("controls.browserKey", { key: this.label(key.code) });
      return false;
    }
    const binding: KeyBinding = { code: key.code, mods };
    if (mods.length > 0 && SINGLE_KEY_ACTIONS.includes(cell.action)) {
      this.#line = t("controls.noComboHere");
      return false;
    }
    if (isReservedCombo(binding)) {
      this.#line = t("controls.reservedCombo", { combo: this.#bindingLabel(binding) });
      return false;
    }
    this.#bind(cell, binding);
    return true;
  }

  /**
   * A keyup while a cell waits (#4183): letting the last modifier go with
   * no key pressed binds it alone, where it may be bound alone (Shift);
   * Ctrl and Alt alone are the browser's.
   *
   * @returns whether the release was used
   */
  release(key: Pick<KeyboardEvent, "code">): boolean {
    const cell = this.#capturing;
    const modifier = modifierOf(key.code);
    if (cell === undefined || modifier === undefined || !this.#held.has(modifier)) {
      return false;
    }
    this.#held.delete(modifier);
    if (this.#held.size > 0) {
      return true;
    }
    const used = this.#heldUsed;
    this.#heldUsed = false;
    if (used) {
      return true;
    }
    if (!isBindable(key.code)) {
      this.#line = t("controls.browserKey", { key: this.label(key.code) });
      return false;
    }
    this.#bind(cell, { code: key.code, mods: [] });
    return true;
  }

  /** Forget the modifiers held, as when the window loses the keys' keyups. */
  letGoModifiers(): void {
    this.#letGo();
  }

  #letGo(): void {
    this.#held.clear();
    this.#heldUsed = false;
  }

  #modLabel(mod: Modifier): string {
    return t(mod === "ctrl" ? "keys.control" : mod === "alt" ? "keys.alt" : "keys.shift");
  }

  #bindingLabel(binding: KeyBinding): string {
    return bindingLabel(binding, false, this.label);
  }

  #bind(cell: KeyCell, binding: KeyBinding | null): void {
    const { map, displaced } = rebind(this.#map, cell.action, cell.index, binding);
    this.#capturing = undefined;
    this.#letGo();
    this.#flashed = undefined;
    this.#line = "";
    if (displaced !== undefined) {
      const index =
        this.#map[displaced.action].findIndex((bound) => sameBinding(bound, displaced.binding)) ===
        0
          ? 0
          : 1;
      this.#flashed = { action: displaced.action, index };
      const name = t(ACTION_NAMES[displaced.action]);
      const left = map[displaced.action][0];
      this.#line =
        left === undefined
          ? t("controls.displacedNoKey", {
              key: this.#bindingLabel(displaced.binding),
              action: name,
            })
          : t("controls.displacedKeeps", {
              key: this.#bindingLabel(displaced.binding),
              action: name,
              left: this.#bindingLabel(left),
            });
    }
    this.#change(map);
  }

  #change(map: Keymap): void {
    this.#map = map;
    this.#save(map);
  }

  #isCapturing(cell: KeyCell): boolean {
    return this.#capturing?.action === cell.action && this.#capturing.index === cell.index;
  }
}

/**
 * The Controls section of the Options screen: what was the Keys screen,
 * less the title and back button the Options screen now owns.
 */
export const controlsSection: OptionsSection = {
  id: "controls",
  get title() {
    return t("options.controls");
  },
  mount: mountControls,
};

function mountControls(container: HTMLElement): () => void {
  const editor = new KeysEditor(loadKeymap(), saveKeymap);
  let disposed = false;

  const panel = h("div", "keys-screen");
  container.appendChild(panel);

  const pickerField = h("label", "field");
  pickerField.appendChild(h("span", "field-label", t("controls.preset")));
  const picker = document.createElement("select");
  picker.className = "keys-preset";
  for (const [id, name] of Object.entries(PRESET_NAMES)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = t(name);
    picker.appendChild(option);
  }
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = t("controls.custom");
  // Shown, never picked: a custom map is what editing a preset makes.
  custom.disabled = true;
  picker.appendChild(custom);
  picker.addEventListener("change", () => {
    const id = Object.keys(PRESET_NAMES).find((name) => name === picker.value);
    if (id === "vibewars" || id === "classic") {
      editor.choosePreset(id);
      paint();
    }
  });
  pickerField.appendChild(picker);
  panel.appendChild(pickerField);

  const table = document.createElement("table");
  table.className = "keys-table";
  const body = document.createElement("tbody");
  table.appendChild(body);
  panel.appendChild(table);

  const line = h("p", "keys-line");
  line.setAttribute("role", "status");
  panel.appendChild(line);

  const cells: { readonly cell: KeyCell; readonly button: HTMLButtonElement }[] = [];
  const warnings: { readonly action: KeyAction; readonly node: HTMLElement }[] = [];
  const previousTarget: { readonly index: 0 | 1; readonly node: HTMLElement }[] = [];
  const same = (a: KeyCell | undefined, b: KeyCell): boolean =>
    a?.action === b.action && a.index === b.index;

  for (const action of KEY_ACTIONS) {
    if (action === WEAPON_SET_ACTIONS[0]) {
      // The four sets read as one group (#489).
      const heading = document.createElement("tr");
      heading.className = "keys-group";
      const title = h("th", "keys-group-title", t("controls.weaponSets"));
      title.setAttribute("colspan", "4");
      heading.appendChild(title);
      body.appendChild(heading);
    }
    const row = document.createElement("tr");
    row.appendChild(h("th", "keys-action", t(ACTION_NAMES[action])));
    for (const index of [0, 1] as const) {
      const cell: KeyCell = { action, index };
      const td = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "key-cell";
      button.dataset.action = action;
      button.dataset.index = String(index);
      button.addEventListener("click", () => {
        editor.startCapture(cell);
        paint();
        // Safari does not focus a clicked button; the capture listener
        // below only hears keys from inside the screen.
        button.focus();
      });
      cells.push({ cell, button });
      td.appendChild(button);
      row.appendChild(td);
    }
    const warning = h("td", "keys-warning");
    warnings.push({ action, node: warning });
    row.appendChild(warning);
    body.appendChild(row);
    if (action === "target-next") {
      // Shift with Next target goes back (#3630): it follows Next target's
      // keys and is not bound on its own.
      const previous = document.createElement("tr");
      previous.className = "is-fixed";
      previous.appendChild(h("th", "keys-action", t("controls.targetPrevious")));
      for (const index of [0, 1] as const) {
        // The box on a span, as the editable rows' is on their button: a td
        // made inline-block leaves the table's columns.
        const td = document.createElement("td");
        const node = h("span", "key-cell is-fixed");
        previousTarget.push({ index, node });
        td.appendChild(node);
        previous.appendChild(td);
      }
      previous.appendChild(h("td"));
      body.appendChild(previous);
    }
  }
  for (const [name, key] of [
    [t("controls.cancelAction"), t("controls.esc")],
    [t("controls.leaveMatch"), "F10"],
  ]) {
    const row = document.createElement("tr");
    row.className = "is-fixed";
    row.appendChild(h("th", "keys-action", name));
    row.appendChild(h("td", "key-cell is-fixed", key));
    row.appendChild(h("td"));
    row.appendChild(h("td"));
    body.appendChild(row);
  }

  /** The flash last started, so a repaint does not restart it. */
  let flashing: KeyCell | undefined;
  const paint = (): void => {
    picker.value = editor.preset;
    const flash = editor.flashed !== flashing ? editor.flashed : undefined;
    flashing = editor.flashed;
    for (const { cell, button } of cells) {
      button.textContent = editor.cellText(cell);
      button.classList.toggle("is-capturing", same(editor.capturing, cell));
      if (same(flash, cell)) {
        // Off, a layout read, and on again: a cell emptied twice running
        // flashes twice.
        button.classList.remove("is-flashing");
        button.getBoundingClientRect();
        button.classList.add("is-flashing");
      } else if (flash !== undefined || editor.flashed === undefined) {
        button.classList.remove("is-flashing");
      }
    }
    for (const { index, node } of previousTarget) {
      node.textContent = editor.previousTargetText(index);
      node.hidden = node.textContent === "";
    }
    for (const { action, node } of warnings) {
      node.textContent = noKeyWarning(editor.map, action);
    }
    line.textContent = editor.line;
  };

  // A used key goes no further: Tab does not move focus, and Space does
  // not click the focused cell back into a capture. A capture's own Esc
  // stops here too, so the Options screen never hears it as "back".
  const onKeydown = (event: KeyboardEvent): void => {
    if (editor.capturing === undefined) {
      return;
    }
    if (editor.press(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
    paint();
  };
  panel.addEventListener("keydown", onKeydown, true);
  const onKeyup = (event: KeyboardEvent): void => {
    if (editor.release(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
    paint();
  };
  panel.addEventListener("keyup", onKeyup, true);
  // An alt-tab with Shift down never sends its keyup; the focused cell
  // hears the focus go.
  const onBlur = (): void => {
    editor.letGoModifiers();
    paint();
  };
  panel.addEventListener("focusout", onBlur);

  void loadLayoutLabeller().then((label) => {
    if (label !== undefined && !disposed) {
      editor.label = label;
      paint();
    }
  });

  paint();
  cells[0]?.button.focus();
  return () => {
    disposed = true;
    panel.removeEventListener("keydown", onKeydown, true);
    panel.removeEventListener("keyup", onKeyup, true);
    panel.removeEventListener("focusout", onBlur);
  };
}

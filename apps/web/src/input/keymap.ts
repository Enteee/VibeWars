/**
 * Which physical key does what, in a match and in the Training Ground
 * (#302). Pure, so the presets and the rules every keymap obeys are
 * testable without a browser.
 *
 * Bindings are `KeyboardEvent.code` values, the physical key, never
 * `key`: Q W E R / A S D F keeps its hand shape on AZERTY and QWERTZ. A
 * binding may hold Ctrl, Alt or Shift with its key (#4183), never Meta;
 * a press with Ctrl or Alt that no binding holds is the browser's, so
 * its own shortcuts (Ctrl+W, Ctrl+R) still work (Q36).
 *
 * Esc (cancel) and F10 (leave) are not actions here: they stay fixed, so
 * there is always a way to cancel and a way out.
 */

import { t, type MessageKey } from "../i18n/index.js";

export type KeyAction =
  | "skill-1"
  | "skill-2"
  | "skill-3"
  | "skill-4"
  | "skill-5"
  | "skill-6"
  | "skill-7"
  | "skill-8"
  | "move-up"
  | "move-down"
  | "move-left"
  | "move-right"
  | "target-next"
  | "target-closest"
  | "target-called"
  | "target-self"
  | "attack"
  | "call-target"
  | "ping"
  | "show-names"
  | "mute"
  | "weapon-set-1"
  | "weapon-set-2"
  | "weapon-set-3"
  | "weapon-set-4"
  | "drop-bundle";

/** Every action, in bar and reading order. */
export const KEY_ACTIONS: readonly KeyAction[] = [
  "skill-1",
  "skill-2",
  "skill-3",
  "skill-4",
  "skill-5",
  "skill-6",
  "skill-7",
  "skill-8",
  "move-up",
  "move-down",
  "move-left",
  "move-right",
  "target-next",
  "target-closest",
  "target-called",
  "target-self",
  "attack",
  "call-target",
  "ping",
  "show-names",
  "mute",
  "weapon-set-1",
  "weapon-set-2",
  "weapon-set-3",
  "weapon-set-4",
  "drop-bundle",
];

/** The skill actions, slot 0 first. */
export const SKILL_ACTIONS: readonly KeyAction[] = KEY_ACTIONS.slice(0, 8);

/** The weapon-set actions, set 1 first (#489). */
export const WEAPON_SET_ACTIONS: readonly KeyAction[] = [
  "weapon-set-1",
  "weapon-set-2",
  "weapon-set-3",
  "weapon-set-4",
];

/** A modifier a binding may hold with its key (#4183); Meta never. */
export type Modifier = "ctrl" | "alt" | "shift";

/** The modifiers in the one order a binding lists them, and a label names them. */
export const MODIFIERS: readonly Modifier[] = ["ctrl", "alt", "shift"];

/**
 * A key and the modifiers held with it: `code` is a `KeyboardEvent.code`,
 * `mods` unique, in `MODIFIERS` order, empty for a plain key. Its
 * identity is both, so Shift+X and X are two keys.
 */
export interface KeyBinding {
  readonly code: string;
  readonly mods: readonly Modifier[];
}

/** 0-2 bindings per action; no binding appears twice in a map. */
export type Keymap = Readonly<Record<KeyAction, readonly KeyBinding[]>>;

/** Plain keys: `code`s with no modifier held. */
function plain(...codes: string[]): KeyBinding[] {
  return codes.map((code) => ({ code, mods: [] }));
}

/** Actions held rather than pressed, which take a single key (#4183). */
export const SINGLE_KEY_ACTIONS: readonly KeyAction[] = [
  "move-up",
  "move-down",
  "move-left",
  "move-right",
  "show-names",
];

/** Combinations the browser or the OS keeps, which a page never sees (#4183). */
export const RESERVED_COMBOS: readonly KeyBinding[] = [
  { code: "KeyW", mods: ["ctrl"] },
  { code: "KeyT", mods: ["ctrl"] },
  { code: "KeyN", mods: ["ctrl"] },
  { code: "KeyQ", mods: ["ctrl"] },
  { code: "Tab", mods: ["ctrl"] },
  { code: "Tab", mods: ["ctrl", "shift"] },
  { code: "KeyW", mods: ["ctrl", "shift"] },
  { code: "KeyT", mods: ["ctrl", "shift"] },
  { code: "KeyN", mods: ["ctrl", "shift"] },
  { code: "KeyQ", mods: ["ctrl", "shift"] },
  { code: "F4", mods: ["alt"] },
  { code: "Tab", mods: ["alt"] },
];

/** Whether `a` and `b` are the same key: one code, one modifier set. */
export function sameBinding(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.code === b.code &&
    a.mods.length === b.mods.length &&
    a.mods.every((mod, i) => mod === b.mods[i])
  );
}

/** Whether `binding` is a combination the browser keeps. */
export function isReservedCombo(binding: KeyBinding): boolean {
  return RESERVED_COMBOS.some((reserved) => sameBinding(reserved, binding));
}

/** Whether `code` is a modifier key itself, of either side. */
export function isModifierCode(code: string): boolean {
  return /^(?:Shift|Control|Alt|Meta|OS)/.test(code);
}

/** How many codes one action may have: a key and a second set. */
export const MAX_CODES_PER_ACTION = 2;

const SHARED = {
  "target-next": plain("Tab"),
  "target-closest": plain("KeyC"),
  "target-called": plain("KeyT"),
  "target-self": plain("KeyG"),
  attack: plain("Space"),
  // The wheel click does both (#443); a key is for a mouse without one,
  // so none is taken from anything else by default.
  "call-target": plain(),
  ping: plain(),
  "show-names": plain("ShiftLeft", "ShiftRight"),
  mute: plain("KeyM"),
  // The Drop button above the health bar does it (#1225); a key is for
  // whoever wants one.
  "drop-bundle": plain(),
} satisfies Partial<Keymap>;

export const KEYMAP_PRESETS: Readonly<Record<"vibewars" | "classic", Keymap>> = {
  // GW1 muscle memory: skills on the number row, WASD moves.
  classic: {
    "skill-1": plain("Digit1"),
    "skill-2": plain("Digit2"),
    "skill-3": plain("Digit3"),
    "skill-4": plain("Digit4"),
    "skill-5": plain("Digit5"),
    "skill-6": plain("Digit6"),
    "skill-7": plain("Digit7"),
    "skill-8": plain("Digit8"),
    "move-up": plain("KeyW", "ArrowUp"),
    "move-down": plain("KeyS", "ArrowDown"),
    "move-left": plain("KeyA", "ArrowLeft"),
    "move-right": plain("KeyD", "ArrowRight"),
    // GW1's own keys (#489): the browser's help and find give way in a match.
    "weapon-set-1": plain("F1"),
    "weapon-set-2": plain("F2"),
    "weapon-set-3": plain("F3"),
    "weapon-set-4": plain("F4"),
    ...SHARED,
    // F is Yourself in GW1 (#3629); G stays, as in VibeWars.
    "target-self": plain("KeyF", "KeyG"),
  },
  // The left hand casts on two rows; the right moves, on the arrows (and,
  // with #310, the mouse).
  vibewars: {
    "skill-1": plain("KeyQ"),
    "skill-2": plain("KeyW"),
    "skill-3": plain("KeyE"),
    "skill-4": plain("KeyR"),
    "skill-5": plain("KeyA"),
    "skill-6": plain("KeyS"),
    "skill-7": plain("KeyD"),
    "skill-8": plain("KeyF"),
    "move-up": plain("ArrowUp"),
    "move-down": plain("ArrowDown"),
    "move-left": plain("ArrowLeft"),
    "move-right": plain("ArrowRight"),
    // The number row is free here (#489): skills sit on QWER and ASDF.
    "weapon-set-1": plain("Digit1"),
    "weapon-set-2": plain("Digit2"),
    "weapon-set-3": plain("Digit3"),
    "weapon-set-4": plain("Digit4"),
    ...SHARED,
  },
};

// GW1 players start at home (#3134); VibeWars stays one pick away.
export const DEFAULT_KEYMAP: Keymap = KEYMAP_PRESETS.classic;

/** Keys the browser or the OS owns, and the game's fixed Esc and F10. */
const UNBINDABLE = new Set([
  "ContextMenu",
  "Escape",
  "F5",
  "F6",
  "F7",
  "F10",
  "F11",
  "F12",
  "Enter",
  "Backspace",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
  "Pause",
]);
const UNBINDABLE_PREFIXES = ["Control", "Alt", "Meta", "OS"];

/** Whether the game may ever bind `code`. */
export function isBindable(code: string): boolean {
  return (
    code !== "" &&
    !UNBINDABLE.has(code) &&
    !UNBINDABLE_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

/** The action `binding` is on in `map`, if any. */
export function actionForBinding(map: Keymap, binding: KeyBinding): KeyAction | undefined {
  return KEY_ACTIONS.find((action) => map[action].some((bound) => sameBinding(bound, binding)));
}

export type KeyPress = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/** The modifiers `press` holds, in `MODIFIERS` order; either side counts. */
export function modsOf(press: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey">): Modifier[] {
  return MODIFIERS.filter((mod) =>
    mod === "ctrl" ? press.ctrlKey : mod === "alt" ? press.altKey : press.shiftKey,
  );
}

/**
 * The action a keydown fires (#4183), or `undefined` for none: the one
 * bound to its code with exactly the modifiers held; else, with Shift
 * alone held, the one bound to the bare code, so skills still fire while
 * Shift shows names; else none, so a press with Ctrl or Alt and no
 * binding for it stays the browser's shortcut. Meta held fires nothing.
 */
export function actionForEvent(map: Keymap, press: KeyPress): KeyAction | undefined {
  if (press.metaKey) {
    return undefined;
  }
  const mods = modsOf(press);
  return (
    actionForBinding(map, { code: press.code, mods }) ??
    (mods.length === 1 && mods[0] === "shift"
      ? actionForBinding(map, { code: press.code, mods: [] })
      : undefined)
  );
}

/**
 * Whether `actionForEvent` found `press`'s action by its bare code with
 * Shift held, as Shift with Next target's key cycles backwards (#3630).
 */
export function isShiftedPlain(map: Keymap, press: KeyPress): boolean {
  return (
    press.shiftKey &&
    !press.metaKey &&
    actionForBinding(map, { code: press.code, mods: modsOf(press) }) === undefined
  );
}

const ARROWS: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** The keys a keyboard prints in words, by code with any side dropped: worded at render. */
const WORD_KEYS: Readonly<Record<string, MessageKey>> = {
  Alt: "keys.alt",
  Backspace: "keys.backspace",
  CapsLock: "keys.capsLock",
  Control: "keys.control",
  Delete: "keys.delete",
  End: "keys.end",
  Enter: "keys.enter",
  Escape: "keys.escape",
  Home: "keys.home",
  Insert: "keys.insert",
  PageDown: "keys.pageDown",
  PageUp: "keys.pageUp",
  Shift: "keys.shift",
  Space: "keys.space",
  Tab: "keys.tab",
};

/** A key's label, from its code alone: `KeyQ` is Q, `Digit1` is 1, `ArrowUp` is ↑. */
export function codeLabel(code: string): string {
  const arrow = ARROWS[code];
  if (arrow !== undefined) {
    return arrow;
  }
  const letterOrDigit = /^(?:Key|Digit)(.)$/.exec(code);
  if (letterOrDigit?.[1] !== undefined) {
    return letterOrDigit[1];
  }
  const numpad = /^Numpad(.+)$/.exec(code);
  if (numpad?.[1] !== undefined) {
    return t("keys.numpad", { key: numpad[1] });
  }
  const sided = /^(.+?)(?:Left|Right)$/.exec(code);
  const name =
    sided?.[1] !== undefined && code !== "ArrowLeft" && code !== "ArrowRight" ? sided[1] : code;
  const word = WORD_KEYS[name];
  return word === undefined ? name : t(word);
}

const MOD_LABELS: Readonly<Record<Modifier, MessageKey>> = {
  ctrl: "keys.control",
  alt: "keys.alt",
  shift: "keys.shift",
};

const MOD_SHORT_LABELS: Readonly<Record<Modifier, MessageKey>> = {
  ctrl: "keys.ctrlShort",
  alt: "keys.altShort",
  shift: "keys.shiftShort",
};

/**
 * A binding's label (#4183): its key's, after its modifiers, as
 * "Shift + X"; `compact` for a narrow badge, as "⇧X" or "Ctrl X".
 *
 * @param label how a code reads; `codeLabel` until the layout is known
 */
export function bindingLabel(
  binding: KeyBinding,
  compact = false,
  label: (code: string) => string = codeLabel,
): string {
  const key = label(binding.code);
  if (binding.mods.length === 0) {
    return key;
  }
  if (compact) {
    const short = binding.mods.map((mod) =>
      mod === "shift" ? t(MOD_SHORT_LABELS[mod]) : `${t(MOD_SHORT_LABELS[mod])} `,
    );
    return `${short.join("")}${key}`;
  }
  const mods = binding.mods.map((mod) => t(MOD_LABELS[mod])).join(" + ");
  return t("controls.combo", { mods, key });
}

/**
 * The label of the first key bound to `action`, or "" when none is.
 *
 * @param label how a code reads; `codeLabel` until the layout is known
 * @param compact for a narrow badge, as `bindingLabel`'s
 */
export function actionLabel(
  map: Keymap,
  action: KeyAction,
  label: (code: string) => string = codeLabel,
  compact = false,
): string {
  const binding = map[action][0];
  return binding === undefined ? "" : bindingLabel(binding, compact, label);
}

/** `value` as a binding `action` may take, else `undefined`: nothing is repaired. */
function parseBinding(value: unknown, action: KeyAction): KeyBinding | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { code, mods, ...rest } = value as { code?: unknown; mods?: unknown };
  if (
    Object.keys(rest).length > 0 ||
    typeof code !== "string" ||
    !isBindable(code) ||
    !Array.isArray(mods)
  ) {
    return undefined;
  }
  const kept = MODIFIERS.filter((mod) => (mods as readonly unknown[]).includes(mod));
  const binding = { code, mods: kept };
  // Unsorted, repeated or unknown modifiers are as malformed as a missing code.
  if (
    kept.length !== mods.length ||
    kept.some((mod, i) => mods[i] !== mod) ||
    (kept.length > 0 && (isModifierCode(code) || SINGLE_KEY_ACTIONS.includes(action))) ||
    isReservedCombo(binding)
  ) {
    return undefined;
  }
  return binding;
}

/**
 * A Keymap if `value` is a valid one, else `undefined`: every action
 * present and nothing else, only bindable keys and combinations, none
 * twice, at most `MAX_CODES_PER_ACTION` per action. Nothing is repaired.
 */
export function parseKeymap(value: unknown): Keymap | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length !== KEY_ACTIONS.length) {
    return undefined;
  }
  const seen: KeyBinding[] = [];
  const map: Partial<Record<KeyAction, readonly KeyBinding[]>> = {};
  for (const [action, bindings] of entries) {
    const known = KEY_ACTIONS.find((candidate) => candidate === action);
    if (known === undefined || !Array.isArray(bindings) || bindings.length > MAX_CODES_PER_ACTION) {
      return undefined;
    }
    const kept: KeyBinding[] = [];
    for (const value of bindings as readonly unknown[]) {
      const binding = parseBinding(value, known);
      if (binding === undefined || seen.some((other) => sameBinding(other, binding))) {
        return undefined;
      }
      seen.push(binding);
      kept.push(binding);
    }
    map[known] = kept;
  }
  return map as Keymap;
}

/** A rebound keymap, and the action that lost the key to it, if one did. */
export interface Rebind {
  readonly map: Keymap;
  readonly displaced?: { readonly action: KeyAction; readonly binding: KeyBinding };
}

/**
 * Bind `binding` to `action`'s cell `index` (0 primary, 1 secondary),
 * moving it off any other action. `binding === null` clears. Throws on
 * a key that is never bound, or a combination `action` cannot take:
 * callers check first.
 *
 * A key is never on two actions, so binding a taken one moves it; there
 * is no swap. A cleared primary with a secondary set promotes the
 * secondary, so an action's first key is always its primary.
 */
export function rebind(
  map: Keymap,
  action: KeyAction,
  index: 0 | 1,
  binding: KeyBinding | null,
): Rebind {
  if (
    binding !== null &&
    (!isBindable(binding.code) ||
      (binding.mods.length > 0 &&
        (isModifierCode(binding.code) || SINGLE_KEY_ACTIONS.includes(action))) ||
      isReservedCombo(binding))
  ) {
    throw new Error(`${binding.mods.join("+")} ${binding.code} can never be bound to ${action}`);
  }
  const owner = binding === null ? undefined : actionForBinding(map, binding);
  const next: Record<KeyAction, readonly KeyBinding[]> = { ...map };
  if (owner !== undefined && binding !== null) {
    next[owner] = map[owner].filter((bound) => !sameBinding(bound, binding));
  }
  const cells = [next[action][0], next[action][1]];
  cells[index] = binding ?? undefined;
  next[action] = cells.filter((bound): bound is KeyBinding => bound !== undefined);
  return owner === undefined || owner === action || binding === null
    ? { map: next }
    : { map: next, displaced: { action: owner, binding } };
}

/** Which preset `map` is, key for key, or `undefined` for a custom one. */
export function presetOf(map: Keymap): keyof typeof KEYMAP_PRESETS | undefined {
  const names = Object.keys(KEYMAP_PRESETS) as (keyof typeof KEYMAP_PRESETS)[];
  return names.find((name) =>
    KEY_ACTIONS.every((action) => {
      const preset = KEYMAP_PRESETS[name][action];
      const bindings = map[action];
      return (
        bindings.length === preset.length &&
        bindings.every((binding, i) => {
          const other = preset[i];
          return other !== undefined && sameBinding(binding, other);
        })
      );
    }),
  );
}

/**
 * Which physical key does what, in a match and in the Training Ground
 * (#302). Pure, so the presets and the rules every keymap obeys are
 * testable without a browser.
 *
 * Bindings are `KeyboardEvent.code` values, the physical key, never
 * `key`: Q W E R / A S D F keeps its hand shape on AZERTY and QWERTZ, and
 * Shift held with Q is still Q. No keymap binds Ctrl, Alt or Meta, so the
 * browser's own shortcuts (Ctrl+W, Ctrl+R) are never the game's (Q36).
 *
 * Esc (cancel) and F10 (leave) are not actions here: they stay fixed, so
 * there is always a way to cancel and a way out.
 */

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
  | "weapon-set-4";

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

/** `KeyboardEvent.code` values; 0-2 per action; no code appears twice in a map. */
export type Keymap = Readonly<Record<KeyAction, readonly string[]>>;

/** How many codes one action may have: a key and a second set. */
export const MAX_CODES_PER_ACTION = 2;

const SHARED = {
  "target-next": ["Tab"],
  "target-closest": ["KeyC"],
  "target-called": ["KeyT"],
  "target-self": ["KeyG"],
  attack: ["Space"],
  // The wheel click does both (#443); a key is for a mouse without one,
  // so none is taken from anything else by default.
  "call-target": [],
  ping: [],
  "show-names": ["ShiftLeft", "ShiftRight"],
  mute: ["KeyM"],
} as const satisfies Partial<Keymap>;

export const KEYMAP_PRESETS: Readonly<Record<"vibewars" | "classic", Keymap>> = {
  // The left hand casts on two rows; the right moves, on the arrows (and,
  // with #310, the mouse).
  vibewars: {
    "skill-1": ["KeyQ"],
    "skill-2": ["KeyW"],
    "skill-3": ["KeyE"],
    "skill-4": ["KeyR"],
    "skill-5": ["KeyA"],
    "skill-6": ["KeyS"],
    "skill-7": ["KeyD"],
    "skill-8": ["KeyF"],
    "move-up": ["ArrowUp"],
    "move-down": ["ArrowDown"],
    "move-left": ["ArrowLeft"],
    "move-right": ["ArrowRight"],
    // The number row is free here (#489): skills sit on QWER and ASDF.
    "weapon-set-1": ["Digit1"],
    "weapon-set-2": ["Digit2"],
    "weapon-set-3": ["Digit3"],
    "weapon-set-4": ["Digit4"],
    ...SHARED,
  },
  // GW1 muscle memory: skills on the number row, WASD moves.
  classic: {
    "skill-1": ["Digit1"],
    "skill-2": ["Digit2"],
    "skill-3": ["Digit3"],
    "skill-4": ["Digit4"],
    "skill-5": ["Digit5"],
    "skill-6": ["Digit6"],
    "skill-7": ["Digit7"],
    "skill-8": ["Digit8"],
    "move-up": ["KeyW", "ArrowUp"],
    "move-down": ["KeyS", "ArrowDown"],
    "move-left": ["KeyA", "ArrowLeft"],
    "move-right": ["KeyD", "ArrowRight"],
    // GW1's own keys (#489): the browser's help and find give way in a match.
    "weapon-set-1": ["F1"],
    "weapon-set-2": ["F2"],
    "weapon-set-3": ["F3"],
    "weapon-set-4": ["F4"],
    ...SHARED,
  },
};

export const DEFAULT_KEYMAP: Keymap = KEYMAP_PRESETS.vibewars;

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

/** The action `code` is bound to in `map`, if any. */
export function actionForCode(map: Keymap, code: string): KeyAction | undefined {
  return KEY_ACTIONS.find((action) => map[action].includes(code));
}

/**
 * Whether a keydown is a browser shortcut: Ctrl, Alt or Meta held. Such a
 * press triggers no action and is never `preventDefault`ed. Shift does
 * not count; it is a game key.
 */
export function isShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey">): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

const ARROWS: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
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
    return `Num ${numpad[1]}`;
  }
  const sided = /^(.+?)(?:Left|Right)$/.exec(code);
  if (sided?.[1] !== undefined && code !== "ArrowLeft" && code !== "ArrowRight") {
    return sided[1];
  }
  return code;
}

/**
 * The label of the first key bound to `action`, or "" when none is.
 *
 * @param label how a code reads; `codeLabel` until the layout is known
 */
export function actionLabel(
  map: Keymap,
  action: KeyAction,
  label: (code: string) => string = codeLabel,
): string {
  const code = map[action][0];
  return code === undefined ? "" : label(code);
}

/**
 * A Keymap if `value` is a valid one, else `undefined`: every action
 * present and nothing else, only bindable codes, none twice, at most
 * `MAX_CODES_PER_ACTION` per action. Nothing is repaired.
 */
export function parseKeymap(value: unknown): Keymap | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length !== KEY_ACTIONS.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const map: Partial<Record<KeyAction, readonly string[]>> = {};
  for (const [action, codes] of entries) {
    const known = KEY_ACTIONS.find((candidate) => candidate === action);
    if (known === undefined || !Array.isArray(codes) || codes.length > MAX_CODES_PER_ACTION) {
      return undefined;
    }
    const kept: string[] = [];
    for (const code of codes as readonly unknown[]) {
      if (typeof code !== "string" || !isBindable(code) || seen.has(code)) {
        return undefined;
      }
      seen.add(code);
      kept.push(code);
    }
    map[known] = kept;
  }
  return map as Keymap;
}

/** A rebound keymap, and the action that lost the key to it, if one did. */
export interface Rebind {
  readonly map: Keymap;
  readonly displaced?: { readonly action: KeyAction; readonly code: string };
}

/**
 * Bind `code` to `action`'s cell `index` (0 primary, 1 secondary), moving
 * it off any other action. `code === null` clears. Throws on a
 * non-bindable code: callers check `isBindable` first.
 *
 * A key is never on two actions, so binding a taken one moves it; there
 * is no swap. A cleared primary with a secondary set promotes the
 * secondary, so an action's first key is always its primary.
 */
export function rebind(map: Keymap, action: KeyAction, index: 0 | 1, code: string | null): Rebind {
  if (code !== null && !isBindable(code)) {
    throw new Error(`${code} can never be bound`);
  }
  const owner = code === null ? undefined : actionForCode(map, code);
  const next: Record<KeyAction, readonly string[]> = { ...map };
  if (owner !== undefined) {
    next[owner] = map[owner].filter((bound) => bound !== code);
  }
  const cells = [next[action][0], next[action][1]];
  cells[index] = code ?? undefined;
  next[action] = cells.filter((bound): bound is string => bound !== undefined);
  return owner === undefined || owner === action || code === null
    ? { map: next }
    : { map: next, displaced: { action: owner, code } };
}

/** Which preset `map` is, key for key, or `undefined` for a custom one. */
export function presetOf(map: Keymap): keyof typeof KEYMAP_PRESETS | undefined {
  const names = Object.keys(KEYMAP_PRESETS) as (keyof typeof KEYMAP_PRESETS)[];
  return names.find((name) =>
    KEY_ACTIONS.every((action) => {
      const preset = KEYMAP_PRESETS[name][action];
      const codes = map[action];
      return codes.length === preset.length && codes.every((code, i) => code === preset[i]);
    }),
  );
}

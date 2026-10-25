import { ZERO, normalize, vec2, type Vec2 } from "@vibewars/game-core";

import { actionForCode, isShortcut, type KeyAction, type Keymap } from "./keymap.js";

/**
 * Held move actions -> movement direction, as a pure function of "which
 * actions are held right now" (brief §16: direct keyboard movement; the
 * keys are the keymap's, #302).
 *
 * Kept separate from any DOM event listener so the combination logic
 * (what does up+right mean? What about up+down cancelling out?) is
 * unit-testable without a browser.
 */
export function computeMoveDirection(held: ReadonlySet<KeyAction>): Vec2 {
  let x = 0;
  let y = 0;
  if (held.has("move-left")) x -= 1;
  if (held.has("move-right")) x += 1;
  if (held.has("move-up")) y -= 1;
  if (held.has("move-down")) y += 1;
  if (x === 0 && y === 0) {
    return ZERO;
  }
  return normalize(vec2(x, y));
}

export type MoveDirectionListener = (direction: Vec2) => void;

const MOVE_ACTIONS: ReadonlySet<KeyAction> = new Set([
  "move-up",
  "move-down",
  "move-left",
  "move-right",
]);

/**
 * Attaches `keydown`/`keyup` listeners and invokes `onChange` only when the
 * resulting direction actually changes — not on every keystroke — so the
 * caller can map "direction changed" directly onto "send one intent",
 * rather than flooding the network with identical intents while a key is
 * held.
 *
 * Codes are tracked, not actions, so with two keys on one action (W and
 * ArrowUp) letting go of one while the other is held keeps moving. A
 * press with Ctrl, Alt or Meta held is the browser's and moves nobody;
 * a release always counts.
 */
export function attachKeyboardMoveInput(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  keymap: Keymap,
  onChange: MoveDirectionListener,
): () => void {
  const pressed = new Map<string, KeyAction>();
  let lastDirection = ZERO;

  const update = (): void => {
    const direction = computeMoveDirection(new Set(pressed.values()));
    if (direction.x !== lastDirection.x || direction.y !== lastDirection.y) {
      lastDirection = direction;
      onChange(direction);
    }
  };

  const handleKeyDown = (event: Event): void => {
    const keyEvent = event as KeyboardEvent;
    const action = actionForCode(keymap, keyEvent.code);
    if (
      action === undefined ||
      !MOVE_ACTIONS.has(action) ||
      pressed.has(keyEvent.code) ||
      isShortcut(keyEvent)
    ) {
      return;
    }
    pressed.set(keyEvent.code, action);
    update();
  };

  const handleKeyUp = (event: Event): void => {
    if (!pressed.delete((event as KeyboardEvent).code)) {
      return;
    }
    update();
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
  };
}

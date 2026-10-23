import { ZERO, normalize, vec2, type Vec2 } from "@vibewars/game-core";

/**
 * WASD -> movement direction, as a pure function of "which keys are down
 * right now" (brief §16: direct WASD movement for the first playable
 * milestone; click-to-move is explicitly deferred).
 *
 * Kept separate from any DOM event listener so the key-combination logic
 * (what does W+D mean? What about W+S cancelling out?) is unit-testable
 * without a browser.
 */
export function computeMoveDirection(pressedKeys: ReadonlySet<string>): Vec2 {
  let x = 0;
  let y = 0;
  if (pressedKeys.has("a")) x -= 1;
  if (pressedKeys.has("d")) x += 1;
  if (pressedKeys.has("w")) y -= 1;
  if (pressedKeys.has("s")) y += 1;
  if (x === 0 && y === 0) {
    return ZERO;
  }
  return normalize(vec2(x, y));
}

export type MoveDirectionListener = (direction: Vec2) => void;

/**
 * Attaches `keydown`/`keyup` listeners and invokes `onChange` only when the
 * resulting direction actually changes — not on every keystroke — so the
 * caller can map "direction changed" directly onto "send one intent",
 * rather than flooding the network with identical intents while a key is
 * held.
 */
export function attachKeyboardMoveInput(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  onChange: MoveDirectionListener,
): () => void {
  const pressed = new Set<string>();
  let lastDirection = ZERO;

  const relevantKeys = new Set(["w", "a", "s", "d"]);

  const handleKeyDown = (event: Event): void => {
    const key = (event as KeyboardEvent).key.toLowerCase();
    if (!relevantKeys.has(key) || pressed.has(key)) {
      return;
    }
    pressed.add(key);
    const direction = computeMoveDirection(pressed);
    if (direction !== lastDirection) {
      lastDirection = direction;
      onChange(direction);
    }
  };

  const handleKeyUp = (event: Event): void => {
    const key = (event as KeyboardEvent).key.toLowerCase();
    if (!relevantKeys.has(key) || !pressed.has(key)) {
      return;
    }
    pressed.delete(key);
    const direction = computeMoveDirection(pressed);
    if (direction !== lastDirection) {
      lastDirection = direction;
      onChange(direction);
    }
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
  };
}

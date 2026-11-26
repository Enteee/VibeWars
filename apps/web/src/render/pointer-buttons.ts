/**
 * Which mouse buttons went down or up between two pointer events (#438).
 *
 * Browsers report a second button pressed while one is held as a
 * `pointermove` with a changed `buttons` mask, not as a `pointerdown`, and
 * the same for releasing one of two. Reading only `pointerdown` would lose
 * a left click made while the right button is held, so the viewport diffs
 * the mask on every pointer event instead. Pure, no Phaser.
 */

export type MouseButton = "left" | "right" | "middle";

/** `PointerEvent.buttons` bits, in the order a chord is reported. */
const BITS: readonly (readonly [number, MouseButton])[] = [
  [1, "left"],
  [2, "right"],
  [4, "middle"],
];

export interface ButtonChanges {
  readonly pressed: readonly MouseButton[];
  readonly released: readonly MouseButton[];
}

/** What changed between two `PointerEvent.buttons` masks. */
export function buttonChanges(before: number, after: number): ButtonChanges {
  const pressed: MouseButton[] = [];
  const released: MouseButton[] = [];
  for (const [bit, button] of BITS) {
    if ((after & bit) !== 0 && (before & bit) === 0) {
      pressed.push(button);
    }
    if ((before & bit) !== 0 && (after & bit) === 0) {
      released.push(button);
    }
  }
  return { pressed, released };
}

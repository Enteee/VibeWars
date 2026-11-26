/**
 * Whether this device is touch alone (#1392): a coarse pointer that cannot
 * hover, and no fine pointer anywhere. A narrow desktop window has its
 * mouse, and a tablet with one plugged in has `any-pointer: fine`.
 * `match` is `matchMedia`'s answer, handed in.
 */
export function isTouchOnly(match: (query: string) => boolean): boolean {
  return match("(pointer: coarse)") && match("(hover: none)") && !match("(any-pointer: fine)");
}

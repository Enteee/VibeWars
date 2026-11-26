import { codeLabel } from "./keymap.js";

/** How a key code reads on this player's keyboard (#302). */
export type KeyLabeller = (code: string) => string;

/** `navigator.keyboard`, where the browser has it (Chromium). */
interface LayoutSource {
  readonly keyboard?: {
    getLayoutMap(): Promise<ReadonlyMap<string, string>>;
  };
}

/**
 * Label codes by the character `layout` gives them, uppercased, falling
 * back to `codeLabel` for keys it has no printable character for.
 */
export function layoutLabeller(layout: ReadonlyMap<string, string>): KeyLabeller {
  return (code) => {
    const character = layout.get(code);
    return character === undefined || character.trim() === ""
      ? codeLabel(code)
      : character.toUpperCase();
  };
}

/**
 * This keyboard's labels, once the browser says what its layout is, or
 * `undefined` when it cannot. Callers draw with `codeLabel` meanwhile.
 */
export async function loadLayoutLabeller(
  source: LayoutSource = navigator as Navigator & LayoutSource,
): Promise<KeyLabeller | undefined> {
  try {
    const layout = await source.keyboard?.getLayoutMap();
    return layout === undefined ? undefined : layoutLabeller(layout);
  } catch {
    // Refused in an iframe without permission, for one; codes still read.
    return undefined;
  }
}

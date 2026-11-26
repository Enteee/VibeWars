import type { MusicLevel } from "./host-protocol.js";

/**
 * A track's source as a strudel.cc link, and back (#373, #366 §3.7):
 * `https://strudel.cc/#` and the source, UTF-8, base64, percent-encoded,
 * as strudel.cc writes its own.
 *
 * strudel.cc has no `layer` and no `INTENSITY`, which our host defines,
 * so a shared source starts with a two-line prelude that defines them at
 * the editor's level, and pasting it back strips that prelude.
 */

export const STRUDEL_URL = "https://strudel.cc/";

const PRELUDE_TAG = "// VibeWars: the intensity";

/** The two lines that stand in for the host on strudel.cc. */
export function prelude(level: MusicLevel): string {
  return (
    `let INTENSITY = ${String(level)} ${PRELUDE_TAG}, 0 to 3\n` +
    `let layer = (n, pat) => (INTENSITY >= n ? pat : silence)\n`
  );
}

const PRELUDE = new RegExp(
  `^let INTENSITY = [0-3] ${PRELUDE_TAG}, 0 to 3\\n` +
    `let layer = \\(n, pat\\) => \\(INTENSITY >= n \\? pat : silence\\)\\n`,
);

/** `source` without the prelude `prelude` adds, if it starts with one. */
export function stripPrelude(source: string): string {
  return source.replace(PRELUDE, "");
}

export function shareLink(source: string, level: MusicLevel): string {
  const bytes = new TextEncoder().encode(prelude(level) + source);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `${STRUDEL_URL}#${encodeURIComponent(btoa(binary))}`;
}

const LINK = /^https?:\/\/(?:www\.)?strudel\.cc\/[^#\s]*#(\S+)$/;

/**
 * What a paste puts in the editor: a strudel.cc link's source, the
 * prelude stripped, or anything else as it is. `null` for a strudel.cc
 * link that does not decode.
 */
export function pastedSource(text: string): string | null {
  const link = LINK.exec(text.trim());
  if (link === null) {
    return text;
  }
  try {
    const binary = atob(decodeURIComponent(link[1] ?? ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return stripPrelude(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Display names a player asks for, made safe to show everyone (#375):
 * the lobby, the match and a P2P host all run them through here.
 */

/** Display names are clamped so one player cannot flood everyone's screen. */
const MAX_NAME_LENGTH = 16;

/**
 * How much of the raw string is looked at, in UTF-16 units. A join body
 * can carry a megabyte of name, and the passes below cost per unit, so
 * the rest is dropped unread: 16 units per kept character leaves room for
 * any real name and its marks (#174).
 */
const MAX_RAW_NAME_UNITS = MAX_NAME_LENGTH * 16;

/**
 * Characters that draw nothing of their own or rearrange what is drawn
 * around them: every control (C0 and C1), every format character (bidi
 * overrides, zero-width joiners and spaces, the BOM, the soft hyphen),
 * the line and paragraph separators, lone surrogate halves, which draw
 * as a replacement box, and the letters and symbols that are blank by
 * design: the Hangul fillers and the braille blank. In a log they corrupt
 * the terminal; over a player's head they make a name invisible, or
 * reverse it and whatever is drawn after it (#174).
 */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u115f\u1160\u3164\uffa0\u2800]/gu;

/** Leading whitespace, and combining marks before any base letter: they have nothing to sit on. */
const LEADING_MARKS = /^[\s\p{M}]+/u;

/**
 * Combining marks past the second on one letter. Two covers every real
 * accent; a stack of fifteen draws far above and below the line, over
 * other players' health bars.
 */
const STACKED_MARKS = /(\p{M}{2})\p{M}+/gu;

const ZWNJ = 0x200c;
const ZWJ = 0x200d;
/** U+1F3F4 WAVING BLACK FLAG, the base of every subdivision flag. */
const BLACK_FLAG = 0x1f3f4;
const CANCEL_TAG = 0xe007f;
/** The longest tag run a real subdivision flag uses, e.g. `gbsct` is 5. */
const MAX_FLAG_TAGS = 6;
/** Joiners one grapheme may hold: the family emoji has three. */
const MAX_JOINERS_PER_GRAPHEME = 4;
/**
 * Code points one grapheme may hold. A family in four skin tones is 11;
 * a letter under a hundred skin-tone modifiers, or a run of Hangul
 * leading jamo, is also one grapheme, and draws far wider than a letter.
 */
const MAX_CODE_POINTS_PER_GRAPHEME = 12;
/**
 * Code points in the whole name. Each grapheme stays under the cap above,
 * but sixteen of them at eleven swatches each still draw a wall; this is
 * six families, or sixteen of nearly anything else.
 */
const MAX_NAME_CODE_POINTS = 48;

/** One character of `INVISIBLE_CHARACTERS`, for testing a single code point. */
const INVISIBLE_CHARACTER = new RegExp(INVISIBLE_CHARACTERS.source, "u");
const WHITESPACE_OR_MARK = /[\s\p{M}]/u;

function isTag(codePoint: number): boolean {
  return codePoint >= 0xe0020 && codePoint <= CANCEL_TAG;
}

/** A tag a subdivision flag may spell with: a digit or a lowercase letter. */
function isFlagTag(codePoint: number): boolean {
  return (
    (codePoint >= 0xe0030 && codePoint <= 0xe0039) || (codePoint >= 0xe0061 && codePoint <= 0xe007a)
  );
}

/** Draws something a joiner can join: not blank, not invisible, not itself a joiner. */
function isVisible(char: string | undefined): boolean {
  return char !== undefined && !/\s/u.test(char) && !INVISIBLE_CHARACTER.test(char);
}

/**
 * The format characters real names need, from the code points of a
 * name (#192): a ZWJ or ZWNJ with something visible on both sides (emoji
 * sequences, Persian and Indic letter forms), and the tags of a complete
 * subdivision flag (England, Scotland, Wales). Indexes into `chars`.
 */
function wantedFormatCharacters(chars: readonly string[]): Set<number> {
  const keep = new Set<number>();
  // A mark with only blanks and marks before it is stripped as leading,
  // so it is nothing to join to.
  let leading = true;
  const leadingAt: boolean[] = [];
  for (const char of chars) {
    leading &&= WHITESPACE_OR_MARK.test(char) || INVISIBLE_CHARACTER.test(char);
    leadingAt.push(leading);
  }
  for (let i = 0; i < chars.length; i += 1) {
    const codePoint = chars[i]?.codePointAt(0) ?? 0;
    if (codePoint === ZWJ || codePoint === ZWNJ) {
      if (isVisible(chars[i - 1]) && leadingAt[i - 1] === false && isVisible(chars[i + 1])) {
        keep.add(i);
      }
      continue;
    }
    if (codePoint !== BLACK_FLAG) {
      continue;
    }
    let end = i + 1;
    while (end < chars.length && isTag(chars[end]?.codePointAt(0) ?? 0)) {
      end += 1;
    }
    const tags = chars.slice(i + 1, end - 1).map((char) => char.codePointAt(0) ?? 0);
    const complete =
      chars[end - 1]?.codePointAt(0) === CANCEL_TAG &&
      tags.length >= 1 &&
      tags.length <= MAX_FLAG_TAGS &&
      tags.every(isFlagTag);
    if (complete) {
      for (let tag = i + 1; tag < end; tag += 1) {
        keep.add(tag);
      }
    }
    i = end - 1;
  }
  return keep;
}

/**
 * The first `MAX_NAME_LENGTH` graphemes, whole ones only, up to
 * `MAX_NAME_CODE_POINTS` in all. One holding more than
 * `MAX_JOINERS_PER_GRAPHEME` joiners or `MAX_CODE_POINTS_PER_GRAPHEME`
 * code points keeps only its first code point.
 */
function clampGraphemes(name: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const kept: string[] = [];
  let codePointsKept = 0;
  for (const { segment } of segmenter.segment(name)) {
    if (kept.length === MAX_NAME_LENGTH) {
      break;
    }
    const codePoints = Array.from(segment);
    const joiners = codePoints.filter((char) => char.codePointAt(0) === ZWJ).length;
    // A chain of thirty faces is one grapheme, drawn over everyone's bars.
    const tooWide =
      joiners > MAX_JOINERS_PER_GRAPHEME || codePoints.length > MAX_CODE_POINTS_PER_GRAPHEME;
    const grapheme = tooWide ? (codePoints[0] ?? "") : segment;
    codePointsKept += tooWide ? 1 : codePoints.length;
    if (codePointsKept > MAX_NAME_CODE_POINTS) {
      break;
    }
    kept.push(grapheme);
  }
  return kept.join("");
}

/**
 * Sanitise a client-supplied display name (brief §32: never trust the
 * client). Invisible characters are stripped, except the joiners and flag
 * tags real names need, mark stacks and whitespace runs collapsed, the
 * length clamped in graphemes, so an emoji, a family or a flag is never
 * cut apart, and an empty result falls back to a server-generated name.
 */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  // Slicing can halve a surrogate pair; the stray half is stripped below.
  const chars = Array.from(raw.slice(0, MAX_RAW_NAME_UNITS).normalize("NFC"));
  const wanted = wantedFormatCharacters(chars);
  const cleaned = chars
    .map((char, index) => (wanted.has(index) ? char : char.replace(INVISIBLE_CHARACTERS, "")))
    .join("")
    .replace(/\s+/gu, " ")
    .replace(LEADING_MARKS, "")
    .replace(STACKED_MARKS, "$1")
    .trim();
  if (cleaned === "") {
    return fallback;
  }
  // The cut can leave a space at the end.
  return clampGraphemes(cleaned).trim();
}

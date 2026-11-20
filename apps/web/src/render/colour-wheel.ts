/**
 * The colour wheel (docs/art/visual-style.md §1): a colour's hue is its
 * angle and its chroma (0 to 1) its radius, so how far apart two colours
 * read is how far apart they sit on it.
 */

/** The friend side's blue (docs/art/art-direction.md), as 0xRRGGBB. */
export const FRIEND_COLOUR = 0x59c2ff;

/** The foe side's red (docs/art/art-direction.md), as 0xRRGGBB. */
export const FOE_COLOUR = 0xff7b72;

/** A hand's width on the colour wheel: a quarter of its radius. */
export const HAND = 0.25;

/** How far, in degrees, a vivid colour's hue must sit from a team's not to read as it (#3698). */
export const TEAM_HUE_BAND = 30;

/** The chroma from which a colour is vivid: its team is read by hue alone (#3698). */
export const VIVID_CHROMA = 0.3;

/** `colour`'s channels, 0 to 1. */
function channels(colour: number): readonly [number, number, number] {
  return [((colour >> 16) & 0xff) / 255, ((colour >> 8) & 0xff) / 255, (colour & 0xff) / 255];
}

/** `colour`'s hue in degrees, 0 to 360, and its chroma; a grey's hue is 0. */
function hueOf(colour: number): { readonly hue: number; readonly chroma: number } {
  const [r, g, b] = channels(colour);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) {
    return { hue: 0, chroma: 0 };
  }
  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return { hue: sector * 60, chroma };
}

/** Where `colour` sits on the colour wheel. */
function onWheel(colour: number): { readonly x: number; readonly y: number } {
  const { hue, chroma } = hueOf(colour);
  const angle = (hue / 180) * Math.PI;
  return { x: Math.cos(angle) * chroma, y: Math.sin(angle) * chroma };
}

/** How far apart two colours sit on the colour wheel. */
export function wheelDistance(a: number, b: number): number {
  const from = onWheel(a);
  const to = onWheel(b);
  return Math.hypot(from.x - to.x, from.y - to.y);
}

/** `colour` turned to `hue` degrees, its chroma and lightness (its brightest and dimmest channel) kept. */
function withHue(colour: number, hue: number): number {
  const [r, g, b] = channels(colour);
  const low = Math.min(r, g, b);
  const chroma = Math.max(r, g, b) - low;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const middle = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, middle, 0]
      : sector < 2
        ? [middle, chroma, 0]
        : sector < 3
          ? [0, chroma, middle]
          : sector < 4
            ? [0, middle, chroma]
            : sector < 5
              ? [middle, 0, chroma]
              : [chroma, 0, middle];
  const byte = (channel: number): number => Math.round((channel + low) * 255);
  return (byte(red) << 16) | (byte(green) << 8) | byte(blue);
}

/** How far apart two hues are, in degrees, 0 to 180. */
function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/**
 * Whether `colour` reads as the `team` colour: within a hand of it, or
 * vivid and within `TEAM_HUE_BAND` of its hue, since players read a team
 * by hue and a pure red far out on the wheel still reads as foe red (#3698).
 */
function readsAs(colour: number, team: number): boolean {
  if (wheelDistance(colour, team) < HAND) {
    return true;
  }
  const { hue, chroma } = hueOf(colour);
  return chroma >= VIVID_CHROMA && hueGap(hue, hueOf(team).hue) < TEAM_HUE_BAND;
}

/** Whether `colour` reads as neither team colour. */
function clearOfTeams(colour: number): boolean {
  return !readsAs(colour, FRIEND_COLOUR) && !readsAs(colour, FOE_COLOUR);
}

/**
 * `colour` as a cape draws it (#3628): as it is, unless it reads as
 * friend blue or foe red (`readsAs`), so no cape reads as a team. Then its
 * hue turns away from the nearer one, a degree at a time, chroma and
 * lightness kept, until it reads as neither. Equally near both, it
 * turns away from friend blue. Pure, so every peer draws the same, and
 * idempotent: what it returns is clear already. Remembered per colour,
 * since every cape is drawn every frame and a near-team colour costs up to
 * 360 turns.
 */
export function nudgeFromTeams(colour: number): number {
  let drawn = nudged.get(colour);
  if (drawn === undefined) {
    if (nudged.size >= MAX_NUDGED) {
      nudged.clear();
    }
    drawn = turnFromTeams(colour);
    nudged.set(colour, drawn);
  }
  return drawn;
}

/** Colours `nudgeFromTeams` has already turned, each to what it draws as. */
const nudged = new Map<number, number>();
/** Far more than a match's capes hold (16 players, 17 colours each). */
const MAX_NUDGED = 4096;

function turnFromTeams(colour: number): number {
  if (clearOfTeams(colour)) {
    return colour;
  }
  const { hue } = hueOf(colour);
  const team =
    wheelDistance(colour, FRIEND_COLOUR) <= wheelDistance(colour, FOE_COLOUR)
      ? FRIEND_COLOUR
      : FOE_COLOUR;
  // The signed turn from the team's hue to this one, in (-180, 180]: away is more of it.
  const apart = ((hue - hueOf(team).hue + 540) % 360) - 180;
  const away = apart < 0 ? -1 : 1;
  for (let turn = 1; turn <= 360; turn += 1) {
    const turned = withHue(colour, hue + away * turn);
    if (clearOfTeams(turned)) {
      return turned;
    }
  }
  return colour;
}

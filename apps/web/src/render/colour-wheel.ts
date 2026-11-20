/**
 * The colour wheel (#3628): where a colour sits on it, and how a picked
 * cape colour is kept off both team colours. Pure, so every peer draws
 * the same cape.
 */

/** Friend blue (docs/art/art-direction.md): you and your allies. */
export const FRIEND_COLOUR = 0x59c2ff;

/** Foe red (docs/art/art-direction.md): the other team. */
export const FOE_COLOUR = 0xff7b72;

/** A hand's width on the colour wheel: a quarter of its radius. */
export const HAND = 0.25;

/** A colour as its hue (radians), chroma and lightness, each of the last two 0 to 1. */
interface WheelColour {
  readonly hue: number;
  readonly chroma: number;
  readonly lightness: number;
}

function toWheel(colour: number): WheelColour {
  const r = ((colour >> 16) & 0xff) / 255;
  const g = ((colour >> 8) & 0xff) / 255;
  const b = (colour & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  if (chroma === 0) {
    return { hue: 0, chroma, lightness };
  }
  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return { hue: (sector / 6) * Math.PI * 2, chroma, lightness };
}

function fromWheel({ hue, chroma, lightness }: WheelColour): number {
  const turn = 1 / (Math.PI * 2);
  const sector = ((((hue * turn) % 1) + 1) % 1) * 6;
  const mid = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, mid, 0]
      : sector < 2
        ? [mid, chroma, 0]
        : sector < 3
          ? [0, chroma, mid]
          : sector < 4
            ? [0, mid, chroma]
            : sector < 5
              ? [mid, 0, chroma]
              : [chroma, 0, mid];
  const min = lightness - chroma / 2;
  const byte = (channel: number): number =>
    Math.min(255, Math.max(0, Math.round((channel + min) * 255)));
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** How far apart two colours sit on the colour wheel: hue the angle, chroma the radius. */
export function wheelDistance(a: number, b: number): number {
  const from = toWheel(a);
  const to = toWheel(b);
  return Math.hypot(
    Math.cos(from.hue) * from.chroma - Math.cos(to.hue) * to.chroma,
    Math.sin(from.hue) * from.chroma - Math.sin(to.hue) * to.chroma,
  );
}

/** How far a nudge turns the hue each step once the worked-out turn falls short by rounding. */
const NUDGE_STEP = Math.PI / 360;

/**
 * `colour` as a cape draws it (#3628): as it is unless it sits within a
 * `HAND` of friend blue or foe red, so no cape reads as a team. Then its
 * hue is turned away from the nearer of the two, friend blue on a tie,
 * until it is a hand clear, its chroma and lightness kept. A nudged
 * colour is clear, so nudging again leaves it.
 */
export function nudgeFromTeams(colour: number): number {
  const toFriend = wheelDistance(colour, FRIEND_COLOUR);
  const toFoe = wheelDistance(colour, FOE_COLOUR);
  if (Math.min(toFriend, toFoe) >= HAND) {
    return colour;
  }
  const team = toWheel(toFriend <= toFoe ? FRIEND_COLOUR : FOE_COLOUR);
  const own = toWheel(colour);
  const apart = Math.atan2(Math.sin(own.hue - team.hue), Math.cos(own.hue - team.hue));
  const away = apart < 0 ? -1 : 1;
  // Two colours of chroma c and t, θ apart in hue, are HAND apart where
  // cos θ = (c² + t² − HAND²) / 2ct. Rounding to bytes may fall short of
  // it, so the turn then grows a step at a time.
  const cosine = (own.chroma ** 2 + team.chroma ** 2 - HAND ** 2) / (2 * own.chroma * team.chroma);
  let turn = Math.acos(Math.min(1, Math.max(-1, cosine)));
  let nudged = fromWheel({ ...own, hue: team.hue + away * turn });
  while (
    Math.min(wheelDistance(nudged, FRIEND_COLOUR), wheelDistance(nudged, FOE_COLOUR)) < HAND &&
    turn < Math.PI
  ) {
    turn += NUDGE_STEP;
    nudged = fromWheel({ ...own, hue: team.hue + away * turn });
  }
  return nudged;
}

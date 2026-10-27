import type { StatusId, Vec2 } from "@vibewars/game-core";

/**
 * Status icons under an actor (#75, docs/art/art-direction.md).
 *
 * An icon's plate shape says its category (condition: circle, hex: diamond,
 * enchantment: rounded square, stance: pentagon, preparation: triangle
 * point up, glyph: triangle point down, shout: hexagon, chant: banner,
 * weapon spell: shield, skill effect: wide capsule)
 * and is baked into the SVG, so the scene
 * draws no plates of its own. Shape and glyph carry the meaning; colour
 * only backs them up, which is the point for a colour-blind player.
 *
 * No Phaser here, so the map and the layout can be tested in Node.
 */

function icon(id: StatusId): string {
  return `${import.meta.env.BASE_URL}icons/status/${id}.svg`;
}

/** Every status's icon. A `Record` over `StatusId`, so a new status without one does not compile. */
export const STATUS_ICON: Readonly<Record<StatusId, string>> = {
  bleeding: icon("bleeding"),
  burning: icon("burning"),
  poison: icon("poison"),
  crippled: icon("crippled"),
  blind: icon("blind"),
  weakness: icon("weakness"),
  "cracked-armor": icon("cracked-armor"),
  "deep-wound": icon("deep-wound"),
  dazed: icon("dazed"),
  disease: icon("disease"),
  faintheartedness: icon("faintheartedness"),
  malaise: icon("malaise"),
  backfire: icon("backfire"),
  empathy: icon("empathy"),
  "parasitic-bond": icon("parasitic-bond"),
  contagion: icon("contagion"),
  "shard-storm": icon("shard-storm"),
  "shadow-of-fear": icon("shadow-of-fear"),
  "spiteful-spirit": icon("spiteful-spirit"),
  "insidious-parasite": icon("insidious-parasite"),
  "mark-of-pain": icon("mark-of-pain"),
  regeneration: icon("regeneration"),
  "blood-ritual": icon("blood-ritual"),
  "armor-boost": icon("armor-boost"),
  guardian: icon("guardian"),
  mending: icon("mending"),
  sprint: icon("sprint"),
  dash: icon("dash"),
  frenzy: icon("frenzy"),
  "dark-escape": icon("dark-escape"),
  "natural-stride": icon("natural-stride"),
  "watch-yourself": icon("watch-yourself"),
  "healing-signet-armor": icon("healing-signet-armor"),
  "apply-poison": icon("apply-poison"),
  "glyph-of-lesser-energy": icon("glyph-of-lesser-energy"),
  "anthem-of-flame": icon("anthem-of-flame"),
  "weapon-of-warding": icon("weapon-of-warding"),
  "mystic-regeneration": icon("mystic-regeneration"),
  "fleeting-stability": icon("fleeting-stability"),
  "heart-of-fury": icon("heart-of-fury"),
  "never-surrender": icon("never-surrender"),
};

/** Drawn size of one icon, in world pixels. */
export const STATUS_ICON_SIZE = 16;
const GAP = 2;
/** Below the actor's edge, so the row clears the circle. */
const OFFSET = 6;
/** More than this many statuses and the last slot becomes `+N`. */
const MAX_ICONS = 6;

export interface StatusRow {
  /** Centre of each icon to draw, left to right. */
  readonly icons: readonly Vec2[];
  /** The `+N` in the last slot when there are too many to show, else `undefined`. */
  readonly overflow: { readonly count: number; readonly position: Vec2 } | undefined;
}

/**
 * Where `count` status icons go under an actor at (`x`, `y`): one centred
 * row, its top edge `radius + 6` below the centre. Past six statuses, five
 * icons and then `+N` for the rest, in the sixth slot.
 */
export function statusRowLayout(count: number, x: number, y: number, radius: number): StatusRow {
  const slots = Math.min(count, MAX_ICONS);
  const width = slots * STATUS_ICON_SIZE + (slots - 1) * GAP;
  const centreY = y + radius + OFFSET + STATUS_ICON_SIZE / 2;
  const slotAt = (index: number): Vec2 => ({
    x: x - width / 2 + STATUS_ICON_SIZE / 2 + index * (STATUS_ICON_SIZE + GAP),
    y: centreY,
  });

  if (count <= MAX_ICONS) {
    return { icons: Array.from({ length: slots }, (_, i) => slotAt(i)), overflow: undefined };
  }
  const shown = MAX_ICONS - 1;
  return {
    icons: Array.from({ length: shown }, (_, i) => slotAt(i)),
    overflow: { count: count - shown, position: slotAt(shown) },
  };
}

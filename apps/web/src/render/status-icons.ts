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
  diversion: icon("diversion"),
  "arcane-echo": icon("arcane-echo"),
  echo: icon("echo"),
  "ice-spikes": icon("ice-spikes"),
  "deep-freeze": icon("deep-freeze"),
  regeneration: icon("regeneration"),
  "blood-ritual": icon("blood-ritual"),
  "armor-boost": icon("armor-boost"),
  guardian: icon("guardian"),
  mending: icon("mending"),
  "patient-spirit": icon("patient-spirit"),
  "holy-veil": icon("holy-veil"),
  "protective-spirit": icon("protective-spirit"),
  "shadow-refuge": icon("shadow-refuge"),
  "shroud-of-distress": icon("shroud-of-distress"),
  "reversal-of-fortune": icon("reversal-of-fortune"),
  "vigorous-spirit": icon("vigorous-spirit"),
  sprint: icon("sprint"),
  dash: icon("dash"),
  frenzy: icon("frenzy"),
  "dark-escape": icon("dark-escape"),
  "natural-stride": icon("natural-stride"),
  "lightning-reflexes": icon("lightning-reflexes"),
  escape: icon("escape"),
  "mantra-of-recovery": icon("mantra-of-recovery"),
  "watch-yourself": icon("watch-yourself"),
  "healing-signet-armor": icon("healing-signet-armor"),
  "for-great-justice": icon("for-great-justice"),
  "critical-eye": icon("critical-eye"),
  "fall-back": icon("fall-back"),
  "stand-your-ground": icon("stand-your-ground"),
  incoming: icon("incoming"),
  "make-haste": icon("make-haste"),
  "defensive-anthem": icon("defensive-anthem"),
  "song-of-restoration": icon("song-of-restoration"),
  "apply-poison": icon("apply-poison"),
  "glyph-of-lesser-energy": icon("glyph-of-lesser-energy"),
  "anthem-of-flame": icon("anthem-of-flame"),
  "weapon-of-warding": icon("weapon-of-warding"),
  "spirit-light-weapon": icon("spirit-light-weapon"),
  "weapon-of-quickening": icon("weapon-of-quickening"),
  "weapon-of-aggression": icon("weapon-of-aggression"),
  "weapon-of-remedy": icon("weapon-of-remedy"),
  "vengeful-weapon": icon("vengeful-weapon"),
  "splinter-weapon": icon("splinter-weapon"),
  "mystic-regeneration": icon("mystic-regeneration"),
  "fleeting-stability": icon("fleeting-stability"),
  "heart-of-fury": icon("heart-of-fury"),
  "vow-of-strength": icon("vow-of-strength"),
  "sand-shards": icon("sand-shards"),
  "pious-haste": icon("pious-haste"),
  "pious-haste-run": icon("pious-haste-run"),
  "staggering-force": icon("staggering-force"),
  "dust-cloak": icon("dust-cloak"),
  "aura-of-thorns": icon("aura-of-thorns"),
  "never-surrender": icon("never-surrender"),
  winnowing: icon("winnowing"),
  recuperation: icon("recuperation"),
  "ward-against-melee": icon("ward-against-melee"),
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

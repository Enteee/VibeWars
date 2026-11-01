// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  burst,
  nextTrigger,
  holyStar,
  sideSpear,
  RIDER,
  NOT,
  riderOn,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  spear: {
    means: "spear",
    draw: () => inkLine("M12 21V9", 2.4) + inkFill("M12 2.5L16.5 10H7.5Z"),
  },
  "spear-bolt": {
    means: "A spearhead on a shaft that is a bolt: a spear thrown as lightning (#934).",
    draw: () => inkFill("M12 2.5L16.5 10H7.5Z") + inkLine("M12 10L9 14.5L15 16L12 21.5", 2.4),
  },
  arrow: {
    means: "`renew`.",
    draw: () => inkLine("M4 20L15 9", 2.2) + inkFill("M21 3L11.5 6L18 12.5Z"),
  },
  volley: {
    means: "volley",
    draw: () =>
      [-4.5, 0, 4.5]
        .map(
          (d) =>
            `<g transform="translate(${String(d)},${String(-d)})">${inkLine("M4 18L15 7M10 6.5H15.5V12", 2)}</g>`,
        )
        .join(""),
  },
  caltrops: {
    means: "Three spikes on the ground: they cripple and bleed what steps on them (#1349).",
    draw: () =>
      inkFill("M2.5 20H21.5V22.5H2.5Z") +
      inkFill("M2.5 20L5.5 4L8.5 20ZM9 20L12 2L15 20ZM15.5 20L18.5 4L21.5 20Z"),
  },
  "bow-recharge": {
    means: "Practiced Stance: a drawn bow and the recharge arrow beside it.",
    draw: () =>
      inkLine("M7 2.5C0 8 0 16 7 21.5", 2.8) +
      inkLine("M7 2.5V21.5", 1.2) +
      inkLine("M20 9a5.2 5.2 0 1 0 1.2 4.4", 2.2) +
      inkLine("M17.5 6.5L20.5 9.3L17 11", 2),
  },
  "arrow-power": {
    means:
      "Ranger staples 2 (#1629, #1684): the arrow family, each with its rider or its own shaft.",
    draw: () =>
      inkLine("M3.5 20.5L14 10", 4) +
      inkFill("M23 1.5L10 6L18.5 14.5Z") +
      inkLine("M3 14L6 17M7 10L10 13", 1.8),
  },
  "arrow-aim": {
    means: "arrow aim",
    draw: () =>
      `<circle cx="16" cy="8" r="5.6" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M16 0.8V3.6M16 12.4V15.2M8.8 8H11.6M20.4 8H23.2", 1.8) +
      inkLine("M3 21L12.5 11.5", 2.4) +
      inkFill("M16.5 7.5L10 9.5L14.5 14Z"),
  },
  "arrow-unbound": {
    means: "arrow unbound",
    draw: () => riderOn(glyph("arrow"), RIDER.ring),
  },
  "arrow-keen": {
    means: "arrow keen",
    draw: () =>
      inkLine("M3.5 20.5L13 11", 2.2) +
      inkFill("M12 11L10 1.5L13.5 7L21.5 3L17 9.5L22.5 14.5L15 13.5Z"),
  },
  "arrow-energy": {
    means: "arrow energy",
    draw: () => riderOn(glyph("arrow"), glyph("energy")),
  },
  "arrow-kindle": {
    means: "arrow kindle",
    draw: () => riderOn(glyph("arrow"), glyph("flame")),
  },
  "arrow-ignite": {
    means: "arrow ignite",
    draw: () => riderOn(glyph("arrow"), RIDER.burst),
  },
  "arrow-poison": {
    means: "arrow poison",
    draw: () => riderOn(glyph("arrow"), RIDER.drop),
  },
  "trap-dust": {
    means: "trap dust",
    draw: () =>
      `<g transform="translate(12,9) scale(0.7) translate(-12,-12)">${glyph("dust")}</g>` +
      inkLine("M3 20H21", 2.5) +
      inkLine("M5 20L7 16L9 20M10 20L12 16L14 20M15 20L17 16L19 20", 2),
  },
  "trap-spike": {
    means: "trap spike",
    draw: () =>
      inkLine("M3 21H21", 2.5) + inkFill("M4 20L7 4L10 20ZM10 20L12 8L14 20ZM14 20L17 4L20 20Z"),
  },
  "arrow-idle": {
    means: "arrow idle",
    draw: () => riderOn(glyph("arrow"), NOT.skill),
  },
  "arrow-lava": {
    means: "Lava Arrows (#1914): an arrow trailing drops of lava.",
    draw: () =>
      inkLine("M3 14L14 3", 2.2) +
      inkFill("M21 2L10 5L18 13Z") +
      [
        [6, 18],
        [11, 16],
        [8, 22],
      ]
        .map(([x, y]) =>
          inkFill(
            `M${String(x)} ${String((y ?? 0) - 2.6)}L${String((x ?? 0) + 2)} ${String(y)}A2 2 0 0 1 ${String((x ?? 0) - 2)} ${String(y)}Z`,
          ),
        )
        .join(""),
  },
  "arrow-focus": {
    means: "Focused Shot (#1914): an arrow driven into the middle of a ring.",
    draw: () =>
      `<circle cx="10.5" cy="13.5" r="7.5" ${stroke(C.ink, 1.6)}/>` +
      inkLine("M21.5 2.5L13 11", 2.2) +
      inkFill("M10.5 13.5L12 8.5L15.5 12Z"),
  },
  "arrow-fork": {
    means: "Forked Arrow (#1914): one shaft, two heads.",
    draw: () =>
      inkLine("M2 12H10M10 12L18 5M10 12L18 19", 2.2) +
      inkFill("M22 2L14.5 3.5L20.5 9.5Z") +
      inkFill("M22 22L14.5 20.5L20.5 14.5Z"),
  },
  "arrow-needle": {
    means: "Needling Shot (#1914): a thin needle with its eye, the thread's loop.",
    draw: () =>
      inkLine("M7 17L19 5", 1.4) +
      inkFill("M22 2L16.5 4L20 7.5Z") +
      `<ellipse cx="5" cy="19" rx="2.2" ry="3.2" transform="rotate(45 5 19)" ${stroke(C.ink, 1.4)}/>`,
  },
  "arrow-drip": {
    means: "Poison Tip Signet (#1916): an arrow whose next strike carries a drop.",
    draw: () =>
      inkLine("M3 14L12 5", 2.4) +
      inkFill("M21 2L9 5.5L17.5 14Z") +
      inkFill("M19 15C19 15 16.2 18.5 16.2 20.2A2.8 2.8 0 0 0 21.8 20.2C21.8 18.5 19 15 19 15Z"),
  },
  "trap-flame": {
    means: "A flame over a ground line with teeth: a trap that burns (#1217).",
    draw: () =>
      `<g transform="translate(12,9) scale(0.62) translate(-12,-12)">${glyph("flame")}</g>` +
      inkLine("M3 20H21", 2.5) +
      inkLine("M5 20L7 16L9 20M10 20L12 16L14 20M15 20L17 16L19 20", 2),
  },
  "spear-barb": {
    means: "A spear with barbs on its shaft: it hooks and bleeds (#1036).",
    draw: () =>
      inkLine("M12 21V9", 2.4) +
      inkFill("M12 2.5L16.5 10H7.5Z") +
      inkLine("M12 18L7.5 14.5M12 14L16.5 10.5", 2),
  },
  "spear-flame": {
    means:
      "The Paragon thrown spears (#1508): a spear on the left, the rider on the right; a drop badge below is Deep Wound.",
    draw: () =>
      sideSpear() +
      `<path d="M14 3.5c.5 3.5 4 5.5 4 10a6 6 0 0 1-12 0c0-2.5 1-4.5 2.5-5.5 0 2 .5 3 1.5 3.5-.5-3 1-6 4-8z" fill="${C.ink}" transform="translate(11.5 2.5) scale(0.6)"/>`,
  },
  "spear-fast": {
    means: "spear fast",
    draw: () =>
      sideSpear() +
      inkLine("M12.5 8L16 4.5L19.5 8M12.5 13L16 9.5L19.5 13M12.5 18L16 14.5L19.5 18", 2),
  },
  "spear-weak": {
    means: "spear weak",
    draw: () => sideSpear() + inkLine("M17 4V15M13.5 11.5L17 15L20.5 11.5", 2.4),
  },
  "spear-crit": {
    means: "spear crit",
    draw: () => sideSpear() + inkFill("M17.5 2.5L19 6.5L23 8L19 9.5L17.5 13.5L16 9.5L12 8L16 6.5Z"),
  },
  "spear-heart": {
    means: "spear heart",
    draw: () =>
      sideSpear() +
      inkLine(
        "M17 14L12.8 9.7C11.5 8.2 12.6 5.5 14.7 5.5C15.8 5.5 16.6 6.1 17 7C17.4 6.1 18.2 5.5 19.3 5.5C21.4 5.5 22.5 8.2 21.2 9.7Z",
        1.7,
      ),
  },
  "spear-crack": {
    means: "spear crack",
    draw: () =>
      sideSpear() +
      `<path d="M17 3L22 5V9.5C22 12 19.8 13.3 17 14.5C14.2 13.3 12 12 12 9.5V5Z" ${stroke(C.ink, 1.7)}/>` +
      inkLine("M17 4.5L15.5 8.5L18.5 9.5L17 13", 1.5),
  },
  "spear-burst": {
    means: "spear burst",
    draw: () =>
      sideSpear() +
      `<g transform="translate(17,8.5) scale(0.62) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "spear-cleanse": {
    means: "spear cleanse",
    draw: () =>
      sideSpear() +
      inkFill("M17 3C18.8 5.8 21 7.5 21 10A4 4 0 0 1 13 10C13 7.5 15.2 5.8 17 3Z") +
      `<path d="M13 13.5L21 5" ${stroke(C.bg, 2)}/>`,
  },
  "spear-swipe": {
    means: "spear swipe",
    draw: () =>
      inkLine("M3.5 21L14.5 10", 2.4) +
      inkFill("M20 3.5L11.5 6.5L17 12Z") +
      inkLine("M2.5 13A10.5 10.5 0 0 1 11.5 3", 2.2),
  },
  "spear-pierce": {
    means: "A shield with a spear driven through it: nothing blocks the throw (#1508).",
    draw: () =>
      `<path d="M12 4L19.5 6.8V12C19.5 16 16.5 18.8 12 20.5C7.5 18.8 4.5 16 4.5 12V6.8Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M2.5 21.5L15 9", 2.8) +
      inkFill("M22 2L16 3.8L12.8 6L18 11.2Z"),
  },
  "spear-dash": {
    means: "A spear with speed lines trailing it: a toss at a runner (#1036).",
    draw: () =>
      inkLine("M15 21V9", 2.4) + inkFill("M15 2.5L19.5 10H10.5Z") + inkLine("M4 11V17M8 13V20", 2),
  },
  "arrow-burst": {
    means: "A shaft whose head is a burst: a shot that breaks a cast (#1018).",
    draw: () =>
      inkLine("M5 21L16 10", 2.2) +
      inkFill("M22 4L12.5 7L19 13.5Z") +
      `<g transform="translate(9,3) scale(0.5)">${inkFill(burst(5))}</g>`,
  },
  "arrow-pierce": {
    means: "An arrow through a shield: nothing blocks it (#1018).",
    draw: () =>
      `<path d="M12 4L19.5 6.8V12C19.5 16 16.5 18.8 12 20.5C7.5 18.8 4.5 16 4.5 12V6.8Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M2.5 21.5L16 8", 2.4) +
      inkFill("M21.5 2.5L12 5.5L18.5 12Z"),
  },
  "arrow-flame": {
    means: "A shaft with a flame for a head: a burning arrow (#1018).",
    draw: () =>
      inkLine("M3.5 20.5L13 11", 2.2) +
      inkFill(
        "M18 2.5c.5 3 3.5 4.3 3.5 7.5a4.7 4.7 0 0 1-9.4 0c0-2 .8-3.5 2-4.3 0 1.5.4 2.3 1.2 2.7-.4-2.3.8-4.7 2.7-5.9z",
      ),
  },
  trident: {
    means: "Three prongs on a shaft: a trident thrown through water (#1007).",
    draw: () => inkLine("M12 21V3M5.5 4V9Q5.5 13 12 13Q18.5 13 18.5 9V4", 2.4),
  },
  "spear-ice": {
    means: "A long spear: a barbed head, a shaft, a fletch (#1440).",
    draw: () =>
      inkLine("M3.5 20.5L14 10", 2.4) +
      inkFill("M21 3L19.5 11.5L12.5 4.5Z") +
      inkLine("M3.5 14.5L9.5 20.5", 2),
  },
  "arrow-bolt": {
    means: "Shock Arrow: an arrow with a bolt across its shaft (#1572).",
    draw: () =>
      inkLine("M3.5 20.5L17 7", 2.4) +
      inkFill("M22 2L20.5 10L14 3.5Z") +
      inkLine("M8 4.5L5.5 10H10L7.5 15.5", 2),
  },
  "spear-light": {
    means: "spear light",
    draw: () =>
      inkLine("M3.5 21L15 9.5", 2.4) +
      inkFill("M22 2L20.5 10L14 3.5Z") +
      holyStar(18, 18, 4.5) +
      `<g transform="translate(0,0)">${nextTrigger.attack()}</g>`,
  },
  "javelin-bolt": {
    means: "A thrown spear whose shaft is a zigzag bolt.",
    draw: () =>
      inkFill("M21.5 2.5L22 10L14.5 6.5Z") +
      inkLine("M18 6L12 10L15 12L8 16L10.5 17.5L3.5 21", 2.4),
  },
  "arrow-twin": {
    means: "The Ranger's staples (#1539, #1585): an arrow and what it brings.",
    draw: () =>
      `<g transform="translate(8.2,15.8) scale(0.8) translate(-12,-12)">${glyph("arrow")}</g>` +
      `<g transform="translate(15.8,8.2) scale(0.8) translate(-12,-12)">${glyph("arrow")}</g>`,
  },
  "arrow-spent-ring": {
    means: "An arrow and a broken ring for the enchantment it spends.",
    draw: () =>
      `<g transform="translate(14,10) scale(0.85) translate(-12,-12)">${glyph("arrow")}</g>` +
      `<circle cx="7" cy="17" r="4.2" ${stroke(C.ink, 2)} stroke-dasharray="3.4 2.4"/>`,
  },
  "arrow-fast": {
    means: "An arrow with speed chevrons.",
    draw: () =>
      `<g transform="translate(15,9) scale(0.85) translate(-12,-12)">${glyph("arrow")}</g>` +
      `<g transform="translate(6.5,17.5) scale(0.55) translate(-12,-12)">${glyph("speed")}</g>`,
  },
  "arrow-close": {
    means: "An arrow into a close target.",
    draw: () =>
      inkLine("M3 21L11.5 12.5", 2.4) +
      inkFill("M16 8L8.5 10L14 15.5Z") +
      `<circle cx="18" cy="6" r="4" ${stroke(C.ink, 2)}/><circle cx="18" cy="6" r="1.2" fill="${C.ink}"/>`,
  },
  "arrow-dodge": {
    means: "Chevrons under an arrow flying past.",
    draw: () =>
      `<g transform="translate(12,15.5) scale(0.8) translate(-12,-12)">${glyph("speed")}</g>` +
      inkLine("M3 5H16", 2.2) +
      inkFill("M22 5L16 2V8Z"),
  },
  "arrow-aimed": {
    means: "Ranger staples 3 (#1697): the shot, the pet, the trap and the stance.",
    draw: () =>
      `<path d="M14 3L20.5 5.5V11C20.5 15 17.5 18 14 20C10.5 18 7.5 15 7.5 11V5.5Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M2 12H17", 2.4) +
      inkFill("M23 12L16.5 8V16Z") +
      inkLine("M2 6.5H7M2 17.5H7", 2),
  },
  "arrow-over-shield": {
    means: "An arrow arcing over a small shield and landing behind it: no block stops it (#1768).",
    draw: () =>
      `<path d="M10 11L15 13V16C15 18.4 13 19.8 10 21C7 19.8 5 18.4 5 16V13Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M2 11C3 5.5 9 2.5 17.5 4.4", 2.2) +
      inkFill("M22.5 6L16.3 7.5L18.1 1.4Z"),
  },
  "arrow-barbed": {
    means: "A shaft with hooked barbs trailing behind its head (#1768).",
    draw: () =>
      inkLine("M3 21L14.5 9.5", 2.2) +
      inkLine("M7 17L3.5 16.5M10 14L6.5 13.5M7 17L7.5 20.5M10 14L10.5 17.5", 1.8) +
      inkFill("M21.5 2.5L11.5 5.5L18.5 12.5Z"),
  },
  "arrow-leaf": {
    means: "An arrow whose fletching is a leaf: the elite Melandru's arrows (#1768).",
    draw: () =>
      inkLine("M5.5 18.5L14 10", 2.2) +
      `<path d="M2 11C2 6 5 3 10 3C10 8 7 11 2 11Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M3.5 9.5L8 5", 1.5) +
      inkFill("M21.5 2.5L11.5 5.5L18.5 12.5Z"),
  },
  "arrow-wind": {
    means: "A short arrow with a wind curl streaming behind it: it flies twice as fast (#1768).",
    draw: () =>
      inkLine("M10 14L17 7", 2.2) +
      inkFill("M22 2.5L13.5 4.5L19.5 10.5Z") +
      `<path d="M2 10H8.5a2.5 2.5 0 1 0-2.5-2.5" ${stroke(C.ink, 1.8)}/>` +
      `<path d="M2 14H7M2 18.5H9.5a2.2 2.2 0 1 1-2.2 2.2" ${stroke(C.ink, 1.8)}/>`,
  },
  "arrow-sunder": {
    means: "An arrow through a split shield: armor that gives way.",
    draw: () =>
      `<path d="M11 3L19.5 6V12C19.5 16.5 16 19.5 11 21.5C6 19.5 2.5 16.5 2.5 12V6Z" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M11 6.5L8.5 11L12.5 13.5L10 18", 2) +
      inkLine("M22 3L15.5 9.5", 2.2) +
      inkFill("M12 12.5L13 6.5L18.5 12Z"),
  },
  "arrow-bars-up": {
    means: "Expert's Dexterity: an arrow in flight above three rising bars.",
    draw: () =>
      inkLine("M3 6.5H16", 2.4) +
      inkFill("M23 6.5L15 2V11Z") +
      inkLine("M3 6.5L1.5 4M5.5 6.5L4 4M3 6.5L1.5 9M5.5 6.5L4 9", 1.5) +
      inkFill("M3 21V17H6V21ZM8.5 21V13.5H11.5V21ZM14 21V10H17V21Z"),
  },
  "arrow-lob": {
    means: "A lobbed arc falling on a ground bar.",
    draw: () =>
      `<path d="M3 17C4 6 14 2 19 12" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M19.5 21L15 13.5L23 14Z") +
      inkLine("M2.5 22H12", 2),
  },
  "arrow-splinter": {
    means: "An arrow whose point throws three shards.",
    draw: () =>
      inkLine("M3 21L12 12", 2.4) +
      inkFill("M13 11L8.5 11.8L12.2 15.5Z") +
      inkLine("M14 9L15 2.5M15.5 10.5L21.5 6M16 12.5L22 13", 2.4),
  },
  "arrow-ring-break": {
    means: "An arrow through a dashed spell ring.",
    draw: () =>
      `<circle cx="15" cy="9" r="7" ${stroke(C.ink, 2)} stroke-dasharray="4.4 3.2"/>` +
      inkLine("M2.5 21.5L14 10", 2.4) +
      inkFill("M21 3L10.5 6L18 13.5Z"),
  },
  tripwire: {
    means: "Two posts with a sagging wire and a mark above.",
    draw: () =>
      inkLine("M4 6V21M20 6V21", 2.6) +
      `<path d="M4 15Q12 20 20 15" ${stroke(C.ink, 1.6)} stroke-dasharray="2.2 2.2"/>` +
      inkLine("M2 21.5H6M18 21.5H22", 2.2) +
      inkFill("M12 3L14.5 8H9.5Z"),
  },
};

export default glyphs;

// Glyphs (#2516): the stand-ins of #2499 and #2500.

import { C, stroke } from "../icon-kit.mjs";
import {
  bladeMark,
  inkFill,
  inkLine,
  punisher,
  spiritPost,
  wasUrn,
  blockShield,
  smallFigure,
} from "../glyph-kit.mjs";

/** The flame of the fire skills, in the box 3..21, scaled by `k` and centred on a point. @param {number} cx @param {number} cy @param {number} k */
const flame = (cx, cy, k) =>
  `<g transform="translate(${String(cx)},${String(cy)}) scale(${String(k)}) translate(-12,-12)">` +
  inkFill(
    "M12 2.500C14 7 18 9 18 14.500A6 6 0 0 1 6 14.500C6 12 7.500 10.500 8.500 9C9 11 10 11.500 10.500 11C9.500 8 10.500 5 12 2.500Z",
  ) +
  "</g>";

/** A plus, filled, centred on a point. @param {number} cx @param {number} cy @param {number} r */
const plus = (cx, cy, r) => {
  const a = r / 3;
  const p = (/** @type {number} */ n) => n.toFixed(2);
  return inkFill(
    `M${p(cx - a)} ${p(cy - r)}H${p(cx + a)}V${p(cy - a)}H${p(cx + r)}V${p(cy + a)}H${p(cx + a)}V${p(cy + r)}H${p(cx - a)}V${p(cy + a)}H${p(cx - r)}V${p(cy - a)}H${p(cx - a)}Z`,
  );
};

/** A signet ring, centred on a point. @param {number} cx @param {number} cy @param {number} r */
const ring = (cx, cy, r) =>
  `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(r)}" ${stroke(C.ink, 2.2)}/>` +
  `<circle cx="${String(cx)}" cy="${String(cy - r)}" r="2" fill="${C.ink}"/>`;

/** A padlock, centred on a point. @param {number} cx @param {number} cy */
const lock = (cx, cy) =>
  inkFill(
    `M${String(cx - 4.5)} ${String(cy - 1)}H${String(cx + 4.5)}V${String(cy + 6)}H${String(cx - 4.5)}Z`,
  ) +
  inkLine(
    `M${String(cx - 2.5)} ${String(cy - 1)}V${String(cy - 4)}a2.500 2.500 0 0 1 5 0V${String(cy - 1)}`,
    1.8,
  );

/** A held urn of ashes holding `mark`. */
const urn = (/** @type {string} */ mark) => wasUrn(mark);

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "hex-hourglass-held": {
    means: "Mantra of Persistence: an hourglass in the hex ring: your hexes last longer.",
    draw: () => punisher(inkFill("M7 3H17L12.500 12L17 21H7L11.500 12Z")),
  },
  "weight-hung": {
    means: "Kitah's Burden: a heavy weight on its ring: the foe is slowed and bled by every step.",
    draw: () =>
      inkLine("M9.500 6.500a2.500 2.500 0 0 1 5 0", 2) +
      inkFill("M7 8H17L20 21H4Z") +
      inkLine("M8.500 16H15.500", 1.6),
  },
  "ring-fast": {
    means: "Symbolic Posture: a signet ring with speed arcs behind it: signets come back faster.",
    draw: () =>
      ring(8, 13.5, 5.5) + inkLine("M16.500 8a6.500 6.500 0 0 1 0 11M20 5a11 11 0 0 1 0 17", 1.8),
  },
  "shield-flame-in": {
    means: "Burning Shield: a flame set in a shield: the blocked attacker is burned.",
    draw: () => blockShield("M12 2.500L12 2.500Z") + flame(12, 12.5, 0.62),
  },
  "drops-doubled": {
    means: "Scourge Sacrifice: a drop twice over in the hex ring: every sacrifice counts double.",
    draw: () =>
      punisher(
        inkFill(
          "M8.500 4C11 8 13.500 10 13.500 13.500A5 5 0 0 1 3.500 13.500C3.500 10 6 8 8.500 4Z",
        ) +
          inkFill(
            "M17 9C18.500 11.500 20.500 13 20.500 15.500A3.500 3.500 0 0 1 13.500 15.500C13.500 13 15.500 11.500 17 9Z",
          ),
      ),
  },
  "sword-snapped-hex": {
    means: "Amity: a sword snapped in two in the hex ring: foes cannot strike.",
    draw: () =>
      punisher(
        inkLine("M3.500 20.500L10.500 13.500M13.500 10.500L20.500 3.500M5 14.500l4.500 4.500", 2.4),
      ),
  },
  "figure-rise": {
    means: "Resurrect: a figure standing up from the ground under rays: the dead are raised.",
    draw: () =>
      inkLine("M3 21H21", 2.4) +
      smallFigure(12, 14, 0.95) +
      inkLine("M12 2V3.500M5.500 5.500L7 7M18.500 5.500L17 7", 1.8),
  },
  "ring-plus-plus": {
    means: "Boon Signet: a signet ring beside two pluses: the next heal on an ally is stronger.",
    draw: () => ring(8.5, 15, 5) + plus(16.5, 7, 4.5) + plus(17.5, 17, 3),
  },
  "circle-allies-plus": {
    means: "Karei's Healing Circle: a ring of allies round a plus: the whole party is healed.",
    draw: () =>
      plus(12, 12, 4) +
      [0, 1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<circle cx="${(12 + 8.2 * Math.cos((i * Math.PI) / 3)).toFixed(2)}" cy="${(12 + 8.2 * Math.sin((i * Math.PI) / 3)).toFixed(2)}" r="2" fill="${C.ink}"/>`,
        )
        .join(""),
  },
  "spirit-heart": {
    means: "Supportive Spirit: the spirit post beside a heart: it heals your allies.",
    draw: () =>
      spiritPost() +
      inkFill(
        "M16 20C11 16.500 11 12.500 13.500 11.500C15 11 16 12 16 13C16 12 17 11 18.500 11.500C21 12.500 21 16.500 16 20Z",
      ),
  },
  "flames-twin": {
    means: "Double Dragon: two flames leaning apart: fire thrown to both sides.",
    draw: () =>
      `<g transform="rotate(-14 7 18)">${flame(7, 12, 0.85)}</g>` +
      `<g transform="rotate(14 17 18)">${flame(17, 12, 0.85)}</g>`,
  },
  "heat-rising": {
    means: "Teinai's Heat: wavy heat rising off the ground: a ward that burns what stands in it.",
    draw: () =>
      inkLine("M3 21H21", 2.4) +
      inkLine(
        "M6.500 17C4.500 15 8.500 13 6.500 11C4.500 9 8.500 7 6.500 5M12 17C10 15 14 13 12 11C10 9 14 7 12 5M17.500 17C15.500 15 19.500 13 17.500 11C15.500 9 19.500 7 17.500 5",
        2,
      ),
  },
  "grit-gust": {
    means: "Sandstorm: wind lines curling around grains of sand: a storm that blinds and chips.",
    draw: () =>
      inkLine("M3 8H15a3 3 0 1 0-3-3M3 13H19a3 3 0 1 1-3 3M3 18H11", 2) +
      `<circle cx="20" cy="8" r="1.200" fill="${C.ink}"/><circle cx="19" cy="11" r="1" fill="${C.ink}"/><circle cx="14.500" cy="21" r="1.200" fill="${C.ink}"/>`,
  },
  "flame-sigil": {
    means: "Glyph of Immolation: a flame on a sigil ring: the next fire spell burns more.",
    draw: () =>
      `<circle cx="12" cy="12" r="9.500" ${stroke(C.ink, 1.8)} stroke-dasharray="2.600 2"/>` +
      flame(12, 12.5, 0.62),
  },
  "urn-ankh": {
    means: "Lively was Naomei: the urn of ashes with an ankh in it: the dead rise as it falls.",
    draw: () =>
      urn(
        inkLine("M12 13.500V19M9.500 16H14.500", 1.8) +
          `<circle cx="12" cy="12" r="1.200" fill="${C.ink}"/>`,
      ),
  },
  "urn-voice": {
    means:
      "Vocal was Sogolon: the urn of ashes with sound arcs in it: shouts and chants last longer.",
    draw: () => urn(inkLine("M10 12.500a3 3 0 0 1 0 5M13.500 10.500a6 6 0 0 1 0 9", 1.8)),
  },
  "blade-bolt": {
    means: "Wielder's Zeal: a sword with an energy bolt: Energy for each weapon spell.",
    draw: () => bladeMark(inkFill("M9 2L4 9.500H7.500L5.500 14.500L11 7.500H7.500Z")),
  },
  "eye-rayed": {
    means: "Sight Beyond Sight: an open eye under rays: you cannot be blinded.",
    draw: () =>
      inkLine("M3 15Q12 6 21 15Q12 24 3 15Z", 2) +
      `<circle cx="12" cy="15" r="2.600" fill="${C.ink}"/>` +
      inkLine("M12 2V5M5 4.500L6.800 7M19 4.500L17.200 7", 2),
  },
  "blade-drop-tick": {
    means:
      "Wielder's Remedy: a sword beside a drop struck through: conditions cured by weapon spells.",
    draw: () =>
      bladeMark(
        inkFill(
          "M7.500 2.500C10 6.500 11.500 8 11.500 10.500A4 4 0 0 1 3.500 10.500C3.500 8 5 6.500 7.500 2.500Z",
        ) +
          `<path d="M3 13L12 4.500" ${stroke(C.bg, 2.6)}/>` +
          inkLine("M3.500 12.500L11.500 5", 1.6),
      ),
  },
  "urn-ally": {
    means:
      "Caretaker's Charge: the urn of ashes holding a heart: its charge is spent for the ally.",
    draw: () =>
      urn(
        inkFill(
          "M12 19.500C8.500 17 8.500 13.500 10.300 12.800C11.300 12.500 12 13.200 12 14C12 13.200 12.700 12.500 13.700 12.800C15.500 13.500 15.500 17 12 19.500Z",
        ),
      ),
  },
  "eye-sick": {
    means: "Angorodon's Gaze: an eye over a drop: the gaze poisons.",
    draw: () =>
      inkLine("M3 9Q12 1 21 9Q12 17 3 9Z", 2) +
      `<circle cx="12" cy="9" r="2.200" fill="${C.ink}"/>` +
      inkFill(
        "M12 13C14 16 15.500 17.500 15.500 19.500A3.500 3.500 0 0 1 8.500 19.500C8.500 17.500 10 16 12 13Z",
      ),
  },
  "bottle-swing": {
    means: "Drunken Blow: a bottle swung at the foe, a drop flying off it: a staggering hit.",
    draw: () =>
      `<g transform="rotate(40 12 12)">` +
      inkFill("M10 2H14V7L16.500 10.500V21H7.500V10.500L10 7Z") +
      `</g>` +
      inkFill("M5 14C6.200 15.800 7 16.700 7 18A2 2 0 0 1 3 18C3 16.700 3.800 15.800 5 14Z"),
  },
  "fist-slam": {
    means: "Yeti Smash: a heavy fist driven into cracking ground: a crushing blow.",
    draw: () =>
      inkFill("M6 3H18V13H6Z") +
      inkLine("M10 3V8M14 3V8", 1.6).replaceAll(C.ink, C.bg) +
      inkLine("M3 21H8L10 17L12.500 21H21", 2.2),
  },
  "grip-figure": {
    means: "Grapple: a claw closing over a foe laid on the ground: the foe is dragged down.",
    draw: () =>
      `<circle cx="5.500" cy="19" r="2.200" fill="${C.ink}"/>` +
      inkLine("M9 20.500H21M9 17.500L16 20", 2.2) +
      inkLine("M4.500 3V8Q4.500 12 8 13M12 3V10M19.500 3V8Q19.500 12 16 13", 2.6),
  },
  "figure-fall-bang": {
    means:
      "I Meant to Do That!: a figure fallen on the ground beside a shout bubble: stumbling is no loss.",
    draw: () =>
      `<circle cx="5.500" cy="17.500" r="2.400" fill="${C.ink}"/>` +
      inkLine("M9 19H21M10 15.500L17 19", 2.2) +
      inkFill("M9 2H21V11H15L12 14V11H9Z") +
      inkLine("M15 4.500V7.500M15 9.200V9.300", 2).replaceAll(C.ink, C.bg),
  },
  "blade-lock": {
    means: "Distracting Strike: a sword beside a padlock: the struck skill is locked.",
    draw: () => bladeMark(lock(7.5, 7.5)),
  },
  "blade-ring": {
    means: "Symbolic Strike: a sword beside a signet ring: the strike pays out for signets.",
    draw: () => bladeMark(ring(7.5, 8, 3.8)),
  },
  "shield-half-hit": {
    means:
      "Attacker's Insight: a half-filled shield struck by a blow: blocks while attacking, then weakens.",
    draw: () =>
      blockShield("M12 2.500L4 5.500V12C4 16.500 7.500 19.500 12 21.500Z") +
      inkLine("M14 8.500l4 4M18 8.500l-4 4", 1.8),
  },
  "shield-force": {
    means: "Shield of Force: a starburst in a shield: the block that knocks the attacker down.",
    draw: () =>
      blockShield("M12 2.500L12 2.500Z") +
      `<g transform="translate(12,12) scale(0.42) translate(-12,-12)">${inkFill("M12 2L14.400 9.600L22 12L14.400 14.400L12 22L9.600 14.400L2 12L9.600 9.600Z")}</g>`,
  },
};

export default glyphs;

// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import { inkFill, inkLine, smallSkull, wasUrn, spiritPost } from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "well-regen": {
    means: "The well's ring under a plus: allies regenerate Health.",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.600" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M12 3V13M7 8H17", 3),
  },
  "well-regen-energy": {
    means: "A plus and a bolt over the ring: Health and Energy.",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.600" ${stroke(C.ink, 2.4)}/>` +
      inkLine("M7 4V12M3 8H11", 2.8) +
      inkFill("M18 2.500L13.500 9.500h3l-1.500 5 5-7h-3z"),
  },
  "well-drain": {
    means: "A bolt sinking over the ring: foes lose Energy.",
    draw: () =>
      `<ellipse cx="12" cy="18" rx="9" ry="3.600" ${stroke(C.ink, 2.4)}/>` +
      inkFill("M10 2L4.500 10h3.500L6.500 15l5.500-8h-3.500Z") +
      inkLine("M17 5V12M14 9.500L17 13L20 9.500", 2.4),
  },
  totem: {
    means: "A post with a bright head: a spirit planted where it was called (#1217).",
    draw: () =>
      inkFill("M9 11H14L14.2 20H8.8Z") + `<circle cx="12" cy="6.5" r="3.8" fill="${C.ink}"/>`,
  },
  "ritual-heart": {
    means: "Nature rituals 1 (#1745, #1802): the spirit post and what it does to everyone near it.",
    draw: () =>
      spiritPost() +
      `<path d="M17.5 15C12 11.5 11.5 8.5 11.5 7.2A3 3 0 0 1 17.5 6.4A3 3 0 0 1 23.5 7.2C23.5 8.5 23 11.5 17.5 15Z" ${stroke(C.ink, 1.8)}/>`,
  },
  "ritual-cycle": {
    means: "A circular arrow.",
    draw: () => spiritPost() + inkLine("M22.5 9a5.2 5.2 0 1 1-1.6-3.8M22.5 3V6.5H19", 2),
  },
  "ritual-icicles": {
    means: "Icicles.",
    draw: () =>
      spiritPost() +
      inkLine("M11 3H23", 2) +
      inkFill("M12 3.5H15L13.5 12ZM16 3.5H19L17.5 15ZM20 3.5H23L21.5 10Z"),
  },
  "ritual-mud": {
    means: "Wavy mud lines.",
    draw: () =>
      spiritPost() +
      inkLine(
        "M11 5C12.5 3.5 14 3.5 15.5 5S18.5 6.5 20 5S22 4.2 23.5 4.7M11 10C12.5 8.5 14 8.5 15.5 10S18.5 11.5 20 10S22 9.2 23.5 9.7M11 15C12.5 13.5 14 13.5 15.5 15S18.5 16.5 20 15S22 14.2 23.5 14.7",
        1.8,
      ),
  },
  "ritual-flame": {
    means: "A flame.",
    draw: () =>
      spiritPost() +
      `<path d="M17.5 1.5C18.2 5 22.5 6.8 22.5 11.2A5 5 0 0 1 12.5 11.2C12.5 9 13.5 7.3 15 6.5C15 8.3 15.6 9.2 16.6 9.6C16 6.5 16.2 4 17.5 1.5Z" ${stroke(C.ink, 1.8)}/>`,
  },
  "ritual-heart-slash": {
    means: "A heart struck through.",
    draw: () =>
      spiritPost() +
      `<path d="M17.5 15C12 11.5 11.5 8.5 11.5 7.2A3 3 0 0 1 17.5 6.4A3 3 0 0 1 23.5 7.2C23.5 8.5 23 11.5 17.5 15Z" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M11 17L24 3", 2.2),
  },
  "ritual-snowflake": {
    means: "A snowflake.",
    draw: () => spiritPost() + inkLine("M17.5 2.5V14.5M12.3 5.5L22.7 11.5M22.7 5.5L12.3 11.5", 1.8),
  },
  "ritual-skull-burst": {
    means:
      "Nature rituals 3 (#1886, #1939). Edge of Extinction: a skull and the blows thrown from it.",
    draw: () =>
      spiritPost() +
      smallSkull(17.5, 9, 0.5) +
      inkLine("M11.5 2.5L13 4.5M23.5 2.5L22 4.5M11 15.5L13 13.5M24 15.5L22 13.5", 1.8),
  },
  "ritual-drop-spread": {
    means: "Pestilence: a drop and the two it spreads to.",
    draw: () =>
      spiritPost() +
      inkFill(
        "M17.5 1.5C15.8 4.2 14.8 5.4 14.8 7A2.7 2.7 0 0 0 20.2 7C20.2 5.4 19.2 4.2 17.5 1.5Z",
      ) +
      inkFill(
        "M13 10.5C11.8 12.3 11.1 13.1 11.1 14.2A1.9 1.9 0 0 0 14.9 14.2C14.9 13.1 14.2 12.3 13 10.5Z",
      ) +
      inkFill(
        "M22 10.5C20.8 12.3 20.1 13.1 20.1 14.2A1.9 1.9 0 0 0 23.9 14.2C23.9 13.1 23.2 12.3 22 10.5Z",
      ),
  },
  "ritual-wind-minus": {
    means: "The three windier rituals draw their status icon (#1921) small beside the post.",
    draw: () =>
      spiritPost() +
      `<g transform="translate(10.5,1) scale(0.58)">` +
      `<path d="M3 7h13M3 11h18M3 15h9" ${stroke(C.ink, 3)}/>` +
      `<path d="M14 17.5h6" ${stroke(C.ink, 4.4)}/></g>`,
  },
  "ritual-echo": {
    means: "ritual echo",
    draw: () =>
      spiritPost() +
      `<g transform="translate(10.5,1.5) scale(0.58)">` +
      `<circle cx="12" cy="12" r="8.5" ${stroke(C.ink, 2.8)}/>` +
      `<circle cx="12" cy="12" r="4.5" fill="${C.ink}"/></g>`,
  },
  "ritual-wind-plus": {
    means: "ritual wind plus",
    draw: () =>
      spiritPost() +
      `<g transform="translate(10.5,1) scale(0.58)">` +
      `<path d="M4 10h10a3 3 0 1 0-3-3M4 15h13a3 3 0 1 1-3 3" ${stroke(C.ink, 3)}/>` +
      `<path d="M18 5v5M15.5 7.5h5" ${stroke(C.ink, 2.8)}/></g>`,
  },
  "well-sink": {
    means: "The well's ring with an arrow sinking into it: drawn from a corpse (#1217).",
    draw: () =>
      `<ellipse cx="8.5" cy="17" rx="6" ry="3.4" ${stroke(C.ink, 2.5)}/>` +
      inkLine("M8.5 3.5V12.5M5 9.5L8.5 13L12 9.5", 2.5),
  },
  "well-profane": {
    means:
      "Wells 2 (#1749): the well's ring under the effect it lays on foes. A ring struck through: no enchantment holds.",
    draw: () =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(C.ink, 2.2)}/>` +
      `<circle cx="12" cy="9" r="5.5" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M6 15L18 3", 2.4),
  },
  "well-silence": {
    means: "Sound arcs struck through: no shout or chant.",
    draw: () =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M7 6.5C10.5 9.5 10.5 12.5 7 15.5M12 4C17.5 8.5 17.5 13.5 12 18", 2.2) +
      inkLine("M4 14L20 2", 2.4),
  },
  "well-darkness": {
    means: "An eye with its far half dark: hexed foes miss.",
    draw: () =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(C.ink, 2.2)}/>` +
      `<path d="M3 9.5C6 4.5 9 3 12 3S18 4.5 21 9.5C18 14.5 15 16 12 16S6 14.5 3 9.5Z" ${stroke(C.ink, 2.2)}/>` +
      inkFill("M12 3C15 3 18 4.5 21 9.5C18 14.5 15 16 12 16Z"),
  },
  "well-ruin": {
    means: "A cracked shield: armor breaks under physical hits.",
    draw: () =>
      `<ellipse cx="12" cy="19" rx="8.5" ry="3" ${stroke(C.ink, 2.2)}/>` +
      `<path d="M12 2.5L19 5V10C19 13 16 15 12 16.5C8 15 5 13 5 10V5Z" ${stroke(C.ink, 2.2)}/>` +
      inkLine("M12 3L10 7.5L13.5 10L11 15", 1.8),
  },
  "was-shield": {
    means:
      "The Was spells (#1493): one urn of ashes held, the mark in its body says what they do. The urn has no base line, unlike the binding-ritual urn.",
    draw: () =>
      wasUrn(inkFill("M12 10.5L16 12V15.5C16 17.5 14 18.5 12 19.5C10 18.5 8 17.5 8 15.5V12Z")),
  },
  "was-heart": {
    means: "was heart",
    draw: () =>
      wasUrn(
        inkFill(
          "M12 19.5L7.5 15C6 13.5 7 11 9.2 11C10.5 11 11.5 11.8 12 12.8C12.5 11.8 13.5 11 14.8 11C17 11 18 13.5 16.5 15Z",
        ),
      ),
  },
  "was-cap": {
    means: "was cap",
    draw: () => wasUrn(inkLine("M8 11H16M12 13V19M9.5 16.5L12 19L14.5 16.5", 1.8)),
  },
  "was-blind": {
    means: "was blind",
    draw: () =>
      wasUrn(
        inkLine("M7.5 15C9 12 15 12 16.5 15C15 18 9 18 7.5 15", 1.6) + inkLine("M8 19L16 11", 1.8),
      ),
  },
  "was-quake": {
    means: "was quake",
    draw: () => wasUrn(inkLine("M9 10.5L12 14L9.5 15.5L12.5 19.5L15 16L12.5 14.5", 1.8)),
  },
  "was-bolt": {
    means: "was bolt",
    draw: () => wasUrn(inkFill("M13.5 9.5L7.5 15.5H11.5L10.5 20.5L16.5 14H12.5Z")),
  },
  "was-orb": {
    means:
      "Ritualist item spells 2 (#1530): a filled orb under a chevron is more maximum Energy (the bolt is regeneration); a bolt through a plate is armor pierced, the elite adds strokes to each side for the area; a closed ring round a dot is a cast nothing breaks; a hook back over a heart is Health stolen from the striker; a struck drop is conditions cleared.",
    draw: () =>
      wasUrn(
        `<circle cx="12" cy="16.6" r="2.8" fill="${C.ink}"/>` +
          inkLine("M9.5 12.8L12 10.3L14.5 12.8", 1.8),
      ),
  },
  "was-pierce": {
    means: "was pierce",
    draw: () =>
      wasUrn(inkLine("M7.5 15.5H16.5", 1.8) + inkLine("M13 9.5L10.5 14.5L13.5 16.5L11 20.5", 1.6)),
  },
  "was-pierce-area": {
    means: "was pierce area",
    draw: () =>
      wasUrn(
        inkLine("M7.5 15.5H16.5", 1.8) +
          inkLine("M13 9.5L10.5 14.5L13.5 16.5L11 20.5", 1.6) +
          inkLine("M7.5 11.5L8.5 13M16.5 11.5L15.5 13", 1.4),
      ),
  },
  "was-calm": {
    means: "was calm",
    draw: () =>
      wasUrn(
        `<circle cx="12" cy="15.5" r="4" ${stroke(C.ink, 1.8)}/><circle cx="12" cy="15.5" r="1.3" fill="${C.ink}"/>`,
      ),
  },
  "was-steal": {
    means: "was steal",
    draw: () =>
      wasUrn(
        inkLine("M16.5 14C16.5 10.8 10.5 10.3 8.8 13.6M8.8 10.8V13.8H11.8", 1.6) +
          inkFill(
            "M12 20.5L9.4 18C8.6 17 9.2 15.7 10.5 15.7C11.2 15.7 11.8 16.1 12 16.6C12.2 16.1 12.8 15.7 13.5 15.7C14.8 15.7 15.4 17 14.6 18Z",
          ),
      ),
  },
  "was-clear": {
    means: "was clear",
    draw: () =>
      wasUrn(
        inkFill("M12 10.5C10.5 13 9 14.5 9 16.6A3 3 0 0 0 15 16.6C15 14.5 13.5 13 12 10.5Z") +
          `<path d="M8.5 20L15.5 12.5" ${stroke(C.bg, 2.6)}/>` +
          inkLine("M9 19.5L15 13", 1.2),
      ),
  },
  "ash-cloud": {
    means: "An ash cloud with a slash through it and flakes falling: it blinds.",
    draw: () =>
      `<path d="M6.5 12.5a4 4 0 0 1 .5-7.9 5 5 0 0 1 9.6-.6 3.8 3.8 0 0 1 .9 8.5Z" ${stroke(C.ink, 2)}/>` +
      inkLine("M4 20L20 4", 2.2) +
      `<circle cx="8" cy="19" r="1.2" fill="${C.ink}"/><circle cx="13" cy="21" r="1.2" fill="${C.ink}"/><circle cx="18" cy="19" r="1.2" fill="${C.ink}"/>`,
  },
  "totem-bars-up": {
    means: "Ritual Lord: the spirit totem, and three rising bars.",
    draw: () =>
      inkFill("M5 11H9.5L9.7 20H4.8Z") +
      `<circle cx="7.2" cy="6.5" r="3.6" fill="${C.ink}"/>` +
      inkFill("M12.5 20V15H15.1V20ZM16.3 20V10.5H18.9V20ZM20.1 20V6H22.7V20Z"),
  },
  "ritual-bolt-sink": {
    means: "Nature rituals 4 (#1981). Quicksand: the Energy bolt sinking in the mud.",
    draw: () =>
      spiritPost() +
      inkFill("M18.5 1.5L14 7.5H17L16.2 10.5L21 5.2H17.8Z") +
      inkLine(
        "M11 12.5C12.5 11.2 14 11.2 15.5 12.5S18.5 13.8 20 12.5S22 11.7 23.5 12.2M11 16.5C12.5 15.2 14 15.2 15.5 16.5S18.5 17.8 20 16.5S22 15.7 23.5 16.2",
        2.2,
      ),
  },
  "ritual-bolt-hollow": {
    means: "Famine: the Energy bolt run empty.",
    draw: () =>
      spiritPost() + `<path d="M18.5 1L11.5 9.5H16L14.5 16L23 6.5H18.2Z" ${stroke(C.ink, 2.2)}/>`,
  },
  "ritual-drop-claw": {
    means: "Lacerate: a drop and the claw marks that opened it.",
    draw: () =>
      spiritPost() +
      inkFill(
        "M16 2.5C14.2 5.4 13.2 6.6 13.2 8.2A2.8 2.8 0 0 0 18.8 8.2C18.8 6.6 17.8 5.4 16 2.5Z",
      ) +
      inkLine("M20 2L23.5 7M17.5 11.5L22 14", 1.8),
  },
};

export default glyphs;

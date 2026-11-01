// Glyphs (#719, #2021): the shapes of a skill icon's primary effect.

import { C, stroke } from "../icon-kit.mjs";
import {
  inkFill,
  inkLine,
  burst,
  antiSummon,
  formShell,
  spiritPost,
  brokenPost,
  bornPost,
  glyph,
} from "../glyph-kit.mjs";

/** @type {Readonly<Record<string, import("../glyph-kit.mjs").GlyphEntry>>} */
const glyphs = {
  "born-plus": {
    means:
      "The spirit post in a halo, being born, with the payout beside it (#1316). Boon of Creation heals and gives energy: a plus.",
    draw: () => bornPost() + inkLine("M17 3.5V13.5M12 8.5H22", 2.8),
  },
  "born-burst": {
    means: "Explosive Growth strikes foes near it: a burst.",
    draw: () =>
      bornPost() +
      `<g transform="translate(17,8.5) scale(0.95) translate(-12,-12)">${inkFill(burst(5))}</g>`,
  },
  "born-ring": {
    means: "Spirit's Gift heals the allies near it: a plus in a ring.",
    draw: () =>
      bornPost() +
      `<circle cx="17" cy="8.5" r="5.6" ${stroke(C.ink, 1.8)}/>` +
      inkLine("M17 5.8V11.2M14.3 8.5H19.7", 2),
  },
  "born-energy": {
    means: "Signet of Creation pays energy: the energy mark.",
    draw: () =>
      bornPost() +
      `<g transform="translate(17,8.5) scale(0.95) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "spirit-pain": {
    means:
      "The spirit post, low on the left, shooting a mark up and right: what the mark is says what the spirit does (#1271). Pain only hurts.",
    draw: () => spiritPost() + inkLine("M19.5 2.5L14 9.5H19L14.5 15.5", 2.4),
  },
  "spirit-blind": {
    means: "Shadowsong blinds: an eye.",
    draw: () =>
      spiritPost() +
      `<path d="M10.5 8.5C12 5.5 14.5 4.5 17 4.5S22 5.5 23.5 8.5C22 11.5 19.5 12.5 17 12.5S12 11.5 10.5 8.5Z" ${stroke(C.ink, 1.8)}/>` +
      `<circle cx="17" cy="8.5" r="2" fill="${C.ink}"/>`,
  },
  "spirit-quiet": {
    means: "Dissonance interrupts: a burst.",
    draw: () =>
      spiritPost() +
      `<g transform="translate(17,8.5) scale(0.55) translate(-12,-12)">${inkFill(burst(6))}</g>`,
  },
  "spirit-strip": {
    means: "Disenchantment strips an enchantment: a ring struck through.",
    draw: () =>
      spiritPost() +
      `<circle cx="17" cy="8.5" r="4.6" ${stroke(C.ink, 2)}/>` +
      inkLine("M12 14L22 3", 2.2),
  },
  "spirit-rupture": {
    means:
      "The spirit post split by a crack: an allied spirit destroyed (#1309). With the jagged mark of the attacking spirits: the burst damages and blinds foes.",
    draw: () => brokenPost(7) + inkFill("M20.5 1.5L13.5 10H18L14 17L23 7.5H18.5Z"),
  },
  "spirit-bound": {
    means: "The spirit post in a chain ring: a foe's spirit taken as your own (#1999).",
    draw: () =>
      `<g transform="translate(9,8) scale(0.62) translate(-12,-12)">${spiritPost()}</g>` +
      `<rect x="3" y="12" width="8" height="5.5" rx="2.7" ${stroke(C.ink, 1.8)}/><rect x="7" y="12" width="8" height="5.5" rx="2.7" ${stroke(C.ink, 1.8)}/>`,
  },
  "spirit-feast": {
    means: "Two small cracked posts: every spirit near you is spent (#1309).",
    draw: () =>
      `<g transform="translate(-2.5,0) scale(0.82) translate(2,3)">${brokenPost(7)}</g>` +
      `<g transform="translate(9,0) scale(0.82) translate(2,3)">${brokenPost(7)}</g>`,
  },
  "spirit-break": {
    means: "One cracked post, centred: one spirit destroyed (#1309).",
    draw: () => brokenPost(12),
  },
  "spirit-cap": {
    means: "The spirit post under a shield: no blow takes more than a tenth (#1289).",
    draw: () =>
      spiritPost() +
      `<path d="M17 2.5L22.5 4.5V8.5C22.5 11.5 20.2 13.3 17 14.5C13.8 13.3 11.5 11.5 11.5 8.5V4.5Z" ${stroke(C.ink, 1.9)}/>` +
      inkLine("M14.2 7.2H19.8", 1.9),
  },
  "spirit-share": {
    means: "The spirit post beside two linked rings: the damage is shared (#1289).",
    draw: () =>
      spiritPost() +
      `<circle cx="14.6" cy="8.5" r="3.3" ${stroke(C.ink, 1.9)}/><circle cx="20" cy="8.5" r="3.3" ${stroke(C.ink, 1.9)}/>`,
  },
  "spirit-block": {
    means: "The spirit post and an arrow stopped by a bar: the attack is blocked (#1289).",
    draw: () =>
      spiritPost() +
      inkLine("M10.5 8.5H17M14.5 5.5L17.5 8.5L14.5 11.5", 2) +
      inkLine("M21 3V14", 2.4),
  },
  "spirit-ground": {
    means: "The spirit post and an arrow driven into the ground: no knockdown (#1289).",
    draw: () =>
      spiritPost() +
      inkLine("M17 2.5V9.5M13.8 7L17 10.2L20.2 7", 2) +
      inkLine("M11.5 13.8H22.5", 2.4),
  },
  "spirit-burn": {
    means: "The spirit post beside a flame: it sets the foe alight (#1319).",
    draw: () =>
      spiritPost() +
      `<g transform="translate(17,8.5) scale(0.62) translate(-12,-12)">${glyph("flame")}</g>`,
  },
  "spirit-energy": {
    means: "The spirit post and a ringed bolt: energy paid by a spirit's strike (#1319).",
    draw: () =>
      spiritPost() +
      `<circle cx="17" cy="8.5" r="5.6" ${stroke(C.ink, 1.8)}/>` +
      `<g transform="translate(17,8.5) scale(0.4) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "spirit-blood": {
    means:
      "The Ritualist's binding spirits 2 (#1550, #1622): the post and what its blows or its death bring. Bloodsong steals Health: a drop.",
    draw: () =>
      spiritPost() +
      `<path d="M17 2.5C17 2.5 12.5 7.5 12.5 10.2A4.5 4.5 0 0 0 21.5 10.2C21.5 7.5 17 2.5 17 2.5Z" fill="${C.ink}"/>`,
  },
  "spirit-hexed": {
    means: "Anguish hurts the hexed: a bolt through a dashed ring.",
    draw: () =>
      spiritPost() +
      `<circle cx="17" cy="8.5" r="5.6" ${stroke(C.ink, 1.8)} stroke-dasharray="3.4 2.6"/>` +
      `<g transform="translate(17,8.5) scale(0.42) translate(-12,-12)">${glyph("energy")}</g>`,
  },
  "spirit-run": {
    means: "Wanderlust drops the moving: running chevrons over a flat ground line.",
    draw: () =>
      spiritPost() +
      inkLine("M12 4.5L15.5 8L12 11.5M17.5 4.5L21 8L17.5 11.5", 2) +
      inkLine("M11.5 14.5H22.5", 2.4),
  },
  "spirit-bolt-heal": {
    means:
      "Your spirits within earshot (#1777, #1848): the spirit post and a cue each. Spirit Boon Strike: a bolt strikes, a ringed plus is the Health the post gains.",
    draw: () =>
      spiritPost() +
      inkFill("M18.5 1.5L12.5 9H16.5L13.5 15L21.5 7H17.5Z") +
      `<circle cx="19" cy="18" r="4.2" ${stroke(C.ink, 1.6)}/>` +
      inkLine("M19 15.8V20.2M16.8 18H21.2", 1.6),
  },
  "spirit-fang": {
    means: "Spiritleech Aura: a fang with a drained drop under it.",
    draw: () =>
      spiritPost() +
      inkFill("M12.5 2.5H22L17.2 12Z") +
      `<path d="M17.2 14.6C17.2 14.6 14.8 17.4 14.8 18.9A2.4 2.4 0 0 0 19.6 18.9C19.6 17.4 17.2 14.6 17.2 14.6Z" fill="${C.ink}"/>`,
  },
  "spirit-pull": {
    means: "Draw Spirit: the post is hauled left along a line, towards you, by pull chevrons.",
    draw: () =>
      `<g transform="translate(13,0)">${spiritPost()}</g>` +
      inkLine("M9 4.5L5.5 8L9 11.5M5 4.5L1.5 8L5 11.5", 2) +
      inkLine("M1.5 15.5H22.5", 2.4),
  },
  "spirit-calm": {
    means: "Soothing slows adrenaline: a wave pressed flat above a bar.",
    draw: () =>
      spiritPost() +
      inkLine("M11 7.5C12.5 4.5 14 4.5 15.5 7.5S18.5 10.5 22 7.5", 2) +
      inkLine("M11 14H22", 2.4),
  },
  "spirit-last-burn": {
    means:
      "The two death-burst spirits share a cracked post; the mark is what comes out (#1622). Destruction: a burst.",
    draw: () =>
      brokenPost(7) +
      `<g transform="translate(17.5,7.5) scale(0.6) translate(-12,-12)">${inkFill(burst(8))}</g>`,
  },
  "spirit-last-heal": {
    means: "Life: a plus in a ring.",
    draw: () =>
      brokenPost(7) +
      `<circle cx="17.5" cy="8" r="5.2" ${stroke(C.ink, 1.9)}/>` +
      inkLine("M17.5 5.2V10.8M14.7 8H20.3", 1.9),
  },
  "spirit-trio": {
    means: "Three small spirit posts in a row: a signet that calls three (#1319).",
    draw: () =>
      [4.5, 12, 19.5]
        .map(
          (x) =>
            inkFill(
              `M${String(x - 2)} 12H${String(x + 2)}L${String(x + 2.2)} 21H${String(x - 2.2)}Z`,
            ) + `<circle cx="${String(x)}" cy="7" r="3" fill="${C.ink}"/>`,
        )
        .join(""),
  },
  ghost: {
    means: "A ghost with dark eyes, wavy hem: the phantasm that gnaws (#1243).",
    draw: () =>
      inkFill("M3.5 17.5V9A5.5 5.5 0 0 1 14.5 9V17.5L12.2 15.3L9 17.5L5.8 15.3Z") +
      `<circle cx="6.8" cy="9" r="1.3" fill="${C.bg}"/><circle cx="11.2" cy="9" r="1.3" fill="${C.bg}"/>`,
  },
  "avatar-earth": {
    means:
      "A figure in a god's shape (#1468). Melandru: a branch with two leaves grows from the head.",
    draw: () =>
      `<circle cx="12" cy="12.5" r="3" fill="${C.ink}"/>` +
      inkLine("M4.5 22C4.5 17.5 7.5 15.5 12 15.5S19.5 17.5 19.5 22", 2.6) +
      inkLine("M12 9.5V6", 1.8) +
      inkFill(
        "M12 6.5C12 3.5 9.5 2 5.5 2.5c0 3 2 4.5 6.5 4zM12 6.5C12 3.5 14.5 2 18.5 2.5c0 3-2 4.5-6.5 4z",
      ),
  },
  "avatar-wings": {
    means: "Dwayna: the figure with wings spread behind it.",
    draw: () =>
      inkFill("M9 11C7 6.5 4.5 5 1.5 5c0 5 2.5 8 7.5 8zM15 11c2-4.5 4.5-6 7.5-6 0 5-2.5 8-7.5 8z") +
      `<circle cx="12" cy="8.5" r="3" fill="${C.ink}"/>` +
      inkLine("M5.5 22C5.5 17.5 8 14.5 12 14.5S18.5 17.5 18.5 22", 2.6),
  },
  "avatar-flame": {
    means: "Balthazar: a flame rises from the figure's head.",
    draw: () =>
      inkFill(
        "M12 1.5c3 3 4 5 4 7.5a4 4 0 0 1-8 0c0-2 1-3.5 2.5-4.5.2 1.5.8 2 1.5 2.5-.2-2.2-.1-4 0-5.5z",
      ) +
      `<circle cx="12" cy="14" r="2.8" fill="${C.ink}"/>` +
      inkLine("M5 22C5 18.5 8 17 12 17S19 18.5 19 22", 2.6),
  },
  "avatar-scythe": {
    means: "Grenth: the figure with a scythe slanting behind it.",
    draw: () =>
      inkLine("M20.5 22L11 3", 2) +
      inkFill("M11 3C7.5 1.5 3.5 2.5 1.5 5.5c3.5-.8 6.5 0 9.5 3.5z") +
      `<circle cx="9" cy="10.5" r="3" fill="${C.ink}" stroke="${C.bg}" stroke-width="1"/>` +
      `<path d="M3.5 22C3.5 17.5 6 15 9.5 15S15.5 17.5 15.5 22" ${stroke(C.bg, 4.2)}/>` +
      inkLine("M3.5 22C3.5 17.5 6 15 9.5 15S15.5 17.5 15.5 22", 2.6),
  },
  "avatar-chaos": {
    means: "Lyssa: the figure between two zigzags, chaos on both sides.",
    draw: () =>
      inkLine("M5 3L2.5 8L6.5 11L3 16L6 21M19 3L21.5 8L17.5 11L21 16L18 21", 2) +
      `<circle cx="12" cy="8.5" r="3" fill="${C.ink}"/>` +
      inkLine("M7.5 22C7.5 17.5 9 14.5 12 14.5S16.5 17.5 16.5 22", 2.6),
  },
  "anti-summon-spell": {
    means: "anti summon spell",
    draw: () => antiSummon(glyph("spark")),
  },
  "anti-summon-scythe": {
    means: "anti summon scythe",
    draw: () => antiSummon(glyph("scythe")),
  },
  "anti-summon-spear": {
    means: "anti summon spear",
    draw: () => antiSummon(glyph("spear")),
  },
  "anti-summon-pain": {
    means: "anti summon pain",
    draw: () => antiSummon(glyph("ache-cross")),
  },
  "form-shadow": {
    means:
      "PvP forms (#1951, #1968): the form mark is a dashed outline of a figure, you as something else; what you become sits inside it. Future forms reuse it. Shadow Form: a solid silhouette filling the outline.",
    draw: () =>
      formShell() +
      `<g transform="translate(2.6,3.5) scale(0.78)">` +
      `<circle cx="12" cy="5.5" r="3.2" fill="${C.ink}"/>` +
      inkFill("M3.5 22V17Q3.5 10.5 12 10.5Q20.5 10.5 20.5 17V22Z") +
      "</g>",
  },
  "form-flame": {
    means: "Elemental Flame: a big flame filling the outline's body.",
    draw: () =>
      formShell() +
      inkFill(
        "M12 8.5C14 11.5 17.5 13.5 17.5 16.5A5.5 5.5 0 0 1 6.5 16.5C6.5 14.5 8.5 14 9 11.5C10 12.3 10.5 13 10.8 13.8C11.6 12.2 12 10.5 12 8.5Z",
      ),
  },
  "form-mist": {
    means: "Mist Form: a big drop filling the outline's body.",
    draw: () =>
      formShell() + inkFill("M12 8.5Q18.2 14.8 18.2 17A6.2 6.2 0 0 1 5.8 17Q5.8 14.8 12 8.5Z"),
  },
  "spirit-give": {
    means: "Spirit Transfer: the spirit post sends its Health over to an ally, a ringed plus.",
    draw: () =>
      spiritPost() +
      inkLine("M11 8.5H15Q18 8.5 18 11.5", 2) +
      inkLine("M15.5 10L18 12.5L20.5 10", 2) +
      `<circle cx="18" cy="18.5" r="4.2" ${stroke(C.ink, 1.9)}/>` +
      inkLine("M18 16.2V20.8M15.7 18.5H20.3", 1.8),
  },
  "spirit-eye": {
    means: "Gaze of Fury: a spirit given up, an angry eye in its place.",
    draw: () =>
      brokenPost(7) +
      `<path d="M11 14Q17 7.5 23 14Q17 20.5 11 14Z" ${stroke(C.ink, 1.9)}/>` +
      `<circle cx="17" cy="14" r="2.2" fill="${C.ink}"/>` +
      inkLine("M11.5 7L22.5 10", 2.2),
  },
};

export default glyphs;

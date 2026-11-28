// Draws a study of the stacked figure's outfit per primary profession and
// its secondary accent (#4175). A design reference, not a game asset.
//
//   node scripts/assets/profession-outfit-study.mjs
//
// Writes docs/art/profession-outfit-study.svg and prints, per outfit, its
// lift count against the warrior's and the share of the warrior's top-down
// team-colour area it keeps (the test #4175 asks for: at least 80 %).
//
// The figure is drawn by the arena's own `stackLayers` and `stackTones`
// (apps/web/src/render/sprite-stack.ts), so shading, lift, squash and the
// pose maths are the game's. `outfitSlices` below is the proposal: the
// warrior's slice list, rebuilt from parts, with torso, legs, shoulders,
// head and back chosen by profession. The script checks that its warrior is
// byte-for-byte the game's `stackSlices("stand")`. Outfits are generic
// fantasy in our gothic style, not any GW1 armour set.
//
// Layout: the ten primary outfits as ally and foe at menu-figure size (a
// body radius of 40 px), the same from the side, the four camera zooms at
// true size (view height 640 / 860 / 1100 / 1400 world units on a 1080 px
// canvas, body radius 14), and four secondary accents on the warrior.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./ts-resolve.mjs";

const { STACK_OUTLINE, stackLayers, stackSlices, stackTones } =
  await import("../../apps/web/src/render/sprite-stack.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "profession-outfit-study.svg");

const C = {
  bg: "#0e1116",
  panel: "#141a22",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  friend: 0x59c2ff,
  foe: 0xff7b72,
};

/** A cape that is plain cloth and trim, as the study's neutral cape. */
const CAPE = { main: 0x4a3f66, trim: 0xc9a24a, emblem: "", palette: [] };

const hex = (/** @type {number} */ n) => `#${n.toString(16).padStart(6, "0")}`;
const f = (/** @type {number} */ n) => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------
// The proposal: outfits as a data table (the shape of PROFESSION_OUTFITS).

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ parts: Point[][], tone: string, light: number, same: boolean, rise: number }} Slice */
/** @typedef {{ torso: string, legs: string, shoulders: string, head: string, back: string | undefined, cloth: number }} Outfit */
/** @typedef {{ kind: string, tone: number }} Accent */
/** @typedef {(parts: Point[][], tone: string, light: number, same?: boolean) => void} Push */

/**
 * `torso`: plate | robe | coat | wrap | tabard. `legs`: trousers | robe.
 * `shoulders`: pauldrons | mantle | spikes | none. `head`: helm | hood |
 * circlet | bare | turban | hat | cowl | headdress. `back`: quiver | blades
 * | spears | undefined. `cloth` is the outfit's secondary fabric, a dark
 * neutral, so the team colour stays the loudest.
 */
/** @type {Record<string, Outfit>} */
const OUTFITS = {
  warrior: {
    torso: "plate",
    legs: "trousers",
    shoulders: "pauldrons",
    head: "helm",
    back: undefined,
    cloth: 0x4a4e58,
  },
  ranger: {
    torso: "coat",
    legs: "trousers",
    shoulders: "none",
    head: "hood",
    back: "quiver",
    cloth: 0x4c5a3a,
  },
  monk: {
    torso: "robe",
    legs: "robe",
    shoulders: "none",
    head: "bare",
    back: undefined,
    cloth: 0xd8cfb8,
  },
  elementalist: {
    torso: "robe",
    legs: "robe",
    shoulders: "collar",
    head: "circlet",
    back: undefined,
    cloth: 0x5a2a22,
  },
  necromancer: {
    torso: "robe",
    legs: "robe",
    shoulders: "spikes",
    head: "cowl",
    back: undefined,
    cloth: 0x2e2a38,
  },
  mesmer: {
    torso: "coat",
    legs: "trousers",
    shoulders: "mantle",
    head: "hat",
    back: undefined,
    cloth: 0x3a2a4a,
  },
  assassin: {
    torso: "wrap",
    legs: "trousers",
    shoulders: "none",
    head: "cowl",
    back: "blades",
    cloth: 0x22242c,
  },
  ritualist: {
    torso: "wrap",
    legs: "robe",
    shoulders: "mantle",
    head: "headdress",
    back: undefined,
    cloth: 0x2a5a52,
  },
  paragon: {
    torso: "tabard",
    legs: "trousers",
    shoulders: "pauldrons",
    head: "helm",
    back: "spears",
    cloth: 0xb89a4a,
  },
  dervish: {
    torso: "robe",
    legs: "robe",
    shoulders: "none",
    head: "turban",
    back: undefined,
    cloth: 0x7a4a2a,
  },
};

/** The secondary's accent: a kind and a tone (SECONDARY_ACCENTS). */
/** @type {Record<string, Accent>} */
const ACCENTS = {
  warrior: { kind: "belt", tone: 0xc8ccd4 },
  ranger: { kind: "trim", tone: 0x6a9a48 },
  monk: { kind: "sash", tone: 0xf2ecdc },
  necromancer: { kind: "belt", tone: 0xd8d0b8 },
  mesmer: { kind: "sash", tone: 0xb06ae0 },
  elementalist: { kind: "trim", tone: 0xff9040 },
  assassin: { kind: "belt", tone: 0xc03040 },
  ritualist: { kind: "sash", tone: 0x40d0b8 },
  paragon: { kind: "trim", tone: 0xf0c850 },
  dervish: { kind: "sash", tone: 0xe0a040 },
};

const ORDER = Object.keys(OUTFITS);

// ---------------------------------------------------------------------------
// Geometry, in body radii, `x` forward, `y` to the right.

/** @returns {Point[]} */
function ellipse(
  /** @type {number} */ cx,
  /** @type {number} */ cy,
  /** @type {number} */ rx,
  /** @type {number} */ ry,
  n = 18,
  turn = 0,
) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const px = rx * Math.cos(a);
    const py = ry * Math.sin(a);
    return { x: cx + px * c - py * s, y: cy + px * s + py * c };
  });
}

/** The slices of an `outfit` standing, with an optional secondary `accent`. */
/**
 * @param {Outfit} outfit
 * @param {Accent} [accent]
 * @returns {Slice[]}
 */
function outfitSlices(outfit, accent) {
  /** @type {Slice[]} */
  const slices = [];
  /** @type {Push} */
  const push = (parts, tone, light, same = false) =>
    slices.push({ parts, tone, light, same, rise: 0 });
  const capeBack = (/** @type {number} */ x, /** @type {number} */ rx, /** @type {number} */ ry) =>
    ellipse(x, 0, rx, ry, 14);
  const robe = outfit.legs === "robe";
  const torsoTone = "team";
  const handTone = outfit.torso === "plate" || outfit.torso === "tabard" ? "metal" : "skin";

  for (let i = 0; i < 2; i += 1) {
    push(
      [ellipse(0.05, -0.26, 0.26, 0.16, 10), ellipse(0.05, 0.26, 0.26, 0.16, 10)],
      "boot",
      0.5 + 0.2 * i,
    );
  }
  for (let i = 0; i < 4; i += 1) {
    if (robe) {
      // A long skirt hides the legs: only a dark inner hem shows.
      push([ellipse(0, 0, 0.4, 0.4, 12)], "boot", 0.55 + 0.08 * i);
    } else {
      push(
        [ellipse(0, -0.24, 0.18, 0.17, 10), ellipse(0, 0.24, 0.18, 0.17, 10)],
        "trouser",
        0.55 + 0.08 * i,
      );
    }
  }
  // The skirt, its cape behind it; a trim accent is the hem under it.
  const skirt = robe
    ? [0.92, 0.88, 0.82, 0.74]
    : outfit.torso === "coat"
      ? [0.7, 0.66, 0.62, 0.58]
      : outfit.torso === "wrap"
        ? [0.54, 0.54, 0.52, 0.52]
        : [0.62, 0.6, 0.58, 0.56];
  skirt.forEach((r, i) => {
    if (i === 0 && robe) {
      // A robe's hem: its own cloth, a ring wider than the team-coloured skirt.
      push([ellipse(0, 0, r * 0.72 * 1.14, r * 1.14)], "cloth", 0.55, true);
    }
    if (i === 0 && accent?.kind === "trim") {
      push(
        [ellipse(0, 0, r * 0.72 * (robe ? 1.22 : 1.1), r * (robe ? 1.22 : 1.1))],
        "accent",
        0.5,
        true,
      );
    }
    push([capeBack(-0.3, 0.32, 0.66 - (robe ? -0.1 : 0) * (1 - i / 4))], "cape", 0.5 + 0.06 * i);
    push([ellipse(0, 0, r * 0.72, r)], torsoTone, 0.6 + 0.07 * i, true);
  });
  push(
    [ellipse(0, 0, 0.4, 0.56)],
    outfit.torso === "plate" || outfit.torso === "tabard" ? "belt" : "rope",
    0.9,
  );
  if (accent?.kind === "belt") {
    push([ellipse(0, 0, 0.44, 0.6)], "accent", 0.92, true);
  }
  const arms = () => [ellipse(0, -0.66, 0.15, 0.14, 10), ellipse(0, 0.66, 0.15, 0.14, 10)];
  const torso =
    outfit.torso === "robe" ? [0.52, 0.54, 0.56, 0.58, 0.6] : [0.56, 0.6, 0.64, 0.68, 0.7];
  for (let i = 0; i < 7; i += 1) {
    push([capeBack(-0.3, 0.3, 0.6 + 0.02 * i)], "cape", 0.6 + 0.05 * i);
    if (i >= 2) {
      const r = torso[Math.min(i - 2, 4)];
      push([ellipse(0.06, 0, r * 0.66, r)], torsoTone, 0.74 + 0.04 * i, true);
      if (accent?.kind === "sash" && i >= 3 && i <= 6) {
        // A sash runs from the right shoulder to the left hip.
        push([ellipse(0.06, 0, 0.2, r * 1.12, 14, 0.5)], "accent", 0.82 + 0.04 * i, true);
      }
      if (outfit.back === "quiver" && i >= 2 && i <= 6) {
        push([ellipse(-0.46, 0.24, 0.1, 0.1, 8)], "leather", 0.5 + 0.08 * i, true);
        if (i === 6) {
          push(
            [ellipse(-0.46, 0.2, 0.05, 0.05, 6), ellipse(-0.46, 0.3, 0.05, 0.05, 6)],
            "metal",
            1,
            true,
          );
        }
      }
      if (outfit.back === "blades" && i >= 3 && i <= 6) {
        push(
          [
            ellipse(-0.46, -0.2 + (i - 3) * 0.14, 0.05, 0.05, 6),
            ellipse(-0.46, 0.2 - (i - 3) * 0.14, 0.05, 0.05, 6),
          ],
          "metal",
          0.8 + 0.05 * i,
          true,
        );
      }
      if (outfit.back === "spears" && i >= 2 && i <= 7) {
        push(
          [
            ellipse(-0.46, -0.16, 0.05, 0.05, 6),
            ellipse(-0.46, 0.0, 0.05, 0.05, 6),
            ellipse(-0.46, 0.16, 0.05, 0.05, 6),
          ],
          i === 6 ? "metal" : "leather",
          0.6 + 0.06 * i,
          true,
        );
      }
    }
    push(
      arms(i),
      i < 2 ? handTone : outfit.torso === "plate" || outfit.torso === "tabard" ? "team" : "cloth",
      i < 2 ? 0.9 : 0.7 + 0.04 * i,
      true,
    );
  }
  // Shoulders.
  for (let i = 0; i < 2; i += 1) {
    const lift = 0.85 + 0.15 * i;
    if (outfit.shoulders === "pauldrons") {
      push([ellipse(0, -0.6, 0.3, 0.26, 12), ellipse(0, 0.6, 0.3, 0.26, 12)], "metal", lift);
    } else if (outfit.shoulders === "mantle") {
      push([ellipse(-0.04, 0, 0.34 - 0.04 * i, 0.82 - 0.06 * i, 16)], "cloth", lift);
    } else if (outfit.shoulders === "spikes") {
      push([ellipse(0, -0.6, 0.24, 0.2, 10), ellipse(0, 0.6, 0.24, 0.2, 10)], "bone", lift);
      if (i === 1) {
        push(
          [ellipse(-0.04, -0.74, 0.07, 0.07, 6), ellipse(-0.04, 0.74, 0.07, 0.07, 6)],
          "bone",
          1.05,
          true,
        );
      }
    }
  }
  push([ellipse(0.06, 0, 0.16, 0.16, 10)], outfit.shoulders === "collar" ? "cloth" : "skin", 0.8);
  if (outfit.shoulders === "collar") {
    // A high collar: a flared cloth ring up round the neck.
    push([ellipse(0.0, 0, 0.3, 0.38, 14)], "cloth", 0.95);
    push([ellipse(0.0, 0, 0.26, 0.34, 14)], "cloth", 1);
  }
  head(push, outfit.head);
  return slices;
}

/** The head's slices, `kind`, over the neck. */
/**
 * @param {Push} push
 * @param {string} kind
 */
function head(push, kind) {
  const cx = 0.1;
  if (kind === "helm") {
    [0.3, 0.36, 0.38, 0.38, 0.34, 0.26].forEach((r, i) => {
      push([ellipse(cx, 0, r * 1.05, r)], "metal", 0.7 + 0.07 * i);
      if (i === 2 || i === 3) {
        push(
          [
            [
              { x: cx + r * 0.55, y: -r * 0.7 },
              { x: cx + r * 1.1, y: -r * 0.35 },
              { x: cx + r * 1.1, y: r * 0.35 },
              { x: cx + r * 0.55, y: r * 0.7 },
            ],
          ],
          "visor",
          1,
          true,
        );
      }
      if (i === 5) {
        push([ellipse(cx - 0.05, 0, 0.32, 0.08, 8)], "crest", 1.05);
      }
    });
    return;
  }
  /** @type {(radii: number[], tone: string, extra?: (r: number, i: number) => void) => void} */
  const dome = (radii, tone, extra) => {
    radii.forEach((r, i) => {
      push([ellipse(cx, 0, r * 1.05, r)], tone, 0.7 + 0.07 * i);
      extra?.(r, i);
    });
  };
  const face = (r, i) => {
    if (i === 2 || i === 3) {
      push([ellipse(cx + r * 0.62, 0, 0.16, 0.2, 10)], "skin", 0.95, true);
    }
  };
  const dark = (r, i) => {
    if (i === 2 || i === 3) {
      push([ellipse(cx + r * 0.62, 0, 0.14, 0.18, 10)], "visor", 1, true);
    }
  };
  switch (kind) {
    case "hood":
      dome([0.3, 0.36, 0.4, 0.4, 0.36, 0.28], "cloth", face);
      break;
    case "cowl":
      dome([0.32, 0.38, 0.42, 0.42, 0.38, 0.3], "cloth", dark);
      break;
    case "bare":
      dome([0.26, 0.3, 0.32, 0.32, 0.28, 0.22], "skin");
      push([ellipse(cx - 0.06, 0, 0.3, 0.3, 12)], "hair", 0.95);
      break;
    case "circlet":
      dome([0.26, 0.3, 0.32, 0.32, 0.28, 0.22], "skin", (r, i) => {
        if (i === 3) {
          push([ellipse(cx, 0, r * 1.15, r * 1.1)], "gold", 0.95, true);
        }
      });
      push([ellipse(cx - 0.06, 0, 0.28, 0.3, 12)], "hair", 0.95);
      break;
    case "turban":
      dome([0.34, 0.42, 0.46, 0.46, 0.4, 0.3], "cloth", (r, i) => {
        if (i === 3) {
          push([ellipse(cx + 0.06, 0, r * 0.8, r * 0.7)], "skin", 0.95, true);
        }
      });
      push([ellipse(cx, 0, 0.12, 0.12, 8)], "gold", 1.05);
      break;
    case "hat":
      push([ellipse(cx, 0, 0.62, 0.62, 18)], "cloth", 0.8);
      push([ellipse(cx, 0, 0.34, 0.34, 14)], "skin", 0.85, true);
      dome([0.3, 0.3, 0.28, 0.26, 0.22], "cloth");
      push([ellipse(cx - 0.12, 0.2, 0.22, 0.07, 8, 0.6)], "accent", 1.05);
      break;
    case "headdress":
      dome([0.26, 0.3, 0.32, 0.32, 0.28], "skin");
      push([ellipse(cx - 0.06, 0, 0.3, 0.3, 12)], "hair", 0.95);
      // A fan of feathers up and back.
      [-0.5, -0.25, 0, 0.25, 0.5].forEach((y) => {
        push([ellipse(cx - 0.12, y * 0.7, 0.07, 0.15, 6)], "crest", 1.05, true);
      });
      push([ellipse(cx - 0.12, 0, 0.2, 0.3, 10)], "gold", 1.08);
      break;
    default:
      throw new Error(kind);
  }
}

// ---------------------------------------------------------------------------
// Drawing.

/**
 * @param {number} body
 * @param {Outfit} outfit
 * @param {Accent} [accent]
 */
function tonesFor(body, outfit, accent) {
  const base = stackTones(body, CAPE);
  return {
    ...base,
    cloth: outfit.cloth,
    leather: 0x5a4030,
    rope: 0xb8a070,
    hair: 0x2a2018,
    bone: 0xd8d0b8,
    gold: 0xc9a24a,
    accent: accent?.tone ?? 0xffffff,
  };
}

/** Each distinct figure is drawn once, at body radius `DEF_R`, and placed with `use`. */
const DEF_R = 40;
const defs = new Map();

/** A figure's SVG at `(x, y)` (its feet), body radius `r` px. */
/**
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} facing
 * @param {number} body
 * @param {string} name
 * @param {string} [accentName]
 */
function figureSvg(x, y, r, facing, body, name, accentName) {
  const key = [name, accentName ?? "none", hex(body), Math.round(facing * 100)].join("-");
  if (!defs.has(key)) {
    const outfit = OUTFITS[name];
    const accent = accentName === undefined ? undefined : ACCENTS[accentName];
    /** @type {{ points: Point[], colour: number }[]} */
    const layers = stackLayers(
      outfitSlices(outfit, accent),
      facing,
      DEF_R,
      tonesFor(body, outfit, accent),
    );
    const f1 = (/** @type {number} */ n) => String(Math.round(n * 10) / 10);
    const d = (/** @type {{ points: Point[] }} */ l) =>
      `M${l.points.map((p) => `${f1(p.x)} ${f1(p.y)}`).join("L")}Z`;
    const shadow = `<ellipse rx="${f(DEF_R * 0.75)}" ry="${f(DEF_R * 0.5)}" fill="#000" opacity="0.35"/>`;
    // A 1.6 px outline whatever the scale.
    const outline = `<path d="${layers.map(d).join("")}" fill="${hex(STACK_OUTLINE)}" stroke="${hex(STACK_OUTLINE)}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    // Neighbouring layers of one colour share a path.
    /** @type {{ colour: number, d: string }[]} */
    const runs = [];
    for (const l of layers) {
      const last = runs[runs.length - 1];
      if (last?.colour === l.colour) {
        last.d += d(l);
      } else {
        runs.push({ colour: l.colour, d: d(l) });
      }
    }
    const fills = runs.map((r2) => `<path d="${r2.d}" fill="${hex(r2.colour)}"/>`).join("");
    defs.set(key, `<g id="fig-${String(defs.size)}">${shadow}${outline}${fills}</g>`);
  }
  const id = [...defs.keys()].indexOf(key);
  return `<use href="#fig-${String(id)}" transform="translate(${f(x)} ${f(y)}) scale(${f(r / DEF_R)})"/>`;
}

const out = [];
/** @type {(x: number, y: number, s: string, size?: number, fill?: string, anchor?: string, weight?: string) => void} */
const text = (x, y, s, size = 12, fill = C.ink, anchor = "middle", weight = "normal") => {
  out.push(
    `<text x="${f(x)}" y="${f(y)}" font-family="monospace" font-size="${f(size)}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`,
  );
};

const COL = 150;
const X0 = 90;
const W = X0 + COL * 10 - 20;
let y = 30;
text(
  20,
  y,
  "Profession outfit study (#4175): the stacked figure's outfit follows its primary profession",
  15,
  C.ink,
  "start",
  "bold",
);
y += 20;
text(
  20,
  y,
  "Drawn by the arena's stackLayers/stackTones. Team colour (blue ally, red foe) stays the torso and skirt; cape, emblem and the flat weapon and off-hand marks are unchanged.",
  11,
  C.inkDim,
  "start",
);
y += 16;
text(
  20,
  y,
  "Primary sets torso, legs, shoulders, head, back; secondary adds one accent (sash, trim or belt). Generic gothic fantasy, not any GW1 armour set.",
  11,
  C.inkDim,
  "start",
);

/** @param {string} title @param {number} at */
function labelRow(title, at) {
  text(20, at, title, 12, C.ink, "start", "bold");
}

/** @param {string} title @param {number} body @param {number} facing @param {number} r @param {number} at */
function outfitRow(title, body, facing, r, at) {
  labelRow(title, at - r * 3.1);
  ORDER.forEach((name, i) => {
    const cx = X0 + COL * i;
    out.push(figureSvg(cx, at, r, facing, body, name));
    text(cx, at + r + 18, name, 11, C.inkDim);
  });
}

y += 150;
outfitRow(
  "Ally, menu figure (body radius 40 px), facing the camera",
  C.friend,
  Math.PI * 0.5 + 0.35,
  40,
  y,
);
y += 210;
outfitRow("Foe, same", C.foe, Math.PI * 0.5 + 0.35, 40, y);
y += 210;
outfitRow(
  "Ally from the side (facing right): the silhouette each outfit reads as",
  C.friend,
  0,
  40,
  y,
);

// True size at the four camera zooms.
const ZOOMS = [
  ["Close", 640],
  ["Near", 860],
  ["Default", 1100],
  ["Wide", 1400],
];
y += 160;
ZOOMS.forEach(([zoomName, height]) => {
  const r = 14 * (1080 / height);
  labelRow(
    `True size, ${String(zoomName)} (view height ${String(height)}; body radius ${f(r)} px), ally and foe side by side`,
    y - 82,
  );
  ORDER.forEach((name, i) => {
    const cx = X0 + COL * i;
    out.push(figureSvg(cx - 26, y, r, Math.PI * 0.5 + 0.35, C.friend, name));
    out.push(figureSvg(cx + 26, y, r, Math.PI * 0.5 - 0.35, C.foe, name));
  });
  y += 120;
});

// Secondary accents on the warrior.
y += 110;
labelRow(
  "Secondary accents, on the warrior outfit: none, monk (white sash), elementalist (ember trim), necromancer (bone belt), assassin (red belt)",
  y - 130,
);
[undefined, "monk", "elementalist", "necromancer", "assassin"].forEach((sec, i) => {
  const cx = X0 + COL * (i * 2);
  out.push(figureSvg(cx, y, 40, Math.PI * 0.5 + 0.35, C.friend, "warrior", sec));
  out.push(figureSvg(cx + 70, y, 14, Math.PI * 0.5 + 0.35, C.friend, "warrior", sec));
  text(cx + 30, y + 58, sec ?? "no secondary", 11, C.inkDim);
});
y += 90;
const table = Object.entries(ACCENTS).map(([k, a]) => `${k} ${a.kind} ${hex(a.tone)}`);
labelRow("Accent table (secondary: kind, tone): " + table.slice(0, 5).join(" · "), y);
labelRow(table.slice(5).join(" · "), y + 18);
y += 110;

const body = `<defs>${[...defs.values()].join("\n")}</defs>\n` + out.join("\n");
writeFileSync(
  outFile,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(y)}" width="${f(W)}" height="${f(y)}">\n<rect width="${f(W)}" height="${f(y)}" fill="${C.bg}"/>\n${body}\n</svg>\n`,
);

// ---------------------------------------------------------------------------
// Checks: the warrior is the game's figure; lift counts; team colour share.

const lifts = (/** @type {Slice[]} */ slices) => slices.filter((s) => !s.same).length;
const same = JSON.stringify(outfitSlices(OUTFITS.warrior)) === JSON.stringify(stackSlices("stand"));
console.log(`builder warrior equals stackSlices("stand"): ${String(same)}`);
if (!same) {
  throw new Error("the study's warrior is no longer the game's stackSlices(\"stand\")");
}

/** The share of a 0.04-radius grid inside any team polygon (top-down). */
/** @param {Slice[]} slices */
function teamArea(slices) {
  let hit = 0;
  const polys = slices.filter((s) => s.tone === "team").flatMap((s) => s.parts);
  for (let px = -1.2; px <= 1.2; px += 0.04) {
    for (let py = -1.2; py <= 1.2; py += 0.04) {
      if (polys.some((p) => inside(p, px, py))) {
        hit += 1;
      }
    }
  }
  return hit;
}
/** @param {Point[]} poly @param {number} px @param {number} py */
function inside(poly, px, py) {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      on = !on;
    }
  }
  return on;
}
const warrior = outfitSlices(OUTFITS.warrior);
const baseArea = teamArea(warrior);
for (const name of ORDER) {
  const s = outfitSlices(OUTFITS[name]);
  const sx = outfitSlices(OUTFITS[name], ACCENTS[name === "warrior" ? "monk" : "warrior"]);
  const extra = lifts(sx) - lifts(warrior);
  const added = lifts(s) - lifts(warrior);
  const share = Math.round((100 * teamArea(s)) / baseArea);
  if (added > 4 || extra > 4) {
    throw new Error(
      `${name}: lifts ${String(added)} / ${String(extra)} over the warrior's, more than 4`,
    );
  }
  if (share < 80) {
    throw new Error(`${name}: team-colour area ${String(share)} % of the warrior's, under 80 %`);
  }
  console.log(
    [
      name.padEnd(13),
      `lifts ${String(lifts(s))} (${String(added)} vs warrior), with accent ${String(extra)}; team area ${String(share)} %`,
    ].join(" "),
  );
}

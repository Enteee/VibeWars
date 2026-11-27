/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unused-vars -- an untyped SVG generator: points and slices are plain arrays and numbers go into strings. */
// Figure body study (#4176, epic #3974): height, build and hair, three options each,
// freely combined, on top of any outfit. Height scales the stack's lift 0.92 / 1 / 1.08;
// build changes shoulder, chest, waist and limb widths and the lean (posture);
// hair is a neutral dark cue behind or below the headgear. No gender anywhere.
// Shown on the warrior, monk and ranger outfits, ally and foe, at the four camera zooms
// (view height 640 / 860 / 1100 / 1400 on a 1080 px canvas) and on the menu figure,
// plus a strip of mixed combinations.
// Units are sprite-stack.ts's: body radii, x forward, y right, one lift = 1/12.
// Generic gothic fantasy, not any GW1 armour set.
// Usage: node scripts/assets/figure-body-study.mjs   (writes docs/art/figure-body-study.svg, and the .png when inkscape is there)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const STEP = 1 / 12;
const OUTLINE = "#08080a";
const el = (cx, cy, rx, ry, n = 14) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [+(cx + rx * Math.cos(a)).toFixed(3), +(cy + ry * Math.sin(a)).toFixed(3)];
  });
const S = (parts, tone, light = 1, same = false, alpha = 1) => ({
  parts,
  tone,
  light,
  same,
  alpha,
});

const C = {
  boot: "#1c1a1a",
  skin: "#b89a84",
  visor: "#101014",
  steel: "#9aa0a8",
  dark: "#2a2a30",
  leather: "#5a4030",
  rope: "#b8a070",
  cloth: "#4a4658",
  gold: "#c9a227",
  bone: "#d8d0bc",
  hair: "#4a3a2c",
  paleHair: "#c8c0a8",
  green: "#4a6a3a",
  black: "#17171c",
  wrap: "#8a7a5a",
};
const TEAMS = { ally: "#59c2ff", foe: "#ff7b72" };

// ---- outfits: torso, legs, shoulders, head, back ---------------------------
const OUTFITS = {
  warrior: {
    sleeve: "steel",
    torso: "plate",
    legs: "trousers",
    shoulders: "pauldron",
    head: "helm",
    back: "cape",
  },
  ranger: {
    sleeve: "#5a4030",
    torso: "coat",
    legs: "trousers",
    shoulders: "none",
    head: "hood",
    back: "quiver",
  },
  monk: {
    sleeve: "#e0d8c4",
    hem: "#e0d8c4",
    torso: "robe",
    legs: "long",
    shoulders: "none",
    head: "bare-pale",
    back: "none",
    belt: C.rope,
  },
  elementalist: {
    sleeve: "#3a3050",
    hem: "#3a3050",
    torso: "robe",
    legs: "long",
    shoulders: "collar",
    head: "circlet",
    back: "none",
  },
  necromancer: {
    sleeve: "#1c1822",
    hem: "#1c1822",
    torso: "robe",
    legs: "long",
    shoulders: "spikes",
    head: "deep-hood",
    back: "none",
    dark: true,
  },
  mesmer: {
    sleeve: "#3a2a4a",
    torso: "coat",
    legs: "trousers",
    shoulders: "collar",
    head: "mask",
    back: "tails",
  },
  assassin: {
    sleeve: "#17171c",
    torso: "wrap",
    legs: "trousers",
    shoulders: "cloth",
    head: "hood-mask",
    back: "scarf",
  },
  ritualist: {
    torso: "robe",
    legs: "skirt",
    shoulders: "none",
    head: "headband",
    back: "none",
    bare: true,
  },
  paragon: {
    sleeve: "steel",
    torso: "plate",
    legs: "trousers",
    shoulders: "small",
    head: "winged",
    back: "tabard",
  },
  dervish: {
    torso: "wrap",
    legs: "long",
    shoulders: "none",
    head: "turban",
    back: "none",
    bare: true,
  },
};
// secondary accents: a sash, trim or belt in the secondary's tone.
const ACCENTS = {
  monk: { kind: "sash", tone: "#e8e4d8" },
  elementalist: { kind: "trim", tone: "#ff7a3a" },
  ranger: { kind: "belt", tone: "#7aa04a" },
};

const HEIGHT_SCALE = { short: 0.92, average: 1, tall: 1.08 };
// Widths by region (y), and lean: the forward shift of the upper body (x), in body radii.
const BUILD_SHAPES = {
  lean: { shoulder: 0.84, chest: 0.8, waist: 0.76, limb: 0.82, lean: 0 },
  average: { shoulder: 1, chest: 1, waist: 1, limb: 1, lean: 0.04 },
  heavy: { shoulder: 1.24, chest: 1.22, waist: 1.24, limb: 1.2, lean: 0.12 },
};
const HAIR_TONE = "#3a2e26";
function applyBody(slices, body) {
  const b = BUILD_SHAPES[body.build];
  const k = {
    legs: b.limb,
    hip: b.waist,
    torso: b.chest,
    arm: b.shoulder,
    shoulder: b.shoulder,
    head: 1,
  };
  // posture: the upper body leans forward, the head most; a heavy stance is wider (limb)
  const fwd = {
    legs: 0,
    hip: 0,
    torso: b.lean * 0.6,
    arm: b.lean * 0.8,
    shoulder: b.lean,
    head: b.lean * 1.3,
  };
  const out = slices.map((sl) => ({
    ...sl,
    parts: sl.parts.map((part) =>
      part.map(([x, y]) => [+(x + fwd[sl.reg]).toFixed(3), +(y * k[sl.reg]).toFixed(3)]),
    ),
  }));
  const headAt = out.findIndex((sl) => sl.reg === "head");
  const base = out.slice(0, headAt).filter((sl) => !sl.same).length;
  const f = fwd.head;
  const hair = (parts, abs) =>
    out.push({ parts, tone: HAIR_TONE, light: 0.9, same: false, alpha: 1, abs });
  if (body.hair === "cropped") hair([el(-0.24 + f, 0, 0.12, 0.2, 8)], base + 3);
  if (body.hair === "long")
    for (let i = 0; i < 6; i++)
      hair([el(-0.3 + f - 0.05 * i, 0, 0.2, 0.3 - 0.015 * i, 8)], base + 5 - i);
  if (body.hair === "tied") {
    hair([el(-0.3 + f, 0, 0.1, 0.1, 6)], base + 4); // the tie
    for (let i = 0; i < 5; i++)
      hair([el(-0.42 + f - 0.13 * i, 0, 0.13, 0.1, 6)], base + 4 - 0.8 * i);
  }
  return out;
}

function figure(pose, o, accent, body) {
  let reg = "legs";
  const st = pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
  const f = 0.3 * st;
  const s = [];
  const push = (...a) => {
    const sl = S(...a);
    sl.reg = reg;
    s.push(sl);
  };
  const cloth = o.dark ? "#2a2634" : null; // tone the non-team cloth of a dark outfit
  // legs
  if (o.legs === "trousers" || o.legs === "skirt") {
    for (let i = 0; i < 2; i++)
      push(
        [el(f + 0.05, -0.26, 0.26, 0.16, 10), el(-f + 0.05, 0.26, 0.26, 0.16, 10)],
        C.boot,
        0.5 + 0.2 * i,
      );
    for (let i = 0; i < 4; i++)
      push(
        [el(f * 0.7, -0.24, 0.18, 0.17, 10), el(-f * 0.7, 0.24, 0.18, 0.17, 10)],
        o.legs === "skirt" && i > 1 ? C.wrap : C.dark,
        0.55 + 0.08 * i,
      );
  } else {
    for (let i = 0; i < 2; i++)
      push(
        [el(f * 0.6 + 0.2, -0.22, 0.22, 0.14, 8), el(-f * 0.6 + 0.2, 0.22, 0.22, 0.14, 8)],
        C.boot,
        0.45 + 0.15 * i,
      );
  }
  reg = "hip";
  // hem: skirt / long robe / short coat flare, team coloured
  const hem = {
    long: [0.74, 0.72, 0.7, 0.68, 0.66, 0.64, 0.62, 0.6],
    skirt: [0.7, 0.66, 0.62, 0.6, 0.58],
    trousers: [0.62, 0.6, 0.58, 0.56],
  }[o.legs];
  hem.forEach((r, i) => {
    if (o.back === "cape") push([el(-0.3, 0, 0.32, 0.66)], "cape", 0.5 + 0.06 * i);
    if (o.back === "tails" && i >= 1) push([el(-0.45, 0, 0.3, 0.3)], "team", 0.5 + 0.05 * i, true);
    if (o.back === "tabard" && i < 3) push([el(0.1, 0, 0.5, 0.18)], C.gold, 0.5 + 0.05 * i);
    push([el(0, 0, r * 0.72, r)], "team", 0.55 + 0.04 * i, o.back === "cape");
  });
  if (accent?.kind === "trim") push([el(0, 0, 0.5, 0.7)], accent.tone, 0.8, true, 0.9); // hem band
  if (o.hem)
    for (let i = 0; i < 2; i++)
      push([el(0, 0, 0.74 * 0.72 - 0.02 * i, 0.76 - 0.02 * i)], o.hem, 0.5 + 0.1 * i); // a contrasting hem band, over the skirt
  push(
    [el(0, 0, 0.4, 0.56)],
    accent?.kind === "belt"
      ? accent.tone
      : (o.belt ?? (o.torso === "plate" ? "#3a2a20" : C.leather)),
    0.9,
  );
  // torso and arms
  reg = "torso";
  const sleeveTone = o.sleeve ?? (o.bare ? "skin" : o.torso === "plate" ? "steel" : "team");
  for (let i = 0; i < 7; i++) {
    reg = "torso";
    if (o.back === "cape") push([el(-0.3, 0, 0.3, 0.6 + 0.02 * i)], "cape", 0.6 + 0.05 * i);
    const tr =
      o.torso === "wrap"
        ? [0.5, 0.52, 0.54, 0.56, 0.56]
        : o.torso === "robe"
          ? [0.58, 0.62, 0.66, 0.68, 0.7]
          : [0.56, 0.6, 0.64, 0.68, 0.7];
    if (i >= 2)
      push(
        [el(0.06, 0, tr[Math.min(i - 2, 4)] * 0.66, tr[Math.min(i - 2, 4)])],
        "team",
        0.74 + 0.04 * i,
        true,
      );
    if (o.back === "quiver" && i >= 2)
      push([el(-0.38 - 0.02 * i, 0.22, 0.1, 0.1, 6)], C.leather, 0.6 + 0.05 * i);
    if (o.back === "scarf" && i >= 3)
      push([el(-0.45, -0.1 + 0.05 * i, 0.22, 0.07, 6)], C.black, 0.6 + 0.05 * i);
    reg = "arm";
    const sw = -0.22 * st * (1 - i / 7);
    const arm = i < 2 && o.torso === "plate" ? C.steel : sleeveTone;
    push([el(sw, -0.66, 0.15, 0.14, 10), el(-sw, 0.66, 0.15, 0.14, 10)], arm, 0.7 + 0.04 * i, true);
    if (accent?.kind === "sash" && i >= 1 && i <= 5)
      push([el(0.1 + 0.02 * i, -0.3 + 0.12 * i, 0.16, 0.12, 6)], accent.tone, 0.8 + 0.03 * i, true); // diagonal across the chest
  }
  if (accent?.kind === "trim") push([el(0.06, 0, 0.5, 0.7)], accent.tone, 0.95, true, 0.55); // collar edge
  // shoulders
  reg = "shoulder";
  const sh = o.shoulders;
  if (sh === "pauldron" || sh === "small" || sh === "spikes") {
    const big = sh === "pauldron" ? 1 : 0.7;
    for (let i = 0; i < 2; i++)
      push(
        [el(0, -0.6, 0.3 * big, 0.26 * big, 12), el(0, 0.6, 0.3 * big, 0.26 * big, 12)],
        sh === "spikes" ? C.bone : C.steel,
        0.85 + 0.15 * i,
      );
    if (sh === "spikes")
      push(
        [
          [
            [-0.1, -0.7],
            [0.15, -0.95],
            [0.1, -0.6],
          ],
          [
            [-0.1, 0.7],
            [0.15, 0.95],
            [0.1, 0.6],
          ],
        ],
        C.bone,
        1.05,
        true,
      );
  }
  if (sh === "cloth") push([el(-0.05, -0.55, 0.3, 0.28, 10)], C.black, 0.9);
  // neck, collar, head
  reg = "head";
  push([el(0.06, 0, 0.16, 0.16, 10)], "skin", 0.8);
  if (sh === "collar")
    for (let i = 0; i < 2; i++)
      push(
        [el(0.05, 0, 0.3 - 0.04 * i, 0.38 - 0.06 * i)],
        o.torso === "coat" ? C.cloth : "team",
        0.9 + 0.05 * i,
        true,
      );
  const head = o.head;
  const hr = [0.3, 0.36, 0.38, 0.38, 0.34, 0.26];
  hr.forEach((r, i) => {
    const hx = 0.1;
    if (head === "helm" || head === "winged")
      push([el(hx, 0, r * 1.05, r)], C.steel, 0.7 + 0.07 * i);
    else if (head === "hood" || head === "deep-hood" || head === "hood-mask")
      push(
        [el(hx - (head === "deep-hood" ? 0.04 : 0), 0, r * 1.1, r * 1.05)],
        cloth ?? (head === "hood-mask" ? C.black : C.green),
        0.6 + 0.07 * i,
      );
    else if (head === "turban")
      push(
        [el(hx, 0, r * 1.15 + (i === 3 ? 0.04 : 0), r * 1.1)],
        i % 2 ? "#e8e0c8" : "#c8bea0",
        0.7 + 0.07 * i,
      );
    else
      push(
        [el(hx, 0, r * 1.05, r)],
        i < 2 ? "skin" : head === "bare-pale" ? C.paleHair : C.hair,
        0.7 + 0.07 * i,
      );
    if ((i === 2 || i === 3) && (head === "helm" || head === "winged"))
      push(
        [
          [
            [hx + r * 0.55, -r * 0.7],
            [hx + r * 1.1, -r * 0.35],
            [hx + r * 1.1, r * 0.35],
            [hx + r * 0.55, r * 0.7],
          ],
        ],
        C.visor,
        1,
        true,
      );
    if ((i === 2 || i === 3) && (head === "hood" || head === "deep-hood"))
      push(
        [el(hx + r * 0.75, 0, r * 0.35, r * 0.5, 8)],
        head === "deep-hood" ? C.visor : "skin",
        0.9,
        true,
      );
    if ((i === 2 || i === 3) && (head === "mask" || head === "hood-mask"))
      push(
        [el(hx + r * 0.75, 0, r * 0.3, r * 0.6, 8)],
        head === "mask" ? "#e8e4d8" : C.visor,
        1,
        true,
      );
    if (i === 5 && head === "helm") push([el(0.05, 0, 0.32, 0.08, 8)], "#b03030", 1.05);
    if (i === 4 && head === "circlet") push([el(hx, 0, r * 1.1, r * 1.08)], C.gold, 1.0, true, 0.9);
    if (i === 3 && head === "headband") push([el(hx, 0, r * 1.1, r * 1.08)], "#b03030", 1.0, true);
    if (i === 5 && head === "winged")
      push(
        [
          [
            [0, -0.28],
            [-0.25, -0.85],
            [0.2, -0.38],
          ],
          [
            [0, 0.28],
            [-0.25, 0.85],
            [0.2, 0.38],
          ],
        ],
        C.gold,
        1.05,
      );
  });
  return applyBody(s, body);
}

// ---- rendering -----------------------------------------------------------------
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const shade = (c, l) => {
  const k = Math.min(1.1, 0.25 + 0.75 * l + 0.12);
  return (
    "#" +
    hex(c)
      .map((v) =>
        Math.round(Math.min(255, v * k))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
const defs = [];
const used = new Map();
// One def per outfit, body, team, heading and pose, in unit space (R = 1).
function defId(id, body, team, heading, pose) {
  const key = `${id}-${body.height}-${body.build}-${body.hair}-${team}-${heading}-${pose}`;
  if (used.has(key)) return key;
  const slices = figure(pose, OUTFITS[id], undefined, body);
  const hs = HEIGHT_SCALE[body.height];
  const facing = (heading * Math.PI) / 4;
  const ca = Math.cos(facing),
    sa = Math.sin(facing);
  let lift = 0;
  const layers = slices.map((sl) => {
    if (sl.abs !== undefined) lift = sl.abs;
    else if (!sl.same) lift++;
    const pts = sl.parts.map((part) =>
      part
        .map(
          ([x, y]) =>
            `${(x * ca - y * sa).toFixed(2)},${((x * sa + y * ca) * 0.9 - STEP * lift * hs).toFixed(2)}`,
        )
        .join(" "),
    );
    const tone =
      sl.tone === "team"
        ? TEAMS[team]
        : sl.tone === "cape"
          ? "#8a2a2a"
          : sl.tone === "skin"
            ? C.skin
            : sl.tone === "steel"
              ? C.steel
              : sl.tone;
    return { sl, pts, tone };
  });
  const outline = layers
    .map(({ pts }) => pts.map((p) => `<polygon points="${p}"/>`).join(""))
    .join("");
  const fills = layers
    .map(({ sl, pts, tone }) =>
      pts
        .map(
          (p) =>
            `<polygon points="${p}" fill="${shade(tone, sl.light)}"${sl.alpha < 1 ? ` opacity="${sl.alpha}"` : ""}/>`,
        )
        .join(""),
    )
    .join("");
  defs.push(
    `<g id="${key}"><ellipse cx="0" cy="0.08" rx="0.95" ry="0.8" fill="#000" opacity="0.5"/><g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="0.19" stroke-linejoin="round">${outline}</g>${fills}</g>`,
  );
  used.set(key, true);
  return key;
}
const place = (id, body, team, x, y, px, heading = 0, pose = "stand") =>
  `<use href="#${defId(id, body, team, heading, pose)}" transform="translate(${x} ${y}) scale(${px})"/>`;
const plate = (x, y, px, c) =>
  `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => `${(x + px * 0.95 * Math.cos((i * Math.PI) / 3)).toFixed(1)},${(y + px * 0.86 * Math.sin((i * Math.PI) / 3)).toFixed(1)}`).join(" ")}" fill="${c}" opacity="0.55" stroke="${c}" stroke-width="1"/>`;
const txt = (x, y, t, s = 12, c = "#d7dee8", anchor = "start") =>
  `<text x="${x}" y="${y}" font-size="${s}" fill="${c}" text-anchor="${anchor}">${t}</text>`;

const ZOOMS = [
  [640, 20.6],
  [860, 15.3],
  [1100, 12],
  [1400, 9.4],
];
const OUT = ["warrior", "monk", "ranger"];
const AVG = { height: "average", build: "average", hair: "cropped" };
const AXES = [
  [
    "height",
    "Height: stack scaled 0.92 / 1 / 1.08 (build average, hair cropped)",
    ["short", "average", "tall"],
  ],
  [
    "build",
    "Build: lean / average / heavy; posture follows (height average, hair cropped)",
    ["lean", "average", "heavy"],
  ],
  [
    "hair",
    "Hair: cropped / long / tied, neutral dark, behind the headgear (height and build average)",
    ["cropped", "long", "tied"],
  ],
];
const COL = 330,
  X0 = 50,
  PANEL = 900;
const W = X0 + COL * 3 + 20;
const H = 70 + PANEL * 3 + 420;
let body = txt(
  20,
  28,
  "Figure body study (#4176): height, build and hair, three options each, freely combined, on the warrior, monk and ranger outfits.",
  14,
);
body += txt(
  20,
  48,
  "Each panel varies one axis; ally east, foe west, the four zooms, and the menu figure (monk, facing the viewer). Team colour, badge, cape and weapon marks unchanged.",
  12,
  "#9aa4b2",
);
AXES.forEach(([axis, title, values], p) => {
  const top = 70 + p * PANEL;
  body += txt(20, top + 20, title, 14, "#e8eef6");
  values.forEach((v, c) => {
    const cx = X0 + COL * c + COL / 2;
    const bd = { ...AVG, [axis]: v };
    body += txt(cx, top + 50, v, 15, "#e8eef6", "middle");
    OUT.forEach((id, r) => {
      const y = top + 225 + r * 210;
      body += plate(cx - 60, y, 52, TEAMS.ally) + place(id, bd, "ally", cx - 60, y, 52, 0);
      body += plate(cx + 60, y, 52, TEAMS.foe) + place(id, bd, "foe", cx + 60, y, 52, 4);
      ZOOMS.forEach(([h, px], j) => {
        const x = cx - 100 + j * 66;
        body += plate(x, y + 78, px, TEAMS.ally) + place(id, bd, "ally", x, y + 78, px, 1);
      });
      if (c === 0) body += txt(8, y - 90, id, 12, "#9aa4b2");
    });
    body += plate(cx, top + 830, 46, TEAMS.ally) + place("monk", bd, "ally", cx, top + 830, 46, 2);
  });
});
// a strip of mixed combinations
const MIX = [
  ["warrior", { height: "tall", build: "heavy", hair: "cropped" }],
  ["monk", { height: "short", build: "lean", hair: "long" }],
  ["ranger", { height: "average", build: "lean", hair: "tied" }],
  ["warrior", { height: "short", build: "heavy", hair: "tied" }],
  ["monk", { height: "tall", build: "average", hair: "long" }],
];
const sy = 70 + PANEL * 3;
body += txt(
  20,
  sy + 20,
  "Mixed strip: freely combined, ally and foe (height / build / hair)",
  14,
  "#e8eef6",
);
MIX.forEach(([id, bd], i) => {
  const cx = 100 + i * 190;
  body += plate(cx, sy + 235, 58, i % 2 ? TEAMS.foe : TEAMS.ally);
  body += place(id, bd, i % 2 ? "foe" : "ally", cx, sy + 235, 58, i % 2 ? 4 : 0);
  body += plate(cx, sy + 335, 20.6, TEAMS.ally) + place(id, bd, "ally", cx, sy + 335, 20.6, 1);
  body += txt(cx, sy + 385, `${id}: ${bd.height} ${bd.build} ${bd.hair}`, 11, "#9aa4b2", "middle");
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#1b1d22"/><defs>${defs.join("")}</defs>${body}</svg>`;
writeFileSync("docs/art/figure-body-study.svg", svg);
try {
  execFileSync(
    "inkscape",
    ["docs/art/figure-body-study.svg", "-o", "docs/art/figure-body-study.png"],
    {
      stdio: "ignore",
    },
  );
} catch {
  console.error("inkscape failed: the png was not written");
}
console.log(`svg ${svg.length} bytes`);

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unused-vars -- an untyped SVG generator: points and slices are plain arrays and numbers go into strings. */
// Creature stack study (#4171-#4173, ADR-0057): every creature look as stacked
// slices, same units as render/sprite-stack.ts (body radii, x forward, y right,
// STACK_STEP 1/12 a lift). Writes docs/art/creature-stack-study.svg and, when
// inkscape is on the path, the .png. Run: node scripts/assets/creature-stack-study.mjs
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const BODY_PX = 12; // a body radius on screen at the default camera
const STEP = 1 / 12;
const OUTLINE = "#08080a";

const el = (cx, cy, rx, ry, n = 14) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
const poly = (...p) => p;
// A slice: parts, tone (a colour), light, same (shares the previous lift), alpha.
const S = (parts, tone, light = 1, same = false, alpha = 1) => ({
  parts,
  tone,
  light,
  same,
  alpha,
});

// ---- tone sets -------------------------------------------------------------
const T = {
  boot: "#1c1a1a",
  dark: "#14141a",
  skin: "#b89a84",
  visor: "#101014",
  steel: "#9aa0a8",
  gold: "#c9a227",
  bone: "#d8d0bc",
  boneGap: "#2a2622",
  flesh: "#b9a58f",
  seam: "#3a2a2a",
  red: "#7a1f2b",
  wisp: "#76c96f",
  stone: "#4a4a50",
  fur: "#8a7360",
  furDark: "#5a4a3e",
  ghost: "#8fa3b8",
  robe: "#d9d2c0",
  wood: "#6a4a2c",
  cloth: "#8a2a2a",
};

// ---- the human build, with a tone set and parts per look --------------------
function human(pose, o) {
  const st = pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
  const f = 0.3 * st;
  const out = [];
  const push = (...a) => out.push(S(...a));
  const legTone = o.legs ?? T.dark;
  if (!o.robeToGround) {
    for (let i = 0; i < 2; i++)
      push(
        [el(f + 0.05, -0.26, 0.26, 0.16, 10), el(-f + 0.05, 0.26, 0.26, 0.16, 10)],
        T.boot,
        0.5 + 0.2 * i,
      );
    for (let i = 0; i < 4; i++)
      push(
        [el(f * 0.7, -0.24, 0.18, 0.17, 10), el(-f * 0.7, 0.24, 0.18, 0.17, 10)],
        legTone,
        0.55 + 0.08 * i,
      );
  }
  // skirt / robe
  const skirt = o.robeToGround
    ? [0.7, 0.68, 0.66, 0.64, 0.62, 0.6, 0.58, 0.56]
    : [0.62, 0.6, 0.58, 0.56];
  skirt.forEach((r, i) => {
    if (o.cape) push([el(-0.3, 0, 0.32, 0.66)], o.cape, 0.5 + 0.06 * i);
    push([el(0, 0, r * 0.72, r + (o.robeToGround ? 0.04 : 0))], o.body, 0.6 + 0.04 * i, !!o.cape);
  });
  push([el(0, 0, 0.4, 0.56)], o.belt ?? "#3a2a20", 0.9);
  // torso + arms
  for (let i = 0; i < 7; i++) {
    if (o.cape) push([el(-0.3, 0, 0.3, 0.6 + 0.02 * i)], o.cape, 0.6 + 0.05 * i);
    if (i >= 2)
      push(
        [
          el(
            0.06,
            0,
            [0.56, 0.6, 0.64, 0.68, 0.7][Math.min(i - 2, 4)] * 0.66,
            [0.56, 0.6, 0.64, 0.68, 0.7][Math.min(i - 2, 4)],
          ),
        ],
        o.body,
        0.74 + 0.04 * i,
        true,
        o.alpha,
      );
    const sw = -0.22 * st * (1 - i / 7);
    push(
      [el(sw, -0.66, 0.15, 0.14, 10), el(-sw, 0.66, 0.15, 0.14, 10)],
      i < 2 ? (o.arm ?? T.steel) : o.body,
      0.7 + 0.04 * i,
      true,
    );
  }
  for (let i = 0; i < 2; i++)
    push(
      [el(0, -0.6, 0.3, 0.26, 12), el(0, 0.6, 0.3, 0.26, 12)],
      o.shoulder ?? o.metal,
      0.85 + 0.15 * i,
    );
  push([el(0.06, 0, 0.16, 0.16, 10)], T.skin, 0.8);
  [0.3, 0.36, 0.38, 0.38, 0.34, 0.26].forEach((r, i) => {
    push([el(0.1, 0, r * 1.05, r)], o.head ?? o.metal, 0.7 + 0.07 * i);
    if ((i === 2 || i === 3) && !o.hood)
      push(
        [
          poly(
            [0.1 + r * 0.55, -r * 0.7],
            [0.1 + r * 1.1, -r * 0.35],
            [0.1 + r * 1.1, r * 0.35],
            [0.1 + r * 0.55, r * 0.7],
          ),
        ],
        T.visor,
        1,
        true,
      );
    if ((i === 2 || i === 3) && o.hood)
      push([el(0.1 + r * 0.7, 0, r * 0.4, r * 0.55, 8)], T.skin, 0.9, true);
    if (i === 5 && o.crest) push([el(0.05, 0, 0.32, 0.08, 8)], o.crest, 1.05);
  });
  return out.concat(o.extra ? o.extra(pose, st) : []);
}
// an upright pole: n tiny slices at (x, y) from lift `from`, then a tip.
const pole = (x, y, n, tone, tip, tipTone = T.steel) => {
  const s = [{ reset: 8, parts: [] }]; // rises from the hand, not from the top of the figure
  for (let i = 0; i < n; i++) s.push(S([el(x, y, 0.1, 0.1, 6)], tone, 0.8 + 0.2 * (i / n)));
  for (let i = 0; i < tip; i++)
    s.push(S([el(x, y, 0.16 - 0.04 * i, 0.12 - 0.03 * i, 6)], tipTone, 1));
  return s;
};

// ---- the creatures -----------------------------------------------------------
const L = {};
L.spirit = () => {
  const s = [
    S([el(0, 0, 0.55, 0.55, 10)], T.stone, 0.35),
    S([el(0, 0, 0.45, 0.45, 10)], T.stone, 0.55),
  ];
  for (let i = 0; i < 9; i++) {
    const r = 0.38 - 0.032 * i;
    s.push(S([el(0, 0, r, r)], i > 6 ? "#e8f7e4" : T.wisp, 0.6 + 0.05 * i, false, 0.9 - 0.04 * i));
  }
  return s;
};
const ghostTones = {
  body: T.ghost,
  metal: "#aebdcf",
  arm: "#aebdcf",
  legs: "#6a7a8e",
  alpha: 0.75,
};
L["ghostly-hero"] = (p) =>
  human(p, {
    ...ghostTones,
    crest: "#dfe9f5",
    extra: (_, st) => {
      // an axe on the right hand: haft up, a wedge head
      const s = pole(0.2 - 0.1 * st, 0.7, 8, T.wood, 0);
      for (let i = 0; i < 3; i++)
        s.push(
          S(
            [
              poly(
                [0.2 - 0.1 * st, 0.7],
                [0.55 - 0.1 * st, 0.95 - 0.05 * i],
                [0.55 - 0.1 * st, 0.45 + 0.05 * i],
              ),
            ],
            "#dfe9f5",
            0.9 + 0.05 * i,
          ),
        );
      return s;
    },
  });

// skeleton rib slices: bone rings with dark gaps between, spine behind.
function skeleton(pose, { k, wide, deep, ribs, skull, hunch, extra }) {
  const st = pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
  const s = [];
  for (let i = 0; i < 2; i++)
    s.push(
      S(
        [el(0.3 * st * k, -0.2 * wide, 0.2, 0.12, 8), el(-0.3 * st * k, 0.2 * wide, 0.2, 0.12, 8)],
        T.bone,
        0.5 + 0.2 * i,
      ),
    );
  for (let i = 0; i < 3; i++)
    s.push(
      S(
        [
          el(0.2 * st * k, -0.18 * wide, 0.09, 0.09, 6),
          el(-0.2 * st * k, 0.18 * wide, 0.09, 0.09, 6),
        ],
        T.bone,
        0.6 + 0.08 * i,
      ),
    );
  s.push(S([el(0, 0, 0.3 * wide, 0.3 * wide)], T.bone, 0.7)); // pelvis
  for (let i = 0; i < ribs; i++) {
    const r = (0.42 + 0.05 * Math.sin((i / ribs) * Math.PI)) * wide;
    const lead = hunch * (i / ribs);
    s.push(S([el(lead, 0, 0.1, 0.1, 6)], T.bone, 0.6 + 0.03 * i)); // spine
    s.push(S([el(lead, 0, r * 0.7 * deep, r)], T.boneGap, 0.45 + 0.04 * i, true));
    s.push(
      S(
        [el(lead, -r * 0.8, 0.12, 0.12 * deep, 6), el(lead, r * 0.8, 0.12, 0.12 * deep, 6)],
        T.bone,
        0.75 + 0.03 * i,
        true,
      ),
    );
    if (i % 2 === 0) s.push(S([el(lead, 0, r * 0.6 * deep, r * 0.95)], T.bone, 0.8 + 0.02 * i));
  }
  const hx = hunch + 0.1;
  [0.24, 0.3, 0.32, 0.28, 0.2].slice(0, skull).forEach((r, i) => {
    s.push(S([el(hx, 0, r * 1.1, r)], T.bone, 0.75 + 0.06 * i));
    if (i === 1)
      s.push(
        S(
          [el(hx + r * 0.7, -r * 0.35, 0.05, 0.05, 6), el(hx + r * 0.7, r * 0.35, 0.05, 0.05, 6)],
          "#08080a",
          1,
          true,
        ),
      );
  });
  return s.concat(extra ? extra(pose, st, hunch) : []);
}
L["bone-minion"] = (p) =>
  skeleton(p, { k: 1, wide: 0.8, deep: 0.8, ribs: 4, skull: 4, hunch: 0.18 });
const horror =
  (extra, o = {}) =>
  (p) =>
    skeleton(p, { k: 1.1, wide: 1.55, deep: 1.1, ribs: 6, skull: 5, hunch: 0.12, ...o, extra });
// per-kind parts (the spike, glow, spurs) ride on the shared build.
L["bone-horror"] = horror(() => []);
L["bone-fiend"] = horror((_, __, h) => {
  const s = [];
  for (let i = 0; i < 7; i++)
    s.push(
      S([el(-0.35 + 0.05 * i, 0, 0.1 - 0.012 * i, 0.07 - 0.008 * i, 6)], T.bone, 0.85 + 0.02 * i),
    );
  return s;
});
L["vampiric-horror"] = horror(() => [
  S([el(0.05, 0, 0.3, 0.46)], T.red, 1.05, false, 0.9),
  S([el(0.05, 0, 0.2, 0.34)], "#c2384a", 1.1, true, 0.9),
]);
L["shambling-horror"] = (p) =>
  skeleton(p, {
    k: 0.6,
    wide: 1.5,
    deep: 1.0,
    ribs: 6,
    skull: 5,
    hunch: 0.38,
    extra: (_, __, h) => [
      S([el(0.3, 0.45, 0.22, 0.18, 8)], T.bone, 0.9),
      S([el(0.3, 0.45, 0.2, 0.2, 8)], T.bone, 1),
    ],
  });
L["jagged-horror"] = horror(() => {
  const s = [];
  for (let i = 0; i < 3; i++)
    for (const sy of [-1, 1])
      s.push(
        S(
          [
            poly(
              [0.1 - 0.12 * i, sy * 0.5],
              [0.0 - 0.12 * i, sy * (0.95 - 0.1 * i)],
              [-0.12 - 0.12 * i, sy * 0.5],
            ),
          ],
          T.bone,
          0.9 + 0.05 * i,
          i > 0,
        ),
      );
  return s;
});
L["flesh-golem"] = (p) => {
  const st = p === "stride-a" ? 1 : p === "stride-b" ? -1 : 0;
  const s = [];
  for (let i = 0; i < 4; i++)
    s.push(
      S(
        [el(0.3 * st, -0.4, 0.34, 0.3, 10), el(-0.3 * st, 0.4, 0.34, 0.3, 10)],
        T.flesh,
        0.45 + 0.1 * i,
      ),
    );
  for (let i = 0; i < 9; i++) {
    const r = 0.8 + 0.12 * Math.sin((i / 8) * Math.PI);
    s.push(S([el(0, 0, r * 0.8, r)], i % 3 === 2 ? T.seam : T.flesh, 0.5 + 0.05 * i));
    s.push(
      S(
        [
          el(-0.02 * st * (i / 8) * 4, -r * 0.95, 0.24, 0.22, 8),
          el(0.02 * st * (i / 8) * 4, r * 0.95, 0.24, 0.22, 8),
        ],
        T.flesh,
        0.55 + 0.05 * i,
        true,
      ),
    );
  }
  [0.3, 0.36, 0.34, 0.26].forEach((r, i) =>
    s.push(S([el(0.25, 0, r * 1.05, r)], i === 1 ? T.seam : T.flesh, 0.75 + 0.07 * i)),
  );
  return s;
};
// four legged: beast, rat. `tail` slices curl behind.
function quad(pose, o) {
  const st = pose === "stride-a" ? 1 : pose === "stride-b" ? -1 : 0;
  const s = [];
  for (let i = 0; i < 3; i++) {
    const legs = [];
    for (const [lx, ly, ph] of [
      [0.55, -0.26, 1],
      [0.55, 0.26, -1],
      [-0.55, -0.26, -1],
      [-0.55, 0.26, 1],
    ])
      legs.push(el(lx + 0.22 * st * ph, ly, 0.11, 0.08, 6));
    s.push(S(legs, o.dark, 0.5 + 0.12 * i));
  }
  for (let i = 0; i < 5; i++) {
    const r = 0.36 + 0.04 * Math.sin((i / 4) * Math.PI);
    s.push(S([el(0, 0, 0.95, r)], i < 3 ? o.fur : o.fur, 0.6 + 0.08 * i));
  }
  for (let i = 0; i < o.tail; i++)
    s.push(
      S(
        [el(-1 - 0.25 * i * o.tailLen, 0.12 * Math.sin(i + st), 0.28 * o.tailLen, 0.04, 6)],
        o.dark,
        0.6 + 0.04 * i,
        i > 0,
      ),
    );
  [0.26, 0.3, 0.26, 0.2].forEach((r, i) =>
    s.push(S([el(0.95, 0, r * 1.15, r * 0.9, 10)], o.fur, 0.7 + 0.08 * i)),
  );
  if (o.ears)
    s.push(
      S(
        [
          poly([0.85, -0.2], [0.78, -0.34], [0.7, -0.14]),
          poly([0.85, 0.2], [0.78, 0.34], [0.7, 0.14]),
        ],
        o.dark,
        1.05,
      ),
    );
  if (o.snout) s.push(S([el(1.3, 0, 0.14, 0.1, 8)], o.dark, 0.9, true));
  return s;
}
L.beast = (p) =>
  quad(p, { fur: T.fur, dark: T.furDark, tail: 2, tailLen: 0.8, ears: true, snout: true });
L.rat = (p) =>
  quad(p, { fur: "#7a6e66", dark: "#4e4440", tail: 5, tailLen: 1.2, ears: false, snout: true });
L.guard = (p) =>
  human(p, {
    body: "#6c727c",
    metal: T.steel,
    arm: T.steel,
    legs: "#3c4048",
    crest: null,
    extra: (_, st) => {
      const s = pole(0.3 + 0.1 * st, 0.75, 14, T.wood, 3, "#c9ced6"); // spear above the head
      // shield on the left arm: a flat tall kite
      s.push({ reset: 6, parts: [] });
      for (let i = 0; i < 6; i++)
        s.push(
          S(
            [el(0.1, -0.88, 0.1, 0.34 - 0.025 * i, 8)],
            i === 5 ? T.gold : "#7e8590",
            0.7 + 0.05 * i,
          ),
        );
      return s;
    },
  });
L.priest = (p) =>
  human(p, {
    body: T.robe,
    metal: "#b5ab94",
    head: "#c8bfa8",
    arm: T.robe,
    robeToGround: true,
    hood: true,
    belt: "#8a6a3a",
    extra: (_, st) => {
      const s = pole(0.4 + 0.08 * st, 0.8, 12, T.wood, 0);
      s.push(
        S([el(0.4 + 0.08 * st, 0.8, 0.14, 0.14, 8)], T.gold, 1),
        S([el(0.4 + 0.08 * st, 0.8, 0.09, 0.09, 8)], "#f6e7a0", 1.1, true),
      );
      return s;
    },
  });
L["guild-lord"] = (p) =>
  human(p, {
    body: "#26262e",
    metal: "#34343e",
    arm: T.gold,
    shoulder: T.gold,
    legs: "#1e1e24",
    cape: T.cloth,
    crest: T.gold,
    belt: T.gold,
    extra: (_, st) => {
      const s = pole(0.35 + 0.1 * st, 0.8, 9, T.steel, 2, "#dfe3ea");
      s.push(S([el(0.35 + 0.1 * st, 0.8, 0.07, 0.3, 6)], T.gold, 1, true));
      return s;
    },
  });

// scale = how big in body radii; the rest of the spec's lists are in the .md
const CREATURES = [
  ["spirit", 0.9],
  ["ghostly-hero", 1],
  ["bone-minion", 0.7],
  ["bone-horror", 1.05],
  ["bone-fiend", 1.05],
  ["vampiric-horror", 1.05],
  ["shambling-horror", 1.05],
  ["jagged-horror", 1.05],
  ["flesh-golem", 1.35],
  ["beast", 0.8],
  ["rat", 0.42],
  ["guard", 1],
  ["priest", 1],
  ["guild-lord", 1.25],
];
const POSES = ["stand", "stride-a", "stride-b"];

// ---- rendering ----------------------------------------------------------------
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const shade = (c, l) => {
  const k = 0.25 + 0.75 * l; // darker toward the ground
  return (
    "#" +
    hex(c)
      .map((v) =>
        Math.round(Math.min(255, v * Math.min(1.1, k + 0.12)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
// A figure at (ox, oy) on the ground, `px` per body radius, facing `facing` rad.
function figure(slices, ox, oy, px, scale, facing, flat = false) {
  const R = px * scale,
    ca = Math.cos(facing),
    sa = Math.sin(facing);
  let lift = 0;
  const layers = slices.map((sl) => {
    if (sl.reset !== undefined) lift = sl.reset;
    else if (!sl.same) lift++;
    const pts = sl.parts.map((part) =>
      part
        .map(
          ([x, y]) =>
            `${(ox + R * (x * ca - y * sa)).toFixed(1)},${(oy + R * (x * sa + y * ca) * 0.9 - R * STEP * lift).toFixed(1)}`,
        )
        .join(" "),
    );
    return { sl, pts };
  });
  const shadow = `<ellipse cx="${ox}" cy="${oy + 1}" rx="${R * 0.95}" ry="${R * 0.8}" fill="#000" opacity="0.5"/>`;
  const outline = layers
    .map(({ pts }) => pts.map((p) => `<polygon points="${p}"/>`).join(""))
    .join("");
  const fills = layers
    .map(({ sl, pts }) =>
      pts
        .map(
          (p) =>
            `<polygon points="${p}" fill="${shade(sl.tone, sl.light)}"${sl.alpha < 1 ? ` opacity="${sl.alpha}"` : ""}/>`,
        )
        .join(""),
    )
    .join("");
  return `${shadow}<g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${(px / 12) * 2.2}" stroke-linejoin="round">${outline}</g><g>${fills}</g>`;
}
// ground plate (team hexagon stand-in) under the figure.
const plate = (x, y, px, scale, c) =>
  `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => `${(x + px * scale * 0.95 * Math.cos((i * Math.PI) / 3)).toFixed(1)},${(y + px * scale * 0.95 * 0.9 * Math.sin((i * Math.PI) / 3)).toFixed(1)}`).join(" ")}" fill="${c}" opacity="0.55" stroke="${c}" stroke-width="1"/>`;

const W = 1480,
  H = 1110;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#1b1d22"/>`;
const txt = (x, y, t, s = 13, c = "#d7dee8") =>
  `<text x="${x}" y="${y}" font-size="${s}" fill="${c}">${t}</text>`;
svg += txt(
  20,
  28,
  "Creature stack study (#4171-#4173): every look as stacked slices, ADR-0057 body style. Row 1: true size (12 px body radius). Rows 2-3: 4x, facing east and south-east. Row 4: walk frames.",
  14,
);
const col = (i) => 70 + i * 100;
// row 1: true size, team plates under, ally then foe
CREATURES.forEach(([id, sc], i) => {
  const x = col(i),
    y = 118;
  svg +=
    plate(x - 18, y, BODY_PX, sc, "#59c2ff") + figure(L[id]("stand"), x - 18, y, BODY_PX, sc, 0);
  svg +=
    plate(x + 22, y, BODY_PX, sc, "#ff7b72") +
    figure(L[id]("stand"), x + 22, y, BODY_PX, sc, Math.PI / 4);
});
svg += txt(20, 150, "true size", 11, "#7d8794");
// row 2/3: 4x
const PX4 = 48;
const per = (i) => 20 + i * 210;
CREATURES.slice(0, 7).forEach(([id, sc], i) => {
  const x = 125 + i * 205,
    y = 330;
  svg +=
    plate(x, y, PX4, sc, "#59c2ff") +
    figure(L[id]("stand"), x, y, PX4, sc, 0) +
    txt(x - 50, y + 62, id, 12);
});
CREATURES.slice(7).forEach(([id, sc], i) => {
  const x = 125 + i * 205,
    y = 570;
  svg +=
    plate(x, y, PX4, sc, "#ff7b72") +
    figure(L[id]("stand"), x, y, PX4, sc, Math.PI / 4) +
    txt(x - 50, y + 62, id, 12);
});
// row 4: the three headings of a few, and the three poses of the walkers
const walkers = ["ghostly-hero", "bone-horror", "flesh-golem", "beast", "guard", "guild-lord"];
walkers.forEach((id, i) => {
  const sc = CREATURES.find(([n]) => n === id)[1];
  POSES.forEach((p, j) => {
    const x = 70 + i * 240 + j * 70,
      y = 840;
    svg += plate(x, y, 30, sc, "#59c2ff") + figure(L[id](p), x, y, 30, sc, 0);
  });
  svg += txt(60 + i * 240, 880, id + ": stand, stride-a, stride-b", 11);
});
// row 5: eight headings of a horror and of a guard
["bone-horror", "guard"].forEach((id, r) => {
  const sc = CREATURES.find(([n]) => n === id)[1];
  for (let h = 0; h < 8; h++) {
    const x = 70 + h * 80 + r * 700,
      y = 1030;
    if (r === 1 && h > 5) break;
    svg += plate(x, y, 28, sc, "#59c2ff") + figure(L[id]("stand"), x, y, 28, sc, (h * Math.PI) / 4);
  }
  svg += txt(40 + r * 700, 1068, id + ": 8 headings", 11);
});
svg += "</svg>";
const tmp = `${tmpdir()}/creature-stack-study.svg`; // 1 MB of polygons: only the png is committed
writeFileSync(tmp, svg);
try {
  execFileSync("inkscape", [tmp, "-o", "docs/art/creature-stack-study.png"], { stdio: "ignore" });
} catch {
  console.error("inkscape failed: the png was not written");
}
console.log(
  "slices:",
  Object.fromEntries(
    CREATURES.map(([id]) => [
      id,
      L[id]("stand").filter((s) => !s.same && s.reset === undefined).length,
    ]),
  ),
);

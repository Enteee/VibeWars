// Draws a study of the skill icon system (#719): how one icon per skill is
// composed, and how it looks on the combat bar, in the build editor and in the
// library. It is a design reference for the spec, not a game asset.
//
//   node scripts/assets/skill-icon-study.mjs
//
// Writes docs/art/skill-icon-study.svg. The icon is built from layers, never
// drawn per skill: a profession tile, one glyph from a closed vocabulary, an
// optional modifier mark, the type badge in the corner and, for an elite, the
// doubled gold frame. Eight real skills are shown.
//
// The study is a snapshot of the approved layout. The shipped icons come from
// icons.mjs and skill-icon-table.mjs, which are the source of truth; if they
// disagree with this file, they win.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outFile = join(root, "docs", "art", "skill-icon-study.svg");

/** The palette. Mirrors docs/art/art-direction.md. */
const C = {
  bg: "#0e1116",
  plate: "#161b22",
  line: "#2b3440",
  ink: "#d7dee8",
  inkDim: "#7d8899",
  edge: "#0b0f14",
  elite: "#d4a72c",
  condition: "#ffa657",
  hex: "#d2a8ff",
  enchantment: "#56d4dd",
  stance: "#f778ba",
  preparation: "#e3b341",
  glyph: "#c3e88d",
  hudEnergy: "#2f6787",
  warrior: "#e3b341",
  ranger: "#8fd36b",
  monk: "#9ecbff",
  necromancer: "#3fb68b",
  elementalist: "#ff6e5a",
};

/** @param {number} n */
const f = (n) => String(Math.round(n * 100) / 100);

/**
 * @param {string} colour
 * @param {number} [width]
 */
const stroke = (colour, width = 2) =>
  `fill="none" stroke="${colour}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"`;

/**
 * `colour` mixed `amount` of the way from the plate to itself.
 * @param {string} colour
 * @param {number} amount
 */
function tint(colour, amount) {
  const rgb = (/** @type {string} */ hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = rgb(C.plate);
  const b = rgb(colour);
  const mixed = a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * amount));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// The glyph vocabulary: one per primary effect, drawn in the box 4..18.
// ---------------------------------------------------------------------------

const BOLT = "M12 3 L5 13 H11 L9 20 L18 9 H12 Z";

/** @type {Record<string, string>} */
const GLYPHS = {
  // A projectile spell: a ball with its trail.
  fireball: `<circle cx="14" cy="9.5" r="4.8" fill="${C.ink}" stroke="${C.edge}" stroke-width="1"/><path d="M10 12.5 L4 18 M8.5 9 L3.5 11.5 M13 14.5 L10.5 20" ${stroke(C.ink, 2)}/>`,
  // Damage by type: a flame is fire.
  fire: `<path d="M12 2.5 C12.5 6.5 17.5 8.5 17.5 14.5 A6.5 6.5 0 0 1 4.5 14.5 C4.5 11.5 6.5 10 7.5 7.5 C8.5 9 9.5 9.5 10 8.5 C11 7 11.5 5 12 2.5 Z" fill="${C.ink}" stroke="${C.edge}" stroke-width="1"/>`,
  // Heal: a plus.
  heal: `<path d="M9 3 H13 V9 H19 V13 H13 V19 H9 V13 H3 V9 H9 Z" fill="${C.ink}" stroke="${C.edge}" stroke-width="1" transform="translate(1,0)"/>`,
  // Speed: two chevrons and a trailing line.
  speed: `<path d="M4 4 L10 11 L4 18 M11 4 L17 11 L11 18" ${stroke(C.ink, 2.5)}/>`,
  // Energy: a bolt.
  energy: `<path d="${BOLT}" fill="${C.ink}" stroke="${C.edge}" stroke-width="1" transform="translate(-1,-1)"/>`,
  // Armor: a shield.
  armor: `<path d="M11 3 L18 5.5 V11 C18 15 15 18 11 19.5 C7 18 4 15 4 11 V5.5 Z" fill="${C.ink}" stroke="${C.edge}" stroke-width="1"/>`,
  // A volley: three arrows fanned out.
  volley: `<g transform="translate(0,6) scale(0.72)">${[-5, 0, 5]
    .map(
      (d) =>
        `<g transform="translate(${f(d * 0.9)},${f(-d * 0.9)})"><path d="M4 19 L16 7 M10.5 6.5 H16.5 V12.5" ${stroke(C.ink, 2)}/></g>`,
    )
    .join("")}</g>`,
  // Sound: a mouth and waves, for the shout vocabulary's own use.
  voice: `<path d="M4 8 H8 L13 4 V18 L8 14 H4 Z M16 8 C18 10 18 12 16 14" ${stroke(C.ink, 2)}/>`,
};

/**
 * The small mark that says how the glyph changes: up for a boost, down for a
 * cost to the target, a bar for a reduction. Top right of the tile.
 * @type {Record<string, string>}
 */
const MODIFIERS = {
  up: `<path d="M19 9 V3 M16.5 5.5 L19 3 L21.5 5.5" ${stroke(C.ink, 1.6)}/>`,
  down: `<path d="M19 3 V9 M16.5 6.5 L19 9 L21.5 6.5" ${stroke(C.ink, 1.6)}/>`,
  less: `<path d="M16.5 6 H21.5" ${stroke(C.ink, 1.8)}/>`,
};

/**
 * The corner badge, 8 units across with its centre at (19.5, 19.5). Mirrors the
 * table in docs/art/art-direction.md.
 * @type {Record<string, string>}
 */
const BADGES = {
  spell: `<path d="M19.5 15 L20.6 18.4 L24 19.5 L20.6 20.6 L19.5 24 L18.4 20.6 L15 19.5 L18.4 18.4 Z" fill="${C.ink}" transform="translate(-0.5,-0.5)"/>`,
  hex: `<path d="M19.5 15.5 A4 4 0 1 1 15.8 18 M16.5 21.4 L17 22" ${stroke(C.hex, 1.8)}/>`,
  stance: `<path d="M19.5 15.2 L23.4 18 L21.9 22.6 H17.1 L15.6 18 Z" ${stroke(C.stance, 1.8)}/>`,
  signet: `<circle cx="19.5" cy="20.5" r="3" ${stroke(C.ink, 1.6)}/><circle cx="19.5" cy="15.8" r="1.4" fill="${C.ink}"/>`,
  shout: `<path d="M15.5 18 H17.5 L20 16 V23 L17.5 21 H15.5 Z M21.6 18 C22.6 19 22.6 20 21.6 21" ${stroke(C.ink, 1.4)}/>`,
  glyph: `<path d="M15.6 16.6 H23.4 L19.5 23 Z" ${stroke(C.glyph, 1.8)}/>`,
  attack: `<path d="M16 23 L23 16 M22 16 H23 V17 M16 23 L17.2 21.8" ${stroke(C.ink, 1.8)}/>`,
};

/**
 * @typedef {object} Skill
 * @property {string} name
 * @property {string} profession
 * @property {string} glyph
 * @property {string} [modifier]
 * @property {string} badge
 * @property {boolean} [elite]
 * @property {string} cost
 * @property {number} recharge
 */

/** @type {readonly Skill[]} */
const SKILLS = [
  {
    name: "Fireball",
    profession: "elementalist",
    glyph: "fireball",
    badge: "spell",
    cost: "10",
    recharge: 7,
  },
  {
    name: "Orison of Healing",
    profession: "monk",
    glyph: "heal",
    badge: "spell",
    cost: "5",
    recharge: 2,
  },
  {
    name: "Sprint",
    profession: "warrior",
    glyph: "speed",
    badge: "stance",
    cost: "5",
    recharge: 15,
  },
  {
    name: "Malaise",
    profession: "necromancer",
    glyph: "energy",
    modifier: "down",
    badge: "hex",
    cost: "5",
    recharge: 2,
  },
  {
    name: "Healing Signet",
    profession: "warrior",
    glyph: "heal",
    badge: "signet",
    cost: "",
    recharge: 4,
  },
  {
    name: "“Watch Yourself!”",
    profession: "warrior",
    glyph: "armor",
    modifier: "up",
    badge: "shout",
    cost: "4",
    recharge: 4,
  },
  {
    name: "Barrage",
    profession: "ranger",
    glyph: "volley",
    badge: "attack",
    elite: true,
    cost: "5",
    recharge: 1,
  },
  {
    name: "Glyph of Lesser Energy",
    profession: "elementalist",
    glyph: "energy",
    modifier: "less",
    badge: "glyph",
    cost: "5",
    recharge: 30,
  },
];

/**
 * @param {string} name
 * @returns {Skill}
 */
function skill(name) {
  const found = SKILLS.find((s) => s.name === name);
  if (found === undefined) throw new Error(`no skill ${name}`);
  return found;
}

/** The type badge sits top right, the modifier bottom right. @param {string} name */
const badgeAt = (name) =>
  `<circle cx="19" cy="5" r="5" fill="${C.edge}" fill-opacity="0.85"/><g transform="translate(0,-14.5)">${BADGES[name] ?? ""}</g>`;
/** @param {string} name */
const modifierAt = (name) => `<g transform="translate(0,12)">${MODIFIERS[name] ?? ""}</g>`;

/**
 * The icon: the inner SVG on the 24 grid.
 * @param {Skill} s
 * @param {{ greyscale?: boolean }} [opts]
 */
function iconInner(s, opts = {}) {
  const base = C[/** @type {"warrior"} */ (s.profession)];
  const grey = opts.greyscale === true;
  const fill = grey ? tint("#9a9a9a", 0.28) : tint(base, 0.3);
  const rim = grey ? "#8a8a8a" : base;
  return [
    `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${fill}" stroke="${rim}" stroke-width="1"/>`,
    `<g transform="translate(1.6,3) scale(0.85)">${GLYPHS[s.glyph] ?? ""}</g>`,
    s.modifier === undefined ? "" : modifierAt(s.modifier),
    badgeAt(s.badge),
  ].join("");
}

/**
 * An icon `size` px square with its top-left at (x, y).
 * @param {Skill} s
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {{ greyscale?: boolean }} [opts]
 */
const icon = (s, x, y, size, opts = {}) =>
  `<g transform="translate(${f(x)},${f(y)}) scale(${f(size / 24)})">${iconInner(s, opts)}</g>`;

/**
 * @param {number} x
 * @param {number} y
 * @param {string} s
 * @param {{ size?: number, colour?: string, anchor?: "start" | "middle" | "end", weight?: string, edge?: boolean }} [o]
 */
function text(x, y, s, o = {}) {
  const size = o.size ?? 12;
  const edge = o.edge === true ? `stroke="${C.edge}" stroke-width="3" paint-order="stroke"` : "";
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<text x="${f(x)}" y="${f(y)}" font-family="DejaVu Sans, sans-serif" font-size="${f(size)}" font-weight="${o.weight ?? "400"}" fill="${o.colour ?? C.inkDim}" text-anchor="${o.anchor ?? "start"}" ${edge}>${esc}</text>`;
}

/**
 * The elite frame: two 1 px lines, gold, around a box.
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
const eliteFrame = (x, y, size) =>
  `<rect x="${f(x - 1)}" y="${f(y - 1)}" width="${f(size + 2)}" height="${f(size + 2)}" rx="4" fill="none" stroke="${C.elite}" stroke-width="1"/>` +
  `<rect x="${f(x - 4)}" y="${f(y - 4)}" width="${f(size + 8)}" height="${f(size + 8)}" rx="6" fill="none" stroke="${C.elite}" stroke-width="1"/>`;

/**
 * A clock-sweep wedge over a square: `left` of the way still to go.
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} left 0..1
 */
function wipe(x, y, size, left) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size;
  const a = -Math.PI / 2 + (1 - left) * Math.PI * 2;
  const ex = cx + r * Math.cos(a);
  const ey = cy + r * Math.sin(a);
  const large = left > 0.5 ? 1 : 0;
  return (
    `<clipPath id="w${f(x)}-${f(y)}"><rect x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size)}" rx="${f(size / 7)}"/></clipPath>` +
    `<path clip-path="url(#w${f(x)}-${f(y)})" d="M${f(cx)} ${f(cy)} L${f(cx)} ${f(cy - r)} A${f(r)} ${f(r)} 0 ${String(large)} 1 ${f(ex)} ${f(ey)} Z" fill="${C.edge}" fill-opacity="0.72"/>`
  );
}

// ---------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------

const W = 980;
/** @type {string[]} */
const parts = [];
let y = 0;

/**
 * @param {string} title
 * @param {string} note
 */
function section(title, note) {
  y += 34;
  parts.push(text(20, y, title, { size: 14, colour: C.ink, weight: "700" }));
  y += 18;
  parts.push(text(20, y, note, { size: 11 }));
  y += 14;
}

parts.push(
  text(20, 28, "Skill icon system — study, not decided (#719)", {
    size: 16,
    colour: C.ink,
    weight: "700",
  }),
);
y = 28;

// 1. The layers ------------------------------------------------------------
section(
  "1. One icon is five layers; every skill gets its own row in the generator",
  "tile ← profession, glyph ← primary effect (authoring default), modifier ← how it bends it, badge ← type, frame ← elite. A test fails if two skills render the same.",
);
{
  const x0 = 20;
  const top = y + 8;
  const s = skill("Barrage");
  const SZ = 96;
  const layers = [
    [
      "tile",
      "profession colour",
      `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${tint(C.ranger, 0.3)}" stroke="${C.ranger}" stroke-width="1"/>`,
    ],
    [
      "glyph",
      "primary effect",
      `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${C.plate}" stroke="${C.line}"/>${GLYPHS.volley ?? ""}`,
    ],
    [
      "modifier",
      "boost / drain / less",
      `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${C.plate}" stroke="${C.line}"/>${modifierAt("up")}`,
    ],
    [
      "badge",
      "skill type",
      `<rect x="1" y="1" width="22" height="22" rx="3.5" fill="${C.plate}" stroke="${C.line}"/>${badgeAt("attack")}`,
    ],
  ];
  layers.forEach(([name, from, inner], i) => {
    const x = x0 + i * 130;
    parts.push(
      `<g transform="translate(${f(x)},${f(top)}) scale(${f(SZ / 24)})">${inner ?? ""}</g>`,
    );
    parts.push(text(x + SZ / 2, top + SZ + 16, name ?? "", { anchor: "middle", colour: C.ink }));
    parts.push(text(x + SZ / 2, top + SZ + 30, from ?? "", { anchor: "middle", size: 10 }));
    parts.push(
      text(x + SZ + 17, top + SZ / 2 + 6, i < 3 ? "+" : "=", {
        size: 22,
        anchor: "middle",
        colour: C.inkDim,
      }),
    );
  });
  const x = x0 + 4 * 130;
  parts.push(icon(s, x, top, SZ));
  parts.push(eliteFrame(x, top, SZ));
  parts.push(text(x + SZ / 2, top + SZ + 16, "Barrage", { anchor: "middle", colour: C.ink }));
  parts.push(
    text(x + SZ / 2, top + SZ + 30, "+ elite frame (doubled gold)", { anchor: "middle", size: 10 }),
  );
  // The 24 px base grid, true size, and the 16 px floor.
  const gx = x0 + 5 * 130 + 40;
  parts.push(icon(s, gx, top + 8, 48));
  parts.push(text(gx + 24, top + 76, "48 px", { anchor: "middle", size: 10 }));
  parts.push(icon(s, gx + 70, top + 8, 24));
  parts.push(text(gx + 82, top + 76, "24", { anchor: "middle", size: 10 }));
  parts.push(icon(s, gx + 112, top + 8, 16));
  parts.push(text(gx + 120, top + 76, "16", { anchor: "middle", size: 10 }));
  y = top + SZ + 40;
}

// 2. The combat bar --------------------------------------------------------
section(
  "2. The combat bar: 8 square 48 px slots, gap 6; no name, no cost",
  "Hotkey top left, type badge top right. Casting: slot 1. Recharging: 2. Unaffordable: 4. Elite: 5. Empty: 6. Out of range: 7.",
);
{
  const SLOT = 48;
  const GAP = 6;
  const total = 8 * SLOT + 7 * GAP;
  const left = (W - total) / 2;
  const top = y + 20;
  parts.push(
    `<rect x="${f(left - 14)}" y="${f(top - 12)}" width="${f(total + 28)}" height="${f(SLOT + 24)}" rx="8" fill="${C.plate}" stroke="${C.line}"/>`,
  );
  /** @type {readonly (readonly [string | undefined, string])[]} */
  const bar = [
    ["Fireball", "casting"],
    ["Orison of Healing", "recharge"],
    ["Sprint", "ready"],
    ["Malaise", "poor"],
    ["Barrage", "ready"],
    [undefined, "empty"],
    ["Fireball", "range"],
    ["Healing Signet", "ready"],
  ];
  bar.forEach(([name, state], i) => {
    const x = left + i * (SLOT + GAP);
    if (name === undefined) {
      parts.push(
        `<rect x="${f(x + 1)}" y="${f(top + 1)}" width="${f(SLOT - 2)}" height="${f(SLOT - 2)}" rx="6" fill="none" stroke="${C.inkDim}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
        text(x + 4, top + 12, String(i + 1), {
          size: 11,
          colour: C.inkDim,
          weight: "700",
          edge: true,
        }),
      );
      return;
    }
    const s = skill(name);
    parts.push(icon(s, x, top, SLOT));
    if (s.elite === true) parts.push(eliteFrame(x, top, SLOT));
    if (state === "poor")
      parts.push(
        `<rect x="${f(x)}" y="${f(top)}" width="${f(SLOT)}" height="${f(SLOT)}" rx="7" fill="${C.edge}" fill-opacity="0.55"/>`,
      );
    if (state === "recharge") {
      parts.push(wipe(x, top, SLOT, 0.6));
      parts.push(
        text(x + SLOT / 2, top + SLOT / 2 + 8, "7", {
          size: 22,
          colour: C.ink,
          anchor: "middle",
          weight: "700",
          edge: true,
        }),
      );
    }
    if (state === "casting") {
      parts.push(
        `<rect x="${f(x)}" y="${f(top + SLOT * 0.5)}" width="${f(SLOT)}" height="${f(SLOT * 0.5)}" rx="7" fill="${C.ink}" fill-opacity="0.18"/>`,
        `<rect x="${f(x + 2)}" y="${f(top + 2)}" width="${f(SLOT - 4)}" height="${f(SLOT - 4)}" rx="5" fill="none" stroke="${C.ink}" stroke-width="2"/>`,
      );
    }
    if (state === "range")
      parts.push(
        text(x + SLOT - 3, top + SLOT - 4, "↔", {
          size: 15,
          colour: C.ink,
          anchor: "end",
          weight: "700",
          edge: true,
        }),
      );
    parts.push(
      text(x + 4, top + 12, String(i + 1), { size: 11, colour: C.ink, weight: "700", edge: true }),
    );
  });
  y = top + SLOT + 16;
}

// 3. Build editor, library and tooltip --------------------------------------
section(
  "3. Build editor, library rows and tooltip",
  "Editor: the 8 slots at 48 px with name and cost under each. Library row: 24 px icon, name, cost, headline. Tooltip: 48 px icon in its header.",
);
{
  const top = y + 16;
  const SLOT = 48;
  const PITCH = 76;
  const panelW = 8 * PITCH + 8;
  parts.push(
    `<rect x="20" y="${f(top - 12)}" width="${f(panelW)}" height="${f(SLOT + 52)}" rx="8" fill="${C.plate}" stroke="${C.line}"/>`,
  );
  const names = [
    "Sprint",
    "Healing Signet",
    "“Watch Yourself!”",
    "Barrage",
    "Fireball",
    "Orison of Healing",
    "Malaise",
    "Glyph of Lesser Energy",
  ];
  names.forEach((n, i) => {
    const s = skill(n);
    const x = 20 + 4 + i * PITCH + (PITCH - SLOT) / 2;
    parts.push(icon(s, x, top, SLOT));
    if (s.elite === true) parts.push(eliteFrame(x, top, SLOT));
    parts.push(
      text(x + SLOT / 2, top + SLOT + 14, n.length > 13 ? `${n.slice(0, 12)}…` : n, {
        size: 9,
        anchor: "middle",
        colour: C.ink,
      }),
      text(
        x + SLOT / 2,
        top + SLOT + 26,
        s.cost === "" ? "—" : `${s.cost} ${s.badge === "shout" ? "adr" : "en"}`,
        {
          size: 9,
          anchor: "middle",
        },
      ),
    );
  });

  // Library rows.
  const ly = top + SLOT + 60;
  const rowH = 34;
  /** @type {Record<string, string>} */
  const headline = {
    Fireball: "Fire damage to the target and nearby foes.",
    "Orison of Healing": "Heal an ally.",
    Malaise: "Drains your foe’s energy.",
    Barrage: "Shoot every foe next to your target.",
  };
  parts.push(
    `<rect x="20" y="${f(ly - 12)}" width="470" height="${f(4 * rowH + 8)}" rx="8" fill="${C.plate}" stroke="${C.line}"/>`,
  );
  ["Fireball", "Orison of Healing", "Malaise", "Barrage"].forEach((n, i) => {
    const r = skill(n);
    const ry = ly + i * rowH;
    parts.push(icon(r, 36, ry, 24));
    if (r.elite === true) parts.push(eliteFrame(36, ry, 24));
    parts.push(
      text(76, ry + 10, n, { colour: C.ink, size: 11 }),
      text(76, ry + 23, headline[n] ?? "", { size: 9.5 }),
      text(474, ry + 16, `${r.cost} · ${String(r.recharge)} s`, { size: 10, anchor: "end" }),
    );
  });

  // The tooltip.
  const tx = 520;
  const s = skill("Fireball");
  parts.push(
    `<rect x="${f(tx)}" y="${f(ly - 12)}" width="440" height="${f(4 * rowH + 8)}" rx="8" fill="${C.plate}" stroke="${C.line}"/>`,
    icon(s, tx + 16, ly + 2, 48),
    text(tx + 76, ly + 18, "Fireball", { colour: C.ink, size: 14, weight: "700" }),
    text(tx + 76, ly + 34, "Spell · Fire Magic · Elementalist", { size: 10 }),
    text(tx + 16, ly + 78, "10 energy   1 s cast   7 s recharge", { size: 11, colour: C.ink }),
    text(tx + 16, ly + 96, "Fire damage to the target and nearby foes.", { size: 10 }),
  );
  y = ly + 4 * rowH + 4;
}

// 4. Readability -----------------------------------------------------------
section(
  "4. Readability: 16 px at true size, and with the colour taken out",
  "Eight icons at 16 px in colour, then grey (left); the same at 40 px grey (right). Heal and energy repeat on purpose: badge and modifier tell them apart.",
);
{
  const top = y + 12;
  SKILLS.forEach((s, i) => {
    const x = 40 + i * 52;
    parts.push(icon(s, x, top, 16));
    parts.push(icon(s, x, top + 26, 16, { greyscale: true }));
  });
  // The same eight at 32 px, greyscale, to judge shape alone.
  SKILLS.forEach((s, i) => {
    const x = 500 + i * 58;
    parts.push(icon(s, x, top - 4, 40, { greyscale: true }));
  });
  parts.push(text(20, top + 12, "16", { size: 9 }));
  parts.push(text(20, top + 38, "grey", { size: 9 }));
  y = top + 56;
}

// 5. The vocabulary --------------------------------------------------------
section(
  "5. How 1,330 skills scale: a closed vocabulary, not a drawing per skill",
  "~60 glyphs (effect, element, condition) × 3 modifiers × 10 badges × 10 tiles. A table maps effect → glyph; signature skills override it.",
);
{
  const top = y + 10;
  const names = Object.keys(GLYPHS);
  names.forEach((n, i) => {
    const x = 28 + i * 74;
    parts.push(
      `<rect x="${f(x)}" y="${f(top)}" width="48" height="48" rx="6" fill="${C.plate}" stroke="${C.line}"/>`,
    );
    parts.push(`<g transform="translate(${f(x)},${f(top)}) scale(2)">${GLYPHS[n] ?? ""}</g>`);
    parts.push(text(x + 24, top + 62, n, { size: 10, anchor: "middle" }));
  });
  const mx = 28 + names.length * 74 + 20;
  Object.keys(MODIFIERS).forEach((n, i) => {
    const x = mx + i * 60;
    parts.push(
      `<rect x="${f(x)}" y="${f(top)}" width="48" height="48" rx="6" fill="${C.plate}" stroke="${C.line}"/>`,
    );
    parts.push(`<g transform="translate(${f(x)},${f(top)}) scale(2)">${MODIFIERS[n] ?? ""}</g>`);
    parts.push(text(x + 24, top + 62, `mod: ${n}`, { size: 10, anchor: "middle" }));
  });
  y = top + 80;
}

const H = y + 10;
const body = parts.join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${f(H)}" width="${String(W)}" height="${f(H)}"><rect width="${String(W)}" height="${f(H)}" fill="${C.bg}"/>${body}</svg>\n`;
writeFileSync(outFile, svg);
console.log(`wrote ${outFile} (${String(svg.length)} bytes)`);

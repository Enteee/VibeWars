// #2811 mockups F–O: ten more 2.5D directions, as data plus hooks for
// arena-2-5d.mjs. Study, not decided. Each style is its own look, not a
// recolour of A–E: projection, material language, light and character
// drawing all differ.

/** @typedef {import("./arena-2-5d.mjs").Style} Style */

/** @type {(n: number) => string} */
const f = (n) => String(Math.round(n * 10) / 10);
/** @type {(a: string, b: string, t: number) => string} */
const mixHex = (a, b, t) => {
  /** @type {(h: string) => number[]} */
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + ((y[i] ?? 0) - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};
/** @type {(out: string[], cx: number, cy: number, r: number, a: string) => void} */
const circ = (out, cx, cy, r, a) =>
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${a}/>`);
/** @type {(out: string[], cx: number, cy: number, rx: number, ry: number, a: string) => void} */
const ell = (out, cx, cy, rx, ry, a) =>
  out.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" ${a}/>`);
/** @type {(out: string[], x1: number, y1: number, x2: number, y2: number, a: string) => void} */
const line = (out, x1, y1, x2, y2, a) =>
  out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${a}/>`);
/** @type {(out: string[], x: number, y: number, w: number, h: number, a: string) => void} */
const rect = (out, x, y, w, h, a) =>
  out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${a}/>`);
/** @type {(out: string[], d: string, a: string) => void} */
const path = (out, d, a) => out.push(`<path d="${d}" ${a}/>`);
/** @type {(n: number, i: number) => number} */
const rnd = (n, i) => (((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1) + 1) % 1;

/** @type {Record<string, Style>} */
export const EXTRA = {
  // ------------------------------------------------------------ F
  f: {
    name: "F · Paper theatre",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#f4ecdb", "#e6d8bc"],
    floor: "#bfd8c4",
    deck: "#f2c27b",
    wall: "#c6b5e3",
    ramp: "#f2a38f",
    pillar: "#e8d6b0",
    friend: "#2f6fc4",
    foe: "#e04a40",
    slab: 0.5,
    edge: "#fff",
    label: "#5b4a36",
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#fffaf0" stroke-width="1.2" stroke-linejoin="round" filter="url(#paper)"',
    }),
    hooks: {
      bgAdd: (c) => {
        c.defs.push(
          '<filter id="paper" x="-10%" y="-10%" width="130%" height="145%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b"/><feOffset in="b" dx="2" dy="4" result="o"/><feFlood flood-color="#3a2a14" flood-opacity=".4"/><feComposite in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
        );
        for (const [x, y, r] of [
          [120, 70, 46],
          [190, 86, 34],
          [770, 60, 40],
          [830, 80, 30],
        ])
          ell(c.out, x ?? 0, y ?? 0, r ?? 0, (r ?? 0) * 0.5, 'fill="#fffaf0" filter="url(#paper)"');
      },
      floorAdd: (c) => {
        for (const [x, y, rx] of [
          [1.5, 10.5, 60],
          [18.5, 10.8, 70],
          [19, 0.8, 50],
          [0.8, 0.6, 46],
        ])
          ell(
            c.out,
            ...c.Q(x ?? 0, y ?? 0),
            rx ?? 0,
            (rx ?? 0) * 0.32,
            'fill="#d3e8d0" filter="url(#paper)"',
          );
        for (const [x, y] of [
          [1.2, 9.6],
          [18.6, 10.2],
          [18.8, 1.4],
        ]) {
          const [X, Y] = c.Q(x ?? 0, y ?? 0);
          c.out.push(
            `<polygon points="${f(X)},${f(Y - 40)} ${f(X + 14)},${f(Y)} ${f(X - 14)},${f(Y)}" fill="#7fb08a" stroke="#fffaf0" stroke-width="1.2" filter="url(#paper)"/>`,
          );
        }
      },
      deckAdd: (c) => {
        const b = c.BRIDGE;
        for (let x = b.x0 + 0.875; x < b.x1; x += 0.875)
          c.out.push(
            `<polyline points="${c.pts([c.Q(x, b.y0, c.DECK), c.Q(x, b.y1, c.DECK)])}" stroke="#d99b4a" stroke-width="1.4" fill="none"/>`,
          );
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        const a =
          'stroke="#fffaf0" stroke-width="2.4" stroke-linejoin="round" filter="url(#paper)"';
        path(
          out,
          `M${f(X - u * 0.28)},${f(Y)} L${f(X - u * 0.18)},${f(Y - u * 0.62)} L${f(X + u * 0.18)},${f(Y - u * 0.62)} L${f(X + u * 0.28)},${f(Y)} Z`,
          `fill="${col}" ${a}`,
        );
        circ(out, X, Y - u * 0.8, u * 0.17, `fill="#f6dcc0" ${a}`);
        c.glyph(ch[0], X, Y - u * 1.12, u * 0.09, mixHex(col, "#000000", 0.35));
      },
    },
  },

  // ------------------------------------------------------------ G
  g: {
    name: "G · Blueprint",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#0a2540", "#06182c"],
    floor: "#0f3a66",
    deck: "#2f7fc0",
    wall: "#1d5a96",
    ramp: "#2f7fc0",
    pillar: "#1d5a96",
    friend: "#8fdcff",
    foe: "#ffb08a",
    slab: 0.5,
    edge: "#8fdcff",
    label: "#8fdcff",
    polyFx: (fill) => ({
      fill,
      extra: 'fill-opacity=".34" stroke="#8fdcff" stroke-width="1.2" stroke-linejoin="round"',
    }),
    hooks: {
      floorAdd: (c) => {
        for (let x = 0; x <= 20; x++)
          c.out.push(
            `<polyline points="${c.pts([c.Q(x, 0), c.Q(x, 12)])}" stroke="#8fdcff" stroke-width="${f(x % 5 ? 0.4 : 0.9)}" opacity="${f(x % 5 ? 0.3 : 0.55)}" fill="none"/>`,
          );
        for (let y = 0; y <= 12; y++)
          c.out.push(
            `<polyline points="${c.pts([c.Q(0, y), c.Q(20, y)])}" stroke="#8fdcff" stroke-width="${f(y % 5 ? 0.4 : 0.9)}" opacity="${f(y % 5 ? 0.3 : 0.55)}" fill="none"/>`,
          );
        const [tx, ty] = c.Q(0.2, 11.7);
        c.out.push(
          `<text x="${f(tx)}" y="${f(ty - 6)}" font-family="monospace" font-size="12" fill="#8fdcff">LEVEL 0  ±0.0</text>`,
        );
      },
      deckAdd: (c) => {
        const b = c.BRIDGE;
        const h = b.y1 - b.y0;
        for (let t = b.x0 - h; t < b.x1; t += 0.8) {
          const xa = Math.max(b.x0, t);
          const xb = Math.min(b.x1, t + h);
          if (xb <= xa) continue;
          c.out.push(
            `<polyline points="${c.pts([c.Q(xa, b.y0 + (xa - t), c.DECK), c.Q(xb, b.y0 + (xb - t), c.DECK)])}" stroke="#8fdcff" stroke-width=".8" opacity=".5" fill="none"/>`,
          );
        }
        const [ax, ay] = c.Q(b.x0, b.y1 + 0.9, 0);
        const [bx] = c.Q(b.x1, b.y1 + 0.9, 0);
        line(c.out, ax, ay, bx, ay, 'stroke="#ffe08a" stroke-width="1.2"');
        line(c.out, ax, ay - 6, ax, ay + 6, 'stroke="#ffe08a" stroke-width="1.2"');
        line(c.out, bx, ay - 6, bx, ay + 6, 'stroke="#ffe08a" stroke-width="1.2"');
        c.out.push(
          `<text x="${f((ax + bx) / 2 - 18)}" y="${f(ay - 5)}" font-family="monospace" font-size="12" fill="#ffe08a">7.0 u</text>`,
        );
        const [ex, ey] = c.Q(b.x1 + 0.2, b.y0, c.DECK);
        c.out.push(
          `<text x="${f(ex + 6)}" y="${f(ey + 4)}" font-family="monospace" font-size="12" fill="#ffe08a">LEVEL 1  +2.4</text>`,
        );
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        // footprint, plumb line to the token: the line's length is the layer
        ell(
          out,
          X,
          Y,
          u * 0.3,
          u * 0.12,
          `fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="3 2"`,
        );
        line(out, X, Y, X, Y - u * 0.8, `stroke="${col}" stroke-width="1.2"`);
        if (ch[0] === "b")
          circ(out, X, Y - u * 0.95, u * 0.15, `fill="#0a2540" stroke="${col}" stroke-width="2.4"`);
        else
          path(
            out,
            `M${f(X)},${f(Y - u * 1.14)} L${f(X + u * 0.17)},${f(Y - u * 0.8)} L${f(X - u * 0.17)},${f(Y - u * 0.8)} Z`,
            `fill="#0a2540" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"`,
          );
        const z = ch[3] === 0.5 ? c.rampZ(ch[1]) : ch[3] * c.DECK;
        c.out.push(
          `<text x="${f(X + u * 0.2)}" y="${f(Y - u * 0.6)}" font-family="monospace" font-size="9" fill="${col}">${z === 0 ? "±0" : `+${f(z)}`}</text>`,
        );
      },
    },
  },

  // ------------------------------------------------------------ H
  h: {
    name: "H · Tapestry",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#5a1d26", "#3a1018"],
    floor: "#cfb98a",
    deck: "#2f4a7a",
    wall: "#8a3030",
    ramp: "#3d6a52",
    pillar: "#5b3a29",
    friend: "#2a5ea8",
    foe: "#b3342c",
    slab: 0.5,
    edge: "#2a1a12",
    label: "#e6b84a",
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#2a1a12" stroke-width="1.8" stroke-linejoin="round"',
    }),
    hooks: {
      bgAdd: (c) => {
        c.defs.push(
          '<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="3" fill="#000" opacity=".16"/></pattern>',
          '<pattern id="diam" width="48" height="48" patternUnits="userSpaceOnUse"><polygon points="24,6 42,24 24,42 6,24" fill="none" stroke="#e6b84a" stroke-width="1.5" opacity=".28"/></pattern>',
        );
        rect(c.out, 0, 0, c.W, c.H, 'fill="url(#diam)"');
      },
      floorAdd: (c) => {
        c.out.push(
          `<polygon points="${c.pts([c.Q(0, 0), c.Q(20, 0), c.Q(20, 12), c.Q(0, 12)])}" fill="url(#weave)"/>`,
        );
        // stitched border and a rosette in each corner of the field
        c.out.push(
          `<polygon points="${c.pts([c.Q(0.4, 0.4), c.Q(19.6, 0.4), c.Q(19.6, 11.6), c.Q(0.4, 11.6)])}" fill="none" stroke="#8a3030" stroke-width="2" stroke-dasharray="7 4"/>`,
        );
        for (const [x, y] of [
          [1.2, 1.2],
          [18.8, 1.2],
          [18.8, 10.8],
          [1.2, 10.8],
        ]) {
          const [X, Y] = c.Q(x ?? 0, y ?? 0);
          circ(c.out, X, Y, 11, 'fill="#e6b84a" stroke="#2a1a12" stroke-width="1.6"');
          circ(c.out, X, Y, 5, 'fill="#8a3030"');
        }
      },
      deckAdd: (c) => {
        const b = c.BRIDGE;
        const top = [
          c.Q(b.x0, b.y0, c.DECK),
          c.Q(b.x1, b.y0, c.DECK),
          c.Q(b.x1, b.y1, c.DECK),
          c.Q(b.x0, b.y1, c.DECK),
        ];
        c.out.push(`<polygon points="${c.pts(top)}" fill="url(#weave)"/>`);
        c.out.push(
          `<polygon points="${c.pts([c.Q(b.x0 + 0.3, b.y0 + 0.3, c.DECK), c.Q(b.x1 - 0.3, b.y0 + 0.3, c.DECK), c.Q(b.x1 - 0.3, b.y1 - 0.3, c.DECK), c.Q(b.x0 + 0.3, b.y1 - 0.3, c.DECK)])}" fill="none" stroke="#e6b84a" stroke-width="2.4" stroke-dasharray="6 3"/>`,
        );
      },
      over: (c) => {
        rect(c.out, 4, 4, c.W - 8, c.H - 8, 'fill="none" stroke="#e6b84a" stroke-width="7"');
        rect(c.out, 11, 11, c.W - 22, c.H - 22, 'fill="none" stroke="#2a1a12" stroke-width="2"');
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        const o = 'stroke="#2a1a12" stroke-width="2" stroke-linejoin="round"';
        line(out, X - u * 0.1, Y, X - u * 0.1, Y - u * 0.25, `${o} stroke-width="4"`);
        line(out, X + u * 0.1, Y, X + u * 0.1, Y - u * 0.25, `${o} stroke-width="4"`);
        path(
          out,
          `M${f(X - u * 0.26)},${f(Y - u * 0.22)} L${f(X - u * 0.2)},${f(Y - u * 0.7)} L${f(X + u * 0.2)},${f(Y - u * 0.7)} L${f(X + u * 0.26)},${f(Y - u * 0.22)} Z`,
          `fill="${col}" ${o}`,
        );
        circ(out, X, Y - u * 0.85, u * 0.15, `fill="#e8c9a0" ${o}`);
        // the team shape is the gold emblem on the chest
        out.push('<g opacity="1">');
        c.glyph(ch[0], X, Y - u * 0.46, u * 0.1, "#e6b84a");
        out.push("</g>");
        path(
          out,
          `M${f(X - u * 0.17)},${f(Y - u * 0.95)} Q${f(X)},${f(Y - u * 1.12)} ${f(X + u * 0.17)},${f(Y - u * 0.95)}`,
          'fill="none" stroke="#2a1a12" stroke-width="3"',
        );
      },
    },
  },

  // ------------------------------------------------------------ I
  i: {
    name: "I · Voxel",
    iso: true,
    sx: 23,
    sy: 11.5,
    hz: 26,
    bg: ["#9fd8f0", "#d9f0f7"],
    floor: "#6cc04a",
    deck: "#d6a352",
    wall: "#9aa0ac",
    ramp: "#c28d44",
    pillar: "#8a5c32",
    friend: "#2f8ff0",
    foe: "#f0463a",
    slab: 0.5,
    edge: "#000",
    label: "#1d3040",
    voxel: true,
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#000" stroke-opacity=".22" stroke-width=".8" stroke-linejoin="round"',
    }),
    hooks: {
      floorAdd: (c) => {
        for (let i = 0; i < 20; i++)
          for (let j = 0; j < 12; j++)
            c.poly(
              [c.Q(i, j), c.Q(i + 1, j), c.Q(i + 1, j + 1), c.Q(i, j + 1)],
              c.mix(c.S.floor, (i + j) % 2 ? "#ffffff" : "#000000", 0.05 + rnd(i, j) * 0.07),
            );
        c.poly([c.Q(0, 12), c.Q(20, 12), c.Q(20, 12, -1.2), c.Q(0, 12, -1.2)], "#8a5a36");
        c.poly([c.Q(0, 0), c.Q(0, 12), c.Q(0, 12, -1.2), c.Q(0, 0, -1.2)], "#6e4529");
        line(
          c.out,
          ...c.Q(0, 12, -0.6),
          ...c.Q(20, 12, -0.6),
          'stroke="#000" stroke-opacity=".2" stroke-width="1"',
        );
        for (const [x, y] of [
          [18.2, 1.4],
          [1.2, 3.6],
        ]) {
          c.box(x ?? 0, y ?? 0, (x ?? 0) + 0.6, (y ?? 0) + 0.6, 0, 1.1, "#7a5230");
          c.box(
            (x ?? 0) - 0.5,
            (y ?? 0) - 0.5,
            (x ?? 0) + 1.1,
            (y ?? 0) + 1.1,
            1.1,
            2.1,
            "#3e9a3a",
          );
        }
      },
      char: (c, ch, X, Y, col) => {
        const [, x, y] = ch;
        const z = ch[3] === 0.5 ? c.rampZ(x) : ch[3] * c.DECK;
        c.box(x - 0.28, y - 0.2, x + 0.28, y + 0.2, z, z + 0.7, col, { sw: 0 });
        c.box(x - 0.22, y - 0.17, x + 0.22, y + 0.17, z + 0.7, z + 1.15, "#f0cfa8", { sw: 0 });
        c.glyph(ch[0], X, Y - c.u * 1.45, c.u * 0.12, "#fff");
      },
    },
  },

  // ------------------------------------------------------------ J
  j: {
    name: "J · Ink and wash",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#f0e7d3", "#e6dbc2"],
    floor: "#d9cdb0",
    deck: "#d2ac7a",
    wall: "#aaa498",
    ramp: "#d2ac7a",
    pillar: "#b59a76",
    friend: "#3d6fa8",
    foe: "#b8473b",
    slab: 0.5,
    edge: "#2b2420",
    label: "#4a3f30",
    wrap: "wob",
    polyFx: (fill) => ({
      fill,
      extra:
        'fill-opacity=".88" stroke="#2b2420" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"',
    }),
    hooks: {
      bgAdd: (c) => {
        c.defs.push(
          '<filter id="wob" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>',
        );
        rect(c.out, 0, 0, c.W, c.H, 'fill="#000" filter="url(#grain)" opacity=".16"');
      },
      floorAdd: (c) => {
        for (let i = 0; i < 9; i++)
          ell(
            c.out,
            ...c.Q(1 + rnd(1, i) * 18, 1 + rnd(2, i) * 10),
            40 + rnd(3, i) * 60,
            14 + rnd(4, i) * 14,
            'fill="#7d725c" opacity=".16" filter="url(#soft)"',
          );
        for (const [x, y] of [
          [18.6, 9.4],
          [1.2, 1.3],
          [19, 6.2],
        ])
          for (let k = 0; k < 4; k++) {
            const [X, Y] = c.Q((x ?? 0) + k * 0.15, y ?? 0);
            path(
              c.out,
              `M${f(X)},${f(Y)} q${f(4 - k * 3)},-20 ${f(10 - k * 6)},-34`,
              'fill="none" stroke="#2b2420" stroke-width="1.6" stroke-linecap="round"',
            );
          }
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        ell(out, X, Y + 1, u * 0.34, u * 0.1, 'fill="#2b2420" opacity=".25" filter="url(#soft)"');
        path(
          out,
          `M${f(X - u * 0.2)},${f(Y)} Q${f(X - u * 0.3)},${f(Y - u * 0.5)} ${f(X)},${f(Y - u * 0.72)} Q${f(X + u * 0.3)},${f(Y - u * 0.5)} ${f(X + u * 0.2)},${f(Y)} Z`,
          `fill="${col}" fill-opacity=".85" stroke="#2b2420" stroke-width="1.8" stroke-linejoin="round"`,
        );
        circ(out, X, Y - u * 0.84, u * 0.14, 'fill="#f4e8d0" stroke="#2b2420" stroke-width="1.8"');
        c.glyph(ch[0], X, Y - u * 1.14, u * 0.09, "#2b2420");
      },
    },
  },

  // ------------------------------------------------------------ K
  k: {
    name: "K · Arcane levitation",
    iso: false,
    sx: 40,
    sy: 26,
    hz: 44,
    bg: ["#0b0618", "#04020a"],
    floor: "#140a26",
    deck: "#2a1250",
    wall: "#1a1040",
    ramp: "#3a1a70",
    pillar: "#1a1040",
    friend: "#4ad8ff",
    foe: "#ff5a8a",
    slab: 0.4,
    edge: "#9a6bff",
    label: "#c07bff",
    polyFx: (fill) => ({
      fill,
      extra:
        'fill-opacity=".86" stroke="#9a6bff" stroke-width="1.4" stroke-linejoin="round" filter="url(#glow)"',
    }),
    hooks: {
      bgAdd: (c) => {
        c.defs.push(
          '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
          '<radialGradient id="pool"><stop offset="0" stop-color="#e04bff" stop-opacity=".55"/><stop offset="1" stop-color="#e04bff" stop-opacity="0"/></radialGradient>',
          '<radialGradient id="orbB"><stop offset="0" stop-color="#4ad8ff" stop-opacity=".9"/><stop offset="1" stop-color="#4ad8ff" stop-opacity="0"/></radialGradient>',
          '<radialGradient id="orbR"><stop offset="0" stop-color="#ff5a8a" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a8a" stop-opacity="0"/></radialGradient>',
        );
      },
      floorAdd: (c) => {
        for (const [x, y, r] of [
          [3.5, 3, 2.4],
          [16, 9.2, 2.6],
          [17, 3, 1.8],
        ]) {
          const [X, Y] = c.Q(x ?? 0, y ?? 0);
          for (const k of [1, 0.66, 0.33])
            ell(
              c.out,
              X,
              Y,
              (r ?? 0) * 40 * k,
              (r ?? 0) * 26 * k,
              'fill="none" stroke="#9a6bff" stroke-width="1.4" opacity=".6"',
            );
          for (let a = 0; a < 8; a++) {
            const t = (a * Math.PI) / 4;
            line(
              c.out,
              X + Math.cos(t) * (r ?? 0) * 26,
              Y + Math.sin(t) * (r ?? 0) * 17,
              X + Math.cos(t) * (r ?? 0) * 40,
              Y + Math.sin(t) * (r ?? 0) * 26,
              'stroke="#9a6bff" stroke-width="1.4" opacity=".6"',
            );
          }
        }
        for (let x = 1; x < 20; x += 2)
          for (let y = 1; y < 12; y += 2)
            circ(c.out, ...c.Q(x, y), 1.2, 'fill="#9a6bff" opacity=".4"');
      },
      shadow: (c) => {
        // the deck is a light source: the lower layer is lit from above, not shadowed
        ell(c.out, ...c.Q(10, 6.4), 360, 130, 'fill="url(#pool)"');
        for (const k of [1, 0.7, 0.4])
          ell(
            c.out,
            ...c.Q(10, 6.4),
            150 * k,
            56 * k,
            'fill="none" stroke="#e04bff" stroke-width="1.6" opacity=".65"',
          );
      },
      pillar: () => {
        // no supports: the deck levitates
      },
      deckAdd: (c) => {
        const b = c.BRIDGE;
        c.out.push(
          `<polyline points="${c.pts([c.Q(b.x0, b.y1, c.DECK), c.Q(b.x1, b.y1, c.DECK)])}" stroke="#7df9ff" stroke-width="2.4" fill="none" filter="url(#glow)"/>`,
        );
        for (const x of [8.5, 11, 12.5])
          ell(
            c.out,
            ...c.Q(x, 5, c.DECK),
            22,
            9,
            'fill="none" stroke="#c07bff" stroke-width="1.4" opacity=".8"',
          );
      },
      over: (c) => {
        c.defs.push(
          '<radialGradient id="kvig" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>',
        );
        rect(c.out, 0, 0, c.W, c.H, 'fill="url(#kvig)"');
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        ell(
          out,
          X,
          Y,
          u * 0.34,
          u * 0.13,
          `fill="none" stroke="${col}" stroke-width="1.6" filter="url(#glow)"`,
        );
        circ(out, X, Y - u * 0.5, u * 0.62, `fill="url(#${ch[0] === "b" ? "orbB" : "orbR"})"`);
        ell(
          out,
          X,
          Y - u * 0.48,
          u * 0.17,
          u * 0.4,
          `fill="${mixHex(col, "#ffffff", 0.55)}" filter="url(#glow)"`,
        );
        c.glyph(ch[0], X, Y - u * 1.1, u * 0.1, "#fff");
      },
    },
  },

  // ------------------------------------------------------------ L
  l: {
    name: "L · Stage set (side-on)",
    iso: false,
    sx: 40,
    sy: 12,
    hz: 56,
    bg: ["#2a1519", "#120a0c"],
    floor: "#8b5a34",
    deck: "#d6b67a",
    wall: "#b0a08c",
    ramp: "#c8a368",
    pillar: "#9a7650",
    friend: "#4aa0ea",
    foe: "#ee5a4c",
    slab: 0.5,
    edge: "#2a1a12",
    label: "#f0dcc0",
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#2a1a12" stroke-width="1.4" stroke-linejoin="round"',
    }),
    hooks: {
      bgAdd: (c) => {
        /** @type {[number, string, number][]} */
        const hills = [
          [250, "#4a3446", 1],
          [290, "#3a2a3a", 0.8],
          [330, "#2a1e2c", 0.6],
        ];
        for (const [y, col, k] of hills) {
          let d = `M0,${f(c.H)} L0,${f(y)}`;
          for (let x = 0; x <= 960; x += 60)
            d += ` L${f(x)},${f(y - k * 38 * Math.abs(Math.sin(x * 0.011 + y)))}`;
          path(c.out, `${d} L960,${f(c.H)} Z`, `fill="${col}"`);
        }
        circ(c.out, 720, 190, 34, 'fill="#f0c890" opacity=".7"');
      },
      floorAdd: (c) => {
        for (let x = 1; x < 20; x++)
          c.out.push(
            `<polyline points="${c.pts([c.Q(x, 0), c.Q(x, 12)])}" stroke="#2a1a12" stroke-width="1" opacity=".5" fill="none"/>`,
          );
        for (let x = 0.5; x < 20; x += 1.4) circ(c.out, ...c.Q(x, 12.3), 3, 'fill="#ffe9a0"');
      },
      over: (c) => {
        c.defs.push(
          '<linearGradient id="drape" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a1218"/><stop offset=".5" stop-color="#8e2430"/><stop offset="1" stop-color="#5a1218"/></linearGradient>',
        );
        path(
          c.out,
          `M0,0 L${f(c.W)},0 L${f(c.W)},46 Q${f(c.W * 0.75)},70 ${f(c.W / 2)},46 Q${f(c.W * 0.25)},70 0,46 Z`,
          'fill="url(#drape)" stroke="#2a0a0e" stroke-width="2"',
        );
        path(
          c.out,
          `M0,0 L84,0 Q60,${f(c.H * 0.5)} 98,${f(c.H)} L0,${f(c.H)} Z`,
          'fill="url(#drape)" stroke="#2a0a0e" stroke-width="2"',
        );
        path(
          c.out,
          `M${f(c.W)},0 L${f(c.W - 84)},0 Q${f(c.W - 60)},${f(c.H * 0.5)} ${f(c.W - 98)},${f(c.H)} L${f(c.W)},${f(c.H)} Z`,
          'fill="url(#drape)" stroke="#2a0a0e" stroke-width="2"',
        );
        path(
          c.out,
          `M${f(c.W * 0.3)},0 L${f(c.W * 0.2)},${f(c.H)} L${f(c.W * 0.4)},${f(c.H)} Z`,
          'fill="#fff4d0" opacity=".05"',
        );
        path(
          c.out,
          `M${f(c.W * 0.7)},0 L${f(c.W * 0.6)},${f(c.H)} L${f(c.W * 0.8)},${f(c.H)} Z`,
          'fill="#fff4d0" opacity=".05"',
        );
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        const o = 'stroke="#2a1a12" stroke-width="1.8" stroke-linejoin="round"';
        line(out, X, Y - u * 0.1, X + u * 0.22, Y + 1, `${o} stroke-width="2.6"`);
        path(
          out,
          `M${f(X - u * 0.24)},${f(Y)} L${f(X - u * 0.24)},${f(Y - u * 0.62)} Q${f(X)},${f(Y - u * 0.72)} ${f(X + u * 0.24)},${f(Y - u * 0.62)} L${f(X + u * 0.24)},${f(Y)} Z`,
          `fill="${col}" ${o}`,
        );
        circ(out, X, Y - u * 0.82, u * 0.16, `fill="#f0d0a8" ${o}`);
        c.glyph(ch[0], X, Y - u * 1.12, u * 0.09, "#fff4d0");
      },
    },
  },

  // ------------------------------------------------------------ M
  m: {
    name: "M · Pixel isometric",
    iso: true,
    sx: 23,
    sy: 11.5,
    hz: 26,
    bg: ["#1a1c2c", "#1a1c2c"],
    floor: "#38b764",
    deck: "#ef7d57",
    wall: "#94b0c2",
    ramp: "#ffcd75",
    pillar: "#a05b53",
    friend: "#41a6f6",
    foe: "#b13e53",
    slab: 0.5,
    edge: "#1a1c2c",
    label: "#f4f4f4",
    pixel: 400,
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#1a1c2c" stroke-width="1.6" stroke-linejoin="miter"',
    }),
    hooks: {
      floorAdd: (c) => {
        for (let i = 0; i < 20; i++)
          for (let j = 0; j < 12; j++)
            if ((i + j) % 2)
              c.poly(
                [c.Q(i, j), c.Q(i + 1, j), c.Q(i + 1, j + 1), c.Q(i, j + 1)],
                "#3da564",
                'stroke="none"',
              );
        c.poly([c.Q(0, 12), c.Q(20, 12), c.Q(20, 12, -1.2), c.Q(0, 12, -1.2)], "#73464c");
        c.poly([c.Q(0, 0), c.Q(0, 12), c.Q(0, 12, -1.2), c.Q(0, 0, -1.2)], "#5d2c3a");
      },
      char: (c, ch, X, Y, col) => {
        const u = c.u * 1.6;
        const out = c.out;
        const o = 'stroke="#1a1c2c" stroke-width="1.6"';
        ell(out, X, Y, u * 0.3, u * 0.12, 'fill="#1a1c2c" opacity=".5"');
        rect(out, X - u * 0.2, Y - u * 0.6, u * 0.4, u * 0.5, `fill="${col}" ${o}`);
        rect(out, X - u * 0.2, Y - u * 0.12, u * 0.15, u * 0.12, 'fill="#333c57"');
        rect(out, X + u * 0.05, Y - u * 0.12, u * 0.15, u * 0.12, 'fill="#333c57"');
        rect(out, X - u * 0.16, Y - u * 0.92, u * 0.32, u * 0.3, `fill="#ffcd75" ${o}`);
        c.glyph(ch[0], X, Y - u * 1.18, u * 0.12, "#f4f4f4");
      },
    },
  },

  // ------------------------------------------------------------ N
  n: {
    name: "N · Woodcut print",
    iso: false,
    sx: 40,
    sy: 28,
    hz: 44,
    bg: ["#ececec", "#d8d8d8"],
    floor: "#a8a8a8",
    deck: "#e2e2e2",
    wall: "#5a5a5a",
    ramp: "#c4c4c4",
    pillar: "#6c6c6c",
    friend: "#1b130e",
    foe: "#c0392b",
    slab: 0.5,
    edge: "#000",
    label: "#1b130e",
    post: [
      "-colorspace",
      "Gray",
      "-sigmoidal-contrast",
      "5,50%",
      "-ordered-dither",
      "h6x6a",
      "+level-colors",
      "#1b130e,#efe3c6",
    ],
    hooks: {
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        const ink = "#1b130e";
        ell(out, X, Y, u * 0.34, u * 0.12, `fill="${ink}"`);
        path(
          out,
          `M${f(X - u * 0.24)},${f(Y)} L${f(X - u * 0.16)},${f(Y - u * 0.62)} L${f(X + u * 0.16)},${f(Y - u * 0.62)} L${f(X + u * 0.24)},${f(Y)} Z`,
          `fill="${col}" stroke="${ch[0] === "b" ? "#efe3c6" : ink}" stroke-width="3" stroke-linejoin="round"`,
        );
        circ(out, X, Y - u * 0.8, u * 0.17, `fill="#efe3c6" stroke="${ink}" stroke-width="3"`);
        c.glyph(ch[0], X, Y - u * 1.14, u * 0.12, ink);
      },
    },
  },

  // ------------------------------------------------------------ O
  o: {
    name: "O · Storybook meadow",
    iso: false,
    sx: 40,
    sy: 30,
    hz: 40,
    bg: ["#bfe3f2", "#f6e7c1"],
    floor: "#9fd27a",
    deck: "#e0a45a",
    wall: "#c9c2b0",
    ramp: "#d9a05b",
    pillar: "#8b5a34",
    friend: "#3d8be0",
    foe: "#e8604f",
    slab: 0.5,
    edge: "#6b4a32",
    label: "#5a4a30",
    polyFx: (fill) => ({
      fill,
      extra: 'stroke="#6b4a32" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"',
    }),
    hooks: {
      bgAdd: (c) => {
        for (let i = 0; i < 9; i++)
          circ(
            c.out,
            60 + i * 110,
            40 + rnd(5, i) * 60,
            14 + rnd(6, i) * 26,
            'fill="#fff" opacity=".35" filter="url(#soft)"',
          );
        for (const [x, y, r] of [
          [150, 90, 40],
          [820, 70, 46],
        ])
          ell(
            c.out,
            x ?? 0,
            y ?? 0,
            r ?? 0,
            (r ?? 0) * 0.4,
            'fill="#fff" opacity=".8" filter="url(#soft)"',
          );
      },
      floorAdd: (c) => {
        for (let i = 0; i < 38; i++) {
          const [X, Y] = c.Q(0.5 + rnd(7, i) * 19, 0.5 + rnd(8, i) * 11);
          path(
            c.out,
            `M${f(X)},${f(Y)} q2,-9 4,0 q2,-9 4,0`,
            'fill="none" stroke="#5aa04e" stroke-width="1.8" stroke-linecap="round"',
          );
        }
        for (let i = 0; i < 16; i++) {
          const [X, Y] = c.Q(0.5 + rnd(9, i) * 19, 0.5 + rnd(10, i) * 11);
          circ(
            c.out,
            X,
            Y,
            3.4,
            `fill="${i % 2 ? "#fff" : "#ffb3c8"}" stroke="#6b4a32" stroke-width="1"`,
          );
          circ(c.out, X, Y, 1.3, 'fill="#ffd34a"');
        }
        for (let i = 0; i < 7; i++)
          ell(
            c.out,
            ...c.Q(1.5 + i * 0.6, 6 - i * 0.2),
            20,
            8,
            'fill="#d9c9a0" stroke="#6b4a32" stroke-width="1.4"',
          );
      },
      wallAdd: (c, w) => {
        const [x0, , x1, y1, h] = w;
        for (const t of [0.2, 0.5, 0.8])
          ell(
            c.out,
            ...c.Q((x0 ?? 0) + ((x1 ?? 0) - (x0 ?? 0)) * t, y1 ?? 0, h),
            13,
            7,
            'fill="#6fbf5a" stroke="#6b4a32" stroke-width="1.4"',
          );
      },
      pillar: (c, px, py) => {
        c.box(px, py, px + 0.6, py + 0.6, 0, c.DECK - c.S.slab, "#8b5a34", { front: "#6e4529" });
        for (const dx of [0, 0.5])
          ell(
            c.out,
            ...c.Q(px + 0.1 + dx, py + 0.6),
            24,
            12,
            'fill="#5fa35a" stroke="#6b4a32" stroke-width="1.6"',
          );
      },
      deckAdd: (c) => {
        const b = c.BRIDGE;
        for (let x = b.x0 + 0.875; x < b.x1; x += 0.875)
          c.out.push(
            `<polyline points="${c.pts([c.Q(x, b.y0, c.DECK), c.Q(x, b.y1, c.DECK)])}" stroke="#a9742f" stroke-width="1.6" fill="none"/>`,
          );
        const [ax, ay] = c.Q(b.x0 + 0.2, b.y1, c.DECK);
        const [bx] = c.Q(b.x1 - 0.2, b.y1, c.DECK);
        for (const x of [ax, (ax + bx) / 2, bx])
          line(
            c.out,
            x,
            ay,
            x,
            ay - 20,
            'stroke="#6b4a32" stroke-width="4" stroke-linecap="round"',
          );
        path(
          c.out,
          `M${f(ax)},${f(ay - 18)} Q${f((ax + bx) / 4 + ax / 2 + 0)},${f(ay - 4)} ${f((ax + bx) / 2)},${f(ay - 18)} Q${f(((ax + bx) / 2 + bx) / 2)},${f(ay - 4)} ${f(bx)},${f(ay - 18)}`,
          'fill="none" stroke="#f3e2b5" stroke-width="2.6" stroke-linecap="round"',
        );
      },
      over: (c) => {
        c.defs.push(
          '<radialGradient id="ovg" cx=".5" cy=".5" r=".8"><stop offset=".6" stop-color="#ffb070" stop-opacity="0"/><stop offset="1" stop-color="#ff9a5a" stop-opacity=".35"/></radialGradient>',
        );
        rect(c.out, 0, 0, c.W, c.H, 'fill="url(#ovg)"');
      },
      char: (c, ch, X, Y, col) => {
        const { u, out } = c;
        const o = 'stroke="#6b4a32" stroke-width="1.8" stroke-linejoin="round"';
        ell(out, X, Y + 1, u * 0.34, u * 0.12, 'fill="#3a2a14" opacity=".28"');
        ell(out, X - u * 0.1, Y - u * 0.04, u * 0.09, u * 0.05, `fill="#6b4a32"`);
        ell(out, X + u * 0.1, Y - u * 0.04, u * 0.09, u * 0.05, `fill="#6b4a32"`);
        ell(out, X, Y - u * 0.3, u * 0.25, u * 0.27, `fill="${col}" ${o}`);
        circ(out, X, Y - u * 0.74, u * 0.24, `fill="#ffd9b0" ${o}`);
        circ(out, X - u * 0.1, Y - u * 0.7, u * 0.04, 'fill="#ff9aa8"');
        circ(out, X + u * 0.1, Y - u * 0.7, u * 0.04, 'fill="#ff9aa8"');
        // shape-first hat: round cap = friend, pointed hat = foe
        if (ch[0] === "b")
          path(
            out,
            `M${f(X - u * 0.24)},${f(Y - u * 0.8)} Q${f(X)},${f(Y - u * 1.12)} ${f(X + u * 0.24)},${f(Y - u * 0.8)} Z`,
            `fill="${col}" ${o}`,
          );
        else
          path(
            out,
            `M${f(X - u * 0.24)},${f(Y - u * 0.82)} L${f(X)},${f(Y - u * 1.28)} L${f(X + u * 0.24)},${f(Y - u * 0.82)} Z`,
            `fill="${col}" ${o}`,
          );
      },
    },
  },
};

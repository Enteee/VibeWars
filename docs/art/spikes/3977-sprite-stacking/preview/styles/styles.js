const STYLES = {
  painterly: {
    label: "Painterly",
    seg: 20,
    step: 0.85,
    outline: null,
    bands: 0,
    head: "hood",
    cape: true,
    pixel: 1,
    rot0: 0,
    contrast: 0.45,
    ao: 0.38,
    teams: [
      [0x4f6f9a, 0x8fa8c8],
      [0x9a4f45, 0xc89a8a],
    ],
    skin: 0xd2a07c,
    hair: 0x3b2a1e,
    boot: 0x3a2c22,
    trouser: 0x4a4438,
    belt: 0x6a4a2c,
    floor: [0x6b6254, 0.14],
    floorKind: "flag",
    wall: 0x9a9080,
    column: 0xc9bea6,
    wood: 0x8a6440,
    trunk: 0x5a4030,
    leaf: [0x34502c, 0x8aa860],
    water: ["#2c5560"],
    vignette: 0.35,
    warm: 0.18,
  },
  lowpoly: {
    label: "Low-poly",
    seg: 6,
    step: 1.3,
    outline: null,
    bands: 3,
    head: "hair",
    cape: false,
    pixel: 1,
    rot0: Math.PI / 6,
    contrast: 0.6,
    ao: 0.25,
    teams: [
      [0x3c9ad8, 0x9ad4f0],
      [0xe0604c, 0xf4b49a],
    ],
    skin: 0xf0c49a,
    hair: 0x5a3a2a,
    boot: 0x40343a,
    trouser: 0x4c5266,
    belt: 0x7a5634,
    floor: [0x7a8a6a, 0.1],
    floorKind: "tri",
    wall: 0xb0a890,
    column: 0xe0d8c4,
    wood: 0xb07a44,
    trunk: 0x7a5434,
    leaf: [0x3a7a4a, 0x9ad07a],
    water: ["#2a7aa0"],
    vignette: 0.1,
    warm: 0.1,
  },
  pixel: {
    label: "Pixel art",
    seg: 12,
    step: 1.0,
    outline: { w: 1, c: "#140c10" },
    bands: 4,
    head: "hair",
    cape: false,
    pixel: 3,
    rot0: 0,
    contrast: 0.55,
    ao: 0.3,
    teams: [
      [0x3a78d8, 0x8ac0ff],
      [0xd83a4a, 0xff9aa0],
    ],
    skin: 0xf0b088,
    hair: 0x5c2c1c,
    boot: 0x2c1c24,
    trouser: 0x3c3c5c,
    belt: 0x8c5c2c,
    floor: [0x5c6c5c, 0.12],
    floorKind: "flag",
    wall: 0x8c8c9c,
    column: 0xbcbcc8,
    wood: 0xac6c3c,
    trunk: 0x6c442c,
    leaf: [0x2c6c3c, 0x7cc85c],
    water: ["#1c4c9c"],
    vignette: 0.15,
    warm: 0.15,
  },
  gothic: {
    label: "Grim gothic",
    seg: 18,
    step: 1.0,
    outline: { w: 1, c: "#08080a" },
    bands: 0,
    head: "helmet",
    cape: true,
    pixel: 1,
    rot0: 0,
    contrast: 0.75,
    ao: 0.5,
    teams: [
      [0x46607e, 0x9aa6b4],
      [0x7a2a2a, 0xa8a0a0],
    ],
    skin: 0xb89a84,
    hair: 0x201814,
    boot: 0x1c1a1a,
    trouser: 0x2a2a30,
    belt: 0x3a2a20,
    floor: [0x3a3834, 0.16],
    floorKind: "flag",
    wall: 0x5e5a54,
    column: 0x8a847a,
    wood: 0x5a4030,
    trunk: 0x30241c,
    leaf: [0x1c2a1c, 0x4a5a34],
    water: ["#0e2228"],
    vignette: 0.6,
    warm: 0.35,
  },
  "gothic-light": {
    label: "Gothic, lighter",
    seg: 18,
    step: 1.0,
    outline: { w: 1, c: "#121214" },
    bands: 0,
    head: "helmet",
    cape: true,
    pixel: 1,
    rot0: 0,
    contrast: 0.6,
    ao: 0.4,
    teams: [
      [0x5a7aa2, 0xb8c4d0],
      [0x9c3c36, 0xccbcb6],
    ],
    skin: 0xc8a890,
    hair: 0x2c221c,
    boot: 0x2e2a28,
    trouser: 0x3e3e46,
    belt: 0x4c3828,
    floor: [0x5c5850, 0.14],
    floorKind: "flag",
    wall: 0x827c72,
    column: 0xaca496,
    wood: 0x74563c,
    trunk: 0x40302a,
    leaf: [0x2c4428, 0x6c8048],
    water: ["#21505a"],
    vignette: 0.3,
    warm: 0.28,
  },
  voxel: {
    label: "Voxel",
    seg: 4,
    step: 1.3,
    outline: null,
    bands: 4,
    head: "hair",
    cape: false,
    pixel: 1,
    rot0: Math.PI / 4,
    contrast: 0.5,
    ao: 0.3,
    snap: 2,
    teams: [
      [0x2f86e0, 0x7fc4ff],
      [0xe8483a, 0xffa08a],
    ],
    skin: 0xf4c090,
    hair: 0x6a3a1c,
    boot: 0x3a2a2a,
    trouser: 0x44506a,
    belt: 0x8a5a2a,
    floor: [0x8a9a7a, 0.08],
    floorKind: "grid",
    wall: 0xa8a49a,
    column: 0xe8e0d0,
    wood: 0xc08048,
    trunk: 0x8a5a34,
    leaf: [0x3a8a3a, 0x8ad05a],
    water: ["#2a6ac0"],
    vignette: 0.1,
    warm: 0.12,
  },
};
const ST = STYLES[new URLSearchParams(location.search).get("style") || "painterly"];
const OUT = ST.outline ? ST.outline.c : null;
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, t) => {
  const A = rgb(a),
    B = rgb(b);
  return (
    (Math.round(A[0] + (B[0] - A[0]) * t) << 16) |
    (Math.round(A[1] + (B[1] - A[1]) * t) << 8) |
    Math.round(A[2] + (B[2] - A[2]) * t)
  );
};
function shadeK(light) {
  let k = 1 - ST.contrast * (1 - Math.min(light, 1)) + (light > 1 ? light - 1 : 0);
  if (ST.bands) {
    k = Math.round(k * ST.bands) / ST.bands;
  }
  return k;
}
const hex = (c, k = 1, a = 1) => {
  const [r, g, b] = rgb(c);
  return `rgba(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0},${a})`;
};
const ell = (cx, cy, rx, ry, n) => {
  const low = ST.seg < 8;
  n = low ? ST.seg : n || ST.seg;
  const f = low ? 1 / Math.cos(Math.PI / n) : 1;
  return Array.from({ length: n }, (_, i) => {
    const a = ST.rot0 + (i / n) * Math.PI * 2;
    return { x: cx + rx * f * Math.cos(a), y: cy + ry * f * Math.sin(a) };
  });
};
const snap = (v) => (ST.snap ? Math.round(v / ST.snap) * ST.snap : v);
function poly(g, pts) {
  g.beginPath();
  pts.forEach((p, j) => (j ? g.lineTo(snap(p.x), snap(p.y)) : g.moveTo(snap(p.x), snap(p.y))));
  g.closePath();
}
const up = (pts, l) => pts.map((p) => ({ x: p.x, y: p.y - l }));
const circ = (x, y, rx, ry = rx, n) => ell(x, y, rx, ry, n);
function shadow(g, x, y, rx, ry, a = ST.ao) {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.beginPath();
  g.ellipse(x + rx * 0.25, y + ry * 0.3, rx, ry, 0, 0, 7);
  g.fill();
}
function stack(g, layers, outline = true) {
  if (outline && OUT) {
    g.strokeStyle = OUT;
    g.lineWidth = ST.outline.w * 2;
    g.lineJoin = "round";
    layers.forEach((L) => {
      poly(g, up(L.pts, L.lift));
      g.stroke();
    });
  }
  layers.forEach((L) => {
    g.fillStyle = hex(L.colour, shadeK(L.light), L.alpha ?? 1);
    poly(g, up(L.pts, L.lift));
    g.fill();
  });
}
function body(stride = 0, lean = 0) {
  const S = [];
  const push = (parts, tone, light, same) => S.push({ parts, tone, light, same });
  const f = 0.3 * stride;
  const H = ST.head === "helmet";
  for (let i = 0; i < 2; i++)
    push(
      [ell(f + 0.05, -0.26, 0.26, 0.16, 10), ell(-f + 0.05, 0.26, 0.26, 0.16, 10)],
      "boot",
      0.5 + 0.2 * i,
    );
  for (let i = 0; i < 4; i++)
    push(
      [ell(f * 0.7, -0.24, 0.18, 0.17, 10), ell(-f * 0.7, 0.24, 0.18, 0.17, 10)],
      "trouser",
      0.55 + 0.08 * i,
    );
  const skirt = [0.62, 0.6, 0.58, 0.56];
  skirt.forEach((r, i) => {
    if (ST.cape) push([ell(-0.3 - 0.06 * lean, 0, 0.32, 0.66, 14)], "accent2", 0.5 + 0.06 * i);
    push([ell(0.03 * lean * i, 0, r * 0.72, r)], "team", 0.6 + 0.07 * i, ST.cape);
  });
  push([ell(0.12 * lean, 0, 0.4, 0.56)], "belt", 0.9);
  const arm = (i) => {
    const sw = -0.22 * stride * (1 - i / 7);
    return [
      ell(sw + 0.25 * lean * (i / 7), -0.66, 0.15, 0.14, 10),
      ell(-sw + 0.25 * lean * (i / 7), 0.66, 0.15, 0.14, 10),
    ];
  };
  const torso = [0.56, 0.6, 0.64, 0.68, 0.7];
  for (let i = 0; i < 7; i++) {
    if (ST.cape) push([ell(-0.3, 0, 0.3, 0.6 + 0.02 * i, 14)], "accent2", 0.6 + 0.05 * i);
    if (i >= 2) {
      const r = torso[Math.min(i - 2, 4)];
      S.push({
        parts: [ell(0.06 + 0.2 * lean * (i / 7), 0, r * 0.66, r)],
        tone: "team",
        light: 0.74 + 0.04 * i,
        same: ST.cape,
      });
    }
    S.push({
      parts: arm(i),
      tone: i < 2 ? (H ? "metal" : "skin") : "team",
      light: i < 2 ? 0.9 : 0.7 + 0.04 * i,
      same: ST.cape || i >= 2,
    });
  }
  for (let i = 0; i < 2; i++)
    push(
      [ell(0.25 * lean, -0.6, 0.3, 0.26, 12), ell(0.25 * lean, 0.6, 0.3, 0.26, 12)],
      H ? "metal" : "accent",
      0.85 + 0.15 * i,
    );
  push([ell(0.06 + 0.3 * lean, 0, 0.16, 0.16, 10)], "skin", 0.8);
  const head = [0.3, 0.36, 0.38, 0.38, 0.34, 0.26];
  const cx = 0.1 + 0.35 * lean;
  head.forEach((r, i) => {
    if (H) {
      S.push({ parts: [ell(cx, 0, r * 1.05, r)], tone: "metal", light: 0.7 + 0.07 * i });
      if (i === 2 || i === 3)
        S.push({
          parts: [
            [
              { x: cx + r * 0.55, y: -r * 0.7 },
              { x: cx + r * 1.1, y: -r * 0.35 },
              { x: cx + r * 1.1, y: r * 0.35 },
              { x: cx + r * 0.55, y: r * 0.7 },
            ],
          ],
          tone: "visor",
          light: 1,
          same: true,
        });
      if (i === 5) S.push({ parts: [ell(cx - 0.05, 0, 0.32, 0.08, 8)], tone: "team", light: 1.05 });
      return;
    }
    S.push({ parts: [ell(cx, 0, r, r * 0.95, 16)], tone: "skin", light: 0.85 + 0.03 * i });
    const hood = ST.head === "hood";
    const hr = hood ? r * 1.15 : i < 4 ? r * 1.02 : r * 1.04;
    const off = hood ? -0.14 : i < 4 ? -0.12 : -0.04;
    S.push({
      parts: [ell(cx + off, 0, hr * 0.9, hr, 16)],
      tone: hood ? "accent2" : "hair",
      light: 0.75 + 0.08 * i,
      same: true,
    });
  });
  return S;
}
function paint(g, x, y, r, facing, team, slices, kind) {
  const [colour, accent] = ST.teams[team];
  const tones = {
    boot: ST.boot,
    trouser: ST.trouser,
    skin: ST.skin,
    hair: ST.hair,
    belt: ST.belt,
    team: colour,
    accent,
    accent2: mix(colour, 0x000000, 0.4),
    metal: mix(0x9aa0a8, accent, 0.25),
    visor: 0x101014,
  };
  shadow(g, x, y, r * 0.95, r * 0.7);
  const cos = Math.cos(facing),
    sin = Math.sin(facing);
  let lift = 0;
  const L = [];
  slices.forEach((s) => {
    if (!s.same) lift += ST.step;
    s.parts.forEach((pt) =>
      L.push({
        pts: pt.map((p) => ({
          x: x + (p.x * cos - p.y * sin) * r,
          y: y + (p.x * sin + p.y * cos) * r * 0.82,
        })),
        lift,
        colour: tones[s.tone],
        light: s.light,
      }),
    );
  });
  stack(g, L);
  if (kind !== undefined) badge(g, x, y - lift - r * 0.1, r, kind);
}
function glyph(g, x, y, s, kind, tint) {
  g.fillStyle = tint;
  g.beginPath();
  if (kind === 0) {
    g.moveTo(x, y - s);
    g.lineTo(x + s * 0.7, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s * 0.7, y);
  } else if (kind === 1) {
    g.moveTo(x, y - s);
    g.lineTo(x + s * 0.8, y + s * 0.1);
    g.lineTo(x + s * 0.3, y + s * 0.1);
    g.lineTo(x + s * 0.3, y + s);
    g.lineTo(x - s * 0.3, y + s);
    g.lineTo(x - s * 0.3, y + s * 0.1);
    g.lineTo(x - s * 0.8, y + s * 0.1);
  } else {
    g.moveTo(x - s * 0.75, y - s);
    g.lineTo(x + s * 0.75, y - s);
    g.lineTo(x - s * 0.75, y + s);
    g.lineTo(x + s * 0.75, y + s);
  }
  g.closePath();
  g.fill();
}
function badge(g, x, topY, r, kind) {
  const br = Math.max(5, r * 0.5);
  const by = topY - br * 0.6;
  g.fillStyle = "#14100c";
  g.beginPath();
  g.arc(x, by, br + 1, 0, 7);
  g.fill();
  g.fillStyle = "#2c2620";
  g.beginPath();
  g.arc(x, by, br, 0, 7);
  g.fill();
  glyph(g, x, by, br * 0.7, kind, "#f4ead0");
}

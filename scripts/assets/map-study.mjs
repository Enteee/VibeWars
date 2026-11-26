/* eslint-disable @typescript-eslint/restrict-template-expressions -- an SVG generator: numbers go into strings everywhere. */
// Layout study for a 2.5D map rebuild (#3064): the plan of a map.json, by
// layer, with its routes, pits and tunnels, water, zones, lights, levers and
// spawns, 800 px wide. The rebuild cards post one before data is final.
// Usage: [VIBEWARS_CHROMIUM=<chromium>] node scripts/assets/map-study.mjs <map-id> <out.png> [route "x,y x,y ..."]...
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [id, out, ...routeArgs] = process.argv.slice(2);
if (id === undefined || out === undefined) {
  throw new Error("usage: map-study.mjs <map-id> <out.png> [route]...");
}
// The parts of a map.json the plan draws (packages/game-maps/src/schema.ts).
/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ kind: "rect", x: number, y: number, width: number, height: number } | { kind: "polygon", points: Pt[] }} Shape */
/** @typedef {Shape & { layer: number }} Wall */
/**
 * @typedef {{
 *   name: string, width: number, height: number, layers: number, groundLayer: number,
 *   bounds: { kind: "rect" } | { kind: "outline", outline: Pt[] },
 *   pits: { footprint: Shape }[], tunnels: { footprint: Shape }[],
 *   decks: { layer: number, footprint: Shape }[], transitions: { area: Shape }[],
 *   dropOffs: { from: Pt, to: Pt }[], walls: Wall[], gates: { wall: Wall }[],
 *   water?: { depth: string, area: Shape }[], zones?: { area: Shape }[],
 *   switches?: { position: Pt }[], spawnPoints: { team: number, position: Pt }[],
 *   lighting?: { lights: { position: Pt, radius: number }[] },
 * }} MapData
 */
// The map as written; the plan needs no validation.
/** @type {unknown} */
const parsed = JSON.parse(readFileSync(`packages/game-maps/maps/${id}/map.json`, "utf8"));
const map = /** @type {MapData} */ (parsed);

const PX = 800;
const k = PX / map.width;
const legendH = 90;
const H = Math.round(map.height * k);
const INK = "#0b0f14";
// Layer tones: lowest dark, highest light; never a signal hue.
const LAYER = ["#2f2a33", "#7d776c", "#b3a58c", "#e2d6bd"];

/** @type {(shape: Shape) => string} */
const pts = (shape) =>
  (shape.kind === "rect"
    ? [
        [shape.x, shape.y],
        [shape.x + shape.width, shape.y],
        [shape.x + shape.width, shape.y + shape.height],
        [shape.x, shape.y + shape.height],
      ]
    : shape.points.map((p) => [p.x, p.y])
  )
    .map(([x, y]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`)
    .join(" ");
/** @type {(shape: Shape, attrs: string) => string} */
const poly = (shape, attrs) => `<polygon points="${pts(shape)}" ${attrs}/>`;

let s = `<rect width="${PX}" height="${H + legendH}" fill="#1d2a1c"/>`;
/** @type {Shape} */
const ground =
  map.bounds.kind === "outline"
    ? { kind: "polygon", points: map.bounds.outline }
    : { kind: "rect", x: 0, y: 0, width: map.width, height: map.height };
s += poly(ground, `fill="${LAYER[map.groundLayer]}" stroke="${INK}" stroke-width="2"`);
for (const below of [...map.tunnels, ...map.pits]) {
  s += poly(
    below.footprint,
    `fill="${LAYER[0]}" stroke="#d9c9ff" stroke-width="1.5" stroke-dasharray="4 3"`,
  );
}
for (const body of map.water ?? []) {
  s += poly(body.area, `fill="${body.depth === "deep" ? "#24527a" : "#4f8fb8"}" stroke="${INK}"`);
}
for (const wall of map.walls.filter((w) => w.layer === map.groundLayer)) {
  s += poly(wall, `fill="#4a4038" stroke="${INK}" stroke-width="1.5"`);
}
for (const deck of [...map.decks].sort((a, b) => a.layer - b.layer)) {
  s += poly(
    deck.footprint,
    `fill="${LAYER[deck.layer]}" stroke="${INK}" stroke-width="1.5" opacity=".95"`,
  );
}
for (const zone of map.zones ?? []) {
  s += poly(zone.area, `fill="none" stroke="#9fe0a0" stroke-width="1.5" stroke-dasharray="2 3"`);
}
for (const t of map.transitions) {
  s += poly(t.area, `fill="#f4efe4" stroke="${INK}" stroke-width="1"`);
}
for (const gate of map.gates)
  s += poly(gate.wall, `fill="#c0c8d8" stroke="${INK}" stroke-width="2"`);
for (const d of map.dropOffs) {
  s += `<line x1="${d.from.x * k}" y1="${d.from.y * k}" x2="${d.to.x * k}" y2="${d.to.y * k}" stroke="#ffffff" stroke-width="3" stroke-dasharray="3 2"/>`;
}
for (const light of map.lighting?.lights ?? []) {
  s += `<circle cx="${light.position.x * k}" cy="${light.position.y * k}" r="${light.radius * k}" fill="#ffc070" opacity=".18"/><circle cx="${light.position.x * k}" cy="${light.position.y * k}" r="2.5" fill="#ffc070"/>`;
}
for (const lever of map.switches ?? []) {
  s += `<rect x="${lever.position.x * k - 4}" y="${lever.position.y * k - 4}" width="8" height="8" fill="#e6c34a" stroke="${INK}"/>`;
}
const TEAM = ["#4a8cff", "#ff4a5a", "#e0e0e0"];
for (const spawn of map.spawnPoints) {
  s += `<circle cx="${spawn.position.x * k}" cy="${spawn.position.y * k}" r="3" fill="${TEAM[spawn.team]}" stroke="${INK}"/>`;
}
routeArgs.forEach((/** @type {string} */ route, /** @type {number} */ index) => {
  const line = route
    .trim()
    .split(/\s+/)
    .map((p) =>
      p
        .split(",")
        .map((n) => Number(n) * k)
        .join(","),
    )
    .join(" ");
  s += `<polyline points="${line}" fill="none" stroke="${TEAM[index % 2]}" stroke-width="2" stroke-dasharray="6 4" opacity=".85"/>`;
});

// Legend: layers, then the marks.
const ly = H + 12;
const font = `font-family="sans-serif" font-size="12" fill="#e8e8e8"`;
s += `<text x="10" y="${ly + 10}" ${font}>${map.name}  ${map.width}×${map.height}, ground L${map.groundLayer}, ${map.layers} layers</text>`;
for (let layer = 0; layer < map.layers; layer += 1) {
  const x = 10 + layer * 110;
  s += `<rect x="${x}" y="${ly + 22}" width="18" height="14" fill="${LAYER[layer]}" stroke="${INK}"/><text x="${x + 24}" y="${ly + 33}" ${font}>L${layer}${layer === map.groundLayer ? " ground" : layer < map.groundLayer ? " below" : ""}</text>`;
}
const marks = [
  ["#f4efe4", "stairs"],
  ["#4a4038", "walls"],
  ["#c0c8d8", "gate"],
  ["#e6c34a", "lever"],
  ["#ffc070", "light"],
  ["#9fe0a0", "zone"],
];
marks.forEach(([fill, label], i) => {
  const x = 10 + i * 90;
  s += `<rect x="${x}" y="${ly + 48}" width="14" height="14" fill="${fill}" stroke="${INK}"/><text x="${x + 20}" y="${ly + 59}" ${font}>${label}</text>`;
});
s += `<text x="560" y="${ly + 59}" ${font}>dashed: routes, tunnels</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${H + legendH}">${s}</svg>`;
// The system Chromium where Playwright has none of its own, as readme-shots.mjs.
const executablePath = process.env.VIBEWARS_CHROMIUM;
const browser = await chromium.launch({
  ...(executablePath === undefined ? {} : { executablePath }),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: PX, height: H + legendH } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.locator("svg").screenshot({ path: out });
await browser.close();

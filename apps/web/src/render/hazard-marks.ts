import {
  ZONE_TELEGRAPH_SECONDS,
  type Vec2,
  type ZonePath,
  type ZonePhase,
  type ZoneSchedule,
} from "@vibewars/game-core";

import { shapeOutline } from "./layer-surfaces.js";
import type { RenderableShape } from "./arena-snapshot.js";

/**
 * A timed or moving hazard's mark (#3053, docs/art/3053-hazards.md): what
 * stands in its zone, so a player sees a fire vent, a gas spout, a rockfall
 * or a boulder, and its phase, before the zone's ring says how far it
 * reaches. Drawn each frame from a handful of shapes, under the ring, and
 * within it: the ring tells the true area.
 */

export type HazardKind = "vent" | "spout" | "rockfall" | "boulder";

/** The few drawing calls a hazard needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface HazardPainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** The hazard a zone of `kind` is; a rockfall that moves is a boulder rolling. */
export function hazardKindOf(zone: {
  readonly kind: string;
  readonly path?: ZonePath | undefined;
}): HazardKind | undefined {
  switch (zone.kind) {
    case "vent":
      return "vent";
    case "gas-spout":
      return "spout";
    case "rockfall":
      return zone.path === undefined ? "rockfall" : "boulder";
    default:
      return undefined;
  }
}

/**
 * What a hazard shows in a phase: `glow`, 0 to 1, how hot its mouth or how
 * dark its shadow; `cue`, the telegraph's moving sign (sparks, wisps,
 * grit), which is not colour; `strike`, the harm itself (flame, gas,
 * falling rocks). Loud only while it hurts.
 */
export interface HazardVisual {
  readonly glow: number;
  readonly cue: boolean;
  readonly strike: boolean;
}

export function hazardVisual(phase: ZonePhase): HazardVisual {
  switch (phase) {
    case "idle":
      return { glow: 0.15, cue: false, strike: false };
    case "telegraph":
      return { glow: 0.55, cue: true, strike: false };
    case "active":
      return { glow: 1, cue: false, strike: true };
  }
}

/** How far through its current phase, 0 to 1, a scheduled zone is at `seconds`; always on is 0. */
export function phaseProgressAt(schedule: ZoneSchedule | undefined, seconds: number): number {
  if (schedule === undefined) {
    return 0;
  }
  const { periodSeconds, activeSeconds, offsetSeconds } = schedule;
  const since = seconds - offsetSeconds;
  const into = since - Math.floor(since / periodSeconds) * periodSeconds;
  if (into < ZONE_TELEGRAPH_SECONDS) {
    return into / ZONE_TELEGRAPH_SECONDS;
  }
  const active = into - ZONE_TELEGRAPH_SECONDS;
  if (active < activeSeconds) {
    return active / activeSeconds;
  }
  const idle = periodSeconds - ZONE_TELEGRAPH_SECONDS - activeSeconds;
  return idle <= 0 ? 0 : (active - activeSeconds) / idle;
}

/** A hazard's colours (docs/art/3053-hazards.md): stone toned by its facet's angle to the NW light. */
export const HAZARD_LOOK = {
  stoneLit: 0x8f887b,
  stoneMid: 0x6f695f,
  stoneShade: 0x4d4943,
  stoneDark: 0x34312c,
  stoneTop: 0xb4ad9f,
  stoneRim: 0xe6dfd0,
  stoneOutline: 0x23211d,
  shadow: 0x0b0a08,
  ember: 0x7a2a12,
  mouth: 0x1e1410,
  flameOuter: 0xff4a12,
  flameMid: 0xff8a2a,
  flameCore: 0xffe08a,
  glow: 0xff7a30,
  spark: 0xffc860,
  smoke: 0x9a948a,
  moss: 0x5a8a2a,
  gas: 0xb8e05a,
  gasDeep: 0x8ac02a,
  wisp: 0xe6ff6a,
  dust: 0xc8bfae,
} as const;

/** Where a hazard is drawn: its zone's outline where the zone is now, and the clocks it moves by. */
export interface HazardFrame {
  /** The zone's area, at its path's first point; the painter is already moved along it. */
  readonly area: RenderableShape;
  readonly phase: ZonePhase;
  /** How far through `phase`, 0 to 1. */
  readonly progress: number;
  /** Seconds, for what flickers and drifts; held still under reduced motion. */
  readonly now: number;
  /** One CSS pixel, in world units. */
  readonly line: number;
  /** A moving zone's travel along its path, signed, in world units: a boulder turns by it. */
  readonly travelled: number;
  /** Which way a moving zone goes now, a unit vector; none for a still one. */
  readonly heading: Vec2;
}

export type HazardArt = (painter: HazardPainter, frame: HazardFrame) => void;

/** The centre and the shorter half-side of `area`'s bounds: every mark is sized to stay inside. */
function boundsOf(area: RenderableShape): { readonly centre: Vec2; readonly half: number } {
  const outline = shapeOutline(area);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return {
    centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
    half: Math.min(right - left, bottom - top) / 2,
  };
}

/** A repeatable 0..1 from `n`: the same scatter every frame and on every peer. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Fills the convex `outline` as a fan of triangles. */
function fillConvex(painter: HazardPainter, outline: readonly Vec2[]): void {
  const first = outline[0];
  if (first === undefined) {
    return;
  }
  for (let k = 1; k + 1 < outline.length; k += 1) {
    const b = outline[k];
    const c = outline[k + 1];
    if (b !== undefined && c !== undefined) {
      painter.fillTriangle(first.x, first.y, b.x, b.y, c.x, c.y);
    }
  }
}

function strokeClosed(painter: HazardPainter, outline: readonly Vec2[]): void {
  outline.forEach((from, k) => {
    const to = outline[(k + 1) % outline.length] ?? from;
    painter.lineBetween(from.x, from.y, to.x, to.y);
  });
}

/** The NW light, as a unit vector: a facet turned to it is lit. */
const LIGHT_FROM = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

/** A facet's tone by how squarely it faces the light: `facing` is -1 to 1. */
function facetTone(facing: number): number {
  if (facing > 0.5) {
    return HAZARD_LOOK.stoneLit;
  }
  if (facing > 0) {
    return HAZARD_LOOK.stoneMid;
  }
  if (facing > -0.5) {
    return HAZARD_LOOK.stoneShade;
  }
  return HAZARD_LOOK.stoneDark;
}

/**
 * A chiselled rock at `at`, `radius` across: eight facets toned by their
 * angle to the NW light, a lit top plane, a pale rim on its lit edge, a
 * shadow cast SE. Turned by `turn` radians, the light staying put, so a
 * rolling one is seen to roll. `seed` makes each rock its own shape.
 */
export function paintRock(
  painter: HazardPainter,
  at: Vec2,
  radius: number,
  turn: number,
  seed: number,
  line: number,
): void {
  painter.fillStyle(HAZARD_LOOK.shadow, 0.35);
  painter.fillEllipse(at.x + radius * 0.3, at.y + radius * 0.55, radius * 2.1, radius * 0.9);
  const corners = Array.from({ length: 8 }, (_, k) => {
    const angle = turn + (k * Math.PI) / 4 + (hash(seed + k) - 0.5) * 0.35;
    const reach = radius * (0.82 + 0.18 * hash(seed * 7 + k));
    return { x: at.x + Math.cos(angle) * reach, y: at.y + Math.sin(angle) * reach * 0.86 };
  });
  // The top plane leans to the light, as the study's does.
  const top = corners.map((corner) => ({
    x: at.x - radius * 0.12 + (corner.x - at.x) * 0.5,
    y: at.y - radius * 0.16 + (corner.y - at.y) * 0.5,
  }));
  corners.forEach((from, k) => {
    const to = corners[(k + 1) % corners.length] ?? from;
    const inFrom = top[k] ?? from;
    const inTo = top[(k + 1) % top.length] ?? to;
    const mid = { x: (from.x + to.x) / 2 - at.x, y: (from.y + to.y) / 2 - at.y };
    const length = Math.hypot(mid.x, mid.y) || 1;
    painter.fillStyle(facetTone((mid.x * LIGHT_FROM.x + mid.y * LIGHT_FROM.y) / length), 1);
    painter.fillTriangle(from.x, from.y, to.x, to.y, inTo.x, inTo.y);
    painter.fillTriangle(from.x, from.y, inTo.x, inTo.y, inFrom.x, inFrom.y);
  });
  painter.fillStyle(HAZARD_LOOK.stoneTop, 1);
  fillConvex(painter, top);
  painter.lineStyle(line * 1.5, HAZARD_LOOK.stoneRim, 0.9);
  corners.forEach((from, k) => {
    const to = corners[(k + 1) % corners.length] ?? from;
    const mid = { x: (from.x + to.x) / 2 - at.x, y: (from.y + to.y) / 2 - at.y };
    if ((mid.x * LIGHT_FROM.x + mid.y * LIGHT_FROM.y) / (Math.hypot(mid.x, mid.y) || 1) > 0.4) {
      painter.lineBetween(from.x, from.y, to.x, to.y);
    }
  });
  painter.lineStyle(line, HAZARD_LOOK.stoneOutline, 1);
  strokeClosed(painter, corners);
}

/** A stone collar seen from above and in front: a ring of rock round `mouth`. */
function paintCollar(
  painter: HazardPainter,
  at: Vec2,
  width: number,
  mouth: number,
  mouthAlpha: number,
  line: number,
): void {
  const height = width * 0.45;
  painter.fillStyle(HAZARD_LOOK.shadow, 0.35);
  painter.fillEllipse(at.x + width * 0.06, at.y + height * 0.22, width * 1.08, height * 1.1);
  // Its front face, then its top: the collar stands a little off the ground.
  painter.fillStyle(HAZARD_LOOK.stoneShade, 1);
  painter.fillEllipse(at.x, at.y + height * 0.12, width, height);
  painter.fillStyle(HAZARD_LOOK.stoneMid, 1);
  painter.fillEllipse(at.x, at.y, width, height);
  painter.lineStyle(line, HAZARD_LOOK.stoneOutline, 1);
  painter.strokeEllipse(at.x, at.y, width, height);
  // Chisel cuts round it.
  painter.lineStyle(line, HAZARD_LOOK.stoneDark, 0.8);
  for (let k = 0; k < 6; k += 1) {
    const angle = (k * Math.PI) / 3 + 0.3;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    painter.lineBetween(
      at.x + cos * width * 0.34,
      at.y + sin * height * 0.34,
      at.x + cos * width * 0.5,
      at.y + sin * height * 0.5,
    );
  }
  painter.fillStyle(HAZARD_LOOK.mouth, 1);
  painter.fillEllipse(at.x, at.y, width * 0.66, height * 0.62);
  painter.fillStyle(mouth, mouthAlpha);
  painter.fillEllipse(at.x, at.y, width * 0.56, height * 0.5);
}

/** A soft round glow, as rings fading out, centred on `at`. */
function paintGlow(
  painter: HazardPainter,
  at: Vec2,
  radius: number,
  colour: number,
  alpha: number,
): void {
  for (let k = 4; k >= 1; k -= 1) {
    painter.fillStyle(colour, alpha * 0.22);
    painter.fillEllipse(at.x, at.y, radius * 0.5 * k, radius * 0.38 * k);
  }
}

/** A tongue of flame from `base`, `height` tall and `width` wide, swaying by `sway`. */
function paintFlame(
  painter: HazardPainter,
  base: Vec2,
  width: number,
  height: number,
  sway: number,
  colour: number,
): void {
  const tip = { x: base.x + sway, y: base.y - height };
  painter.fillStyle(colour, 1);
  painter.fillTriangle(base.x - width / 2, base.y, base.x + width / 2, base.y, tip.x, tip.y);
  painter.fillEllipse(base.x, base.y, width, width * 0.5);
}

/** A cracked stone vent: a smoulder idle, a rising glow and sparks, then a column of flame. */
const vent: HazardArt = (painter, { area, phase, progress, now, line }) => {
  const { centre, half } = boundsOf(area);
  const width = half * 1.3;
  const look = hazardVisual(phase);
  if (phase !== "idle") {
    paintGlow(
      painter,
      centre,
      half * (look.strike ? 1.35 : 0.8 + progress * 0.4),
      HAZARD_LOOK.glow,
      look.glow * 0.5,
    );
  }
  const hot = phase === "idle" ? HAZARD_LOOK.ember : HAZARD_LOOK.flameOuter;
  paintCollar(painter, centre, width, hot, phase === "idle" ? 0.7 : 0.6 + 0.4 * look.glow, line);
  if (phase === "idle") {
    // A faint smoulder: a thread of smoke curling up.
    painter.lineStyle(line * 2, HAZARD_LOOK.smoke, 0.45);
    let from = { x: centre.x, y: centre.y - half * 0.05 };
    for (let k = 1; k <= 4; k += 1) {
      const to = {
        x: centre.x + Math.sin(now * 1.6 + k) * half * 0.1,
        y: centre.y - half * 0.05 - k * half * 0.16,
      };
      painter.lineBetween(from.x, from.y, to.x, to.y);
      from = to;
    }
    return;
  }
  if (look.cue) {
    // The mouth flares, and sparks climb: a flame starting low.
    paintFlame(painter, centre, width * 0.3, half * 0.45 * progress, 0, HAZARD_LOOK.flameMid);
    painter.fillStyle(HAZARD_LOOK.spark, 1);
    for (let k = 0; k < 6; k += 1) {
      const rise = (now * 0.9 + hash(k)) % 1;
      painter.fillCircle(
        centre.x + (hash(k + 10) - 0.5) * width * 0.5 + Math.sin(now * 3 + k) * 2,
        centre.y - rise * half * 1.4,
        line * (1.5 + hash(k + 20)),
      );
    }
    return;
  }
  // Active: a column of flame, three tongues and a white-hot core.
  const tall = half * 1.7;
  const sway = Math.sin(now * 9) * half * 0.08;
  paintFlame(painter, centre, width * 0.62, tall * 0.8, sway * 1.4, HAZARD_LOOK.flameOuter);
  paintFlame(
    painter,
    { x: centre.x - width * 0.18, y: centre.y },
    width * 0.3,
    tall * 0.55,
    sway,
    HAZARD_LOOK.flameOuter,
  );
  paintFlame(
    painter,
    { x: centre.x + width * 0.18, y: centre.y },
    width * 0.3,
    tall * 0.6,
    -sway,
    HAZARD_LOOK.flameOuter,
  );
  paintFlame(painter, centre, width * 0.42, tall, sway, HAZARD_LOOK.flameMid);
  paintFlame(painter, centre, width * 0.2, tall * 0.7, sway * 0.6, HAZARD_LOOK.flameCore);
};

/** A mossy fissure: hissing wisps when it is about to blow, then a burst of green-yellow gas. */
const spout: HazardArt = (painter, { area, phase, progress, now, line }) => {
  const { centre, half } = boundsOf(area);
  const width = half * 1.4;
  const height = width * 0.36;
  painter.fillStyle(HAZARD_LOOK.shadow, 0.3);
  painter.fillEllipse(
    centre.x + width * 0.05,
    centre.y + height * 0.25,
    width * 1.05,
    height * 1.1,
  );
  painter.fillStyle(HAZARD_LOOK.stoneShade, 1);
  painter.fillEllipse(centre.x, centre.y + height * 0.12, width, height);
  painter.fillStyle(HAZARD_LOOK.stoneMid, 1);
  painter.fillEllipse(centre.x, centre.y, width, height);
  painter.lineStyle(line, HAZARD_LOOK.stoneOutline, 1);
  painter.strokeEllipse(centre.x, centre.y, width, height);
  painter.fillStyle(HAZARD_LOOK.moss, 0.95);
  for (let k = 0; k < 5; k += 1) {
    const angle = hash(k + 3) * Math.PI * 2;
    painter.fillEllipse(
      centre.x + Math.cos(angle) * width * 0.36,
      centre.y + Math.sin(angle) * height * 0.32,
      width * (0.12 + hash(k + 5) * 0.1),
      height * 0.22,
    );
  }
  // The fissure: a dark lens across it.
  const lens = width * 0.62;
  painter.fillStyle(HAZARD_LOOK.mouth, 1);
  painter.fillTriangle(
    centre.x - lens / 2,
    centre.y,
    centre.x,
    centre.y - height * 0.16,
    centre.x + lens / 2,
    centre.y,
  );
  painter.fillTriangle(
    centre.x - lens / 2,
    centre.y,
    centre.x,
    centre.y + height * 0.16,
    centre.x + lens / 2,
    centre.y,
  );
  if (phase === "telegraph") {
    painter.lineStyle(line * 2.5, HAZARD_LOOK.wisp, 0.85);
    for (let w = -1; w <= 1; w += 1) {
      let from = { x: centre.x + w * lens * 0.25, y: centre.y };
      for (let k = 1; k <= 5; k += 1) {
        const to = {
          x: centre.x + w * lens * 0.25 + Math.sin(now * 7 + k * 1.3 + w) * half * 0.12,
          y: centre.y - k * half * (0.12 + 0.08 * progress),
        };
        painter.lineBetween(from.x, from.y, to.x, to.y);
        from = to;
      }
    }
  } else if (phase === "active") {
    // A burst: puffs that swell from the fissure and hang, all within the ring.
    const swell = 0.55 + 0.45 * Math.min(1, progress * 3);
    for (let k = 0; k < 7; k += 1) {
      const angle = (k / 7) * Math.PI * 2 + now * 0.4;
      const r = half * 0.42 * swell;
      painter.fillStyle(k % 2 === 0 ? HAZARD_LOOK.gas : HAZARD_LOOK.gasDeep, 0.55);
      painter.fillCircle(
        centre.x + Math.cos(angle) * r * 0.9,
        centre.y - half * 0.35 + Math.sin(angle) * r * 0.7,
        half * 0.36 * swell,
      );
    }
    painter.fillStyle(HAZARD_LOOK.wisp, 0.35);
    painter.fillCircle(centre.x, centre.y - half * 0.4, half * 0.3 * swell);
  }
};

/** Where a rockfall's stones lie: the same scatter for one area, within its middle. */
function scatterOf(centre: Vec2, half: number, count: number): readonly Vec2[] {
  return Array.from({ length: count }, (_, k) => {
    const angle = hash(k + 41) * Math.PI * 2;
    const reach = half * (0.25 + 0.5 * hash(k + 53));
    return { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach * 0.8 };
  });
}

/** Stones and a dust shadow; a shadow darkening overhead; then rocks landing in a burst of dust. */
const rockfall: HazardArt = (painter, { area, phase, progress, now, line }) => {
  const { centre, half } = boundsOf(area);
  const shadow = phase === "telegraph" ? 0.15 + 0.3 * progress : phase === "active" ? 0.45 : 0.12;
  painter.fillStyle(HAZARD_LOOK.shadow, shadow);
  painter.fillEllipse(centre.x, centre.y, half * 1.7, half * 1.35);
  scatterOf(centre, half, 5).forEach((at, k) => {
    paintRock(painter, at, half * (0.13 + 0.06 * hash(k + 7)), hash(k) * 3, k + 1, line);
  });
  if (phase === "telegraph") {
    // Grit trickles down first: the cue that is not colour.
    painter.fillStyle(HAZARD_LOOK.dust, 0.9);
    for (let k = 0; k < 4; k += 1) {
      const fall = (now * 1.5 + hash(k + 60)) % 1;
      painter.fillCircle(
        centre.x + (hash(k + 70) - 0.5) * half,
        centre.y - half * 1.4 * (1 - fall),
        line * 1.6,
      );
    }
    return;
  }
  if (phase !== "active") {
    return;
  }
  // Rocks drop in the first third of the strike, then the dust rolls out.
  const drop = Math.min(1, progress * 3);
  scatterOf(centre, half * 0.85, 4).forEach((at, k) => {
    const height = half * 1.6 * (1 - drop) * (1 - drop);
    paintRock(
      painter,
      { x: at.x, y: at.y - height },
      half * (0.2 + 0.07 * hash(k + 90)),
      hash(k + 80) * 6,
      k + 20,
      line,
    );
  });
  if (drop >= 1) {
    const out = (progress - 1 / 3) * 1.5;
    painter.fillStyle(HAZARD_LOOK.dust, 0.5 * (1 - out));
    for (let k = 0; k < 6; k += 1) {
      const angle = (k / 6) * Math.PI * 2;
      painter.fillCircle(
        centre.x + Math.cos(angle) * half * (0.3 + 0.4 * out),
        centre.y + Math.sin(angle) * half * (0.25 + 0.3 * out),
        half * (0.2 + 0.15 * out),
      );
    }
  }
};

/** A round boulder rolling along its path: it turns as it goes, a trail of dust behind. */
const boulder: HazardArt = (painter, { area, now, line, travelled, heading }) => {
  const { centre, half } = boundsOf(area);
  const radius = half * 0.92;
  painter.fillStyle(HAZARD_LOOK.dust, 0.3);
  for (let k = 1; k <= 3; k += 1) {
    const back = radius * (0.9 + k * 0.55);
    const wobble = Math.sin(now * 5 + k) * radius * 0.06;
    painter.fillCircle(
      centre.x - heading.x * back + wobble,
      centre.y - heading.y * back + radius * 0.35,
      radius * (0.42 - k * 0.08),
    );
  }
  paintRock(painter, centre, radius, travelled / radius, 101, line);
  // A crack across its face turns with it.
  const turn = travelled / radius;
  painter.lineStyle(line * 1.5, HAZARD_LOOK.stoneDark, 0.9);
  painter.lineBetween(
    centre.x + Math.cos(turn) * radius * 0.15,
    centre.y + Math.sin(turn) * radius * 0.15,
    centre.x + Math.cos(turn + 0.5) * radius * 0.6,
    centre.y + Math.sin(turn + 0.5) * radius * 0.5,
  );
};

export const HAZARD_ART: Record<HazardKind, HazardArt> = { vent, spout, rockfall, boulder };

/** No heading: a still zone, or a path with no length. */
const STILL: Vec2 = { x: 0, y: 0 };

/**
 * How far along its path a moving zone is at `seconds`, there and back,
 * and which way it goes now: as `zoneOffsetAt` moves it, so a boulder
 * turns forward going out and backward coming home.
 */
export function pathMotionAt(
  path: ZonePath | undefined,
  seconds: number,
): { readonly travelled: number; readonly heading: Vec2 } {
  if (path === undefined) {
    return { travelled: 0, heading: STILL };
  }
  const legs = path.points.slice(1).map((to, k) => {
    const from = path.points[k] ?? to;
    return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
  });
  const length = legs.reduce((sum, leg) => sum + leg.length, 0);
  if (length === 0) {
    return { travelled: 0, heading: STILL };
  }
  const round = (path.speed * seconds) % (2 * length);
  const out = round <= length;
  const travelled = out ? round : 2 * length - round;
  let left = travelled;
  for (const leg of legs) {
    if (left <= leg.length || leg === legs[legs.length - 1]) {
      const sign = out ? 1 : -1;
      const unit = leg.length === 0 ? 1 : leg.length;
      return {
        travelled,
        heading: {
          x: (sign * (leg.to.x - leg.from.x)) / unit,
          y: (sign * (leg.to.y - leg.from.y)) / unit,
        },
      };
    }
    left -= leg.length;
  }
  return { travelled, heading: STILL };
}

import { pointInPolygon, type Vec2 } from "@vibewars/game-core";

import type { MapZone } from "./arena-snapshot.js";
import { shapeOutline } from "./layer-surfaces.js";
import { paintRipples } from "./water-painter.js";
import { ripplesIn, shoreDistance, type Ripple } from "./water-shape.js";
import {
  obeliskOutline,
  PULSE_SECONDS,
  SPIRE_LOOK,
  ZONE_LOOK,
  zoneCentroid,
  type ZoneLook,
  type ZonePainterId,
} from "./zone-look.js";

/**
 * Each effect zone's ground looks like the real thing (#3052,
 * docs/art/3052-zones.md): lava, embers, fog, mud, three waters, grass,
 * the spire's wash. Two parts: `paintZoneGround` paints what holds still
 * once per map onto a canvas clipped by the zone's outline, and
 * `paintZoneMotion` draws the few cheap marks that move, every frame.
 * The outline stays the gameplay truth: nothing moving leaves it.
 */

/** A zone's palette from the study: base, mid and accent. */
interface ZonePalette {
  readonly base: string;
  readonly mid: string;
  readonly accent: string;
}

const PALETTE: Record<Exclude<ZonePainterId, "hazard">, ZonePalette> = {
  lava: { base: "#2a1410", mid: "#7a2a10", accent: "#ffb03d" },
  embers: { base: "#1c1614", mid: "#3a2a22", accent: "#ff6a2a" },
  fog: { base: "#7fbf2a", mid: "#a8d84a", accent: "#e0f58a" },
  mud: { base: "#6b4a26", mid: "#4a3418", accent: "#2a1c0c" },
  "foul-water": { base: "#2c4430", mid: "#3d5a3a", accent: "#8a9a4a" },
  "tainted-water": { base: "#23230f", mid: "#4a4a1e", accent: "#c8b84a" },
  spring: { base: "#2f86d0", mid: "#4fb0f0", accent: "#e8faff" },
  grass: { base: "#2f8a3c", mid: "#4aa650", accent: "#ffe066" },
  spire: { base: "#2a2236", mid: "#4a3a6a", accent: "#c9a8ff" },
};

/**
 * The texture's alpha at its mean: solid ground is opaque, clear water
 * shows a little floor; fog and the spire's wash are translucent in
 * their own paint, so bodies and floor show through.
 */
const GROUND_ALPHA: Record<Exclude<ZonePainterId, "hazard">, number> = {
  lava: 1,
  embers: 1,
  fog: 1,
  mud: 0.96,
  "foul-water": 0.94,
  "tainted-water": 0.94,
  spring: 0.88,
  grass: 0.96,
  spire: 1,
};

/** A speck that glows or twinkles on its own beat: an ember, a sparkle, a bubble. */
export interface ZoneSpeck {
  readonly at: Vec2;
  readonly size: number;
  /** Where in its beat it starts, 0 to 1. */
  readonly phase: number;
  readonly periodSeconds: number;
}

/** A soft puff of fog, drifting round `at` by at most `ZONE_DRIFT`. */
export interface ZonePuff {
  readonly at: Vec2;
  readonly radius: number;
  readonly phase: number;
}

/** Everything a zone's ground needs, worked out once per map. */
export interface ZoneArt {
  readonly painter: Exclude<ZonePainterId, "hazard">;
  readonly outline: readonly Vec2[];
  readonly bounds: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly centroid: Vec2;
  /** Lava's hot cracks, as polylines inside the outline. */
  readonly cracks: readonly (readonly Vec2[])[];
  /** Embers, sparkles or bubbles, by painter. */
  readonly specks: readonly ZoneSpeck[];
  readonly puffs: readonly ZonePuff[];
  readonly ripples: readonly Ripple[];
  /** What the static paint scatters: mottling, puddles, tufts, flowers. */
  readonly seed: number;
}

/** World units a fog puff drifts either side of its place. */
export const ZONE_DRIFT = 6;
/** World units between a watery zone's ripples: closer than a lake's, a zone is small. */
const ZONE_RIPPLE_SPACING = 16;
/** World units a bead of lava runs along its crack in a second: slow. */
const LAVA_FLOW_SPEED = 9;
/** Seconds a ring takes to sink from the spire's edge into its obelisk. */
const DRAIN_SECONDS = 3;
/** Seconds the spire's runes glow up and down. */
const RUNE_SECONDS = 2.4;
/** Seconds a fog puff takes round its drift. */
const PUFF_SECONDS = 7;

/** A small seeded generator: the same zone scatters the same way on every client and every load. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to `count` points inside `outline`, each at least `clearance` from its edge. */
function scatter(
  random: () => number,
  outline: readonly Vec2[],
  bounds: ZoneArt["bounds"],
  count: number,
  clearance: number,
): Vec2[] {
  const points: Vec2[] = [];
  for (let tries = 0; points.length < count && tries < count * 20; tries += 1) {
    const at = {
      x: bounds.left + random() * bounds.width,
      y: bounds.top + random() * bounds.height,
    };
    if (pointInPolygon(at, outline) && shoreDistance(at, outline) >= clearance) {
      points.push(at);
    }
  }
  return points;
}

/** A crack: a wandering line from a start inside the outline, ending where it would leave it. */
function crack(random: () => number, outline: readonly Vec2[], start: Vec2): Vec2[] {
  const points = [start];
  let heading = random() * Math.PI * 2;
  for (let step = 0; step < 7; step += 1) {
    heading += (random() - 0.5) * 1.4;
    const length = 7 + random() * 8;
    const last = points[points.length - 1] ?? start;
    const next = { x: last.x + Math.cos(heading) * length, y: last.y + Math.sin(heading) * length };
    if (!pointInPolygon(next, outline) || shoreDistance(next, outline) < 3) {
      break;
    }
    points.push(next);
  }
  return points;
}

/** `zone`'s art, the `index`th on its map; `undefined` for a hazard, which is its mark. */
export function zoneArtOf(zone: MapZone, index: number): ZoneArt | undefined {
  const painter = ZONE_LOOK[zone.kind].painter;
  if (painter === "hazard") {
    return undefined;
  }
  const outline = shapeOutline(zone.area);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const bounds = { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  const centroid = zoneCentroid(zone.area);
  const seed = (index + 1) * 7919 + Math.round(centroid.x) * 31 + Math.round(centroid.y);
  const random = seeded(seed);
  const area = bounds.width * bounds.height;
  const speck = (at: Vec2, size: number, periodSeconds: number): ZoneSpeck => ({
    at,
    size,
    phase: random(),
    periodSeconds,
  });
  const watery = painter === "foul-water" || painter === "tainted-water" || painter === "spring";
  return {
    painter,
    outline,
    bounds,
    centroid,
    seed,
    cracks:
      painter === "lava"
        ? scatter(random, outline, bounds, 2 + Math.round(area / 2500), 8)
            .map((start) => crack(random, outline, start))
            .filter((line) => line.length > 1)
        : [],
    specks:
      painter === "embers"
        ? scatter(random, outline, bounds, Math.round(area / 260), 3).map((at) =>
            speck(at, 1 + random() * 1.4, 2 + random() * 2.5),
          )
        : painter === "spring"
          ? scatter(random, outline, bounds, Math.round(area / 1100), 6).map((at) =>
              speck(at, 2 + random(), 2.5 + random() * 2),
            )
          : painter === "mud"
            ? scatter(random, outline, bounds, Math.round(area / 1300), 6).map((at) =>
                speck(at, 2.5 + random() * 1.5, 3 + random() * 2.5),
              )
            : [],
    puffs:
      painter === "fog"
        ? scatter(random, outline, bounds, Math.round(area / 700), 14 + ZONE_DRIFT).map((at) => ({
            at,
            radius: Math.min(22, shoreDistance(at, outline) - ZONE_DRIFT),
            phase: random(),
          }))
        : [],
    ripples: watery ? ripplesIn(outline, ZONE_RIPPLE_SPACING) : [],
  };
}

/** The canvas calls the still paint needs. */
export type ZoneCanvas = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "clip"
  | "fill"
  | "stroke"
  | "arc"
  | "ellipse"
  | "fillRect"
  | "createRadialGradient"
  | "setTransform"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "globalAlpha"
  | "shadowBlur"
  | "shadowColor"
>;

function polyline(canvas: ZoneCanvas, points: readonly Vec2[]): void {
  canvas.beginPath();
  points.forEach((point, at) => {
    if (at === 0) {
      canvas.moveTo(point.x, point.y);
    } else {
      canvas.lineTo(point.x, point.y);
    }
  });
}

/** A soft round blob of `colour`, fading out from `alpha` at its middle. */
function blob(canvas: ZoneCanvas, at: Vec2, radius: number, colour: string, alpha: number): void {
  const gradient = canvas.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  gradient.addColorStop(0, colour);
  gradient.addColorStop(1, `${colour}00`);
  canvas.globalAlpha = alpha;
  canvas.fillStyle = gradient;
  canvas.beginPath();
  canvas.arc(at.x, at.y, radius, 0, Math.PI * 2);
  canvas.fill();
  canvas.globalAlpha = 1;
}

/** `count` soft blobs over the zone's bounds, for the mottle of a natural surface. */
function mottle(
  canvas: ZoneCanvas,
  random: () => number,
  art: ZoneArt,
  colour: string,
  count: number,
  radius: readonly [number, number],
  alpha: number,
): void {
  const { left, top, width, height } = art.bounds;
  for (let at = 0; at < count; at += 1) {
    blob(
      canvas,
      { x: left + random() * width, y: top + random() * height },
      radius[0] + random() * (radius[1] - radius[0]),
      colour,
      alpha,
    );
  }
}

/** Little round flecks of `colour`, `size` across at most. */
function flecks(
  canvas: ZoneCanvas,
  random: () => number,
  art: ZoneArt,
  colour: string,
  count: number,
  size: number,
  alpha: number,
): void {
  const { left, top, width, height } = art.bounds;
  canvas.fillStyle = colour;
  canvas.globalAlpha = alpha;
  for (let at = 0; at < count; at += 1) {
    canvas.beginPath();
    canvas.arc(
      left + random() * width,
      top + random() * height,
      0.4 + random() * size,
      0,
      Math.PI * 2,
    );
    canvas.fill();
  }
  canvas.globalAlpha = 1;
}

/**
 * The still part of `art`'s ground, onto `canvas` at `scale` pixels per
 * world unit, the canvas's corner on the zone's bounds' corner. Clipped by
 * the outline: nothing spills over the edge.
 */
export function paintZoneGround(canvas: ZoneCanvas, art: ZoneArt, scale: number): void {
  const palette = PALETTE[art.painter];
  const random = seeded(art.seed ^ 0x5bd1e995);
  const { left, top, width, height } = art.bounds;
  const area = width * height;
  canvas.save();
  canvas.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  polyline(canvas, art.outline);
  canvas.closePath();
  canvas.clip();
  canvas.lineCap = "round";
  const fillAll = (colour: string, alpha: number): void => {
    canvas.globalAlpha = alpha;
    canvas.fillStyle = colour;
    canvas.fillRect(left, top, width, height);
    canvas.globalAlpha = 1;
  };
  switch (art.painter) {
    case "lava": {
      // A dark crust, mottled with heat, split by bright flowing cracks.
      fillAll(palette.base, 1);
      mottle(canvas, random, art, palette.mid, Math.round(area / 120), [6, 16], 0.7);
      mottle(canvas, random, art, "#120806", Math.round(area / 400), [4, 9], 0.6);
      mottle(canvas, random, art, "#ff5a1f", Math.round(area / 700), [5, 10], 0.4);
      for (const line of art.cracks) {
        canvas.shadowColor = "#ff9040";
        canvas.shadowBlur = 6 * scale;
        canvas.strokeStyle = "#ff5a1f";
        canvas.lineWidth = 3.2;
        polyline(canvas, line);
        canvas.stroke();
        canvas.shadowBlur = 0;
        canvas.strokeStyle = palette.accent;
        canvas.lineWidth = 1.6;
        polyline(canvas, line);
        canvas.stroke();
        canvas.strokeStyle = "#ffe680";
        canvas.lineWidth = 0.6;
        polyline(canvas, line);
        canvas.stroke();
      }
      // The rim runs hot where crust meets the ground.
      canvas.strokeStyle = "#ff5a1f";
      canvas.globalAlpha = 0.45;
      canvas.lineWidth = 7;
      polyline(canvas, art.outline);
      canvas.closePath();
      canvas.stroke();
      canvas.globalAlpha = 1;
      break;
    }
    case "embers": {
      // Charred earth: soot, ash and a few dull coals; the live ones glow in motion.
      fillAll(palette.base, 1);
      mottle(canvas, random, art, palette.mid, Math.round(area / 90), [4, 12], 0.75);
      flecks(canvas, random, art, "#5a504a", Math.round(area / 30), 0.8, 0.55);
      flecks(canvas, random, art, "#7a3a1a", Math.round(area / 160), 1.2, 0.8);
      break;
    }
    case "fog": {
      // Low green gas: overlapping soft puffs, see-through, the floor under it.
      fillAll(palette.base, 0.22);
      mottle(canvas, random, art, palette.base, Math.round(area / 160), [10, 22], 0.5);
      mottle(canvas, random, art, palette.mid, Math.round(area / 200), [8, 18], 0.45);
      mottle(canvas, random, art, palette.accent, Math.round(area / 500), [6, 12], 0.35);
      break;
    }
    case "mud": {
      // Wet brown mud with darker pools, each catching a little light on its far lip.
      fillAll(palette.base, 1);
      mottle(canvas, random, art, palette.mid, Math.round(area / 110), [5, 14], 0.6);
      mottle(canvas, random, art, "#7d5a32", Math.round(area / 220), [4, 10], 0.45);
      for (let at = 0; at < Math.max(2, Math.round(area / 1200)); at += 1) {
        const x = left + random() * width;
        const y = top + random() * height;
        const rx = 5 + random() * 7;
        const ry = rx * 0.45;
        canvas.fillStyle = palette.accent;
        canvas.globalAlpha = 0.85;
        canvas.beginPath();
        canvas.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        canvas.fill();
        canvas.strokeStyle = "#c8a070";
        canvas.globalAlpha = 0.45;
        canvas.lineWidth = 0.8;
        canvas.beginPath();
        canvas.ellipse(x, y, rx, ry, 0, Math.PI * 0.1, Math.PI * 0.9);
        canvas.stroke();
      }
      canvas.globalAlpha = 1;
      flecks(canvas, random, art, "#ffffff", Math.round(area / 300), 0.7, 0.12);
      break;
    }
    case "foul-water":
    case "tainted-water":
    case "spring": {
      fillAll(palette.base, 1);
      mottle(canvas, random, art, palette.mid, Math.round(area / 140), [6, 16], 0.55);
      if (art.painter === "foul-water") {
        // Murk below, scum floating on top.
        mottle(canvas, random, art, "#1a2a1c", Math.round(area / 400), [5, 12], 0.5);
        flecks(canvas, random, art, palette.accent, Math.round(area / 45), 1.4, 0.7);
      } else if (art.painter === "tainted-water") {
        // Dark oily water: an amber sheen in long slicks.
        for (let at = 0; at < Math.max(3, Math.round(area / 600)); at += 1) {
          const x = left + random() * width;
          const y = top + random() * height;
          canvas.strokeStyle = palette.accent;
          canvas.globalAlpha = 0.22;
          canvas.lineWidth = 1.2;
          canvas.beginPath();
          canvas.ellipse(x, y, 8 + random() * 10, 2 + random() * 2, random() * 0.4, 0, Math.PI);
          canvas.stroke();
        }
        canvas.globalAlpha = 1;
      } else {
        // Clear water: light caught in bright threads, and a pale shallow rim.
        mottle(canvas, random, art, "#8fd4ff", Math.round(area / 400), [4, 10], 0.4);
        canvas.strokeStyle = palette.accent;
        canvas.globalAlpha = 0.35;
        canvas.lineWidth = 4;
        polyline(canvas, art.outline);
        canvas.closePath();
        canvas.stroke();
        canvas.globalAlpha = 1;
      }
      break;
    }
    case "grass": {
      // Lush grass, lighter than the ground round it: tufts of blades and small flowers.
      fillAll(palette.base, 1);
      mottle(canvas, random, art, palette.mid, Math.round(area / 100), [5, 13], 0.65);
      for (let at = 0; at < Math.round(area / 30); at += 1) {
        const x = left + random() * width;
        const y = top + random() * height;
        const tall = 2.5 + random() * 2.5;
        canvas.strokeStyle = random() < 0.5 ? "#7ccf6a" : "#256e30";
        canvas.lineWidth = 0.7;
        for (const lean of [-0.9, 0, 0.9]) {
          canvas.beginPath();
          canvas.moveTo(x, y);
          canvas.lineTo(x + lean * 1.4, y - tall);
          canvas.stroke();
        }
      }
      for (let at = 0; at < Math.round(area / 120); at += 1) {
        const x = left + random() * width;
        const y = top + random() * height;
        canvas.fillStyle = [palette.accent, "#ffffff", "#f4a6d8"][Math.floor(random() * 3)] ?? "";
        canvas.beginPath();
        canvas.arc(x, y, 1.3, 0, Math.PI * 2);
        canvas.fill();
        canvas.fillStyle = "#c08a20";
        canvas.beginPath();
        canvas.arc(x, y, 0.5, 0, Math.PI * 2);
        canvas.fill();
      }
      break;
    }
    case "spire": {
      // A violet wash darkening the ground, carved with rings round the obelisk.
      fillAll(palette.base, 0.55);
      mottle(canvas, random, art, palette.mid, Math.round(area / 150), [6, 16], 0.55);
      const reach = Math.min(width, height) / 2;
      canvas.strokeStyle = palette.accent;
      canvas.globalAlpha = 0.28;
      canvas.lineWidth = 1.4;
      for (const ring of [0.38, 0.72]) {
        canvas.beginPath();
        canvas.arc(art.centroid.x, art.centroid.y, reach * ring, 0, Math.PI * 2);
        canvas.stroke();
      }
      canvas.globalAlpha = 1;
      break;
    }
  }
  canvas.restore();
}

/** The texture's alpha at render time `seconds`: it breathes by its look's `pulse`, down from its mean. */
export function zoneGroundAlpha(
  art: ZoneArt,
  look: ZoneLook,
  seconds: number,
  still: boolean,
): number {
  const breath = still ? 0 : Math.sin((seconds / PULSE_SECONDS) * Math.PI * 2);
  return GROUND_ALPHA[art.painter] - look.pulse * (0.5 - 0.5 * breath);
}

/** The few drawing calls the moving marks need, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface ZoneMotionPainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  strokeCircle(x: number, y: number, radius: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
  fillOutline(outline: readonly Vec2[]): void;
  strokeOutline(outline: readonly Vec2[]): void;
}

/** Where `phase` (0 to 1) is round a beat of `periodSeconds`, at `seconds`; still motion holds it. */
function beat(phase: number, periodSeconds: number, seconds: number, still: boolean): number {
  const moved = still ? 0 : seconds / periodSeconds;
  return (((phase + moved) % 1) + 1) % 1;
}

/** The point `distance` along `line`, wrapping round its length. */
function along(line: readonly Vec2[], distance: number): Vec2 {
  let left = distance;
  for (let at = 1; at < line.length; at += 1) {
    const a = line[at - 1] ?? line[0];
    const b = line[at] ?? a;
    if (a === undefined || b === undefined) {
      break;
    }
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length) {
      const t = length === 0 ? 0 : left / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= length;
  }
  return line[line.length - 1] ?? { x: 0, y: 0 };
}

function lengthOf(line: readonly Vec2[]): number {
  let total = 0;
  for (let at = 1; at < line.length; at += 1) {
    const a = line[at - 1];
    const b = line[at];
    if (a !== undefined && b !== undefined) {
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

/** A violet obelisk on `foot`, lit from the north-west, its runes glowing by `glow` (0 to 1). */
function paintObelisk(painter: ZoneMotionPainter, foot: Vec2, line: number, glow: number): void {
  const outline = obeliskOutline(foot);
  const half = SPIRE_LOOK.width / 2;
  // Its shadow falls south-east, away from the sun.
  painter.fillStyle(0x0c0a12, 0.3);
  painter.fillOutline([
    { x: foot.x - half, y: foot.y },
    { x: foot.x + half, y: foot.y },
    { x: foot.x + half + 10, y: foot.y + 5 },
    { x: foot.x + 2, y: foot.y + 5 },
  ]);
  painter.fillStyle(SPIRE_LOOK.stone, 1);
  painter.fillOutline(outline);
  // The east face, away from the sun, in shade.
  const [, footEast, shoulderEast, tip] = outline;
  if (footEast !== undefined && shoulderEast !== undefined && tip !== undefined) {
    painter.fillStyle(0x2c2836, 1);
    painter.fillOutline([{ x: foot.x, y: foot.y }, footEast, shoulderEast, tip]);
  }
  painter.lineStyle(line, SPIRE_LOOK.outline, 1);
  painter.strokeOutline(outline);
  painter.fillStyle(SPIRE_LOOK.rune, 0.06 + 0.1 * glow);
  painter.fillCircle(foot.x, foot.y - SPIRE_LOOK.height * 0.45, 6 + 3 * glow);
  for (const [from, to] of [
    [0.2, 0.3],
    [0.38, 0.48],
    [0.56, 0.66],
  ] as const) {
    painter.lineStyle(1.8 * line, SPIRE_LOOK.rune, 0.55 + 0.45 * glow);
    painter.lineBetween(
      foot.x - 1,
      foot.y - SPIRE_LOOK.height * from,
      foot.x - 1,
      foot.y - SPIRE_LOOK.height * to,
    );
  }
}

/**
 * `art`'s moving marks at render time `seconds`: lava beads running down
 * its cracks, embers glowing and fading, fog puffs drifting, mud
 * bubbles, ripples, a spring's sparkles, the spire's rings sinking into
 * its obelisk. `line` is 1 CSS px in world units. Under still motion each
 * holds where it is: texture and light stay, drift and flow stop.
 */
export function paintZoneMotion(
  painter: ZoneMotionPainter,
  art: ZoneArt,
  line: number,
  seconds: number,
  still: boolean,
): void {
  switch (art.painter) {
    case "lava": {
      for (const [index, crackLine] of art.cracks.entries()) {
        const length = lengthOf(crackLine);
        if (length === 0) {
          continue;
        }
        for (const offset of [0, 0.5]) {
          const t = beat(offset + index * 0.17, length / LAVA_FLOW_SPEED, seconds, still);
          const at = along(crackLine, t * length);
          painter.fillStyle(0xffb03d, 0.35);
          painter.fillCircle(at.x, at.y, 3.2);
          painter.fillStyle(0xfff0a0, 0.95);
          painter.fillCircle(at.x, at.y, 1.4);
        }
      }
      break;
    }
    case "embers": {
      for (const speck of art.specks) {
        const glow = still
          ? 0.6
          : Math.max(0, Math.sin(beat(speck.phase, speck.periodSeconds, seconds, still) * Math.PI));
        painter.fillStyle(0xff6a2a, 0.15 + 0.85 * glow);
        painter.fillCircle(speck.at.x, speck.at.y, speck.size);
        if (glow > 0.7) {
          painter.fillStyle(0xffd060, glow);
          painter.fillCircle(speck.at.x, speck.at.y, speck.size * 0.5);
        }
      }
      break;
    }
    case "fog": {
      for (const puff of art.puffs) {
        const angle = beat(puff.phase, PUFF_SECONDS, seconds, still) * Math.PI * 2;
        const x = puff.at.x + ZONE_DRIFT * Math.cos(angle);
        const y = puff.at.y + ZONE_DRIFT * 0.5 * Math.sin(angle);
        // A soft puff: rings of thin gas, densest at its heart.
        for (const ring of [1, 0.72, 0.45]) {
          painter.fillStyle(0xe0f58a, 0.07);
          painter.fillCircle(x, y, puff.radius * ring);
        }
      }
      break;
    }
    case "mud": {
      for (const speck of art.specks) {
        const t = beat(speck.phase, speck.periodSeconds, seconds, still);
        if (t < 0.85) {
          // Swelling, then a ring as it pops.
          const radius = speck.size * (0.3 + 0.7 * (t / 0.85));
          painter.fillStyle(0x3a2812, 0.55);
          painter.fillCircle(speck.at.x, speck.at.y, radius);
          painter.lineStyle(0.8 * line, 0xc8a070, 0.75);
          painter.strokeCircle(speck.at.x, speck.at.y, radius);
          painter.fillStyle(0xffffff, 0.35);
          painter.fillCircle(speck.at.x - radius * 0.35, speck.at.y - radius * 0.35, radius * 0.25);
        } else {
          const popped = (t - 0.85) / 0.15;
          painter.lineStyle(0.8 * line, 0xc8a070, 0.6 * (1 - popped));
          painter.strokeCircle(speck.at.x, speck.at.y, speck.size * (1 + popped));
        }
      }
      break;
    }
    case "foul-water":
      paintRipples(painter, art.ripples, line, seconds, still, 0x8a9a4a, 0.55);
      break;
    case "tainted-water":
      paintRipples(painter, art.ripples, line, seconds, still, 0xc8b84a, 0.45);
      break;
    case "spring": {
      paintRipples(painter, art.ripples, line, seconds, still, 0xe8faff, 0.6);
      for (const speck of art.specks) {
        const twinkle = still
          ? 0.6
          : Math.max(0, Math.sin(beat(speck.phase, speck.periodSeconds, seconds, still) * Math.PI));
        const { x, y } = speck.at;
        const arm = speck.size * (0.5 + 0.5 * twinkle);
        painter.lineStyle(line, 0xffffff, twinkle);
        painter.lineBetween(x - arm, y, x + arm, y);
        painter.lineBetween(x, y - arm, x, y + arm);
      }
      break;
    }
    case "grass":
      break;
    case "spire": {
      // A ring sinks from the zone's edge into the obelisk: the ground is drained.
      const reach = Math.min(art.bounds.width, art.bounds.height) / 2 - 2;
      const t = beat(0, DRAIN_SECONDS, seconds, still);
      painter.lineStyle(1.5 * line, SPIRE_LOOK.ring, 0.5 * t);
      painter.strokeCircle(art.centroid.x, art.centroid.y, reach * (1 - t) + 4);
      const glow = still
        ? 0.5
        : 0.5 + 0.5 * Math.sin(beat(0, RUNE_SECONDS, seconds, still) * Math.PI * 2);
      paintObelisk(painter, art.centroid, line, glow);
      break;
    }
  }
}

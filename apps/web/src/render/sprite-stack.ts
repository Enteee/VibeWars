/**
 * Sprite stacking, the #3977 spike (epic #3974), not for merge: a body or
 * a prop as thin horizontal slices generated from our own geometry, each
 * drawn `STACK_STEP` px above the last and turned with the heading, so the
 * top-down view shows volume and a turning silhouette. Toggled by `?stack`.
 */
import type { Painter } from "./body-painter.js";
import { multiplyColour, scaleColour } from "./lighting-model.js";
import type { Point } from "./weapon-mark-geometry.js";

/** Whether the page asked for stacked bodies and props: `?stack`. */
export function stackingAsked(search: string): boolean {
  return new URLSearchParams(search).has("stack");
}

/** How far up the screen each slice sits above the last, in px. */
export const STACK_STEP = 1.5;

/** One slice of a stack: an outline in the object's own frame, and how lit it is. */
export interface Slice {
  /** Forward is +x, the object's left is −y; units of the body radius. */
  readonly parts: readonly (readonly Point[])[];
  /** 0 the darkest (the ground), 1 the full colour. */
  readonly light: number;
  /** Which colour the slice takes: the team's, or the shared dark/skin tones. */
  readonly tone: "team" | "dark" | "skin" | "wood" | "band";
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 14): readonly Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

const rect = (hx: number, hy: number): readonly Point[] => [
  { x: -hx, y: -hy },
  { x: hx, y: -hy },
  { x: hx, y: hy },
  { x: -hx, y: hy },
];

/**
 * A standing body, bottom up: two feet, the robe flaring then narrowing,
 * the shoulders (wide across the heading), the head with a nose toward it.
 * `stride` in [-1, 1] swings the feet and robe hem for the walk; `lean`
 * in [0, 1] pushes the upper body forward for a cast.
 */
export function bodySlices(stride = 0, lean = 0): readonly Slice[] {
  const slices: Slice[] = [];
  const foot = 0.32 * stride;
  // Feet: two dark ovals, swung forward and back by the stride.
  for (let i = 0; i < 2; i++) {
    slices.push({
      parts: [ellipse(foot, -0.38, 0.26, 0.17, 8), ellipse(-foot, 0.38, 0.26, 0.17, 8)],
      light: 0.35,
      tone: "dark",
    });
  }
  // Robe: wide at the hem, narrowing to the waist.
  const robe = [0.92, 0.9, 0.86, 0.8, 0.74];
  robe.forEach((r, i) => {
    const shift = 0.08 * stride * (1 - i / robe.length) + 0.05 * lean * i;
    slices.push({
      parts: [ellipse(shift, 0, r * 0.9, r, 16)],
      light: 0.55 + 0.07 * i,
      tone: "team",
    });
  });
  // Belt.
  slices.push({ parts: [ellipse(0.25 * lean, 0, 0.66, 0.72, 16)], light: 0.9, tone: "band" });
  // Torso to shoulders: wide across the heading.
  const torso = [0.72, 0.78, 0.84];
  torso.forEach((r, i) => {
    slices.push({
      parts: [ellipse(0.3 * lean + 0.03 * i, 0, r * 0.62, r, 16)],
      light: 0.85 + 0.05 * i,
      tone: "team",
    });
  });
  // Head: skin, a nose toward the heading so the turn reads.
  const head = [0.36, 0.4, 0.38, 0.3];
  head.forEach((r, i) => {
    const forward = 0.18 + 0.36 * lean;
    const nose = i === 1 || i === 2 ? [{ x: forward + r + 0.22, y: 0 }] : [];
    const disc = ellipse(forward, 0, r, r, 12);
    slices.push({
      parts: [nose.length === 0 ? disc : [...nose, ...disc.slice(1)]],
      light: 0.8 + 0.06 * i,
      tone: "skin",
    });
  });
  return slices;
}

/** A crate prop: a dark base, plank sides, a banded top. */
export function crateSlices(): readonly Slice[] {
  const slices: Slice[] = [];
  for (let i = 0; i < 14; i++) {
    const band = i === 1 || i === 7 || i === 12;
    slices.push({ parts: [rect(0.9, 0.9)], light: 0.45 + 0.04 * i, tone: band ? "dark" : "wood" });
  }
  return slices;
}

/** The fixed tones a slice may take beside the team's colour. */
const TONES = { dark: 0x2a2420, skin: 0xd9a77f, wood: 0x8a6136, band: 0xc9b27a } as const;

/** A stacked object to draw: where it stands, how big, which way it faces. */
export interface Stacked {
  readonly x: number;
  readonly y: number;
  /** The radius the outlines are in units of, in world px. */
  readonly r: number;
  readonly facing: number;
  readonly colour: number;
  /** The light at its feet (ADR-0052); `undefined` draws it unlit. */
  readonly tint: number | undefined;
  readonly edge: number;
}

/**
 * Draws `slices` bottom up, each turned by the facing and lifted
 * `STACK_STEP` px, darker low and full colour high, with the top slice's
 * edge stroked so the silhouette holds on any ground.
 */
export function paintStack(painter: Painter, at: Stacked, slices: readonly Slice[]): void {
  const cos = Math.cos(at.facing);
  const sin = Math.sin(at.facing);
  // The footprint the collision radius covers, as a ground shadow.
  painter.fillStyle(0x000000, 0.35);
  painter.fillCircle(at.x, at.y, at.r);
  slices.forEach((slice, i) => {
    const lift = i * STACK_STEP;
    const base = slice.tone === "team" ? at.colour : TONES[slice.tone];
    const lit = scaleColour(base, slice.light);
    painter.fillStyle(at.tint === undefined ? lit : multiplyColour(lit, at.tint), 1);
    for (const part of slice.parts) {
      const points = part.map((p) => ({
        x: at.x + (p.x * cos - p.y * sin) * at.r,
        y: at.y + (p.x * sin + p.y * cos) * at.r - lift,
      }));
      painter.fillPoints(points);
      if (i === slices.length - 1) {
        painter.lineStyle(1, at.edge, 0.8);
        painter.beginPath();
        points.forEach((p, j) => (j === 0 ? painter.moveTo(p.x, p.y) : painter.lineTo(p.x, p.y)));
        painter.lineTo(points[0]?.x ?? at.x, points[0]?.y ?? at.y);
        painter.strokePath();
      }
    }
  });
}

/** How high a stack stands on screen, in px. */
export const stackHeight = (slices: readonly Slice[]): number => slices.length * STACK_STEP;

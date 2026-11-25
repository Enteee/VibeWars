import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createRng, seedFromString } from "@vibewars/game-core";

import { pointInShape } from "../geometry.js";
import {
  ANIMATED_DECOR_KINDS,
  DECOR_KINDS,
  MAX_ANIMATED_DECOR,
  MAX_DECOR,
  decorRefusal,
  mapDataSchema,
  type Decor,
  type DecorKind,
  type MapData,
  type Shape,
} from "../schema.js";

/**
 * The decor scatter tool (#4013): drops `count` props of one kind at
 * seeded random spots inside an area of a map, each one a spot the map
 * schema accepts. The same map, request and seed always give the same
 * props, so a rerun is a no-op diff; hand edits to the output stay valid.
 *
 *   pnpm decor:scatter <map> <kind> <area> <count> --seed <n> [--layer <n>]
 *
 * `<area>` is a rect `x,y,width,height` or a polygon `x1,y1;x2,y2;x3,y3;…`.
 */

/** What to scatter. */
export interface ScatterRequest {
  readonly kind: DecorKind;
  readonly area: Shape;
  readonly count: number;
  readonly layer: number;
  readonly seed: number;
}

/** How near two props may stand, centre to centre, so they never overlap. */
export const DECOR_SPACING = 48;

/** Random spots tried per prop asked for before the tool gives up on the rest. */
const TRIES_PER_PROP = 200;

/** The bounding box of an area. */
function boxOf(area: Shape): { x: number; y: number; width: number; height: number } {
  if (area.kind === "rect") {
    return area;
  }
  const xs = area.points.map((point) => point.x);
  const ys = area.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The lowest `<kind>-<n>` id the map does not use yet. */
function freshId(kind: DecorKind, taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`${kind}-${String(n)}`)) {
    n += 1;
  }
  return `${kind}-${String(n)}`;
}

/**
 * The map with up to `request.count` new props of `request.kind`, each at
 * a spot inside `request.area` that the map schema accepts and at least
 * `DECOR_SPACING` from every other prop. Fewer when the area runs out of
 * such spots, or the map out of room under its caps.
 */
export function scatterDecor(map: MapData, request: ScatterRequest): MapData {
  const rng = createRng(request.seed);
  const box = boxOf(request.area);
  const decor: Decor[] = [...map.decor];
  const taken = new Set(decor.map((prop) => prop.id));
  const animated = ANIMATED_DECOR_KINDS.includes(request.kind);
  const room = (): boolean =>
    decor.length < MAX_DECOR &&
    (!animated ||
      decor.filter((prop) => ANIMATED_DECOR_KINDS.includes(prop.kind)).length < MAX_ANIMATED_DECOR);
  let placed = 0;
  for (let tries = 0; placed < request.count && tries < request.count * TRIES_PER_PROP; tries++) {
    const at = {
      x: Math.round(box.x + rng.nextFloat() * box.width),
      y: Math.round(box.y + rng.nextFloat() * box.height),
    };
    const rotation = Math.floor(rng.nextFloat() * 360);
    const scale = Math.round((0.75 + rng.nextFloat() * 0.5) * 100) / 100;
    const variant = Math.floor(rng.nextFloat() * 4);
    if (!room()) {
      break;
    }
    const spot = { at, layer: request.layer, kind: request.kind };
    if (!pointInShape(at, request.area) || decorRefusal(map, spot) !== undefined) {
      continue;
    }
    const crowded = decor.some(
      (prop) =>
        prop.layer === request.layer &&
        Math.hypot(prop.at.x - at.x, prop.at.y - at.y) < DECOR_SPACING,
    );
    if (crowded) {
      continue;
    }
    const prop: Decor = {
      id: freshId(request.kind, taken),
      kind: request.kind,
      at,
      layer: request.layer,
      rotation,
      scale,
      variant,
    };
    decor.push(prop);
    taken.add(prop.id);
    placed += 1;
  }
  return { ...map, decor };
}

/** An area from the command line: `x,y,width,height` or `x1,y1;x2,y2;…`. */
export function parseArea(text: string): Shape {
  const numbers = (part: string): number[] => part.split(",").map(Number);
  if (text.includes(";")) {
    const points = text.split(";").map((pair) => {
      const [x, y] = numbers(pair);
      if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`not a point: ${pair}`);
      }
      return { x, y };
    });
    if (points.length < 3) {
      throw new Error("a polygon needs at least 3 points");
    }
    return { kind: "polygon", points };
  }
  const [x, y, width, height] = numbers(text);
  if ([x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))) {
    throw new Error(`not a rect x,y,width,height: ${text}`);
  }
  return { kind: "rect", x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 };
}

/** Where a map's `map.json` lives, whichever of the package's map folders it is in. */
function mapFile(mapId: string): string {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const found = ["maps", "training", "tutorial"]
    .map((folder) => resolve(root, folder, mapId, "map.json"))
    .find((file) => existsSync(file));
  if (found === undefined) {
    throw new Error(`no map named ${mapId}`);
  }
  return found;
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function main(args: string[]): void {
  const [mapId, kind, area, count] = args;
  const seed = flag(args, "--seed");
  if (mapId === undefined || area === undefined || count === undefined || seed === undefined) {
    throw new Error("usage: decor:scatter <map> <kind> <area> <count> --seed <n> [--layer <n>]");
  }
  const known = DECOR_KINDS.find((candidate) => candidate === kind);
  if (known === undefined) {
    throw new Error(`kind must be one of ${DECOR_KINDS.join(", ")}`);
  }
  const file = mapFile(mapId);
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const map = mapDataSchema.parse(raw);
  const layer = Number(flag(args, "--layer") ?? map.groundLayer);
  const asked = Number(count);
  const out = scatterDecor(map, {
    kind: known,
    area: parseArea(area),
    count: asked,
    layer,
    seed: Number.isInteger(Number(seed)) ? Number(seed) : seedFromString(seed),
  });
  const added = out.decor.slice(map.decor.length);
  // Only `decor` changes: the rest of the file keeps its own shape and order.
  const json = typeof raw === "object" && raw !== null ? { ...raw, decor: out.decor } : out;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(
    `${mapId}: ${String(added.length)} of ${String(asked)} ${known} placed; run pnpm format`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}

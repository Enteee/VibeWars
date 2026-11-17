/**
 * Each band's static art baked into cached chunk images (#3522, ADR-0054).
 * A layered map draws its floor, grain, pavings, walls and decks as
 * dozens of full-screen-ish passes, every frame; on a software renderer
 * the pixels of every pass are filled again. Baked, a frame blends one
 * image per chunk for each run of static objects instead.
 *
 * This module is the plan, with no Phaser: which objects bake together,
 * which chunks a view wants, which to bake this frame and which to drop.
 * `band-bake.ts` does the drawing.
 */

import { CHARACTER_BANDS, type RenderItem, renderOrder } from "./render-order.js";

/** An axis-aligned box in world units. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One object of the scene's display list, in the order Phaser draws it. */
export interface BakeEntry {
  readonly depth: number;
  /** Drawn once and shown unchanged until the map is drawn again. */
  readonly bakeable: boolean;
  /** A stencil object: writes the stencil, or clears it again. */
  readonly stencil?: "write" | "clear";
}

/** A run of entries baked into one image per chunk, `first` to `last` inclusive. */
export interface BakeRun {
  readonly first: number;
  readonly last: number;
}

/**
 * The kinds drawn live that come and go, or move, after the map is drawn:
 * a run never spans one of their depths, so whatever appears there later
 * still draws between the same static art as it would unbaked.
 */
function liveItems(layer: number, band: number): readonly RenderItem[] {
  return [
    { kind: "ground-effect", layer },
    { kind: "zone", layer, part: "ground" },
    { kind: "zone", layer, part: "marks" },
    { kind: "fog", layer },
    { kind: "plume", band },
    { kind: "lighting", layer },
    { kind: "lit-ground-effect" },
    { kind: "goal-mark", layer },
    { kind: "character", band, part: "body" },
    { kind: "character", band, part: "glyph" },
    { kind: "character", band, part: "marks" },
    { kind: "character", band, part: "bar" },
    { kind: "wall-top", layer },
    { kind: "breakable", layer },
    { kind: "water", layer, part: "ripples" },
    { kind: "tunnel-cover", deckLayer: layer },
    { kind: "tunnel-grain", deckLayer: layer, part: "grain" },
    { kind: "tunnel-grain", deckLayer: layer, part: "lines" },
    { kind: "tunnel-seam", deckLayer: layer },
    { kind: "overhang", layer },
    { kind: "lift", upperLayer: layer },
    { kind: "weather" },
  ];
}

/** Every depth a live kind can take on a map of `layerCount` layers, sorted. */
export function liveDepths(layerCount: number): readonly number[] {
  const depths = new Set<number>();
  const top = Math.max(layerCount, CHARACTER_BANDS);
  for (let layer = 0; layer <= top; layer += 1) {
    for (const item of liveItems(layer, layer)) {
      depths.add(renderOrder(item));
    }
  }
  return [...depths].sort((a, b) => a - b);
}

/** Whether a live depth in `sorted` lies in `[low, high]`. */
function liveWithin(sorted: readonly number[], low: number, high: number): boolean {
  return sorted.some((depth) => depth >= low && depth <= high);
}

/**
 * The runs of `entries`, sorted as Phaser draws them: each a stretch of
 * bakeable entries with nothing live between them, and no live depth in
 * `live` from its first entry's depth to its last's. An entry sitting
 * on a live depth is drawn live: what comes there later would sort
 * among it. A run whose stencil writes and clears do not pair up is
 * drawn live too, so the stencil never leaks into a bake or out of one.
 */
export function planRuns(entries: readonly BakeEntry[], live: readonly number[]): BakeRun[] {
  const runs: BakeRun[] = [];
  let first = -1;
  const close = (last: number): void => {
    if (first >= 0 && balanced(entries, first, last)) {
      runs.push({ first, last });
    }
    first = -1;
  };
  entries.forEach((entry, at) => {
    const onLive = liveWithin(live, entry.depth, entry.depth);
    if (!entry.bakeable || onLive) {
      close(at - 1);
      return;
    }
    const start = entries[first];
    if (start !== undefined && liveWithin(live, start.depth, entry.depth)) {
      close(at - 1);
    }
    if (first < 0) {
      first = at;
    }
  });
  close(entries.length - 1);
  return runs;
}

function balanced(entries: readonly BakeEntry[], first: number, last: number): boolean {
  let open = 0;
  for (let at = first; at <= last; at += 1) {
    const stencil = entries[at]?.stencil;
    if (stencil === "write") {
      open += 1;
    } else if (stencil === "clear") {
      if (open === 0) {
        return false;
      }
      open = 0;
    }
  }
  return open === 0;
}

/**
 * A chunk's side in texture pixels. A chunk is square in world units,
 * this many pixels at the zoom it was baked at: 512 px is 1 MB a
 * texture, and a 1920 × 1080 view spans at most 5 × 4 of them.
 */
export const CHUNK_PIXELS = 512;

/** Bytes of one chunk's texture: RGBA, 8 bits a channel. */
export const CHUNK_BYTES = CHUNK_PIXELS * CHUNK_PIXELS * 4;

/**
 * The most chunk textures kept, in bytes. A 1920 × 1080 view of a
 * three-layer map wants about 40 chunks with their margin; past this the
 * least recently shown are dropped, and rebaked when they come back.
 */
export const TEXTURE_BUDGET_BYTES = 64 * 1024 * 1024;

/**
 * At most this many chunks are baked a frame: a camera jump spreads the
 * cost over a few frames, the art drawn live until its chunks are ready.
 */
export const BAKES_PER_FRAME = 4;

/** A chunk's side in world units at `zoom`. */
export function chunkSize(zoom: number): number {
  return CHUNK_PIXELS / zoom;
}

/** A chunk of the grid, by column and row. */
export interface Chunk {
  readonly column: number;
  readonly row: number;
}

/** `chunk`'s key, for maps and sets. */
export function chunkKey({ column, row }: Chunk): string {
  return `${String(column)},${String(row)}`;
}

/** What `chunk` covers, in world units. */
export function chunkBox({ column, row }: Chunk, size: number): Box {
  return {
    left: column * size,
    top: row * size,
    right: (column + 1) * size,
    bottom: (row + 1) * size,
  };
}

/** The chunks `box` touches. */
export function chunksOver(box: Box, size: number): Chunk[] {
  const chunks: Chunk[] = [];
  const top = Math.floor(box.top / size);
  const bottom = Math.ceil(box.bottom / size);
  const left = Math.floor(box.left / size);
  const right = Math.ceil(box.right / size);
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      chunks.push({ column, row });
    }
  }
  return chunks;
}

/**
 * The chunks to have baked for `view`: those it shows, then a margin of
 * half a chunk around it, the nearest to its centre first, so a camera
 * walking on finds the next ones ready.
 */
export function wantedChunks(view: Box, size: number): { shown: Chunk[]; margin: Chunk[] } {
  const shown = chunksOver(view, size);
  const seen = new Set(shown.map(chunkKey));
  const half = size / 2;
  const centreX = (view.left + view.right) / 2;
  const centreY = (view.top + view.bottom) / 2;
  const away = (chunk: Chunk): number => {
    const box = chunkBox(chunk, size);
    return Math.hypot((box.left + box.right) / 2 - centreX, (box.top + box.bottom) / 2 - centreY);
  };
  const margin = chunksOver(
    {
      left: view.left - half,
      top: view.top - half,
      right: view.right + half,
      bottom: view.bottom + half,
    },
    size,
  )
    .filter((chunk) => !seen.has(chunkKey(chunk)))
    .sort((a, b) => away(a) - away(b));
  return { shown, margin };
}

/** Whether two boxes overlap. */
export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Baked chunk textures, the least recently shown first out. `touch`
 * each one a frame shows; `admit` a new one and get back what the budget
 * pushes out.
 */
export class ChunkLru<T> {
  private readonly entries = new Map<string, T>();

  private readonly capacity: number;

  public constructor(capacity: number) {
    this.capacity = capacity;
  }

  public get size(): number {
    return this.entries.size;
  }

  public get(key: string): T | undefined {
    return this.entries.get(key);
  }

  public has(key: string): boolean {
    return this.entries.has(key);
  }

  public values(): IterableIterator<T> {
    return this.entries.values();
  }

  /** Mark `key` as just shown. */
  public touch(key: string): void {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
  }

  /** Keep `value` under `key`, newest; returns what falls out past the capacity. */
  public admit(key: string, value: T): T[] {
    this.entries.delete(key);
    this.entries.set(key, value);
    const evicted: T[] = [];
    for (const [old, kept] of this.entries) {
      if (this.entries.size <= this.capacity) {
        break;
      }
      this.entries.delete(old);
      evicted.push(kept);
    }
    return evicted;
  }

  /** Every value, and forget them. */
  public drain(): T[] {
    const values = [...this.entries.values()];
    this.entries.clear();
    return values;
  }
}

/** How many chunk textures `TEXTURE_BUDGET_BYTES` holds. */
export const CHUNK_CAPACITY = Math.floor(TEXTURE_BUDGET_BYTES / CHUNK_BYTES);

/**
 * What to bake this frame: the shown chunks not yet baked, then the
 * margin's, at most `cap` of them.
 */
export function bakesDue<T>(wanted: readonly T[], baked: (item: T) => boolean, cap: number): T[] {
  const due: T[] = [];
  for (const item of wanted) {
    if (due.length >= cap) {
      break;
    }
    if (!baked(item)) {
      due.push(item);
    }
  }
  return due;
}

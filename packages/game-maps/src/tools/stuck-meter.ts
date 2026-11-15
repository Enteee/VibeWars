/**
 * The stuck measure of the balance bench (#3354): how long bots stand still
 * in reach of nothing, and where. A bot is stuck when, over a sliding window,
 * it moved little, took part in no damage or heal, and started no skill, while
 * a foe was alive. Pure: it is fed one sample per bot per tick.
 */

/** Seconds of standing still that make a bot stuck. */
export const STUCK_WINDOW_SECONDS = 5;
/** The farthest a stuck bot got from where the window started. */
export const STUCK_RADIUS = 64;
/** The side of the cells stuck seconds are binned in. */
export const STUCK_CELL = 64;

export interface StuckSample {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  /** Alive, with at least one foe alive: only then does time count. */
  readonly counts: boolean;
  /** Source or target of a damage or heal, or the source of any log entry, this tick. */
  readonly active: boolean;
  /** The layer of the nearest living foe, in a straight line; `undefined` if none. */
  readonly nearestFoeLayer: number | undefined;
}

export interface StuckCell {
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  readonly seconds: number;
}

export interface StuckTotals {
  /** Seconds bots were alive with a foe alive. */
  readonly livingSeconds: number;
  readonly stuckSeconds: number;
  /** Stuck seconds when the nearest foe was on another layer. */
  readonly apartSeconds: number;
  readonly cells: ReadonlyMap<string, number>;
}

interface Window {
  readonly xs: number[];
  readonly ys: number[];
  /** Ticks in the window with activity. */
  active: number;
  readonly activity: boolean[];
}

export class StuckMeter {
  readonly #windowTicks: number;
  readonly #dt: number;
  readonly #windows = new Map<string, Window>();
  #living = 0;
  #stuck = 0;
  #apart = 0;
  readonly #cells = new Map<string, number>();

  constructor(tickRateHz: number) {
    this.#dt = 1 / tickRateHz;
    this.#windowTicks = Math.round(STUCK_WINDOW_SECONDS * tickRateHz);
  }

  /** One tick of every bot. A bot that does not count loses its window. */
  feed(samples: readonly StuckSample[]): void {
    for (const sample of samples) {
      if (!sample.counts) {
        this.#windows.delete(sample.id);
        continue;
      }
      this.#living += this.#dt;
      let window = this.#windows.get(sample.id);
      if (window === undefined) {
        window = { xs: [], ys: [], active: 0, activity: [] };
        this.#windows.set(sample.id, window);
      }
      window.xs.push(sample.x);
      window.ys.push(sample.y);
      window.activity.push(sample.active);
      if (sample.active) window.active += 1;
      if (window.xs.length > this.#windowTicks) {
        window.xs.shift();
        window.ys.shift();
        if (window.activity.shift() === true) window.active -= 1;
      }
      if (window.xs.length < this.#windowTicks || window.active > 0) continue;
      const x0 = window.xs[0] ?? sample.x;
      const y0 = window.ys[0] ?? sample.y;
      const moved = window.xs.some(
        (x, i) => Math.hypot(x - x0, (window.ys[i] ?? y0) - y0) >= STUCK_RADIUS,
      );
      if (moved) continue;
      this.#stuck += this.#dt;
      if (sample.nearestFoeLayer !== undefined && sample.nearestFoeLayer !== sample.layer) {
        this.#apart += this.#dt;
      }
      const key = `${String(Math.floor(sample.x / STUCK_CELL))},${String(Math.floor(sample.y / STUCK_CELL))}@${String(sample.layer)}`;
      this.#cells.set(key, (this.#cells.get(key) ?? 0) + this.#dt);
    }
  }

  totals(): StuckTotals {
    return {
      livingSeconds: this.#living,
      stuckSeconds: this.#stuck,
      apartSeconds: this.#apart,
      cells: this.#cells,
    };
  }
}

/** The `count` cells with the most stuck seconds, summed over `all`, as the bench prints them. */
export function topStuckCells(
  all: readonly ReadonlyMap<string, number>[],
  count: number,
): StuckCell[] {
  const sum = new Map<string, number>();
  for (const cells of all) {
    for (const [key, seconds] of cells) sum.set(key, (sum.get(key) ?? 0) + seconds);
  }
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([key, seconds]) => {
      const [xy = "", layer = "0"] = key.split("@");
      const [cx = "0", cy = "0"] = xy.split(",");
      return {
        x: Number(cx) * STUCK_CELL,
        y: Number(cy) * STUCK_CELL,
        layer: Number(layer),
        seconds,
      };
    });
}

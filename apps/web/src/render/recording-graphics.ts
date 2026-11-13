import type { Vec2 } from "@vibewars/game-core";

/**
 * A stand-in for Phaser's Graphics that keeps every filled polygon it is
 * asked to paint, in world space, for the visibility gate (#3251). Every
 * other call is taken and ignored. Test code only.
 */

/** A polygon filled, with the alpha it was filled at. */
export interface RecordedFill {
  readonly polygon: readonly Vec2[];
  readonly alpha: number;
}

/** How many points a circle or an ellipse is recorded as. */
const ROUND = 24;

/** A 2D affine transform, as the canvas keeps one: x' = a x + c y + e, y' = b x + d y + f. */
type Transform = readonly [number, number, number, number, number, number];

const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

function then(t: Transform, next: Transform): Transform {
  const [a, b, c, d, e, f] = t;
  const [na, nb, nc, nd, ne, nf] = next;
  return [
    a * na + c * nb,
    b * na + d * nb,
    a * nc + c * nd,
    b * nc + d * nd,
    a * ne + c * nf + e,
    b * ne + d * nf + f,
  ];
}

function ellipse(x: number, y: number, rx: number, ry: number): Vec2[] {
  return Array.from({ length: ROUND }, (_, k) => ({
    x: x + rx * Math.cos((k * 2 * Math.PI) / ROUND),
    y: y + ry * Math.sin((k * 2 * Math.PI) / ROUND),
  }));
}

export class RecordingGraphics {
  public depth = 0;
  /** What drew into it, set by whoever hands it out. */
  public what = "";
  public readonly fills: RecordedFill[] = [];
  private transform: Transform = IDENTITY;
  private readonly saved: Transform[] = [];
  private alpha = 1;
  private paths: Vec2[][] = [];

  public setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  public clear(): this {
    this.fills.length = 0;
    this.paths = [];
    this.transform = IDENTITY;
    this.saved.length = 0;
    return this;
  }

  public save(): this {
    this.saved.push(this.transform);
    return this;
  }

  public restore(): this {
    this.transform = this.saved.pop() ?? IDENTITY;
    return this;
  }

  public translateCanvas(x: number, y: number): this {
    this.transform = then(this.transform, [1, 0, 0, 1, x, y]);
    return this;
  }

  public scaleCanvas(x: number, y: number): this {
    this.transform = then(this.transform, [x, 0, 0, y, 0, 0]);
    return this;
  }

  public rotateCanvas(radians: number): this {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.transform = then(this.transform, [cos, sin, -sin, cos, 0, 0]);
    return this;
  }

  public fillStyle(_colour: number, alpha = 1): this {
    this.alpha = alpha;
    return this;
  }

  public fillPoints(points: readonly Vec2[]): this {
    this.record(points);
    return this;
  }

  public fillRect(x: number, y: number, width: number, height: number): this {
    this.record([
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]);
    return this;
  }

  public fillRoundedRect(x: number, y: number, width: number, height: number): this {
    return this.fillRect(x, y, width, height);
  }

  public fillTriangle(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): this {
    this.record([
      { x: x0, y: y0 },
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ]);
    return this;
  }

  public fillCircle(x: number, y: number, radius: number): this {
    this.record(ellipse(x, y, radius, radius));
    return this;
  }

  public fillEllipse(x: number, y: number, width: number, height: number): this {
    this.record(ellipse(x, y, width / 2, height / 2));
    return this;
  }

  public beginPath(): this {
    this.paths = [];
    return this;
  }

  public moveTo(x: number, y: number): this {
    this.paths.push([this.at(x, y)]);
    return this;
  }

  public lineTo(x: number, y: number): this {
    const path = this.paths.at(-1);
    if (path === undefined) {
      this.paths.push([this.at(x, y)]);
    } else {
      path.push(this.at(x, y));
    }
    return this;
  }

  public arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    anticlockwise = false,
  ): this {
    let sweep = endAngle - startAngle;
    if (anticlockwise && sweep > 0) {
      sweep -= 2 * Math.PI;
    } else if (!anticlockwise && sweep < 0) {
      sweep += 2 * Math.PI;
    }
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * ROUND));
    for (let k = 0; k <= steps; k += 1) {
      const angle = startAngle + (sweep * k) / steps;
      this.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
    return this;
  }

  public fillPath(): this {
    for (const path of this.paths) {
      this.fills.push({ polygon: path, alpha: this.alpha });
    }
    return this;
  }

  private at(x: number, y: number): Vec2 {
    const [a, b, c, d, e, f] = this.transform;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }

  private record(points: readonly Vec2[]): void {
    this.fills.push({ polygon: points.map(({ x, y }) => this.at(x, y)), alpha: this.alpha });
  }
}

/**
 * A `RecordingGraphics` that takes any other Graphics call too, as a
 * no-op that chains, so the scene's painters run on it unchanged.
 */
export function recordingGraphics(): RecordingGraphics {
  const target = new RecordingGraphics();
  const proxy: RecordingGraphics = new Proxy(target, {
    get(object, key, receiver): unknown {
      if (key in object) {
        const value: unknown = Reflect.get(object, key, receiver);
        return typeof value === "function" ? value.bind(proxy) : value;
      }
      return () => proxy;
    },
  });
  return proxy;
}

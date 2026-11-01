import { AREA_EARSHOT, RANGE_COMPASS, RANGE_SPELL, type Vec2 } from "@vibewars/game-core";
import { PING_SECONDS } from "@vibewars/game-session";

import { type ArenaSnapshot, type RenderableWall } from "../render/arena-snapshot.js";
import { setHidden } from "./dom-write.js";
import { prefersReducedMotion } from "./recharge-overlay.js";

/**
 * The compass (#486, GW1's radar): a disc top right, centred on you, north
 * up, with every living body within its reach (`compassReach`), your
 * target, the called foe, your team's pings, the resurrection shrines
 * (#1199), a Guild Battle's lords, flags and stand (#1226), a Relic Run's
 * altar (#1388), Capture Points' shrines (#1407), the earshot and cast-range rings and the walls
 * (docs/art/art-direction.md "Compass"). Bodies beyond it are not shown:
 * the edge markers (#440) give direction, the compass distance.
 */

/** The compass's content in its own px, centre (0,0), y down, north up (#486). */
export interface CompassView {
  /** px per world unit: `(sizePx / 2) / reach`. */
  readonly scale: number;
  readonly rings: readonly { readonly radius: number; readonly kind: "earshot" | "cast" }[];
  readonly dots: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly kind: "self" | "friend" | "foe";
    readonly targeted: boolean;
    readonly called: boolean;
    /** A creature (#1052): a smaller dot, so it never reads as a player. */
    readonly small: boolean;
  }[];
  /** `age`: 0 when pinged, 1 when it goes. */
  readonly pings: readonly { readonly x: number; readonly y: number; readonly age: number }[];
  /** Each team's resurrection shrine in reach (#1199), whether its priest stands or not. */
  readonly shrines: readonly {
    readonly x: number;
    readonly y: number;
    readonly side: "ally" | "enemy";
  }[];
  /**
   * Each Capture Points shrine in reach (#1407), a `□` in its owner's
   * colour, `undefined` owned by nobody. Its progress is the arena's to show.
   */
  readonly capturePoints: readonly {
    readonly x: number;
    readonly y: number;
    readonly owner: "ally" | "enemy" | undefined;
  }[];
  /** Each living Guild Lord in reach (#1226), a `♛` over its dot. */
  readonly lords: readonly CompassMark[];
  /** Each flag in reach where it is (#1226), on its carrier while carried. */
  readonly flags: readonly CompassMark[];
  /** The flag stand in reach (#1226), its holder's side, `undefined` held by nobody. */
  readonly stand:
    | { readonly x: number; readonly y: number; readonly holder: "ally" | "enemy" | undefined }
    | undefined;
  /** A Relic Run or King of the Hill altar in reach (#1388, #1377), a `◆`. */
  readonly altar: Vec2 | undefined;
  /** Wall outlines, already clipped to the disc. */
  readonly walls: readonly (readonly Vec2[])[];
}

/** A marker of one side on the compass (#1226). */
export interface CompassMark {
  readonly x: number;
  readonly y: number;
  readonly side: "ally" | "enemy";
}

/** A wall's closed outline, corner by corner. */
function outline(wall: RenderableWall): readonly Vec2[] {
  if (wall.kind === "polygon") {
    return wall.points;
  }
  const { x, y, width, height } = wall;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * The part of segment `a`-`b` inside the circle of `radius` round the
 * origin, as the fractions along it where it enters and leaves;
 * `undefined` if none of it is.
 */
function clipSegment(a: Vec2, b: Vec2, radius: number): readonly [number, number] | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (a.x * dx + a.y * dy);
  const qc = a.x * a.x + a.y * a.y - radius * radius;
  if (qa === 0) {
    return qc <= 0 ? [0, 1] : undefined;
  }
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant <= 0) {
    return undefined;
  }
  const root = Math.sqrt(discriminant);
  const enter = Math.max(0, (-qb - root) / (2 * qa));
  const leave = Math.min(1, (-qb + root) / (2 * qa));
  return enter < leave ? [enter, leave] : undefined;
}

/**
 * `points`' closed outline clipped to the disc of `radius`: the runs of it
 * inside, each an open line. A wall wholly outside gives none.
 */
function clipOutline(points: readonly Vec2[], radius: number): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] | undefined;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length] ?? a;
    const clipped = clipSegment(a, b, radius);
    if (clipped === undefined) {
      run = undefined;
      return;
    }
    const [enter, leave] = clipped;
    const at = (t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (run === undefined || enter > 0) {
      run = [at(enter)];
      runs.push(run);
    }
    run.push(at(leave));
    if (leave < 1) {
      run = undefined;
    }
  });
  // An outline wholly inside closes on its first corner, which also opened
  // its first run: one line, not two.
  const first = runs[0];
  const last = runs.at(-1);
  if (runs.length > 1 && first !== undefined && last !== undefined && run === last) {
    runs.pop();
    first.unshift(...last.slice(0, -1));
  }
  return runs;
}

/**
 * How far the compass reaches on a `width` × `height` arena: its longer
 * side, never past `RANGE_COMPASS`, so a small arena fills the disc.
 */
export function compassReach(map: { readonly width: number; readonly height: number }): number {
  return Math.min(RANGE_COMPASS, Math.max(map.width, map.height));
}

/** `undefined`: no self actor (a spectator), so no compass. */
export function compassView(
  arena: ArenaSnapshot,
  selfId: string,
  sizePx: number,
  reach: number,
): CompassView | undefined {
  const self = arena.actors.find((actor) => actor.id === selfId);
  if (self === undefined) {
    return undefined;
  }
  const scale = sizePx / 2 / reach;
  const local = (point: Vec2): Vec2 => ({
    x: (point.x - self.position.x) * scale,
    y: (point.y - self.position.y) * scale,
  });
  const within = (point: Vec2): boolean =>
    Math.hypot(point.x - self.position.x, point.y - self.position.y) <= reach;
  return {
    scale,
    rings: [
      { radius: AREA_EARSHOT * scale, kind: "earshot" },
      { radius: RANGE_SPELL * scale, kind: "cast" },
    ],
    // You are always at the centre, dead or not; everyone else only alive.
    dots: arena.actors
      .filter((actor) => actor === self || (!actor.dead && within(actor.position)))
      .map((actor) => ({
        id: actor.id,
        ...local(actor.position),
        kind: actor === self ? "self" : actor.team === "enemy" ? "foe" : "friend",
        targeted: actor.id === arena.targetId,
        called: actor.id === arena.calledId,
        // Any creature, whatever radius its kind is drawn at (#2047).
        small: actor.creatureLook !== undefined,
      })),
    pings: arena.pings
      .filter((ping) => within(ping.position))
      .map((ping) => ({
        ...local(ping.position),
        age: Math.max(0, Math.min(1, 1 - ping.remaining / PING_SECONDS)),
      })),
    shrines: arena.shrines
      .filter((shrine) => within(shrine.position))
      .map((shrine) => ({ ...local(shrine.position), side: shrine.side })),
    capturePoints: arena.capturePoints
      .filter((point) => within(point.position))
      .map((point) => ({ ...local(point.position), owner: point.owner })),
    lords: arena.actors
      .filter(
        (actor) => actor.creatureLook === "guild-lord" && !actor.dead && within(actor.position),
      )
      .map((actor) => ({
        ...local(actor.position),
        side: actor.team === "enemy" ? "enemy" : "ally",
      })),
    flags: arena.flags
      .filter((flag) => within(flag.position))
      .map((flag) => ({ ...local(flag.position), side: flag.side })),
    stand:
      arena.stand === undefined || !within(arena.stand.position)
        ? undefined
        : { ...local(arena.stand.position), holder: arena.stand.holder },
    altar: arena.altar === undefined || !within(arena.altar) ? undefined : local(arena.altar),
    walls: arena.walls.flatMap((wall) => clipOutline(outline(wall).map(local), sizePx / 2)),
  };
}

/** The palette's, as the arena draws them (docs/art/art-direction.md). */
const FRIEND = "#59c2ff";
const FOE = "#ff7b72";
const TARGET = "#ffd866";
const CALL = "#ffa657";
const INK = "#d7dee8";
const INK_DIM = "#7d8899";
const WALL_STROKE = "#3b4759";
const EDGE = "#0b0f14";
const DOT_RADIUS = 3;
const SMALL_DOT_RADIUS = 2;
/** Half a shrine's `✚`, px. */
const SHRINE_ARM = 4;
/** Half a capture shrine's `□`, px (#1407): wider than a `✚` on the same spot. */
const CAPTURE_HALF_PX = 6;
/** The stand's `◎`, px: its ring and its centre. */
const STAND_RING = 5;
const STAND_DOT = 1.5;
/** Half the altar's `◆`, px (#1388), tip to centre. */
const ALTAR_HALF_PX = 5;
/** The altar's gold: the run's goal, held by nobody (#1388). */
const ALTAR = "#c8a45a";
/** A flag's `⚑` and a lord's `♛`, px. */
const GLYPH_FONT = "11px sans-serif";

export interface Compass {
  /** The disc, for what it covers of the arena (#1424). */
  readonly element: HTMLElement;
  /** Draw this frame's compass for `selfId`; hides it without a self actor. */
  update(arena: ArenaSnapshot, selfId: string): void;
  dispose(): void;
}

/**
 * One `<canvas class="compass">` in `parent`, its size set by CSS,
 * reaching `reach` (`compassReach`).
 */
export function createCompass(parent: HTMLElement, reach: number): Compass {
  const canvas = document.createElement("canvas");
  canvas.className = "compass";
  parent.appendChild(canvas);
  let drawn = "";

  const draw = (context: CanvasRenderingContext2D, view: CompassView, sizePx: number): void => {
    const half = sizePx / 2;
    context.clearRect(0, 0, sizePx, sizePx);
    context.save();
    context.translate(half, half);
    context.beginPath();
    context.arc(0, 0, half, 0, Math.PI * 2);
    context.clip();
    context.lineWidth = 1;
    context.strokeStyle = WALL_STROKE;
    for (const wall of view.walls) {
      context.beginPath();
      wall.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
    context.strokeStyle = INK_DIM;
    for (const ring of view.rings) {
      context.setLineDash(ring.kind === "cast" ? [3, 3] : []);
      context.beginPath();
      context.arc(0, 0, ring.radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([]);
    // Under the pings and bodies, as the shrine's ring is under them in
    // the arena.
    context.lineWidth = 2;
    for (const shrine of view.shrines) {
      context.strokeStyle = shrine.side === "ally" ? FRIEND : FOE;
      context.beginPath();
      context.moveTo(shrine.x - SHRINE_ARM, shrine.y);
      context.lineTo(shrine.x + SHRINE_ARM, shrine.y);
      context.moveTo(shrine.x, shrine.y - SHRINE_ARM);
      context.lineTo(shrine.x, shrine.y + SHRINE_ARM);
      context.stroke();
    }
    // Capture Points' shrines (#1407), neutral as the stand held by nobody.
    context.lineWidth = 1.5;
    for (const point of view.capturePoints) {
      context.strokeStyle =
        point.owner === undefined ? INK_DIM : point.owner === "ally" ? FRIEND : FOE;
      context.strokeRect(
        point.x - CAPTURE_HALF_PX,
        point.y - CAPTURE_HALF_PX,
        2 * CAPTURE_HALF_PX,
        2 * CAPTURE_HALF_PX,
      );
    }
    // A Guild Battle's (#1226): the stand under its flag, the flags, then
    // each lord's crown, over the dot the lord is drawn as below.
    if (view.stand !== undefined) {
      const colour =
        view.stand.holder === undefined ? INK_DIM : view.stand.holder === "ally" ? FRIEND : FOE;
      context.lineWidth = 1.5;
      context.strokeStyle = colour;
      context.fillStyle = colour;
      context.beginPath();
      context.arc(view.stand.x, view.stand.y, STAND_RING, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(view.stand.x, view.stand.y, STAND_DOT, 0, Math.PI * 2);
      context.fill();
    }
    // A Relic Run or King of the Hill altar (#1388, #1377), filled so the goal reads first.
    if (view.altar !== undefined) {
      const { x, y } = view.altar;
      context.lineWidth = 1;
      context.strokeStyle = EDGE;
      context.fillStyle = ALTAR;
      context.beginPath();
      context.moveTo(x, y - ALTAR_HALF_PX);
      context.lineTo(x + ALTAR_HALF_PX, y);
      context.lineTo(x, y + ALTAR_HALF_PX);
      context.lineTo(x - ALTAR_HALF_PX, y);
      context.closePath();
      context.fill();
      context.stroke();
    }
    context.font = GLYPH_FONT;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    for (const flag of view.flags) {
      context.fillStyle = flag.side === "ally" ? FRIEND : FOE;
      context.fillText("⚑", flag.x + 3, flag.y);
    }
    context.lineWidth = 1;
    const still = prefersReducedMotion();
    context.strokeStyle = FRIEND;
    for (const ping of view.pings) {
      context.globalAlpha = still ? 1 : 1 - ping.age;
      context.beginPath();
      context.arc(ping.x, ping.y, still ? 3 : 3 + 7 * ping.age, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    for (const dot of view.dots) {
      const radius = dot.small ? SMALL_DOT_RADIUS : DOT_RADIUS;
      context.beginPath();
      context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
      context.fillStyle = dot.kind === "foe" ? FOE : FRIEND;
      context.fill();
      context.strokeStyle = dot.kind === "self" ? INK : EDGE;
      context.stroke();
      if (dot.targeted) {
        context.beginPath();
        context.arc(dot.x, dot.y, radius + 2, 0, Math.PI * 2);
        context.strokeStyle = TARGET;
        context.stroke();
      }
      if (dot.called) {
        context.beginPath();
        context.moveTo(dot.x - 3, dot.y - radius - 6);
        context.lineTo(dot.x, dot.y - radius - 3);
        context.lineTo(dot.x + 3, dot.y - radius - 6);
        context.strokeStyle = CALL;
        context.stroke();
      }
    }
    context.textBaseline = "bottom";
    for (const lord of view.lords) {
      context.fillStyle = lord.side === "ally" ? FRIEND : FOE;
      context.fillText("♛", lord.x, lord.y - SMALL_DOT_RADIUS - 1);
    }
    context.restore();
  };

  return {
    element: canvas,
    update(arena, selfId) {
      // Hidden keeps its box (styles.css), so its size is there to read.
      const sizePx = canvas.clientWidth;
      const view = compassView(arena, selfId, sizePx, reach);
      // A spectator has no compass.
      setHidden(canvas, view === undefined);
      if (view === undefined || sizePx === 0) {
        return;
      }
      const ratio = window.devicePixelRatio;
      const key = `${String(sizePx)}@${String(ratio)}:${JSON.stringify(view)}`;
      if (key === drawn) {
        return;
      }
      drawn = key;
      const backing = Math.round(sizePx * ratio);
      if (canvas.width !== backing) {
        canvas.width = backing;
        canvas.height = backing;
      }
      const context = canvas.getContext("2d");
      if (context === null) {
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(context, view, sizePx);
    },
    dispose() {
      canvas.remove();
    },
  };
}

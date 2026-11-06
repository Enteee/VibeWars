import { AREA_EARSHOT, RANGE_COMPASS, RANGE_SPELL, type Vec2 } from "@vibewars/game-core";
import { MAX_STROKE_POINTS, type PeerCall, type WirePoint } from "@vibewars/game-protocol";
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
 * the edge markers (#440) give direction, the compass distance. A click
 * on it pings that spot, and a drag draws a line your team sees (#2391).
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
  /**
   * Your team's lines (#2391), every point kept: the disc's clip cuts
   * what lies beyond its reach. `remaining` in seconds, above 0.
   */
  readonly strokes: readonly { readonly points: readonly Vec2[]; readonly remaining: number }[];
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

/**
 * The world point `px` compass px from the centre shows (#2391), with
 * `self` at the centre at `scale` px per world unit: `compassView`'s
 * mapping, inverted.
 */
export function worldAt(self: Vec2, scale: number, px: Vec2): Vec2 {
  return { x: self.x + px.x / scale, y: self.y + px.y / scale };
}

/** How long a line stays whole, seconds, before it fades out over its last one (#2391). */
const STROKE_FADE_SECONDS = 1;

/**
 * A line's alpha with `remaining` seconds left (#2391): whole, then
 * fading over its last second; whole to the end when `still`
 * (`prefersReducedMotion`); 0 once gone.
 */
export function strokeAlpha(remaining: number, still: boolean): number {
  if (remaining <= 0) {
    return 0;
  }
  return still ? 1 : Math.min(1, remaining / STROKE_FADE_SECONDS);
}

/** Under this many compass px moved before release, a press is a click: a ping (#2391). */
const CLICK_SLOP_PX = 4;

/** Whether a press from `from` now at `at`, compass px, is a drag rather than a click (#2391). */
export function isDrag(from: Vec2, at: Vec2): boolean {
  return Math.hypot(at.x - from.x, at.y - from.y) >= CLICK_SLOP_PX;
}

/** How often a drag sends what it has drawn, ms (#2391). */
export const STROKE_BATCH_MS = 100;

export type StrokeCall = Extract<PeerCall, { kind: "stroke" }>;

/** One drag's points, sent in batches as it goes (#2391). */
export interface StrokeRecorder {
  /** A drag starts at world point `at`, at `nowMs`. */
  start(at: Vec2, nowMs: number): void;
  /** The drag is at `at`; sends a batch once `STROKE_BATCH_MS` has passed, or it is full. */
  move(at: Vec2, nowMs: number): void;
  /** The drag ends: sends what is left of it. */
  end(nowMs: number): void;
  /** The drag ends sending nothing more: you died. */
  drop(): void;
}

/**
 * Batches each drag into `StrokeCall`s for `send` (#2391): every
 * `STROKE_BATCH_MS`, and on release, each batch starting at the last
 * one's last point so they join. A point closer than `minGap` world
 * units to the last one kept is dropped.
 */
export function createStrokeRecorder(
  minGap: number,
  send: (call: StrokeCall) => void,
): StrokeRecorder {
  let strokeId = 0;
  let points: WirePoint[] | undefined;
  let sentAt = 0;
  const flush = (nowMs: number): void => {
    const last = points?.at(-1);
    if (points === undefined || last === undefined) {
      return;
    }
    if (points.length >= 2) {
      send({ kind: "stroke", strokeId, points });
    }
    points = [last];
    sentAt = nowMs;
  };
  return {
    start(at, nowMs) {
      strokeId += 1;
      points = [[at.x, at.y]];
      sentAt = nowMs;
    },
    move(at, nowMs) {
      const last = points?.at(-1);
      if (points === undefined || last === undefined) {
        return;
      }
      if (Math.hypot(at.x - last[0], at.y - last[1]) >= minGap) {
        points.push([at.x, at.y]);
      }
      if (points.length >= MAX_STROKE_POINTS || nowMs - sentAt >= STROKE_BATCH_MS) {
        flush(nowMs);
      }
    },
    end(nowMs) {
      flush(nowMs);
      points = undefined;
    },
    drop() {
      points = undefined;
    },
  };
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
    strokes: arena.strokes
      .filter((stroke) => stroke.remaining > 0)
      .map((stroke) => ({ points: stroke.points.map(local), remaining: stroke.remaining })),
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

/** What the compass's own clicks and drags send (#2391). */
export interface CompassCalls {
  /** A click: ping world point `at`. */
  onPing(at: Vec2): void;
  /** A drag's next segment. */
  onStroke(call: StrokeCall): void;
}

/**
 * One `<canvas class="compass">` in `parent`, its size set by CSS,
 * reaching `reach` (`compassReach`), its clicks and drags to `calls`.
 */
export function createCompass(parent: HTMLElement, reach: number, calls: CompassCalls): Compass {
  const canvas = document.createElement("canvas");
  canvas.className = "compass";
  parent.appendChild(canvas);
  let drawn = "";
  /** You, as last drawn: where the centre is, and whether you may call. */
  let self: { readonly position: Vec2; readonly scale: number; readonly dead: boolean } | undefined;
  // A point closer than this to the last one adds nothing a 2 px line shows.
  const recorder = createStrokeRecorder(reach / 80, (call) => {
    calls.onStroke(call);
  });
  /** The press under way: where it went down, in compass px, and whether it is a drag yet. */
  let press: { readonly pointerId: number; readonly from: Vec2; dragging: boolean } | undefined;

  /** `event`'s spot in compass px from the centre, pulled in to the disc's edge. */
  const pxOf = (event: PointerEvent): Vec2 => {
    const box = canvas.getBoundingClientRect();
    const half = canvas.clientWidth / 2;
    const x = event.clientX - box.left - canvas.clientLeft - half;
    const y = event.clientY - box.top - canvas.clientTop - half;
    const out = Math.hypot(x, y) / half;
    return out > 1 ? { x: x / out, y: y / out } : { x, y };
  };
  const worldOf = (px: Vec2): Vec2 | undefined =>
    self === undefined || self.dead ? undefined : worldAt(self.position, self.scale, px);
  const release = (nowMs: number): void => {
    if (press?.dragging === true) {
      recorder.end(nowMs);
    }
    press = undefined;
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || self === undefined || self.dead) {
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    press = { pointerId: event.pointerId, from: pxOf(event), dragging: false };
  };
  const onMove = (event: PointerEvent): void => {
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    const px = pxOf(event);
    const at = worldOf(px);
    // Dead mid-drag: the line stops where it was.
    if (at === undefined) {
      recorder.drop();
      press = undefined;
      return;
    }
    if (!press.dragging) {
      if (!isDrag(press.from, px)) {
        return;
      }
      const from = worldOf(press.from);
      if (from === undefined) {
        return;
      }
      press.dragging = true;
      recorder.start(from, event.timeStamp);
    }
    recorder.move(at, event.timeStamp);
  };
  const onUp = (event: PointerEvent): void => {
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    if (!press.dragging) {
      const at = worldOf(press.from);
      if (at !== undefined) {
        calls.onPing(at);
      }
    }
    release(event.timeStamp);
  };
  const onCancel = (event: Event): void => {
    release(event.timeStamp);
  };
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onCancel);

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
    // Your team's lines (#2391): over the ground, under every mark.
    const still = prefersReducedMotion();
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = FRIEND;
    for (const stroke of view.strokes) {
      context.globalAlpha = strokeAlpha(stroke.remaining, still);
      context.beginPath();
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
    context.globalAlpha = 1;
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
      const actor = arena.actors.find(({ id }) => id === selfId);
      self =
        view === undefined || actor === undefined
          ? undefined
          : { position: actor.position, scale: view.scale, dead: actor.dead };
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
      window.removeEventListener("blur", onCancel);
      canvas.remove();
    },
  };
}

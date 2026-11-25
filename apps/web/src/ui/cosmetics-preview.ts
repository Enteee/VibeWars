import { MINIMAL_GW_INSPIRED_PVP_V1, isWeaponId } from "@vibewars/game-core";

import type { WornCosmetics } from "../cosmetics/selection.js";
import { REST_FRAME, type AttackFrame } from "../render/attack-clock.js";
import { BODY_GLYPH_SIZE } from "../render/arena-snapshot.js";
import type { StandingBody, WornCape } from "../render/body-painter.js";
import { newCapeMotion, stepCapeMotion, type CapeMotion } from "../render/cape-motion.js";
import type { CapeLook } from "../render/cape-shape.js";
import { FootstepTrails, auraOf, paintAura, paintMotes } from "../render/cosmetic-ground.js";
import type { GroundBody } from "../render/cosmetic-ground.js";
import {
  dissolveStyleOf,
  fallSeconds,
  paintStyle,
  returnSeconds,
  spawnStyleOf,
} from "../render/cosmetic-reactions.js";
import { swingRibbon } from "../render/cosmetic-trail.js";
import { WEAPON_MOTION, type WeaponMotion } from "../render/weapon-pose.js";
import type { FigureLook } from "./character-card.js";
import {
  canvasPainter,
  drawBodyGlyph,
  loadGlyph,
  paintFigure,
  tintedGlyph,
} from "./character-figure.js";
import { h } from "./kit.js";
import { playerLabelElement, wearCosmetics } from "./player-label.js";
import { prefersReducedMotion } from "./recharge-overlay.js";

/**
 * The cosmetics preview (#3989): your character at the top of Options >
 * Cosmetics, wearing the shown look, which is your choice with any held
 * preview on top. It idles, walks in place with its footsteps drifting
 * away behind, and swings once, round and round, its aura breathing under
 * its feet; the frame, title and flame are its nameplate, as the lobby's.
 * Drawn through the arena's own Phaser-free painters, so it is what a
 * match shows. Under reduced motion it stands still.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const BODY_RADIUS = RULES.collision.playerRadius;
/** How tall a slice of the world the canvas shows, in arena units: the body and its aura. */
const VIEW_HEIGHT = 96;
/** Where the body stands, a share of the canvas down: its cape and aura fit round it. */
const BODY_DOWN = 0.55;
/** The loop: idle, walk, then one swing, seconds. */
export const IDLE_SECONDS = 2;
export const WALK_SECONDS = 3;
/** Rest after the swing before the loop starts again, seconds. */
const SWING_REST_SECONDS = 0.4;
/** One breath while idle, seconds, and how far it lifts the body, arena units. */
const BOB_SECONDS = 2;
const BOB_UNITS = 0.8;
/** How fast it walks: the ruleset's top speed, as a match's body runs. */
const WALK_SPEED = RULES.movement.maxSpeedUnitsPerSecond;
/** The longest step a frame takes, seconds: a tab come back from the background does not jump. */
const MAX_STEP_SECONDS = 0.1;
/** The arena's facing for a body looking right, the way it walks. */
const FACING = 0;
/** The one body the footstep trail follows. */
const SELF = "preview";

/**
 * Where a swing of motion `m` is, `t` seconds after it starts: wind-up,
 * strike, the hold after the hit, the recovery, then at rest.
 */
export function swingFrame(m: WeaponMotion, t: number): AttackFrame {
  const unit = (value: number, of: number): number => Math.min(1, Math.max(0, value / of));
  if (t < 0) {
    return REST_FRAME;
  }
  if (t < m.windUp) {
    return { clip: { phase: "wind-up", progress: unit(t, m.windUp) }, hit: 0 };
  }
  const struck = t - m.windUp;
  if (struck < m.strike) {
    return { clip: { phase: "strike", progress: unit(struck, m.strike) }, hit: 0 };
  }
  const sinceHit = struck - m.strike;
  if (sinceHit < m.hold) {
    return { clip: { phase: "hold", progress: unit(sinceHit, m.hold), sinceHit }, hit: 0 };
  }
  if (sinceHit < m.hold + m.recover) {
    return {
      clip: { phase: "recover", progress: unit(sinceHit - m.hold, m.recover), sinceHit },
      hit: 0,
    };
  }
  return REST_FRAME;
}

/** A swing's length with motion `m`, seconds. */
function swingSeconds(m: WeaponMotion): number {
  return m.windUp + m.strike + m.hold + m.recover;
}

/** What the loop is doing `t` seconds into it, and how far into that. */
export type LoopBeat =
  | { readonly kind: "idle"; readonly at: number }
  | { readonly kind: "walk"; readonly at: number }
  | { readonly kind: "swing"; readonly at: number };

/** The loop's beat `t` seconds in, for a swing of `swing` seconds (0 for none). */
export function loopBeat(t: number, swing: number): LoopBeat {
  const length = IDLE_SECONDS + WALK_SECONDS + (swing > 0 ? swing + SWING_REST_SECONDS : 0);
  const at = ((t % length) + length) % length;
  if (at < IDLE_SECONDS) {
    return { kind: "idle", at };
  }
  if (at < IDLE_SECONDS + WALK_SECONDS) {
    return { kind: "walk", at: at - IDLE_SECONDS };
  }
  return { kind: "swing", at: at - IDLE_SECONDS - WALK_SECONDS };
}

/** A cape for a player with none, so a cape pattern previews on something: plain grey cloth. */
const PLAIN_CAPE: CapeLook = { main: 0x6b6f78, trim: 0xc9ccd2, emblem: "", palette: [] };

/** What the preview needs from the page; a test's own in a test. */
export interface PreviewHost {
  readonly requestFrame: (callback: (now: number) => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly reducedMotion: () => boolean;
  /** Whether the page is shown: hidden, the loop sleeps. */
  readonly visible: () => boolean;
  readonly onVisibility: (listener: () => void) => () => void;
}

const PAGE: PreviewHost = {
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    window.cancelAnimationFrame(handle);
  },
  reducedMotion: prefersReducedMotion,
  visible: () => document.visibilityState === "visible",
  onVisibility: (listener) => {
    document.addEventListener("visibilitychange", listener);
    return () => {
      document.removeEventListener("visibilitychange", listener);
    };
  },
};

/** Who the nameplate names. */
export interface PreviewPlate {
  readonly name: string;
  readonly guildTag: string | null;
}

export interface CosmeticsPreview {
  readonly element: HTMLElement;
  /** Start the loop; again after `stop` goes on. */
  start(): void;
  /** Stop the loop: no frame is asked for after. */
  stop(): void;
  /** Dissolve, then spawn back, once, as the shown look does it: a spawn or dissolve preview's start. */
  replayReactions(): void;
}

/**
 * The preview of `look()`, read every frame, worn by `figure` once it is
 * known (none yet, or no character: the bare body), named by `plate()`.
 */
export function createCosmeticsPreview(
  look: () => WornCosmetics,
  figure: Promise<FigureLook | undefined>,
  plate: () => PreviewPlate,
  host: PreviewHost = PAGE,
): CosmeticsPreview {
  const element = h("div", "cosmetics-preview");
  const nameplate = h("div", "cosmetics-preview-plate");
  const canvas = document.createElement("canvas");
  canvas.className = "cosmetics-preview-figure";
  canvas.setAttribute("aria-hidden", "true");
  element.append(nameplate, canvas);

  let shown: FigureLook | undefined;
  let glyph: HTMLImageElement | undefined;
  let tinted: { readonly pixels: number; readonly canvas: HTMLCanvasElement } | undefined;
  void figure.then(async (known) => {
    shown = known;
    if (known !== undefined) {
      glyph = await loadGlyph(known.primary);
    }
  });

  const trails = new FootstepTrails();
  const cape = newCapeMotion();
  let handle: number | undefined;
  let running = false;
  /** Seconds the loop has run, and the frame clock's last reading, ms. */
  let clock = 0;
  let last: number | undefined;
  /** How far it has walked, arena units: the trail stays where it was dropped. */
  let walked = 0;
  /** When the replayed dissolve started, on `clock`. */
  let reactedAt: number | undefined;
  let plateKey: string | undefined;

  const paintPlate = (worn: WornCosmetics): void => {
    const { name, guildTag } = plate();
    const key = [name, guildTag, worn.frame?.id, worn.title?.id, worn.flame?.id].join("|");
    if (key === plateKey) {
      return;
    }
    plateKey = key;
    nameplate.replaceChildren(
      wearCosmetics(playerLabelElement("cosmetics-preview-name", name, guildTag, 0), worn),
    );
  };

  const frame = (now: number): void => {
    handle = undefined;
    const dt = last === undefined ? 0 : Math.min(MAX_STEP_SECONDS, (now - last) / 1000);
    last = now;
    clock += dt;
    paint(dt);
    if (running) {
      handle = host.requestFrame(frame);
    }
  };

  const paint = (dt: number): void => {
    const worn = look();
    paintPlate(worn);
    const context = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (context === null || width === 0 || height === 0) {
      return;
    }
    const ratio = window.devicePixelRatio;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const still = host.reducedMotion();
    const weaponId = shown?.appearance.weaponId;
    const motion =
      weaponId !== undefined && isWeaponId(weaponId) ? WEAPON_MOTION[weaponId] : undefined;
    const beat = still
      ? ({ kind: "idle", at: 0 } as const)
      : loopBeat(clock, motion === undefined ? 0 : swingSeconds(motion));
    const speed = beat.kind === "walk" ? WALK_SPEED : 0;
    walked += speed * dt;
    const bob =
      beat.kind === "idle" && !still
        ? -BOB_UNITS * Math.sin((2 * Math.PI * beat.at) / BOB_SECONDS)
        : 0;
    const ground: GroundBody = {
      id: SELF,
      position: { x: walked, y: 0 },
      radius: BODY_RADIUS,
      layer: 0,
      dead: false,
      cosmetics: worn,
    };
    trails.step([ground], dt, still);
    stepCapeMotion(cape, dt, { x: walked, y: 0, r: BODY_RADIUS, vx: speed, vy: 0 });

    const attack =
      beat.kind === "swing" && motion !== undefined ? swingFrame(motion, beat.at) : REST_FRAME;
    const swing = worn.swing?.look;
    const ribbon =
      swing?.kind === "swing"
        ? swingRibbon(
            { x: 0, y: bob, r: BODY_RADIUS, facing: FACING },
            weaponId,
            attack,
            undefined,
            still,
          )
        : undefined;
    const body: StandingBody = {
      x: 0,
      y: bob,
      r: BODY_RADIUS,
      facing: FACING,
      team: "ally",
      weaponId,
      offhandId: shown?.appearance.offhandId,
      frame: attack,
      cape: wornCape(shown?.cape, worn, cape),
      swingTrail:
        ribbon === undefined || swing?.kind !== "swing"
          ? undefined
          : { ribbon, colour: swing.colour },
    };

    const scale = height / VIEW_HEIGHT;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(
      ratio * scale,
      0,
      0,
      ratio * scale,
      (width * ratio) / 2,
      height * ratio * BODY_DOWN,
    );
    // Phaser joins its strokes round; a canvas's default miter would spike the marks.
    context.lineJoin = "round";
    const painter = canvasPainter(context);
    const aura = auraOf(ground);
    if (aura !== undefined) {
      paintAura(painter, 0, 0, BODY_RADIUS, aura, clock, 0, still);
    }
    // The trail lies where it was dropped: the body walks on past it.
    context.save();
    context.translate(-walked, 0);
    paintMotes(painter, trails.motes());
    context.restore();
    context.globalAlpha = paintReaction(painter, ground, still);
    const pixels = Math.round(BODY_GLYPH_SIZE * ratio * scale);
    if (glyph !== undefined && tinted?.pixels !== pixels) {
      const made = tintedGlyph(glyph, pixels);
      tinted = made === undefined ? undefined : { pixels, canvas: made };
    }
    paintFigure(painter, body, () => {
      if (tinted !== undefined) {
        drawBodyGlyph(context, body, tinted.canvas);
      }
    });
    context.globalAlpha = 1;
  };

  /**
   * The replayed dissolve then spawn round the body, if one is under way;
   * returns how opaque the body is. Under reduced motion each shows one
   * still frame, and the body stays.
   */
  const paintReaction = (
    painter: ReturnType<typeof canvasPainter>,
    ground: GroundBody,
    still: boolean,
  ): number => {
    if (reactedAt === undefined) {
      return 1;
    }
    const fall = fallSeconds(ground);
    const rise = returnSeconds(ground);
    const age = clock - reactedAt;
    const dissolve = dissolveStyleOf(ground);
    const spawn = spawnStyleOf(ground);
    if (age < fall) {
      if (dissolve !== undefined) {
        paintStyle(
          painter,
          dissolve,
          0,
          0,
          BODY_RADIUS,
          still ? dissolve.seconds / 2 : age,
          0,
          false,
        );
      }
      return still ? 1 : 1 - age / fall;
    }
    if (age < fall + rise) {
      if (spawn !== undefined) {
        paintStyle(
          painter,
          spawn,
          0,
          0,
          BODY_RADIUS,
          still ? spawn.seconds / 2 : age - fall,
          0,
          false,
        );
      }
      return still ? 1 : (age - fall) / rise;
    }
    reactedAt = undefined;
    return 1;
  };

  const wake = (): void => {
    if (running && handle === undefined && host.visible()) {
      last = undefined;
      handle = host.requestFrame(frame);
    } else if (!host.visible() && handle !== undefined) {
      host.cancelFrame(handle);
      handle = undefined;
    }
  };
  let offVisibility: (() => void) | undefined;

  return {
    element,
    start() {
      running = true;
      offVisibility ??= host.onVisibility(wake);
      wake();
    },
    stop() {
      running = false;
      if (handle !== undefined) {
        host.cancelFrame(handle);
        handle = undefined;
      }
      offVisibility?.();
      offVisibility = undefined;
    },
    replayReactions() {
      reactedAt = clock;
    },
  };
}

/**
 * The cape `worn` puts on a body whose guild cape is `guild`: the guild's,
 * patterned and framed as worn; with no guild cape, plain grey cloth while
 * a pattern is worn, so it shows, else none. A plain cape has no emblem, so
 * no frame, as the emblem frame's row is not offered without a cape.
 * The cape moves as `motion` does.
 */
function wornCape(
  guild: CapeLook | undefined,
  worn: WornCosmetics,
  motion: CapeMotion,
): WornCape | undefined {
  const pattern = worn.cape?.look.kind === "cape" ? worn.cape.look.pattern : undefined;
  const frame = worn.emblemFrame?.look.kind === "emblemFrame" ? worn.emblemFrame.look : undefined;
  if (guild === undefined && pattern === undefined) {
    return undefined;
  }
  return {
    look: guild ?? PLAIN_CAPE,
    motion,
    pattern,
    emblemFrame: guild === undefined ? undefined : frame,
  };
}

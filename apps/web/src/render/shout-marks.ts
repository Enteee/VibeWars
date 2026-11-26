import { AREA_EARSHOT, getSkill, type Vec2 } from "@vibewars/game-core";
import type { CombatMessage } from "@vibewars/game-session";

/**
 * A shout or chant going out (#3301, docs/art/3191-skill-visuals.md
 * "Shout"): one thin cool ring leaves the caster and grows to earshot,
 * and a chevron rises over every body of the caster's side it helped.
 * Neither is team-coloured: a foe's shout reads the same. Shouts are
 * instant, so there is no cast bar to show them.
 *
 * No Phaser here, so it can be tested in Node.
 */

export const SHOUT_COLOUR = 0x9fdcff;
export const SHOUT_RING_WIDTH = 2;
export const SHOUT_RING_SECONDS = 0.3;
export const SHOUT_CHEVRON_SECONDS = 1;
/** The chevron fades over its last this many seconds. */
export const SHOUT_CHEVRON_FADE = 0.3;
/** Past this many at once, the oldest go. */
export const MAX_SHOUT_MARKS = 64;
const RING_ALPHA = 0.9;
const STILL_RING_ALPHA = 0.5;

/** The ring stays where the caster stood when it shouted, on that layer. */
export interface ShoutRing {
  readonly kind: "ring";
  readonly anchorId: string;
  ageSeconds: number;
  readonly position: Vec2;
  readonly layer: number;
  /** The caster's edge, where the ring starts. */
  readonly from: number;
}

/** Over a body it helped, drawn where that body is now. */
export interface ShoutChevron {
  readonly kind: "chevron";
  readonly anchorId: string;
  ageSeconds: number;
}

export type ShoutMark = ShoutRing | ShoutChevron;

/** What the marks need of a body in the state. */
export interface ShoutBody {
  readonly team: number;
  readonly position: Vec2;
  readonly layer: number;
  readonly radius: number;
}

/**
 * The ring and chevrons `message` shows: none unless it is a shout or
 * chant the client knows, used by a body in the state. A chevron for each
 * body of the caster's side an event targets, the caster included.
 */
export function shoutMarksFor(
  message: CombatMessage,
  bodyOf: (id: string) => ShoutBody | undefined,
): readonly ShoutMark[] {
  if (message.cause !== "skill") {
    return [];
  }
  const type = getSkill(message.skillId)?.type;
  const caster = bodyOf(message.casterSessionId);
  if ((type !== "shout" && type !== "chant") || caster === undefined) {
    return [];
  }
  const marks: ShoutMark[] = [
    {
      kind: "ring",
      anchorId: message.casterSessionId,
      ageSeconds: 0,
      position: caster.position,
      layer: caster.layer,
      from: caster.radius,
    },
  ];
  const helped = new Set<string>();
  for (const event of message.events) {
    if (!helped.has(event.targetId) && bodyOf(event.targetId)?.team === caster.team) {
      helped.add(event.targetId);
      marks.push({ kind: "chevron", anchorId: event.targetId, ageSeconds: 0 });
    }
  }
  return marks;
}

/**
 * `added` put into `live`, in place: a chevron on a body that already
 * wears one refreshes it rather than stacking. At most `MAX_SHOUT_MARKS`,
 * the oldest dropped first.
 */
export function addShoutMarks(live: ShoutMark[], added: readonly ShoutMark[]): void {
  for (const mark of added) {
    const worn =
      mark.kind === "chevron"
        ? live.find((other) => other.kind === "chevron" && other.anchorId === mark.anchorId)
        : undefined;
    if (worn === undefined) {
      live.push({ ...mark });
    } else {
      worn.ageSeconds = 0;
    }
  }
  if (live.length > MAX_SHOUT_MARKS) {
    live.splice(0, live.length - MAX_SHOUT_MARKS);
  }
}

/** `marks` aged by `dt` seconds and the spent dropped, in place: nothing is allocated. */
export function decayShoutMarks(marks: ShoutMark[], dt: number): void {
  let kept = 0;
  for (const mark of marks) {
    mark.ageSeconds += dt;
    const life = mark.kind === "ring" ? SHOUT_RING_SECONDS : SHOUT_CHEVRON_SECONDS;
    if (mark.ageSeconds < life) {
      marks[kept] = mark;
      kept += 1;
    }
  }
  marks.length = kept;
}

/**
 * The ring at `age` seconds, from a caster whose edge is at `from`: it
 * grows to earshot and fades as it goes. Under reduced motion, one still
 * ring at half earshot. `undefined` once it is spent.
 */
export function shoutRingRadius(
  age: number,
  from: number,
  reducedMotion: boolean,
): { readonly radius: number; readonly alpha: number } | undefined {
  if (age < 0 || age > SHOUT_RING_SECONDS) {
    return undefined;
  }
  if (reducedMotion) {
    return { radius: AREA_EARSHOT / 2, alpha: STILL_RING_ALPHA };
  }
  const progress = age / SHOUT_RING_SECONDS;
  return { radius: from + (AREA_EARSHOT - from) * progress, alpha: RING_ALPHA * (1 - progress) };
}

/** The chevron's alpha at `age` seconds: whole, then fading over its last moments; 0 once spent. It does not move, so reduced motion keeps it. */
export function chevronAlpha(age: number): number {
  if (age < 0 || age >= SHOUT_CHEVRON_SECONDS) {
    return 0;
  }
  return Math.min(1, (SHOUT_CHEVRON_SECONDS - age) / SHOUT_CHEVRON_FADE);
}

/** The chevron's width and height, about a cast badge's. */
const CHEVRON_HALF_WIDTH = 4;
const CHEVRON_HEIGHT = 5;
/** Its foot clears the health bar's top (r + 12), or the hex halo's. */
const CHEVRON_FOOT = 14;
const CHEVRON_OVER_HALO = 2;

/**
 * The chevron over a body at (`x`, `y`) of `radius`, pointing up: left
 * foot, tip, right foot. `haloTop`, how far over the centre a hex halo
 * reaches, lifts it clear of the halo.
 */
export function shoutChevron(
  x: number,
  y: number,
  radius: number,
  haloTop: number | undefined,
): readonly [Vec2, Vec2, Vec2] {
  const foot =
    y - Math.max(radius + CHEVRON_FOOT, haloTop === undefined ? 0 : haloTop + CHEVRON_OVER_HALO);
  return [
    { x: x - CHEVRON_HALF_WIDTH, y: foot },
    { x, y: foot - CHEVRON_HEIGHT },
    { x: x + CHEVRON_HALF_WIDTH, y: foot },
  ];
}

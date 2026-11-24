import type { Vec2 } from "@vibewars/game-core";
import type { ClientIntent, PeerCall } from "@vibewars/game-protocol";
import type { CallsSnapshot, MatchSnapshot } from "@vibewars/game-session";

import {
  actorAtPoint,
  clickableAt,
  selfLayer,
  type ArenaSnapshot,
} from "../render/arena-snapshot.js";
import { pickSurface } from "../render/layer-surfaces.js";
import { attackClickIntents } from "./attack-key.js";
import type { DoubleClick } from "./double-click.js";

/** What a right click or a tap picks besides a body. */
const PICKED_OBJECTS = ["flag", "stand", "switch", "breakable"] as const;

/**
 * What a right click sends (#438), shared by the match and the Training
 * Ground so it means the same in both. The left button walks (unless
 * Show names is held, `primaryClickIntents`); the right one picks.
 *
 * What is drawn on top at `world` is targeted (#3634): a body, and a
 * second right click on the same enemy within the double-click window
 * attacks it, as Space would (#298); a flag or the flag stand (#1225), or
 * a switch (#3025), and a double click walks to it as Space does; or a
 * standing breakable wall (#3031), and a double click attacks it. Your
 * own body never hides what you stand on (#1299: you stand on the stand
 * to plant).
 * The ground sends nothing: a missed right click costs nothing, and keeps
 * the target. `doubleClick` is pressed either way, so a click on the
 * ground breaks a double.
 *
 * With `shift` (Show names held, #2738) a name is part of its body's hit,
 * and the click only ever targets: a double never attacks (a Shift+left
 * click does).
 */
export function secondaryClickIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  doubleClick: DoubleClick,
  nowMs: number,
  shift: boolean,
): ClientIntent[] {
  const hit = clickableAt(arena, world, {
    objects: PICKED_OBJECTS,
    under: snapshot.selfSessionId,
    tagBoxes: shift ? arena.nameBoxes : undefined,
  })?.id;
  const double = doubleClick.press(hit, nowMs);
  if (hit === undefined) {
    return [];
  }
  return [
    { kind: "target", targetSessionId: hit },
    ...(double && !shift ? attackClickIntents(snapshot, hit) : []),
  ];
}

/**
 * What a tap on a touch screen sends (#3781), shared by the match and the
 * Training Ground: on a body, flag, stand, switch or breakable wall, what
 * a right click there sends, a double tap included; anywhere else, a walk
 * there, as a left click. A fingertip is wider than a cursor: a tap that
 * hits nothing takes what is drawn within `slop` world units of it. Your
 * own body is never what a tap hits (#1299): it falls through to what you
 * stand on, else the ground.
 */
export function tapIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  doubleClick: DoubleClick,
  nowMs: number,
  slop: number,
): ClientIntent[] {
  const picked = clickableAt(arena, world, {
    objects: PICKED_OBJECTS,
    under: snapshot.selfSessionId,
    slop,
  })?.id;
  const hit = picked === snapshot.selfSessionId ? undefined : picked;
  const double = doubleClick.press(hit, nowMs);
  if (hit === undefined) {
    return primaryClickIntents(snapshot, arena, world, false, false);
  }
  return [
    { kind: "target", targetSessionId: hit },
    ...(double ? attackClickIntents(snapshot, hit) : []),
  ];
}

/**
 * What a long-press on a touch screen sends (#3878): the touch Alt+click,
 * a walk to the surface under the one drawn at `world`. It never targets,
 * over a body too.
 */
export function longPressIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
): ClientIntent[] {
  return primaryClickIntents(snapshot, arena, world, false, true);
}

/**
 * What a left click sends (#438): a walk to the surface drawn at `world`,
 * or with `below` (Alt, #2831) the one under it; over a tunnel, the
 * level your body is on first (#3234). With `shift` (Show
 * names held, #2738), a click on a body or its name targets it instead,
 * and at once attacks it, as a double right click would on a foe; on the
 * ground it still walks.
 */
export function primaryClickIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  shift: boolean,
  below: boolean,
): ClientIntent[] {
  const hit = shift ? actorAtPoint(arena, world, arena.nameBoxes) : undefined;
  if (hit !== undefined) {
    return [{ kind: "target", targetSessionId: hit.id }, ...attackClickIntents(snapshot, hit.id)];
  }
  const { layer, point } = pickSurface(
    arena.structure,
    arena.walls,
    world,
    below,
    selfLayer(arena),
  );
  return [{ kind: "walk-to", x: point.x, y: point.y, layer }];
}

/** What a wheel click does (#443). */
export type MiddleClick =
  { readonly kind: "call"; readonly call: PeerCall } | { readonly kind: "none" };

/**
 * What a wheel click at `world` means, shared by the match and the
 * Training Ground: on a living foe, call it for your team; on a living
 * ally or the ground, ping that point (#1055: the party window shows
 * every ally's health, so there is no one to watch). On yourself, on a
 * corpse, or while you are dead: nothing. With `shift`, a name is part
 * of its body's hit (#2738).
 */
export function middleClickAction(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  shift: boolean,
): MiddleClick {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  if (self === undefined || self.dead) {
    return { kind: "none" };
  }
  const ping: MiddleClick = { kind: "call", call: { kind: "ping", x: world.x, y: world.y } };
  const hit = actorAtPoint(arena, world, shift ? arena.nameBoxes : undefined);
  if (hit === undefined) {
    return ping;
  }
  const body = snapshot.players.find((player) => player.sessionId === hit.id);
  if (body === undefined || body.dead || body.sessionId === self.sessionId) {
    return { kind: "none" };
  }
  return body.team === self.team
    ? ping
    : { kind: "call", call: { kind: "target", targetId: body.sessionId } };
}

/**
 * The `call-target` key (#443): your current target, if it is a living
 * foe and you are alive; otherwise nothing.
 */
export function callTargetCall(snapshot: MatchSnapshot): PeerCall | undefined {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  const target = snapshot.players.find((player) => player.sessionId === self?.targetSessionId);
  if (self === undefined || self.dead || target === undefined || target.dead) {
    return undefined;
  }
  return target.team === self.team ? undefined : { kind: "target", targetId: target.sessionId };
}

/**
 * The `target-called` key (#1024): your team's called foe as your target,
 * as a right click on it would. The host clears a call when its foe
 * dies, so a call here is a living foe; nothing when there is none or it
 * is already your target.
 */
export function calledTargetIntent(
  snapshot: MatchSnapshot,
  calls: CallsSnapshot,
): ClientIntent | undefined {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  const called = calls.target?.targetId;
  return self === undefined || called === undefined || called === self.targetSessionId
    ? undefined
    : { kind: "target", targetSessionId: called };
}

/** The `ping` key (#443): the ground under the pointer, while you are alive. */
export function pingCall(snapshot: MatchSnapshot, pointer: Vec2 | undefined): PeerCall | undefined {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  return self === undefined || self.dead || pointer === undefined
    ? undefined
    : { kind: "ping", x: pointer.x, y: pointer.y };
}

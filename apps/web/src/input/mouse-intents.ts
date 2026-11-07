import type { Vec2 } from "@vibewars/game-core";
import type { ClientIntent, PeerCall } from "@vibewars/game-protocol";
import type { CallsSnapshot, MatchSnapshot } from "@vibewars/game-session";

import {
  actorAtPoint,
  type ArenaSnapshot,
  type RenderableActor,
} from "../render/arena-snapshot.js";
import { flagObjectAtPoint } from "../render/flag-objects.js";
import { attackClickIntents } from "./attack-key.js";
import type { DoubleClick } from "./double-click.js";

/**
 * Where the click at `world` lands on a body: with `shift`, the names key
 * held (#2738), a shown name tag counts as its body.
 */
function clicked(arena: ArenaSnapshot, world: Vec2, shift: boolean): RenderableActor | undefined {
  return actorAtPoint(arena, world, shift ? arena.tagBoxes : undefined);
}

/**
 * What a left click sends (#438, #2738): it walks, bodies included, and
 * keeps the target. With `shift` (the names key held) on another body or
 * its name, it targets that body instead, does not walk, and attacks it
 * at once when it is a foe, as Space would.
 */
export function primaryClickIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  shift: boolean,
): ClientIntent[] {
  const hit = shift ? clicked(arena, world, shift) : undefined;
  return hit === undefined || hit.team === "self"
    ? [{ kind: "walk-to", x: world.x, y: world.y }]
    : [{ kind: "target", targetSessionId: hit.id }, ...attackClickIntents(snapshot, hit.id)];
}

/**
 * What a right click sends (#438), shared by the match and the Training
 * Ground so it means the same in both. The left button only ever walks;
 * the right one picks.
 *
 * A body under `world` is targeted, and a second right click on the same
 * enemy within the double-click window attacks it, as Space would (#298).
 * With no body there, or only your own (#1299: you stand on the stand
 * to plant), a flag or the flag stand is (#1225), and a double click
 * walks to it as Space does.
 * The ground sends nothing: a missed right click costs nothing, and keeps
 * the target. `doubleClick` is pressed either way, so a click on the
 * ground breaks a double. With `shift` (#2738), a name counts as its body
 * and a click never attacks, double or not.
 */
export function secondaryClickIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  doubleClick: DoubleClick,
  nowMs: number,
  shift: boolean,
): ClientIntent[] {
  const body = clicked(arena, world, shift)?.id;
  const flagObject = flagObjectAtPoint(arena.flags, arena.stand, world);
  // #1299: your own body never hides the flag or stand you stand on.
  const hit = body === undefined || body === snapshot.selfSessionId ? (flagObject ?? body) : body;
  const double = doubleClick.press(hit, nowMs);
  if (hit === undefined) {
    return [];
  }
  return [
    { kind: "target", targetSessionId: hit },
    ...(double && !shift ? attackClickIntents(snapshot, hit) : []),
  ];
}

/** What a wheel click does (#443). */
export type MiddleClick =
  { readonly kind: "call"; readonly call: PeerCall } | { readonly kind: "none" };

/**
 * What a wheel click at `world` means, shared by the match and the
 * Training Ground: on a living foe, call it for your team; on a living
 * ally or the ground, ping that point (#1055: the party window shows
 * every ally's health, so there is no one to watch). On yourself, on a
 * corpse, or while you are dead: nothing. With `shift` (#2738), a name
 * counts as its body.
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
  const hit = clicked(arena, world, shift);
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

import {
  FLAG_STAND_ID,
  Vec,
  flagId,
  relicId,
  switchTargetId,
  type CapturePoint,
  type CarriedSpawn,
  type FlagField,
  type FlagPlace,
  type FlagState,
  type RelicField,
  type RelicState,
  type StandState,
  type Vec2,
} from "@vibewars/game-core";
import type { GateDescriptor, SwitchDescriptor, TeleportDescriptor } from "@vibewars/game-protocol";
import type { GateLook } from "@vibewars/game-maps/schema";
import type { PlayerSnapshot } from "@vibewars/game-session";
import type { RenderableShape } from "./arena-snapshot.js";

/**
 * A Guild Battle's flags and flag stand as the arena draws them (#1225),
 * and a Relic Run's relics as flags (#1374): stand-in shapes until their
 * asset card. Pure, so where each is drawn and what a right click picks
 * are testable without Phaser.
 */

/** How far from a flag's foot a right click picks it, world units. */
export const FLAG_PICK_RADIUS = 24;
/** The stand's ring, and how far from its centre a right click picks it. */
export const STAND_RADIUS = 36;

export type FlagSide = "ally" | "enemy";

/** A flag or a relic where it is: at its spawn, on the ground, on the stand or over its carrier's head. */
export interface RenderableFlag {
  /** Its target id, `flag/<team>` or `relic/<team>`. */
  readonly id: string;
  readonly side: FlagSide;
  /** Its foot: the carrier's position while carried. */
  readonly position: Vec2;
  /** On a carrier, drawn over the head; nowhere to pick. */
  readonly carried: boolean;
  /** On the stand: the stand is what a click picks. */
  readonly onStand: boolean;
}

export interface RenderableStand {
  readonly id: string;
  readonly position: Vec2;
  /** Whose flag is on it; `undefined`, neutral grey, for nobody's. */
  readonly holder: FlagSide | undefined;
}

/** Your team's side, or the foe's; a spectator reads team 0 as theirs, as the scoreboard does. */
function sideOf(team: number, selfTeam: number | undefined): FlagSide {
  return team === (selfTeam ?? 0) ? "ally" : "enemy";
}

/**
 * Every flag that can be drawn, from the snapshot and the map: a flag
 * whose carrier is not in the snapshot is not drawn, nor any on a map
 * without a field.
 */
export function renderableFlags(
  flags: readonly FlagState[],
  field: FlagField | undefined,
  players: readonly PlayerSnapshot[],
  selfTeam: number | undefined,
): RenderableFlag[] {
  if (field === undefined) {
    return [];
  }
  return flags.flatMap(({ team, place }) => {
    const position = flagFoot(field.spawns, field.stand, team, place, players);
    return position === undefined
      ? []
      : [
          {
            id: flagId(team),
            side: sideOf(team, selfTeam),
            position,
            carried: place.kind === "carried",
            onStand: place.kind === "stand",
          },
        ];
  });
}

/**
 * Every relic that can be drawn (#1374), as a flag: one whose carrier is
 * not in the snapshot is not drawn, nor any on a map without an altar.
 */
export function renderableRelics(
  relics: readonly RelicState[],
  field: RelicField | undefined,
  players: readonly PlayerSnapshot[],
  selfTeam: number | undefined,
): RenderableFlag[] {
  if (field === undefined) {
    return [];
  }
  return relics.flatMap(({ team, place }) => {
    const position = flagFoot(field.spawns, undefined, team, place, players);
    return position === undefined
      ? []
      : [
          {
            id: relicId(team),
            side: sideOf(team, selfTeam),
            position,
            carried: place.kind === "carried",
            onStand: false,
          },
        ];
  });
}

/** Where a flag or relic stands, or its carrier, from the map's spawns and stand. */
function flagFoot(
  spawns: readonly CarriedSpawn[],
  stand: Vec2 | undefined,
  team: number,
  place: FlagPlace,
  players: readonly PlayerSnapshot[],
): Vec2 | undefined {
  switch (place.kind) {
    case "spawn":
      return spawns.find((spawn) => spawn.team === team)?.position;
    case "ground":
      return place.position;
    case "stand":
      return stand;
    case "carried": {
      const carrier = players.find((player) => player.sessionId === place.carrierId);
      return carrier === undefined ? undefined : { x: carrier.x, y: carrier.y };
    }
  }
}

/** The stand, in its holder's colour; `undefined` on a map without one. */
export function renderableStand(
  stand: StandState | undefined,
  field: FlagField | undefined,
  selfTeam: number | undefined,
): RenderableStand | undefined {
  if (field === undefined || stand === undefined) {
    return undefined;
  }
  return {
    id: FLAG_STAND_ID,
    position: field.stand,
    holder: stand.holder === undefined ? undefined : sideOf(stand.holder, selfTeam),
  };
}

/**
 * The flag or the stand under `point`, for a right click to target, as
 * a body is: a flag lying at its spawn or on the ground first, then the
 * stand. A carried flag is its carrier's to click.
 */
export function flagObjectAtPoint(
  flags: readonly RenderableFlag[],
  stand: RenderableStand | undefined,
  point: Vec2,
): string | undefined {
  const lying = flags
    .filter((flag) => !flag.carried && !flag.onStand)
    .map((flag) => ({ id: flag.id, d: Vec.distance(flag.position, point) }))
    .filter(({ d }) => d <= FLAG_PICK_RADIUS)
    .sort((a, b) => a.d - b.d)[0];
  if (lying !== undefined) {
    return lying.id;
  }
  return stand !== undefined && Vec.distance(stand.position, point) <= STAND_RADIUS
    ? stand.id
    : undefined;
}

/**
 * A Capture Points shrine (#1378) as the arena draws it: the stand's
 * marker in its owner's colour, neutral grey with none, and round it how
 * far toward its capturer it is, while that is not the whole of it.
 */
export interface RenderableCapturePoint {
  readonly position: Vec2;
  /** Whose it is; `undefined`, neutral grey, for nobody's. */
  readonly owner: FlagSide | undefined;
  /** The progress ring: whose colour, and how much of the circle; `undefined` for none. */
  readonly ring: { readonly side: FlagSide; readonly fraction: number } | undefined;
}

/** A gate (#2691): its pressure plate in your side's colour, or none for anyone's. */
export interface RenderableGate {
  /** A switch's gate (#3025) has no plate. */
  readonly plate: { readonly position: Vec2; readonly side: FlagSide | undefined } | undefined;
  readonly open: boolean;
  /**
   * What it stops while closed (#3031): `all`, a door of the map's walls;
   * `bodies-and-shots`, an energy barrier, drawn as a curtain sight passes.
   */
  readonly blocks: GateDescriptor["blocks"];
  /** The wall it opens: an open gate leaves its outline on the ground. */
  readonly wall: RenderableShape;
  /** The layer its wall stands on (ADR-0051): its ghost lies on that layer's ground. */
  readonly layer: number;
  /** What it is drawn as (#3068): a door, a portcullis, or a secret passage in the rock. */
  readonly look: GateLook;
}

/** Every gate, from your side's view; `[]` on a map without them. */
export function renderableGates(
  gates: readonly GateDescriptor[],
  layers: readonly number[],
  looks: readonly GateLook[],
  open: readonly boolean[],
  selfTeam: number | undefined,
): RenderableGate[] {
  return gates.map(({ opener, wall, blocks }, at) => ({
    plate:
      opener.kind === "plate"
        ? {
            position: opener.plate,
            side: opener.team === null ? undefined : sideOf(opener.team, selfTeam),
          }
        : undefined,
    open: open[at] === true,
    blocks,
    wall,
    layer: layers[at] ?? 0,
    look: looks[at] ?? "door",
  }));
}

/** A switch (#3025) as the arena draws it: its lever, raised or thrown. */
export interface RenderableSwitch {
  /** What a click on it targets: `switch-<id>`. */
  readonly id: string;
  /** Its id on the map, which names its mark. */
  readonly mark: string;
  readonly position: Vec2;
  readonly layer: number;
  readonly up: boolean;
}

/** How near a click comes to a switch to pick it. */
export const SWITCH_PICK_RADIUS = 18;

/** Every switch, pointing as `up` says; `[]` on a map without them. */
export function renderableSwitches(
  switches: readonly SwitchDescriptor[],
  up: readonly boolean[],
): RenderableSwitch[] {
  return switches.map(({ id, position, layer }, at) => ({
    id: switchTargetId(id),
    mark: id,
    position,
    layer,
    up: up[at] !== false,
  }));
}

/** A portal (#3030) as the arena draws it: its entry, its exit, and whether it is on. */
export interface RenderableTeleport {
  /** Its id on the map, which names its mark. */
  readonly id: string;
  /** Its entry: a body inside `area` on `layer` goes. */
  readonly from: { readonly layer: number; readonly area: readonly Vec2[] };
  /** Where a body that goes stands. */
  readonly to: { readonly layer: number; readonly position: Vec2 };
  readonly on: boolean;
}

/** Every teleport, on or off as `on` says; `[]` on a map without them. */
export function renderableTeleports(
  teleports: readonly TeleportDescriptor[],
  on: readonly boolean[],
): RenderableTeleport[] {
  return teleports.map(({ id, from, to }, at) => ({
    id,
    from: { layer: from.layer, area: from.area.points },
    to,
    on: on[at] === true,
  }));
}

/** The switch under `point`, for a right click to target as a bundle is (#3025). */
export function switchAtPoint(
  switches: readonly RenderableSwitch[],
  point: Vec2,
): string | undefined {
  return switches
    .map((lever) => ({ id: lever.id, d: Vec.distance(lever.position, point) }))
    .filter(({ d }) => d <= SWITCH_PICK_RADIUS)
    .sort((a, b) => a.d - b.d)[0]?.id;
}

/** Every shrine, from your side's view; `[]` on a map without them. */
export function renderableCapturePoints(
  points: readonly CapturePoint[],
  selfTeam: number | undefined,
): RenderableCapturePoint[] {
  return points.map((point) => {
    // Owned and full, the marker says it all; nobody's progress, nothing to show.
    const settled = point.progress >= 1 && point.owner === point.capturer;
    return {
      position: point.position,
      owner: point.owner === null ? undefined : sideOf(point.owner, selfTeam),
      ring:
        point.capturer === null || point.progress <= 0 || settled
          ? undefined
          : { side: sideOf(point.capturer, selfTeam), fraction: point.progress },
    };
  });
}

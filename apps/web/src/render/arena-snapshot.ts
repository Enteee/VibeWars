import {
  Vec,
  type CreatureLook,
  type LiftPhase,
  type OffhandId,
  type ProfessionId,
  type SkillType,
  type Uphill,
  type Vec2,
  type ZoneKind,
  type ZonePath,
  type ZoneSchedule,
} from "@vibewars/game-core";
import type {
  DeckLook,
  GateLook,
  SwitchedDeckData,
  TransitionLift,
  TransitionLook,
} from "@vibewars/game-maps/schema";

import type { CallsSnapshot, GroundEffectSnapshot } from "@vibewars/game-session";
import type {
  Biome,
  MapAtmosphere,
  MapBounds,
  MapLighting,
  MapPaving,
} from "@vibewars/game-maps/schema";

import { PROFESSION_GLYPH_SIZE } from "./arena-atlas.js";
import type { AttackCast } from "./attack-clock.js";
import type { ConditionCue } from "./body-conditions.js";
import {
  breakableAtPoint,
  type CrackStage,
  type RenderableBreakable,
} from "./breakable-objects.js";
import type { CapeLook } from "./cape-shape.js";
import type { RenderablePing } from "./call-marks.js";
import type {
  RenderableCapturePoint,
  RenderableGate,
  RenderableSwitch,
  RenderableTeleport,
  RenderableFlag,
  RenderableStand,
} from "./flag-objects.js";
import type { GoalMark } from "./goal-mark.js";
import { LYING_WIDTH } from "./lying-pose.js";
import type { RenderableProjectile } from "./projectiles.js";
import { liftAt } from "./layer-surfaces.js";
import { screenPx } from "./screen-text.js";

/**
 * The renderer's own data shape and its pure helpers (team colour lookup,
 * click hit-testing). Deliberately has zero dependency on Phaser — the
 * actual drawing lives in `arena-scene.ts`, which imports Phaser and so
 * cannot be imported from a plain-Node test (Phaser probes for browser
 * globals at module load time and throws outside one). Keeping this file
 * Phaser-free is what lets these helpers be unit-tested headlessly,
 * consistent with ADR-0001's "the domain never depends on the renderer" —
 * the same separation, one layer over.
 */

export interface RenderableActor {
  readonly id: string;
  /** Drawn above the actor, so a player can tell who is who. */
  readonly name: string;
  /** The player's guild tag (#1406), after the name on its plate; `undefined` for none. */
  readonly guildTag: string | undefined;
  /** Beside the name on its plate (#2702); 0 for none. */
  readonly heroRank: number;
  /**
   * The player key's signet bits (#2805), drawn just left of the name
   * wherever the name shows; `undefined` for none, as for a bot.
   */
  readonly signet: number | undefined;
  /** The player's guild cape (#1422), drawn behind a standing body; `undefined` for none. */
  readonly cape: CapeLook | undefined;
  /** A lobby's bot (#1194): its name plate wears the BOT tag. */
  readonly bot: boolean;
  readonly position: Vec2;
  /** The discrete layer it stands on (ADR-0051): how high and in what order it draws. */
  readonly layer: number;
  /** Radians, `atan2` convention, 0 = +x (#187). Not drawn yet. */
  readonly facing: number;
  /** Picks the weapon mark's tip (#188); `undefined` draws none. */
  readonly weaponId: string | undefined;
  /** The host's swing timer, which the weapon mark's pose follows (#560); `swingTotal` 0: not attacking. */
  readonly swingElapsed: number;
  readonly swingTotal: number;
  /** The host's cast timer while an attack skill winds up (#562), which the pose follows instead. */
  readonly attackCast: AttackCast | undefined;
  /** Picks the off-hand mark (#276); `undefined` draws none. */
  readonly offhandId: OffhandId | undefined;
  /** The primary profession, whose glyph leads the name (#281); `undefined` draws none. */
  readonly profession: ProfessionId | undefined;
  /** A creature's shape and kind glyph (#1162); `undefined`: a player or a dummy, a disc. */
  readonly creatureLook: CreatureLook | undefined;
  readonly radius: number;
  readonly team: "ally" | "enemy" | "third" | "self";
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
  /** A corpse a skill has exploited (#466): drawn darker. */
  readonly exploited: boolean;
  /** Lying down from a knockdown (#545): drawn flattened, the weapon dropped beside it. */
  readonly knockedDown: boolean;
  /** Fraction of the current cast still remaining, or `undefined`. */
  readonly castProgress: number | undefined;
  /** The casting skill's type, for the badge by the cast bar (#1125); only with `castProgress`. */
  readonly castType: SkillType | undefined;
  readonly statuses: readonly string[];
  /** Wears the brass enchantment ring and its motes (#1117, #3226); never a corpse. */
  readonly enchanted: boolean;
  /** Wears the steel stance band, streaking while it moves (#3226); never a corpse. */
  readonly stanced: boolean;
  /** Wears the violet hex halo over its health bar (#1117, #3226); never a corpse. */
  readonly hexed: boolean;
  /** Shimmers, a shrine raise's invulnerability (#1233); never a corpse. */
  readonly invulnerable: boolean;
  /** The match clock (`clock`) from which it may take a teleport again (#3030); 0 if it never took one. */
  readonly teleportReadyAt: number;
  /** Flames, drops or bubbles on the body (#1138), two at most; never a corpse. */
  readonly conditionCues: readonly ConditionCue[];
}

export interface RectRenderableWall {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonRenderableWall {
  readonly kind: "polygon";
  readonly points: readonly Vec2[];
}

export type RenderableWall = (RectRenderableWall | PolygonRenderableWall) & {
  /** The layer it stands on (ADR-0051). */
  readonly layer: number;
};

/** A shut gate's door (#3061): it blocks as a wall does, and draws as a door. */
export type RenderableDoor = RenderableWall & { readonly door: true; readonly look: GateLook };

/** The layer the local player's body stands on; `undefined` for a spectator (#3234). */
export function selfLayer(arena: Pick<ArenaSnapshot, "actors">): number | undefined {
  return arena.actors.find(({ team }) => team === "self")?.layer;
}

export function isDoor(wall: RenderableWall): wall is RenderableDoor {
  return "door" in wall;
}

/** A standing breakable wall (#3031): it blocks as a wall does, and draws as stone with its cracks. */
export type RenderableCrackedWall = RenderableWall & { readonly cracks: CrackStage };

export function isCrackedWall(wall: RenderableWall): wall is RenderableCrackedWall {
  return "cracks" in wall;
}

/** A deck's or ramp's outline, as a wall's without a layer. */
export type RenderableShape = RectRenderableWall | PolygonRenderableWall;

/** A body of water on one layer (#2983, #2984): how deep, and its shore. */
export interface MapWater {
  readonly layer: number;
  readonly depth: "deep" | "shallow";
  readonly area: RenderableShape;
}

/**
 * An effect zone on one layer (ADR-0053, #3024): its kind and its area,
 * and a timed one's beat or a moving one's way (#3029), drawn off the match clock.
 */
export interface MapZone {
  readonly kind: ZoneKind;
  readonly layer: number;
  readonly area: RenderableShape;
  readonly schedule?: ZoneSchedule;
  readonly path?: ZonePath;
}

/**
 * A switched deck (#3068) as it stands: up, it is walked; down, a
 * drawbridge stands at its hinge, or what fell hangs or lies in pieces.
 * `cracks` are the bodies that have stepped onto a collapsing floor.
 */
export interface RenderableSwitchedDeck extends Pick<
  SwitchedDeckData,
  "whenDown" | "hinge" | "afterCrossings"
> {
  /** Its place among the map's switched decks: the snapshot's `decks` index. */
  readonly at: number;
  readonly up: boolean;
  readonly cracks: number;
}

/** A lift (#3079) as it stands: resting at a layer or on its way, and how high, 0 to 1. */
export interface RenderableLift {
  readonly phase: LiftPhase;
  readonly progress: number;
}

/** A deck of a map (#3067). */
export interface MapDeck {
  readonly layer: number;
  readonly footprint: RenderableShape;
  readonly look: DeckLook;
  /** How it comes and goes (#3068) and how it stands now; `null` for a deck always there. */
  readonly switched: RenderableSwitchedDeck | null;
}

/** A map's floors above and below the ground (ADR-0051), its water and zones, from its file: never per tick. */
export interface MapStructure {
  readonly layerCount: number;
  /** What it is drawn in (#3172); a map of one layer is drawn flat whatever its biome. */
  readonly biome: Biome;
  /** Its ground: its rectangle, or an outline with natural land outside (#3066). */
  readonly bounds: MapBounds;
  /** The ground's layer: 1 on a map with pits and tunnels under it (#2973). */
  readonly ground: number;
  /** How it is lit (ADR-0052); a map without it is lit flat. */
  readonly lighting?: MapLighting;
  /** Its fog, smoke, steam and weather (#3032); a map without it has none. */
  readonly atmosphere?: MapAtmosphere;
  /** Its roads, squares and tracks (#3210), drawn on their layer's floor; a map without it has none. */
  readonly paving?: readonly MapPaving[];
  /** Each deck there is now, drawn as its `look` (#3067): a tower, a wall-walk, a bridge. */
  readonly decks: readonly MapDeck[];
  /** Each switched deck that is down (#3068): drawn as what is left of it, and nothing more. */
  readonly downDecks: readonly MapDeck[];
  /** Stretches of a raised edge you step off onto `layer - 1`, never climb (#3069). */
  readonly dropOffs: readonly {
    readonly layer: number;
    readonly from: Vec2;
    readonly to: Vec2;
  }[];
  /** Holes in the ground, their floor on `ground - 1` (#2973). */
  readonly pits: readonly { readonly footprint: RenderableShape }[];
  /** Floors under the ground, on `ground - 1`, the ground over them (#2973). */
  readonly tunnels: readonly { readonly footprint: RenderableShape }[];
  readonly transitions: readonly {
    readonly from: number;
    readonly to: number;
    readonly area: RenderableShape;
    readonly uphill: Uphill;
    readonly look: TransitionLook;
    /** How it runs if it is a lift (#3079); `null` for one walked up and down. */
    readonly lift: TransitionLift | null;
  }[];
  readonly water: readonly MapWater[];
  readonly zones: readonly MapZone[];
}

/** A rectangular map with one layer: no deck, no pit, no ramp, no water, no zone. */
export const FLAT_STRUCTURE: MapStructure = {
  layerCount: 1,
  biome: "hall",
  bounds: { kind: "rect" },
  ground: 0,
  decks: [],
  dropOffs: [],
  downDecks: [],
  pits: [],
  tunnels: [],
  transitions: [],
  water: [],
  zones: [],
};

/** A short-lived floating number or label above an actor. */
export interface FloatingText {
  readonly id: number;
  /** The actor it floats over; only texts over the same actor make room for each other. */
  readonly anchorId: string;
  readonly text: string;
  /** Where it starts, in the world; it rises from here as it ages. */
  readonly position: Vec2;
  /**
   * Screen px it starts above `position`, to clear the texts already over
   * the same actor (#54). Screen px, as the text is (#456).
   */
  readonly lift: number;
  readonly colour: number;
  /**
   * `"light"` for weapon swings: smaller and fainter, so a stream of
   * them never drowns a skill's number (#160). `"critical"` for a
   * critical hit: larger and bold, so it stands out of that stream (#533).
   */
  readonly weight: "normal" | "light" | "critical";
  /** Seconds of life remaining; the scene fades and removes it. */
  remainingSeconds: number;
}

export const FLOATING_TEXT_SECONDS = 1.2;
const FLOATING_TEXT_RISE_PER_SECOND = 24;
/** A 13px line of text, plus a pixel so neighbours never touch; screen px, as the rise is. */
export const FLOATING_TEXT_LINE = 14;
/** The most texts one actor carries at once; a steady stream would otherwise build a tower. */
export const FLOATING_TEXT_STACK = 4;

/** How far a floating text is above its `position` by now, screen px (#456). */
function floatingTextRise(text: FloatingText): number {
  const age = FLOATING_TEXT_SECONDS - text.remainingSeconds;
  return text.lift + FLOATING_TEXT_RISE_PER_SECOND * age;
}

/** Where a floating text is by now, in world y at camera `zoom`. */
export function floatingTextY(text: FloatingText, zoom: number): number {
  return text.position.y - screenPx(floatingTextRise(text), zoom);
}

/**
 * Where a new floating text starts so it covers none already over the
 * same actor (#54). Several hits landing together used to draw on one
 * spot as an unreadable smear. Each one that would overlap lifts the new
 * text a line above it, so a burst reads as a short column of numbers.
 *
 * Nothing, once the actor already carries `FLOATING_TEXT_STACK` texts:
 * the new one is dropped rather than stacked out of sight.
 *
 * @param zoom the camera's: texts are screen-sized (#456), so a line apart
 *   is screen px
 */
export function placeFloatingText(
  existing: readonly FloatingText[],
  incoming: FloatingText,
  zoom: number,
): FloatingText | undefined {
  const sameAnchor = existing.filter((text) => text.anchorId === incoming.anchorId);
  if (sameAnchor.length >= FLOATING_TEXT_STACK) {
    return undefined;
  }
  // In screen px, where the line is. Lowest first: lifting past one can
  // only reach those above it.
  const screenY = (text: FloatingText): number => floatingTextY(text, zoom) * zoom;
  const ys = sameAnchor.map(screenY).sort((a, b) => b - a);
  let y = screenY(incoming);
  for (const other of ys) {
    if (Math.abs(other - y) < FLOATING_TEXT_LINE) {
      y = other - FLOATING_TEXT_LINE;
    }
  }
  return { ...incoming, lift: incoming.lift + screenY(incoming) - y };
}

/**
 * Where an area skill landed (#5): a ring at its true radius in the
 * caster's side's colour, fading out (docs/art/art-direction.md).
 */
export interface AreaFlash {
  readonly id: number;
  readonly position: Vec2;
  readonly radius: number;
  readonly colour: number;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** How long a flash takes to fade from full to nothing. */
export const AREA_FLASH_SECONDS = 0.4;

/** Every flash `dt` seconds older, the faded ones gone. */
export function decayAreaFlashes(flashes: readonly AreaFlash[], dt: number): AreaFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

/** A flash's opacity: 1 when it lands, 0 when it is gone. */
export function areaFlashAlpha(flash: AreaFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / AREA_FLASH_SECONDS));
}

/**
 * A melee swing (#161): a 90° arc around the attacker, toward its target,
 * in the attacker's side's colour, fading out (docs/art/art-direction.md
 * "Swing flash"). It hugs the attacker, so it never reads as the target ring.
 */
export interface SwingFlash {
  readonly id: number;
  /** The attacker's centre when it swung. */
  readonly centre: Vec2;
  /** Toward the target, in radians. */
  readonly angle: number;
  readonly radius: number;
  readonly colour: number;
  /** Your own swing, which gets an `ink` line along its outer edge. */
  readonly own: boolean;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** A player's radius, as drawn: the ruleset's collision radius. */
export const ACTOR_RADIUS = 14;

/** A creature's (#1052), as drawn: the ruleset's `creatureRadius`. */
export const CREATURE_RADIUS = 10;

/**
 * Where a damage or heal number starts, from the body's centre: right of
 * the health bar, clear of the name ("Damage and heal numbers" in
 * docs/art/art-direction.md, #262). Here rather than with the other
 * floating-text constants, because it needs `ACTOR_RADIUS` declared first.
 */
export const FLOATING_TEXT_OFFSET_X = ACTOR_RADIUS + 4;
export const FLOATING_TEXT_OFFSET_Y = 8;

/** Short, so a dagger's rapid hits read as separate flashes, never a standing ring. */
export const SWING_FLASH_SECONDS = 0.12;
/** Outside the body: the attacker's radius plus this. */
export const SWING_FLASH_GAP = 6;

/** Every swing `dt` seconds older, the faded ones gone. */
export function decaySwingFlashes(flashes: readonly SwingFlash[], dt: number): SwingFlash[] {
  return flashes
    .map((flash) => ({ ...flash, remainingSeconds: flash.remainingSeconds - dt }))
    .filter((flash) => flash.remainingSeconds > 0);
}

export function swingFlashAlpha(flash: SwingFlash): number {
  return Math.max(0, Math.min(1, flash.remainingSeconds / SWING_FLASH_SECONDS));
}

/**
 * The Storm Beacon's strike (#2694): a jagged bolt from the beacon to the
 * body it hit, the same for both teams. It is what teaches the rule.
 */
export interface BeaconBolt {
  readonly id: number;
  readonly from: Vec2;
  readonly to: Vec2;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** Long enough to follow back to the beacon; a strike comes every 2.5 s. */
export const BEACON_BOLT_SECONDS = 0.35;
const BEACON_BOLT_SEGMENTS = 8;
/** How far a joint strays sideways from the straight line. */
const BEACON_BOLT_JITTER = 14;

/** Every bolt `dt` seconds older, the faded ones gone. */
export function decayBeaconBolts(bolts: readonly BeaconBolt[], dt: number): BeaconBolt[] {
  return bolts
    .map((bolt) => ({ ...bolt, remainingSeconds: bolt.remainingSeconds - dt }))
    .filter((bolt) => bolt.remainingSeconds > 0);
}

export function beaconBoltAlpha(bolt: BeaconBolt): number {
  return Math.max(0, Math.min(1, bolt.remainingSeconds / BEACON_BOLT_SECONDS));
}

/**
 * The bolt's joints, ends exact. The zig-zag comes from its id, so a bolt
 * keeps its shape while it fades.
 */
export function beaconBoltPoints(bolt: Pick<BeaconBolt, "id" | "from" | "to">): Vec2[] {
  const dx = bolt.to.x - bolt.from.x;
  const dy = bolt.to.y - bolt.from.y;
  const length = Math.hypot(dx, dy) || 1;
  return Array.from({ length: BEACON_BOLT_SEGMENTS + 1 }, (_, joint) => {
    const along = joint / BEACON_BOLT_SEGMENTS;
    const side =
      joint === 0 || joint === BEACON_BOLT_SEGMENTS
        ? 0
        : (joint % 2 === 0 ? 1 : -1) *
          BEACON_BOLT_JITTER *
          (0.4 + 0.6 * Math.abs(Math.sin(bolt.id * 12.9898 + joint * 78.233)));
    return {
      x: bolt.from.x + dx * along - (dy / length) * side,
      y: bolt.from.y + dy * along + (dx / length) * side,
    };
  });
}

/**
 * A ward or a trap on the ground (#1087, #1105): a circle in its side's
 * colour, its skill's icon at the centre. A ward's is a translucent
 * disc; a trap's, its outline alone.
 */
export interface RenderableGroundEffect {
  readonly id: number;
  readonly skillId: string;
  readonly position: Vec2;
  /** The layer it lies on (ADR-0051): drawn on that layer's deck. */
  readonly layer: number;
  readonly radius: number;
  readonly colour: number;
  readonly filled: boolean;
}

/**
 * `effect` as the arena draws it, for a viewer on `selfTeam`: an ally's in
 * the ally colour, any other's in the enemy's; `kind` says which list it
 * came in.
 */
export function toRenderableGroundEffect(
  effect: GroundEffectSnapshot,
  selfTeam: number | undefined,
  kind: "ward" | "trap",
): RenderableGroundEffect {
  return {
    id: effect.id,
    skillId: effect.skillId,
    position: { x: effect.x, y: effect.y },
    layer: effect.layer,
    radius: effect.radius,
    colour: teamColour(selfTeam === undefined ? "enemy" : teamSide(effect.team, selfTeam)),
    filled: kind === "ward",
  };
}

/** How far a shrine's ring reaches round it, world units (#1199). */
export const SHRINE_RADIUS = 40;

/** A team's resurrection shrine on the ground (#1199), in its side's colour. */
export interface RenderableShrine {
  readonly position: Vec2;
  readonly side: "ally" | "enemy";
}

export interface ArenaSnapshot {
  readonly actors: readonly RenderableActor[];
  readonly walls: readonly RenderableWall[];
  readonly structure: MapStructure;
  /** The map's resurrection shrines (#1199), their priests alive or not. */
  readonly shrines: readonly RenderableShrine[];
  /**
   * A Guild Battle's flags (#1225), or a Relic Run's relics (#1374), as
   * flags, wherever each is; `[]` on any other map.
   */
  readonly flags: readonly RenderableFlag[];
  /** A Guild Battle's flag stand (#1225); `undefined` on any other map. */
  readonly stand: RenderableStand | undefined;
  /** A Relic Run or King of the Hill altar (#1374, #1377); `undefined` on any other map. */
  readonly altar: Vec2 | undefined;
  /** Capture Points' shrines (#1378); `[]` on any other map. */
  readonly capturePoints: readonly RenderableCapturePoint[];
  /** The map's gates and their plates (#2691); `[]` on a map without them. */
  readonly gates: readonly RenderableGate[];
  /** The map's switches (#3025); `[]` on a map without them. */
  readonly switches: readonly RenderableSwitch[];
  /** The map's portals (#3030), on or off; `[]` on a map without them. */
  readonly teleports: readonly RenderableTeleport[];
  /**
   * The map's breakable walls (#3031), standing or crumbled; `[]` on a map
   * without them. A standing one is also among `walls`, which draw it.
   */
  readonly breakables: readonly RenderableBreakable[];
  /**
   * Each of the map's lifts (#3079), in its transitions' order: where it is
   * and how high; `[]` on a map without them.
   */
  readonly lifts: readonly RenderableLift[];
  readonly targetId: string | undefined;
  /** Weapon shots in flight (#161). */
  readonly projectiles: readonly RenderableProjectile[];
  /** Wards on the ground, oldest first (#1087), then your team's traps (#1105). */
  readonly groundEffects: readonly RenderableGroundEffect[];
  /** The match clock (`elapsedSeconds`), which projectiles fly against. */
  readonly clock: number;
  /**
   * The living body under the mouse cursor, whose name shows (#253), or
   * else the standing breakable wall (#3031), whose health bar shows.
   */
  readonly hoverId: string | undefined;
  /** The names key is held (Shift by default, #302): every name shows (#253). */
  readonly showAllNames: boolean;
  /**
   * Each drawn name tag's box (#2738), in world units, by actor id: while
   * `showAllNames`, a click on a name hits its actor.
   */
  readonly nameBoxes: ReadonlyMap<string, Rect>;
  /** The foe your team has called (#443): a chevron over it. */
  readonly calledId: string | undefined;
  /** Your team's pings on the floor (#443). */
  readonly pings: readonly RenderablePing[];
  /** Your team's lines on the compass (#2391), oldest first; the arena does not draw them. */
  readonly strokes: readonly RenderableStroke[];
  /** Goals on the ground that only you see (#3221), such as the tutorial's walk mark. */
  readonly goals: readonly GoalMark[];
}

/** One segment of a line drawn on the compass (#2391), in world units. */
export interface RenderableStroke {
  readonly points: readonly Vec2[];
  /** Seconds left of it. */
  readonly remaining: number;
}

export const EMPTY_SNAPSHOT: ArenaSnapshot = {
  actors: [],
  walls: [],
  shrines: [],
  flags: [],
  structure: FLAT_STRUCTURE,
  stand: undefined,
  altar: undefined,
  capturePoints: [],
  gates: [],
  switches: [],
  teleports: [],
  breakables: [],
  lifts: [],
  targetId: undefined,
  projectiles: [],
  groundEffects: [],
  clock: 0,
  hoverId: undefined,
  showAllNames: false,
  nameBoxes: new Map(),
  calledId: undefined,
  pings: [],
  strokes: [],
  goals: [],
};

/** `snapshot` with your team's calls on it (#443). */
export function withCalls(snapshot: ArenaSnapshot, calls: CallsSnapshot): ArenaSnapshot {
  return {
    ...snapshot,
    calledId: calls.target?.targetId,
    pings: calls.pings.map((ping) => ({
      id: ping.id,
      position: { x: ping.x, y: ping.y },
      remaining: ping.remaining,
    })),
    strokes: calls.strokes.map((stroke) => ({
      points: stroke.points.map(([x, y]) => ({ x, y })),
      remaining: stroke.remaining,
    })),
  };
}

/**
 * Two hues, for two sides (docs/art/art-direction.md): `friend` blue and
 * `foe` red, which stay apart under every common colour-vision deficiency,
 * where the old green allies did not. You are drawn in your team's blue;
 * what marks you out is the ink rim the scene adds, not a hue of your own.
 * A three-team match's second foe is a lemon-lime: it stays apart from the
 * ally blue and the foe red under deuteranopia, protanopia and tritanopia
 * (simulated ΔE76 ≥ 45, #2755), and its tags carry a ◆ as well (`teamMark`).
 */
const TEAM_COLOURS: Record<RenderableActor["team"], number> = {
  self: 0x59c2ff,
  ally: 0x59c2ff,
  enemy: 0xff7b72,
  third: 0xf0ff40,
};

/**
 * The colour team `team` wears to someone on team `ours` (#2684): ours
 * the ally's, the lowest other team the enemy's, and a third team, if
 * any, yellow. A watcher sees from team 1's side, as the scoreboard does.
 */
export function teamSide(team: number, ours: number): "ally" | "enemy" | "third" {
  if (team === ours) {
    return "ally";
  }
  const firstFoe = ours === 0 ? 1 : 0;
  return team === firstFoe ? "enemy" : "third";
}

/** The glyph the third team's tags and rows carry, so colour is never the only cue (#2755). */
export const THIRD_TEAM_MARK = "◆";

/** `text` with the third team's ◆ before it; any other side's text as it is. */
export function markedForTeam(side: "ally" | "enemy" | "third" | "self", text: string): string {
  return side === "third" ? `${THIRD_TEAM_MARK} ${text}` : text;
}

/** Edges every living body, darker than the grid and walls, so no body blends into what it stands on. */
export const BODY_EDGE = 0x0b0f14;
/** A corpse's hollow circle, and the glyph inside it. */
export const DEAD_COLOUR = 0x4a5464;
/** An exploited corpse's circle and glyph (#466): darker than a fresh one. */
export const EXPLOITED_CORPSE_COLOUR = 0x262b33;

/** Colour lookup must stay total over the team union. */
export function teamColour(team: RenderableActor["team"]): number {
  return TEAM_COLOURS[team];
}

/**
 * Hit-test a point against actors; used by click-to-target (brief §5).
 *
 * The living come first: clicking a corpse selects whoever is standing
 * behind it. With nobody living under the point, an ally's corpse is
 * picked, so a resurrection has something to aim at (#812). A foe's
 * corpse never is.
 *
 * With `tagBoxes` (#2738: while Show names is held), an actor is also hit
 * anywhere in the column from its name tag's top down to its body's
 * bottom, as wide as the wider of the two. A body under the point still
 * wins; among columns, the nearest body centre does.
 */
export function actorAtPoint(
  snapshot: ArenaSnapshot,
  point: Vec2,
  tagBoxes?: ReadonlyMap<string, Rect>,
): RenderableActor | undefined {
  const living = (actor: RenderableActor): boolean => !actor.dead;
  const allyCorpse = (actor: RenderableActor): boolean => actor.dead && actor.team === "ally";
  // A body on a deck is drawn lifted (ADR-0051): a click finds it there.
  const actors =
    snapshot.structure.layerCount === 1
      ? snapshot.actors
      : snapshot.actors.map((actor) => ({
          ...actor,
          position: {
            x: actor.position.x,
            y:
              actor.position.y -
              liftAt(snapshot.structure, snapshot.lifts, actor.position, actor.layer),
          },
        }));
  return (
    nearestUnder(actors, point, living) ??
    nearestInColumn(actors, point, living, tagBoxes) ??
    nearestUnder(actors, point, allyCorpse) ??
    nearestInColumn(actors, point, allyCorpse, tagBoxes)
  );
}

/** An axis-aligned box, in world units. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The actor among `actors` that `accepts` whose name-and-body column
 * holds `point`, nearest by body centre; nothing without `tagBoxes`, or
 * for an actor with no tag drawn (yourself).
 */
function nearestInColumn(
  actors: readonly RenderableActor[],
  point: Vec2,
  accepts: (actor: RenderableActor) => boolean,
  tagBoxes: ReadonlyMap<string, Rect> | undefined,
): RenderableActor | undefined {
  if (tagBoxes === undefined) {
    return undefined;
  }
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of actors) {
    const tag = tagBoxes.get(actor.id);
    if (tag === undefined || !accepts(actor)) {
      continue;
    }
    const { x, y } = actor.position;
    const r = actor.radius;
    const inside =
      point.x >= Math.min(tag.left, x - r) &&
      point.x <= Math.max(tag.right, x + r) &&
      point.y >= tag.top &&
      point.y <= y + r;
    const d = Vec.distance(actor.position, point);
    if (inside && d < bestDistance) {
      best = actor;
      bestDistance = d;
    }
  }
  return best;
}

/** The actor among `actors` that `accepts` nearest `point`, within its radius. */
function nearestUnder(
  actors: readonly RenderableActor[],
  point: Vec2,
  accepts: (actor: RenderableActor) => boolean,
): RenderableActor | undefined {
  let best: RenderableActor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const actor of actors) {
    if (!accepts(actor)) {
      continue;
    }
    const d = Vec.distance(actor.position, point);
    if (d <= actor.radius && d < bestDistance) {
      best = actor;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * `snapshot` with whose names show this frame (#253): the body under
 * `pointer` (in world units, `undefined` once the cursor left the
 * arena), hit-tested like a click, so a foe's corpse is never picked, and
 * every name while `showAllNames`. Then a name is part of the hit
 * (#2738): `nameBoxes` are the tags the scene drew last frame.
 */
export function withNames(
  snapshot: ArenaSnapshot,
  pointer: Vec2 | undefined,
  showAllNames: boolean,
  nameBoxes: ReadonlyMap<string, Rect>,
): ArenaSnapshot {
  const hoverId =
    pointer === undefined
      ? undefined
      : (actorAtPoint(snapshot, pointer, showAllNames ? nameBoxes : undefined)?.id ??
        breakableAtPoint(snapshot.breakables, pointer, snapshot.structure));
  return { ...snapshot, hoverId, showAllNames, nameBoxes };
}

/**
 * Whether `actor`'s name label is drawn (#253): only your target's, the
 * body's under the cursor, and everyone's while the names key is held. Eleven
 * pixel names over every body smeared together as soon as two stood
 * close. Never your own: the ink rim marks you.
 */
export function nameShown(snapshot: ArenaSnapshot, actor: RenderableActor): boolean {
  if (actor.team === "self") {
    return false;
  }
  return snapshot.showAllNames || actor.id === snapshot.targetId || actor.id === snapshot.hoverId;
}

/** Health as a 0..1 fraction, clamped — the shape a health bar needs. */
export function healthFraction(actor: RenderableActor): number {
  if (actor.maxHealth <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, actor.health / actor.maxHealth));
}

/** The cast bar's top, in world units above a living body's edge. */
const CAST_BAR_TOP = 19;
/** Screen px between a name and the cast bar, or a corpse's edge, under it (#456). */
const NAME_GAP_LIVING = 3;
const NAME_GAP_DEAD = 4;
/** A name label's height, screen px: its 11 px text (#456). */
export const NAME_LABEL_HEIGHT = 11;

/**
 * Where an actor's name label sits: its bottom edge, in world y (#53), at
 * camera `zoom`. The label is screen-sized (#456), so the gap under it is
 * screen px at every zoom.
 *
 * Clear of the cast bar whether or not one is showing, so a name does not
 * jump every time its owner starts casting. A corpse has no bars, so its
 * name sits just over the circle.
 */
export function nameLabelBottom(actor: RenderableActor, zoom: number): number {
  const { y } = actor.position;
  if (actor.dead) {
    return y - actor.radius - screenPx(NAME_GAP_DEAD, zoom);
  }
  return y - actor.radius - CAST_BAR_TOP - screenPx(NAME_GAP_LIVING, zoom);
}

/** The shield: an arc on the body's centre, 45° to 105° left of the facing, at r + 3.5 (#275). */
const SHIELD_FROM = (45 * Math.PI) / 180;
const SHIELD_TO = (105 * Math.PI) / 180;
/** The focus: a ring of radius 1.75 centred 75° left of the facing, at r + 3.5 (#275). */
const FOCUS_ANGLE = (75 * Math.PI) / 180;
const FOCUS_RADIUS = 1.75;
/** Both off-hand marks' centrelines sit this far past the body's edge. */
const OFFHAND_REACH = 3.5;

/**
 * The off-hand mark (#276, docs/art/art-direction.md "Player mark"), cased
 * like the weapon mark: an `edge` stroke `casing` px wide under an `ink`
 * stroke `core` px wide, both along the same centreline.
 */
export type OffhandMarkLayout =
  /** The shield: a circular arc on the body's centre, clockwise from `from` to `to`. */
  | {
      readonly kind: "arc";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly from: number;
      readonly to: number;
      readonly casing: number;
      readonly core: number;
    }
  /** The focus: a small ring off the body. */
  | {
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly casing: number;
      readonly core: number;
    };

/**
 * The off-hand mark of a body of radius `r` at (`x`, `y`), facing `facing`
 * radians, on its left: in screen coordinates, y down, that is the facing
 * minus the angle. `undefined` for no off-hand: nothing to draw.
 */
export function offhandMarkLayout(
  x: number,
  y: number,
  r: number,
  facing: number,
  offhandId: OffhandId | undefined,
): OffhandMarkLayout | undefined {
  switch (offhandId) {
    case undefined:
      return undefined;
    case "shield":
      return {
        kind: "arc",
        x,
        y,
        radius: r + OFFHAND_REACH,
        from: facing - SHIELD_TO,
        to: facing - SHIELD_FROM,
        casing: 5,
        core: 3,
      };
    case "focus": {
      const angle = facing - FOCUS_ANGLE;
      return {
        kind: "ring",
        x: x + Math.cos(angle) * (r + OFFHAND_REACH),
        y: y + Math.sin(angle) * (r + OFFHAND_REACH),
        radius: FOCUS_RADIUS,
        casing: 3,
        core: 1.5,
      };
    }
  }
}

/** Between the glyph and the name. */
const PROFESSION_GLYPH_GAP = 2;

/** A player's signet on its name plate (#2805), screen px, and the gap after it. */
export const NAMEPLATE_SIGNET_SIZE = 16;
const NAMEPLATE_SIGNET_GAP = 2;

/** The arena's texture for `bits`' signet (#2805), one per bits. */
export function signetTextureKey(bits: number): string {
  return `signet-${String(bits)}`;
}

/**
 * Where a name, its profession glyph and its signet go: centre x of
 * each, and their shared bottom, in world units.
 */
export interface NameplateLayout {
  /** `undefined`: the actor has no profession, so no glyph. */
  readonly glyphX: number | undefined;
  /** `undefined`: no signet drawn (#2805), and no gap left for one. */
  readonly signetX: number | undefined;
  readonly textX: number;
  readonly bottom: number;
}

/**
 * Lay out an actor's name, the glyph before it (#281) and its signet
 * just left of the name (#2805): all centred together on the body, so a
 * long name pushes the others left with it, and all sit on
 * `nameLabelBottom`. Each is screen-sized (#456), so their widths are
 * screen px, laid out in world units at `zoom`.
 *
 * @param textWidth the label's measured width, screen px, never a
 *   character count: a name can be any script (#192)
 * @param signetDrawn whether the actor's signet texture is ready to draw;
 *   until it is, the plate leaves no gap for one
 */
export function nameplateLayout(
  actor: RenderableActor,
  textWidth: number,
  zoom: number,
  signetDrawn: boolean,
): NameplateLayout {
  const bottom = nameLabelBottom(actor, zoom);
  const { x } = actor.position;
  const glyph = screenPx(PROFESSION_GLYPH_SIZE, zoom);
  const glyphRun =
    actor.profession === undefined ? 0 : glyph + screenPx(PROFESSION_GLYPH_GAP, zoom);
  const signet = screenPx(NAMEPLATE_SIGNET_SIZE, zoom);
  const withSignet = signetDrawn && actor.signet !== undefined;
  const signetRun = withSignet ? signet + screenPx(NAMEPLATE_SIGNET_GAP, zoom) : 0;
  const text = screenPx(textWidth, zoom);
  const left = x - (glyphRun + signetRun + text) / 2;
  return {
    glyphX: actor.profession === undefined ? undefined : left + glyph / 2,
    signetX: withSignet ? left + glyphRun + signet / 2 : undefined,
    textX: left + glyphRun + signetRun + text / 2,
    bottom,
  };
}

/**
 * The box an actor's drawn name tag covers (#2738): glyph, signet and
 * label laid out by `nameplateLayout`, as tall as the tallest. World
 * units, so the hit it makes does not change with zoom.
 *
 * @param textWidth the label's width, screen px, as `nameplateLayout`'s
 * @param textHeight its height, screen px
 */
export function nameTagBox(
  actor: RenderableActor,
  textWidth: number,
  textHeight: number,
  zoom: number,
  signetDrawn: boolean,
): Rect {
  const layout = nameplateLayout(actor, textWidth, zoom, signetDrawn);
  const text = screenPx(textWidth, zoom);
  const right = layout.textX + text / 2;
  const left =
    layout.glyphX !== undefined
      ? layout.glyphX - screenPx(PROFESSION_GLYPH_SIZE, zoom) / 2
      : layout.signetX !== undefined
        ? layout.signetX - screenPx(NAMEPLATE_SIGNET_SIZE, zoom) / 2
        : layout.textX - text / 2;
  const height = screenPx(
    Math.max(
      textHeight,
      layout.glyphX === undefined ? 0 : PROFESSION_GLYPH_SIZE,
      layout.signetX === undefined ? 0 : NAMEPLATE_SIGNET_SIZE,
    ),
    zoom,
  );
  return { left, top: layout.bottom - height, right, bottom: layout.bottom };
}

/** The primary profession's glyph inside the body (#1037, Q105 B), world units. */
export const BODY_GLYPH_SIZE = 13;
export const BODY_GLYPH_ALPHA = 0.6;

/**
 * A creature's kind glyph (#1162): the study's glyph scale (0.95) over the
 * icon's 14-unit box, at `CREATURE_RADIUS`, scaled with the drawn radius.
 * Opaque, as the study draws it.
 */
export const CREATURE_GLYPH_SIZE = 13.3;
/** A Ghostly Hero's glyph (#1377): the priest's, pale, until its own is drawn. */
export const GHOST_GLYPH_TINT = 0xdfe8f2;

/** What a body glyph shows: its primary profession, or a creature's kind (#1162). */
export type BodyGlyph =
  | { readonly kind: "profession"; readonly profession: ProfessionId }
  | { readonly kind: "creature"; readonly look: CreatureLook };

export interface BodyGlyphLayout {
  readonly glyph: BodyGlyph;
  readonly x: number;
  readonly y: number;
  /** World units, square. */
  readonly size: number;
  /** Tint colour and alpha: edge at 60 % alive, dead grey at 1 on a corpse. */
  readonly tint: number;
  readonly alpha: number;
}

/**
 * The glyph inside `actor`'s body (#1037): upright, centred, a dark mark
 * on the team colour, under the weapon mark. World sized, so it scales
 * with the body at every zoom. A player's is its primary profession's, at
 * 60 %, shrunk to fit its flattened disc when knocked down; a creature's
 * is its kind's (#1162), opaque, and its shape never lies down; a
 * Ghostly Hero's pale (#1377). A corpse greys it.
 *
 * `undefined`: neither a profession nor a creature, so no glyph.
 */
export function bodyGlyphLayout(actor: RenderableActor): BodyGlyphLayout | undefined {
  const creature = actor.creatureLook !== undefined;
  const glyph: BodyGlyph | undefined =
    actor.creatureLook !== undefined
      ? { kind: "creature", look: actor.creatureLook }
      : actor.profession !== undefined
        ? { kind: "profession", profession: actor.profession }
        : undefined;
  if (glyph === undefined) {
    return undefined;
  }
  const { x, y } = actor.position;
  // A creature's glyph grows with its drawn radius (#2047).
  const size = creature ? (CREATURE_GLYPH_SIZE * actor.radius) / CREATURE_RADIUS : BODY_GLYPH_SIZE;
  if (actor.dead) {
    return {
      glyph,
      x,
      y,
      size,
      tint: actor.exploited ? EXPLOITED_CORPSE_COLOUR : DEAD_COLOUR,
      alpha: 1,
    };
  }
  return {
    glyph,
    x,
    y,
    size: actor.knockedDown && !creature ? size * LYING_WIDTH : size,
    tint: actor.creatureLook === "ghostly-hero" ? GHOST_GLYPH_TINT : BODY_EDGE,
    alpha: creature ? 1 : BODY_GLYPH_ALPHA,
  };
}

/** `decks` as a structure holds them (#3068): those standing, and the switched ones that are down. */
export function placedDecks(decks: readonly MapDeck[]): Pick<MapStructure, "decks" | "downDecks"> {
  return {
    decks: decks.filter(({ switched }) => switched === null || switched.up),
    downDecks: decks.filter(({ switched }) => switched !== null && !switched.up),
  };
}

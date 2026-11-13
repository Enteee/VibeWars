import Phaser from "phaser";

import type { MapAtmosphere, MapBounds, MapLighting, MapPaving } from "@vibewars/game-maps/schema";

import {
  ALTAR_REACH_UNITS,
  CAPTURE_REACH_UNITS,
  GATE_PLATE_REACH_UNITS,
  isStatusId,
  isWeaponId,
  ZONE_RULES,
  zoneOffsetAt,
  zonePhaseAt,
  polygonCentre,
  TELEPORT_COOLDOWN_SECONDS,
  type CreatureLook,
  type StatusId,
  type Vec2,
} from "@vibewars/game-core";

import { taggedName } from "../ui/bot-tag.js";
import { nameplateName, playerLabelText, signetUrl } from "../ui/player-label.js";
import { prefersReducedMotion } from "../ui/recharge-overlay.js";
import {
  BODY_EDGE,
  DEAD_COLOUR,
  EMPTY_SNAPSHOT,
  EXPLOITED_CORPSE_COLOUR,
  NAMEPLATE_SIGNET_SIZE,
  SHRINE_RADIUS,
  areaFlashAlpha,
  bodyGlyphLayout,
  decayAreaFlashes,
  decayBeaconBolts,
  beaconBoltAlpha,
  beaconBoltPoints,
  decaySwingFlashes,
  floatingTextY,
  healthFraction,
  nameShown,
  nameTagBox,
  nameplateLayout,
  placeFloatingText,
  signetTextureKey,
  swingFlashAlpha,
  markedForTeam,
  teamColour,
  type AreaFlash,
  type NameplateLayout,
  type Rect,
  type BeaconBolt,
  type SwingFlash,
  isDoor,
  isCrackedWall,
} from "./arena-snapshot.js";
import {
  CHARACTER_BANDS,
  characterBand,
  DROP_FALL_SECONDS,
  easeElevation,
  fallLift,
  elevationOf,
  renderOrder,
  type RenderItem,
} from "./render-order.js";
import {
  ARENA_BACKGROUND,
  BIOME,
  DECK_LIP,
  PIT_FLOOR,
  PIT_WALL,
  TUNNEL_INLAY,
  TUNNEL_MOUTH,
  WALL_STROKE,
  arenaPalette,
  type ArenaPalette,
  pavingPalette,
  type PavingLookColours,
} from "./arena-palette.js";
import {
  trackAlt,
  type AltTracker,
  CREATURE_PATH,
  WALL_HEIGHT,
  deckCovers,
  deckHeldBy,
  deckSideLow,
  shapeOutline,
  southFacingEdges,
  sweptEdges,
  standingDraw,
  hiddenCrop,
  liftAt,
  occludersOf,
  overhangAt,
  pickSurface,
  pitDrawing,
  openEdges,
  besideDropOff,
  brokenLip,
  rampDrawing,
  rampFrame,
  RING_PATH,
  traceHiddenOutline,
  tunnelCover,
  traceHiddenPolyline,
  type Occluder,
} from "./layer-surfaces.js";
import {
  ARENA_ATLAS_JSON,
  ARENA_ATLAS_SVG,
  bodyProfessionFrame,
  creatureFrame,
  groundFrame,
  professionFrame,
  projectileFrame,
  skillTypeFrame,
  statusFrame,
  type AtlasMap,
} from "./arena-atlas.js";
import {
  MatchClock,
  projectileHeading,
  projectileLanding,
  projectilePosition,
  shotFadeAlpha,
} from "./projectiles.js";
import { NO_COVER, snapView, type CameraView, type Cover } from "./camera-rig.js";
import { edgeMarkers, type EdgeMarker, type EdgeThing } from "./edge-markers.js";
import { statusRowLayout } from "./status-icons.js";
import {
  decayWalkMarker,
  walkMarkerAlpha,
  walkMarkerAt,
  walkMarkerTicks,
  type WalkMarker,
} from "./walk-marker.js";
import { weaponMarkLayout } from "./weapon-mark.js";
import { AttackClock, REST_FRAME, shownFrame, type AttackFrame } from "./attack-clock.js";
import { impactMarks, mergeImpacts, type Impact } from "./body-impacts.js";
import { conditionMarks, cuePhase } from "./body-conditions.js";
import {
  ENCHANTMENT_COLOUR,
  ENCHANT_MOTES,
  HEX_COLOUR,
  HEX_HALO_BROKEN,
  HEX_HALO_SIDES,
  HEX_HALO_WIDTH,
  STANCE_COLOUR,
  STANCE_STREAKS,
  STREAK_WIDTH,
  bodyRings,
  enchantMote,
  hexHalo,
  hexHaloCorner,
  hexHaloTurn,
  invulnerableAlpha,
  invulnerableRing,
  stanceStreak,
  type Mote,
  type RingArc,
  type Streak,
} from "./body-rings.js";
import {
  capeJumped,
  newCapeMotion,
  reprimeCapeMotion,
  stepCapeMotion,
  type CapeMotion,
} from "./cape-motion.js";
import { CREATURE_ARMS } from "./creature-arms.js";
import {
  DEAD_DASH,
  DEAD_GAP,
  RING_CASING,
  TICK_EDGE,
  creatureOrnament,
  creatureOutline,
  creatureTick,
  dashes,
  type OrnamentColour,
} from "./creature-shape.js";
import { CAST_BADGE_SIZE, CAST_BAR_RISE, castBadgeLayout } from "./cast-badge.js";
import {
  PING_HEAD_RADIUS,
  PING_PIN_HEIGHT,
  callChevron,
  pingRing,
  type RenderablePing,
} from "./call-marks.js";
import {
  FLAG_PICK_RADIUS,
  STAND_RADIUS,
  type RenderableCapturePoint,
  type RenderableGate,
  type RenderableSwitch,
  type RenderableTeleport,
  type RenderableFlag,
} from "./flag-objects.js";
import { goalMarkCommands, goalMarkFade, type GoalMark } from "./goal-mark.js";
import { lyingPose } from "./lying-pose.js";
import { cullToView, StaticGraphicsCull, type Box } from "./graphics-cull.js";
import { mapLayerChanged, type MapLayer } from "./map-layer.js";
import { LightingPass, litStructurePalette, baseTint } from "./lighting-pass.js";
import {
  DECK_ART,
  SWITCHED_DECK_ART,
  TRANSITION_ART,
  deckPalette,
  transitionPalette,
  type DeckFrame,
} from "./structure-art.js";
import { liftFrame, liftPlatform, liftShaft, type LiftFrame } from "./lift-art.js";
import { paintDeckShadows } from "./shadow-geometry.js";
import { lightingOn } from "./lighting-preference.js";
import { LIGHT_MARK_ART, lightMarkKey } from "./light-mark.js";
import { SWITCH_MARK_ART, leverThrown, switchMarkKey } from "./switch-mark.js";
import { paintArrival, paintTeleportEntry, paintTeleportExit } from "./teleport-mark.js";
import { doorPalette, GATE_ART, paintPlate, type GatePainter } from "./gate-mark.js";
import {
  BARRIER_ART,
  BREAKABLE_ART,
  breakablePalette,
  DUST_SECONDS,
  paintDust,
  type StonePainter,
} from "./breakable-mark.js";
import {
  breakableBarAnchor,
  breakableHealthFraction,
  type RenderableBreakable,
} from "./breakable-objects.js";
import {
  BODY_LIGHT_FLOOR,
  bodyTintOf,
  lightAt,
  multiplyColour,
  shadedBodyTint,
  steadyLighting,
  type LightSample,
} from "./lighting-model.js";
import { WATER_ART, waterArtKey, type WaterPainter } from "./water-painter.js";
import { waterShapeOf, type WaterShape } from "./water-shape.js";
import { SPIRE_LOOK, ZONE_EDGE_WIDTH, ZONE_LOOK, strikeEdgeScale } from "./zone-look.js";
import { HAZARD_ART, hazardKindOf, pathMotionAt, phaseProgressAt } from "./hazard-marks.js";
import {
  OUTSIDE_TILE,
  outsideCover,
  outsideFrame,
  paintOutsideEdge,
  paintOutsideTile,
  type OutsidePainter,
} from "./outside-land.js";
import { paintPaving, pavingDrawing, pavingTextureSizes } from "./paving-painter.js";
import { withZoneLights } from "./zone-light.js";
import { insideRuns, shownFill } from "./cell-cover.js";
import {
  AtmosphereParticles,
  fogArtOf,
  paintFog,
  paintParticle,
  paintVent,
  paintWeatherWash,
  type AtmospherePainter,
  type FogArt,
} from "./atmosphere.js";
import { fillDisc, strokeDisc } from "./disc.js";
import {
  paintZoneGround,
  paintZoneMotion,
  zoneArtOf,
  zoneGroundAlpha,
  type ZoneArt,
  type ZoneMotionPainter,
} from "./zone-painter.js";
import { screenPx, screenSized } from "./screen-text.js";
import {
  BODY_EDGE_WIDTH,
  SELF_RIM,
  paintBodyMarks,
  paintStandingBody,
  paintWeaponMark,
  type Painter,
  type WornCape,
} from "./body-painter.js";
import type { Point } from "./weapon-mark-geometry.js";
import type {
  ArenaSnapshot,
  FloatingText,
  RenderableActor,
  RenderableWall,
  RenderableShape,
  MapStructure,
  MapZone,
} from "./arena-snapshot.js";

/**
 * Minimal geometric renderer (brief §20's visual language).
 *
 * This scene is a *view*. It reads a snapshot and draws it; it never
 * decides anything about the game (brief §41). The snapshot shape and its
 * pure helpers live in `arena-snapshot.ts`, which has no Phaser
 * dependency — see that file for why that split exists.
 */

const BEACON_BOLT_GLOW = 0x79c0ff;
const BEACON_BOLT_CORE = 0xf0f6ff;
/** How far apart the side face's stacked outlines lay, in world units: where its top still ends. */
const SIDE_FACE_SLICE = 2;
/** The cell, world units, a fill leaves out where a deck covers it (#3162), and how far past the deck's edge. */
const SHOWN_FILL_CELL = 32;
const SHOWN_FILL_MARGIN = 2;
/** Line widths, in CSS px: a deck's lip and a wall's lit edge. */
const DECK_LIP_WIDTH = 3;
/** The dark of a drop-off's broken lip, under its pale crumbled edge (#3069). */
const DROP_OFF_CRACK = 0x2a2420;
const WALL_LIT_WIDTH = 2;
/** Pixels per world unit of a zone's painted ground (#3052): sharp at a close zoom. */
const ZONE_TEXTURE_SCALE = 2;
/** The longest side of a zone's ground texture, in pixels, however large the zone. */
const ZONE_TEXTURE_MAX_SIDE = 2048;
/** Zone grounds made so far: each texture gets a key of its own, across maps and restarts. */
let zoneGroundTextures = 0;
/** Pavings painted so far: each texture gets a key of its own, across maps and restarts. */
let pavingTextures = 0;

/** A painted zone's ground (#3052): its art, its image and the texture the image shows. */
interface ZoneGround {
  readonly art: ZoneArt;
  readonly image: Phaser.GameObjects.Image;
  readonly key: string;
}
/** The hover marker on a layered map (#2831), its dashes on the ground. */
const HOVER_RING = 0xd7dee8;
const HOVER_RADIUS = 12;
const HOVER_DASHES = 8;

const TARGET_RING = 0xffd866;
/** The `condition` orange: your team's called foe wears its chevron (#443). */
const CALL_CHEVRON = 0xffa657;
/**
 * The target ring's radius past the body's edge (operator Q26): its 2 px
 * stroke spans r + 8 … r + 10, clear of the weapon mark (r + 7.5) and the
 * off-hand mark (inside r + 7).
 */
const TARGET_RING_OFFSET = 9;
/** A body that moved this recently still streaks in its stance (#3226): snapshots do not move it every frame. */
const MOVING_SECONDS = 0.15;

/** Where a body stood last frame, the way it last moved, and when (#3226). */
interface BodyMotion {
  x: number;
  y: number;
  ux: number;
  uy: number;
  movedAt: number;
}
/** A flag's pole, world units up from its foot (#1225): stand-in shapes until its asset. */
const FLAG_POLE = 26;
/** Its pennant, along the pole and out from it. */
const FLAG_PENNANT_HEIGHT = 11;
const FLAG_PENNANT_LENGTH = 16;
/** A carried flag stands on its carrier's head: this far up from the body's centre. */
const FLAG_CARRIED_LIFT = 22;
/** The flag stand nobody holds, neutral grey (#1225). */
const STAND_NEUTRAL = 0x8b949e;
/** The altar on an edge marker (#1413): the palette's `altar` gold, as the compass draws it (#1388). */
const ALTAR_GOLD = 0xc8a45a;
const FLAG_POLE_COLOUR = 0xd8dee9;
const HEALTH_BAR_BG = 0x11161d;
const HEALTH_BAR_FILL = 0x7ee787;
const HEALTH_BAR_LOW = 0xff7b72;
// Ink, not blue: a blue bar over an enemy would read as "an ally".
const CAST_BAR_FILL = 0xd7dee8;
/** Marks the actor you control, inside its circle, in any team colour. */
/** A condition cue's outline, and a bubble's stroke (#1138). */
const CUE_EDGE_WIDTH = 1;
/** How opaque a weapon swing's number is at most: present, never louder than a skill (#160). */
const LIGHT_TEXT_ALPHA = 0.8;
/** A floating text's size by weight: a critical hit is the loudest number on screen (#533). */
const FLOATING_FONT_SIZE: Readonly<Record<FloatingText["weight"], string>> = {
  light: "11px",
  normal: "13px",
  critical: "17px",
};
const INK = "#d7dee8";
/**
 * The outline under every floating number and cue: `BODY_EDGE` as a CSS
 * colour. "Every number wears a 3 px edge outline" (docs/art/art-direction.md),
 * so a heal over a full health bar, or damage over a melee attacker, still
 * reads (#274).
 */
const TEXT_EDGE = "#0b0f14";
const DEAD_INK = "#4a5464";
/** The same two inks as tints, for the profession glyph before a name (#281). */
const INK_TINT = 0xd7dee8;
const DEAD_INK_TINT = 0x4a5464;
/**
 * The name a click would hit (#2738): the target ring's yellow, so what
 * you point at reads as what you would pick.
 */
const HOVER_INK = "#ffd866";
const HOVER_INK_TINT = TARGET_RING;

/** An off-screen marker's length, tip to base, and width, screen px (#440). */
const EDGE_MARKER_LENGTH = 12;
const EDGE_MARKER_WIDTH = 10;
/** A skill impact's spikes and ring (#1139). */
const IMPACT_LINE_WIDTH = 1.5;
/**
 * The world's layers, bottom up (#1037). Wards on the floor and their
 * icons (#1087), under everything that stands on them; the grid and the
 * walls, drawn only when they change (#1353); what moves on the floor and the
 * bodies, with their enchantment and hex rings (#1117) and condition cues
 * (#1138); the profession glyph inside each body; every mark on a body
 * (off-hand, weapon, target ring, call chevron, bars, swing flashes, skill
 * impacts), so a weapon crosses the glyph, never the reverse; the casting
 * skill's type badge by the cast bar (#1125); then shots, status icons, names and
 * numbers, which were over the bodies before the split, so a long name may
 * cover a badge's top edge.
 */
const GROUND_DEPTH = renderOrder({ kind: "ground-effect", layer: 0 });
/** A layered map's opaque floor and the grid: under the water and the ward and trap circles on it. */
const OUTSIDE_DEPTH = renderOrder({ kind: "outside" });
const FLOOR_DEPTH = renderOrder({ kind: "floor" });
/** The wards on a lit map: over its light, which never darkens them (ADR-0052). */
const LIT_GROUND_DEPTH = renderOrder({ kind: "lit-ground-effect" });
const MAP_DEPTH = renderOrder({ kind: "terrain" });
const EFFECT_DEPTH = renderOrder({ kind: "effect" });
const CAST_BADGE_DEPTH = renderOrder({ kind: "cast-badge" });
const OVERLAY_DEPTH = renderOrder({ kind: "ui" });
/** Over every world object, names and numbers included. */
const EDGE_MARKER_DEPTH = renderOrder({ kind: "edge-marker" });
/** How far apart the floor's grid lines are, world units. */
const GRID_STEP = 64;
/** The arena's icon sheet (#1671) and its frame map, as Phaser keys them. */
const ATLAS = "arena-atlas";
const ATLAS_MAP = "arena-atlas-map";

/** A ward's icon at its centre (#1087), world units. */
const GROUND_ICON_SIZE = 22;
const GROUND_ICON_ALPHA = 0.55;

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  /** Wards on the floor (#1087), under the grid, walls and bodies. */
  private groundGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Each ward's icon, by ground effect id (#1087). */
  private groundIcons = new Map<number, Phaser.GameObjects.Image>();
  /** Wards on decks (#2979), one `Graphics` per layer above the ground, made when first needed. */
  private deckGroundGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Each deck ward's icon, by ground effect id; its depth is its layer's, for life. */
  private deckGroundIcons = new Map<number, Phaser.GameObjects.Image>();
  /** The opaque floor of a layered map, under the wards. */
  private floorGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The grid, the arena's edge and the walls (#1353), over the wards; drawn when they change. */
  private mapGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The land outside a ground outline (#3066), while the map has one. */
  private outside: OutsideLand | undefined;
  /** What `mapGraphics` shows; `undefined` until it is first drawn. */
  private drawnMap: MapLayer | undefined;
  /** What hides a body on the drawn map (#2831). */
  private occluders: readonly Occluder[] = [];
  private hiddenOutlines: Phaser.GameObjects.Graphics | undefined;
  /** Each body's symbol where a structure covers it (#2972). */
  private hiddenGlyphs = new Map<string, Phaser.GameObjects.Image>();
  private readonly strokeHiddenSegment = (ax: number, ay: number, bx: number, by: number): void => {
    this.hiddenOutlines?.lineBetween(ax, ay, bx, by);
  };
  /** What moves on the floor, and the bodies, under the body glyphs. */
  private bands: readonly {
    readonly body: Phaser.GameObjects.Graphics;
    readonly marks: Phaser.GameObjects.Graphics;
  }[] = [];
  /** The static structure, one object per place in `renderOrder`. */
  private readonly structureGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** The floor, map and structure graphics, cut to the camera every frame (#3240). */
  private readonly staticCull = new StaticGraphicsCull();
  /** Each lift's platform graphics (#3079), by depth: cleared and drawn every frame. */
  private readonly liftGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Each lift as its art draws it, in the snapshot's `lifts` order; set when the map is drawn. */
  private liftFrames: readonly { readonly frame: LiftFrame; readonly upperLayer: number }[] = [];
  /** The map's water (#2984), built when the map changes. */
  private waterShapes: readonly WaterShape[] = [];
  /** The ripples on each layer's water, drawn every frame. */
  private readonly rippleGraphics = new Map<
    number,
    { readonly graphics: Phaser.GameObjects.Graphics; readonly painter: WaterPainter }
  >();
  /** Each lever's last state and when it flipped to it, in scene seconds: its throw plays from there (#3053). */
  private readonly leverFlips = new Map<
    string,
    { readonly up: boolean; readonly at: number | undefined }
  >();
  /**
   * Where each body last came out of a portal (#3030), and the cooldown
   * it came out with: its arrival ring stays there as the body walks on.
   */
  private readonly arrivals = new Map<
    string,
    { readonly readyAt: number; readonly at: Vec2; readonly layer: number }
  >();
  /** Each layer's effect zones (ADR-0053), drawn every frame as they breathe. */
  private readonly zoneGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Fog banks and vents by layer, plumes by band, and the weather over all (#3032). */
  private readonly fogGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly plumeGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  private weatherGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The map's atmosphere as drawn (#3032), made again when the map changes. */
  private atmosphereDrawn:
    | {
        readonly atmosphere: MapAtmosphere;
        readonly fog: readonly FogArt[];
        readonly particles: AtmosphereParticles;
      }
    | undefined;
  /** The map's paving (#3210), one canvas texture per paving, painted when the map changes. */
  private pavingDrawn:
    | {
        readonly paving: readonly MapPaving[] | undefined;
        readonly colours: Record<MapPaving["look"], PavingLookColours>;
        readonly painted: readonly {
          readonly image: Phaser.GameObjects.Image;
          readonly key: string;
        }[];
      }
    | undefined;
  /** Each painted zone's ground (#3052), one canvas texture per zone, made when the map changes. */
  private zoneGrounds:
    | { readonly zones: readonly MapZone[]; readonly grounds: readonly (ZoneGround | undefined)[] }
    | undefined;
  /**
   * The map's lighting with its zones' lights (#3052) and its portals'
   * (#3030), made when any of them changes: `portals` is which are on.
   */
  private zoneLit:
    | {
        readonly lighting: MapLighting;
        readonly zones: readonly MapZone[];
        readonly portals: string;
        readonly lit: MapLighting;
      }
    | undefined;
  /** `snapshot.actors` where they draw this frame: lifted by their layers. */
  private drawnActors: readonly RenderableActor[] = [];
  /** Each body's lift now, while it eases to its layer's. */
  private readonly elevations = new Map<string, number>();
  /** Each body's layer last frame: a step down beside a drop-off is a fall (#3069). */
  private readonly lastLayers = new Map<string, number>();
  /** Each body falling off a drop-off: the lift it fell from, and for how long. */
  private readonly falls = new Map<string, { readonly from: number; readonly elapsed: number }>();
  /** `snapshot.actors` by id, where they stand: what their light is sampled at. */
  private readonly standing = new Map<string, RenderableActor>();
  /** Every mark on a body, over the body glyphs (#1037). */
  private markGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Energy barriers' curtains (#3031), added over what is behind them. */
  private barrierGraphics: Phaser.GameObjects.Graphics | undefined;
  /** Each breakable wall's last health seen, and when it fell, for its dust (#3031). */
  private readonly wallFalls = new Map<string, { health: number; at: number | undefined }>();
  /** The off-screen markers, drawn in screen px over everything (#440). */
  private markerGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The hovered name's underline (#2738). */
  private nameUnderline: Phaser.GameObjects.Graphics | undefined;
  private snapshot: ArenaSnapshot = EMPTY_SNAPSHOT;
  /** What the camera shows; `undefined` until the first `setCamera`. */
  private view: CameraView | undefined;
  /** What the HUD covers, so no edge marker hides under it. */
  private cover: Cover = NO_COVER;
  private arena = { width: 0, height: 0 };
  private floatingTexts: FloatingText[] = [];
  private areaFlashes: AreaFlash[] = [];
  private swingFlashes: SwingFlash[] = [];
  private beaconBolts: BeaconBolt[] = [];
  /** Skills landing on bodies (#1139), newest last; merged in on the next frame. */
  private impacts: Impact[] = [];
  private addedImpacts: Impact[] = [];
  private walkMarker: WalkMarker | undefined;
  /**
   * The goals on the ground (#3221), each with when it left the snapshot,
   * so a reached one fades out; and their graphics, one per layer's depth.
   */
  private goals = new Map<string, { mark: GoalMark; goneAt: number | undefined }>();
  private readonly goalGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Every caped body's cape (#1699), and where the body was drawn last frame. */
  private capes = new Map<string, { motion: CapeMotion; x: number; y: number }>();
  /**
   * One sprite per shot, by projectile id: in flight, or ended and fading
   * at its end point since `endedAt` (scene seconds).
   */
  private projectileImages = new Map<
    number,
    { image: Phaser.GameObjects.Image; to: { x: number; y: number }; endedAt: number | undefined }
  >();
  private readonly clock = new MatchClock();
  /**
   * Shots that have ended, kept until they leave the state: if the clock
   * steps back after an overshot, a faded shot must not fly again.
   */
  private readonly endedShots = new Set<number>();
  private floatingTextObjects = new Map<number, Phaser.GameObjects.Text>();
  /**
   * Status icons per actor id, reused frame to frame: hidden when not
   * needed, created only when an actor shows more than it ever has.
   */
  private statusIcons = new Map<string, Phaser.GameObjects.Image[]>();
  private statusOverflow = new Map<string, Phaser.GameObjects.Text>();
  /** One name label per actor id, reused frame to frame like the icons. */
  private nameLabels = new Map<string, Phaser.GameObjects.Text>();
  /** Each shown name tag's box, from the last frame (#2738). */
  private readonly nameBoxes = new Map<string, Rect>();
  /** The primary profession's glyph before each name, one pooled image per actor (#281). */
  private nameGlyphs = new Map<string, Phaser.GameObjects.Image>();
  /** One signet image per actor with one (#2805), beside its name. */
  private nameSignets = new Map<string, Phaser.GameObjects.Image>();
  /** Signet textures asked for and still loading (#2805). */
  private signetsAdding = new Set<string>();
  /** The primary profession's glyph inside each body, one pooled image per actor (#1037). */
  private bodyGlyphs = new Map<string, Phaser.GameObjects.Image>();
  /** The casting skill's type badge by each cast bar, one pooled image per actor (#1125). */
  private castBadges = new Map<string, Phaser.GameObjects.Image>();
  /** Status ids the server sent that this client has no icon for. */
  private readonly unknownStatuses = new Set<string>();
  /** Each attacker's swing, which its weapon mark plays (#558), by actor id. */
  private readonly attackClocks = new Map<string, AttackClock>();
  /** The scene clock at the last frame, seconds, which the match clock runs on from. */
  private now = 0;
  /** The light maps (ADR-0052); `undefined` until `create`. */
  private lightingPass: LightingPass | undefined;
  /** Whether Alt is held, for the hover ring (#3020); a key does not wait for the mouse to move. */
  private alt: AltTracker | undefined;
  /** Where the wards draw: under the grid, or over the light. */
  private groundDepth = GROUND_DEPTH;
  /** Reused every body, every frame: the lighting allocates nothing per frame. */
  private readonly lightSample: LightSample = { colour: 0xffffff, intensity: 1 };
  /** Read once a frame: under reduced motion every mark stays at rest. */
  private reducedMotion = false;
  /**
   * Where each body stood last frame, and the way it last moved (#3226):
   * a stance streaks behind a body while it moves.
   */
  private readonly bodyMotion = new Map<string, BodyMotion>();
  /** Scratch for the marks a body wears, so a frame allocates none (#3226). */
  private readonly mote: Mote = { x: 0, y: 0, radius: 0, alpha: 0 };
  private readonly streak: Streak = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0 };
  private readonly corner = { x: 0, y: 0 };
  private readonly nextCorner = { x: 0, y: 0 };

  public constructor() {
    super(ArenaScene.KEY);
  }

  /**
   * Point the camera: `view` is at the centre of the canvas, `zoom` CSS px
   * per world unit; `cover` is what the HUD covers.
   */
  public setCamera(view: CameraView, cover: Cover): void {
    this.cover = cover;
    this.view = view;
    const camera = this.cameras.main;
    camera.setZoom(view.zoom);
    // Only the camera snaps (#2393): the leash, picking and the HUD keep
    // `view` as it is.
    const snapped = snapView(view, camera);
    camera.centerOn(snapped.x, snapped.y);
  }

  /** The arena's bounds, which the grid covers and the edge line traces. */
  public setArenaBounds(width: number, height: number): void {
    this.arena = { width, height };
    this.bodyMotion.clear();
  }

  /**
   * The box of each name tag drawn last frame (#2738), by actor id, in
   * world units: what a click with Show names held hits. Live, updated
   * in place every frame.
   */
  public nameTagBoxes(): ReadonlyMap<string, Rect> {
    return this.nameBoxes;
  }

  /** Replace the snapshot to draw on the next frame. */
  public setSnapshot(snapshot: ArenaSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Queue a floating number/label above a world position. */
  public addFloatingText(text: FloatingText): void {
    const placed = placeFloatingText(this.floatingTexts, text, this.cameras.main.zoom);
    if (placed !== undefined) {
      this.floatingTexts.push(placed);
    }
  }

  /** Flash where an area skill landed. */
  public addAreaFlash(flash: AreaFlash): void {
    this.areaFlashes.push(flash);
  }

  /** Mark where you clicked the floor to walk, replacing the last mark (#310). */
  public showWalkMarker(point: Vec2): void {
    this.walkMarker = walkMarkerAt(point);
  }

  /** Flash a melee swing; off under reduced motion, where the damage number says enough. */
  /** The host says `actorId`'s swing struck twice (#561): the off hand stabs too. */
  public struckTwice(actorId: string): void {
    this.attackClocks.get(actorId)?.struckTwice(this.snapshot.clock);
  }

  public addSwingFlash(flash: SwingFlash): void {
    if (!prefersReducedMotion()) {
      this.swingFlashes.push(flash);
    }
  }

  /** Not behind reduced motion, unlike a swing: it is how you learn what hit you. */
  public addBeaconBolt(bolt: BeaconBolt): void {
    this.beaconBolts.push(bolt);
  }

  public addImpacts(impacts: readonly Impact[]): void {
    this.addedImpacts.push(...impacts);
  }

  /**
   * Every icon the arena draws comes from one sheet (#1671), loaded at its
   * own size: one raster at match start, however many skills there are.
   * Name glyphs are drawn in ink, never the profession colour: in the
   * arena, colour is team.
   */
  public preload(): void {
    this.load.svg(ATLAS, `${import.meta.env.BASE_URL}${ARENA_ATLAS_SVG}`);
    this.load.json(ATLAS_MAP, `${import.meta.env.BASE_URL}${ARENA_ATLAS_JSON}`);
  }

  public create(): void {
    const sheet = this.textures.get(ATLAS);
    const map = this.cache.json.get(ATLAS_MAP) as AtlasMap;
    for (const [frame, { x, y, w, h }] of Object.entries(map.frames)) {
      sheet.add(frame, 0, x, y, w, h);
    }
    this.groundGraphics = this.add.graphics().setDepth(GROUND_DEPTH);
    this.lightingPass = new LightingPass(this);
    this.alt = trackAlt(window);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shutdown();
    });
    // A destroyed game drops its textures after its scenes: a light's
    // texture still the stamp's then resets the stamp onto a dead scene,
    // which throws and leaves the canvas behind (#3196). Dropped here first.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.shutdown();
    });
    this.floorGraphics = this.add.graphics().setDepth(FLOOR_DEPTH);
    this.mapGraphics = this.add.graphics().setDepth(MAP_DEPTH);
    this.bands = Array.from({ length: CHARACTER_BANDS }, (_, band) => ({
      body: this.add.graphics().setDepth(renderOrder({ kind: "character", band, part: "body" })),
      marks: this.add.graphics().setDepth(renderOrder({ kind: "character", band, part: "marks" })),
    }));
    this.barrierGraphics = this.add
      .graphics()
      .setDepth(EFFECT_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.markGraphics = this.add.graphics().setDepth(EFFECT_DEPTH);
    this.markerGraphics = this.add.graphics().setDepth(EDGE_MARKER_DEPTH);
    this.nameUnderline = this.add.graphics().setDepth(OVERLAY_DEPTH);
  }

  public override update(time: number, deltaMs: number): void {
    const effects = this.markGraphics;
    const floor = this.bandOf(this.snapshot.structure.ground);
    if (effects === undefined || floor === undefined) {
      return;
    }
    for (const { body, marks: bandMarks } of this.bands) {
      body.clear();
      bandMarks.clear();
    }
    effects.clear();
    this.barrierGraphics?.clear();
    const { body: g, marks } = floor;
    this.now = time / 1000;
    this.reducedMotion = prefersReducedMotion();
    this.drawnActors = this.liftActors(deltaMs / 1000);
    this.clock.observe(this.snapshot.clock, this.now);
    this.observeAttacks();
    this.updateLighting(time);
    this.updateGroundEffects();
    this.drawMap();
    // Only what the camera shows is tessellated (#3240): the map cut once in
    // a while, the zones and the fog, drawn every frame, every frame.
    const view = this.cameraView();
    this.staticCull.cull(view);
    this.drawLifts();
    this.drawRipples();
    this.drawZones();
    this.drawAtmosphere(deltaMs / 1000, view);
    for (const graphics of this.zoneGraphics.values()) {
      cullToView(graphics, view);
    }
    // Over the grid and walls, under the actors: a flash never hides a
    // health bar, a status or the target ring.
    this.areaFlashes = decayAreaFlashes(this.areaFlashes, deltaMs / 1000);
    for (const flash of this.areaFlashes) {
      const alpha = areaFlashAlpha(flash);
      g.fillStyle(flash.colour, 0.12 * alpha);
      g.fillCircle(flash.position.x, flash.position.y, flash.radius);
      g.lineStyle(2, flash.colour, alpha);
      g.strokeCircle(flash.position.x, flash.position.y, flash.radius);
    }
    this.walkMarker = decayWalkMarker(this.walkMarker, deltaMs / 1000);
    if (this.walkMarker !== undefined) {
      this.drawWalkMarker(g, this.walkMarker);
    }
    for (const ping of this.snapshot.pings) {
      this.drawPing(g, ping);
    }
    this.drawGoals();
    this.drawStand(g, marks);
    this.drawAltar(g);
    for (const point of this.snapshot.capturePoints) {
      this.drawCapturePoint(g, point);
    }
    for (const gate of this.snapshot.gates) {
      this.drawGate(g, gate);
    }
    for (const lever of this.snapshot.switches) {
      this.drawSwitch(g, lever);
    }
    for (const teleport of this.snapshot.teleports) {
      this.drawTeleport(g, teleport);
    }
    for (const breakable of this.snapshot.breakables) {
      this.drawBreakableOverlay(effects, breakable);
    }
    this.drawArrivals(g);
    this.stepCapes(deltaMs / 1000);
    for (const actor of this.drawnActors) {
      const band = this.bandOf(actor.layer);
      if (band !== undefined) {
        this.drawActor(band.body, band.marks, actor);
      }
    }
    this.drawHiddenOutlines();
    this.drawHoverMarker(effects);
    // Over the bodies: a carried flag stands above its carrier's head.
    for (const flag of this.snapshot.flags) {
      this.drawFlag(effects, flag);
    }
    this.swingFlashes = decaySwingFlashes(this.swingFlashes, deltaMs / 1000);
    for (const flash of this.swingFlashes) {
      this.drawSwingFlash(effects, flash);
    }
    this.beaconBolts = decayBeaconBolts(this.beaconBolts, deltaMs / 1000);
    for (const bolt of this.beaconBolts) {
      this.drawBeaconBolt(effects, bolt);
    }
    this.impacts = mergeImpacts(this.impacts, this.addedImpacts, deltaMs / 1000);
    this.addedImpacts = [];
    for (const impact of this.impacts) {
      this.drawImpact(effects, impact);
    }
    this.updateBodyGlyphs();
    this.updateCastBadges();
    this.updateProjectiles(time / 1000);
    this.updateStatusIcons();
    this.updateNameLabels();
    this.updateFloatingTexts(deltaMs / 1000);
    this.updateEdgeMarkers();
  }

  /** The graphics pair a body on `layer` draws into. */
  private bandOf(layer: number): (typeof this.bands)[number] | undefined {
    return this.bands[characterBand(layer, this.snapshot.structure.layerCount)];
  }

  /**
   * Every actor where it draws (ADR-0051): its simulated position lifted
   * by its layer's height, eased after a change of layer. On a map of one
   * layer they are the snapshot's own.
   */
  private liftActors(dt: number): readonly RenderableActor[] {
    const { actors, structure } = this.snapshot;
    this.standing.clear();
    for (const actor of actors) {
      this.standing.set(actor.id, actor);
    }
    if (structure.layerCount === 1) {
      this.elevations.clear();
      this.lastLayers.clear();
      this.falls.clear();
      return actors;
    }
    const seen = new Set<string>();
    const lifted = actors.map((actor) => {
      seen.add(actor.id);
      const settled = standingDraw(
        structure,
        this.snapshot.lifts,
        actor.position,
        actor.layer,
        actor.radius,
      );
      const target = settled.lift;
      const known = this.elevations.get(actor.id);
      const was = this.lastLayers.get(actor.id);
      this.lastLayers.set(actor.id, actor.layer);
      if (
        known !== undefined &&
        was === actor.layer + 1 &&
        besideDropOff(structure, actor.position, was)
      ) {
        this.falls.set(actor.id, { from: known, elapsed: 0 });
      }
      const fall = this.falls.get(actor.id);
      const elapsed = (fall?.elapsed ?? 0) + dt;
      if (fall !== undefined) {
        if (elapsed >= DROP_FALL_SECONDS) {
          this.falls.delete(actor.id);
        } else {
          this.falls.set(actor.id, { from: fall.from, elapsed });
        }
      }
      const lift =
        known === undefined || this.reducedMotion
          ? target
          : fall !== undefined
            ? fallLift(fall.from, target, elapsed)
            : easeElevation(known, target, dt);
      this.elevations.set(actor.id, lift);
      return {
        ...actor,
        layer: settled.layer,
        position: { x: actor.position.x, y: actor.position.y - lift },
      };
    });
    for (const id of this.elevations.keys()) {
      if (!seen.has(id)) {
        this.elevations.delete(id);
        this.lastLayers.delete(id);
        this.falls.delete(id);
      }
    }
    return lifted;
  }

  /**
   * Step the cape of every living caped body (#1699) by its drawn
   * movement since last frame: knocked down it stands still, so it
   * folds. A body that jumped (a shadow step, a respawn) starts over;
   * one gone, dead or without a cape keeps none.
   */
  private stepCapes(dt: number): void {
    const seen = new Set<string>();
    for (const actor of this.drawnActors) {
      if (actor.cape === undefined || actor.dead) {
        continue;
      }
      seen.add(actor.id);
      const { x, y } = actor.position;
      const last = this.capes.get(actor.id);
      if (last === undefined) {
        this.capes.set(actor.id, { motion: newCapeMotion(), x, y });
        continue;
      }
      const jumped = capeJumped(Math.hypot(x - last.x, y - last.y), actor.radius);
      if (jumped) {
        reprimeCapeMotion(last.motion);
      }
      const still = jumped || dt <= 0;
      const vx = still ? 0 : (x - last.x) / dt;
      const vy = still ? 0 : (y - last.y) / dt;
      stepCapeMotion(last.motion, dt, { x, y, r: actor.radius, vx, vy });
      last.x = x;
      last.y = y;
    }
    for (const id of this.capes.keys()) {
      if (!seen.has(id)) {
        this.capes.delete(id);
      }
    }
  }

  /** The cape `actor` wears, with its motion; `undefined` for none. */
  private wornCape(actor: RenderableActor): WornCape | undefined {
    const motion = this.capes.get(actor.id)?.motion;
    return actor.cape === undefined || motion === undefined
      ? undefined
      : { look: actor.cape, motion };
  }

  /**
   * A Relic Run or King of the Hill altar (#1374, #1377): a neutral ring
   * on the ground as wide as a relic or ghost must come to score, and a
   * stone at its centre.
   */
  private drawAltar(g: Phaser.GameObjects.Graphics): void {
    const altar = this.snapshot.altar;
    if (altar === undefined) {
      return;
    }
    g.fillStyle(STAND_NEUTRAL, 0.14);
    g.fillCircle(altar.x, altar.y, ALTAR_REACH_UNITS);
    g.lineStyle(3, STAND_NEUTRAL, 0.9);
    g.strokeCircle(altar.x, altar.y, ALTAR_REACH_UNITS);
    g.fillStyle(FLAG_POLE_COLOUR, 1);
    g.fillRect(altar.x - 9, altar.y - 9, 18, 18);
  }

  /**
   * A gate's plate (#2691): its reach in its side's colour, a stone plate
   * that sinks while held (#3053); an open gate's door swung aside on its
   * layer (#3061, #3053).
   */
  private drawGate(g: Phaser.GameObjects.Graphics, gate: RenderableGate): void {
    const line = 1 / (this.view?.zoom ?? 1);
    const plate = gate.plate;
    if (plate !== undefined) {
      const { x, y } = plate.position;
      const colour = plate.side === undefined ? STAND_NEUTRAL : teamColour(plate.side);
      g.fillStyle(colour, gate.open ? 0.3 : 0.12);
      g.fillCircle(x, y, GATE_PLATE_REACH_UNITS);
      g.lineStyle(2, colour, 0.9);
      g.strokeCircle(x, y, GATE_PLATE_REACH_UNITS);
      paintPlate(g, plate.position, gate.open, line);
    }
    if (gate.blocks === "bodies-and-shots") {
      this.drawBarrier(g, gate, line);
      return;
    }
    // A shut gate is a wall of the map, and draws with them (#3061).
    if (gate.open) {
      const { layerCount, ground } = this.snapshot.structure;
      g.save();
      g.translateCanvas(0, -elevationOf(gate.layer, ground));
      const palette = arenaPalette(this.snapshot.structure);
      GATE_ART.open[gate.look](this.gatePainter(g), gate.wall, {
        height: layerCount === 1 ? 0 : WALL_HEIGHT,
        line,
        palette: gate.look === "door" ? doorPalette(palette) : palette,
      });
      g.restore();
    }
  }

  /**
   * An energy barrier (#3031): its posts, and closed its shimmering
   * curtain on the additive layer; open, a ghost of it. Never among the
   * walls: sight passes it.
   */
  private drawBarrier(g: Phaser.GameObjects.Graphics, gate: RenderableGate, line: number): void {
    const { layerCount, ground } = this.snapshot.structure;
    const height = layerCount === 1 ? 0 : WALL_HEIGHT;
    const frame = { height, line, time: this.reducedMotion ? 0 : this.now };
    const lift = -elevationOf(gate.layer, ground);
    g.save();
    g.translateCanvas(0, lift);
    if (gate.open) {
      BARRIER_ART.ghost(this.stonePainter(g), gate.wall, frame);
    }
    BARRIER_ART.posts(this.stonePainter(g), gate.wall, height, !gate.open);
    g.restore();
    const curtain = this.barrierGraphics;
    if (!gate.open && curtain !== undefined) {
      curtain.save();
      curtain.translateCanvas(0, lift);
      BARRIER_ART.curtain(this.stonePainter(curtain), gate.wall, frame);
      curtain.restore();
    }
  }

  /**
   * Over a breakable wall (#3031): the dust of its fall, and its health
   * bar while it is hovered or your target. The wall and its rubble draw
   * with the map.
   */
  private drawBreakableOverlay(
    g: Phaser.GameObjects.Graphics,
    breakable: RenderableBreakable,
  ): void {
    const seen = this.wallFalls.get(breakable.id);
    const fell = seen !== undefined && seen.health > 0 && breakable.health <= 0;
    const at = fell ? this.now : seen?.at;
    this.wallFalls.set(breakable.id, { health: breakable.health, at });
    const { structure } = this.snapshot;
    if (at !== undefined && this.now - at < DUST_SECONDS) {
      g.save();
      g.translateCanvas(0, -elevationOf(breakable.layer, structure.ground));
      paintDust(this.stonePainter(g), breakable.wall, this.now - at);
      g.restore();
    }
    const shown = breakable.id === this.snapshot.targetId || breakable.id === this.snapshot.hoverId;
    if (breakable.health <= 0 || !shown) {
      return;
    }
    const anchor = breakableBarAnchor(breakable, structure);
    const fraction = breakableHealthFraction(breakable);
    const left = anchor.x - HEALTH_BAR_WIDTH / 2;
    const top = anchor.y - 8;
    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(fraction < 0.35 ? HEALTH_BAR_LOW : HEALTH_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * fraction, HEALTH_BAR_HEIGHT);
  }

  /** `g` as a breakable wall or a barrier draws on it. */
  private stonePainter(g: Phaser.GameObjects.Graphics): StonePainter {
    return {
      ...this.gatePainter(g),
      fillEllipse: (x, y, width, height) => g.fillEllipse(x, y, width, height),
    };
  }

  /** `g` as a door draws on it. */
  private gatePainter(g: Phaser.GameObjects.Graphics): GatePainter {
    return {
      save: () => g.save(),
      restore: () => g.restore(),
      translateCanvas: (x, y) => g.translateCanvas(x, y),
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillShape: (shape) => {
        this.fillShape(g, shape);
      },
      strokeShape: (shape) => {
        this.strokeShape(g, shape);
      },
      fillColumn: (shape, height, colour) => {
        this.drawColumn(g, shape, 0, height, colour);
      },
      lineBetween: (x1, y1, x2, y2) => g.lineBetween(x1, y1, x2, y2),
    };
  }

  /** A switch (#3025): its mark on its layer, the lever raised or thrown, with a flick between (#3053). */
  private drawSwitch(g: Phaser.GameObjects.Graphics, lever: RenderableSwitch): void {
    const seen = this.leverFlips.get(lever.id);
    // The first sight of a lever is no flip: it rests where it is.
    const flip =
      seen?.up === lever.up
        ? seen
        : { up: lever.up, at: seen === undefined ? undefined : this.now };
    this.leverFlips.set(lever.id, flip);
    const { at } = flip;
    const thrown = leverThrown(
      lever.up,
      at === undefined ? undefined : this.now - at,
      this.reducedMotion,
    );
    g.save();
    g.translateCanvas(0, -elevationOf(lever.layer, this.snapshot.structure.ground));
    SWITCH_MARK_ART[switchMarkKey(lever.mark)](g, lever.position, thrown);
    g.restore();
  }

  /** A portal (#3030): its entry's swirl and its exit's ring, each on its own layer. */
  private drawTeleport(g: Phaser.GameObjects.Graphics, teleport: RenderableTeleport): void {
    const { ground } = this.snapshot.structure;
    const time = this.reducedMotion ? 0 : this.now;
    g.save();
    g.translateCanvas(0, -elevationOf(teleport.from.layer, ground));
    paintTeleportEntry(g, polygonCentre(teleport.from.area), teleport.on, time);
    g.restore();
    g.save();
    g.translateCanvas(0, -elevationOf(teleport.to.layer, ground));
    paintTeleportExit(g, teleport.to.position, teleport.on);
    g.restore();
  }

  /**
   * Each body's last arrival through a portal (#3030): a burst, then a
   * ring that fades over the cooldown. A body first seen mid-cooldown
   * shows its ring where it stands; one that left takes its ring along.
   */
  private drawArrivals(g: Phaser.GameObjects.Graphics): void {
    const { actors, clock, structure } = this.snapshot;
    const present = new Set<string>();
    for (const actor of actors) {
      present.add(actor.id);
      if (actor.teleportReadyAt === 0) {
        continue;
      }
      let arrival = this.arrivals.get(actor.id);
      if (arrival?.readyAt !== actor.teleportReadyAt) {
        arrival = { readyAt: actor.teleportReadyAt, at: actor.position, layer: actor.layer };
        this.arrivals.set(actor.id, arrival);
      }
      const age = clock - (arrival.readyAt - TELEPORT_COOLDOWN_SECONDS);
      g.save();
      g.translateCanvas(0, -elevationOf(arrival.layer, structure.ground));
      paintArrival(g, arrival.at, age, TELEPORT_COOLDOWN_SECONDS);
      g.restore();
    }
    for (const id of this.arrivals.keys()) {
      if (!present.has(id)) {
        this.arrivals.delete(id);
      }
    }
  }

  /**
   * A Capture Points shrine (#1378): the stand's marker as wide as a
   * player must come to count on it, in its owner's colour, neutral grey
   * with none; round it, clockwise from the top, its capturer's progress.
   */
  private drawCapturePoint(g: Phaser.GameObjects.Graphics, point: RenderableCapturePoint): void {
    const { x, y } = point.position;
    const colour = point.owner === undefined ? STAND_NEUTRAL : teamColour(point.owner);
    g.fillStyle(colour, 0.18);
    g.fillCircle(x, y, CAPTURE_REACH_UNITS);
    g.lineStyle(3, colour, 0.9);
    g.strokeCircle(x, y, CAPTURE_REACH_UNITS);
    g.fillStyle(BODY_EDGE, 1);
    g.fillCircle(x, y, 5);
    if (point.ring !== undefined) {
      const top = -Math.PI / 2;
      g.lineStyle(5, teamColour(point.ring.side), 1);
      g.beginPath();
      g.arc(x, y, CAPTURE_REACH_UNITS + 6, top, top + point.ring.fraction * 2 * Math.PI);
      g.strokePath();
    }
  }

  /**
   * The flag stand (#1225): a ring on the ground in its holder's colour,
   * neutral grey with none, round a pole; the target ring when selected.
   */
  private drawStand(g: Phaser.GameObjects.Graphics, marks: Phaser.GameObjects.Graphics): void {
    const stand = this.snapshot.stand;
    if (stand === undefined) {
      return;
    }
    const { x, y } = stand.position;
    const colour = stand.holder === undefined ? STAND_NEUTRAL : teamColour(stand.holder);
    g.fillStyle(colour, 0.18);
    g.fillCircle(x, y, STAND_RADIUS);
    g.lineStyle(3, colour, 0.9);
    g.strokeCircle(x, y, STAND_RADIUS);
    g.fillStyle(BODY_EDGE, 1);
    g.fillCircle(x, y, 5);
    if (!this.snapshot.flags.some((flag) => flag.onStand)) {
      g.lineStyle(3, FLAG_POLE_COLOUR, 1);
      g.lineBetween(x, y, x, y - FLAG_POLE);
    }
    if (stand.id === this.snapshot.targetId) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, y, STAND_RADIUS + TARGET_RING_OFFSET);
    }
  }

  /**
   * A flag (#1225): a pole with a pennant in its team's colour, standing
   * at its foot, or on its carrier's head; the target ring when selected.
   */
  private drawFlag(marks: Phaser.GameObjects.Graphics, flag: RenderableFlag): void {
    const x = flag.position.x;
    const foot = flag.position.y - (flag.carried ? FLAG_CARRIED_LIFT : 0);
    const top = foot - FLAG_POLE;
    marks.lineStyle(3, BODY_EDGE, 1);
    marks.lineBetween(x, foot, x, top);
    marks.lineStyle(2, FLAG_POLE_COLOUR, 1);
    marks.lineBetween(x, foot, x, top);
    marks.fillStyle(teamColour(flag.side), 1);
    marks.fillTriangle(
      x + 1,
      top,
      x + 1 + FLAG_PENNANT_LENGTH,
      top + FLAG_PENNANT_HEIGHT / 2,
      x + 1,
      top + FLAG_PENNANT_HEIGHT,
    );
    marks.lineStyle(1, BODY_EDGE, 1);
    marks.strokeTriangle(
      x + 1,
      top,
      x + 1 + FLAG_PENNANT_LENGTH,
      top + FLAG_PENNANT_HEIGHT / 2,
      x + 1,
      top + FLAG_PENNANT_HEIGHT,
    );
    if (flag.id === this.snapshot.targetId && !flag.carried && !flag.onStand) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, flag.position.y, FLAG_PICK_RADIUS);
    }
  }

  /** Hand each attack clock its actor's swing timer; forget those who left. */
  private observeAttacks(): void {
    const present = new Set<string>();
    for (const actor of this.drawnActors) {
      present.add(actor.id);
      if (actor.weaponId === undefined || !isWeaponId(actor.weaponId)) {
        continue;
      }
      let clock = this.attackClocks.get(actor.id);
      if (clock === undefined) {
        clock = new AttackClock();
        this.attackClocks.set(actor.id, clock);
      }
      const total = actor.dead ? 0 : actor.swingTotal;
      const cast = actor.dead ? undefined : actor.attackCast;
      clock.observe(this.snapshot.clock, actor.swingElapsed, total, actor.weaponId, cast);
    }
    for (const id of this.attackClocks.keys()) {
      if (!present.has(id)) {
        this.attackClocks.delete(id);
      }
    }
  }

  /**
   * A triangle on the screen edge toward every living body out of view:
   * `foe` or `friend`, a `target` outline round your target's, `ink` for
   * your own, which the follow camera should never need; an outlined one
   * toward each objective out of view (#1413), under the bodies'. Drawn in
   * world space through the inverse of the camera, so it sits still on
   * screen at any zoom.
   */
  private updateEdgeMarkers(): void {
    const g = this.markerGraphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    const view = this.view;
    if (view === undefined) {
      return;
    }
    const screen = { width: this.scale.width, height: this.scale.height };
    const bodies: EdgeThing[] = this.drawnActors.map((actor) => ({
      id: actor.id,
      kind: actor.team === "self" ? "self" : actor.team === "ally" ? "friend" : "foe",
      colour: undefined,
      position: actor.position,
      dead: actor.dead,
      targeted: actor.id === this.snapshot.targetId,
    }));
    // Objectives first, so a body's marker draws over one it overlaps.
    const things = [...this.objectiveEdgeThings(), ...bodies];
    for (const marker of edgeMarkers(things, view, screen, this.cover)) {
      this.drawEdgeMarker(g, marker, view, screen);
    }
  }

  /** The objectives a mode is played around (#1413), each in the colour the arena draws it. */
  private objectiveEdgeThings(): EdgeThing[] {
    const { stand, altar, capturePoints } = this.snapshot;
    const objective = (id: string, position: Vec2, colour: number): EdgeThing => ({
      id,
      kind: "objective",
      colour,
      position,
      dead: false,
      targeted: false,
    });
    const owned = (side: "ally" | "enemy" | undefined): number =>
      side === undefined ? STAND_NEUTRAL : teamColour(side);
    return [
      ...capturePoints.map((point, index) =>
        objective(`capture-point/${String(index)}`, point.position, owned(point.owner)),
      ),
      ...(altar === undefined ? [] : [objective("altar", altar, ALTAR_GOLD)]),
      ...(stand === undefined ? [] : [objective(stand.id, stand.position, owned(stand.holder))]),
    ];
  }

  private drawEdgeMarker(
    g: Phaser.GameObjects.Graphics,
    marker: EdgeMarker,
    view: CameraView,
    screen: { readonly width: number; readonly height: number },
  ): void {
    /** Screen px from the marker, along and across its heading, to a world point. */
    const at = (along: number, across: number): Phaser.Math.Vector2 => {
      const cos = Math.cos(marker.angle);
      const sin = Math.sin(marker.angle);
      const sx = marker.x + along * cos - across * sin;
      const sy = marker.y + along * sin + across * cos;
      return new Phaser.Math.Vector2(
        view.x + (sx - screen.width / 2) / view.zoom,
        view.y + (sy - screen.height / 2) / view.zoom,
      );
    };
    // The tip on the marker point, the base back toward the centre.
    const points = [
      at(0, 0),
      at(-EDGE_MARKER_LENGTH, EDGE_MARKER_WIDTH / 2),
      at(-EDGE_MARKER_LENGTH, -EDGE_MARKER_WIDTH / 2),
    ];
    if (marker.kind === "objective") {
      // Stroked, not filled, so it never reads as a body (#1413).
      g.lineStyle(2 / view.zoom, marker.colour ?? STAND_NEUTRAL, 1);
      g.strokePoints(points, true);
      return;
    }
    const fill =
      marker.kind === "self" ? SELF_RIM : teamColour(marker.kind === "friend" ? "ally" : "enemy");
    g.fillStyle(fill, 1);
    g.fillPoints(points, true);
    g.lineStyle(
      (marker.targeted ? 2 : BODY_EDGE_WIDTH) / view.zoom,
      marker.targeted ? TARGET_RING : BODY_EDGE,
      1,
    );
    g.strokePoints(points, true);
  }

  /**
   * A knocked-down body (#545): the disc flattened along its facing, edged
   * as a standing one is, with the weapon mark dropped beside it. The
   * off-hand is not drawn: one dropped thing reads, two clutter.
   */
  private drawLyingBody(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
  ): void {
    const { x, y } = actor.position;
    const pose = lyingPose(x, y, actor.radius, actor.facing);
    g.fillStyle(this.lit(teamColour(actor.team), actor), 1);
    tracePath(g, pose.body);
    g.fillPath();
    g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
    g.strokePath();
    if (actor.team === "self") {
      g.lineStyle(2, SELF_RIM, 1);
      tracePath(g, lyingPose(x, y, actor.radius - 2, actor.facing).body);
      g.strokePath();
    }
    this.drawWeaponMark(marks, actor, pose.weapon);
  }

  /**
   * The weapon mark (#188, #418), in its swing frame; where a knocked-down
   * body dropped it (#545), lying still at rest.
   */
  private drawWeaponMark(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    dropped?: {
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly facing: number;
    },
  ): void {
    const at = dropped ?? { ...actor.position, r: actor.radius, facing: actor.facing };
    const frame = dropped === undefined ? this.weaponFrame(actor) : REST_FRAME;
    paintWeaponMark(phaserPainter(g), at, actor.weaponId, frame);
  }

  /** Where `actor`'s weapon is in its swing, `REST_FRAME` for none. */
  private weaponFrame(actor: RenderableActor): AttackFrame {
    return actor.weaponId === undefined || !isWeaponId(actor.weaponId)
      ? REST_FRAME
      : shownFrame(
          this.attackClocks.get(actor.id),
          this.clock.read(this.now),
          actor.weaponId,
          this.reducedMotion,
        );
  }

  /** The walk marker (#310): cased like the weapon mark, a 4 px `edge` under a 2 px `ink` core. */
  private drawWalkMarker(g: Phaser.GameObjects.Graphics, marker: WalkMarker): void {
    const alpha = walkMarkerAlpha(marker, prefersReducedMotion());
    const ticks = walkMarkerTicks(marker);
    for (const [width, colour] of [
      [4, BODY_EDGE],
      [2, SELF_RIM],
    ] as const) {
      g.lineStyle(width, colour, alpha);
      g.beginPath();
      for (const [from, to] of ticks) {
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
      }
      g.strokePath();
    }
  }

  /**
   * A ping (#443): a `friend` pin on the spot, cased in `edge`, and a ring
   * that grows from it and fades. Under the actors, as the walk marker is.
   */
  private drawPing(g: Phaser.GameObjects.Graphics, ping: RenderablePing): void {
    const { x, y } = ping.position;
    const ring = pingRing(ping.remaining, prefersReducedMotion());
    const friend = teamColour("ally");
    g.lineStyle(2, friend, ring.alpha);
    g.strokeCircle(x, y, ring.radius);
    const head = y - PING_PIN_HEIGHT;
    for (const [width, colour] of [
      [4, BODY_EDGE],
      [2, friend],
    ] as const) {
      g.lineStyle(width, colour, 1);
      g.lineBetween(x, y, x, head);
    }
    g.fillStyle(friend, 1);
    g.fillCircle(x, head, PING_HEAD_RADIUS);
    g.lineStyle(1.5, BODY_EDGE, 1);
    g.strokeCircle(x, head, PING_HEAD_RADIUS);
  }

  /**
   * The goals on the ground (#3221) on their layers, over the floor and
   * under the bodies; a goal gone from the snapshot fades out, then is
   * dropped. A portal (#3222) is a map portal's entry, always on.
   */
  private drawGoals(): void {
    for (const graphics of this.goalGraphics.values()) {
      graphics.clear();
    }
    const current = new Set<string>();
    for (const mark of this.snapshot.goals) {
      current.add(mark.id);
      this.goals.set(mark.id, { mark, goneAt: undefined });
    }
    const ground = this.snapshot.structure.ground;
    for (const [id, goal] of this.goals) {
      if (!current.has(id) && goal.goneAt === undefined) {
        goal.goneAt = this.now;
      }
      const fade =
        goal.mark.kind === "portal" && goal.goneAt !== undefined
          ? 0
          : goalMarkFade(goal.goneAt === undefined ? undefined : this.now - goal.goneAt);
      if (fade <= 0) {
        this.goals.delete(id);
        continue;
      }
      const depth = renderOrder({ kind: "goal-mark", layer: goal.mark.layer });
      let g = this.goalGraphics.get(depth);
      if (g === undefined) {
        g = this.add.graphics().setDepth(depth);
        this.goalGraphics.set(depth, g);
      }
      g.save();
      g.translateCanvas(0, -elevationOf(goal.mark.layer, ground));
      if (goal.mark.kind === "portal") {
        paintTeleportEntry(g, goal.mark.position, true, this.reducedMotion ? 0 : this.now);
        g.restore();
        continue;
      }
      for (const command of goalMarkCommands(
        goal.mark.position,
        this.now,
        this.reducedMotion,
        fade,
      )) {
        switch (command.kind) {
          case "disc":
            g.fillStyle(command.colour, command.alpha);
            g.fillCircle(command.at.x, command.at.y, command.radius);
            break;
          case "ring":
            g.lineStyle(command.width, command.colour, command.alpha);
            g.strokeCircle(command.at.x, command.at.y, command.radius);
            break;
          case "band":
            g.fillStyle(command.colour, command.alpha);
            g.fillRect(
              command.at.x - command.width / 2,
              command.at.y - command.height,
              command.width,
              command.height,
            );
            break;
        }
      }
      g.restore();
    }
  }

  /** Your team's called foe (#443): a `condition` chevron over it, cased like the weapon mark. */
  private drawCallChevron(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const points = callChevron(actor, this.cameras.main.zoom);
    for (const [width, colour] of [
      [5, BODY_EDGE],
      [3, CALL_CHEVRON],
    ] as const) {
      g.lineStyle(width, colour, 1);
      g.strokePoints(points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)));
    }
  }

  /** A skill's impact on a body (#1139), where that body is now; none once it has left the state. */
  private drawImpact(g: Phaser.GameObjects.Graphics, impact: Impact): void {
    const actor = this.drawnActors.find((a) => a.id === impact.anchorId);
    if (actor === undefined) {
      return;
    }
    const { x, y } = actor.position;
    for (const mark of impactMarks(impact, actor.radius, this.reducedMotion)) {
      if (mark.kind === "spike") {
        g.lineStyle(IMPACT_LINE_WIDTH, impact.colour, mark.alpha);
        g.lineBetween(x + mark.from.x, y + mark.from.y, x + mark.to.x, y + mark.to.y);
      } else if (mark.kind === "tint") {
        g.fillStyle(impact.colour, mark.alpha);
        g.fillCircle(x, y, mark.radius);
      } else {
        g.lineStyle(IMPACT_LINE_WIDTH, impact.colour, mark.alpha);
        g.strokeCircle(x, y, mark.radius);
      }
    }
  }

  private drawBeaconBolt(g: Phaser.GameObjects.Graphics, bolt: BeaconBolt): void {
    const alpha = beaconBoltAlpha(bolt);
    const points = beaconBoltPoints(bolt);
    // A wide glow under a thin bright core.
    for (const [width, colour, opacity] of [
      [7, BEACON_BOLT_GLOW, 0.45 * alpha],
      [2.5, BEACON_BOLT_CORE, alpha],
    ] as const) {
      g.lineStyle(width, colour, opacity);
      g.beginPath();
      g.moveTo(bolt.from.x, bolt.from.y);
      for (const point of points.slice(1)) {
        g.lineTo(point.x, point.y);
      }
      g.strokePath();
    }
  }

  private drawSwingFlash(g: Phaser.GameObjects.Graphics, flash: SwingFlash): void {
    const alpha = swingFlashAlpha(flash);
    const { x, y } = flash.centre;
    const from = flash.angle - Math.PI / 4;
    const to = flash.angle + Math.PI / 4;
    g.lineStyle(2, flash.colour, alpha);
    g.beginPath();
    g.arc(x, y, flash.radius, from, to);
    g.strokePath();
    if (flash.own) {
      // Along the outer edge, as your circle gets its rim.
      g.lineStyle(1, SELF_RIM, alpha);
      g.beginPath();
      g.arc(x, y, flash.radius + 1.5, from, to);
      g.strokePath();
    }
  }

  /**
   * Shots in flight, over the actors: one sprite each, moved along its
   * flight against the match clock. Once a shot ends, by landing or by
   * leaving the state, it holds at its end point and fades out (#238),
   * timed on the scene's own clock, which keeps running after a match ends.
   * Under reduced motion it goes at once.
   */
  private updateProjectiles(now: number): void {
    const clock = this.clock.read(now);
    const flying = new Set<number>();
    const sent = new Set(this.snapshot.projectiles.map((shot) => shot.id));
    for (const id of this.endedShots) {
      if (!sent.has(id)) {
        this.endedShots.delete(id);
      }
    }
    for (const shot of this.snapshot.projectiles) {
      const position = projectilePosition(
        shot,
        clock,
        this.snapshot.structure,
        this.snapshot.lifts,
      );
      const shown = this.projectileImages.get(shot.id);
      // An ended shot never flies again, even while its id is still sent.
      if (position === undefined || this.endedShots.has(shot.id)) {
        continue;
      }
      flying.add(shot.id);
      if (shown === undefined) {
        const image = this.add
          .image(position.x, position.y, ATLAS, projectileFrame(shot.sprite))
          .setDepth(OVERLAY_DEPTH);
        image.setRotation(projectileHeading(shot, this.snapshot.structure, this.snapshot.lifts));
        image.setTint(shot.colour);
        this.projectileImages.set(shot.id, {
          image,
          to: projectileLanding(shot, this.snapshot.structure, this.snapshot.lifts),
          endedAt: undefined,
        });
      } else {
        shown.image.setPosition(position.x, position.y);
      }
    }
    const fade = !prefersReducedMotion();
    for (const [id, shown] of this.projectileImages) {
      if (flying.has(id)) {
        continue;
      }
      if (sent.has(id)) {
        this.endedShots.add(id);
      }
      if (shown.endedAt === undefined && fade) {
        shown.endedAt = now;
        shown.image.setPosition(shown.to.x, shown.to.y);
      }
      const alpha = shown.endedAt === undefined ? undefined : shotFadeAlpha(shown.endedAt, now);
      if (alpha === undefined) {
        shown.image.destroy();
        this.projectileImages.delete(id);
      } else {
        shown.image.setAlpha(alpha);
      }
    }
  }

  /**
   * One actor: its body on `g`, every mark on it on `marks`, over the
   * body glyphs (#1037). In a clump a neighbour's weapon now crosses your
   * body: the weapon is the more urgent read.
   */
  private drawActor(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
  ): void {
    const { x, y } = actor.position;

    if (actor.dead) {
      this.bodyMotion.delete(actor.id);
      // A corpse stays visible but obviously inert: hollow, grey, no bars;
      // darker once a skill has exploited it (#466).
      const colour = actor.exploited ? EXPLOITED_CORPSE_COLOUR : DEAD_COLOUR;
      if (actor.creatureLook === undefined) {
        g.lineStyle(2, colour, 1);
        g.strokeCircle(x, y, actor.radius);
        return;
      }
      // A lying pet keeps its shape, dashed (#1162): a creature's corpse at a glance.
      g.lineStyle(BODY_EDGE_WIDTH, colour, 1);
      const outline = creatureOutline(x, y, actor.radius);
      for (const [from, to] of dashes(outline, actor.radius * DEAD_DASH, actor.radius * DEAD_GAP)) {
        g.lineBetween(from.x, from.y, to.x, to.y);
      }
      return;
    }

    if (actor.creatureLook !== undefined) {
      this.drawCreature(g, marks, actor, actor.creatureLook);
    } else if (actor.knockedDown) {
      this.drawLyingBody(g, marks, actor);
    } else {
      paintStandingBody(
        phaserPainter(g),
        {
          x,
          y,
          r: actor.radius,
          facing: actor.facing,
          team: actor.team,
          weaponId: actor.weaponId,
          offhandId: actor.offhandId,
          frame: this.weaponFrame(actor),
          cape: this.wornCape(actor),
          tint: this.bodyTint(actor),
        },
        phaserPainter(marks),
      );
    }
    // On the body layer, after the body and its self rim: every mark draws over the rings.
    this.drawBodyRings(g, actor);
    this.drawConditionCues(g, actor);

    if (actor.id === this.snapshot.targetId) {
      marks.lineStyle(2, TARGET_RING, 1);
      marks.strokeCircle(x, y, actor.radius + TARGET_RING_OFFSET);
    }
    if (actor.id === this.snapshot.calledId) {
      this.drawCallChevron(marks, actor);
    }

    this.drawHealthBar(marks, actor);

    if (actor.castProgress !== undefined) {
      this.drawCastBar(marks, actor, actor.castProgress);
    }
  }

  /**
   * A living creature (#1162, #2047): its ornament, then its hexagon plate,
   * upright standing or knocked down; over the kind glyph, the weapon and
   * off-hand of an armed look, posed like a player's and dropped while it
   * lies, or else a facing tick.
   */
  private drawCreature(
    g: Phaser.GameObjects.Graphics,
    marks: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    look: CreatureLook,
  ): void {
    const { x, y } = actor.position;
    const team = this.lit(teamColour(actor.team), actor);
    const colourOf = (colour: OrnamentColour): number =>
      colour === "team" ? team : colour === "ink" ? SELF_RIM : colour;
    for (const ornament of creatureOrnament(look, x, y, actor.radius)) {
      if (ornament.kind === "polygon") {
        tracePath(g, ornament.points);
        g.fillStyle(colourOf(ornament.colour), 1);
        g.fillPath();
        g.lineStyle(ornament.edge, BODY_EDGE, 1);
        g.strokePath();
      } else if (ornament.kind === "outline") {
        for (const [width, colour] of [
          [ornament.casing, BODY_EDGE],
          [ornament.width, colourOf(ornament.colour)],
        ] as const) {
          tracePath(g, ornament.points);
          g.lineStyle(width, colour, 1);
          g.strokePath();
        }
      } else {
        g.lineStyle(ornament.width + RING_CASING, BODY_EDGE, 1);
        g.strokeCircle(ornament.x, ornament.y, ornament.radius);
        g.lineStyle(ornament.width, colourOf(ornament.colour), 1);
        for (const arc of ornament.arcs) {
          g.beginPath();
          g.arc(ornament.x, ornament.y, ornament.radius, arc.from, arc.to);
          g.strokePath();
        }
      }
    }

    tracePath(g, creatureOutline(x, y, actor.radius));
    g.fillStyle(team, 1);
    g.fillPath();
    g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
    g.strokePath();

    if (CREATURE_ARMS[look] === undefined) {
      const [tip, left, right] = creatureTick(x, y, actor.radius, actor.facing);
      marks.fillStyle(SELF_RIM, 1);
      marks.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
      marks.lineStyle(TICK_EDGE, BODY_EDGE, 1);
      marks.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    } else if (!actor.knockedDown) {
      paintBodyMarks(phaserPainter(marks), {
        x,
        y,
        r: actor.radius,
        facing: actor.facing,
        team: actor.team,
        weaponId: actor.weaponId,
        offhandId: actor.offhandId,
        frame: this.weaponFrame(actor),
        cape: undefined,
      });
    }
  }

  /**
   * The marks a living body wears (#1117, #3226): the stance band and the
   * enchantment ring at its feet, circular even lying down, with motes
   * rising off the ring and streaks behind a moving stance; the hex halo
   * over its health bar; and the shimmer of an invulnerable one (#1233).
   */
  private drawBodyRings(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const { x, y } = actor.position;
    const moving = this.trackMotion(actor);
    for (const ring of bodyRings(actor.radius, actor)) {
      this.strokeRing(g, x, y, ring.radius, ring.width, ring.colour, ring.alpha, ring.arcs);
    }
    if (actor.invulnerable) {
      const ring = invulnerableRing(actor.radius);
      const alpha = invulnerableAlpha(this.now, this.reducedMotion);
      this.strokeRing(g, x, y, ring.radius, ring.width, ring.colour, alpha, ring.arcs);
    }
    if (actor.enchanted) {
      const phase = cuePhase(actor.id);
      const mote = this.mote;
      for (let index = 0; index < ENCHANT_MOTES; index += 1) {
        if (enchantMote(actor.radius, index, this.now, phase, this.reducedMotion, mote)) {
          g.fillStyle(ENCHANTMENT_COLOUR, mote.alpha);
          g.fillCircle(x + mote.x, y + mote.y, mote.radius);
        }
      }
    }
    if (actor.stanced && moving !== undefined) {
      const streak = this.streak;
      for (let index = 0; index < STANCE_STREAKS; index += 1) {
        if (stanceStreak(actor.radius, index, moving.ux, moving.uy, this.reducedMotion, streak)) {
          g.lineStyle(STREAK_WIDTH, STANCE_COLOUR, streak.alpha);
          g.lineBetween(x + streak.x1, y + streak.y1, x + streak.x2, y + streak.y2);
        }
      }
    }
    if (actor.hexed) {
      const halo = hexHalo(actor.radius);
      const turn = hexHaloTurn(this.now, this.reducedMotion);
      const { corner, nextCorner } = this;
      g.lineStyle(HEX_HALO_WIDTH, HEX_COLOUR, 1);
      for (let side = HEX_HALO_BROKEN; side < HEX_HALO_SIDES; side += 1) {
        hexHaloCorner(halo, turn, side, corner);
        hexHaloCorner(halo, turn, side + 1, nextCorner);
        g.lineBetween(x + corner.x, y + corner.y, x + nextCorner.x, y + nextCorner.y);
      }
    }
  }

  private strokeRing(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    radius: number,
    width: number,
    colour: number,
    alpha: number,
    arcs: readonly RingArc[],
  ): void {
    g.lineStyle(width, colour, alpha);
    for (const arc of arcs) {
      g.beginPath();
      g.arc(x, y, radius, arc.from, arc.to);
      g.strokePath();
    }
  }

  /**
   * Whether `actor` moved within `MOVING_SECONDS`, and which way: the
   * snapshot does not move a body every frame, so a frame standing still
   * between two steps is still moving.
   */
  private trackMotion(actor: RenderableActor): BodyMotion | undefined {
    const { x, y } = actor.position;
    const known = this.bodyMotion.get(actor.id);
    if (known === undefined) {
      this.bodyMotion.set(actor.id, { x, y, ux: 0, uy: 0, movedAt: -Infinity });
      return undefined;
    }
    const dx = x - known.x;
    const dy = y - known.y;
    const step = Math.hypot(dx, dy);
    if (step > 0) {
      known.x = x;
      known.y = y;
      known.ux = dx / step;
      known.uy = dy / step;
      known.movedAt = this.now;
    }
    return this.now - known.movedAt <= MOVING_SECONDS ? known : undefined;
  }

  /**
   * Flames, drops or bubbles on a burning, bleeding or poisoned body
   * (#1138), over its rings, round its centre even lying down.
   */
  private drawConditionCues(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    if (actor.conditionCues.length === 0) {
      return;
    }
    const { x, y } = actor.position;
    const phase = cuePhase(actor.id);
    for (const cue of actor.conditionCues) {
      for (const mark of conditionMarks(cue, actor.radius, this.now, phase, this.reducedMotion)) {
        if (mark.kind === "flame") {
          const [a, b, tip] = mark.points;
          g.fillStyle(mark.colour, 1);
          g.fillTriangle(x + a.x, y + a.y, x + b.x, y + b.y, x + tip.x, y + tip.y);
          g.lineStyle(CUE_EDGE_WIDTH, BODY_EDGE, 1);
          g.strokeTriangle(x + a.x, y + a.y, x + b.x, y + b.y, x + tip.x, y + tip.y);
        } else if (mark.kind === "drop") {
          g.fillStyle(mark.colour, mark.alpha);
          g.fillCircle(x + mark.x, y + mark.y, mark.radius);
          g.lineStyle(CUE_EDGE_WIDTH, BODY_EDGE, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
        } else {
          // A dark halo under the hollow stroke, so it reads on any team colour.
          g.lineStyle(CUE_EDGE_WIDTH + 1, BODY_EDGE, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
          g.lineStyle(CUE_EDGE_WIDTH, mark.colour, mark.alpha);
          g.strokeCircle(x + mark.x, y + mark.y, mark.radius);
        }
      }
    }
  }

  /** One icon per status under every living actor; none under the dead. */
  private updateStatusIcons(): void {
    const seen = new Set<string>();
    for (const actor of this.drawnActors) {
      seen.add(actor.id);
      const statuses = actor.dead ? [] : this.knownStatuses(actor.statuses);
      const row = statusRowLayout(
        statuses.length,
        actor.position.x,
        actor.position.y,
        actor.radius,
      );

      const pool = this.statusIcons.get(actor.id) ?? [];
      this.statusIcons.set(actor.id, pool);
      row.icons.forEach((position, index) => {
        const frame = statusFrame(statuses[index] ?? "");
        let image = pool[index];
        if (image === undefined) {
          image = this.add.image(position.x, position.y, ATLAS, frame).setDepth(OVERLAY_DEPTH);
          pool.push(image);
        }
        image.setFrame(frame).setPosition(position.x, position.y).setVisible(true);
      });
      for (const unused of pool.slice(row.icons.length)) {
        unused.setVisible(false);
      }

      let more = this.statusOverflow.get(actor.id);
      if (row.overflow === undefined) {
        more?.setVisible(false);
        continue;
      }
      if (more === undefined) {
        more = this.add
          .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color: INK })
          .setOrigin(0.5, 0.5)
          .setDepth(OVERLAY_DEPTH);
        this.statusOverflow.set(actor.id, more);
      }
      screenSized(more, this.cameras.main.zoom);
      more
        .setText(`+${String(row.overflow.count)}`)
        .setPosition(row.overflow.position.x, row.overflow.position.y)
        .setVisible(true);
    }

    // An actor that left takes its icons with it.
    for (const [id, pool] of this.statusIcons) {
      if (!seen.has(id)) {
        for (const image of pool) {
          image.destroy();
        }
        this.statusIcons.delete(id);
        this.statusOverflow.get(id)?.destroy();
        this.statusOverflow.delete(id);
      }
    }
  }

  /**
   * Names above the bars (#53), shown only where `nameShown` says (#253):
   * your target, the body under the cursor, everyone while the names key is held.
   * Every actor keeps its label, hidden or not, so showing one is a
   * visibility flip, never a new texture. A corpse keeps its name, greyed,
   * so a player can still see who went down.
   */
  private updateNameLabels(): void {
    const zoom = this.cameras.main.zoom;
    const seen = new Set<string>();
    let underlined: { x: number; y: number; width: number } | undefined;
    for (const actor of this.drawnActors) {
      seen.add(actor.id);
      let label = this.nameLabels.get(actor.id);
      if (label === undefined) {
        label = this.add
          .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color: INK })
          .setOrigin(0.5, 1)
          .setDepth(OVERLAY_DEPTH);
        this.nameLabels.set(actor.id, label);
      }
      // setText skips an unchanged string, but setColor redraws and
      // re-uploads the label's texture every call, so only on a change.
      const hovered = actor.id === this.snapshot.hoverId;
      const color = hovered ? HOVER_INK : actor.dead ? DEAD_INK : INK;
      if (label.style.color !== color) {
        label.setColor(color);
      }
      const shown = nameShown(this.snapshot, actor);
      label.setText(
        markedForTeam(
          actor.team,
          taggedName({
            name: playerLabelText(nameplateName(actor.name), actor.guildTag, actor.heroRank),
            bot: actor.bot,
          }),
        ),
      );
      screenSized(label, zoom);
      // `width` is unscaled: the label's screen px.
      const signetDrawn = this.signetReady(actor.signet);
      const layout = nameplateLayout(actor, label.width, zoom, signetDrawn);
      label.setPosition(layout.textX, layout.bottom).setVisible(shown);
      this.updateNameGlyph(actor, layout, shown, hovered);
      this.updateNameSignet(actor, layout, shown);
      if (shown) {
        this.nameBoxes.set(
          actor.id,
          nameTagBox(actor, label.width, label.height, zoom, signetDrawn),
        );
      } else {
        this.nameBoxes.delete(actor.id);
      }
      if (shown && hovered) {
        underlined = { x: layout.textX, y: layout.bottom, width: screenPx(label.width, zoom) };
      }
    }
    // The hovered name's 1 px underline (#2738), as wide as the label.
    const underline = this.nameUnderline;
    if (underline !== undefined) {
      underline.clear();
      if (underlined !== undefined) {
        underline.fillStyle(HOVER_INK_TINT, 1);
        underline.fillRect(
          underlined.x - underlined.width / 2,
          underlined.y,
          underlined.width,
          screenPx(1, zoom),
        );
      }
    }
    for (const [id, label] of this.nameLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.nameLabels.delete(id);
        this.nameBoxes.delete(id);
        this.nameGlyphs.get(id)?.destroy();
        this.nameGlyphs.delete(id);
        this.nameSignets.get(id)?.destroy();
        this.nameSignets.delete(id);
      }
    }
  }

  /**
   * The glyph before `actor`'s name (#281): shown with the name, greyed with
   * a corpse's. Its frame and tint are set only when they change, as the
   * label's colour is, so a steady frame re-uploads nothing.
   */
  private updateNameGlyph(
    actor: RenderableActor,
    layout: NameplateLayout,
    shown: boolean,
    hovered: boolean,
  ): void {
    let glyph = this.nameGlyphs.get(actor.id);
    if (actor.profession === undefined || layout.glyphX === undefined) {
      glyph?.setVisible(false);
      return;
    }
    const frame = professionFrame(actor.profession);
    if (glyph === undefined) {
      glyph = this.add
        .image(0, 0, ATLAS, frame)
        .setOrigin(0.5, 1)
        .setTintMode(Phaser.TintModes.FILL)
        .setDepth(OVERLAY_DEPTH);
      this.nameGlyphs.set(actor.id, glyph);
    }
    if (glyph.frame.name !== frame) {
      glyph.setFrame(frame);
    }
    const tint = hovered ? HOVER_INK_TINT : actor.dead ? DEAD_INK_TINT : INK_TINT;
    if (glyph.tint !== tint) {
      glyph.setTint(tint);
    }
    screenSized(glyph, this.cameras.main.zoom);
    glyph.setPosition(layout.glyphX, layout.bottom).setVisible(shown);
  }

  /**
   * Whether `bits`' signet texture is ready (#2805). The first ask adds
   * it, once per bits, from its SVG; it loads asynchronously, and until
   * it has, the plate leaves no gap for it.
   */
  private signetReady(bits: number | undefined): boolean {
    if (bits === undefined) {
      return false;
    }
    const key = signetTextureKey(bits);
    if (this.textures.exists(key)) {
      return true;
    }
    if (!this.signetsAdding.has(key)) {
      this.signetsAdding.add(key);
      this.textures.addBase64(key, signetUrl(bits, NAMEPLATE_SIGNET_SIZE));
    }
    return false;
  }

  /** `actor`'s signet just left of its name (#2805): shown with the name, never greyed. */
  private updateNameSignet(actor: RenderableActor, layout: NameplateLayout, shown: boolean): void {
    let signet = this.nameSignets.get(actor.id);
    if (actor.signet === undefined || layout.signetX === undefined) {
      signet?.setVisible(false);
      return;
    }
    const key = signetTextureKey(actor.signet);
    if (signet === undefined) {
      signet = this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH);
      this.nameSignets.set(actor.id, signet);
    }
    if (signet.texture.key !== key) {
      signet.setTexture(key);
    }
    screenSized(signet, this.cameras.main.zoom);
    signet.setPosition(layout.signetX, layout.bottom).setVisible(shown);
  }

  /**
   * Every ward on the ground (#1087): a translucent disc with a thin rim
   * in its side's colour, and its skill's icon at the centre, under
   * whoever stands in it; a trap (#1105) the same, with no disc. One that
   * ended takes its icon with it.
   */
  /** The map's lighting, as Options and the frame budget allow (ADR-0052). */
  private activeLighting(): MapLighting | undefined {
    const { lighting, zones } = this.snapshot.structure;
    if (lighting === undefined || !lightingOn()) {
      return this.lightingPass?.allowed(undefined);
    }
    const { teleports } = this.snapshot;
    const portals = teleports.map((teleport) => (teleport.on ? "1" : "0")).join("");
    if (
      this.zoneLit?.lighting !== lighting ||
      this.zoneLit.zones !== zones ||
      this.zoneLit.portals !== portals
    ) {
      this.zoneLit = { lighting, zones, portals, lit: withZoneLights(lighting, zones, teleports) };
    }
    return this.lightingPass?.allowed(this.zoneLit.lit);
  }

  /** The light maps, and the wards moved over them while there are any. */
  private updateLighting(timeMs: number): void {
    const pass = this.lightingPass;
    if (pass === undefined) {
      return;
    }
    const lighting = this.activeLighting();
    pass.show(
      lighting,
      this.snapshot.structure,
      this.snapshot.walls,
      this.arena.width,
      this.arena.height,
      this.reducedMotion,
    );
    pass.update(timeMs);
    const depth = lighting === undefined ? GROUND_DEPTH : LIT_GROUND_DEPTH;
    if (depth !== this.groundDepth) {
      this.groundDepth = depth;
      this.groundGraphics?.setDepth(depth);
      for (const icon of this.groundIcons.values()) {
        icon.setDepth(depth);
      }
    }
  }

  /** What the light at a body's feet multiplies it by; `undefined` on a map lit flat. */
  private bodyTint(actor: RenderableActor): number | undefined {
    // Drawn lifted and eased; the light is where it stands, on its own layer.
    const { position, layer } = this.standing.get(actor.id) ?? actor;
    const lit = this.bodyLight(position, layer);
    const structure = this.drawnMap?.structure;
    // Under a deck, in its shade (#3078): shape, not light, so with lighting off too.
    const shaded =
      structure !== undefined &&
      structure.decks.length > 0 &&
      overhangAt(structure, position, layer) !== undefined;
    return shaded ? shadedBodyTint(lit ?? 0xffffff) : lit;
  }

  /** The light on a body at `position` on `layer`; `undefined` with lighting off. */
  private bodyLight(position: Vec2, layer: number): number | undefined {
    const lighting = this.drawnMap?.lighting;
    if (lighting === undefined) {
      return undefined;
    }
    const shown = this.lightingPass?.flickers === true ? lighting : steadyLighting(lighting);
    const timeMs = this.now * 1000;
    return bodyTintOf(lightAt(shown, position, layer, timeMs, BODY_LIGHT_FLOOR, this.lightSample));
  }

  /** `colour` in the light at `actor`'s feet. */
  private lit(colour: number, actor: RenderableActor): number {
    const tint = this.bodyTint(actor);
    return tint === undefined ? colour : multiplyColour(colour, tint);
  }

  private updateGroundEffects(): void {
    const g = this.groundGraphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    // Each team's resurrection shrine (#1199): a ring in its side's colour,
    // under the wards, whether its priest stands or not.
    for (const shrine of this.snapshot.shrines) {
      g.lineStyle(2, teamColour(shrine.side), 0.7);
      g.strokeCircle(shrine.position.x, shrine.position.y, SHRINE_RADIUS);
    }
    for (const deck of this.deckGroundGraphics.values()) {
      deck.clear();
    }
    const structure = this.snapshot.structure;
    const seen = new Set<number>();
    for (const effect of this.snapshot.groundEffects) {
      seen.add(effect.id);
      // A ward on a deck (#2979) draws flat at that deck's height, on its
      // own layer's graphics: over the deck, under whoever stands there.
      // Layer 0 is the bottom of the stack: the ground, or a pit's floor
      // drawn a step down (#2973); the ground over a pit stacks as a deck.
      const onDeck = effect.layer > 0;
      const drawn = onDeck ? this.deckGroundGraphicsOf(effect.layer) : g;
      const x = effect.position.x;
      const y = onDeck
        ? effect.position.y - liftAt(structure, this.snapshot.lifts, effect.position, effect.layer)
        : effect.position.y - elevationOf(effect.layer, structure.ground);
      if (effect.filled) {
        drawn.fillStyle(effect.colour, 0.15);
        drawn.fillCircle(x, y, effect.radius);
      }
      drawn.lineStyle(1.5, effect.colour, 0.6);
      drawn.strokeCircle(x, y, effect.radius);
      const frame = groundFrame(effect.skillId);
      if (!this.textures.get(ATLAS).has(frame)) {
        continue;
      }
      const icons = onDeck ? this.deckGroundIcons : this.groundIcons;
      if (!icons.has(effect.id)) {
        const depth = onDeck
          ? renderOrder({ kind: "ground-effect", layer: effect.layer }) + 0.1
          : this.groundDepth;
        icons.set(
          effect.id,
          this.add
            .image(x, y, ATLAS, frame)
            .setDisplaySize(GROUND_ICON_SIZE, GROUND_ICON_SIZE)
            .setAlpha(GROUND_ICON_ALPHA)
            .setDepth(depth),
        );
      }
    }
    for (const icons of [this.groundIcons, this.deckGroundIcons]) {
      for (const [id, icon] of icons) {
        if (!seen.has(id)) {
          icon.destroy();
          icons.delete(id);
        }
      }
    }
  }

  /** The graphics the wards on `layer`'s decks draw to, made the first time one does. */
  private deckGroundGraphicsOf(layer: number): Phaser.GameObjects.Graphics {
    let graphics = this.deckGroundGraphics.get(layer);
    if (graphics === undefined) {
      graphics = this.add.graphics().setDepth(renderOrder({ kind: "ground-effect", layer }));
      this.deckGroundGraphics.set(layer, graphics);
    }
    return graphics;
  }

  /**
   * The primary profession's glyph inside every body (#1037): upright,
   * world sized, between the bodies and their marks. Frame, tint and
   * alpha are set only when they change, as the name glyph's are; an actor
   * that left takes its glyph with it.
   */
  private updateBodyGlyphs(): void {
    const seen = new Set<string>();
    for (const actor of this.drawnActors) {
      seen.add(actor.id);
      const layout = bodyGlyphLayout(actor);
      let glyph = this.bodyGlyphs.get(actor.id);
      const glyphDepth = renderOrder({
        kind: "character",
        band: characterBand(actor.layer, this.snapshot.structure.layerCount),
        part: "glyph",
      });
      if (layout === undefined) {
        glyph?.setVisible(false);
        continue;
      }
      const frame =
        layout.glyph.kind === "creature"
          ? creatureFrame(layout.glyph.look)
          : bodyProfessionFrame(layout.glyph.profession);
      if (glyph === undefined) {
        glyph = this.add
          .image(0, 0, ATLAS, frame)
          .setTintMode(Phaser.TintModes.FILL)
          .setDepth(glyphDepth);
        this.bodyGlyphs.set(actor.id, glyph);
      }
      if (glyph.depth !== glyphDepth) {
        glyph.setDepth(glyphDepth);
      }
      if (glyph.frame.name !== frame) {
        glyph.setFrame(frame);
      }
      if (glyph.tint !== layout.tint) {
        glyph.setTint(layout.tint);
      }
      if (glyph.alpha !== layout.alpha) {
        glyph.setAlpha(layout.alpha);
      }
      glyph
        .setDisplaySize(layout.size, layout.size)
        .setPosition(layout.x, layout.y)
        .setVisible(true);
    }
    for (const [id, glyph] of this.bodyGlyphs) {
      if (!seen.has(id)) {
        glyph.destroy();
        this.bodyGlyphs.delete(id);
      }
    }
  }

  /**
   * The casting skill's type badge left of every cast bar (#1125): shown
   * and gone with the bar, none for a skill this client does not know. The
   * frame is set only when it changes; an actor that left takes its
   * badge with it.
   */
  private updateCastBadges(): void {
    const seen = new Set<string>();
    for (const actor of this.drawnActors) {
      seen.add(actor.id);
      let badge = this.castBadges.get(actor.id);
      if (actor.castType === undefined || actor.castProgress === undefined || actor.dead) {
        badge?.setVisible(false);
        continue;
      }
      const frame = skillTypeFrame(actor.castType);
      if (badge === undefined) {
        badge = this.add.image(0, 0, ATLAS, frame).setDepth(CAST_BADGE_DEPTH);
        this.castBadges.set(actor.id, badge);
      }
      if (badge.frame.name !== frame) {
        badge.setFrame(frame);
      }
      const centre = castBadgeLayout(actor.position.x, actor.position.y, actor.radius);
      badge
        .setDisplaySize(CAST_BADGE_SIZE, CAST_BADGE_SIZE)
        .setPosition(centre.x, centre.y)
        .setVisible(true);
    }
    for (const [id, badge] of this.castBadges) {
      if (!seen.has(id)) {
        badge.destroy();
        this.castBadges.delete(id);
      }
    }
  }

  /**
   * The statuses there is an icon for. A wire string this client does not
   * know (a newer server, say) is skipped and reported once, never thrown
   * on: the render loop must keep running.
   */
  private knownStatuses(ids: readonly string[]): StatusId[] {
    const known: StatusId[] = [];
    for (const id of ids) {
      if (isStatusId(id)) {
        known.push(id);
      } else if (!this.unknownStatuses.has(id)) {
        this.unknownStatuses.add(id);
        console.warn(`[arena] no icon for status "${id}"; not drawing it`);
      }
    }
    return known;
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, actor: RenderableActor): void {
    const fraction = healthFraction(actor);
    const left = actor.position.x - HEALTH_BAR_WIDTH / 2;
    const top = actor.position.y - actor.radius - 12;

    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(fraction < 0.35 ? HEALTH_BAR_LOW : HEALTH_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * fraction, HEALTH_BAR_HEIGHT);
  }

  private drawCastBar(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    progress: number,
  ): void {
    const left = actor.position.x - HEALTH_BAR_WIDTH / 2;
    const top = actor.position.y - actor.radius - CAST_BAR_RISE;
    g.fillStyle(HEALTH_BAR_BG, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
    g.fillStyle(CAST_BAR_FILL, 1);
    g.fillRect(left, top, HEALTH_BAR_WIDTH * progress, HEALTH_BAR_HEIGHT);
  }

  private updateFloatingTexts(dt: number): void {
    const zoom = this.cameras.main.zoom;
    const survivors: FloatingText[] = [];
    for (const floating of this.floatingTexts) {
      floating.remainingSeconds -= dt;

      let object = this.floatingTextObjects.get(floating.id);
      if (object === undefined) {
        object = this.add.text(floating.position.x, floating.position.y, floating.text, {
          fontSize: FLOATING_FONT_SIZE[floating.weight],
          fontStyle: floating.weight === "critical" ? "bold" : "normal",
          fontFamily: "ui-monospace, monospace",
          color: `#${floating.colour.toString(16).padStart(6, "0")}`,
          stroke: TEXT_EDGE,
          strokeThickness: 3,
        });
        // Left-aligned, bottom on the position: it grows away from the bar.
        object.setOrigin(0, 1).setDepth(OVERLAY_DEPTH);
        this.floatingTextObjects.set(floating.id, object);
      }

      if (floating.remainingSeconds <= 0) {
        object.destroy();
        this.floatingTextObjects.delete(floating.id);
        continue;
      }

      // Drift upward and fade as it ages; placeFloatingText relies on
      // this rise to find room for the next one.
      screenSized(object, zoom);
      object.y = floatingTextY(floating, zoom);
      object.setAlpha(
        Math.min(floating.weight === "light" ? LIGHT_TEXT_ALPHA : 1, floating.remainingSeconds),
      );
      survivors.push(floating);
    }
    this.floatingTexts = survivors;
  }

  /**
   * The grid and the walls, drawn again only when the bounds, the wall
   * list or the zoom change (#1353): their lines are 1 CSS px at any zoom.
   */
  private drawMap(): void {
    const g = this.mapGraphics;
    const next: MapLayer = {
      ...this.arena,
      walls: this.snapshot.walls,
      structure: this.snapshot.structure,
      zoom: this.view?.zoom ?? 1,
      lighting: this.activeLighting(),
      lightShadows: this.lightingPass?.shadows === true,
    };
    if (g === undefined || !mapLayerChanged(this.drawnMap, next)) {
      return;
    }
    g.clear();
    // A line 1 world unit wide is under a pixel when zoomed out, and
    // flickers as the camera moves (#2393): 1 CSS px, as the edge markers.
    const line = 1 / next.zoom;
    const palette = arenaPalette(next.structure);
    const { ground } = next.structure;
    this.drawFloor(palette, line);
    this.drawOutside(next.structure.bounds, next.lighting);
    this.drawPaving(next.structure);
    paintDeckShadows(
      {
        save: () => g.save(),
        restore: () => g.restore(),
        translateCanvas: (x, y) => g.translateCanvas(x, y),
        fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
        fillShape: (shape) => {
          this.fillShape(g, shape);
        },
      },
      next.structure,
      next.lightShadows,
    );
    for (const graphics of this.structureGraphics.values()) {
      graphics.clear();
    }
    if (next.structure.water !== this.drawnMap?.structure.water) {
      this.waterShapes = next.structure.water.map(waterShapeOf);
    }
    for (const shape of this.waterShapes) {
      const surface = this.structureAt({ kind: "water", layer: shape.layer, part: "surface" });
      surface.save();
      surface.translateCanvas(0, -elevationOf(shape.layer, ground));
      WATER_ART[waterArtKey(shape.depth)].surface(this.waterPainter(surface), shape, line);
      surface.restore();
    }
    this.drawPits(next.structure, line, palette);
    const lifts: { readonly frame: LiftFrame; readonly upperLayer: number }[] = [];
    for (const transition of next.structure.transitions) {
      const lit = litStructurePalette(
        transitionPalette(palette, BIOME[next.structure.biome].transition[transition.look]),
        next.lighting,
        transition.area,
        transition.from,
      );
      if (transition.lift === null) {
        this.drawRamp(next.structure, transition, line, lit);
      } else {
        const frame = liftFrame(next.structure, transition, line, lit);
        const upperLayer = Math.max(transition.from, transition.to);
        liftShaft(this.structureAt({ kind: "ramp", upperLayer }), frame);
        lifts.push({ frame, upperLayer });
      }
    }
    this.liftFrames = lifts;
    for (const wall of next.walls) {
      const held = deckHeldBy(wall, next.structure);
      const g = this.structureAt(
        held === undefined
          ? { kind: "wall", layer: wall.layer }
          : { kind: "support", deckLayer: held.layer },
      );
      if (isCrackedWall(wall)) {
        g.save();
        g.translateCanvas(0, -elevationOf(wall.layer, ground));
        BREAKABLE_ART.standing(this.stonePainter(g), wall, wall.cracks, {
          height: next.structure.layerCount === 1 ? 0 : WALL_HEIGHT,
          line,
          palette: litStructurePalette(breakablePalette(palette), next.lighting, wall, wall.layer),
        });
        g.restore();
        continue;
      }
      // A shut secret passage (#3068) is the rock wall it hides in.
      if (isDoor(wall) && wall.look !== "secret") {
        const flat = next.structure.layerCount === 1;
        const look = wall.look === "door" ? doorPalette(palette) : palette;
        g.save();
        g.translateCanvas(0, -elevationOf(wall.layer, ground));
        GATE_ART.shut[wall.look](this.gatePainter(g), wall, {
          height: flat ? 0 : WALL_HEIGHT,
          line,
          palette: litStructurePalette(look, next.lighting, wall, wall.layer),
        });
        g.restore();
        continue;
      }
      const lit = litStructurePalette(palette, next.lighting, wall, wall.layer);
      if (next.structure.layerCount === 1) {
        this.drawFlatWall(g, wall, line, lit);
      } else if (held === undefined) {
        this.drawWallBox(g, wall, elevationOf(wall.layer, ground), line, lit);
      } else {
        const low = elevationOf(wall.layer, ground);
        const depth = renderOrder({ kind: "support", deckLayer: held.layer });
        const hidden = deckCovers(next.structure, next.walls, depth);
        const high = deckSideLow(held, next.walls, ground);
        this.drawColumn(g, wall, low, high, lit.support, false, hidden);
      }
    }
    // A wall's fall always swaps the wall list, so its rubble is drawn here.
    for (const breakable of this.snapshot.breakables) {
      if (breakable.health <= 0) {
        const g = this.structureAt({ kind: "wall", layer: breakable.layer });
        g.save();
        g.translateCanvas(0, -elevationOf(breakable.layer, ground));
        BREAKABLE_ART.rubble(this.stonePainter(g), breakable.wall, {
          height: 0,
          line,
          palette: breakablePalette(palette),
        });
        g.restore();
      }
    }
    // A torch stands with lighting off too: it is on the map, its light is not.
    for (const light of next.structure.lighting?.lights ?? []) {
      const key = lightMarkKey(light.id);
      if (key !== undefined) {
        const g = this.structureAt({ kind: "light-mark", layer: light.layer });
        g.save();
        g.translateCanvas(0, -elevationOf(light.layer, ground));
        LIGHT_MARK_ART[key](g, light.position);
        g.restore();
      }
    }
    for (const deck of [...next.structure.decks, ...next.structure.downDecks]) {
      this.drawDeck(
        next.structure,
        deck,
        next.walls,
        line,
        litStructurePalette(
          deckPalette(palette, BIOME[next.structure.biome].deck[deck.look]),
          next.lighting,
          deck.footprint,
          deck.layer,
        ),
      );
    }
    for (const dropOff of next.structure.dropOffs) {
      this.drawDropOff(dropOff, ground, line);
    }
    this.occluders = occludersOf(next.walls, next.structure);
    this.drawnMap = next;
    this.staticCull.capture([
      ...(this.floorGraphics === undefined ? [] : [this.floorGraphics]),
      g,
      ...this.structureGraphics.values(),
    ]);
  }

  /** What the camera shows this frame, in world units. */
  private cameraView(): Box {
    const camera = this.cameras.main;
    const { x, y, zoom } = this.view ?? {
      x: camera.midPoint.x,
      y: camera.midPoint.y,
      zoom: camera.zoom,
    };
    const halfWidth = camera.width / 2 / zoom;
    const halfHeight = camera.height / 2 / zoom;
    return {
      left: x - halfWidth,
      top: y - halfHeight,
      right: x + halfWidth,
      bottom: y + halfHeight,
    };
  }

  /** What a structure covers of each body (#2831, #2972): its team's outline, weapon and symbol, no fill. */
  private drawHiddenOutlines(): void {
    this.hiddenOutlines ??= this.add.graphics().setDepth(renderOrder({ kind: "hidden-outline" }));
    const g = this.hiddenOutlines;
    g.clear();
    const shownGlyphs = new Set<string>();
    if (this.occluders.length > 0) {
      for (const actor of this.drawnActors) {
        if (!actor.dead) {
          this.drawHiddenBody(g, actor, shownGlyphs);
        }
      }
    }
    for (const [id, glyph] of this.hiddenGlyphs) {
      if (!shownGlyphs.has(id)) {
        glyph.setVisible(false);
      }
      if (!this.drawnActors.some((actor) => actor.id === id)) {
        glyph.destroy();
        this.hiddenGlyphs.delete(id);
      }
    }
  }

  private drawHiddenBody(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    shownGlyphs: Set<string>,
  ): void {
    g.lineStyle(BODY_EDGE_WIDTH, teamColour(actor.team), 1);
    traceHiddenOutline(
      actor.creatureLook === undefined ? RING_PATH : CREATURE_PATH,
      actor.position.x,
      actor.position.y,
      actor.radius,
      actor.layer,
      this.occluders,
      this.strokeHiddenSegment,
    );
    if (actor.creatureLook === undefined) {
      const { x, y } = actor.position;
      const { strokes, fills, strings, alpha } = weaponMarkLayout(
        x,
        y,
        actor.radius,
        actor.facing,
        actor.weaponId,
        this.weaponFrame(actor),
      );
      const outlines = fills.map((fill) => [...fill, ...fill.slice(0, 1)]);
      for (const line of alpha > 0 ? [...strokes, ...outlines, ...strings] : []) {
        for (const { ax, ay, bx, by } of traceHiddenPolyline(line, actor.layer, this.occluders)) {
          this.strokeHiddenSegment(ax, ay, bx, by);
        }
      }
    }
    this.showHiddenGlyph(actor, shownGlyphs);
  }

  /** The covered part of `actor`'s symbol, in its team's colour: the atlas image has no line path. */
  private showHiddenGlyph(actor: RenderableActor, shownGlyphs: Set<string>): void {
    const layout = bodyGlyphLayout(actor);
    const crop =
      layout === undefined
        ? undefined
        : hiddenCrop(layout.x, layout.y, layout.size, actor.layer, this.occluders);
    if (layout === undefined || crop === undefined) {
      return;
    }
    const frame =
      layout.glyph.kind === "creature"
        ? creatureFrame(layout.glyph.look)
        : bodyProfessionFrame(layout.glyph.profession);
    let glyph = this.hiddenGlyphs.get(actor.id);
    if (glyph === undefined) {
      glyph = this.add
        .image(0, 0, ATLAS, frame)
        .setTintMode(Phaser.TintModes.FILL)
        .setDepth(renderOrder({ kind: "hidden-outline" }));
      this.hiddenGlyphs.set(actor.id, glyph);
    }
    if (glyph.frame.name !== frame) {
      glyph.setFrame(frame);
    }
    const { realWidth, realHeight } = glyph.frame;
    glyph
      .setTint(teamColour(actor.team))
      .setDisplaySize(layout.size, layout.size)
      .setPosition(layout.x, layout.y)
      .setCrop(
        crop.x * realWidth,
        crop.y * realHeight,
        crop.width * realWidth,
        crop.height * realHeight,
      )
      .setVisible(true);
    shownGlyphs.add(actor.id);
  }

  /** Where a click would go, before it does (#2831): a ring off the ground (#2973), dashed on it. */
  private drawHoverMarker(g: Phaser.GameObjects.Graphics): void {
    const { structure } = this.snapshot;
    const pointer = this.input.activePointer;
    if (structure.layerCount === 1 || !this.input.isOver) {
      return;
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { layer } = pickSurface(structure, world, this.alt?.held() === true);
    g.lineStyle(1.5, HOVER_RING, 0.8);
    if (layer !== structure.ground) {
      g.strokeCircle(world.x, world.y, HOVER_RADIUS);
      return;
    }
    const dash = Math.PI / HOVER_DASHES;
    for (let k = 0; k < HOVER_DASHES; k += 1) {
      g.beginPath();
      g.arc(world.x, world.y, HOVER_RADIUS, 2 * k * dash, (2 * k + 1) * dash);
      g.strokePath();
    }
  }

  /** Each lift's platform where the snapshot has it now (#3079), drawn afresh every frame. */
  private drawLifts(): void {
    for (const graphics of this.liftGraphics.values()) {
      graphics.clear();
    }
    this.liftFrames.forEach(({ frame, upperLayer }, at) => {
      const lift = this.snapshot.lifts[at];
      if (lift === undefined) {
        return;
      }
      const depth = renderOrder({ kind: "lift", upperLayer });
      let graphics = this.liftGraphics.get(depth);
      if (graphics === undefined) {
        graphics = this.add.graphics().setDepth(depth);
        this.liftGraphics.set(depth, graphics);
      }
      liftPlatform(graphics, frame, lift);
    });
  }

  /** The static graphics at `item`'s place in the draw order. */
  private structureAt(item: RenderItem): Phaser.GameObjects.Graphics {
    const depth = renderOrder(item);
    let graphics = this.structureGraphics.get(depth);
    if (graphics === undefined) {
      graphics = this.add.graphics().setDepth(depth);
      this.structureGraphics.set(depth, graphics);
    }
    return graphics;
  }

  /** A ramp sloping from its lower layer's height to its upper's, chevrons pointing uphill. */
  private drawRamp(
    structure: MapStructure,
    ramp: MapStructure["transitions"][number],
    line: number,
    palette: ArenaPalette,
  ): void {
    const upperLayer = Math.max(ramp.from, ramp.to);
    // A ramp up out of a pit draws in it, under the ground's near lip (#2973).
    const g = this.structureAt(
      upperLayer > structure.ground ? { kind: "ramp", upperLayer } : { kind: "pit" },
    );
    const drawing = rampDrawing(structure, ramp);
    g.fillStyle(palette.slab, 1);
    this.fillFan(g, drawing.side);
    g.fillStyle(palette.rampTop, 1);
    this.fillFan(g, drawing.slope);
    TRANSITION_ART[ramp.look](g, {
      drawing,
      frame: rampFrame(structure, ramp),
      line,
      palette,
    });
  }

  /** Fills the convex outline `points`, as triangles from its first. */
  private fillFan(g: Phaser.GameObjects.Graphics, points: readonly Vec2[]): void {
    const [first] = points;
    if (first === undefined) {
      return;
    }
    for (let i = 1; i + 1 < points.length; i += 1) {
      const [b, c] = [points[i], points[i + 1]];
      if (b !== undefined && c !== undefined) {
        g.fillTriangle(first.x, first.y, b.x, b.y, c.x, c.y);
      }
    }
  }

  /**
   * A deck at its layer's height, its side face reaching down one layer,
   * drawn as its look (#3067).
   */
  private drawDeck(
    structure: MapStructure,
    deck: MapStructure["decks"][number],
    walls: readonly RenderableWall[],
    line: number,
    palette: ArenaPalette,
  ): void {
    const { ground } = structure;
    const art = DECK_ART[deck.look];
    const frame: DeckFrame = {
      footprint: deck.footprint,
      open: openEdges(structure, deck),
      top: elevationOf(deck.layer, ground),
      low: deckSideLow(deck, walls, ground),
      base: elevationOf(deck.layer - 1, ground),
      line,
      palette,
    };
    const switched = deck.switched;
    if (switched !== null && !switched.up) {
      // Gone down (#3068): nothing spans it but what is left of it.
      const face = this.structureAt({ kind: "deck", deckLayer: deck.layer });
      face.save();
      face.translateCanvas(0, -frame.top);
      if (switched.hinge !== null) {
        SWITCHED_DECK_ART.raised(face, frame, switched.hinge);
      } else if (deck.look === "bridge-plank" && switched.afterCrossings === null) {
        SWITCHED_DECK_ART.cut(face, frame);
      } else {
        SWITCHED_DECK_ART.fallen(face, frame);
      }
      face.restore();
      return;
    }
    const side = this.structureAt({ kind: "side-face", deckLayer: deck.layer });
    this.drawColumn(side, deck.footprint, frame.low, frame.top, palette.slab, true);
    art.side(side, frame);
    const face = this.structureAt({ kind: "deck", deckLayer: deck.layer });
    face.save();
    face.translateCanvas(0, -frame.top);
    face.fillStyle(palette.deckTop, 1);
    this.fillShape(face, deck.footprint);
    face.lineStyle(line, palette.wallStroke, 1);
    this.strokeShape(face, deck.footprint);
    face.lineStyle(line * DECK_LIP_WIDTH, DECK_LIP, 1);
    for (const { from, to } of southFacingEdges(deck.footprint)) {
      face.lineBetween(from.x, from.y, to.x, to.y);
    }
    art.top(face, frame);
    if (switched !== null && switched.afterCrossings !== null && switched.cracks > 0) {
      SWITCHED_DECK_ART.cracks(face, frame, switched.cracks, switched.afterCrossings);
    }
    face.restore();
  }

  /**
   * A drop-off (#3069) as a broken lip on its deck's edge: the crumbled
   * stretch you can step off, where the rest of the edge is whole.
   */
  private drawDropOff(
    dropOff: MapStructure["dropOffs"][number],
    ground: number,
    line: number,
  ): void {
    const face = this.structureAt({ kind: "deck", deckLayer: dropOff.layer });
    const lip = brokenLip(dropOff.from, dropOff.to);
    face.save();
    face.translateCanvas(0, -elevationOf(dropOff.layer, ground));
    face.lineStyle(line * DECK_LIP_WIDTH, DROP_OFF_CRACK, 1);
    face.strokePoints(lip.map((point) => new Phaser.Math.Vector2(point.x, point.y)));
    face.lineStyle(line, DECK_LIP, 1);
    face.strokePoints(lip.map((point) => new Phaser.Math.Vector2(point.x, point.y)));
    face.restore();
  }

  /**
   * Each pit sunk a step (#2973): its floor, its far wall with the mouths
   * of the tunnels leaving it, under whoever is in it. The ground in front
   * of it and over each tunnel then draws as a deck of the ground's layer,
   * so it covers them, the tunnel's outline inlaid faintly in it.
   */
  private drawPits(structure: MapStructure, line: number, palette: ArenaPalette): void {
    if (structure.pits.length === 0 && structure.tunnels.length === 0) {
      return;
    }
    const pit = this.structureAt({ kind: "pit" });
    const cover = this.structureAt({ kind: "deck", deckLayer: structure.ground });
    for (const each of structure.pits) {
      const drawing = pitDrawing(structure, each);
      pit.fillStyle(PIT_FLOOR, 1);
      this.fillFan(pit, drawing.floor);
      pit.fillStyle(PIT_WALL, 1);
      this.fillFan(pit, drawing.farWall);
      pit.fillStyle(TUNNEL_MOUTH, 1);
      for (const mouth of drawing.mouths) {
        this.fillFan(pit, mouth);
      }
      this.drawGroundPatch(cover, drawing.lip, line, palette);
      cover.lineStyle(line, palette.wallStroke, 1);
      this.strokeShape(cover, each.footprint);
    }
    for (const tunnel of structure.tunnels) {
      this.drawGroundPatch(cover, tunnelCover(structure, tunnel), line, palette);
      cover.lineStyle(line, TUNNEL_INLAY.colour, TUNNEL_INLAY.alpha);
      this.strokeShape(cover, tunnel.footprint);
    }
  }

  /** The floor and its grid over the box `outline`, as `drawFloor` draws them there. */
  private drawGroundPatch(
    g: Phaser.GameObjects.Graphics,
    outline: readonly Vec2[],
    line: number,
    palette: ArenaPalette,
  ): void {
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const [left, right] = [Math.min(...xs), Math.max(...xs)];
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
    g.fillStyle(palette.floor ?? 0, 1);
    g.fillRect(left, top, right - left, bottom - top);
    g.lineStyle(line, palette.grid, 1);
    for (let x = Math.ceil(left / GRID_STEP) * GRID_STEP; x <= right; x += GRID_STEP) {
      g.lineBetween(x, top, x, bottom);
    }
    for (let y = Math.ceil(top / GRID_STEP) * GRID_STEP; y <= bottom; y += GRID_STEP) {
      g.lineBetween(left, y, right, y);
    }
  }

  /**
   * `shape` stacked from lift `low` up to `high`: a side face, or a pillar.
   * A `capped` column has `shape` drawn opaque at `high` after it, a deck
   * or a wall's top: its own top is all under that, so it is only its
   * south sides, swept the whole way up (#3162). Of an uncapped one's top,
   * what `hidden` covers is left out.
   */
  private drawColumn(
    g: Phaser.GameObjects.Graphics,
    shape: RenderableShape,
    low: number,
    high: number,
    colour: number,
    capped = false,
    hidden: readonly (readonly Vec2[])[] = [],
  ): void {
    if (high <= low) {
      return;
    }
    // Up to the last of the outlines it once stacked, so nothing it shows moves.
    const top = low + (Math.ceil((high - low) / SIDE_FACE_SLICE) - 1) * SIDE_FACE_SLICE;
    g.fillStyle(colour, 1);
    if (!capped) {
      g.save();
      g.translateCanvas(0, -top);
      this.fillShapeShown(
        g,
        shape,
        hidden.map((outline) => outline.map(({ x, y }) => ({ x, y: y + top }))),
      );
      g.restore();
    }
    // A parallelogram each: two triangles, never a path Phaser earcuts every frame.
    // A top cut round what is hidden meets its sides edge to part of an
    // edge, which leaves pixels between them: the sides reach into it.
    const reach = capped ? high : hidden.length > 0 ? top + 1 : top;
    for (const [a, b, c, d] of sweptEdges(shape, low, reach)) {
      if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
        g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
      }
    }
  }

  private drawFlatWall(
    g: Phaser.GameObjects.Graphics,
    wall: RenderableWall,
    line: number,
    palette: ArenaPalette,
  ): void {
    g.fillStyle(palette.wallTop, 1);
    g.lineStyle(line, palette.wallStroke, 1);
    this.fillShape(g, wall);
    this.strokeShape(g, wall);
  }

  /** A wall with height: its front face, its top, and a lit edge along the top's front. */
  private drawWallBox(
    g: Phaser.GameObjects.Graphics,
    wall: RenderableWall,
    base: number,
    line: number,
    palette: ArenaPalette,
  ): void {
    const top = base + WALL_HEIGHT;
    this.drawColumn(g, wall, base, top, palette.wallFace, true);
    g.save();
    g.translateCanvas(0, -top);
    this.drawFlatWall(g, wall, line, palette);
    g.lineStyle(line * WALL_LIT_WIDTH, palette.wallLit, 1);
    for (const { from, to } of southFacingEdges(wall)) {
      g.lineBetween(from.x, from.y, to.x, to.y);
    }
    g.restore();
  }

  private fillShape(g: Phaser.GameObjects.Graphics, wall: RenderableShape): void {
    if (wall.kind === "rect") {
      g.fillRect(wall.x, wall.y, wall.width, wall.height);
      return;
    }
    for (const [a, b, c] of shapeTriangles(wall)) {
      if (a !== undefined && b !== undefined && c !== undefined) {
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
    }
  }

  /**
   * `shape` filled but where `hidden`, in the same coordinates (#3162):
   * what decks drawn after it cover anyway, so the floor or a cliff under
   * a terrace does not cost a frame twice.
   */
  private fillShapeShown(
    g: Phaser.GameObjects.Graphics,
    shape: RenderableShape,
    hidden: readonly (readonly Vec2[])[],
  ): void {
    if (hidden.length === 0) {
      this.fillShape(g, shape);
      return;
    }
    const { boxes, pieces } = shownFill(
      shapeOutline(shape),
      shapeTriangles(shape),
      hidden,
      SHOWN_FILL_CELL,
      SHOWN_FILL_MARGIN,
    );
    for (const { x, y, width, height } of boxes) {
      g.fillRect(x, y, width, height);
    }
    for (const piece of pieces) {
      this.fillFan(g, piece);
    }
  }

  private strokeShape(g: Phaser.GameObjects.Graphics, wall: RenderableShape): void {
    if (wall.kind === "rect") {
      g.strokeRect(wall.x, wall.y, wall.width, wall.height);
      return;
    }
    const points = wall.points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.strokePoints(points, true);
  }

  /**
   * The floor and its grid, under the water and the ward circles on it
   * (#2984). On a map with a ground outline (#3066) they are inside it,
   * over the land outside, and its edge is traced over both.
   */
  private drawFloor(palette: ArenaPalette, line: number): void {
    const g = this.floorGraphics;
    if (g === undefined) {
      return;
    }
    g.clear();
    const { bounds } = this.snapshot.structure;
    // What the decks cover of it, they draw over opaque (#3162).
    const hidden = deckCovers(this.snapshot.structure, this.snapshot.walls, FLOOR_DEPTH);
    if (bounds.kind === "outline") {
      g.fillStyle(palette.floor ?? ARENA_BACKGROUND, 1);
      this.fillShapeShown(g, { kind: "polygon", points: bounds.outline }, hidden);
    } else if (palette.floor !== undefined) {
      g.fillStyle(palette.floor, 1);
      const { width, height } = this.arena;
      this.fillShapeShown(g, { kind: "rect", x: 0, y: 0, width, height }, hidden);
    }
    this.drawGrid(g, line, palette);
    if (bounds.kind === "outline") {
      paintOutsideEdge(
        {
          lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
          strokeOutline: (points) => {
            this.strokeShape(g, { kind: "polygon", points });
          },
        },
        bounds.outside,
        bounds.outline,
      );
    }
  }

  /**
   * The land outside the ground's outline (#3066), under the floor: tiled
   * sprites over the rectangle where the floor leaves it showing (#3162),
   * lit there by the light map, and four round it, which no light map
   * covers, so tinted by the map's ambient and sun instead. Built once
   * per outline.
   */
  private drawOutside(bounds: MapBounds, lighting: MapLighting | undefined): void {
    if (this.outside?.bounds !== bounds) {
      this.dropOutside();
      if (bounds.kind === "outline") {
        this.outside = this.buildOutside(bounds);
      }
    }
    const tint = lighting === undefined ? 0xffffff : baseTint(lighting, false);
    for (const band of this.outside?.frame ?? []) {
      band.setTint(tint);
    }
  }

  private buildOutside(bounds: OutlineBounds): OutsideLand {
    const key = `outside-${bounds.outside}`;
    if (!this.textures.exists(key)) {
      const painter = this.make.graphics({}, false);
      paintOutsideTile(outsidePainter(painter), bounds.outside);
      painter.generateTexture(key, OUTSIDE_TILE, OUTSIDE_TILE);
      painter.destroy();
    }
    // Each tiled from the world's origin, so the four bands and the
    // rectangle meet without a seam.
    const tiled = (x: number, y: number, w: number, h: number): Phaser.GameObjects.TileSprite =>
      this.add
        .tileSprite(x, y, w, h, key)
        .setOrigin(0, 0)
        .setTilePosition(x, y)
        .setDepth(OUTSIDE_DEPTH);
    const { width, height } = this.arena;
    return {
      bounds,
      inside: outsideCover(bounds.outline, width, height).map((box) =>
        tiled(box.x, box.y, box.width, box.height),
      ),
      frame: outsideFrame(width, height).map((band) =>
        tiled(band.x, band.y, band.width, band.height),
      ),
    };
  }

  /** Drops the land outside the outline drawn last, if any. */
  private dropOutside(): void {
    if (this.outside === undefined) {
      return;
    }
    for (const band of [...this.outside.inside, ...this.outside.frame]) {
      band.destroy();
    }
    this.outside = undefined;
  }

  /** The water's ripples (#2984), at render time; still under reduced motion. */
  private drawRipples(): void {
    for (const { graphics } of this.rippleGraphics.values()) {
      graphics.clear();
    }
    const line = 1 / (this.view?.zoom ?? 1);
    for (const shape of this.waterShapes) {
      const { graphics, painter } = this.ripplesAt(shape.layer);
      graphics.save();
      graphics.translateCanvas(0, -elevationOf(shape.layer, this.snapshot.structure.ground));
      WATER_ART[waterArtKey(shape.depth)].ripples(
        painter,
        shape,
        line,
        this.now,
        this.reducedMotion,
      );
      graphics.restore();
    }
  }

  /** The map's effect zones, lighting on or off: they are on the ground, as its water is. */
  private drawZones(): void {
    for (const graphics of this.zoneGraphics.values()) {
      graphics.clear();
    }
    const line = 1 / (this.view?.zoom ?? 1);
    const { zones, ground } = this.snapshot.structure;
    const grounds = this.zoneGroundsOf(zones);
    for (const [index, zone] of zones.entries()) {
      let g = this.zoneGraphics.get(zone.layer);
      if (g === undefined) {
        g = this.add
          .graphics()
          .setDepth(renderOrder({ kind: "zone", layer: zone.layer, part: "marks" }));
        this.zoneGraphics.set(zone.layer, g);
      }
      const look = ZONE_LOOK[zone.kind];
      const { clock } = this.snapshot;
      const moved = zoneOffsetAt(zone.path, clock);
      const lift = elevationOf(zone.layer, ground);
      g.save();
      g.translateCanvas(moved.x, moved.y - lift);
      const painted = grounds[index];
      if (painted !== undefined) {
        const { left, top } = painted.art.bounds;
        painted.image
          .setPosition(left + moved.x, top + moved.y - lift)
          .setAlpha(zoneGroundAlpha(painted.art, look, this.now, this.reducedMotion));
        paintZoneMotion(this.zoneMotionPainter(g), painted.art, line, this.now, this.reducedMotion);
      }
      // A timed or moving hazard (#3029) is drawn by its phase on the match
      // clock, where its path has taken it: the host strikes by the same.
      // Its mark (#3053) stands under its ring, which tells its true reach.
      const hazard = hazardKindOf(zone);
      const phase = zonePhaseAt(zone, clock);
      if (hazard !== undefined) {
        HAZARD_ART[hazard](g, {
          area: zone.area,
          phase,
          // Still motion holds each phase at its end: shown by state, not by motion.
          progress: this.reducedMotion ? 1 : phaseProgressAt(zone.schedule, clock),
          now: this.reducedMotion ? 0 : this.now,
          line,
          ...pathMotionAt(zone.path, clock),
        });
      }
      const edgeScale = ZONE_RULES[zone.kind].trigger === "strike" ? strikeEdgeScale(phase) : 1;
      // A boulder's edge stays faint: the rock is what is seen coming.
      g.lineStyle(ZONE_EDGE_WIDTH * edgeScale * line, look.edge, hazard === "boulder" ? 0.4 : 1);
      this.strokeShape(g, zone.area);
      if (zone.kind === "draining-spire") {
        this.drawSpire(g, zone.area, line);
      }
      g.restore();
    }
  }

  /**
   * The map's fog, plumes and weather (#3032), only with lighting on. Its
   * vents stand either way: they are stone on the ground, as torches are.
   */
  private drawAtmosphere(dt: number, view: Box): void {
    for (const graphics of [...this.fogGraphics.values(), ...this.plumeGraphics.values()]) {
      graphics.clear();
    }
    this.weatherGraphics?.clear();
    const { atmosphere, ground, layerCount } = this.snapshot.structure;
    if (atmosphere === undefined) {
      this.atmosphereDrawn = undefined;
      return;
    }
    if (this.atmosphereDrawn?.atmosphere !== atmosphere) {
      this.atmosphereDrawn = {
        atmosphere,
        fog: atmosphere.fog.map(fogArtOf),
        particles: new AtmosphereParticles(atmosphere),
      };
    }
    const { fog, particles } = this.atmosphereDrawn;
    const line = 1 / (this.view?.zoom ?? 1);
    const on = lightingOn();
    const worldView = this.cameras.main.worldView;
    particles.step(dt, worldView, { on, reducedMotion: this.reducedMotion });
    for (const plume of atmosphere.plumes) {
      paintVent(this.fogAt(plume.layer), plume, elevationOf(plume.layer, ground), line);
    }
    if (!on) {
      return;
    }
    for (const art of fog) {
      paintFog(
        this.atmospherePainter(this.fogAt(art.layer), line),
        art,
        elevationOf(art.layer, ground),
        this.now,
        this.reducedMotion,
        view,
      );
    }
    const weather = (this.weatherGraphics ??= this.add
      .graphics()
      .setDepth(renderOrder({ kind: "weather" })));
    if (atmosphere.weather !== null) {
      paintWeatherWash(weather, atmosphere.weather, worldView);
    }
    for (const particle of particles.particles) {
      if (particle.kind === "smoke" || particle.kind === "steam") {
        const band = characterBand(particle.layer, layerCount);
        let g = this.plumeGraphics.get(band);
        if (g === undefined) {
          g = this.add.graphics().setDepth(renderOrder({ kind: "plume", band }));
          this.plumeGraphics.set(band, g);
        }
        paintParticle(g, particle, elevationOf(particle.layer, ground), line);
      } else {
        paintParticle(weather, particle, 0, line);
      }
    }
  }

  /** The graphics `layer`'s fog banks and vents draw into. */
  private fogAt(layer: number): Phaser.GameObjects.Graphics {
    let g = this.fogGraphics.get(layer);
    if (g === undefined) {
      g = this.add.graphics().setDepth(renderOrder({ kind: "fog", layer }));
      this.fogGraphics.set(layer, g);
    }
    return g;
  }

  /** A draining spire (#3028): a faint violet ring on its edge; its obelisk stands in its painted ground. */
  private drawSpire(g: Phaser.GameObjects.Graphics, area: RenderableShape, line: number): void {
    g.lineStyle(ZONE_EDGE_WIDTH * 3 * line, SPIRE_LOOK.ring, SPIRE_LOOK.ringAlpha);
    this.strokeShape(g, area);
  }

  /**
   * `zones`' painted grounds (#3052), one canvas texture each, painted
   * once: a kind still drawn flat has none. Made again only when the map's
   * zones change.
   */
  private zoneGroundsOf(zones: readonly MapZone[]): readonly (ZoneGround | undefined)[] {
    if (this.zoneGrounds?.zones === zones) {
      return this.zoneGrounds.grounds;
    }
    this.dropZoneGrounds();
    const grounds = zones.map((zone, index) => {
      const art = zoneArtOf(zone, index);
      if (art === undefined) {
        return undefined;
      }
      const { width, height } = art.bounds;
      const scale = Math.min(
        ZONE_TEXTURE_SCALE,
        ZONE_TEXTURE_MAX_SIDE / Math.max(1, width, height),
      );
      const key = `zone-ground-${String(zoneGroundTextures)}`;
      zoneGroundTextures += 1;
      const texture = this.textures.createCanvas(
        key,
        Math.max(1, Math.ceil(width * scale)),
        Math.max(1, Math.ceil(height * scale)),
      );
      if (texture === null) {
        throw new Error("zones: could not create a zone's ground");
      }
      paintZoneGround(texture.context, art, scale);
      texture.refresh();
      const image = this.add
        .image(art.bounds.left, art.bounds.top, key)
        .setOrigin(0, 0)
        .setScale(1 / scale)
        .setDepth(renderOrder({ kind: "zone", layer: zone.layer, part: "ground" }));
      return { art, image, key };
    });
    this.zoneGrounds = { zones, grounds };
    return grounds;
  }

  /**
   * What a scene start must not inherit: Phaser reuses this instance on
   * restart, so a lever seen last match is first seen afresh (#3087).
   */
  private shutdown(): void {
    this.lightingPass?.destroy();
    this.lightingPass = undefined;
    this.dropOutside();
    this.dropZoneGrounds();
    this.dropPaving();
    this.leverFlips.clear();
    this.alt?.dispose();
    this.alt = undefined;
  }

  /**
   * The map's roads, squares and tracks (#3210) on their layers' floors,
   * one canvas texture each, painted once: made again only when the map's
   * paving or its colours change, so they cost nothing per frame.
   */
  private drawPaving(structure: MapStructure): void {
    const colours = pavingPalette(structure);
    const drawn = this.pavingDrawn;
    if (drawn !== undefined && drawn.paving === structure.paving && drawn.colours === colours) {
      return;
    }
    this.dropPaving();
    const pavings = structure.paving ?? [];
    const drawings = pavings.map((paving) => pavingDrawing(paving, colours[paving.look]));
    const sizes = pavingTextureSizes(drawings.map((drawing) => drawing.bounds));
    const painted = pavings.map((paving, at) => {
      const drawing = drawings[at];
      const size = sizes[at];
      if (drawing === undefined || size === undefined) {
        throw new Error("paving: a paving lost its drawing");
      }
      const { x, y } = drawing.bounds;
      const { scale, width, height } = size;
      const key = `paving-${String(pavingTextures)}`;
      pavingTextures += 1;
      const texture = this.textures.createCanvas(key, width, height);
      if (texture === null) {
        throw new Error("paving: could not create a paving's texture");
      }
      paintPaving(texture.context, drawing, scale);
      texture.refresh();
      const image = this.add
        .image(x, y - elevationOf(paving.layer, structure.ground), key)
        .setOrigin(0, 0)
        .setScale(1 / scale)
        .setDepth(renderOrder({ kind: "paving", layer: paving.layer }));
      return { image, key };
    });
    this.pavingDrawn = { paving: structure.paving, colours, painted };
  }

  /** Drops the paving drawn last, and its textures. */
  private dropPaving(): void {
    for (const { image, key } of this.pavingDrawn?.painted ?? []) {
      image.destroy();
      this.textures.remove(key);
    }
    this.pavingDrawn = undefined;
  }

  /** Drops the painted grounds of the zones drawn last, and their textures. */
  private dropZoneGrounds(): void {
    for (const painted of this.zoneGrounds?.grounds ?? []) {
      if (painted !== undefined) {
        painted.image.destroy();
        this.textures.remove(painted.key);
      }
    }
    this.zoneGrounds = undefined;
  }

  /** `g` as fog is drawn through: its puffs with only the sides they need (#3162). */
  private atmospherePainter(g: Phaser.GameObjects.Graphics, line: number): AtmospherePainter {
    return {
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillCircle: (x, y, radius) => {
        fillDisc(g, x, y, radius, line);
      },
      fillEllipse: (x, y, width, height) => g.fillEllipse(x, y, width, height),
      strokeEllipse: (x, y, width, height) => g.strokeEllipse(x, y, width, height),
      lineBetween: (x1, y1, x2, y2) => g.lineBetween(x1, y1, x2, y2),
      fillRect: (x, y, width, height) => g.fillRect(x, y, width, height),
    };
  }

  /** `g` as a zone's moving marks draw through it. */
  private zoneMotionPainter(g: Phaser.GameObjects.Graphics): ZoneMotionPainter {
    const line = 1 / (this.view?.zoom ?? 1);
    return {
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillCircle: (x, y, radius) => {
        fillDisc(g, x, y, radius, line);
      },
      strokeCircle: (x, y, radius) => {
        strokeDisc(g, x, y, radius, line);
      },
      lineBetween: (x1, y1, x2, y2) => g.lineBetween(x1, y1, x2, y2),
      fillOutline: (outline) => {
        this.fillShape(g, { kind: "polygon", points: outline });
      },
      strokeOutline: (outline) => {
        this.strokeShape(g, { kind: "polygon", points: outline });
      },
    };
  }

  private ripplesAt(layer: number): {
    readonly graphics: Phaser.GameObjects.Graphics;
    readonly painter: WaterPainter;
  } {
    let ripples = this.rippleGraphics.get(layer);
    if (ripples === undefined) {
      const graphics = this.add
        .graphics()
        .setDepth(renderOrder({ kind: "water", layer, part: "ripples" }));
      ripples = { graphics, painter: this.waterPainter(graphics) };
      this.rippleGraphics.set(layer, ripples);
    }
    return ripples;
  }

  /** `g` as water draws through it: outlines filled as triangles, as a wall's are. */
  private waterPainter(g: Phaser.GameObjects.Graphics): WaterPainter {
    return {
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillOutline: (outline) => {
        this.fillShape(g, { kind: "polygon", points: outline });
      },
      strokeOutline: (outline) => {
        this.strokeShape(g, { kind: "polygon", points: outline });
      },
      lineBetween: (x1, y1, x2, y2) => g.lineBetween(x1, y1, x2, y2),
    };
  }

  /**
   * The grid over the arena's bounds, not the screen: over its rectangle,
   * edged in `wall-stroke`, or inside its outline (#3066), whose edge the
   * outside draws. Past either is `bg` or the outside.
   */
  private drawGrid(g: Phaser.GameObjects.Graphics, line: number, palette: ArenaPalette): void {
    const { width, height } = this.arena;
    const { bounds } = this.snapshot.structure;
    g.lineStyle(line, palette.grid, 1);
    if (bounds.kind === "outline") {
      for (let x = 0; x <= width; x += GRID_STEP) {
        for (const [from, to] of insideRuns(bounds.outline, "x", x)) {
          g.lineBetween(x, from, x, to);
        }
      }
      for (let y = 0; y <= height; y += GRID_STEP) {
        for (const [from, to] of insideRuns(bounds.outline, "y", y)) {
          g.lineBetween(from, y, to, y);
        }
      }
      return;
    }
    for (let x = 0; x <= width; x += GRID_STEP) {
      g.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += GRID_STEP) {
      g.lineBetween(0, y, width, y);
    }
    g.lineStyle(line, WALL_STROKE, 1);
    g.strokeRect(0, 0, width, height);
  }
}

/**
 * `shape` as triangles, corner by corner. A polygon is triangulated here,
 * once per map, and filled as triangles: Phaser earcuts a `fillPoints`
 * path again on every frame it renders (#1353).
 */
function shapeTriangles(shape: RenderableShape): readonly (readonly Vec2[])[] {
  const points = shapeOutline(shape);
  const corners =
    shape.kind === "rect"
      ? [0, 1, 2, 0, 2, 3]
      : Phaser.Geom.Polygon.Earcut(points.flatMap((p) => [p.x, p.y]));
  const triangles: (readonly Vec2[])[] = [];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const triangle = [corners[i], corners[i + 1], corners[i + 2]].flatMap((index) => {
      const corner = index === undefined ? undefined : points[index];
      return corner === undefined ? [] : [corner];
    });
    if (triangle.length === 3) {
      triangles.push(triangle);
    }
  }
  return triangles;
}

/** A map's bounds when they are an outline. */
type OutlineBounds = Extract<MapBounds, { readonly kind: "outline" }>;

/** The land outside a ground outline (#3066), tiled. */
interface OutsideLand {
  readonly bounds: OutlineBounds;
  /** Over the rectangle where the floor leaves it showing (#3162), under the floor. */
  readonly inside: readonly Phaser.GameObjects.TileSprite[];
  /** Round the rectangle, out to the margin. */
  readonly frame: readonly Phaser.GameObjects.TileSprite[];
}

/** `g` as the painter an outside tile is drawn through. */
function outsidePainter(g: Phaser.GameObjects.Graphics): OutsidePainter {
  return {
    fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
    lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
    fillRect: (x, y, width, height) => g.fillRect(x, y, width, height),
    fillCircle: (x, y, radius) => g.fillCircle(x, y, radius),
    fillEllipse: (x, y, width, height) => g.fillEllipse(x, y, width, height),
    strokeEllipse: (x, y, width, height) => g.strokeEllipse(x, y, width, height),
    fillTriangle: (x1, y1, x2, y2, x3, y3) => g.fillTriangle(x1, y1, x2, y2, x3, y3),
    lineBetween: (x1, y1, x2, y2) => g.lineBetween(x1, y1, x2, y2),
  };
}

/** Each layer's painter, made once: a body is painted every frame. */
const painters = new WeakMap<Phaser.GameObjects.Graphics, Painter>();

/** `g` as the painter a body is drawn through (#1250). */
function phaserPainter(g: Phaser.GameObjects.Graphics): Painter {
  let painter = painters.get(g);
  if (painter === undefined) {
    painter = {
      fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
      lineStyle: (width, colour, alpha) => g.lineStyle(width, colour, alpha),
      fillCircle: (x, y, radius) => g.fillCircle(x, y, radius),
      strokeCircle: (x, y, radius) => g.strokeCircle(x, y, radius),
      beginPath: () => g.beginPath(),
      moveTo: (x, y) => g.moveTo(x, y),
      lineTo: (x, y) => g.lineTo(x, y),
      arc: (x, y, radius, from, to) => g.arc(x, y, radius, from, to),
      strokePath: () => g.strokePath(),
      fillPoints: (points) =>
        g.fillPoints(
          points.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
          true,
        ),
    };
    painters.set(g, painter);
  }
  return painter;
}

/** Begins a closed path along `points` on `g`, to fill or stroke. */
function tracePath(g: Phaser.GameObjects.Graphics, points: readonly Point[]): void {
  const [first, ...rest] = points;
  g.beginPath();
  if (first !== undefined) {
    g.moveTo(first.x, first.y);
    for (const point of rest) {
      g.lineTo(point.x, point.y);
    }
  }
  g.closePath();
}

export type {
  AreaFlash,
  ArenaSnapshot,
  FloatingText,
  PolygonRenderableWall,
  RectRenderableWall,
  RenderableActor,
  RenderableWall,
} from "./arena-snapshot.js";
export { EMPTY_SNAPSHOT, actorAtPoint, healthFraction, teamColour } from "./arena-snapshot.js";

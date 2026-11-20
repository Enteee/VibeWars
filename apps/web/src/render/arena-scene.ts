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
  SPIRIT_RING_WIDTH,
  spiritRingAlpha,
  nameplateLayout,
  placeFloatingText,
  signetTextureKey,
  swingFlashAlpha,
  SKILL_ARC_WIDTH,
  markedForTeam,
  teamColour,
  type AreaFlash,
  type NameplateLayout,
  type Rect,
  type BeaconBolt,
  type SwingFlash,
  isDoor,
  isBreakableWall,
  recordBody,
  selfLayer,
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
  DECK_LIP,
  pitFloor,
  pitWall,
  TUNNEL_MOUTH,
  WALL_STROKE,
  arenaPalette,
  type ArenaPalette,
  breakableLook,
  type BreakableLook,
  type MapLook,
  materialsOf,
  pavingPalette,
  type PavingLookColours,
  type StonePavingLook,
  SWITCH_MARK_LOOK,
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
  seenFrom,
  tunnelCover,
  tunnelCoverBox,
  boxWithout,
  segmentInBox,
  tunnelFloor,
  tunnelSeam,
  tunnelOpenings,
  tunnelsHolding,
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
  projectileLayer,
  projectilePosition,
  projectileCore,
  projectileTrail,
  SHOT_CORE_COLOUR,
  SHOT_SHADOW,
  type ShotDot,
  type TrailDot,
  shotFadeAlpha,
} from "./projectiles.js";
import { NO_COVER, frameClock, snapView, type CameraView, type Cover } from "./camera-rig.js";
import { edgeMarkers, type EdgeMarker, type EdgeThing } from "./edge-markers.js";
import { statusRowLayout } from "./status-icons.js";
import {
  decayWalkMarker,
  walkMarkerAlpha,
  walkMarkerAt,
  walkMarkerTicks,
  type WalkMarker,
} from "./walk-marker.js";
import { weaponMarkLayout, weaponTipAt } from "./weapon-mark.js";
import { AttackClock, REST_FRAME, shownFrame, type AttackFrame } from "./attack-clock.js";
import { CAST_GLOW_CORE, CAST_GLOW_CORE_LIFT, castGlow } from "./cast-beats.js";
import { impactMarks, mergeImpacts, type Impact } from "./body-impacts.js";
import { conditionMarks, cuePhase } from "./body-conditions.js";
import {
  addShoutMarks,
  chevronAlpha,
  decayShoutMarks,
  SHOUT_COLOUR,
  SHOUT_RING_WIDTH,
  shoutChevron,
  shoutRingRadius,
  type ShoutMark,
} from "./shout-marks.js";
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
  CURSE_MARK_SIDES,
  CURSE_MARK_WIDTH,
  curseMarkCorner,
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
  SPIRIT_CORE,
  SPIRIT_CORE_SCALE,
  SPIRIT_GREEN,
  SPIRIT_RIM_WIDTH,
  TICK_EDGE,
  creatureOrnament,
  creatureOutline,
  creatureTick,
  dashes,
  spiritBob,
  spiritWisp,
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
  recordFlag,
  recordStand,
  recordSwitch,
  type RenderableCapturePoint,
  type RenderableGate,
  type RenderableSwitch,
  type RenderableTeleport,
  type RenderableFlag,
} from "./flag-objects.js";
import {
  GOAL_MARK_GOLD,
  goalMarkCommands,
  goalMarkFade,
  traceHiddenGoalMark,
  type GoalMark,
} from "./goal-mark.js";
import {
  GROUND_COLOUR,
  GROUND_DASH,
  GROUND_GAP,
  GROUND_STROKES,
  GROUND_STROKE_WIDTH,
  groundLook,
  groundMotion,
  overlapsOf,
  poolBreath,
  stackedPoolAlpha,
  swirl,
  wisp,
  type Swirl,
  type Wisp,
} from "./ground-effect-look.js";
import {
  DEATH_SECONDS,
  DUST_SECONDS as DEATH_DUST_SECONDS,
  DUST_SPECKS,
  RESPAWN_COLUMN_HEIGHT,
  RESPAWN_COLUMN_SECONDS,
  RESPAWN_SECONDS,
  FLASH_SECONDS,
  decayReactions,
  deathProgress,
  dustSpeck,
  flashAmount,
  mixColour,
  respawnColumnAlpha,
  respawnRing,
  respawnScale,
  slideOffset,
  startReaction,
  type BodyDeath,
  type BodyFlash,
  type BodyRespawn,
} from "./body-reactions.js";
import { lyingPose } from "./lying-pose.js";
import {
  SLEEPER_RIM_WIDTH,
  SLEEPER_Z_WIDTH,
  mistGateCommands,
  parasolCommands,
  sleeperCommands,
  type PropCommand,
  type TutorialProp,
} from "./tutorial-props.js";
import { cullToView, StaticGraphicsCull, type Box } from "./graphics-cull.js";
import { layerZoom, mapLayerChanged, type MapLayer } from "./map-layer.js";
import {
  LightingPass,
  litOverhangColours,
  litStructurePalette,
  baseTint,
} from "./lighting-pass.js";
import { bodyUnder, overhangAlpha, paintOverhang, type OverhangCover } from "./overhang-art.js";
import {
  DECK_ART,
  FADING_TOP_LOOKS,
  SWITCHED_DECK_ART,
  TRANSITION_ART,
  deckPalette,
  transitionPalette,
  type DeckFrame,
} from "./structure-art.js";
import {
  EVERYWHERE,
  clippedPainter,
  coverPieces,
  liftedCovers,
  outlineArea,
  wallPieces,
  type CoverPiece,
  type TunnelCoverBox,
  type WallPiece,
} from "./cover-pieces.js";
import { liftFrame, liftPlatform, liftShaft, type LiftFrame } from "./lift-art.js";
import { paintDeckShadows, sunShadowOffset } from "./shadow-geometry.js";
import { lightingOn } from "./lighting-preference.js";
import { passEnd, passStart } from "./pass-timing.js";
import { LIGHT_MARK_ART, lightMarkKey } from "./light-mark.js";
import { SWITCH_MARK_ART, leverThrown, switchMarkKey } from "./switch-mark.js";
import { paintArrival, paintTeleportEntry, paintTeleportExit } from "./teleport-mark.js";
import { dotsAlong, switchFlashAlpha, switchLinkAlpha } from "./switch-link.js";
import { doorPalette, GATE_ART, paintPlate, type GatePainter } from "./gate-mark.js";
import {
  BARRIER_ART,
  BREAK_SECONDS,
  BREAKABLE_ART,
  breakablePalette,
  CHIP_SECONDS,
  crackNetwork,
  type CrackNetwork,
  crackTip,
  DUST_SECONDS,
  paintChips,
  paintDust,
  type StonePainter,
  tumbleChunks,
  type TumbleChunk,
} from "./breakable-mark.js";
import {
  breakableBarAnchor,
  breakableHealthFraction,
  breakableSeed,
  type BreakableSeen,
  CRACK_GROW_SECONDS,
  crackReveal,
  drawnReveal,
  observeBreakable,
  recordBreakable,
  type RenderableBreakable,
} from "./breakable-objects.js";
import type { DrawnClickable } from "./pick.js";
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
import { waterPieces, waterShapeOf, type WaterPiece, type WaterShape } from "./water-shape.js";
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
import { GROUND_TILE, grainPixels, groundTileKey, paintDressing } from "./ground-dressing.js";
import {
  isStonePaving,
  paintPaving,
  pavingHoles,
  paintPavingPiece,
  pavingDrawing,
  pavingTextureSizes,
  pavingTunnelPieces,
} from "./paving-painter.js";
import { withZoneLights } from "./zone-light.js";
import { insideRuns, shownBoxes, shownFill } from "./cell-cover.js";
import {
  AtmosphereParticles,
  fogArtOf,
  paintFog,
  paintParticle,
  paintShaft,
  paintVent,
  paintWeatherWash,
  type AtmospherePainter,
  type FogArt,
} from "./atmosphere.js";
import { fogTintOf } from "./ascent-act.js";
import { fillDisc, strokeDisc } from "./disc.js";
import { dashedCircle } from "./dashed-circle.js";
import {
  groundArtOf,
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
  formAuraBreath,
  paintBodyMarks,
  paintFormAura,
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
  RenderableGroundEffect,
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
/** A covered tunnel's seam (#3236): its recessed edge's dark, in CSS px, and a grating slot's bars across it. */
const TUNNEL_SEAM_WIDTH = 4;
const GRATING_BARS = 3;
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
/** A lever's link to what it works (#3236): its targets' outline, and the dots of its line. */
const SWITCH_LINK_WIDTH = 3;
const SWITCH_LINK_DOT_STEP = 14;
const SWITCH_LINK_DOT_RADIUS = 1.6;
/** The ground over the tunnel the local body is in (#3234): how much of it still draws. */
const TUNNEL_CUTAWAY_ALPHA = 0.15;
/** How long that ground takes to fade out or back in, in seconds. */
const TUNNEL_CUTAWAY_FADE = 0.2;

/** A body of water, and its pieces split by the tunnel covers under it (#3350). */
interface WaterSplit {
  readonly shape: WaterShape;
  readonly pieces: readonly WaterPiece[];
}

/** What of the water over one tunnel draws on its own (#3350), to fade with its cover. */
interface WaterOverTunnel {
  readonly surface: Phaser.GameObjects.Graphics;
  readonly ripples: Phaser.GameObjects.Graphics;
  readonly painter: WaterPainter;
}

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
/** An outlined impact spike's dark edge (#3292): this much wider than the spike, the sprites' outline colour. */
const IMPACT_OUTLINE = 2;
const IMPACT_OUTLINE_COLOUR = 0x0e1116;
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
/** The ground's grain (#3484): the outline into the stencil, the grain, the outline out. */
const GRAIN_STENCIL_DEPTH = renderOrder({ kind: "ground-grain", part: "stencil" });
const GRAIN_DEPTH = renderOrder({ kind: "ground-grain", part: "grain" });
const GRAIN_RELEASE_DEPTH = renderOrder({ kind: "ground-grain", part: "release" });
const GRAIN_LINES_DEPTH = renderOrder({ kind: "ground-grain", part: "lines" });
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
/** The owner's side, a dot at the corner of a skill area's icon (#3283). */
const OWNER_PIP_RADIUS = 1.5;

const HEALTH_BAR_WIDTH = 34;
const HEALTH_BAR_HEIGHT = 4;

/** A hover ring fixed on the map (#3557): dashed on the ground, solid off it. */
export interface SceneMarker {
  readonly x: number;
  readonly y: number;
  readonly dashed: boolean;
}

/**
 * How much larger the docs' fixed rings are than the pointer's (#3716): a
 * diagram is shown at about a third of its size, where the game's ring
 * would be a 0.6 px line.
 */
export const DIAGRAM_RING_SCALE = 2.5;
/** The dark line under a diagram's ring, so it reads on pale paving too (#3716). */
const DIAGRAM_RING_UNDER = 0x000000;

/** One hover ring, `scale` times the pointer's: dashed on the ground, solid off it. */
export function drawRing(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  dashed: boolean,
  scale: number,
): void {
  g.lineStyle(1.5 * scale, HOVER_RING, 0.8);
  strokeRing(g, x, y, dashed, HOVER_RADIUS * scale);
}

/** A ring fixed on the map for a diagram (#3716): larger, over a dark under-stroke. */
export function drawDiagramRing(g: Phaser.GameObjects.Graphics, marker: SceneMarker): void {
  g.lineStyle(2 * 1.5 * DIAGRAM_RING_SCALE, DIAGRAM_RING_UNDER, 0.5);
  strokeRing(g, marker.x, marker.y, marker.dashed, HOVER_RADIUS * DIAGRAM_RING_SCALE);
  drawRing(g, marker.x, marker.y, marker.dashed, DIAGRAM_RING_SCALE);
}

function strokeRing(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  dashed: boolean,
  radius: number,
): void {
  if (!dashed) {
    g.strokeCircle(x, y, radius);
    return;
  }
  const dash = Math.PI / HOVER_DASHES;
  for (let k = 0; k < HOVER_DASHES; k += 1) {
    g.beginPath();
    g.arc(x, y, radius, 2 * k * dash, (2 * k + 1) * dash);
    g.strokePath();
  }
}

export class ArenaScene extends Phaser.Scene {
  public static readonly KEY = "arena";

  /** Wards on the floor (#1087), under the grid, walls and bodies. */
  private groundGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The ground's grain and dressing (#3484), while the map is layered. */
  private grain: GroundGrain | undefined;
  /** The grain on each pit's near lip (#3484), redrawn with the pits. */
  private lipGrain: Phaser.GameObjects.TileSprite[] = [];
  /** Each ward's icon, by ground effect id (#1087). */
  private groundIcons = new Map<number, Phaser.GameObjects.Image>();
  /** Wards on decks (#2979), one `Graphics` per layer above the ground, made when first needed. */
  private deckGroundGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Each deck ward's icon, by ground effect id; its depth is its layer's, for life. */
  private deckGroundIcons = new Map<number, Phaser.GameObjects.Image>();
  /** The opaque floor of a layered map, under the wards. */
  private floorGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The floor's grid and the outline's edge, over its grain (#3484). */
  private floorLines: Phaser.GameObjects.Graphics | undefined;
  /** The grid, the arena's edge and the walls (#1353), over the wards; drawn when they change. */
  private mapGraphics: Phaser.GameObjects.Graphics | undefined;
  /** The land outside a ground outline (#3066), while the map has one. */
  private outside: OutsideLand | undefined;
  /** What `mapGraphics` shows; `undefined` until it is first drawn. */
  private drawnMap: MapLayer | undefined;
  /** The camera's zoom at the last `drawMap`, to tell a settled zoom from an easing one (#3545). */
  private lastViewZoom: number | undefined;
  /** What hides a body on the drawn map (#2831). */
  private mapOccluders: readonly Occluder[] = [];
  /** `mapOccluders` as the local body sees them: its own tunnel cut away (#3234). */
  private occluders: readonly Occluder[] = [];
  /** The tunnels the local body stands in, whose covers are cut away (#3234). */
  private viewerTunnels: ReadonlySet<number> = new Set();
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
    readonly bar: Phaser.GameObjects.Graphics;
  }[] = [];
  /** The static structure, one object per place in `renderOrder`. */
  private readonly structureGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /**
   * The ground over each tunnel (#3234) and its seam over the paving
   * (#3236), by its index: both faded while the local body is in it.
   */
  private readonly tunnelCovers = new Map<
    number,
    {
      readonly ground: Phaser.GameObjects.Graphics;
      readonly seam: Phaser.GameObjects.Graphics;
      /** The ground grain over its cover's pieces (#3484), faded with it, and the grid over that. */
      grain: Phaser.GameObjects.TileSprite[];
      readonly lines: Phaser.GameObjects.Graphics;
    }
  >();
  /**
   * Each overhang (#3293) and arch top (#3312) as drawn, and where it
   * hangs: faded while a body is under it.
   */
  private coversDrawn: {
    readonly cover: OverhangCover;
    readonly graphics: Phaser.GameObjects.Graphics;
    /** The tunnel it is over, for a deck's top split by one (#3352): it fades with its cover too. */
    readonly tunnel: number | undefined;
    /** How far it has faded as an overhang, before the cut-away. */
    overhang: number;
  }[] = [];
  /**
   * What of the decks over each tunnel draws on its own (#3352), by the
   * tunnel's index: tops and side faces, faded with its cover.
   */
  private readonly decksOverTunnels = new Map<number, Phaser.GameObjects.Graphics[]>();
  /** The floor, map and structure graphics, cut to the camera every frame (#3240). */
  private readonly staticCull = new StaticGraphicsCull();
  /** Each lift's platform graphics (#3079), by depth: cleared and drawn every frame. */
  private readonly liftGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Each lift as its art draws it, in the snapshot's `lifts` order; set when the map is drawn. */
  private liftFrames: readonly { readonly frame: LiftFrame; readonly upperLayer: number }[] = [];
  /**
   * The map's water (#2984), built when the map changes: each body split
   * by the tunnel covers under it (#3350).
   */
  private waterShapes: readonly WaterSplit[] = [];
  /**
   * The surface and ripples of the water over each tunnel (#3350), by its
   * index: faded with its cover.
   */
  private readonly waterOverTunnels = new Map<number, WaterOverTunnel>();
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
  /** Light shafts by layer (#3589), added onto what is under them. */
  private readonly shaftGraphics = new Map<number, Phaser.GameObjects.Graphics>();
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
        readonly colours: Record<StonePavingLook, PavingLookColours>;
        readonly painted: readonly {
          readonly image: Phaser.GameObjects.Image;
          readonly key: string;
        }[];
        /** The pieces over each tunnel (#3272), by its index: they fade with its cover. */
        readonly overTunnels: ReadonlyMap<number, readonly Phaser.GameObjects.Image[]>;
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
  /** What this frame drew to be clicked (#3634), as it draws it. */
  private recording: DrawnClickable[] = [];
  /** What the last frame drew to be clicked (#3634). */
  private clickables: readonly DrawnClickable[] = [];
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
  /**
   * Each breakable wall's own graphics (#3370), by id: what it has seen of
   * the wall, and whether what is drawn is its settled look, so a wall
   * redraws only while it cracks or falls.
   */
  private readonly breakableDrawings = new Map<
    string,
    { graphics: Phaser.GameObjects.Graphics; seen: BreakableSeen | undefined; settled: boolean }
  >();
  /** How each breakable wall draws, set when the map is drawn: its material, cracks and fall. */
  private breakableStyle:
    | {
        readonly height: number;
        readonly line: number;
        readonly look: BreakableLook;
        readonly walls: ReadonlyMap<
          string,
          {
            readonly seed: number;
            readonly palette: ArenaPalette;
            readonly network: CrackNetwork;
            readonly tumbles: readonly TumbleChunk[];
            /** The tunnels it draws over, whose covers it fades with (#3418). */
            readonly tunnels: readonly number[];
          }
        >;
      }
    | undefined;
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
  /** Bodies just struck, just dead, just back (#3365). */
  private bodyFlashes: BodyFlash[] = [];
  private bodyDeaths: BodyDeath[] = [];
  private bodyRespawns: BodyRespawn[] = [];
  /** Whether each body was dead in the last frame: a change is a death or a return. */
  private wasDead = new Map<string, boolean>();
  private addedImpacts: Impact[] = [];
  /** Shout and chant rings and chevrons (#3301), aged in place. */
  private readonly shoutMarks: ShoutMark[] = [];
  private walkMarker: WalkMarker | undefined;
  /**
   * The goals on the ground (#3221), each with when it left the snapshot,
   * so a reached one fades out; and their graphics, one per layer's depth.
   */
  private goals = new Map<string, { mark: GoalMark; goneAt: number | undefined }>();
  private readonly goalGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Scenery the simulation does not know (#3326), lying on the walls of its layer. */
  private props: readonly TutorialProp[] = [];
  /** The props' graphics, one per wall-top depth. */
  private readonly propGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Every caped body's cape (#1699), and where the body was drawn last frame. */
  private capes = new Map<string, { motion: CapeMotion; x: number; y: number }>();
  /**
   * One sprite per shot, by projectile id: in flight, or ended and fading
   * at its end point since `endedAt` (scene seconds).
   */
  private projectileImages = new Map<
    number,
    {
      image: Phaser.GameObjects.Image;
      to: { x: number; y: number };
      endedAt: number | undefined;
      /** A flying spell's (#3292): where it left, its trail, and its core's radius. */
      readonly spell:
        | { readonly from: Vec2; readonly trail: readonly TrailDot[]; readonly core: ShotDot }
        | undefined;
    }
  >();
  /** Flying spells' trails under their sprites, and their cores over them (#3292). */
  private shotTrails: Phaser.GameObjects.Graphics | undefined;
  private shotCores: Phaser.GameObjects.Graphics | undefined;
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
  /** The text before a name's signet (#3252), per actor with a lead. */
  private nameLeads = new Map<string, Phaser.GameObjects.Text>();
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
  /** Seconds between frames in wall time: Phaser's own delta is clamped (#3225). */
  private readonly frameSeconds = frameClock();
  /**
   * Where each body stood last frame, and the way it last moved (#3226):
   * a stance streaks behind a body while it moves.
   */
  private readonly bodyMotion = new Map<string, BodyMotion>();
  /** Scratch for the marks a body wears, so a frame allocates none (#3226). */
  private readonly mote: Mote = { x: 0, y: 0, radius: 0, alpha: 0 };
  private readonly streak: Streak = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0 };
  private readonly swirl: Swirl = { radius: 0, from: 0, to: 0, alpha: 0 };
  private readonly wisp: Wisp = { x: 0, y1: 0, y2: 0, alpha: 0 };
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
    this.wasDead.clear();
    this.bodyFlashes.length = 0;
    this.bodyDeaths.length = 0;
    this.bodyRespawns.length = 0;
  }

  /**
   * The box of each name tag drawn last frame (#2738), by actor id, in
   * world units: what a click with Show names held hits. Live, updated
   * in place every frame.
   */
  public nameTagBoxes(): ReadonlyMap<string, Rect> {
    return this.nameBoxes;
  }

  /**
   * Every body, lever, flag, stand and breakable wall the last frame drew
   * (#3634), where it showed and at the depth it drew: what a click or
   * hover picks. Empty before the first frame.
   */
  public drawnClickables(): readonly DrawnClickable[] {
    return this.clickables;
  }

  /** Replace the snapshot to draw on the next frame. */
  public setSnapshot(snapshot: ArenaSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Replace the props to draw from the next frame: none clears them. */
  public setProps(props: readonly TutorialProp[]): void {
    this.props = props;
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

  public addBodyFlash(flash: BodyFlash): void {
    startReaction(this.bodyFlashes, flash);
  }

  public addShoutMarks(marks: readonly ShoutMark[]): void {
    addShoutMarks(this.shoutMarks, marks);
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
    this.floorLines = this.add.graphics().setDepth(GRAIN_LINES_DEPTH);
    this.mapGraphics = this.add.graphics().setDepth(MAP_DEPTH);
    this.bands = Array.from({ length: CHARACTER_BANDS }, (_, band) => ({
      body: this.add.graphics().setDepth(renderOrder({ kind: "character", band, part: "body" })),
      marks: this.add.graphics().setDepth(renderOrder({ kind: "character", band, part: "marks" })),
      bar: this.add.graphics().setDepth(renderOrder({ kind: "character", band, part: "bar" })),
    }));
    this.barrierGraphics = this.add
      .graphics()
      .setDepth(EFFECT_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.markGraphics = this.add.graphics().setDepth(EFFECT_DEPTH);
    this.markerGraphics = this.add.graphics().setDepth(EDGE_MARKER_DEPTH);
    this.nameUnderline = this.add.graphics().setDepth(OVERLAY_DEPTH);
    // Made before any shot's sprite, so under every one at their depth.
    this.shotTrails = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.shotCores = this.add.graphics().setDepth(OVERLAY_DEPTH + 1);
  }

  public override update(time: number): void {
    const dt = this.frameSeconds(time);
    const effects = this.markGraphics;
    const floor = this.bandOf(this.snapshot.structure.ground);
    if (effects === undefined || floor === undefined) {
      return;
    }
    for (const { body, marks: bandMarks, bar } of this.bands) {
      body.clear();
      bandMarks.clear();
      bar.clear();
    }
    effects.clear();
    this.barrierGraphics?.clear();
    const { body: g } = floor;
    this.now = time / 1000;
    this.reducedMotion = prefersReducedMotion();
    this.recording = [];
    this.drawnActors = this.reactActors(this.liftActors(dt), dt);
    this.clock.observe(this.snapshot.clock, this.now);
    this.observeAttacks();
    const lightAt = passStart();
    this.updateLighting(time);
    passEnd("lighting", lightAt);
    decayShoutMarks(this.shoutMarks, dt);
    this.updateGroundEffects();
    this.drawMap();
    // Only what the camera shows is tessellated (#3240): the map cut once in
    // a while, the zones and the fog, drawn every frame, every frame.
    const view = this.cameraView();
    this.staticCull.cull(view);
    this.drawLifts();
    this.drawBreakables();
    this.drawRipples();
    this.drawZones();
    this.drawAtmosphere(dt, view);
    for (const graphics of this.zoneGraphics.values()) {
      cullToView(graphics, view);
    }
    // Over the grid and walls, under the actors: a flash never hides a
    // health bar, a status or the target ring.
    this.areaFlashes = decayAreaFlashes(this.areaFlashes, dt);
    for (const flash of this.areaFlashes) {
      const alpha = areaFlashAlpha(flash);
      g.fillStyle(flash.colour, 0.12 * alpha);
      g.fillCircle(flash.position.x, flash.position.y, flash.radius);
      g.lineStyle(2, flash.colour, alpha);
      g.strokeCircle(flash.position.x, flash.position.y, flash.radius);
    }
    this.walkMarker = decayWalkMarker(this.walkMarker, dt);
    if (this.walkMarker !== undefined) {
      this.drawWalkMarker(g, this.walkMarker);
    }
    for (const ping of this.snapshot.pings) {
      this.drawPing(g, ping);
    }
    this.drawGoals();
    this.drawStand();
    this.drawAltar(g);
    for (const point of this.snapshot.capturePoints) {
      this.drawCapturePoint(g, point);
    }
    for (const gate of this.snapshot.gates) {
      this.drawGate(g, gate);
    }
    // Each overlay on its own layer's band (#3409): over the deck it
    // stands on, under the bodies there, covered as a body there would be.
    for (const lever of this.snapshot.switches) {
      const band = this.bandOf(lever.layer);
      if (band !== undefined) {
        this.drawSwitch(band.body, lever);
      }
    }
    for (const teleport of this.snapshot.teleports) {
      this.drawTeleport(teleport);
    }
    for (const breakable of this.snapshot.breakables) {
      this.drawBreakableOverlay(effects, breakable);
    }
    this.drawArrivals();
    this.stepCapes(dt);
    this.drawShotShadows(time / 1000);
    // Every form's aura first, under every disc of its band (#3229): it
    // never covers a neighbour.
    for (const actor of this.drawnActors) {
      const band = actor.formed && !actor.dead ? this.bandOf(actor.layer) : undefined;
      if (band !== undefined) {
        const { x, y } = actor.position;
        const breath = formAuraBreath(this.now, cuePhase(actor.id), this.reducedMotion);
        paintFormAura(phaserPainter(band.body), x, y, actor.radius, breath);
      }
    }
    this.drawProps();
    for (const actor of this.drawnActors) {
      const band = this.bandOf(actor.layer);
      if (band !== undefined) {
        recordBody(this.recording, actor, band.body.depth);
        this.drawActor(band, actor);
      }
    }
    this.drawFlashesAndReturns();
    const cutAt = passStart();
    this.cutAwayTunnels(dt);
    passEnd("cutAwayTunnels", cutAt);
    const fadeAt = passStart();
    this.fadeOverhangs(dt);
    passEnd("fadeOverhangs", fadeAt);
    const outlineAt = passStart();
    this.drawHiddenOutlines();
    passEnd("drawHiddenOutlines", outlineAt);
    this.drawHoverMarker(effects);
    this.drawSwitchLinks(effects);
    // Over the bodies: a carried flag stands above its carrier's head.
    for (const flag of this.snapshot.flags) {
      this.drawFlag(effects, flag);
    }
    this.swingFlashes = decaySwingFlashes(this.swingFlashes, dt);
    // Arcs and hit marks on their body's band, under its health bars and
    // any deck over it (#3292).
    for (const flash of this.swingFlashes) {
      const band = this.bandOf(flash.layer);
      if (band !== undefined) {
        this.drawSwingFlash(band.marks, flash);
      }
    }
    this.beaconBolts = decayBeaconBolts(this.beaconBolts, dt);
    for (const bolt of this.beaconBolts) {
      this.drawBeaconBolt(effects, bolt);
    }
    this.impacts = mergeImpacts(this.impacts, this.addedImpacts, dt);
    this.addedImpacts = [];
    for (const impact of this.impacts) {
      this.drawImpact(impact);
    }
    this.drawShoutChevrons();
    this.updateBodyGlyphs();
    this.updateCastBadges();
    this.updateProjectiles(time / 1000);
    this.updateStatusIcons();
    this.updateNameLabels();
    this.updateFloatingTexts(dt);
    this.updateEdgeMarkers();
    this.clickables = this.recording;
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
    // The plate lies on the ground; the gate stands on its own layer (#3409).
    const body = this.bandOf(gate.layer)?.body;
    if (body === undefined) {
      return;
    }
    if (gate.blocks === "bodies-and-shots") {
      this.drawBarrier(body, gate, line);
      return;
    }
    // A shut gate is a wall of the map, and draws with them (#3061).
    if (gate.open) {
      const { layerCount, ground } = this.snapshot.structure;
      body.save();
      body.translateCanvas(0, -elevationOf(gate.layer, ground));
      const palette = arenaPalette(this.snapshot.structure);
      GATE_ART.open[gate.look](this.gatePainter(body), gate.wall, {
        height: layerCount === 1 ? 0 : WALL_HEIGHT,
        line,
        palette: gate.look === "door" ? doorPalette(palette) : palette,
      });
      body.restore();
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
   * Each breakable wall (#3370) on its own graphics: standing with its
   * cracks, growing in as it is hit, chips falling off; sagging and
   * tumbling as it falls; rubble. Redrawn only while something moves.
   */
  private drawBreakables(): void {
    const style = this.breakableStyle;
    const live = new Set(this.snapshot.breakables.map(({ id }) => id));
    for (const [id, drawing] of this.breakableDrawings) {
      if (!live.has(id)) {
        drawing.graphics.destroy();
        this.breakableDrawings.delete(id);
      }
    }
    if (style === undefined) {
      return;
    }
    const { ground } = this.snapshot.structure;
    for (const breakable of this.snapshot.breakables) {
      const wall = style.walls.get(breakable.id);
      if (wall === undefined) {
        continue;
      }
      let drawing = this.breakableDrawings.get(breakable.id);
      if (drawing === undefined) {
        drawing = {
          graphics: this.add
            .graphics()
            .setDepth(renderOrder({ kind: "breakable", layer: breakable.layer })),
          seen: undefined,
          settled: false,
        };
        this.breakableDrawings.set(breakable.id, drawing);
      }
      recordBreakable(this.recording, breakable, this.snapshot.structure, drawing.graphics.depth);
      const seen = observeBreakable(drawing.seen, breakable, this.now);
      if (seen !== drawing.seen) {
        drawing.seen = seen;
        drawing.settled = false;
      }
      // Held still for reduced motion: each change shows at once.
      const motion = !this.reducedMotion;
      const hitAge = seen.hitAt === undefined || !motion ? Infinity : this.now - seen.hitAt;
      const fallAge = seen.fellAt === undefined || !motion ? Infinity : this.now - seen.fellAt;
      const moving = hitAge < Math.max(CRACK_GROW_SECONDS, CHIP_SECONDS) || fallAge < BREAK_SECONDS;
      if (!moving && drawing.settled) {
        continue;
      }
      drawing.settled = !moving;
      const g = drawing.graphics;
      g.clear();
      g.save();
      g.translateCanvas(0, -elevationOf(breakable.layer, ground));
      const painter = this.stonePainter(g);
      const frame = {
        height: style.height,
        line: style.line,
        look: style.look,
        palette: wall.palette,
      };
      const fraction = breakableHealthFraction(breakable);
      if (breakable.health > 0) {
        const reveal = motion
          ? drawnReveal(seen, breakable.maxHealth, this.now)
          : crackReveal(breakable.health, breakable.maxHealth);
        BREAKABLE_ART.standing(
          painter,
          breakable.wall,
          { network: wall.network, reveal, glow: fraction < 0.5 },
          frame,
        );
        const tip = crackTip(wall.network, crackReveal(breakable.health, breakable.maxHealth));
        if (tip !== undefined && hitAge < CHIP_SECONDS) {
          paintChips(
            painter,
            { x: tip.x, y: tip.y - tip.up },
            hitAge,
            wall.seed + seen.hits,
            style.look.face,
          );
        }
      } else if (fallAge < BREAK_SECONDS) {
        BREAKABLE_ART.falling(
          painter,
          breakable.wall,
          { network: wall.network, reveal: 1, glow: true },
          wall.tumbles,
          fallAge,
          frame,
        );
      } else {
        BREAKABLE_ART.rubble(painter, breakable.wall, wall.tumbles, { ...frame, height: 0 });
      }
      g.restore();
    }
  }

  /**
   * Over a breakable wall (#3031): the dust of its fall, and its health
   * bar while it is hovered or your target. The wall itself draws on its
   * own graphics (#3370).
   */
  private drawBreakableOverlay(
    g: Phaser.GameObjects.Graphics,
    breakable: RenderableBreakable,
  ): void {
    const { structure } = this.snapshot;
    const fellAt = this.breakableDrawings.get(breakable.id)?.seen?.fellAt;
    const look = this.breakableStyle?.look;
    if (fellAt !== undefined && look !== undefined && this.now - fellAt < DUST_SECONDS) {
      g.save();
      g.translateCanvas(0, -elevationOf(breakable.layer, structure.ground));
      paintDust(this.stonePainter(g), breakable.wall, this.now - fellAt, look.dust);
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
    const lift = recordSwitch(this.recording, lever, this.snapshot.structure.ground, g.depth);
    g.save();
    g.translateCanvas(0, -lift);
    SWITCH_MARK_ART[switchMarkKey(lever.mark)](g, lever.position, thrown);
    g.restore();
  }

  /**
   * What each lever works (#3236), over every cover so a gate under the
   * ground still shows: a hovered or targeted lever's targets outlined in
   * its brass, pulsing, with a dotted line from it to each; a thrown
   * lever's targets flash the same outline for `SWITCH_FLASH_SECONDS`.
   */
  private drawSwitchLinks(g: Phaser.GameObjects.Graphics): void {
    const { ground } = this.snapshot.structure;
    const lift = (point: Vec2, layer: number): Vec2 => ({
      x: point.x,
      y: point.y - elevationOf(layer, ground),
    });
    for (const lever of this.snapshot.switches) {
      const linked = lever.id === this.snapshot.hoverId || lever.id === this.snapshot.targetId;
      const thrownAt = this.leverFlips.get(lever.id)?.at;
      const flash = switchFlashAlpha(thrownAt === undefined ? undefined : this.now - thrownAt);
      const alpha = Math.max(linked ? switchLinkAlpha(this.now, this.reducedMotion) : 0, flash);
      if (alpha <= 0) {
        continue;
      }
      const from = lift(lever.position, lever.layer);
      for (const target of lever.targets) {
        g.lineStyle(SWITCH_LINK_WIDTH, SWITCH_MARK_LOOK.knobUp, alpha);
        g.strokePoints(
          target.outline.map((corner) => {
            const { x, y } = lift(corner, target.layer);
            return new Phaser.Math.Vector2(x, y);
          }),
          true,
        );
        if (linked) {
          g.fillStyle(SWITCH_MARK_LOOK.knobUp, 0.8);
          for (const dot of dotsAlong(
            from,
            lift(target.position, target.layer),
            SWITCH_LINK_DOT_STEP,
          )) {
            g.fillCircle(dot.x, dot.y, SWITCH_LINK_DOT_RADIUS);
          }
        }
      }
    }
  }

  /**
   * A portal (#3030): its entry's swirl and its exit's ring, each on its
   * own layer and in that layer's band (#3409).
   */
  private drawTeleport(teleport: RenderableTeleport): void {
    const { ground } = this.snapshot.structure;
    const time = this.reducedMotion ? 0 : this.now;
    const entry = this.bandOf(teleport.from.layer)?.body;
    if (entry !== undefined) {
      entry.save();
      entry.translateCanvas(0, -elevationOf(teleport.from.layer, ground));
      paintTeleportEntry(entry, polygonCentre(teleport.from.area), teleport.on, time);
      entry.restore();
    }
    const exit = this.bandOf(teleport.to.layer)?.body;
    if (exit !== undefined) {
      exit.save();
      exit.translateCanvas(0, -elevationOf(teleport.to.layer, ground));
      paintTeleportExit(exit, teleport.to.position, teleport.on);
      exit.restore();
    }
  }

  /**
   * Each body's last arrival through a portal (#3030): a burst, then a
   * ring that fades over the cooldown. A body first seen mid-cooldown
   * shows its ring where it stands; one that left takes its ring along.
   */
  private drawArrivals(): void {
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
      // On its own layer's band (#3409), as the body that arrived.
      const g = this.bandOf(arrival.layer)?.body;
      if (g === undefined) {
        continue;
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
  private drawStand(): void {
    const stand = this.snapshot.stand;
    const band = stand === undefined ? undefined : this.bandOf(stand.layer);
    if (stand === undefined || band === undefined) {
      return;
    }
    // On its layer's band, lifted as a lever is (#3634).
    const { body: g, marks } = band;
    const lift = recordStand(this.recording, stand, this.snapshot.structure.ground, g.depth);
    const { x } = stand.position;
    const y = stand.position.y - lift;
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
    const lift = recordFlag(this.recording, flag, this.snapshot.structure.ground, marks.depth);
    const x = flag.position.x;
    const y = flag.position.y - lift;
    const foot = y - (flag.carried ? FLAG_CARRIED_LIFT : 0);
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
      marks.strokeCircle(x, y, FLAG_PICK_RADIUS);
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
      const spell = actor.dead ? undefined : actor.spellCast;
      clock.observe(this.snapshot.clock, actor.swingElapsed, total, actor.weaponId, cast, spell);
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

  /**
   * The glow at a standing caster's weapon (#3320), at its far end, over
   * the weapon mark and under the bars: it grows with a spell cast, flashes
   * on release and fizzles when stopped short.
   */
  private drawCastGlow(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    frame: AttackFrame,
  ): void {
    const clock = this.attackClocks.get(actor.id);
    const glow = castGlow(clock?.castBeat(this.clock.read(this.now)), this.reducedMotion);
    if (glow === undefined) {
      return;
    }
    const { x, y } = actor.position;
    const tip = weaponTipAt(x, y, actor.radius, actor.facing, actor.weaponId, frame);
    if (tip === undefined) {
      return;
    }
    // The study's glow: a soft disc round a brighter core.
    g.fillStyle(glow.colour, glow.alpha);
    g.fillCircle(tip.x, tip.y, glow.radius);
    g.fillStyle(glow.colour, Math.min(1, glow.alpha + CAST_GLOW_CORE_LIFT));
    g.fillCircle(tip.x, tip.y, glow.radius * CAST_GLOW_CORE);
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

  /**
   * The props (#3326) just over their layer's walls' depth, lit where they
   * lie: a sleeper on top of a wall, lifted by the layer's height and the
   * wall's; a parasol (#3332) or the mist gate (#3334) on the layer's
   * ground, by the layer's alone.
   */
  private drawProps(): void {
    for (const graphics of this.propGraphics.values()) {
      graphics.clear();
    }
    const { ground, layerCount } = this.snapshot.structure;
    for (const prop of this.props) {
      const depth = renderOrder({ kind: "wall-top", layer: prop.layer });
      let g = this.propGraphics.get(depth);
      if (g === undefined) {
        g = this.add.graphics().setDepth(depth);
        this.propGraphics.set(depth, g);
      }
      const onWall = prop.kind === "sleeper" && layerCount > 1;
      const lift = elevationOf(prop.layer, ground) + (onWall ? WALL_HEIGHT : 0);
      const tint = this.tintAt(prop.position, prop.layer);
      const lit = (colour: number): number =>
        tint === undefined ? colour : multiplyColour(colour, tint);
      const commands: readonly PropCommand[] =
        prop.kind === "sleeper"
          ? sleeperCommands(prop.position, prop.facing, this.now, this.reducedMotion)
          : prop.kind === "mist-gate"
            ? mistGateCommands(prop.position, this.now, this.reducedMotion)
            : parasolCommands(prop.position);
      g.save();
      g.translateCanvas(0, -lift);
      for (const command of commands) {
        switch (command.kind) {
          case "glow":
            g.fillStyle(command.colour, command.alpha / 2);
            g.fillCircle(command.at.x, command.at.y, command.radius);
            g.fillStyle(command.colour, command.alpha);
            g.fillCircle(command.at.x, command.at.y, command.radius / 2);
            break;
          case "body":
            g.fillStyle(
              tint === undefined ? command.colour : multiplyColour(command.colour, tint),
              1,
            );
            tracePath(g, command.outline);
            g.fillPath();
            g.lineStyle(SLEEPER_RIM_WIDTH, command.rim, 1);
            g.strokePath();
            break;
          case "head":
            g.fillStyle(
              tint === undefined ? command.colour : multiplyColour(command.colour, tint),
              1,
            );
            g.fillCircle(command.at.x, command.at.y, command.radius);
            g.lineStyle(SLEEPER_RIM_WIDTH, command.rim, 1);
            g.strokeCircle(command.at.x, command.at.y, command.radius);
            break;
          case "z": {
            const { at, size } = command;
            const half = size / 2;
            g.lineStyle(SLEEPER_Z_WIDTH, command.colour, command.alpha);
            g.beginPath();
            g.moveTo(at.x - half, at.y - half);
            g.lineTo(at.x + half, at.y - half);
            g.lineTo(at.x - half, at.y + half);
            g.lineTo(at.x + half, at.y + half);
            g.strokePath();
            break;
          }
          case "shape":
            g.fillStyle(lit(command.colour), command.alpha);
            tracePath(g, command.outline);
            g.fillPath();
            break;
          case "stroke":
            g.lineStyle(command.width, lit(command.colour), 1);
            tracePath(g, command.points, false);
            g.strokePath();
            break;
          case "mist":
            g.fillStyle(command.colour, command.alpha);
            g.fillEllipse(command.at.x, command.at.y, command.width, command.height);
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
  private drawImpact(impact: Impact): void {
    const actor = this.drawnActors.find((a) => a.id === impact.anchorId);
    const g = actor === undefined ? undefined : this.bandOf(actor.layer)?.marks;
    if (actor === undefined || g === undefined) {
      return;
    }
    const { x, y } = actor.position;
    for (const mark of impactMarks(impact, actor.radius, this.reducedMotion)) {
      if (mark.kind === "spike") {
        if (mark.outlined) {
          g.lineStyle(mark.width + IMPACT_OUTLINE, IMPACT_OUTLINE_COLOUR, mark.alpha);
          g.lineBetween(x + mark.from.x, y + mark.from.y, x + mark.to.x, y + mark.to.y);
        }
        g.lineStyle(mark.width, impact.colour, mark.alpha);
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

  /**
   * A chevron over each body a shout helped (#3301), above its health bar
   * and any hex halo, with the bar: a tunnel cuts it away as it does the bar.
   */
  private drawShoutChevrons(): void {
    for (const mark of this.shoutMarks) {
      if (mark.kind !== "chevron") {
        continue;
      }
      const actor = this.drawnActors.find((a) => a.id === mark.anchorId);
      const g = actor === undefined ? undefined : this.bandOf(actor.layer)?.bar;
      if (actor === undefined || g === undefined || actor.dead) {
        continue;
      }
      const halo = actor.hexed ? hexHalo(actor.radius) : undefined;
      const points = shoutChevron(
        actor.position.x,
        actor.position.y,
        actor.radius,
        halo === undefined ? undefined : halo.rise + halo.halfHeight,
      );
      const alpha = chevronAlpha(mark.ageSeconds);
      for (const [width, colour] of [
        [4, BODY_EDGE],
        [2, SHOUT_COLOUR],
      ] as const) {
        g.lineStyle(width, colour, alpha);
        g.strokePoints(points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)));
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
    const alpha = swingFlashAlpha(flash, this.reducedMotion);
    const { x, y } = flash.centre;
    const from = flash.angle - Math.PI / 4;
    const to = flash.angle + Math.PI / 4;
    g.lineStyle(flash.kind === "skill" ? SKILL_ARC_WIDTH : 2, flash.colour, alpha);
    g.beginPath();
    g.arc(x, y, flash.radius, from, to);
    g.strokePath();
    if (flash.own && flash.kind === "swing") {
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
    const trails = this.shotTrails;
    const cores = this.shotCores;
    trails?.clear();
    cores?.clear();
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
        const heading = projectileHeading(shot, this.snapshot.structure, this.snapshot.lifts);
        image.setRotation(heading);
        image.setTint(shot.colour);
        const scale = image.scaleX;
        const from = projectilePosition(
          shot,
          shot.launchedAt,
          this.snapshot.structure,
          this.snapshot.lifts,
        );
        this.projectileImages.set(shot.id, {
          image,
          to: projectileLanding(shot, this.snapshot.structure, this.snapshot.lifts),
          endedAt: undefined,
          spell:
            shot.spell && from !== undefined
              ? {
                  from,
                  trail: projectileTrail(shot.sprite, heading, scale),
                  core: projectileCore(shot.sprite, heading, scale),
                }
              : undefined,
        });
      } else {
        shown.image.setPosition(position.x, position.y);
      }
      const spell = this.projectileImages.get(shot.id)?.spell;
      if (spell !== undefined && trails !== undefined && !this.reducedMotion) {
        // Never behind where it left: a trail grows out of the caster's hand.
        const flown = Math.hypot(position.x - spell.from.x, position.y - spell.from.y);
        for (const dot of spell.trail) {
          if (Math.hypot(dot.offset.x, dot.offset.y) <= flown) {
            trails.fillStyle(dot.colour, dot.alpha);
            trails.fillCircle(position.x + dot.offset.x, position.y + dot.offset.y, dot.radius);
          }
        }
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
    for (const { image, spell } of this.projectileImages.values()) {
      if (spell !== undefined && cores !== undefined) {
        cores.fillStyle(SHOT_CORE_COLOUR, image.alpha);
        cores.fillCircle(
          image.x + spell.core.offset.x,
          image.y + spell.core.offset.y,
          spell.core.radius,
        );
      }
    }
  }

  /**
   * Each flying spell's shadow (#3292): on the ground under it, in the
   * band of the layer it flies over, so it takes that band's tone and
   * lies under the bodies there. Gone once the shot lands.
   */
  private drawShotShadows(now: number): void {
    const clock = this.clock.read(now);
    const { structure, lifts } = this.snapshot;
    for (const shot of this.snapshot.projectiles) {
      if (!shot.spell || this.endedShots.has(shot.id)) {
        continue;
      }
      const position = projectilePosition(shot, clock, structure, lifts);
      const band = this.bandOf(projectileLayer(shot, clock));
      if (position !== undefined && band !== undefined) {
        band.body.fillStyle(SHOT_SHADOW.colour, SHOT_SHADOW.alpha);
        band.body.fillEllipse(
          position.x + SHOT_SHADOW.offset.x,
          position.y + SHOT_SHADOW.offset.y,
          SHOT_SHADOW.width,
          SHOT_SHADOW.height,
        );
      }
    }
  }

  /**
   * Age the hit, death and return effects (#3365), and hand back the bodies
   * as they are drawn: a struck one nudged, a returning one rising to its
   * size. A body seen for the first time (a joiner's first snapshot) has no
   * effect. The nudge is behind reduced motion, the tint is not.
   */
  private reactActors(actors: readonly RenderableActor[], dt: number): readonly RenderableActor[] {
    decayReactions(this.bodyFlashes, dt, FLASH_SECONDS);
    decayReactions(this.bodyDeaths, dt, DEATH_SECONDS);
    decayReactions(this.bodyRespawns, dt, RESPAWN_SECONDS);
    for (const actor of actors) {
      const before = this.wasDead.get(actor.id);
      if (before !== undefined && before !== actor.dead) {
        startReaction(actor.dead ? this.bodyDeaths : this.bodyRespawns, {
          id: actor.id,
          ageSeconds: 0,
        });
      }
      this.wasDead.set(actor.id, actor.dead);
    }
    for (const id of this.wasDead.keys()) {
      if (!actors.some((actor) => actor.id === id)) {
        this.wasDead.delete(id);
      }
    }
    if (this.bodyFlashes.length === 0 && this.bodyRespawns.length === 0) {
      return actors;
    }
    return actors.map((actor) => {
      const flash = this.bodyFlashes.find((f) => f.id === actor.id);
      const back = this.bodyRespawns.find((r) => r.id === actor.id);
      if (actor.dead || (flash === undefined && back === undefined)) {
        return actor;
      }
      const nudge = flash === undefined || this.reducedMotion ? { x: 0, y: 0 } : slideOffset(flash);
      return {
        ...actor,
        position: { x: actor.position.x + nudge.x, y: actor.position.y + nudge.y },
        radius:
          back === undefined || this.reducedMotion
            ? actor.radius
            : actor.radius * respawnScale(back.ageSeconds),
      };
    });
  }

  /** The white over a struck body, and the ring and light that stand where a body came back. */
  private drawFlashesAndReturns(): void {
    for (const actor of this.drawnActors) {
      const band = this.bandOf(actor.layer);
      if (band === undefined || actor.dead) {
        continue;
      }
      const { x, y } = actor.position;
      const flash = this.bodyFlashes.find((f) => f.id === actor.id);
      if (flash !== undefined) {
        band.marks.fillStyle(0xffffff, flashAmount(flash));
        band.marks.fillCircle(x, y, actor.radius);
      }
      const back = this.bodyRespawns.find((r) => r.id === actor.id);
      if (back !== undefined) {
        const colour = teamColour(actor.team);
        const ring = respawnRing(back.ageSeconds);
        band.marks.lineStyle(2, colour, ring.alpha);
        band.marks.strokeCircle(x, y, ring.radius);
        if (!this.reducedMotion && back.ageSeconds < RESPAWN_COLUMN_SECONDS) {
          band.marks.lineStyle(3, colour, respawnColumnAlpha(back.ageSeconds));
          band.marks.lineBetween(x, y, x, y - RESPAWN_COLUMN_HEIGHT);
        }
      }
    }
  }

  /**
   * A body in the first moments of its death (#3365): it falls into the
   * lying pose and drains to the corpse grey, with a ring of dust. Past
   * that it is the corpse `drawActor` always drew.
   */
  private drawFalling(
    band: (typeof this.bands)[number],
    actor: RenderableActor,
    death: BodyDeath,
  ): void {
    const { body: g, marks } = band;
    const { x, y } = actor.position;
    const p = deathProgress(death.ageSeconds);
    const drained = mixColour(this.lit(teamColour(actor.team), actor), DEAD_COLOUR, p);
    if (actor.creatureLook === undefined) {
      g.fillStyle(drained, 1 - p);
      tracePath(g, lyingPose(x, y, actor.radius, actor.facing).body);
      g.fillPath();
      g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1 - p);
      g.strokePath();
    }
    const ground = arenaPalette(this.snapshot.structure).floor ?? 0x6b6f76;
    const dust = mixColour(ground, 0xffffff, 0.35);
    if (death.ageSeconds >= DEATH_DUST_SECONDS) {
      return;
    }
    for (let i = 0; i < DUST_SPECKS; i += 1) {
      const speck = dustSpeck(i, actor.position, actor.radius, death.ageSeconds);
      marks.fillStyle(dust, speck.alpha);
      marks.fillCircle(speck.x, speck.y, 1.5);
    }
  }

  /**
   * One actor on its band: its body, every mark on it over the body
   * glyphs (#1037), and its health bar over those (#3292). In a clump a neighbour's weapon now crosses your
   * body: the weapon is the more urgent read.
   */
  private drawActor(band: (typeof this.bands)[number], actor: RenderableActor): void {
    const { body: g, marks, bar } = band;
    const { x, y } = actor.position;

    if (actor.dead) {
      this.bodyMotion.delete(actor.id);
      const death = this.bodyDeaths.find((d) => d.id === actor.id);
      if (death !== undefined) {
        this.drawFalling(band, actor, death);
      }
      // The corpse ring comes up as the fall ends.
      const settled = death === undefined ? 1 : deathProgress(death.ageSeconds);
      // A corpse stays visible but obviously inert: hollow, grey, no bars;
      // darker once a skill has exploited it (#466).
      const colour = actor.exploited ? EXPLOITED_CORPSE_COLOUR : DEAD_COLOUR;
      if (actor.creatureLook === undefined) {
        g.lineStyle(2, colour, settled);
        g.strokeCircle(x, y, actor.radius);
        return;
      }
      // A lying pet keeps its shape, dashed (#1162): a creature's corpse at a glance.
      g.lineStyle(BODY_EDGE_WIDTH, colour, settled);
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
      const frame = this.weaponFrame(actor);
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
          frame,
          cape: this.wornCape(actor),
          tint: this.bodyTint(actor),
        },
        phaserPainter(marks),
      );
      this.drawCastGlow(marks, actor, frame);
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

    this.drawHealthBar(bar, actor);

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
    for (const ornament of creatureOrnament(look, x, y, actor.radius, actor.facing)) {
      if (ornament.kind === "polygon") {
        tracePath(g, ornament.points);
        g.fillStyle(colourOf(ornament.colour), 1);
        g.fillPath();
        g.lineStyle(ornament.edge, BODY_EDGE, 1);
        g.strokePath();
      } else if (ornament.kind === "outline" || ornament.kind === "stroke") {
        for (const [width, colour] of [
          [ornament.casing, BODY_EDGE],
          [ornament.width, colourOf(ornament.colour)],
        ] as const) {
          tracePath(g, ornament.points, ornament.kind === "outline");
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

    // A spirit's plate is a wisp (#3306), bobbing, inside a team rim.
    const bob = look === "spirit" ? spiritBob(this.now, cuePhase(actor.id), this.reducedMotion) : 0;
    if (look === "spirit") {
      this.drawSpiritWisp(g, actor, y + bob, team);
    } else {
      tracePath(g, creatureOutline(x, y, actor.radius));
      g.fillStyle(team, 1);
      g.fillPath();
      g.lineStyle(BODY_EDGE_WIDTH, BODY_EDGE, 1);
      g.strokePath();
    }

    if (CREATURE_ARMS[look] === undefined) {
      const [tip, left, right] = creatureTick(x, y + bob, actor.radius, actor.facing);
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
   * A spirit's wisp (#3306) at height `y`: pale green round a near-white
   * core, lit as its band, cased in the body edge under a `team` rim.
   */
  private drawSpiritWisp(
    g: Phaser.GameObjects.Graphics,
    actor: RenderableActor,
    y: number,
    team: number,
  ): void {
    const { x } = actor.position;
    const r = actor.radius;
    tracePath(g, spiritWisp(x, y, r));
    g.fillStyle(this.lit(SPIRIT_GREEN, actor), 1);
    g.fillPath();
    g.lineStyle(SPIRIT_RIM_WIDTH + RING_CASING, BODY_EDGE, 1);
    g.strokePath();
    g.lineStyle(SPIRIT_RIM_WIDTH, team, 1);
    g.strokePath();
    tracePath(g, spiritWisp(x, y, r, SPIRIT_CORE_SCALE));
    g.fillStyle(this.lit(SPIRIT_CORE, actor), 1);
    g.fillPath();
  }

  /**
   * The marks a living body wears (#1117, #3226): the stance band and the
   * enchantment ring at its feet, circular even lying down, with motes
   * rising off the ring and streaks behind a moving stance; the hex halo
   * over its health bar; the curse mark of skill ground (#3283); and the
   * shimmer of an invulnerable one (#1233).
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
    // Stands in skill ground that can hurt it (#3283): one mark, however
    // many areas.
    if (actor.cursed) {
      g.lineStyle(CURSE_MARK_WIDTH, HEX_COLOUR, 1);
      for (let side = 0; side < CURSE_MARK_SIDES; side += 1) {
        const from = curseMarkCorner(actor.radius, side);
        const to = curseMarkCorner(actor.radius, side + 1);
        g.lineBetween(x + from.x, y + from.y, x + to.x, y + to.y);
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
      const name = taggedName({
        name: playerLabelText(nameplateName(actor.name), actor.guildTag, actor.heroRank),
        bot: actor.bot,
      });
      // The team's mark opens the plate: on the lead when there is one.
      label.setText(actor.nameLead === undefined ? markedForTeam(actor.team, name) : name);
      screenSized(label, zoom);
      const lead = this.updateNameLead(actor, color, zoom);
      // `width` is unscaled: the label's screen px.
      const leadWidth = lead?.width ?? 0;
      const signetDrawn = this.signetReady(actor.signet);
      const layout = nameplateLayout(actor, label.width, zoom, signetDrawn, leadWidth);
      label.setPosition(layout.textX, layout.bottom).setVisible(shown);
      if (lead !== undefined && layout.leadX !== undefined) {
        lead.setPosition(layout.leadX, layout.bottom).setVisible(shown);
      }
      this.updateNameGlyph(actor, layout, shown, hovered);
      this.updateNameSignet(actor, layout, shown);
      if (shown) {
        this.nameBoxes.set(
          actor.id,
          nameTagBox(actor, label.width, label.height, zoom, signetDrawn, leadWidth),
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
        this.nameLeads.get(id)?.destroy();
        this.nameLeads.delete(id);
      }
    }
  }

  /**
   * The text before `actor`'s signet and name (#3252), in the name's
   * colour, or `undefined` when it has none: one made the first time,
   * destroyed when the lead goes.
   */
  private updateNameLead(
    actor: RenderableActor,
    color: string,
    zoom: number,
  ): Phaser.GameObjects.Text | undefined {
    let lead = this.nameLeads.get(actor.id);
    if (actor.nameLead === undefined) {
      lead?.destroy();
      this.nameLeads.delete(actor.id);
      return undefined;
    }
    if (lead === undefined) {
      lead = this.add
        .text(0, 0, "", { fontSize: "11px", fontFamily: "ui-monospace, monospace", color })
        .setOrigin(0.5, 1)
        .setDepth(OVERLAY_DEPTH);
      this.nameLeads.set(actor.id, lead);
    }
    if (lead.style.color !== color) {
      lead.setColor(color);
    }
    lead.setText(markedForTeam(actor.team, actor.nameLead));
    screenSized(lead, zoom);
    return lead;
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
    pass.update(timeMs, this.cameraView());
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
    return this.tintAt(position, layer);
  }

  /** What the light at `position` on `layer` multiplies a body there by. */
  private tintAt(position: Vec2, layer: number): number | undefined {
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
    const clock = this.clock.read(this.now);
    const effects = this.snapshot.groundEffects;
    const seen = new Set<number>();
    for (const effect of effects) {
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
      this.drawGroundEffect(drawn, effect, x, y, clock, overlapsOf(effect, effects));
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
    this.drawShoutRings(g);
    this.drawSpiritRings(g);
  }

  /**
   * Each living spirit's range ring (#3306), on the ground at its aura's
   * real radius and its layer's height, as a shout's ring: under the bodies.
   */
  private drawSpiritRings(ground: Phaser.GameObjects.Graphics): void {
    const structure = this.snapshot.structure;
    for (const actor of this.snapshot.actors) {
      const alpha = spiritRingAlpha(this.snapshot, actor);
      if (alpha === undefined || actor.auraRadius === undefined) {
        continue;
      }
      const onDeck = actor.layer > 0;
      const g = onDeck ? this.deckGroundGraphicsOf(actor.layer) : ground;
      const { x } = actor.position;
      const y = onDeck
        ? actor.position.y - liftAt(structure, this.snapshot.lifts, actor.position, actor.layer)
        : actor.position.y - elevationOf(actor.layer, structure.ground);
      g.lineStyle(SPIRIT_RING_WIDTH, SPIRIT_GREEN, alpha);
      g.strokeCircle(x, y, actor.auraRadius);
    }
  }

  /**
   * Each shout's ring (#3301), on the ground where its caster stood, at
   * that layer's height like a skill area: under the bodies.
   */
  private drawShoutRings(ground: Phaser.GameObjects.Graphics): void {
    const structure = this.snapshot.structure;
    for (const mark of this.shoutMarks) {
      if (mark.kind !== "ring") {
        continue;
      }
      const ring = shoutRingRadius(mark.ageSeconds, mark.from, this.reducedMotion);
      if (ring === undefined) {
        continue;
      }
      const onDeck = mark.layer > 0;
      const g = onDeck ? this.deckGroundGraphicsOf(mark.layer) : ground;
      const y = onDeck
        ? mark.position.y - liftAt(structure, this.snapshot.lifts, mark.position, mark.layer)
        : mark.position.y - elevationOf(mark.layer, structure.ground);
      g.lineStyle(SHOUT_RING_WIDTH, SHOUT_COLOUR, ring.alpha);
      g.strokeCircle(mark.position.x, y, ring.radius);
    }
  }

  /**
   * One skill area (#3283) at (`x`, `y`): a violet pool, under an edge
   * dashed where it can hurt your side and solid where it cannot, wide
   * as it lands and thin as it ends; a storm's swirls or a well's wisps
   * inside; the owner's pip at the icon's corner.
   */
  private drawGroundEffect(
    g: Phaser.GameObjects.Graphics,
    effect: RenderableGroundEffect,
    x: number,
    y: number,
    clock: number,
    overlaps: number,
  ): void {
    const remaining = effect.endsAt - clock;
    const look = groundLook({
      dashed: effect.dashed,
      age: effect.durationSeconds - remaining,
      remaining,
    });
    const phase = cuePhase(String(effect.id));
    const breath = poolBreath(this.now, phase, this.reducedMotion);
    g.fillStyle(GROUND_COLOUR, stackedPoolAlpha(look.poolAlpha * breath, overlaps));
    g.fillCircle(x, y, effect.radius);
    g.lineStyle(look.edgeWidth, GROUND_COLOUR, look.edgeAlpha);
    if (look.dashed) {
      for (const arc of dashedCircle(effect.radius, GROUND_DASH, GROUND_GAP)) {
        g.beginPath();
        g.arc(x, y, effect.radius, arc.from, arc.to);
        g.strokePath();
      }
    } else {
      g.strokeCircle(x, y, effect.radius);
    }
    const motion = groundMotion(effect.skillId);
    for (let index = 0; motion !== undefined && index < GROUND_STROKES; index += 1) {
      if (motion === "swirl") {
        const s = swirl(effect.radius, index, this.now, phase, this.reducedMotion, this.swirl);
        g.lineStyle(GROUND_STROKE_WIDTH, GROUND_COLOUR, s.alpha);
        g.beginPath();
        g.arc(x, y, s.radius, s.from, s.to);
        g.strokePath();
      } else {
        const w = wisp(effect.radius, index, this.now, phase, this.reducedMotion, this.wisp);
        g.lineStyle(GROUND_STROKE_WIDTH, GROUND_COLOUR, w.alpha);
        g.lineBetween(x + w.x, y + w.y1, x + w.x, y + w.y2);
      }
    }
    g.fillStyle(teamColour(effect.owner), 1);
    g.fillCircle(x + GROUND_ICON_SIZE / 2, y - GROUND_ICON_SIZE / 2, OWNER_PIP_RADIUS);
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
   * Mid-ease the zoom is held, as `layerZoom` says (#3545).
   */
  private drawMap(): void {
    const g = this.mapGraphics;
    const viewZoom = this.view?.zoom ?? 1;
    const zoom = layerZoom(this.drawnMap?.zoom, viewZoom, this.lastViewZoom);
    this.lastViewZoom = viewZoom;
    const next: MapLayer = {
      ...this.arena,
      walls: this.snapshot.walls,
      structure: this.snapshot.structure,
      zoom,
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
    this.drawGrain(next.structure, palette);
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
    if (
      next.structure.water !== this.drawnMap?.structure.water ||
      next.structure.tunnels !== this.drawnMap.structure.tunnels
    ) {
      this.waterShapes = splitWater(next.structure);
    }
    for (const [at, { surface, ripples }] of this.waterOverTunnels) {
      surface.clear();
      if (at >= next.structure.tunnels.length) {
        surface.destroy();
        ripples.destroy();
        this.waterOverTunnels.delete(at);
      }
    }
    for (const { shape, pieces } of this.waterShapes) {
      for (const piece of pieces) {
        const surface =
          piece.tunnel === undefined
            ? this.structureAt({ kind: "water", layer: shape.layer, part: "surface" })
            : this.waterOverTunnel(piece.tunnel).surface;
        surface.save();
        surface.translateCanvas(0, -elevationOf(shape.layer, ground));
        WATER_ART[waterArtKey(shape.depth)].surface(
          pieces.length === 1 ? this.waterPainter(surface) : this.piecePainter(surface, piece),
          { ...shape, outline: piece.outline, ripples: piece.ripples },
          line,
        );
        surface.restore();
      }
    }
    this.drawPits(next.structure, line, palette);
    const lifts: { readonly frame: LiftFrame; readonly upperLayer: number }[] = [];
    for (const transition of next.structure.transitions) {
      const lit = litStructurePalette(
        transitionPalette(palette, materialsOf(next.structure).transition[transition.look]),
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
    for (const { graphics } of this.coversDrawn) {
      graphics.destroy();
    }
    this.coversDrawn = [];
    for (const graphics of [...this.decksOverTunnels.values()].flat()) {
      graphics.destroy();
    }
    this.decksOverTunnels.clear();
    const covers = tunnelCoverBoxes(next.structure);
    for (const wall of next.walls) {
      const held = deckHeldBy(wall, next.structure);
      const g = this.structureAt(
        held === undefined
          ? { kind: "wall", layer: wall.layer }
          : { kind: "support", deckLayer: held.layer },
      );
      // A breakable wall draws on its own (#3370), set up below.
      if (isBreakableWall(wall)) {
        continue;
      }
      const base = elevationOf(wall.layer, ground);
      // What of a wall is over a tunnel fades with the tunnel's cover (#3418).
      const pieces =
        next.structure.layerCount === 1 || held !== undefined || wall.layer < ground
          ? []
          : wallPieces(shapeOutline(wall), base, base + WALL_HEIGHT, covers);
      const over = pieces.find(({ tunnel }) => tunnel !== undefined)?.tunnel;
      // A shut secret passage (#3068) is the rock wall it hides in.
      if (isDoor(wall) && wall.look !== "secret") {
        const flat = next.structure.layerCount === 1;
        const look = wall.look === "door" ? doorPalette(palette) : palette;
        // A shut gate over a tunnel fades whole with its cover: it is small (#3418).
        const shut =
          over === undefined ? g : this.overTunnel(over, { kind: "wall", layer: wall.layer });
        shut.save();
        shut.translateCanvas(0, -base);
        GATE_ART.shut[wall.look](this.gatePainter(shut), wall, {
          height: flat ? 0 : WALL_HEIGHT,
          line,
          palette: litStructurePalette(look, next.lighting, wall, wall.layer),
        });
        shut.restore();
        continue;
      }
      const lit = litStructurePalette(palette, next.lighting, wall, wall.layer);
      if (next.structure.layerCount === 1) {
        this.drawFlatWall(g, wall, line, lit);
      } else if (held === undefined) {
        if (over !== undefined) {
          this.drawWallBoxOverTunnels(g, wall, base, line, lit, pieces);
        } else {
          this.drawWallBox(g, wall, base, line, lit);
        }
      } else {
        const depth = renderOrder({ kind: "support", deckLayer: held.layer });
        const hidden = deckCovers(next.structure, next.walls, depth);
        const high = deckSideLow(held, next.walls, ground);
        this.drawColumn(g, wall, base, high, lit.support, false, hidden);
      }
    }
    // Each breakable wall's material, cracks and fall, worked out once per
    // map drawn; `drawBreakables` draws it every frame it changes (#3370).
    const look = breakableLook(next.structure);
    const height = next.structure.layerCount === 1 ? 0 : WALL_HEIGHT;
    this.breakableStyle = {
      height,
      line,
      look,
      walls: new Map(
        this.snapshot.breakables.map((breakable) => {
          const seed = breakableSeed(breakable.id);
          return [
            breakable.id,
            {
              seed,
              palette: litStructurePalette(
                breakablePalette(palette, look),
                next.lighting,
                breakable.wall,
                breakable.layer,
              ),
              network: crackNetwork(seed, breakable.wall, height),
              tumbles: tumbleChunks(seed, breakable.wall, height),
              tunnels:
                breakable.layer < ground
                  ? []
                  : wallPieces(
                      shapeOutline(breakable.wall),
                      elevationOf(breakable.layer, ground),
                      elevationOf(breakable.layer, ground) + height,
                      covers,
                    ).flatMap(({ tunnel }) => (tunnel === undefined ? [] : [tunnel])),
            },
          ];
        }),
      ),
    };
    for (const drawing of this.breakableDrawings.values()) {
      drawing.settled = false;
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
          deckPalette(palette, materialsOf(next.structure).deck[deck.look]),
          next.lighting,
          deck.footprint,
          deck.layer,
        ),
        covers,
      );
    }
    this.drawOverhangs(next.structure, next.lighting, line);
    for (const dropOff of next.structure.dropOffs) {
      this.drawDropOff(dropOff, ground, line);
    }
    this.mapOccluders = occludersOf(next.walls, next.structure);
    this.occluders = seenFrom(this.mapOccluders, this.viewerTunnels);
    this.drawnMap = next;
    this.staticCull.capture([
      ...(this.floorGraphics === undefined ? [] : [this.floorGraphics]),
      ...(this.floorLines === undefined ? [] : [this.floorLines]),
      g,
      ...this.structureGraphics.values(),
      ...[...this.tunnelCovers.values()].flatMap(({ ground, lines, seam }) => [
        ground,
        lines,
        seam,
      ]),
      ...[...this.waterOverTunnels.values()].map(({ surface }) => surface),
      ...[...this.decksOverTunnels.values()].flat(),
      ...this.coversDrawn.map(({ graphics }) => graphics),
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

  /**
   * What a structure covers of each body (#2831, #2972): its team's outline,
   * weapon and symbol, no fill. A goal's ring shows the same way (#3342).
   */
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
      for (const { mark, goneAt } of this.goals.values()) {
        const fade = goalMarkFade(goneAt === undefined ? undefined : this.now - goneAt);
        g.lineStyle(BODY_EDGE_WIDTH, GOAL_MARK_GOLD, fade);
        traceHiddenGoalMark(
          mark,
          this.now,
          this.reducedMotion,
          this.snapshot.structure.ground,
          this.occluders,
          this.strokeHiddenSegment,
        );
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

  /**
   * The ground over the tunnel the local body is in, and the paving, decks,
   * walls and breakables on it (#3272, #3352, #3418), cut away (#3234): they fade to `TUNNEL_CUTAWAY_ALPHA` and stop
   * hiding whoever is in that tunnel, and fade back in once the body leaves. At once under reduced
   * motion.
   */
  private cutAwayTunnels(dt: number): void {
    const self = this.snapshot.actors.find(({ team }) => team === "self");
    const inside =
      self === undefined
        ? new Set<number>()
        : tunnelsHolding(this.snapshot.structure, self.position, self.layer);
    if (
      inside.size !== this.viewerTunnels.size ||
      [...inside].some((id) => !this.viewerTunnels.has(id))
    ) {
      this.viewerTunnels = inside;
      this.occluders = seenFrom(this.mapOccluders, inside);
    }
    const step = this.reducedMotion ? 1 : (dt * (1 - TUNNEL_CUTAWAY_ALPHA)) / TUNNEL_CUTAWAY_FADE;
    for (const [at, { ground, seam, grain, lines }] of this.tunnelCovers) {
      const target = inside.has(at) ? TUNNEL_CUTAWAY_ALPHA : 1;
      const alpha = ground.alpha;
      if (alpha !== target) {
        const next =
          alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
        ground.setAlpha(next);
        seam.setAlpha(next);
        lines.setAlpha(next);
        grain.forEach((piece) => piece.setAlpha(next));
      }
      for (const piece of this.pavingDrawn?.overTunnels.get(at) ?? []) {
        piece.setAlpha(ground.alpha);
      }
      for (const piece of this.decksOverTunnels.get(at) ?? []) {
        piece.setAlpha(ground.alpha);
      }
      const water = this.waterOverTunnels.get(at);
      water?.surface.setAlpha(ground.alpha);
      water?.ripples.setAlpha(ground.alpha);
      this.lightingPass?.fadeTunnel(at, ground.alpha);
    }
    // A breakable over a tunnel fades whole, as its cover does (#3418).
    for (const [id, { graphics }] of this.breakableDrawings) {
      const tunnels = this.breakableStyle?.walls.get(id)?.tunnels ?? [];
      graphics.setAlpha(
        Math.min(1, ...tunnels.map((at) => this.tunnelCovers.get(at)?.ground.alpha ?? 1)),
      );
    }
  }

  /**
   * Each overhang or arch top over a body (#3293, #3312), anyone's, faded to
   * `OVERHANG_FADED_ALPHA` so it never hides one, and back once its
   * footprint is empty. At once under reduced motion.
   */
  private fadeOverhangs(dt: number): void {
    for (const drawn of this.coversDrawn) {
      const covering = bodyUnder(drawn.cover, this.drawnActors, this.liftOf);
      drawn.overhang = overhangAlpha(drawn.overhang, covering, dt, this.reducedMotion);
      // A top over a tunnel takes the lower of its fade and the cut-away's (#3352).
      const cut =
        drawn.tunnel === undefined ? 1 : (this.tunnelCovers.get(drawn.tunnel)?.ground.alpha ?? 1);
      const next = Math.min(drawn.overhang, cut);
      if (next !== drawn.graphics.alpha) {
        drawn.graphics.setAlpha(next);
      }
    }
  }

  private readonly liftOf = (id: string): number => this.elevations.get(id) ?? 0;

  /**
   * The map's awnings, lean-tos and canopies (#3293): each its own
   * graphics, so each fades alone, at its layer's height and lit as a deck
   * of that layer.
   */
  private drawOverhangs(
    structure: MapStructure,
    lighting: MapLighting | undefined,
    line: number,
  ): void {
    for (const overhang of structure.overhangs) {
      const top = elevationOf(overhang.layer, structure.ground);
      const graphics = this.add
        .graphics()
        .setDepth(renderOrder({ kind: "overhang", layer: overhang.layer }));
      graphics.save();
      graphics.translateCanvas(0, -top);
      paintOverhang(
        {
          fillStyle: (colour, alpha) => graphics.fillStyle(colour, alpha),
          lineStyle: (width, colour, alpha) => graphics.lineStyle(width, colour, alpha),
          fillShape: (shape) => {
            this.fillShape(graphics, shape);
          },
          fillCircle: (x, y, radius) => graphics.fillCircle(x, y, radius),
          lineBetween: (ax, ay, bx, by) => graphics.lineBetween(ax, ay, bx, by),
        },
        overhang.look,
        overhang.footprint,
        litOverhangColours(
          materialsOf(structure).overhang[overhang.look],
          lighting,
          overhang.footprint,
          overhang.layer,
        ),
        line,
      );
      graphics.restore();
      this.coversDrawn.push({
        cover: { layer: overhang.layer, outline: shapeOutline(overhang.footprint), top },
        graphics,
        tunnel: undefined,
        overhang: 1,
      });
    }
  }

  /** Rings fixed on the map, for the docs' diagrams (#3557); unset in a match, and set, it is the only ring. */
  private fixedMarkers: readonly SceneMarker[] | undefined;

  /** Draws `markers` with the hover ring's own drawing, instead of waiting on a pointer. */
  setFixedMarkers(markers: readonly SceneMarker[]): void {
    this.fixedMarkers = markers;
  }

  /** Where a click would go, before it does (#2831): a ring off the ground (#2973), dashed on it. */
  private drawHoverMarker(g: Phaser.GameObjects.Graphics): void {
    for (const marker of this.fixedMarkers ?? []) {
      drawDiagramRing(g, marker);
    }
    const { structure, walls } = this.snapshot;
    const pointer = this.input.activePointer;
    if (structure.layerCount === 1 || !this.input.isOver || this.fixedMarkers !== undefined) {
      return;
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { layer } = pickSurface(
      structure,
      walls,
      world,
      this.alt?.held() === true,
      selfLayer(this.snapshot),
    );
    drawRing(g, world.x, world.y, layer === structure.ground, 1);
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
    covers: readonly TunnelCoverBox[],
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
    const pieces =
      deck.layer > ground
        ? coverPieces(shapeOutline(deck.footprint), EVERYWHERE, liftedCovers(covers, frame.top))
        : [];
    if (pieces.some(({ tunnel, outline }) => tunnel !== undefined && outlineArea(outline) > 0)) {
      this.drawDeckOverTunnels(deck, frame, pieces);
      return;
    }
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
    const face = this.deckTop(deck, frame.top);
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
   * A deck over a tunnel (#3352), drawn as `drawDeck` draws it but in
   * pieces: what is over each tunnel, its top and the stretch of its side
   * faces in front of it, in graphics of its own that fade with that
   * tunnel's cover; the rest where the deck would draw whole. Every piece
   * is the whole deck's art clipped to its box, so they meet with no seam.
   */
  private drawDeckOverTunnels(
    deck: MapStructure["decks"][number],
    frame: DeckFrame,
    pieces: readonly CoverPiece[],
  ): void {
    const art = DECK_ART[deck.look];
    const { palette, line } = frame;
    const switched = deck.switched;
    const down = switched !== null && !switched.up;
    const tops = new Map<number | undefined, Phaser.GameObjects.Graphics>();
    const topOf = (tunnel: number | undefined): Phaser.GameObjects.Graphics => {
      let top = tops.get(tunnel);
      if (top === undefined) {
        top =
          tunnel === undefined
            ? down
              ? this.structureAt({ kind: "deck", deckLayer: deck.layer })
              : this.deckTop(deck, frame.top)
            : this.deckTopOverTunnel(deck, frame.top, tunnel, down);
        tops.set(tunnel, top);
      }
      return top;
    };
    for (const piece of pieces) {
      const face = topOf(piece.tunnel);
      const painter = clippedPainter(face, piece.box);
      face.save();
      face.translateCanvas(0, -frame.top);
      if (switched !== null && !switched.up) {
        if (switched.hinge !== null) {
          SWITCHED_DECK_ART.raised(painter, frame, switched.hinge);
        } else if (deck.look === "bridge-plank" && switched.afterCrossings === null) {
          SWITCHED_DECK_ART.cut(painter, frame);
        } else {
          SWITCHED_DECK_ART.fallen(painter, frame);
        }
        face.restore();
        continue;
      }
      if (outlineArea(piece.outline) > 0) {
        face.fillStyle(palette.deckTop, 1);
        this.fillShape(face, { kind: "polygon", points: piece.outline });
      }
      painter.lineStyle(line, palette.wallStroke, 1);
      for (const [from, to] of piece.shore) {
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
      painter.lineStyle(line * DECK_LIP_WIDTH, DECK_LIP, 1);
      for (const { from, to } of southFacingEdges(deck.footprint)) {
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
      art.top(painter, frame);
      if (switched !== null && switched.afterCrossings !== null && switched.cracks > 0) {
        SWITCHED_DECK_ART.cracks(painter, frame, switched.cracks, switched.afterCrossings);
      }
      face.restore();
    }
    if (down) {
      return;
    }
    for (const { tunnel, box } of sideStretches(deck.footprint, pieces)) {
      const side =
        tunnel === undefined
          ? this.structureAt({ kind: "side-face", deckLayer: deck.layer })
          : this.overTunnel(tunnel, { kind: "side-face", deckLayer: deck.layer });
      const painter = clippedPainter(side, box);
      painter.fillStyle(palette.slab, 1);
      for (const [a, b, c, d] of sweptEdges(deck.footprint, frame.low, frame.top)) {
        if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
          painter.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
          painter.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
        }
      }
      art.side(painter, frame);
    }
  }

  /**
   * The graphics the top of `deck` over `tunnel` draws in (#3352): faded
   * with the tunnel's cover, and as an overhang too for a top walked under.
   */
  private deckTopOverTunnel(
    deck: MapStructure["decks"][number],
    top: number,
    tunnel: number,
    down: boolean,
  ): Phaser.GameObjects.Graphics {
    const item: RenderItem = { kind: "deck", deckLayer: deck.layer };
    if (down || !FADING_TOP_LOOKS.has(deck.look)) {
      return this.overTunnel(tunnel, item);
    }
    const graphics = this.add.graphics().setDepth(renderOrder(item));
    this.coversDrawn.push({
      cover: { layer: deck.layer, outline: shapeOutline(deck.footprint), top },
      graphics,
      tunnel,
      overhang: 1,
    });
    return graphics;
  }

  /** New graphics at `item`'s place in the draw order, faded with `tunnel`'s cover (#3352). */
  private overTunnel(tunnel: number, item: RenderItem): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics().setDepth(renderOrder(item));
    const over = this.decksOverTunnels.get(tunnel) ?? [];
    over.push(graphics);
    this.decksOverTunnels.set(tunnel, over);
    return graphics;
  }

  /**
   * The graphics `deck`'s top draws in: its layer's, or its own for a top
   * walked under, faded as an overhang is while a body is under it (#3312).
   */
  private deckTop(deck: MapStructure["decks"][number], top: number): Phaser.GameObjects.Graphics {
    const item: RenderItem = { kind: "deck", deckLayer: deck.layer };
    if (!FADING_TOP_LOOKS.has(deck.look)) {
      return this.structureAt(item);
    }
    const graphics = this.add.graphics().setDepth(renderOrder(item));
    this.coversDrawn.push({
      cover: { layer: deck.layer, outline: shapeOutline(deck.footprint), top },
      graphics,
      tunnel: undefined,
      overhang: 1,
    });
    return graphics;
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
   * so it covers them, each tunnel's seam over its paving (#3236).
   */
  private drawPits(structure: MapStructure, line: number, palette: ArenaPalette): void {
    for (const [at, { ground, seam, grain, lines }] of this.tunnelCovers) {
      if (at >= structure.tunnels.length) {
        ground.destroy();
        seam.destroy();
        lines.destroy();
        grain.forEach((piece) => {
          piece.destroy();
        });
        this.tunnelCovers.delete(at);
      }
    }
    this.lipGrain.forEach((piece) => {
      piece.destroy();
    });
    this.lipGrain = [];
    if (structure.pits.length === 0 && structure.tunnels.length === 0) {
      return;
    }
    const pit = this.structureAt({ kind: "pit" });
    const cover = this.structureAt({ kind: "deck", deckLayer: structure.ground });
    const lipLines = this.structureAt({
      kind: "lip-grain",
      deckLayer: structure.ground,
      part: "lines",
    });
    // Under its cover, seen only while that is cut away (#3234); a pit draws over it.
    // A tunnel's floor is the ground's: its roof, and the light under it, make it dark (#3329).
    const tunnelGround = palette.floor ?? ARENA_BACKGROUND;
    pit.fillStyle(tunnelGround, 1);
    for (const tunnel of structure.tunnels) {
      this.fillFan(pit, tunnelFloor(structure, tunnel));
    }
    const floor = pitFloor(palette);
    for (const each of structure.pits) {
      const drawing = pitDrawing(structure, each);
      pit.fillStyle(floor, 1);
      this.fillFan(pit, drawing.floor);
      pit.fillStyle(pitWall(palette), 1);
      this.fillFan(pit, drawing.farWall);
      pit.fillStyle(TUNNEL_MOUTH, 1);
      for (const mouth of drawing.mouths) {
        this.fillFan(pit, mouth);
      }
      // Where a tunnel runs on north, its floor shows, lit by its layer (#3329).
      pit.fillStyle(tunnelGround, 1);
      for (const passage of drawing.passages) {
        this.fillFan(pit, passage);
      }
      this.drawGroundPatch(cover, lipLines, drawing.lip, line, palette);
      const grain = this.groundPatchGrain(drawing.lip, structure, palette, "lip-grain");
      if (grain !== undefined) {
        this.lipGrain.push(grain);
      }
      lipLines.lineStyle(line, palette.wallStroke, 1);
      this.strokeShape(lipLines, each.footprint);
    }
    for (const [at, tunnel] of structure.tunnels.entries()) {
      let drawn = this.tunnelCovers.get(at);
      if (drawn === undefined) {
        const deckLayer = structure.ground;
        drawn = {
          ground: this.add.graphics().setDepth(renderOrder({ kind: "tunnel-cover", deckLayer })),
          seam: this.add.graphics().setDepth(renderOrder({ kind: "tunnel-seam", deckLayer })),
          grain: [],
          lines: this.add
            .graphics()
            .setDepth(renderOrder({ kind: "tunnel-grain", deckLayer, part: "lines" })),
        };
        this.tunnelCovers.set(at, drawn);
      }
      drawn.ground.clear();
      drawn.seam.clear();
      drawn.lines.clear();
      drawn.grain.forEach((piece) => {
        piece.destroy();
      });
      drawn.grain = [];
      for (const piece of tunnelCover(structure, tunnel)) {
        this.drawGroundPatch(drawn.ground, drawn.lines, piece, line, palette);
        const grain = this.groundPatchGrain(piece, structure, palette, "tunnel-grain");
        if (grain !== undefined) {
          drawn.grain.push(grain.setAlpha(drawn.ground.alpha));
        }
      }
      this.drawTunnelSeam(drawn.seam, structure, tunnel, line, palette);
    }
  }

  /**
   * The seam a covered tunnel shows on the ground (#3236): a recessed edge,
   * dark with its lit lip inside, and grating slots along its middle, all in
   * the biome's rock, so from above it reads as a passage running under.
   * Each hole its shafts go down by (#3329) is rimmed the same way.
   */
  private drawTunnelSeam(
    g: Phaser.GameObjects.Graphics,
    structure: MapStructure,
    tunnel: MapStructure["tunnels"][number],
    line: number,
    palette: ArenaPalette,
  ): void {
    const seam = tunnelSeam(structure, tunnel, (line * TUNNEL_SEAM_WIDTH) / 2);
    g.lineStyle(line * TUNNEL_SEAM_WIDTH, palette.wallFace, 1);
    for (const { from, to } of seam.edges) {
      g.lineBetween(from.x, from.y, to.x, to.y);
    }
    g.lineStyle(line, palette.wallLit, 0.8);
    for (const { from, to } of seam.lips) {
      g.lineBetween(from.x, from.y, to.x, to.y);
    }
    for (const slot of seam.slots) {
      g.fillStyle(TUNNEL_MOUTH, 1);
      this.fillFan(g, slot);
      g.lineStyle(line * WALL_LIT_WIDTH, palette.wallFace, 1);
      const [nw, ne, se, sw] = slot;
      if (nw === undefined || ne === undefined || se === undefined || sw === undefined) {
        continue;
      }
      // Bars across the slot's long side, its south edge lit.
      const lengthwise = ne.x - nw.x < sw.y - nw.y;
      for (let bar = 1; bar <= GRATING_BARS; bar += 1) {
        const at = bar / (GRATING_BARS + 1);
        if (lengthwise) {
          const y = nw.y + (sw.y - nw.y) * at;
          g.lineBetween(nw.x, y, ne.x, y);
        } else {
          const x = nw.x + (ne.x - nw.x) * at;
          g.lineBetween(x, nw.y, x, sw.y);
        }
      }
      g.lineStyle(line, palette.wallLit, 1);
      g.lineBetween(sw.x, sw.y, se.x, se.y);
    }
  }

  /**
   * The ground grain (#3484) over the box `outline`, as `drawGrain` lays
   * it there, so a patch redrawn over a tunnel or in front of a pit
   * matches the ground round it; none on a map of one layer.
   */
  private groundPatchGrain(
    outline: readonly Vec2[],
    structure: MapStructure,
    palette: ArenaPalette,
    kind: "tunnel-grain" | "lip-grain",
  ): Phaser.GameObjects.TileSprite | undefined {
    if (palette.floor === undefined) {
      return undefined;
    }
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const [left, top] = [Math.min(...xs), Math.min(...ys)];
    const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
    return this.add
      .tileSprite(left, top, width, height, this.groundTile(structure))
      .setOrigin(0, 0)
      .setTilePosition(left, top)
      .setDepth(renderOrder({ kind, deckLayer: structure.ground, part: "grain" }));
  }

  /**
   * The floor over the box `outline`, as `drawFloor` draws it there, and
   * its grid on `lines`, which draws over the patch's grain (#3484).
   */
  private drawGroundPatch(
    g: Phaser.GameObjects.Graphics,
    lines: Phaser.GameObjects.Graphics,
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
    if (palette.grid === undefined) {
      return;
    }
    lines.lineStyle(line, palette.grid, 1);
    for (let x = Math.ceil(left / GRID_STEP) * GRID_STEP; x <= right; x += GRID_STEP) {
      lines.lineBetween(x, top, x, bottom);
    }
    for (let y = Math.ceil(top / GRID_STEP) * GRID_STEP; y <= bottom; y += GRID_STEP) {
      lines.lineBetween(left, y, right, y);
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

  /**
   * A wall box split by the tunnel covers it draws over (#3418): the art of
   * `drawWallBox`, lifts taken off, drawn once through each piece's box,
   * its part over a tunnel into graphics faded with that tunnel's cover.
   * A cut meets the next piece's exactly, so the wall shows no seam.
   */
  private drawWallBoxOverTunnels(
    g: Phaser.GameObjects.Graphics,
    wall: RenderableWall,
    base: number,
    line: number,
    palette: ArenaPalette,
    pieces: readonly WallPiece[],
  ): void {
    const top = base + WALL_HEIGHT;
    const triangles = shapeTriangles(wall);
    for (const { tunnel, box } of pieces) {
      const painter = clippedPainter(
        tunnel === undefined ? g : this.overTunnel(tunnel, { kind: "wall", layer: wall.layer }),
        box,
      );
      painter.fillStyle(palette.wallFace, 1);
      for (const [a, b, c, d] of sweptEdges(wall, base, top)) {
        if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
          painter.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
          painter.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
        }
      }
      painter.fillStyle(palette.wallTop, 1);
      for (const [a, b, c] of triangles) {
        if (a !== undefined && b !== undefined && c !== undefined) {
          painter.fillTriangle(a.x, a.y - top, b.x, b.y - top, c.x, c.y - top);
        }
      }
      painter.lineStyle(line, palette.wallStroke, 1);
      const outline = shapeOutline(wall);
      outline.forEach((from, at) => {
        const to = outline[(at + 1) % outline.length] ?? from;
        painter.lineBetween(from.x, from.y - top, to.x, to.y - top);
      });
      painter.lineStyle(line * WALL_LIT_WIDTH, palette.wallLit, 1);
      for (const { from, to } of southFacingEdges(wall)) {
        painter.lineBetween(from.x, from.y - top, to.x, to.y - top);
      }
    }
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
   * over the land outside, and its edge is traced over both. The grid and
   * the edge are on `floorLines`, over the floor's grain (#3484).
   */
  private drawFloor(palette: ArenaPalette, line: number): void {
    const g = this.floorGraphics;
    const lines = this.floorLines;
    if (g === undefined || lines === undefined) {
      return;
    }
    g.clear();
    lines.clear();
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
    this.drawGrid(lines, line, palette);
    if (bounds.kind === "outline") {
      paintOutsideEdge(
        {
          lineStyle: (width, colour, alpha) => lines.lineStyle(width, colour, alpha),
          strokeOutline: (points) => {
            this.strokeShape(lines, { kind: "polygon", points });
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

  /**
   * The ground's grain and dressing (#3484), over the floor and its grid:
   * sprites tiled from the world's origin with the biome's tile, over the
   * boxes no deck that is up draws over opaque (#3671), and on a map with
   * a ground outline (#3066) a stencil round them, so they stay inside. A
   * map of one layer draws flat, so it has none. Built again when the map
   * or the decks that are up change.
   */
  private drawGrain(structure: MapStructure, palette: ArenaPalette): void {
    const { bounds } = structure;
    const tile = groundTileKey(structure);
    const { width, height } = this.arena;
    const boxes = shownBoxes(
      width,
      height,
      SHOWN_FILL_CELL,
      deckCovers(structure, this.snapshot.walls, GRAIN_DEPTH),
      SHOWN_FILL_MARGIN,
    );
    const cover = boxes.map(({ x, y, width: w, height: h }) => [x, y, w, h].join(",")).join(" ");
    if (this.grain?.bounds === bounds && this.grain.tile === tile && this.grain.cover === cover) {
      return;
    }
    this.dropGrain();
    if (palette.floor === undefined) {
      return;
    }
    const key = this.groundTile(structure);
    const sprites = boxes.map(({ x, y, width: w, height: h }) =>
      this.add
        .tileSprite(x, y, w, h, key)
        .setOrigin(0, 0)
        .setTilePosition(x, y)
        .setDepth(GRAIN_DEPTH),
    );
    if (bounds.kind !== "outline") {
      this.grain = { bounds, tile, cover, objects: sprites };
      return;
    }
    // One stencil blocks the land outside the outline; after the grain, a
    // clear takes it off again. Neither fills the camera, which an
    // inverted stencil does twice a frame: on a software renderer that
    // doubled a frame's cost (#3484).
    const outside = this.make.graphics({}, false);
    outside.fillStyle(0xffffff, 1);
    for (const [a, b, c] of outsideTriangles(bounds.outline, width, height)) {
      outside.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
    const stencil = this.add.stencil(0, 0, [outside]).setDepth(GRAIN_STENCIL_DEPTH);
    const release = this.add
      .stencil(0, 0, [], { stencilLayerMode: "clear" })
      .setDepth(GRAIN_RELEASE_DEPTH);
    this.grain = { bounds, tile, cover, objects: [stencil, ...sprites, release] };
  }

  /** The map's ground tile (#3484), painted once per game. */
  private groundTile(look: MapLook): string {
    const key = groundTileKey(look);
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, GROUND_TILE, GROUND_TILE);
      if (texture === null) {
        throw new Error("ground: could not create a ground tile");
      }
      texture.context.putImageData(
        new ImageData(grainPixels(look), GROUND_TILE, GROUND_TILE),
        0,
        0,
      );
      paintDressing(texture.context, look);
      texture.refresh();
    }
    return key;
  }

  /** Drops the ground grain drawn last, if any. */
  private dropGrain(): void {
    for (const object of this.grain?.objects ?? []) {
      object.destroy();
    }
    this.grain = undefined;
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
    for (const { ripples } of this.waterOverTunnels.values()) {
      ripples.clear();
    }
    const line = 1 / (this.view?.zoom ?? 1);
    for (const { shape, pieces } of this.waterShapes) {
      for (const piece of pieces) {
        const { graphics, painter } =
          piece.tunnel === undefined
            ? this.ripplesAt(shape.layer)
            : this.tunnelRipplesAt(piece.tunnel);
        graphics.save();
        graphics.translateCanvas(0, -elevationOf(shape.layer, this.snapshot.structure.ground));
        WATER_ART[waterArtKey(shape.depth)].ripples(
          painter,
          { ...shape, outline: piece.outline, ripples: piece.ripples },
          line,
          this.now,
          this.reducedMotion,
        );
        graphics.restore();
      }
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
    for (const graphics of [
      ...this.fogGraphics.values(),
      ...this.plumeGraphics.values(),
      ...this.shaftGraphics.values(),
    ]) {
      graphics.clear();
    }
    this.weatherGraphics?.clear();
    const { atmosphere, ground, layerCount, ascentAct, lighting } = this.snapshot.structure;
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
    const tint = fogTintOf(ascentAct);
    for (const art of fog) {
      paintFog(
        this.atmospherePainter(this.fogAt(art.layer), line),
        art,
        elevationOf(art.layer, ground),
        this.now,
        this.reducedMotion,
        view,
        tint,
      );
    }
    // A unit of height leans this far towards the sun: the sun's shadow, turned round.
    const shadow = lighting?.sun === undefined ? { x: 0, y: 0 } : sunShadowOffset(lighting.sun, 1);
    const toSun = { x: -shadow.x, y: -shadow.y };
    for (const shaft of atmosphere.shafts) {
      paintShaft(this.shaftAt(shaft.layer), shaft, elevationOf(shaft.layer, ground), toSun);
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

  /** The graphics `layer`'s light shafts draw into: above its fog, added onto it. */
  private shaftAt(layer: number): Phaser.GameObjects.Graphics {
    let g = this.shaftGraphics.get(layer);
    if (g === undefined) {
      g = this.add
        .graphics()
        .setDepth(renderOrder({ kind: "fog", layer }))
        .setBlendMode(Phaser.BlendModes.ADD);
      this.shaftGraphics.set(layer, g);
    }
    return g;
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
      const depth = renderOrder({ kind: "zone", layer: zone.layer, part: "ground" });
      return { art, ...this.paintGround(art, 0, depth) };
    });
    this.zoneGrounds = { zones, grounds };
    return grounds;
  }

  /**
   * `art`'s still ground painted once onto a canvas texture of its own,
   * as an image `lift` world units up at `depth`: a zone's, or lava
   * paving's (#3245).
   */
  private paintGround(
    art: ZoneArt,
    lift: number,
    depth: number,
  ): { readonly image: Phaser.GameObjects.Image; readonly key: string } {
    const { width, height } = art.bounds;
    const scale = Math.min(ZONE_TEXTURE_SCALE, ZONE_TEXTURE_MAX_SIDE / Math.max(1, width, height));
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
      .image(art.bounds.left, art.bounds.top - lift, key)
      .setOrigin(0, 0)
      .setScale(1 / scale)
      .setDepth(depth);
    return { image, key };
  }

  /**
   * What a scene start must not inherit: Phaser reuses this instance on
   * restart, so a lever seen last match is first seen afresh (#3087).
   */
  private shutdown(): void {
    this.lightingPass?.destroy();
    this.lightingPass = undefined;
    this.dropOutside();
    this.dropGrain();
    this.dropZoneGrounds();
    this.dropPaving();
    this.leverFlips.clear();
    this.alt?.dispose();
    this.alt = undefined;
  }

  /**
   * The map's roads, squares and tracks (#3210) on their layers' floors,
   * one canvas texture each, painted once: made again only when the map's
   * paving or its colours change, so they cost nothing per frame. The
   * part of one over a tunnel is cut out and drawn as a piece of its own,
   * which fades with that tunnel's cover (#3272).
   */
  private drawPaving(structure: MapStructure): void {
    const colours = pavingPalette(structure);
    const drawn = this.pavingDrawn;
    if (drawn !== undefined && drawn.paving === structure.paving && drawn.colours === colours) {
      return;
    }
    this.dropPaving();
    const pavings = (structure.paving ?? []).filter(isStonePaving);
    const drawings = pavings.map((paving) => pavingDrawing(paving, colours[paving.look]));
    const sizes = pavingTextureSizes(drawings.map((drawing) => drawing.bounds));
    // Lava (#3245) is a molten zone's ground, painted by the zone painter at the paving's depth.
    const lava = (structure.paving ?? [])
      .filter((paving) => paving.look === "lava")
      .map((paving, index) =>
        this.paintGround(
          groundArtOf("lava", paving.area, index),
          elevationOf(paving.layer, structure.ground),
          renderOrder({ kind: "paving", layer: paving.layer }),
        ),
      );
    const covers = structure.tunnels.flatMap((tunnel, at) =>
      tunnelCover(structure, tunnel).map((outline) => ({
        tunnel: at,
        layer: structure.ground,
        outline,
      })),
    );
    const holes = structure.tunnels.flatMap((tunnel) =>
      tunnelOpenings(structure, tunnel).map((outline) => ({ layer: structure.ground, outline })),
    );
    const overTunnels = new Map<number, Phaser.GameObjects.Image[]>();
    const painted = pavings.flatMap((paving, at) => {
      const drawing = drawings[at];
      const size = sizes[at];
      if (drawing === undefined || size === undefined) {
        throw new Error("paving: a paving lost its drawing");
      }
      const { scale } = size;
      const x = drawing.bounds.x;
      const y = drawing.bounds.y - elevationOf(paving.layer, structure.ground);
      const depth = renderOrder({ kind: "paving", layer: paving.layer });
      const pieces = pavingTunnelPieces(
        drawing,
        paving.layer,
        elevationOf(paving.layer, structure.ground),
        size,
        covers,
      );
      const cut = pavingHoles(drawing, paving.layer, size, holes);
      const image = (
        width: number,
        height: number,
        paint: (context: CanvasRenderingContext2D) => void,
      ): { readonly image: Phaser.GameObjects.Image; readonly key: string } => {
        const key = `paving-${String(pavingTextures)}`;
        pavingTextures += 1;
        const texture = this.textures.createCanvas(key, width, height);
        if (texture === null) {
          throw new Error("paving: could not create a paving's texture");
        }
        paint(texture.context);
        texture.refresh();
        return {
          image: this.add
            .image(x, y, key)
            .setOrigin(0, 0)
            .setScale(1 / scale)
            .setDepth(depth),
          key,
        };
      };
      const whole = image(size.width, size.height, (context) => {
        paintPaving(context, drawing, scale, pieces, cut);
      });
      return [
        whole,
        ...pieces.map((piece) => {
          const { left, top, width, height } = piece.pixels;
          const made = image(width, height, (context) => {
            paintPavingPiece(context, drawing, scale, piece);
          });
          made.image.setPosition(x + left / scale, y + top / scale);
          overTunnels.set(piece.tunnel, [...(overTunnels.get(piece.tunnel) ?? []), made.image]);
          return made;
        }),
      ];
    });
    this.pavingDrawn = {
      paving: structure.paving,
      colours,
      painted: [...painted, ...lava],
      overTunnels,
    };
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

  /** The surface and ripples of the water over tunnel `at` (#3350), made the first time. */
  private waterOverTunnel(at: number): WaterOverTunnel {
    let over = this.waterOverTunnels.get(at);
    if (over === undefined) {
      const layer = this.snapshot.structure.ground;
      const ripples = this.add
        .graphics()
        .setDepth(renderOrder({ kind: "water", layer, part: "ripples" }));
      over = {
        surface: this.add
          .graphics()
          .setDepth(renderOrder({ kind: "water", layer, part: "surface" })),
        ripples,
        painter: this.waterPainter(ripples),
      };
      this.waterOverTunnels.set(at, over);
    }
    return over;
  }

  private tunnelRipplesAt(at: number): {
    readonly graphics: Phaser.GameObjects.Graphics;
    readonly painter: WaterPainter;
  } {
    const { ripples, painter } = this.waterOverTunnel(at);
    return { graphics: ripples, painter };
  }

  /** `g` as a piece of water draws through it (#3350): its shore stroked, never a cut edge. */
  private piecePainter(g: Phaser.GameObjects.Graphics, piece: WaterPiece): WaterPainter {
    return {
      ...this.waterPainter(g),
      strokeOutline: () => {
        for (const [a, b] of piece.shore) {
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
      },
    };
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
   * outside draws. Past either is `bg` or the outside. A ground not
   * laid in tiles, as river ice is not, has no grid.
   */
  private drawGrid(g: Phaser.GameObjects.Graphics, line: number, palette: ArenaPalette): void {
    const { width, height } = this.arena;
    const { bounds } = this.snapshot.structure;
    const { grid } = palette;
    if (bounds.kind === "outline") {
      if (grid === undefined) {
        return;
      }
      g.lineStyle(line, grid, 1);
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
    if (grid !== undefined) {
      g.lineStyle(line, grid, 1);
      for (let x = 0; x <= width; x += GRID_STEP) {
        g.lineBetween(x, 0, x, height);
      }
      for (let y = 0; y <= height; y += GRID_STEP) {
        g.lineBetween(0, y, width, y);
      }
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

/**
 * The rectangle `width` by `height` less `outline`, as triangles: the
 * outline is a hole in it (#3484).
 */
export function outsideTriangles(
  outline: readonly Vec2[],
  width: number,
  height: number,
): readonly (readonly [Vec2, Vec2, Vec2])[] {
  const points: Vec2[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    ...outline,
  ];
  const corners = Phaser.Geom.Polygon.Earcut(
    points.flatMap((p) => [p.x, p.y]),
    [4],
  );
  const triangles: [Vec2, Vec2, Vec2][] = [];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const [a, b, c] = [corners[i], corners[i + 1], corners[i + 2]].map((index) =>
      index === undefined ? undefined : points[index],
    );
    if (a !== undefined && b !== undefined && c !== undefined) {
      triangles.push([a, b, c]);
    }
  }
  return triangles;
}

/** A map's bounds when they are an outline. */
type OutlineBounds = Extract<MapBounds, { readonly kind: "outline" }>;

/** The ground's grain (#3484): one tiled sprite, and on a map with an outline the stencil that keeps it inside. */
interface GroundGrain {
  readonly bounds: MapBounds;
  /** The ground tile it is laid with. */
  readonly tile: string;
  /** The boxes it is laid over, as text: built again when they change. */
  readonly cover: string;
  readonly objects: readonly Phaser.GameObjects.GameObject[];
}

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

/** Begins a path along `points` on `g`, to fill or stroke: closed, unless `closed` is false. */
function tracePath(g: Phaser.GameObjects.Graphics, points: readonly Point[], closed = true): void {
  const [first, ...rest] = points;
  g.beginPath();
  if (first !== undefined) {
    g.moveTo(first.x, first.y);
    for (const point of rest) {
      g.lineTo(point.x, point.y);
    }
  }
  if (closed) {
    g.closePath();
  }
}

/**
 * Where a split deck's side faces draw (#3352): a side face stands in
 * front of the deck, lifted off its south edge, so it goes with the piece
 * that edge runs through, cut by x alone. Each south edge's stretch over a
 * tunnel is a band of the plane, top to bottom, for that tunnel's piece;
 * where two overlap the earlier owns it, and the rest is the deck's.
 */
function sideStretches(
  footprint: RenderableShape,
  pieces: readonly CoverPiece[],
): readonly { readonly tunnel: number | undefined; readonly box: Box }[] {
  const owned: Box[] = [];
  const over = pieces.flatMap(({ tunnel, box }) =>
    tunnel === undefined
      ? []
      : southFacingEdges(footprint).flatMap(({ from, to }) => {
          const share = segmentInBox(from, to, box);
          if (share === undefined) {
            return [];
          }
          const xs = share.map((t) => from.x + (to.x - from.x) * t);
          const band: Box = {
            left: Math.min(...xs),
            top: -Infinity,
            right: Math.max(...xs),
            bottom: Infinity,
          };
          if (band.right <= band.left) {
            return [];
          }
          const bands = boxWithout(band, owned).map((piece) => ({ tunnel, box: piece }));
          owned.push(band);
          return bands;
        }),
  );
  return [...over, ...boxWithout(EVERYWHERE, owned).map((box) => ({ tunnel: undefined, box }))];
}

/** The box of the ground over each of the map's tunnels, by its index. */
function tunnelCoverBoxes(structure: MapStructure): readonly TunnelCoverBox[] {
  return structure.tunnels.map((tunnel, at) => ({
    tunnel: at,
    box: tunnelCoverBox(structure, tunnel),
  }));
}

/**
 * The map's water, the ground's split by the tunnel covers under it
 * (#3350), so what is over a tunnel fades with its cover. Water on any
 * other layer is one piece.
 */
function splitWater(structure: MapStructure): readonly WaterSplit[] {
  const covers = tunnelCoverBoxes(structure);
  return structure.water.map(waterShapeOf).map((shape) => ({
    shape,
    pieces: waterPieces(shape, shape.layer === structure.ground ? covers : []),
  }));
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

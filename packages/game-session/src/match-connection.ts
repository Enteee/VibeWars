import type {
  ChainRole,
  CombatEvent,
  CompanionMode,
  CreatureKind,
  CreatureLook,
  OffhandId,
  ProfessionId,
  StatusId,
} from "@vibewars/game-core";
import type {
  CastRefusedMessage,
  ClientIntent,
  CombatBatchMessage as WireCombatBatchMessage,
  CombatMessage as WireCombatMessage,
  MapDescriptor,
  PeerCall,
  SkillBarSlot,
  WireCalls,
  WirePing,
  WireWeaponSets,
} from "@vibewars/game-protocol";

/**
 * What a match looks like to the client, whoever runs it: the plain
 * snapshot/intent interface the renderer, the HUD and the input handler are
 * written against (ADR-0001).
 *
 * Implemented by the Training Ground's local simulation (#2 §4.3) and,
 * over a `Transport`, this package's P2P client (#375). It lives here so
 * both share it.
 */

export interface PlayerSnapshot {
  readonly sessionId: string;
  /** The display name the server settled on; never the session id. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Where the player faces, radians, `atan2` convention, 0 = +x (#187). */
  readonly facing: number;
  /** Who this player is targeting, or `undefined` for no target. */
  readonly targetSessionId: string | undefined;
  /** Who this player is attacking with their weapon, or `undefined` (#160). */
  readonly attackTargetSessionId: string | undefined;
  /** Whether this player is walking to a clicked point (#310, #342). */
  readonly walking: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  /** Maximum energy lost to overcast (#461); energy fills to `maxEnergy − overcast`. */
  readonly overcast: number;
  /** Morale in percent (#843): the death penalty below 0, a boost above. */
  readonly morale: number;
  /** Base armor including the off-hand, before statuses. */
  readonly armor: number;
  /** Equipped weapon class id, or `undefined` if the server sent none. */
  readonly weaponId: string | undefined;
  /** The off-hand whose mark the arena draws (#276); `undefined` for none, or one this client does not know. */
  readonly offhandId: OffhandId | undefined;
  /**
   * The build's professions as the server resolved them (#281), or
   * `undefined` for none: a training dummy has neither, most players no
   * secondary.
   */
  readonly primaryProfession: ProfessionId | undefined;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly team: number;
  readonly dead: boolean;
  /** Its corpse was exploited (#466): drawn darker. Only ever true while `dead`. */
  readonly corpseExploited: boolean;
  readonly castingSkillId: string | undefined;
  readonly castRemaining: number;
  /** The current cast's whole length, dazed included; 0 when not casting. */
  readonly castTotal: number;
  /**
   * The swing under way (#560): seconds into it, and its whole length, the
   * hit landing at the end. `swingTotal` is 0 when not attacking. The
   * weapon mark's pose follows them; nothing is predicted.
   */
  readonly swingElapsed: number;
  readonly swingTotal: number;
  /** Seconds left lying down from a knockdown (#468); 0 standing. Drawn from this, never from the event. */
  readonly knockdownRemaining: number;
  /** Net health and energy pips as the host applies them (#504): ±10, 0 dead. Drawn, never derived. */
  readonly healthPips: number;
  readonly energyPips: number;
  /** In the order applied, oldest first (#803). */
  readonly statuses: readonly StatusSnapshot[];
  /**
   * A creature's owner, kind and look (#1052, #1162), `undefined` for a
   * player or a dummy. A creature never counts for its team: not in the
   * scoreboard, the enemy pips or the music. `mode` is a companion's
   * (#1110), `null` for any other creature.
   */
  readonly creature:
    | {
        readonly ownerId: string;
        readonly kind: CreatureKind;
        readonly look: CreatureLook;
        readonly mode: CompanionMode | null;
      }
    | undefined;
}

/** One status on a player (#803): what the effects monitor draws. */
export interface StatusSnapshot {
  readonly id: StatusId;
  /**
   * Match clock (`elapsedSeconds`) at which it runs out; `null` for a
   * maintained enchantment (#837), which lasts until something ends it,
   * and for a spirit's aura (#1064), which lasts while its bearer is in range.
   */
  readonly endsAt: number | null;
  /**
   * The length of the application that set it: a duration bar's full
   * width. `null` exactly when `endsAt` is.
   */
  readonly durationSeconds: number | null;
  /** Who applied it; it keeps the id after they leave the match. */
  readonly casterId: string;
}

export interface MatchSnapshot {
  readonly selfSessionId: string;
  readonly players: readonly PlayerSnapshot[];
  readonly scoreTeam0: number;
  readonly scoreTeam1: number;
  readonly elapsedSeconds: number;
  /** "active" or "finished". */
  readonly phase: string;
  /** The winning team, or `undefined` while active or on a draw. */
  readonly winningTeam: number | undefined;
  /** "score", "time", "annihilation", "morale", "host-left", or `undefined` while active. */
  readonly endReason: string | undefined;
  /** Weapon shots and flying spells in flight, oldest first (#160, #535). */
  readonly projectiles: readonly ProjectileSnapshot[];
  /** Wards on the ground, oldest first (#1087). */
  readonly groundEffects: readonly GroundEffectSnapshot[];
  /** Your team's traps, oldest first (#1105); a foe's never reach you. */
  readonly traps: readonly GroundEffectSnapshot[];
  /** What each player did, from the host's `ended` (#1057); `undefined` until then. */
  readonly summary: readonly MatchSummaryRow[] | undefined;
}

/** A ward or a trap on the ground (#1087, #1105): a circle at `x`, `y` in `team`'s colour, until `endsAt`. */
export interface GroundEffectSnapshot {
  readonly id: number;
  /** The skill that placed it, for its icon. */
  readonly skillId: string;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Match clock (`elapsedSeconds`) at which it ends. */
  readonly endsAt: number;
  /** How long it was placed for. */
  readonly durationSeconds: number;
}

/** One player's line in the match summary (#1057), as the host tallied it: whole numbers. */
export interface MatchSummaryRow {
  readonly id: string;
  readonly name: string;
  readonly team: number;
  readonly damage: number;
  readonly healing: number;
  readonly taken: number;
  readonly kills: number;
  readonly deaths: number;
  readonly interrupts: number;
}

/**
 * A ranged weapon's shot or a flying spell, as released: it flies from `from` to `to` over
 * `flightSeconds`, starting at `launchedAt` on the match clock.
 */
export interface ProjectileSnapshot {
  readonly id: number;
  /** The shooter's session id, for the side's tint. */
  readonly attackerId: string;
  /**
   * The spell it carries (#535), which picks the sprite; `undefined` for
   * a weapon's shot, drawn from its shooter's `weaponId`.
   */
  readonly skillId: string | undefined;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly launchedAt: number;
  readonly flightSeconds: number;
}

/** One slot of the server-assigned skill bar. */
export type SkillSlot = SkillBarSlot;

/** One slot's recharge: `remaining` is 0 and `spent` false when the skill is ready. */
export interface SlotRecharge {
  readonly remaining: number;
  /** What the recharge started with, for the wipe's proportion. */
  readonly total: number;
  /** Spent until a morale boost (#474): Resurrection Signet's, used. */
  readonly spent: boolean;
}

/**
 * Your team's calls (#443): the foe called, if any, and the live pings,
 * `remaining` counted down on the match clock to now.
 */
export interface CallsSnapshot {
  readonly target: WireCalls["target"];
  readonly pings: readonly WirePing[];
}

export const NO_CALLS: CallsSnapshot = { target: null, pings: [] };

/** A `"combat"` message, its events game-core's. */
export type CombatMessage = WireCombatMessage<CombatEvent>;

/** What one `"combat"` message carries: a tick's entries, in combat-log order (#288). */
export type CombatBatchMessage = WireCombatBatchMessage<CombatEvent>;

export interface MatchConnection {
  readonly selfSessionId: string;
  /** Notifies when the connection drops and when it comes back. */
  onConnectionChange(handler: (state: "online" | "reconnecting" | "lost") => void): void;
  /** The match's static geometry, received once on join (brief §19). */
  readonly map: MapDescriptor;
  /**
   * How long the match runs, from the host (#476): the clock counts down
   * from it. `null` for one with no limit, as training is.
   */
  readonly timeLimitSeconds: number | null;
  /**
   * The server-assigned skill bar, received on join and again whenever a
   * slot changes, such as a cost a glyph lowers (#637): every slot in its
   * place, `null` where it is empty (#347).
   */
  readonly skillBar: readonly (SkillSlot | null)[];
  /**
   * Attribute id to effective rank, as the host resolved this player's
   * build, a starter build included: what the bar's tooltips describe (#485).
   */
  readonly ranks: ReadonlyMap<string, number>;
  /**
   * The weapon sets this player carries, and which is in hand or queued
   * (#489): sent on join and when either changes; `undefined` until the
   * first arrives.
   */
  readonly weaponSets: WireWeaponSets | undefined;
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** Why the server refused one of this player's casts, sent to them alone. */
  onCastRefused(handler: (message: CastRefusedMessage) => void): void;
  /** This player's recharges right now, one entry per skill-bar slot (#152). */
  getRecharges(): readonly SlotRecharge[];
  /**
   * This player's adrenaline right now, one entry per skill-bar slot
   * (#463): the units its skill holds, 0 for one that costs none.
   */
  getAdrenaline(): readonly number[];
  /**
   * Seconds until this player's adrenaline is lost out of combat (#828),
   * never below 0; `null` while every slot is empty.
   */
  getAdrenalineLossIn(): number | null;
  /**
   * The chain mark this player left on `targetId` and still running
   * (#916): which dagger attack of theirs last hit it; `undefined` for
   * none, or one run out.
   */
  getChainMark(targetId: string): ChainRole | undefined;
  /** Call a foe for your team, or ping a spot (#443). The host may drop it, and says nothing. */
  sendCall(call: PeerCall): void;
  /** Your team's calls right now; nobody else's ever reach you. */
  getCalls(): CallsSnapshot;
  disconnect(): Promise<void>;
}

import type { CombatEvent, OffhandId, ProfessionId } from "@vibewars/game-core";
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
} from "@vibewars/game-protocol";

/**
 * What a match looks like to the client, whoever runs it: the plain
 * snapshot/intent interface the renderer, the HUD and the input handler are
 * written against (ADR-0001).
 *
 * Implemented by `apps/web`'s Colyseus client, the Training Ground's local
 * simulation (#2 §4.3) and, over a `Transport`, this package's P2P
 * client (#375). It lives here so all three share it.
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
  readonly adrenaline: number;
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
  readonly statuses: readonly string[];
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
  /** "score", "time", or `undefined` while active. */
  readonly endReason: string | undefined;
  /** Weapon shots and flying spells in flight, oldest first (#160, #535). */
  readonly projectiles: readonly ProjectileSnapshot[];
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

/** One slot's recharge: `remaining` is 0 when the skill is ready. */
export interface SlotRecharge {
  readonly remaining: number;
  /** What the recharge started with, for the wipe's proportion. */
  readonly total: number;
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
   * The server-assigned skill bar, received on join and again whenever a
   * slot changes, such as a cost a glyph lowers (#637): every slot in its
   * place, `null` where it is empty (#347).
   */
  readonly skillBar: readonly (SkillSlot | null)[];
  /**
   * Attribute id to effective rank, as the host resolved this player's
   * build, house loadout included: what the bar's tooltips describe (#485).
   */
  readonly ranks: ReadonlyMap<string, number>;
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** Why the server refused one of this player's casts, sent to them alone. */
  onCastRefused(handler: (message: CastRefusedMessage) => void): void;
  /** This player's recharges right now, one entry per skill-bar slot (#152). */
  getRecharges(): readonly SlotRecharge[];
  /** Call a foe for your team, or ping a spot (#443). The host may drop it, and says nothing. */
  sendCall(call: PeerCall): void;
  /** Your team's calls right now; nobody else's ever reach you. */
  getCalls(): CallsSnapshot;
  disconnect(): Promise<void>;
}

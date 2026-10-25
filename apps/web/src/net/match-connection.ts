import type { OffhandId, ProfessionId } from "@vibewars/game-core";
import type { CastRefusedMessage, ClientIntent, MapDescriptor } from "@vibewars/game-protocol";

/**
 * What a match looks like to the client, whoever runs it: the plain
 * snapshot/intent interface the renderer, the HUD and the input handler are
 * written against (ADR-0001).
 *
 * Kept apart from `match-client.ts`, which is the one Colyseus-backed
 * implementation and the only file in `apps/web` that imports
 * `@colyseus/sdk`, so another implementation (the Training Ground's local
 * simulation, #2 §4.3) can provide a `MatchConnection` without it.
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
  /** Weapon shots in flight, oldest first (#160). */
  readonly projectiles: readonly ProjectileSnapshot[];
}

/**
 * A ranged weapon's shot, as released: it flies from `from` to `to` over
 * `flightSeconds`, starting at `launchedAt` on the match clock.
 */
export interface ProjectileSnapshot {
  readonly id: number;
  /** The shooter's session id, for the side's tint. */
  readonly attackerId: string;
  /** The weapon at release, which picks the sprite. */
  readonly weaponId: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly launchedAt: number;
  readonly flightSeconds: number;
}

/** One slot of the server-assigned skill bar. */
export interface SkillSlot {
  readonly id: string;
  readonly name: string;
  readonly energyCost: number;
  readonly adrenalineCost: number;
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
}

/** One slot's recharge: `remaining` is 0 when the skill is ready. */
export interface SlotRecharge {
  readonly remaining: number;
  /** What the recharge started with, for the wipe's proportion. */
  readonly total: number;
}

export interface CombatMessage {
  readonly casterSessionId: string;
  /** What this was. Read this, never `skillId === ""`, to tell them apart. */
  readonly cause: "skill" | "weapon" | "degeneration";
  /** The skill, when `cause` is `"skill"`; `""` otherwise. */
  readonly skillId: string;
  /** The weapon, when `cause` is `"weapon"`; `""` otherwise (#162). */
  readonly weaponId: string;
  /** Where an area skill landed, and how far it reached (#5). */
  readonly area?: { readonly x: number; readonly y: number; readonly radius: number };
  readonly events: readonly {
    readonly kind: string;
    readonly targetId?: string;
    readonly amount?: number;
  }[];
}

/** What one `"combat"` message carries: a tick's entries, in combat-log order (#288). */
export interface CombatBatchMessage {
  readonly entries: readonly CombatMessage[];
}

export interface MatchConnection {
  readonly selfSessionId: string;
  /** Notifies when the connection drops and when it comes back. */
  onConnectionChange(handler: (state: "online" | "reconnecting" | "lost") => void): void;
  /** The match's static geometry, received once on join (brief §19). */
  readonly map: MapDescriptor;
  /** The server-assigned skill bar, received once on join. */
  readonly skillBar: readonly SkillSlot[];
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** Why the server refused one of this player's casts, sent to them alone. */
  onCastRefused(handler: (message: CastRefusedMessage) => void): void;
  /** This player's recharges right now, one entry per skill-bar slot (#152). */
  getRecharges(): readonly SlotRecharge[];
  disconnect(): Promise<void>;
}

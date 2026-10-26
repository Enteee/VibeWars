import {
  getSkill,
  isOffhandId,
  isProfessionId,
  isStatusId,
  type CombatEvent,
  type CombatLogEntry,
  type SkillBar,
} from "@vibewars/game-core";
import type {
  SkillBarSlot,
  WireCombat,
  WireCombatEvent,
  WirePlayer,
  WireProjectile,
  WireSnapshot,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
} from "./match-connection.js";

/**
 * Between game-core's shapes and the wire's (#375): the host flattens what
 * its simulation logged into wire messages, and a client turns the wire
 * messages, once validated, back into what the match view draws.
 */

/** The bar a client draws, every slot in its place, `null` where it is empty (#347). */
export function skillBarSlots(skillBar: SkillBar): (SkillBarSlot | null)[] {
  return skillBar.map((skillId) => {
    if (skillId === null) {
      return null;
    }
    const skill = getSkill(skillId);
    return {
      id: skillId,
      name: skill?.name ?? skillId,
      energyCost: skill?.cost?.kind === "energy" ? skill.cost.amount : 0,
      adrenalineCost: skill?.cost?.kind === "adrenaline" ? skill.cost.amount : 0,
      activationSeconds: skill?.activationSeconds ?? 0,
      rechargeSeconds: skill?.rechargeSeconds ?? 0,
    };
  });
}

function wireEvent(event: CombatEvent): WireCombatEvent {
  const none = {
    amount: null,
    skillId: null,
    statusId: null,
    durationSeconds: null,
    crit: null,
  };
  switch (event.kind) {
    case "damage":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        amount: event.amount,
        crit: event.critical,
      };
    case "heal":
    case "energy-gain":
    case "sacrifice":
      return { ...none, kind: event.kind, targetId: event.targetId, amount: event.amount };
    case "status-applied":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        statusId: event.statusId,
        durationSeconds: event.durationSeconds,
      };
    case "status-removed":
    case "status-expired":
      return { ...none, kind: event.kind, targetId: event.targetId, statusId: event.statusId };
    case "interrupted":
    case "cancelled":
      return { ...none, kind: event.kind, targetId: event.targetId, skillId: event.skillId };
    case "death":
    case "interrupt-missed":
    case "attack-missed":
    case "attack-blocked":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
      return { ...none, kind: event.kind, targetId: event.targetId };
  }
}

/**
 * A tick's combat log as the wire carries it, in log order, entries with
 * no events left out. A status tick goes out as its bearer's, with no
 * skill, a swing as its attacker's, as the server sends them.
 */
export function wireCombat(log: readonly CombatLogEntry[]): WireCombat[] {
  return log.flatMap((entry) => {
    const first = entry.events[0];
    if (first === undefined) {
      return [];
    }
    return [
      {
        casterId: (entry.cause === "degeneration" ? first.targetId : entry.sourceId) ?? "",
        cause: entry.cause,
        skillId: entry.skillId ?? "",
        weaponId: entry.weaponId ?? "",
        area: entry.area ?? null,
        events: entry.events.map(wireEvent),
      },
    ];
  });
}

/** A wire event back as game-core's, or `undefined` for one this client does not know. */
function combatEvent(event: WireCombatEvent): CombatEvent | undefined {
  const { targetId, amount, skillId, statusId, durationSeconds, crit } = event;
  if (targetId === null) {
    return undefined;
  }
  switch (event.kind) {
    case "damage":
      return amount === null || crit === null
        ? undefined
        : { kind: event.kind, targetId, amount, critical: crit };
    case "heal":
    case "energy-gain":
    case "sacrifice":
      return amount === null ? undefined : { kind: event.kind, targetId, amount };
    case "status-applied":
      return isStatusId(statusId) && durationSeconds !== null
        ? { kind: event.kind, targetId, statusId, durationSeconds }
        : undefined;
    case "status-removed":
    case "status-expired":
      return isStatusId(statusId) ? { kind: event.kind, targetId, statusId } : undefined;
    case "interrupted":
    case "cancelled":
      return skillId === null ? undefined : { kind: event.kind, targetId, skillId };
    case "death":
    case "interrupt-missed":
    case "attack-missed":
    case "attack-blocked":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
      return { kind: event.kind, targetId };
    default:
      return undefined;
  }
}

/** A validated wire combat entry as the client's `CombatMessage`; unknown events are dropped. */
export function combatMessage(combat: WireCombat): CombatMessage {
  const events = combat.events.flatMap((event) => combatEvent(event) ?? []);
  const message = {
    casterSessionId: combat.casterId,
    cause: combat.cause,
    skillId: combat.skillId,
    weaponId: combat.weaponId,
    events,
  };
  return combat.area === null ? message : { ...message, area: combat.area };
}

/** `null` on the wire, `undefined` in a snapshot. */
function absent<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

/**
 * Each `PlayerSnapshot` field from its `WirePlayer` field. Typed both ways,
 * so a field added to either type without the other does not compile.
 */
export function playerSnapshot(player: WirePlayer): PlayerSnapshot {
  return {
    sessionId: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing,
    targetSessionId: absent(player.targetId),
    attackTargetSessionId: absent(player.attackTargetId),
    walking: player.walking,
    health: player.health,
    maxHealth: player.maxHealth,
    energy: player.energy,
    maxEnergy: player.maxEnergy,
    adrenaline: player.adrenaline,
    armor: player.armor,
    weaponId: absent(player.weaponId),
    // One this client does not know draws as none, as the server's does.
    offhandId: isOffhandId(player.offhandId) ? player.offhandId : undefined,
    primaryProfession: isProfessionId(player.primaryProfession)
      ? player.primaryProfession
      : undefined,
    secondaryProfession: isProfessionId(player.secondaryProfession)
      ? player.secondaryProfession
      : undefined,
    team: player.team,
    dead: player.dead,
    castingSkillId: absent(player.castingSkillId),
    castRemaining: player.castRemaining,
    castTotal: player.castTotal,
    statuses: player.statuses,
  };
}

function projectileSnapshot(shot: WireProjectile): ProjectileSnapshot {
  return { ...shot };
}

/** A validated wire snapshot as the match view draws it, for `selfId`. */
export function matchSnapshot(snapshot: WireSnapshot, selfId: string): MatchSnapshot {
  return {
    selfSessionId: selfId,
    players: snapshot.players.map(playerSnapshot),
    scoreTeam0: snapshot.score[0],
    scoreTeam1: snapshot.score[1],
    elapsedSeconds: snapshot.elapsedSeconds,
    phase: snapshot.phase,
    winningTeam: absent(snapshot.winningTeam),
    endReason: absent(snapshot.endReason),
    projectiles: snapshot.projectiles.map(projectileSnapshot),
  };
}

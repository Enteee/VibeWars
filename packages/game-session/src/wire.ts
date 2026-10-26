import {
  energyCostOf,
  getSkill,
  isOffhandId,
  isProfessionId,
  isStatusId,
  STATUS_DEFINITIONS,
  type CombatEvent,
  type CombatLogEntry,
  type Combatant,
  type SkillBar,
  type StatusId,
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

/**
 * The status table (#632): every status id, sorted. A snapshot names a
 * status by its index here, and `wire-schema.json` carries the table, so
 * builds whose tables differ never meet.
 */
export const WIRE_STATUS_IDS: readonly StatusId[] = Object.keys(STATUS_DEFINITIONS)
  .filter(isStatusId)
  .sort();

const WIRE_STATUS_INDEX = new Map(WIRE_STATUS_IDS.map((id, index) => [id, index]));

/** `id`'s index in `WIRE_STATUS_IDS`. */
export function statusWireIndex(id: StatusId): number {
  const index = WIRE_STATUS_INDEX.get(id);
  if (index === undefined) {
    throw new Error(`status ${id} is not in the wire table`);
  }
  return index;
}

/** The status at `index` in `WIRE_STATUS_IDS`, or `undefined` past its end. */
export function statusFromWire(index: number): StatusId | undefined {
  return WIRE_STATUS_IDS[index];
}

/**
 * The bar a client draws, every slot in its place, `null` where it is
 * empty (#347). Energy costs are what `bearer` pays, Expertise and all
 * (#528).
 */
export function skillBarSlots(
  skillBar: SkillBar,
  bearer: Pick<Combatant, "attributeRanks">,
): (SkillBarSlot | null)[] {
  return skillBar.map((skillId) => {
    if (skillId === null) {
      return null;
    }
    const skill = getSkill(skillId);
    return {
      id: skillId,
      name: skill?.name ?? skillId,
      energyCost: skill === undefined ? 0 : energyCostOf(skill, bearer),
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
    case "knocked-down":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
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
        attributeId: entry.attributeId ?? "",
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
    case "knocked-down":
      return durationSeconds === null ? undefined : { kind: event.kind, targetId, durationSeconds };
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
    attributeId: combat.attributeId,
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
 * `undefined` for a status index past the table's end: malformed.
 */
export function playerSnapshot(player: WirePlayer): PlayerSnapshot | undefined {
  const statuses: StatusId[] = [];
  for (const index of player.statuses) {
    const status = statusFromWire(index);
    if (status === undefined) {
      return undefined;
    }
    statuses.push(status);
  }
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
    statuses,
  };
}

function projectileSnapshot(shot: WireProjectile): ProjectileSnapshot {
  return { ...shot, skillId: absent(shot.skillId) };
}

/** Every player in `snapshot`, or `undefined` if any is malformed. */
export function playerSnapshots(snapshot: WireSnapshot): PlayerSnapshot[] | undefined {
  const players: PlayerSnapshot[] = [];
  for (const wire of snapshot.players) {
    const player = playerSnapshot(wire);
    if (player === undefined) {
      return undefined;
    }
    players.push(player);
  }
  return players;
}

/**
 * A validated wire snapshot as the match view draws it, for `selfId`,
 * with its `players` from `playerSnapshots`.
 */
export function matchSnapshot(
  snapshot: WireSnapshot,
  players: readonly PlayerSnapshot[],
  selfId: string,
): MatchSnapshot {
  return {
    selfSessionId: selfId,
    players,
    scoreTeam0: snapshot.score[0],
    scoreTeam1: snapshot.score[1],
    elapsedSeconds: snapshot.elapsedSeconds,
    phase: snapshot.phase,
    winningTeam: absent(snapshot.winningTeam),
    endReason: absent(snapshot.endReason),
    projectiles: snapshot.projectiles.map(projectileSnapshot),
  };
}

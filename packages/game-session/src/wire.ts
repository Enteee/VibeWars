import {
  energyCostOf,
  getSkill,
  getStatusDefinition,
  isOffhandId,
  isProfessionId,
  isStatusId,
  STATUS_DEFINITIONS,
  type ActiveStatus,
  type CombatEvent,
  type CombatLogEntry,
  type RankHolder,
  type SkillBar,
  type StatusCategory,
  type StatusId,
} from "@vibewars/game-core";
import {
  MAX_WIRE_STATUSES,
  type SkillBarSlot,
  type WireCombat,
  type WireCombatEvent,
  type WirePlayer,
  type WireProjectile,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  MatchSnapshot,
  PlayerSnapshot,
  ProjectileSnapshot,
  StatusSnapshot,
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
 * Which statuses a snapshot keeps first, lowest first: conditions and
 * hexes are what a player removes and reacts to (GW1's monitor), an
 * enchantment is what a foe strips.
 */
const WIRE_STATUS_RANK: Readonly<Record<StatusCategory, number>> = {
  condition: 0,
  hex: 1,
  enchantment: 2,
  stance: 3,
  preparation: 4,
  glyph: 5,
  "weapon-spell": 6,
  shout: 7,
  chant: 8,
  "skill-effect": 9,
};

function wireStatusRank(id: StatusId): number {
  return WIRE_STATUS_RANK[getStatusDefinition(id).category];
}

/**
 * The statuses a snapshot carries for one player (#636): at most
 * `MAX_WIRE_STATUSES`, kept by `WIRE_STATUS_RANK`, then the least time
 * left, then the id. A client refuses a whole snapshot past the cap, so the
 * rest stay off the wire; the simulation still applies them. The ones kept
 * go in the order applied, oldest first (#803).
 */
export function wireStatuses(active: readonly ActiveStatus[]): ActiveStatus[] {
  const kept = new Set(
    [...active]
      .sort(
        (a, b) =>
          wireStatusRank(a.id) - wireStatusRank(b.id) ||
          a.remainingSeconds - b.remainingSeconds ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, MAX_WIRE_STATUSES),
  );
  return active.filter((status) => kept.has(status));
}

/** Seconds to the 0.1 s a status's times go on the wire in. */
function tenths(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * One status as a snapshot carries it (#803): when it runs out on the
 * match clock, how long it was applied for, and who applied it. One with
 * no end of its own is what its bearer bears while activating
 * (`whileActivating`): it ends with `cast`, so it takes the cast's times.
 * A duration under 0.05 s still goes as 0.1, as the wire refuses one of
 * nothing.
 */
export function statusSnapshot(
  status: ActiveStatus,
  elapsedSeconds: number,
  cast: { readonly remainingSeconds: number; readonly totalSeconds: number } | undefined,
): StatusSnapshot {
  const [remaining, duration] = Number.isFinite(status.remainingSeconds)
    ? [status.remainingSeconds, status.durationSeconds]
    : [cast?.remainingSeconds ?? 0, cast?.totalSeconds ?? 0];
  return {
    id: status.id,
    endsAt: tenths(elapsedSeconds + remaining),
    durationSeconds: Math.max(0.1, tenths(duration)),
    casterId: status.sourceId,
  };
}

/**
 * The bar a client draws, every slot in its place, `null` where it is
 * empty (#347). Energy costs are what `bearer` pays right now, Expertise
 * (#528) at its weakened rank (#762) and an active glyph (#637) and all.
 */
export function skillBarSlots(skillBar: SkillBar, bearer: RankHolder): (SkillBarSlot | null)[] {
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

/**
 * Whether two bars draw the same, slot by slot, by value (#637): the host
 * and the Training Ground send a bar again only when this says it changed.
 */
export function sameSkillBar(
  a: readonly (SkillBarSlot | null)[],
  b: readonly (SkillBarSlot | null)[],
): boolean {
  return (
    a.length === b.length &&
    a.every((slot, index) => {
      const other = b[index];
      if (slot === null || other === null || other === undefined) {
        return slot === other;
      }
      return (
        slot.id === other.id &&
        slot.name === other.name &&
        slot.energyCost === other.energyCost &&
        slot.adrenalineCost === other.adrenalineCost &&
        slot.activationSeconds === other.activationSeconds &&
        slot.rechargeSeconds === other.rechargeSeconds
      );
    })
  );
}

function wireEvent(event: CombatEvent): WireCombatEvent {
  const none = {
    amount: null,
    skillId: null,
    statusId: null,
    durationSeconds: null,
    crit: null,
    fromId: null,
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
    case "energy-loss":
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
    case "health-lost":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        amount: event.amount,
        statusId: event.statusId,
      };
    case "status-spread":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        statusId: event.statusId,
        fromId: event.fromId,
      };
    case "interrupted":
    case "cancelled":
      return { ...none, kind: event.kind, targetId: event.targetId, skillId: event.skillId };
    case "interrupt-missed":
      return { ...none, kind: event.kind, targetId: event.targetId, skillId: event.refusedSkillId };
    case "death":
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
        doubleStrike: entry.doubleStrike,
        events: entry.events.map(wireEvent),
      },
    ];
  });
}

/** A wire event back as game-core's, or `undefined` for one this client does not know. */
function combatEvent(event: WireCombatEvent): CombatEvent | undefined {
  const { targetId, amount, skillId, statusId, durationSeconds, crit, fromId } = event;
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
    case "energy-loss":
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
    case "health-lost":
      return isStatusId(statusId) && amount !== null
        ? { kind: event.kind, targetId, amount, statusId }
        : undefined;
    case "status-spread":
      return isStatusId(statusId) && fromId !== null
        ? { kind: event.kind, targetId, fromId, statusId }
        : undefined;
    case "interrupted":
    case "cancelled":
      return skillId === null ? undefined : { kind: event.kind, targetId, skillId };
    case "interrupt-missed":
      return { kind: event.kind, targetId, refusedSkillId: skillId };
    case "death":
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
    doubleStrike: combat.doubleStrike,
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
  const statuses: StatusSnapshot[] = [];
  for (const { status: index, ...times } of player.statuses) {
    const id = statusFromWire(index);
    if (id === undefined) {
      return undefined;
    }
    statuses.push({ id, ...times });
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
    swingElapsed: player.swingElapsed,
    swingTotal: player.swingTotal,
    knockdownRemaining: player.knockdownRemaining,
    healthPips: player.healthPips,
    energyPips: player.energyPips,
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

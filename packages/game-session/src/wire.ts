import {
  companionMode,
  energyCostOf,
  getSkill,
  getStatusDefinition,
  isOffhandId,
  isProfessionId,
  isStatusId,
  resolvedBar,
  STATUS_DEFINITIONS,
  type ActiveStatus,
  type CastState,
  type CombatEvent,
  type CombatLogEntry,
  type CarriedObject,
  type FlagPlace,
  type FlagState,
  type RelicState,
  type GroundAct,
  type GroundEffect,
  type Participant,
  type ProfessionId,
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
  type WireCarried,
  type WireFlag,
  type WireRelic,
  type WireCape,
  type WirePlayer,
  type WireProjectile,
  type WireSnapshot,
  type WireWeaponSets,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  GroundEffectSnapshot,
  MatchSnapshot,
  ObservedSnapshot,
  ArmedAttackSnapshot,
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
 * status by its index here, and `src/wire-schema.json` carries the table, so
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
  form: 3,
  stance: 4,
  preparation: 5,
  glyph: 6,
  "weapon-spell": 7,
  shout: 8,
  chant: 9,
  echo: 10,
  "skill-effect": 11,
  item: 12,
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
          // Compared, not subtracted: two with no end (#837) are equal, not NaN.
          compare(a.remainingSeconds, b.remainingSeconds) ||
          compare(a.id, b.id),
      )
      .slice(0, MAX_WIRE_STATUSES),
  );
  return active.filter((status) => kept.has(status));
}

/** -1, 0 or 1 as `a` sorts before, with or after `b`. */
function compare<T extends number | string>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Seconds to the 0.1 s a status's times go on the wire in. */
function tenths(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * One status as a snapshot carries it (#803): when it runs out on the
 * match clock, how long it was applied for, and who applied it. One its
 * bearer bears while activating (`whileActivating`) ends with `cast`, so
 * it takes the cast's times.
 * A maintained enchantment (#837), a spirit's aura (#1064) and any other
 * status with no end, as Faithful Intervention (#1789), have no end at
 * all: both times `null`.
 * A duration under 0.05 s still goes as 0.1, as the wire refuses one of
 * nothing.
 */
export function statusSnapshot(
  status: ActiveStatus,
  elapsedSeconds: number,
  cast:
    | {
        readonly remainingSeconds: number;
        readonly totalSeconds: number;
        readonly whileActivating: StatusId | undefined;
      }
    | undefined,
): StatusSnapshot {
  const endless = !Number.isFinite(status.remainingSeconds);
  const borne = endless && cast?.whileActivating === status.id ? cast : undefined;
  if (status.maintained !== null || status.projected || (endless && borne === undefined)) {
    return { id: status.id, endsAt: null, durationSeconds: null, casterId: status.sourceId };
  }
  const [remaining, duration] =
    borne !== undefined
      ? [borne.remainingSeconds, borne.totalSeconds]
      : [status.remainingSeconds, status.durationSeconds];
  return {
    id: status.id,
    endsAt: tenths(elapsedSeconds + remaining),
    durationSeconds: Math.max(0.1, tenths(duration)),
    casterId: status.sourceId,
  };
}

/**
 * A companion's armed pet attack as a snapshot carries it (#1167): when
 * it lapses on the match clock, to the 0.1 s; `null` when none is armed.
 */
export function armedAttackSnapshot(
  armedAttack: Participant["armedAttack"],
  elapsedSeconds: number,
): ArmedAttackSnapshot | null {
  return armedAttack === undefined
    ? null
    : {
        skillId: armedAttack.skillId,
        endsAt: tenths(elapsedSeconds + armedAttack.remainingSeconds),
      };
}

/**
 * A ground effect as the wire carries it (#1087): when it ends on the
 * match clock and how long it was placed for, both to 0.1 s, the latter
 * never under it, as the wire refuses one of nothing. A ward's circle is
 * its aura's reach; a trap's (#1105), the area its spring hits; a
 * pulse's (#1113), the area each pulse hits.
 */
export function groundEffectSnapshot(
  effect: Readonly<GroundEffect>,
  elapsedSeconds: number,
): GroundEffectSnapshot {
  return {
    id: effect.id,
    skillId: effect.skillId,
    team: effect.team,
    x: effect.position.x,
    y: effect.position.y,
    radius: groundRadius(effect.act),
    endsAt: tenths(elapsedSeconds + effect.remainingSeconds),
    durationSeconds: Math.max(0.1, tenths(effect.durationSeconds)),
  };
}

/** The circle a ground effect draws: what its act reaches. */
function groundRadius(act: GroundAct): number {
  switch (act.kind) {
    case "aura":
      return act.aura.radius;
    case "trap":
      return act.trap.spring.area.radius;
    case "pulse":
      return act.pulse.area.radius;
  }
}

/**
 * The bar a client draws, every slot in its place, `null` where it is
 * empty (#347): `skillBar` as `resolvedBar` has it, a copy standing in a
 * slot (#469) drawn there, with the match clock it ends at (#1154). Energy
 * costs are what `bearer` pays right now, Expertise (#528) at its weakened
 * rank (#762) and an active glyph (#637) and all.
 */
export function skillBarSlots(
  skillBar: SkillBar,
  cast: Pick<CastState, "overrides">,
  bearer: RankHolder,
  elapsedSeconds: number,
): (SkillBarSlot | null)[] {
  return resolvedBar(skillBar, cast).map((held, slot) => {
    if (held === null) {
      return null;
    }
    const { skillId } = held;
    const skill = getSkill(skillId);
    const copy = cast.overrides.get(slot);
    return {
      id: skillId,
      name: skill?.name ?? skillId,
      energyCost: skill === undefined ? 0 : energyCostOf(skill, bearer),
      adrenalineCost: skill?.cost?.kind === "adrenaline" ? skill.cost.amount : 0,
      activationSeconds: skill?.activationSeconds ?? 0,
      rechargeSeconds: skill?.rechargeSeconds ?? 0,
      copyEndsAt: copy === undefined ? null : tenths(elapsedSeconds + copy.remainingSeconds),
    };
  });
}

/**
 * The weapon sets `participant` carries, as its own client sees them
 * (#489): set 1 first, `null` where one is empty, and which is in hand or
 * queued.
 */
export function wireWeaponSets(participant: Participant): WireWeaponSets {
  return {
    sets: participant.weaponSets.map((set) =>
      set === null
        ? null
        : {
            weaponId: set.equipment.mainHand.weapon.id,
            offhandId: set.equipment.offhandId ?? null,
          },
    ),
    active: participant.activeWeaponSet,
    pending: participant.pendingWeaponSet ?? null,
  };
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
        slot.rechargeSeconds === other.rechargeSeconds &&
        slot.copyEndsAt === other.copyEndsAt
      );
    })
  );
}

/**
 * `event` as the wire carries it, or `undefined` for what only the
 * Training Ground log reads (#1735): a use, adrenaline, a skipped effect.
 */
function wireEvent(event: CombatEvent): WireCombatEvent | undefined {
  const none = {
    amount: null,
    skillId: null,
    statusId: null,
    durationSeconds: null,
    crit: null,
    fromId: null,
    energy: null,
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
    case "health-loss":
    case "life-stolen":
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
    case "skill-disabled":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        skillId: event.skillId,
        durationSeconds: event.seconds,
      };
    case "recharge-lengthened":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        skillId: event.skillId,
        durationSeconds: event.seconds,
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
    case "upkeep-lost":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        statusId: event.statusId,
        fromId: event.casterId,
      };
    case "shadow-stepped":
    case "teleported":
    case "companion-stepped":
      return { ...none, kind: event.kind, targetId: event.targetId, fromId: event.toId };
    case "shadow-swapped":
      return { ...none, kind: event.kind, targetId: event.targetId, fromId: event.withId };
    case "interrupted":
    case "cancelled":
    case "spell-failed":
      return { ...none, kind: event.kind, targetId: event.targetId, skillId: event.skillId };
    case "interrupt-missed":
      return { ...none, kind: event.kind, targetId: event.targetId, skillId: event.refusedSkillId };
    case "resurrected":
      return {
        ...none,
        kind: event.kind,
        targetId: event.targetId,
        amount: event.healthFraction,
        energy: event.energyFraction,
      };
    case "attack-missed":
      // Out of sequence (#831) rides as a kind of its own, so no field
      // every event carries grows for it.
      return {
        ...none,
        kind: event.reason === "out-of-sequence" ? "attack-out-of-sequence" : event.kind,
        targetId: event.targetId,
      };
    case "creature-destroyed":
    case "death":
    case "attack-blocked":
    case "invulnerable":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
    case "attack-interrupted":
    case "shadow-stepped-away":
    case "shadow-stepped-back":
      return { ...none, kind: event.kind, targetId: event.targetId };
    case "skill-used":
    case "adrenaline-gained":
    case "effect-skipped":
      return undefined;
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
    const events = entry.events.flatMap((event) => wireEvent(event) ?? []);
    if (first === undefined || events.length === 0) {
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
        events,
      },
    ];
  });
}

/** A wire event back as game-core's, or `undefined` for one this client does not know. */
function combatEvent(event: WireCombatEvent): CombatEvent | undefined {
  const { targetId, amount, skillId, statusId, durationSeconds, crit, fromId, energy } = event;
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
    case "health-loss":
    case "life-stolen":
      return amount === null ? undefined : { kind: event.kind, targetId, amount };
    case "status-applied":
      return isStatusId(statusId)
        ? { kind: event.kind, targetId, statusId, durationSeconds }
        : undefined;
    case "upkeep-lost":
      return isStatusId(statusId) && fromId !== null
        ? { kind: event.kind, targetId, statusId, casterId: fromId }
        : undefined;
    case "knocked-down":
      return durationSeconds === null ? undefined : { kind: event.kind, targetId, durationSeconds };
    case "skill-disabled":
    case "recharge-lengthened":
      return skillId === null || durationSeconds === null
        ? undefined
        : { kind: event.kind, targetId, skillId, seconds: durationSeconds };
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
    case "shadow-stepped":
    case "teleported":
    case "companion-stepped":
      return fromId === null ? undefined : { kind: event.kind, targetId, toId: fromId };
    case "shadow-swapped":
      return fromId === null ? undefined : { kind: event.kind, targetId, withId: fromId };
    case "interrupted":
    case "cancelled":
    case "spell-failed":
      return skillId === null ? undefined : { kind: event.kind, targetId, skillId };
    case "interrupt-missed":
      return { kind: event.kind, targetId, refusedSkillId: skillId };
    case "resurrected":
      return amount === null || energy === null
        ? undefined
        : { kind: event.kind, targetId, healthFraction: amount, energyFraction: energy };
    case "attack-out-of-sequence":
      return { kind: "attack-missed", targetId, reason: "out-of-sequence" };
    case "attack-missed":
    case "creature-destroyed":
    case "death":
    case "attack-blocked":
    case "invulnerable":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
    case "attack-interrupted":
    case "shadow-stepped-away":
    case "shadow-stepped-back":
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
 * A flag (#1225) or a relic (#1374) as the wire carries it: a team it
 * has no colour for is not sent.
 */
export function wireCarried<Place extends FlagPlace>({
  team,
  place,
}: CarriedObject<Place>): WireCarried<Place["kind"]> | undefined {
  if (team !== 0 && team !== 1) {
    return undefined;
  }
  const where: FlagPlace = place;
  return {
    team,
    place: place.kind,
    carrierId: where.kind === "carried" ? where.carrierId : null,
    x: where.kind === "ground" ? where.position.x : null,
    y: where.kind === "ground" ? where.position.y : null,
  };
}

/** A validated wire relic as game-core's (#1374): a bundle's three places. */
function relicState({ team, place, carrierId, x, y }: WireRelic): RelicState {
  switch (place) {
    case "carried":
      return { team, place: { kind: "carried", carrierId: carrierId ?? "" } };
    case "ground":
      return { team, place: { kind: "ground", position: { x: x ?? 0, y: y ?? 0 } } };
    case "spawn":
      return { team, place: { kind: "spawn" } };
  }
}

/** A validated wire flag as game-core's (#1225): a relic's places, and the stand. */
function flagState(flag: WireFlag): FlagState {
  const { team, place } = flag;
  return place === "stand" ? { team, place: { kind: "stand" } } : relicState({ ...flag, place });
}

/** The fields of a body's `WirePlayer` that say who it is, not how it stands. */
export type WireIdentity = Pick<
  WirePlayer,
  | "name"
  | "guildTag"
  | "guildCape"
  | "team"
  | "primaryProfession"
  | "secondaryProfession"
  | "creature"
  | "bot"
>;

/** What a seat says about who sits in it. */
export interface SeatIdentity {
  readonly name: string;
  /** `null` for none (#1406). */
  readonly guildTag: string | null;
  /** `null` for none (#1422). */
  readonly guildCape: WireCape | null;
  readonly team: 0 | 1;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  /** A lobby's bot sits in it (#1193). */
  readonly bot: boolean;
}

/**
 * Who a body on the wire is: a seat's player, or a creature (#1052),
 * named for its kind, on its owner's team, with no professions; a map's
 * NPC (#1186) on its own. `undefined` for a body with no seat that is
 * neither a seated player's creature nor a map's: it is not sent. A
 * companion's armed pet attack lapses at `elapsedSeconds` on.
 */
export function wireIdentity(
  participant: Pick<Participant, "id" | "creature" | "armedAttack"> & {
    readonly combatant: { readonly team: number };
  },
  seats: ReadonlyMap<string, SeatIdentity>,
  elapsedSeconds: number,
): WireIdentity | undefined {
  const seat = seats.get(participant.id);
  if (seat !== undefined) {
    return {
      name: seat.name,
      guildTag: seat.guildTag,
      guildCape: seat.guildCape,
      team: seat.team,
      primaryProfession: seat.primaryProfession,
      secondaryProfession: seat.secondaryProfession ?? null,
      creature: null,
      bot: seat.bot,
    };
  }
  const { creature } = participant;
  if (creature === undefined) {
    return undefined;
  }
  const { team } = participant.combatant;
  const ownTeam = team === 0 || team === 1 ? team : undefined;
  const sentTeam = creature.ownerId === undefined ? ownTeam : seats.get(creature.ownerId)?.team;
  return sentTeam === undefined
    ? undefined
    : {
        name: creature.name,
        guildTag: null,
        guildCape: null,
        team: sentTeam,
        primaryProfession: null,
        secondaryProfession: null,
        creature: {
          ownerId: creature.ownerId ?? null,
          kind: creature.kind,
          look: creature.look,
          mode: companionMode(creature),
          armedAttack: armedAttackSnapshot(participant.armedAttack, elapsedSeconds),
          leaderId: creature.leaderId ?? null,
        },
        bot: false,
      };
}

/**
 * Each `PlayerSnapshot` field from its `WirePlayer` field. Typed both ways,
 * so a field added to either type without the other does not compile.
 * `undefined` for a status index past the table's end, or an armed
 * attack that is not a pet attack this build knows (#1167): malformed.
 */
export function playerSnapshot(player: WirePlayer): PlayerSnapshot | undefined {
  const armed = player.creature?.armedAttack ?? null;
  if (armed !== null && getSkill(armed.skillId)?.type !== "pet-attack") {
    return undefined;
  }
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
    guildTag: absent(player.guildTag),
    guildCape: absent(player.guildCape),
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
    overcast: player.overcast,
    morale: player.morale,
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
    corpseExploited: player.corpseExploited,
    castingSkillId: absent(player.castingSkillId),
    castRemaining: player.castRemaining,
    castTotal: player.castTotal,
    swingElapsed: player.swingElapsed,
    swingTotal: player.swingTotal,
    knockdownRemaining: player.knockdownRemaining,
    invulnerableSeconds: player.invulnerableSeconds,
    healthPips: player.healthPips,
    energyPips: player.energyPips,
    statuses,
    creature: player.creature ?? undefined,
    bot: player.bot,
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
    ...observedSnapshot(snapshot, players),
    // Only the host's `"traps"` carries them (#1105).
    traps: [],
  };
}

/** A validated wire snapshot as a viewer sees it (#480): `matchSnapshot` without a self. */
export function observedSnapshot(
  snapshot: WireSnapshot,
  players: readonly PlayerSnapshot[],
): ObservedSnapshot {
  return {
    players,
    scoreTeam0: snapshot.score[0],
    scoreTeam1: snapshot.score[1],
    elapsedSeconds: snapshot.elapsedSeconds,
    phase: snapshot.phase,
    winningTeam: absent(snapshot.winningTeam),
    endReason: absent(snapshot.endReason),
    projectiles: snapshot.projectiles.map(projectileSnapshot),
    groundEffects: snapshot.groundEffects,
    flags: snapshot.flags.map(flagState),
    stand:
      snapshot.stand === null
        ? undefined
        : { holder: absent(snapshot.stand.holder), heldSeconds: snapshot.stand.heldSeconds },
    aggression: snapshot.aggression,
    relics: snapshot.relics.map(relicState),
    altar: absent(snapshot.altar),
    altarHolder: absent(snapshot.altarHolder),
    altarHeldSeconds: snapshot.altarHeldSeconds,
    capturePoints: snapshot.capturePoints.map(({ x, y, owner, capturer, progress }) => ({
      position: { x, y },
      owner,
      capturer,
      progress,
    })),
    // Only the host's `ended` carries it.
    summary: undefined,
  };
}

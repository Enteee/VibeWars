import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  MatchTally,
  ZERO,
  adrenalineLossIn,
  applyIntent,
  drainAccumulator,
  loadoutOf,
  resolveJoinLoadout,
  loadoutSpec,
  raisedMaxEnergy,
  raisedMaxHealth,
  resolveLoadout,
  spawnFacing,
  swingProgress,
  type MatchMode,
  type JoinLoadout,
  type MatchRules,
  type Participant,
  type PlayerBuild,
  type ProfessionId,
  type Segment,
  type FlagField,
  type RelicField,
  type HillField,
  type Vec2,
  type GuildLord,
  type BaseGuard,
  type Shrine,
} from "@vibewars/game-core";
import {
  MAX_WIRE_COMBATS,
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_GROUND_EFFECTS,
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  helloProtocolVersion,
  parseClientIntent,
  parsePeerBye,
  parsePeerCall,
  parsePeerHello,
  parsePeerObserve,
  parsePeerRejoinProof,
  type AdrenalineMessage,
  type ChainMarksMessage,
  type WireChainMark,
  type MapDescriptor,
  type PeerHello,
  type PeerObserving,
  type PeerRefuse,
  type PeerRejoinChallenge,
  type PeerWelcome,
  type RechargeMessage,
  type SkillBarSlot,
  type WireCombatBatch,
  type WireEnded,
  type WirePlayer,
  type WireSkillBar,
  type WireSnapshot,
  type WireSnapshotPart,
  type WireTraps,
  type WireCape,
  type WireSummaryRow,
} from "@vibewars/game-protocol";

import { createCallBoard, type Team } from "./calls.js";
import { packCombat } from "./combat-batches.js";
import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import { NO_GUILD, sanitizeGuild, sanitizeName, type Guild } from "./names.js";
import { adrenalineSlots, sameAdrenaline } from "./adrenaline.js";
import { chainMarks, chainMarksPredicted } from "./chain-marks.js";
import { rechargePredicted, rechargeState } from "./recharge.js";
import { rejoinProof } from "./rejoin-proof.js";
import { packSnapshot } from "./snapshot-parts.js";
import { spawnPoint, type SpawnPoint } from "./spawn-points.js";
import { MAX_MESSAGE_BYTES, type Transport } from "./transport.js";
import {
  groundEffectSnapshot,
  wireCarried,
  sameSkillBar,
  skillBarSlots,
  statusSnapshot,
  statusWireIndex,
  wireCombat,
  wireStatuses,
  wireIdentity,
  wireWeaponSets,
  type WireIdentity,
} from "./wire.js";

/**
 * A match hosted in one player's browser (#15, #375): the same
 * `MatchSimulation` the server's room runs, over a `Transport`. Peers say
 * `hello` to be seated, send intents, and get the whole match back every
 * tick. The host's own player is one more peer (`createLocalPeer`).
 *
 * Nothing here reads a clock: whoever drives it calls `advance` with the
 * time that passed, a test by hand, a Worker in a page (#15 phase 4).
 */

export const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;

const TICK_SECONDS = 1 / RULESET.tickRateHz;

/**
 * How long a dropped player keeps their seat, character and position.
 * Long enough to survive a wifi blip or a laptop lid, short enough that a
 * quit does not leave a ghost standing in the arena.
 */
export const RECONNECT_WINDOW_SECONDS = 30;

/**
 * How far behind the match a lobby spectator watches it (#480): long
 * enough that a spectator on voice with a team tells it nothing it could
 * still act on.
 */
export const OBSERVER_DELAY_SECONDS = 10;

/** What the players are shown when the host turns them away. */
export const MATCH_FULL_MESSAGE = "This match is full.";
export const MATCH_OVER_MESSAGE = "This match is over.";
export const NOT_A_SPECTATOR_MESSAGE = "Only a spectator may watch this match.";
export const WRONG_MATCH_MESSAGE = "That match is not being played any more.";

/** The arena, already built from game-maps by the caller: game-session does not depend on it. */
export interface HostMap {
  readonly descriptor: MapDescriptor;
  /** The mode its matches play (#476): the caller builds `matchRules` from it. */
  readonly mode: MatchMode;
  readonly walls: readonly Segment[];
  readonly bounds: { readonly width: number; readonly height: number };
  readonly spawns: readonly SpawnPoint[];
  /** Its resurrection shrines (#1186), `[]` but on a Priest Annihilation or Guild Battle map. */
  readonly shrines: readonly Shrine[];
  /** Its Guild Lords (#1222), `[]` but on a Guild Battle map. */
  readonly guildLords: readonly GuildLord[];
  /** Its flag stand and flag spawns (#1225), `undefined` but on a Guild Battle map. */
  readonly flagField: FlagField | undefined;
  /** Its altar and relic spawns (#1374), `undefined` but on a Relic Run map. */
  readonly relicField: RelicField | undefined;
  /** Its altar and ghost spawns (#1377), `undefined` but on a King of the Hill map. */
  readonly hillField: HillField | undefined;
  /** Its shrines (#1378), `[]` but on a Capture Points map. */
  readonly capturePoints: readonly Vec2[];
  /** Its base guards (#1223), in the map's order, `[]` but on a Guild Battle map. */
  readonly guards: readonly BaseGuard[];
}

export interface MatchHostOptions {
  /** The room every peer is in. */
  readonly transport: Transport;
  readonly map: HostMap;
  readonly seed: string;
  readonly matchRules: MatchRules;
  /**
   * In [0, 1), for rejoin tokens and challenges; injected so a test is
   * reproducible. A token is all that stands between a seat and whoever
   * guesses it, so in a page this must come from `crypto.getRandomValues`,
   * never `Math.random`.
   */
  readonly random: () => number;
  readonly maxPlayers: number;
  /**
   * Who may play, by peer id, on which team and under which name: the
   * lobby decided (#379). Anyone else is refused `match-full`. `null`
   * seats whoever says hello, on alternating teams.
   */
  readonly seats: PlannedSeats | null;
  /** The lobby's id for it (#480): an `observe` naming another is refused. */
  readonly matchId: string;
  /**
   * Whether `peerId` is a lobby member on no team (#480), who may watch
   * the match, `OBSERVER_DELAY_SECONDS` late. Asked on every `observe`.
   */
  readonly isSpectator: (peerId: string) => boolean;
}

/**
 * A lobby's seating for its match: each seated peer's team, sanitised
 * name and guild tag (#1406), keyed by its lobby id. `build` is the one
 * the host assigned, which the seat plays whatever its hello says: a
 * bot's (#1193), and every seat's in a Team Lobby (#1458). `null` plays
 * the hello's.
 */
export type PlannedSeats = ReadonlyMap<string, PlannedSeat>;

export type PlannedSeat = {
  readonly team: 0 | 1;
  readonly name: string;
  readonly guildTag: string | null;
  readonly guildCape: WireCape | null;
} & (
  | { readonly bot: true; readonly build: PlayerBuild }
  | { readonly bot: false; readonly build: PlayerBuild | null }
);

/** Weapon swaps one seat may have handled (#489): sustained, and at once. */
export const WEAPON_SWAPS_PER_SECOND = 4;
export const WEAPON_SWAP_BURST = 4;

export interface MatchHost {
  /** Run as many whole ticks as `seconds` holds, carrying the rest. */
  advance(seconds: number): void;
  readonly phase: "active" | "finished";
  /** The team that won, once it is `finished` with a winner; `null` until then, or for none. */
  readonly winningTeam: 0 | 1 | null;
  /**
   * A lobby's match nobody is playing any more: every seat is gone, and
   * every seated peer that never came has left the room. The lobby then
   * ends it, as the server did with a room everyone left.
   */
  readonly abandoned: boolean;
  /** Weapon-set intents dropped over `WEAPON_SWAPS_PER_SECOND` (#489), every seat together. */
  readonly droppedWeaponSwaps: number;
  /**
   * Finished, and its observers not yet sent the end, which reaches them
   * `OBSERVER_DELAY_SECONDS` late (#480): keep advancing it until then.
   */
  readonly draining: boolean;
  /**
   * The room is the next match's now (#480): a draining match answers
   * nobody again, so it never turns away a player or a viewer of the one
   * after it on the same channels. Only its observers' stream runs on,
   * and a bye or a leave from one of them. One who says hello to, or
   * observes, the next match is in that one's stream instead.
   */
  retire(): void;
  /** Tell every peer the match is over because the host left, then leave. */
  close(reason: "host-left"): Promise<void>;
}

/** One player's place in the match, held through a drop. */
interface Seat {
  readonly playerId: string;
  readonly team: 0 | 1;
  readonly name: string;
  /** Sanitised (#1406); `null` for none, and for a bot. */
  readonly guildTag: string | null;
  /** Sanitised (#1422); `null` for none, and whenever `guildTag` is. */
  readonly guildCape: WireCape | null;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  /** A bot plays it (#1193): no peer ever, nothing sent to one. */
  readonly bot: boolean;
  /**
   * The adrenaline the peer was last sent, and the combat it counted its
   * loss from, so only a change goes (#463, #828).
   */
  adrenaline: { readonly slots: readonly number[]; readonly lastCombatAt: number } | undefined;
  /** The peer playing it; `undefined` while it is dropped. */
  peerId: string | undefined;
  /** What the peer proves it holds, by `rejoinProof`, to take the seat back. */
  token: string;
  /** The match time it dropped at, while it is dropped. */
  droppedAt: number | undefined;
  /** The recharges the peer was last told, and when, so only news is sent (#152). */
  recharges: { readonly message: RechargeMessage; readonly at: number } | undefined;
  /** The chain marks the peer was last told, and when, so only news is sent (#916). */
  chainMarks: { readonly marks: readonly WireChainMark[]; readonly at: number } | undefined;
  /** The bar the peer was last sent, so it goes again only when it changes (#637). */
  skillBar: readonly (SkillBarSlot | null)[] | undefined;
  /** The active and queued weapon set the peer was last told, so only a change goes (#489). */
  weaponSets: { readonly active: number; readonly pending: number | null } | undefined;
}

/** A rejoin hello the host has challenged, waiting for its proof (#593). */
interface Challenge {
  readonly playerId: string;
  readonly nonce: string;
  readonly hello: PeerHello;
}

/** One tick as the players were sent it, held for the observers (#480). */
interface Delayed {
  /** `streamTick` when it was played. */
  readonly at: number;
  readonly snapshot: readonly WireSnapshotPart[];
  readonly combat: readonly WireCombatBatch[];
  /** The match ended on this tick. */
  readonly ended: WireEnded | undefined;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function wireTeam(team: number | null | undefined): 0 | 1 | null {
  return team === 0 || team === 1 ? team : null;
}

export function createMatchHost(options: MatchHostOptions): MatchHost {
  const { transport, map, random, maxPlayers, seats: planned } = options;
  const sim = new MatchSimulation({
    seed: options.seed,
    ruleset: RULESET,
    matchRules: options.matchRules,
    walls: map.walls,
    bounds: map.bounds,
    shrines: map.shrines,
    guildLords: map.guildLords,
    flagField: map.flagField,
    relicField: map.relicField,
    hillField: map.hillField,
    capturePoints: map.capturePoints,
    guards: map.guards,
  });
  const seats = new Map<string, Seat>();
  const seatOfPeer = new Map<string, Seat>();
  const budget = new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST, () => undefined);
  /**
   * Weapon swaps, by player, on top of `budget` (#489): each moves energy,
   * rewrites the gear and costs a `weapon-sets` send. Keyed by seat, so a
   * reconnect does not refill it.
   */
  const swapBudget = new MessageBudget(WEAPON_SWAPS_PER_SECOND, WEAPON_SWAP_BURST, () => undefined);
  let droppedWeaponSwaps = 0;
  /**
   * The peers that said `bye`, until they leave the room. A quit is never
   * undone by a fresh `hello`: that would be a free heal, a cooldown reset
   * and a team re-roll, as often as the budget allows.
   */
  const departed = new Set<string>();
  /**
   * The planned peers that have not said hello yet, while they are in the
   * room. A bot never says one: it is seated at once.
   */
  const awaited = new Set(
    [...(planned ?? [])].flatMap(([peerId, plan]) => (plan.bot ? [] : [peerId])),
  );
  /** At most one per peer: a new rejoin hello kills the old nonce. */
  const challenges = new Map<string, Challenge>();
  /**
   * The proof being checked for each peer, until it leaves the room: only
   * the latest of a peer's proofs may seat it.
   */
  const proving = new Map<string, object>();
  /** Each team's called foe and pings (#443), shown to that team alone. */
  const calls = createCallBoard(map.bounds);
  /**
   * The teams a call changed since the last tick (#730). Their views go out
   * once, in `tick`, so a peer flooding calls costs one send per teammate
   * per tick, whatever it sends.
   */
  const callsDirty = new Set<Team>();
  /** The trap ids each team was last sent (#1105), to send again only on a change. */
  const trapsSent = new Map<Team, string>([
    [0, ""],
    [1, ""],
  ]);
  let seated = 0;
  /**
   * The seats the match had, in seat order: whoever left still has a line
   * in the summary (#1057), under the name they joined with. At most
   * `MAX_LOBBY_PLAYERS`, all `ended` carries: past it, the earliest seat
   * no longer held goes (`seatNew`).
   */
  const everSeated = new Map<
    string,
    { readonly name: string; readonly guildTag: string | null; readonly team: 0 | 1 }
  >();
  /**
   * Every body's team as the tick began, a creature's too: one killed in
   * a tick has left the simulation by the time that tick is tallied.
   */
  const teams = new Map<string, number>();
  /** The match's totals per player, for the summary. */
  const tally = new MatchTally(
    (id) => everSeated.get(id)?.team ?? teams.get(id),
    (id) => everSeated.has(id),
  );
  /** One whole-number line per seat the match ever had. */
  const summary = (): WireSummaryRow[] =>
    [...everSeated].map(([id, { name, guildTag, team }]) => {
      const row = tally.row(id);
      return {
        id,
        name,
        guildTag,
        team,
        damage: Math.round(row.damage),
        healing: Math.round(row.healing),
        taken: Math.round(row.taken),
        kills: row.kills,
        deaths: row.deaths,
        interrupts: row.interrupts,
      };
    });
  let accumulator = 0;
  let finished = false;
  /** Handed its room on: see `MatchHost.retire`. */
  let retired = false;
  /** The peers watching (#480): no seat, and nothing sent but `delayed`. */
  const observers = new Set<string>();
  /**
   * The last `OBSERVER_DELAY_SECONDS` of ticks, oldest first, for every
   * observer at once (#480). Kept only while one is watching.
   */
  let delayed: Delayed[] = [];
  const delayTicks = Math.ceil(OBSERVER_DELAY_SECONDS * RULESET.tickRateHz);
  /** The tick being played, or after the end, the observers' stream running on. */
  let streamTick = 0;

  const nowMs = (): number => sim.elapsedSeconds * 1000;

  /** 128 random bits as 32 hex digits: a rejoin token, or a challenge's nonce. */
  const newToken = (): string =>
    Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("");

  const refuse = (peerId: string, reason: PeerRefuse["reason"], message: string): void => {
    const refusal: PeerRefuse = { reason, message };
    transport.send("refuse", refusal, peerId);
  };

  const sendRecharges = (seat: Seat, force: boolean): void => {
    const participant = sim.get(seat.playerId);
    if (participant === undefined || seat.peerId === undefined) {
      return;
    }
    const at = sim.elapsedSeconds;
    const message = rechargeState(participant.skillBar, participant.combatant.cast);
    const sent = seat.recharges;
    if (!force && sent !== undefined && rechargePredicted(sent.message, at - sent.at, message)) {
      return;
    }
    seat.recharges = { message, at };
    transport.send("recharge", message, seat.peerId);
  };

  /**
   * Send `seat`'s peer its own adrenaline when it changed, or whenever
   * `force` (#463); and when its out-of-combat window starts again while
   * it holds any, so the loss it counts down to moves (#828).
   */
  const sendAdrenaline = (seat: Seat, force: boolean): void => {
    const participant = sim.get(seat.playerId);
    if (participant === undefined || seat.peerId === undefined) {
      return;
    }
    const { combatant } = participant;
    const slots = adrenalineSlots(participant.skillBar, combatant);
    const lossInSeconds = adrenalineLossIn(
      combatant,
      sim.elapsedSeconds,
      RULESET.resources.adrenalineLossSeconds,
    );
    const sent = seat.adrenaline;
    if (
      !force &&
      sent !== undefined &&
      sameAdrenaline(sent.slots, slots) &&
      (lossInSeconds === null || sent.lastCombatAt === combatant.lastCombatAt)
    ) {
      return;
    }
    seat.adrenaline = { slots, lastCombatAt: combatant.lastCombatAt };
    const message: AdrenalineMessage = { slots, lossInSeconds };
    transport.send("adrenaline", message, seat.peerId);
  };

  /**
   * Send `seat`'s peer the chain marks it placed when they changed in a way
   * its countdown cannot tell, or whenever `force` (#916).
   */
  const sendChainMarks = (seat: Seat, force: boolean): void => {
    const participant = sim.get(seat.playerId);
    if (participant === undefined || seat.peerId === undefined) {
      return;
    }
    const at = sim.elapsedSeconds;
    const marks = chainMarks(participant.combatant);
    const sent = seat.chainMarks;
    if (!force && sent !== undefined && chainMarksPredicted(sent.marks, at - sent.at, marks)) {
      return;
    }
    seat.chainMarks = { marks, at };
    const message: ChainMarksMessage = { marks };
    transport.send("chain", message, seat.peerId);
  };

  /**
   * Send `seat`'s peer its bar when it changed since the last one, or
   * whenever `force`, as on a welcome (#637). Costs follow the bearer,
   * so a glyph going up or being spent, or a respawn, sends it again.
   */
  const sendSkillBar = (seat: Seat, force: boolean): void => {
    if (seat.peerId === undefined) {
      return;
    }
    const participant = sim.get(seat.playerId);
    const slots =
      participant === undefined
        ? []
        : skillBarSlots(
            participant.skillBar,
            participant.combatant.cast,
            participant.combatant,
            sim.elapsedSeconds,
          );
    if (!force && seat.skillBar !== undefined && sameSkillBar(seat.skillBar, slots)) {
      return;
    }
    seat.skillBar = slots;
    const bar: WireSkillBar = {
      slots,
      ranks: Object.fromEntries(participant?.combatant.attributeRanks ?? []),
    };
    transport.send("skill-bar", bar, seat.peerId);
  };

  /**
   * Send `seat`'s peer its weapon sets when the active or queued one
   * changed since the last, or whenever `force`, as on a welcome (#489).
   */
  const sendWeaponSets = (seat: Seat, force: boolean): void => {
    const participant = sim.get(seat.playerId);
    if (seat.peerId === undefined || participant === undefined) {
      return;
    }
    const sets = wireWeaponSets(participant);
    if (
      !force &&
      seat.weaponSets?.active === sets.active &&
      seat.weaponSets.pending === sets.pending
    ) {
      return;
    }
    seat.weaponSets = { active: sets.active, pending: sets.pending };
    transport.send("weapon-sets", sets, seat.peerId);
  };

  /** `team`'s calls to every seated peer of it, each its own: never a broadcast (#443). */
  const sendCalls = (team: Team): void => {
    const view = calls.view(team, sim.elapsedSeconds);
    for (const seat of seats.values()) {
      if (seat.team === team && seat.peerId !== undefined) {
        transport.send("calls", view, seat.peerId);
      }
    }
  };

  /**
   * `team`'s traps, the newest `MAX_WIRE_GROUND_EFFECTS` (#1105): a
   * foe's are hidden information, so this is all a peer ever hears of them.
   */
  const trapsOf = (team: Team): WireTraps => ({
    traps: sim.groundEffects
      .filter((effect) => effect.act.kind === "trap" && effect.team === team)
      .slice(-MAX_WIRE_GROUND_EFFECTS)
      .map((effect) => ({ ...groundEffectSnapshot(effect, sim.elapsedSeconds), team })),
  });

  /**
   * `team`'s traps to every seated peer of it, each its own, never a
   * broadcast, when they changed since it was last sent them (#1105).
   */
  const sendTraps = (team: Team): void => {
    const view = trapsOf(team);
    const ids = view.traps.map(({ id }) => id).join();
    if (ids === trapsSent.get(team)) {
      return;
    }
    trapsSent.set(team, ids);
    for (const seat of seats.values()) {
      if (seat.team === team && seat.peerId !== undefined) {
        transport.send("traps", view, seat.peerId);
      }
    }
  };

  /** Alive and in the match. */
  const isAlive = (id: string): boolean => sim.get(id)?.combatant.dead === false;

  /** The seated peers, every one connected: who is sent the match as it is played. */
  const players = (): string[] =>
    [...seats.values()].flatMap((seat) => (seat.peerId === undefined ? [] : [seat.peerId]));

  /**
   * Send the observers every held tick at least `delayTicks` old (#480).
   * The end closes their stream: nothing more is held or sent.
   */
  const release = (): void => {
    while (delayed[0] !== undefined && delayed[0].at <= streamTick - delayTicks) {
      const entry = delayed[0];
      delayed.shift();
      // One send to them all: a transport serializes once per send.
      const watching = [...observers];
      for (const part of entry.snapshot) {
        transport.send("snapshot", part, watching);
      }
      for (const batch of entry.combat) {
        transport.send("combat", batch, watching);
      }
      if (entry.ended !== undefined) {
        transport.send("ended", entry.ended, watching);
      }
      if (entry.ended !== undefined) {
        observers.clear();
        delayed = [];
      }
    }
  };

  /** `peerId` watches no more; the last to go takes the buffer with it. */
  const unobserve = (peerId: string): void => {
    observers.delete(peerId);
    if (observers.size === 0) {
      delayed = [];
    }
  };

  /**
   * Retired, a hello or an observe is for the match after this one: whoever
   * sent it watches that one now, so this one stops streaming to them. The
   * next host answers after this, on the same channel, so its client has
   * all this match sent before its welcome or `observing`, and nothing after.
   */
  const moveOn = (peerId: string): void => {
    if (observers.has(peerId)) {
      unobserve(peerId);
    }
  };

  /** Seat `peerId` in `seat`, as a new player or one coming back, and tell it so. */
  const welcome = (seat: Seat, peerId: string): void => {
    seat.peerId = peerId;
    seat.droppedAt = undefined;
    seat.token = newToken();
    seatOfPeer.set(peerId, seat);
    const message: PeerWelcome = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: seat.playerId,
      rejoinToken: seat.token,
      tickIntervalMs: 1000 / RULESET.tickRateHz,
      elapsedSeconds: sim.elapsedSeconds,
      timeLimitSeconds: options.matchRules.timeLimitSeconds,
      map: map.descriptor,
    };
    transport.send("welcome", message, peerId);
    sendSkillBar(seat, true);
    sendWeaponSets(seat, true);
    sendRecharges(seat, true);
    sendAdrenaline(seat, true);
    sendChainMarks(seat, true);
    // A rejoin sees the call its team has up, and its traps.
    transport.send("calls", calls.view(seat.team, sim.elapsedSeconds), peerId);
    transport.send("traps", trapsOf(seat.team), peerId);
  };

  /**
   * A new seat on `team` playing `loadout`, named by `nameOf` its player
   * id and of `guild`; a bot's if `bot`.
   */
  const seatNew = (
    loadout: JoinLoadout,
    team: 0 | 1,
    nameOf: (playerId: string) => string,
    guild: Guild,
    bot: boolean,
  ): Seat => {
    seated += 1;
    const playerId = `player-${String(seated)}`;
    // Gear becomes numbers exactly once, before the combatant exists (ADR-0012).
    const resolved = resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
        secondaryProfession: loadout.secondaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      RULESET.combat,
    );
    // Counted on the team, so each side fills its own points in turn
    // rather than every other player of a team landing on one.
    const teammates = [...seats.values()].filter((seat) => seat.team === team).length;
    const spawn = spawnPoint(map.spawns, team, teammates);
    sim.add({
      id: playerId,
      team,
      skillBar: loadout.skillBar,
      ...loadoutSpec(resolved),
      spawn,
      facing: spawnFacing(
        spawn,
        map.spawns.filter((point) => point.team !== team).map((point) => point.position),
        map.spawns.map((point) => point.position),
      ),
      // As fast as GW1's heroes: a decision every tick (#1193).
      behaviour: bot ? { kind: "play-build", thinkSeconds: 0 } : undefined,
    });
    const seat: Seat = {
      playerId,
      team,
      name: nameOf(playerId),
      guildTag: guild.guildTag,
      guildCape: guild.guildCape,
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      bot,
      peerId: undefined,
      token: "",
      droppedAt: undefined,
      recharges: undefined,
      adrenaline: undefined,
      chainMarks: undefined,
      skillBar: undefined,
      weaponSets: undefined,
    };
    seats.set(playerId, seat);
    everSeated.set(playerId, { name: seat.name, guildTag: seat.guildTag, team });
    for (const id of everSeated.keys()) {
      if (everSeated.size <= MAX_LOBBY_PLAYERS) {
        break;
      }
      if (!seats.has(id)) {
        everSeated.delete(id);
      }
    }
    return seat;
  };

  transport.on("hello", (data, from) => {
    if (retired) {
      moveOn(from);
      return;
    }
    // Charged like an intent: every hello may send a whole map back.
    if (!budget.take(from, nowMs()) || departed.has(from)) {
      return;
    }
    // Checked first: a client of another version, or of none, is told so
    // rather than left waiting for a welcome that never comes.
    if (helloProtocolVersion(data) !== PROTOCOL_VERSION) {
      refuse(from, "protocol-mismatch", PROTOCOL_MISMATCH_MESSAGE);
      return;
    }
    const hello = parsePeerHello(data);
    if (hello === undefined) {
      return;
    }
    if (finished) {
      refuse(from, "match-over", MATCH_OVER_MESSAGE);
      return;
    }
    challenges.delete(from);
    const { rejoin } = hello;
    const held = rejoin === null ? undefined : seats.get(rejoin.playerId);
    if (held !== undefined && claimable(held, from)) {
      // Asked, not told: the token never crosses the wire again, so a
      // peer posing as this host learns nothing it could take the seat with.
      const challenge: PeerRejoinChallenge = { playerId: held.playerId, nonce: newToken() };
      challenges.set(from, { ...challenge, hello });
      transport.send("rejoin-challenge", challenge, from);
      return;
    }
    join(hello, from);
  });

  transport.on("observe", (data, from) => {
    if (retired) {
      moveOn(from);
      return;
    }
    // Charged like a hello: every observing sends a whole map back.
    if (!budget.take(from, nowMs())) {
      return;
    }
    if (helloProtocolVersion(data) !== PROTOCOL_VERSION) {
      refuse(from, "protocol-mismatch", PROTOCOL_MISMATCH_MESSAGE);
      return;
    }
    const observe = parsePeerObserve(data);
    if (observe === undefined) {
      return;
    }
    // A player has a seat and a viewer none: one peer is never both.
    if (seatOfPeer.has(from) || !options.isSpectator(from)) {
      refuse(from, "not-a-spectator", NOT_A_SPECTATOR_MESSAGE);
      return;
    }
    if (observe.matchId !== options.matchId) {
      refuse(from, "wrong-match", WRONG_MATCH_MESSAGE);
      return;
    }
    // Over, and its end already sent on to whoever watched.
    if (finished && delayed.length === 0) {
      refuse(from, "match-over", MATCH_OVER_MESSAGE);
      return;
    }
    observers.add(from);
    const message: PeerObserving = {
      protocolVersion: PROTOCOL_VERSION,
      tickIntervalMs: 1000 / RULESET.tickRateHz,
      timeLimitSeconds: options.matchRules.timeLimitSeconds,
      delaySeconds: OBSERVER_DELAY_SECONDS,
      map: map.descriptor,
    };
    transport.send("observing", message, from);
  });

  /** Whether `peerId` may take `seat`: no bot plays it, and it plays no other seat. */
  const claimable = (seat: Seat, peerId: string): boolean => {
    if (seat.bot) {
      return false;
    }
    const current = seatOfPeer.get(peerId);
    return current === undefined || current === seat;
  };

  /** A hello that is not, or failed to be, a rejoin: a fresh join, if this peer may have one. */
  const join = (hello: PeerHello, from: string): void => {
    const current = seatOfPeer.get(from);
    if (current !== undefined) {
      // Already seated, and not asking for its own seat back.
      return;
    }
    // A wrong or expired token is a fresh join, and only for a peer the
    // lobby seated: anyone else in the room is a spectator, or a stranger.
    const plan = planned?.get(from);
    // A bot's seat is taken already: no peer plays it, whatever it calls itself.
    if (
      seats.size >= maxPlayers ||
      (planned !== null && plan === undefined) ||
      plan?.bot === true
    ) {
      refuse(from, "match-full", MATCH_FULL_MESSAGE);
      return;
    }
    awaited.delete(from);
    // The lobby's build if it assigned one, whatever the hello brings (#1458).
    const assigned = plan?.build ?? null;
    const loadout =
      assigned === null
        ? resolveJoinLoadout(hello.build, RULESET.attributes, random).loadout
        : loadoutOf(assigned);
    // Without a plan, teams alternate as players arrive, so a 1v1 is
    // adversarial by default.
    const team: 0 | 1 = plan?.team ?? (seats.size % 2 === 0 ? 0 : 1);
    // The lobby's name, tag and cape, whatever the hello says (#53,
    // #1406, #1422). Without a lobby they are the peer's to choose, so
    // they are sanitised before anyone sees them.
    const seat = seatNew(
      loadout,
      team,
      (playerId) => plan?.name ?? sanitizeName(hello.name, playerId),
      plan ?? sanitizeGuild(hello),
      false,
    );
    welcome(seat, from);
  };

  transport.on("rejoin-proof", (data, from) => {
    if (retired || !budget.take(from, nowMs()) || departed.has(from)) {
      return;
    }
    const proof = parsePeerRejoinProof(data);
    // Single use: taken before anything is awaited, so a second proof for
    // the same nonce finds nothing.
    const challenge = challenges.get(from);
    challenges.delete(from);
    if (proof === undefined || challenge === undefined) {
      return;
    }
    const attempt = {};
    proving.set(from, attempt);
    void prove(challenge, proof.playerId, proof.proof, from, attempt).finally(() => {
      if (proving.get(from) === attempt) {
        proving.delete(from);
      }
    });
  });

  /** Seat `from` back in the challenged seat if its proof holds, else treat it as a fresh hello. */
  const prove = async (
    challenge: Challenge,
    playerId: string,
    proof: string,
    from: string,
    attempt: object,
  ): Promise<void> => {
    const before = seats.get(challenge.playerId);
    const token = before?.token;
    const expected =
      token === undefined
        ? undefined
        : await rejoinProof(token, challenge.nonce, challenge.playerId, from);
    // The match went on while the proof was checked: look again. A peer
    // that left or said bye meanwhile is not seated, nor told anything.
    if (proving.get(from) !== attempt || departed.has(from) || retired) {
      return;
    }
    if (finished) {
      refuse(from, "match-over", MATCH_OVER_MESSAGE);
      return;
    }
    const held = seats.get(challenge.playerId);
    if (
      held === undefined ||
      held !== before ||
      held.token !== token ||
      playerId !== challenge.playerId ||
      proof !== expected ||
      !claimable(held, from)
    ) {
      join(challenge.hello, from);
      return;
    }
    // The player may be back before the host has seen its old peer go:
    // the proof is the proof, and the old peer is forgotten. That old peer
    // may be this one, when only the guest saw the connection drop.
    if (held.peerId !== undefined) {
      seatOfPeer.delete(held.peerId);
    }
    welcome(held, from);
  };

  transport.on("intent", (data, from) => {
    const seat = seatOfPeer.get(from);
    if (seat === undefined || finished || !budget.take(from, nowMs())) {
      return;
    }
    const intent = parseClientIntent(data);
    if (intent === undefined) {
      // Malformed or malicious: nothing is applied, and nothing is said.
      return;
    }
    if (intent.kind === "weapon-set" && !swapBudget.take(seat.playerId, nowMs())) {
      droppedWeaponSwaps += 1;
      return;
    }
    const refusal = applyIntent(sim, seat.playerId, intent);
    if (refusal !== null) {
      // Only the caster hears it: why a key did nothing is nobody else's business.
      transport.send("refused", refusal, from);
    }
  });

  transport.on("call", (data, from) => {
    const seat = seatOfPeer.get(from);
    if (seat === undefined || finished || !budget.take(from, nowMs())) {
      return;
    }
    const call = parsePeerCall(data);
    // The dead call nothing; a malformed one is dropped without a word.
    if (call === undefined || !isAlive(seat.playerId)) {
      return;
    }
    const isLiveEnemy = (targetId: string): boolean =>
      isAlive(targetId) && sim.get(targetId)?.combatant.team !== seat.team;
    if (calls.call(seat.team, seat.playerId, call, sim.elapsedSeconds, isLiveEnemy)) {
      callsDirty.add(seat.team);
    }
  });

  /** Forget `seat`'s player, and every target on them. */
  const free = (seat: Seat): void => {
    if (seat.peerId !== undefined) {
      seatOfPeer.delete(seat.peerId);
    }
    sim.remove(seat.playerId);
    seats.delete(seat.playerId);
    swapBudget.forget(seat.playerId);
  };

  transport.on("bye", (data, from) => {
    const seat = seatOfPeer.get(from);
    if (!budget.take(from, nowMs()) || parsePeerBye(data) === undefined) {
      return;
    }
    if (observers.has(from)) {
      unobserve(from);
      return;
    }
    // A player's bye, once retired, is meant for the match after this one.
    if (seat === undefined || retired) {
      return;
    }
    // The player meant to go: there is nothing to hold the seat for.
    departed.add(from);
    free(seat);
  });

  // The budget outlives a bye and a seat: only a peer leaving the room
  // gets a fresh bucket, so neither can be cycled to refill it.
  transport.onPeerLeave((peerId) => {
    budget.forget(peerId);
    departed.delete(peerId);
    awaited.delete(peerId);
    challenges.delete(peerId);
    proving.delete(peerId);
    unobserve(peerId);
    const seat = seatOfPeer.get(peerId);
    if (seat === undefined) {
      return;
    }
    seatOfPeer.delete(peerId);
    seat.peerId = undefined;
    seat.droppedAt = sim.elapsedSeconds;
    seat.recharges = undefined;
    seat.adrenaline = undefined;
    seat.chainMarks = undefined;
    seat.skillBar = undefined;
    seat.weaponSets = undefined;
    // Frozen, not left running into a wall while away.
    sim.setInputDirection(seat.playerId, ZERO);
    sim.get(seat.playerId)?.combatant.cast.cancelCast();
  });

  const wirePlayer = (participant: Participant, who: WireIdentity): WirePlayer => {
    const { combatant } = participant;
    const cast = combatant.cast.activeCast;
    const swing = swingProgress(combatant);
    const pips = sim.pips(participant);
    return {
      id: participant.id,
      ...who,
      x: participant.position.x,
      y: participant.position.y,
      facing: round(participant.facing, 2),
      targetId: participant.targetId ?? null,
      attackTargetId: combatant.attack?.targetId ?? null,
      walking:
        participant.walkGoal !== undefined ||
        participant.pendingSkill !== undefined ||
        participant.interact !== undefined,
      health: Math.round(combatant.health),
      // Raised by Endure Pain and its kind (#1359): the bar shows the larger maximum.
      maxHealth: raisedMaxHealth(combatant),
      // Energy below 0 is GW1's hidden energy (#489): nobody sees it.
      energy: Math.max(0, Math.round(combatant.energy)),
      // Raised by Mighty Was Vorizun (#1464), as health is.
      maxEnergy: raisedMaxEnergy(combatant),
      overcast: Math.round(combatant.overcast),
      morale: combatant.morale,
      armor: combatant.equipment.baseArmor,
      weaponId: combatant.equipment.mainHand.weapon.id,
      offhandId: combatant.equipment.offhandId ?? null,
      dead: combatant.dead,
      corpseExploited: participant.corpseExploited,
      castingSkillId: cast?.skillId ?? null,
      castRemaining: cast?.remainingSeconds ?? 0,
      castTotal: cast?.totalSeconds ?? 0,
      swingElapsed: round(swing.elapsed, 3),
      swingTotal: round(swing.total, 3),
      knockdownRemaining: round(combatant.knockdownRemaining, 2),
      invulnerableSeconds: round(combatant.invulnerableRemaining, 2),
      healthPips: pips.health,
      energyPips: pips.energy,
      statuses: wireStatuses(combatant.statuses.active).map((status) => {
        const { id, ...times } = statusSnapshot(status, sim.elapsedSeconds, cast);
        return { status: statusWireIndex(id), ...times };
      }),
    };
  };

  const snapshot = (): WireSnapshot => ({
    tick: sim.tick,
    elapsedSeconds: sim.elapsedSeconds,
    score: [sim.score.byTeam.get(0) ?? 0, sim.score.byTeam.get(1) ?? 0],
    phase: sim.phase,
    winningTeam: wireTeam(sim.outcome.winningTeam),
    endReason: sim.outcome.reason ?? null,
    players: [...sim.participants()].flatMap((participant) => {
      const who = wireIdentity(participant, seats, sim.elapsedSeconds);
      return who === undefined ? [] : [wirePlayer(participant, who)];
    }),
    // The newest, if ever there were more than a snapshot may carry: a
    // client refuses a whole snapshot past the cap.
    projectiles: sim.projectiles.slice(-MAX_WIRE_PROJECTILES).map((shot) => ({
      id: shot.id,
      attackerId: shot.attackerId,
      skillId: shot.skillHit?.kind === "spell" ? shot.skillHit.skill.id : null,
      from: shot.from,
      to: shot.aimPoint,
      launchedAt: sim.elapsedSeconds - shot.elapsed,
      flightSeconds: shot.flightSeconds,
    })),
    // The newest, as for projectiles; a team the wire has no colour for is
    // not drawn. A trap goes to its own team alone (`sendTraps`).
    groundEffects: sim.groundEffects
      .filter((effect) => effect.act.kind !== "trap")
      .slice(-MAX_WIRE_GROUND_EFFECTS)
      .flatMap((effect) => {
        const team = wireTeam(effect.team);
        return team === null ? [] : [{ ...groundEffectSnapshot(effect, sim.elapsedSeconds), team }];
      }),
    flags: sim.flags.flatMap((flag) => wireCarried(flag) ?? []),
    stand:
      sim.stand === undefined
        ? null
        : { holder: wireTeam(sim.stand.holder), heldSeconds: sim.stand.heldSeconds },
    aggression: sim.aggressionByTeam.map((total) => Math.round(total)),
    relics: sim.relics.flatMap((relic) => wireCarried(relic) ?? []),
    altar: sim.altar ?? null,
    altarHolder: wireTeam(sim.altarState.holder),
    altarHeldSeconds: sim.altarState.heldSeconds,
    capturePoints: sim.capturePoints.map((point) => ({
      x: point.position.x,
      y: point.position.y,
      owner: wireTeam(point.owner),
      capturer: wireTeam(point.capturer),
      // Within [0, 1] by construction; rounded as the other floats are.
      progress: round(point.progress, 3),
    })),
  });

  /** Drop the seats whose players did not come back in time. */
  const expireDropped = (): void => {
    for (const seat of seats.values()) {
      if (
        seat.droppedAt !== undefined &&
        sim.elapsedSeconds - seat.droppedAt >= RECONNECT_WINDOW_SECONDS
      ) {
        free(seat);
      }
    }
  };

  const tick = (): void => {
    for (const participant of sim.participants()) {
      teams.set(participant.id, participant.combatant.team);
    }
    const result = sim.step(TICK_SECONDS);
    expireDropped();
    for (const team of calls.step(sim.elapsedSeconds, isAlive)) {
      callsDirty.add(team);
    }
    for (const team of callsDirty) {
      // Its bots fight the called foe (#1193).
      sim.setCalledTarget(team, calls.view(team, sim.elapsedSeconds).target?.targetId);
      sendCalls(team);
    }
    callsDirty.clear();
    sendTraps(0);
    sendTraps(1);
    // To the players, never the room (#480): a spectator in it watches
    // through `delayed` alone. One send to them all, so each part is
    // serialized once, not once per player.
    const live = players();
    const parts = packSnapshot(snapshot(), MAX_MESSAGE_BYTES);
    for (const part of parts) {
      transport.send("snapshot", part, live);
    }
    tally.add(result.log);
    const batches = packCombat(wireCombat(result.log), MAX_MESSAGE_BYTES, MAX_WIRE_COMBATS);
    for (const batch of batches) {
      transport.send("combat", batch, live);
    }
    for (const seat of seats.values()) {
      sendSkillBar(seat, false);
      sendWeaponSets(seat, false);
      sendRecharges(seat, false);
      sendAdrenaline(seat, false);
      sendChainMarks(seat, false);
    }
    let ended: WireEnded | undefined;
    if (result.phase === "finished") {
      finished = true;
      ended = {
        winningTeam: wireTeam(sim.outcome.winningTeam),
        endReason: sim.outcome.reason ?? "time",
        summary: summary(),
      };
      transport.send("ended", ended, live);
    }
    // A match nobody watches holds nothing.
    if (observers.size > 0) {
      delayed.push({ at: streamTick, snapshot: parts, combat: batches, ended });
    }
    release();
    streamTick += 1;
  };

  // A lobby's bots (#1193) take their seats at once: none of them says hello.
  for (const plan of planned?.values() ?? []) {
    if (plan.bot) {
      seatNew(loadoutOf(plan.build), plan.team, () => plan.name, NO_GUILD, true);
    }
  }

  return {
    advance(seconds) {
      if (finished && delayed.length === 0) {
        return;
      }
      const drained = drainAccumulator(accumulator, seconds, TICK_SECONDS);
      accumulator = drained.remainder;
      for (let i = 0; i < drained.ticks; i += 1) {
        if (finished) {
          // Over: only the observers' stream runs on, to the end.
          release();
          streamTick += 1;
          if (delayed.length === 0) {
            return;
          }
        } else {
          tick();
        }
      }
    },
    get phase() {
      return finished ? "finished" : "active";
    },
    get winningTeam() {
      return sim.phase === "finished" ? wireTeam(sim.outcome.winningTeam) : null;
    },
    get abandoned() {
      return planned !== null && awaited.size === 0 && seats.size === 0;
    },
    get droppedWeaponSwaps() {
      return droppedWeaponSwaps;
    },
    get draining() {
      return finished && delayed.length > 0;
    },
    retire() {
      retired = true;
    },
    async close(reason) {
      // Nothing more is ticked onto a transport that has left.
      finished = true;
      observers.clear();
      delayed = [];
      const ended: WireEnded = { winningTeam: null, endReason: reason, summary: summary() };
      transport.send("ended", ended);
      await transport.leave();
    },
  };
}

import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  MatchTally,
  ZERO,
  adrenalineLossIn,
  applyIntent,
  drainAccumulator,
  resolveJoinLoadout,
  resolveLoadout,
  spawnFacing,
  swingProgress,
  type MatchRules,
  type Participant,
  type ProfessionId,
  type Segment,
} from "@vibewars/game-core";
import {
  MAX_WIRE_COMBATS,
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_PROJECTILES,
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  helloProtocolVersion,
  parseClientIntent,
  parsePeerBye,
  parsePeerCall,
  parsePeerHello,
  parsePeerRejoinProof,
  type AdrenalineMessage,
  type ChainMarksMessage,
  type WireChainMark,
  type MapDescriptor,
  type PeerHello,
  type PeerRefuse,
  type PeerRejoinChallenge,
  type PeerWelcome,
  type RechargeMessage,
  type SkillBarSlot,
  type WireEnded,
  type WirePlayer,
  type WireSkillBar,
  type WireSnapshot,
  type WireSummaryRow,
} from "@vibewars/game-protocol";

import { createCallBoard, type Team } from "./calls.js";
import { packCombat } from "./combat-batches.js";
import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import { sanitizeName } from "./names.js";
import { adrenalineSlots, sameAdrenaline } from "./adrenaline.js";
import { chainMarks, chainMarksPredicted } from "./chain-marks.js";
import { rechargePredicted, rechargeState } from "./recharge.js";
import { rejoinProof } from "./rejoin-proof.js";
import { packSnapshot } from "./snapshot-parts.js";
import { spawnPoint, type SpawnPoint } from "./spawn-points.js";
import { MAX_MESSAGE_BYTES, type Transport } from "./transport.js";
import {
  sameSkillBar,
  skillBarSlots,
  statusSnapshot,
  statusWireIndex,
  wireCombat,
  wireStatuses,
  wireIdentity,
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

/** What the players are shown when the host turns them away. */
export const MATCH_FULL_MESSAGE = "This match is full.";
export const MATCH_OVER_MESSAGE = "This match is over.";

/** The arena, already built from game-maps by the caller: game-session does not depend on it. */
export interface HostMap {
  readonly descriptor: MapDescriptor;
  readonly walls: readonly Segment[];
  readonly bounds: { readonly width: number; readonly height: number };
  readonly spawns: readonly SpawnPoint[];
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
}

/** A lobby's seating for its match: each seated peer's team and sanitised name. */
export type PlannedSeats = ReadonlyMap<string, { readonly team: 0 | 1; readonly name: string }>;

export interface MatchHost {
  /** Run as many whole ticks as `seconds` holds, carrying the rest. */
  advance(seconds: number): void;
  readonly phase: "active" | "finished";
  /**
   * A lobby's match nobody is playing any more: every seat is gone, and
   * every seated peer that never came has left the room. The lobby then
   * ends it, as the server did with a room everyone left.
   */
  readonly abandoned: boolean;
  /** Tell every peer the match is over because the host left, then leave. */
  close(reason: "host-left"): Promise<void>;
}

/** One player's place in the match, held through a drop. */
interface Seat {
  readonly playerId: string;
  readonly team: 0 | 1;
  readonly name: string;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
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
}

/** A rejoin hello the host has challenged, waiting for its proof (#593). */
interface Challenge {
  readonly playerId: string;
  readonly nonce: string;
  readonly hello: PeerHello;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function wireTeam(team: number | undefined): 0 | 1 | null {
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
  });
  const seats = new Map<string, Seat>();
  const seatOfPeer = new Map<string, Seat>();
  const budget = new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST, () => undefined);
  /**
   * The peers that said `bye`, until they leave the room. A quit is never
   * undone by a fresh `hello`: that would be a free heal, a cooldown reset
   * and a team re-roll, as often as the budget allows.
   */
  const departed = new Set<string>();
  /** The planned peers that have not said hello yet, while they are in the room. */
  const awaited = new Set(planned?.keys());
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
  let seated = 0;
  /**
   * The seats the match had, in seat order: whoever left still has a line
   * in the summary (#1057), under the name they joined with. At most
   * `MAX_LOBBY_PLAYERS`, all `ended` carries: past it, the earliest seat
   * no longer held goes (`seatNew`).
   */
  const everSeated = new Map<string, { readonly name: string; readonly team: 0 | 1 }>();
  /**
   * Every body's team as the tick began, a creature's too: one killed in
   * a tick has left the simulation by the time that tick is tallied.
   */
  const teams = new Map<string, number>();
  /** The match's totals per player, for the summary. */
  const tally = new MatchTally((id) => everSeated.get(id)?.team ?? teams.get(id));
  /** One whole-number line per seat the match ever had. */
  const summary = (): WireSummaryRow[] =>
    [...everSeated].map(([id, { name, team }]) => {
      const row = tally.row(id);
      return {
        id,
        name,
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
      participant === undefined ? [] : skillBarSlots(participant.skillBar, participant.combatant);
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

  /** `team`'s calls to every seated peer of it, each its own: never a broadcast (#443). */
  const sendCalls = (team: Team): void => {
    const view = calls.view(team, sim.elapsedSeconds);
    for (const seat of seats.values()) {
      if (seat.team === team && seat.peerId !== undefined) {
        transport.send("calls", view, seat.peerId);
      }
    }
  };

  /** Alive and in the match. */
  const isAlive = (id: string): boolean => sim.get(id)?.combatant.dead === false;

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
      map: map.descriptor,
    };
    transport.send("welcome", message, peerId);
    sendSkillBar(seat, true);
    sendRecharges(seat, true);
    sendAdrenaline(seat, true);
    sendChainMarks(seat, true);
    // A rejoin sees the call its team has up.
    transport.send("calls", calls.view(seat.team, sim.elapsedSeconds), peerId);
  };

  const seatNew = (
    hello: PeerHello,
    peerId: string,
    plan: { readonly team: 0 | 1; readonly name: string } | undefined,
  ): void => {
    seated += 1;
    const playerId = `player-${String(seated)}`;
    // Without a plan, teams alternate as players arrive, so a 1v1 is
    // adversarial by default.
    const team: 0 | 1 = plan?.team ?? (seats.size % 2 === 0 ? 0 : 1);
    const { loadout } = resolveJoinLoadout(hello.build, RULESET.attributes);
    // Gear becomes numbers exactly once, before the combatant exists (ADR-0012).
    const resolved = resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
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
      attributeRanks: resolved.attributeRanks,
      equipment: resolved.equipment,
      spawn,
      facing: spawnFacing(
        spawn,
        map.spawns.filter((point) => point.team !== team).map((point) => point.position),
        map.spawns.map((point) => point.position),
      ),
      maxHealth: resolved.maxHealth,
      maxEnergy: resolved.maxEnergy,
      baseEnergyPips: loadout.baseEnergyPips,
    });
    const seat: Seat = {
      playerId,
      team,
      // The lobby's name, whatever the hello says (#53). Without a lobby the
      // name is the peer's to choose, so it is sanitised before anyone sees it.
      name: plan?.name ?? sanitizeName(hello.name, playerId),
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      peerId: undefined,
      token: "",
      droppedAt: undefined,
      recharges: undefined,
      adrenaline: undefined,
      chainMarks: undefined,
      skillBar: undefined,
    };
    seats.set(playerId, seat);
    everSeated.set(playerId, { name: seat.name, team });
    for (const id of everSeated.keys()) {
      if (everSeated.size <= MAX_LOBBY_PLAYERS) {
        break;
      }
      if (!seats.has(id)) {
        everSeated.delete(id);
      }
    }
    welcome(seat, peerId);
  };

  transport.on("hello", (data, from) => {
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

  /** Whether `peerId` may take `seat`: it plays no other seat. */
  const claimable = (seat: Seat, peerId: string): boolean => {
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
    if (seats.size >= maxPlayers || (planned !== null && plan === undefined)) {
      refuse(from, "match-full", MATCH_FULL_MESSAGE);
      return;
    }
    awaited.delete(from);
    seatNew(hello, from, plan);
  };

  transport.on("rejoin-proof", (data, from) => {
    if (!budget.take(from, nowMs()) || departed.has(from)) {
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
    if (proving.get(from) !== attempt || departed.has(from)) {
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
  };

  transport.on("bye", (data, from) => {
    const seat = seatOfPeer.get(from);
    if (!budget.take(from, nowMs()) || seat === undefined || parsePeerBye(data) === undefined) {
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
      walking: participant.walkGoal !== undefined || participant.pendingSkill !== undefined,
      health: Math.round(combatant.health),
      maxHealth: combatant.maxHealth,
      energy: Math.round(combatant.energy),
      maxEnergy: combatant.maxEnergy,
      overcast: Math.round(combatant.overcast),
      morale: combatant.morale,
      armor: combatant.equipment.baseArmor,
      weaponId: combatant.equipment.mainHand.weapon.id,
      offhandId: combatant.equipment.offhandId ?? null,
      dead: combatant.dead,
      castingSkillId: cast?.skillId ?? null,
      castRemaining: cast?.remainingSeconds ?? 0,
      castTotal: cast?.totalSeconds ?? 0,
      swingElapsed: round(swing.elapsed, 3),
      swingTotal: round(swing.total, 3),
      knockdownRemaining: round(combatant.knockdownRemaining, 2),
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
      const who = wireIdentity(participant, seats);
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
      sendCalls(team);
    }
    callsDirty.clear();
    for (const part of packSnapshot(snapshot(), MAX_MESSAGE_BYTES)) {
      transport.send("snapshot", part);
    }
    tally.add(result.log);
    for (const batch of packCombat(wireCombat(result.log), MAX_MESSAGE_BYTES, MAX_WIRE_COMBATS)) {
      transport.send("combat", batch);
    }
    for (const seat of seats.values()) {
      sendSkillBar(seat, false);
      sendRecharges(seat, false);
      sendAdrenaline(seat, false);
      sendChainMarks(seat, false);
    }
    if (result.phase === "finished") {
      finished = true;
      const ended: WireEnded = {
        winningTeam: wireTeam(sim.outcome.winningTeam),
        endReason: sim.outcome.reason ?? "time",
        summary: summary(),
      };
      transport.send("ended", ended);
    }
  };

  return {
    advance(seconds) {
      if (finished) {
        return;
      }
      const drained = drainAccumulator(accumulator, seconds, TICK_SECONDS);
      accumulator = drained.remainder;
      for (let i = 0; i < drained.ticks; i += 1) {
        tick();
        if (sim.phase === "finished") {
          return;
        }
      }
    },
    get phase() {
      return finished ? "finished" : "active";
    },
    get abandoned() {
      return planned !== null && awaited.size === 0 && seats.size === 0;
    },
    async close(reason) {
      // Nothing more is ticked onto a transport that has left.
      finished = true;
      const ended: WireEnded = { winningTeam: null, endReason: reason, summary: summary() };
      transport.send("ended", ended);
      await transport.leave();
    },
  };
}

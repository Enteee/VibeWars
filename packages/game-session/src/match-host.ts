import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  ZERO,
  applyIntent,
  drainAccumulator,
  resolveJoinLoadout,
  resolveLoadout,
  spawnFacing,
  type MatchRules,
  type Participant,
  type ProfessionId,
  type Segment,
} from "@vibewars/game-core";
import {
  MAX_WIRE_COMBATS,
  MAX_WIRE_PROJECTILES,
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  helloProtocolVersion,
  parseClientIntent,
  parsePeerBye,
  parsePeerHello,
  type MapDescriptor,
  type PeerHello,
  type PeerRefuse,
  type PeerWelcome,
  type RechargeSlot,
  type WireEnded,
  type WirePlayer,
  type WireSkillBar,
  type WireSnapshot,
} from "@vibewars/game-protocol";

import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import { sanitizeName } from "./names.js";
import { rechargePredicted, rechargeSlots } from "./recharge.js";
import { spawnPoint, type SpawnPoint } from "./spawn-points.js";
import type { Transport } from "./transport.js";
import { skillBarSlots, wireCombat } from "./wire.js";

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
   * In [0, 1), for rejoin tokens; injected so a test is reproducible. A
   * token is all that stands between a seat and whoever guesses it, so in
   * a page this must come from `crypto.getRandomValues`, never `Math.random`.
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
  /** The peer playing it; `undefined` while it is dropped. */
  peerId: string | undefined;
  /** What the peer sends in `PeerHello.rejoin` to take the seat back. */
  token: string;
  /** The match time it dropped at, while it is dropped. */
  droppedAt: number | undefined;
  /** The recharges the peer was last told, and when, so only news is sent (#152). */
  recharges: { readonly slots: RechargeSlot[]; readonly at: number } | undefined;
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
  let seated = 0;
  let accumulator = 0;
  let finished = false;

  const nowMs = (): number => sim.elapsedSeconds * 1000;

  /** 128 random bits as 32 hex digits. */
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
    const slots = rechargeSlots(participant.skillBar, participant.combatant.cast);
    const sent = seat.recharges;
    if (!force && sent !== undefined && rechargePredicted(sent.slots, at - sent.at, slots)) {
      return;
    }
    seat.recharges = { slots, at };
    transport.send("recharge", { slots }, seat.peerId);
  };

  /** Seat `peerId` in `seat`, as a new player or one coming back, and tell it so. */
  const welcome = (seat: Seat, peerId: string): void => {
    seat.peerId = peerId;
    seat.droppedAt = undefined;
    seat.token = newToken();
    seatOfPeer.set(peerId, seat);
    const participant = sim.get(seat.playerId);
    const message: PeerWelcome = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: seat.playerId,
      rejoinToken: seat.token,
      tickIntervalMs: 1000 / RULESET.tickRateHz,
      elapsedSeconds: sim.elapsedSeconds,
      map: map.descriptor,
    };
    transport.send("welcome", message, peerId);
    const bar: WireSkillBar = {
      slots: skillBarSlots(participant?.skillBar ?? []),
      ranks: Object.fromEntries(participant?.combatant.attributeRanks ?? []),
    };
    transport.send("skill-bar", bar, peerId);
    sendRecharges(seat, true);
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
    };
    seats.set(playerId, seat);
    welcome(seat, peerId);
  };

  transport.on("hello", (data, from) => {
    // Charged like an intent: every hello may send a whole map back.
    if (!budget.take(from, nowMs()) || seatOfPeer.has(from) || departed.has(from)) {
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
    const { rejoin } = hello;
    const held = rejoin === null ? undefined : seats.get(rejoin.playerId);
    if (held !== undefined && held.token === rejoin?.token) {
      // The player may be back before the host has seen its old peer go:
      // the token is the proof, and the old peer is forgotten.
      if (held.peerId !== undefined) {
        seatOfPeer.delete(held.peerId);
      }
      welcome(held, from);
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
  });

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
    const seat = seatOfPeer.get(peerId);
    if (seat === undefined) {
      return;
    }
    seatOfPeer.delete(peerId);
    seat.peerId = undefined;
    seat.droppedAt = sim.elapsedSeconds;
    seat.recharges = undefined;
    // Frozen, not left running into a wall while away.
    sim.setInputDirection(seat.playerId, ZERO);
    sim.get(seat.playerId)?.combatant.cast.cancelCast();
  });

  const wirePlayer = (participant: Participant, seat: Seat): WirePlayer => {
    const { combatant } = participant;
    const cast = combatant.cast.activeCast;
    return {
      id: participant.id,
      name: seat.name,
      team: seat.team,
      x: participant.position.x,
      y: participant.position.y,
      facing: round(participant.facing, 2),
      targetId: participant.targetId ?? null,
      attackTargetId: combatant.attack?.targetId ?? null,
      walking: participant.walkGoal !== undefined,
      health: Math.round(combatant.health),
      maxHealth: combatant.maxHealth,
      energy: Math.round(combatant.energy),
      maxEnergy: combatant.maxEnergy,
      adrenaline: combatant.adrenaline,
      armor: combatant.equipment.baseArmor,
      weaponId: combatant.equipment.mainHand.weapon.id,
      offhandId: combatant.equipment.offhandId ?? null,
      primaryProfession: seat.primaryProfession,
      secondaryProfession: seat.secondaryProfession ?? null,
      dead: combatant.dead,
      castingSkillId: cast?.skillId ?? null,
      castRemaining: cast?.remainingSeconds ?? 0,
      castTotal: cast?.totalSeconds ?? 0,
      statuses: combatant.statuses.active.map((status) => status.id),
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
      const seat = seats.get(participant.id);
      return seat === undefined ? [] : [wirePlayer(participant, seat)];
    }),
    // The newest, if ever there were more than a snapshot may carry: a
    // client refuses a whole snapshot past the cap.
    projectiles: sim.projectiles.slice(-MAX_WIRE_PROJECTILES).map((shot) => ({
      id: shot.id,
      attackerId: shot.attackerId,
      weaponId: shot.weaponSnapshot.mainHand.weapon.id,
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
    const result = sim.step(TICK_SECONDS);
    expireDropped();
    transport.send("snapshot", snapshot());
    const combat = wireCombat(result.log);
    for (let i = 0; i < combat.length; i += MAX_WIRE_COMBATS) {
      transport.send("combat", combat.slice(i, i + MAX_WIRE_COMBATS));
    }
    for (const seat of seats.values()) {
      sendRecharges(seat, false);
    }
    if (result.phase === "finished") {
      finished = true;
      const ended: WireEnded = {
        winningTeam: wireTeam(sim.outcome.winningTeam),
        endReason: sim.outcome.reason ?? "time",
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
      const ended: WireEnded = { winningTeam: null, endReason: reason };
      transport.send("ended", ended);
      await transport.leave();
    },
  };
}

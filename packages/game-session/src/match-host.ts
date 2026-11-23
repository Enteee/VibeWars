import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchChart,
  MatchTally,
  type MatchChartResult,
  ZERO,
  adrenalineLossIn,
  applyIntent,
  drainAccumulator,
  teamIds,
  loadoutOf,
  resolveJoinLoadout,
  raisedMaxEnergy,
  raisedMaxHealth,
  swingProgress,
  type MatchMode,
  type MatchEndReason,
  type MatchRules,
  type Participant,
  type PlayerBuild,
  type ProfessionId,
  type GateField,
  type SwitchField,
  type TeleportField,
  type BreakableField,
  type SwitchedDeckField,
  type MatchLayers,
  type MatchZone,
  type Segment,
  type FlagField,
  type RelicField,
  type GhostField,
  type StartLine,
  type GuildLord,
  type BaseGuard,
  type CapturePointSite,
  type Shrine,
} from "@vibewars/game-core";
import {
  MAX_WIRE_COMBATS,
  MAX_REPLAY_PARTS,
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_ACTORS,
  MAX_WIRE_GROUND_EFFECTS,
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
  type LobbyMode,
  type MapDescriptor,
  type PeerHello,
  type PeerObserving,
  type PeerRefuse,
  type PeerRejoinChallenge,
  type PeerSeatDropped,
  type PeerWelcome,
  type RechargeMessage,
  type SkillBarSlot,
  type WireCombatBatch,
  type WireChartEvent,
  type WireEnded,
  type WireMatchChart,
  type WirePlayer,
  type WireSkillBar,
  type WireSnapshot,
  type WireMatchPhase,
  type WirePreMatch,
  type WireSnapshotPart,
  type WireRespawns,
  type WireCapes,
  type WireSeatCosmetics,
  type WireCosmetics,
  type WireStrokes,
  type WireTraps,
  type WireCape,
  type WireSummaryRow,
  type WireTeam,
} from "@vibewars/game-protocol";

import { createCallBoard, type Team } from "./calls.js";
import { packCombat, packMatchChart } from "./combat-batches.js";
import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import {
  MATCH_RECORD_VERSION,
  recordTemplate,
  type MatchRecord,
  type MatchRecordTeam,
} from "./match-record.js";
import { NO_GUILD, sanitizeGuild, sanitizeName, type Guild } from "./names.js";
import { adrenalineSlots, sameAdrenaline } from "./adrenaline.js";
import { chainMarks, chainMarksPredicted } from "./chain-marks.js";
import { rechargePredicted, rechargeState } from "./recharge.js";
import { createMatchSimulation, participantSpec, type SeatSetup } from "./match-setup.js";
import { rejoinProof } from "./rejoin-proof.js";
import {
  CALLED_CHARS,
  FORFEIT_CHARS,
  ReplayBudget,
  inputChars,
  latestInputChars,
} from "./replay-budget.js";
import {
  MAX_REPLAY_CHARS,
  MAX_REPLAY_INPUTS,
  encodeReplay,
  packReplay,
  textHash,
  type MatchReplay,
  type RecordedReplay,
  type ReplayInput,
  type Sha256,
} from "./replay.js";
import { packSnapshot } from "./snapshot-parts.js";
import type { SpawnPoint } from "./spawn-points.js";
import { MAX_MESSAGE_BYTES, type Transport } from "./transport.js";
import {
  groundEffectSnapshot,
  respawnIn,
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

/** How long the countdown to a match's start lasts (#3818), everyone held. */
export const PRE_MATCH_COUNTDOWN_SECONDS = 10;

/** How long a match waits for its planned players before counting down without them (#3818). */
export const JOIN_TIMEOUT_SECONDS = 20;

/**
 * For how much of the wait the players are told the match starts anyway
 * (#3818): its last seconds, after a plain wait.
 */
export const STARTING_ANYWAY_SECONDS = 10;

/** A match's wait before its start (#3818), in seconds the host advances. */
export interface PreMatchTimes {
  readonly countdownSeconds: number;
  readonly joinTimeoutSeconds: number;
}

/** The wait every lobby match has (#3818). */
export const PRE_MATCH: PreMatchTimes = {
  countdownSeconds: PRE_MATCH_COUNTDOWN_SECONDS,
  joinTimeoutSeconds: JOIN_TIMEOUT_SECONDS,
};

/**
 * The e2e build's wait (#3855): a 1 s countdown, so a spec does not spend
 * its budget in it, and the real join timeout, so a late page is waited for.
 */
export const PRE_MATCH_E2E: PreMatchTimes = {
  countdownSeconds: 1,
  joinTimeoutSeconds: JOIN_TIMEOUT_SECONDS,
};

/** The arena, already built from game-maps by the caller: game-session does not depend on it. */
export interface HostMap {
  readonly descriptor: MapDescriptor;
  /** The mode its matches play (#476): the caller builds `matchRules` from it. */
  readonly mode: MatchMode;
  readonly walls: readonly Segment[];
  /** Its layers (ADR-0051, #3017): each one's walls and deep water, its decks, pits and ramps. */
  readonly layers: MatchLayers;
  /** Its effect zones (ADR-0053, #3024), in its order. */
  readonly zones: readonly MatchZone[];
  /** Its gates (#2691), in the descriptor's order. */
  readonly gates: readonly GateField[];
  /** Its switches (#3025), in the descriptor's order, naming gates and teleports by index. */
  readonly switches: readonly SwitchField[];
  /** Its teleports (#3030), in the descriptor's order. */
  readonly teleports: readonly TeleportField[];
  /** Its breakable walls (#3031), in the descriptor's order. */
  readonly breakables: readonly BreakableField[];
  /** Its switched decks (#3068), in its map file's order. */
  readonly switchedDecks: readonly SwitchedDeckField[];
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
  /** Its ghost spawns and any altar (#1377, #2689), `undefined` on a map without ghosts. */
  readonly ghostField: GhostField | undefined;
  /** Its shrines (#1378), `[]` but on a Capture Points map. */
  readonly capturePoints: readonly CapturePointSite[];
  /** Its start line (#2692), `undefined` but on the Elite Zaishen Battle. */
  readonly startLine: StartLine | undefined;
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
  /** What the lobby is for (#2528): the record's mode. */
  readonly mode: LobbyMode;
  /**
   * Called once, when the match is `finished` (#2528), with what it was:
   * never for a match the host closed or everyone left.
   */
  readonly publishRecord: (record: MatchRecord) => void;
  /** Wall-clock unix seconds, for the record's `endedAt`. */
  readonly nowSeconds: () => number;
  /**
   * A player key's signet bits (#2805), `0..MAX_WIRE_SIGNET`: the web
   * app's generator, which this package cannot import. Run once per seat.
   */
  readonly signetOf: (pubkey: string) => number;
  /**
   * Record the match for a replay (#3572): what the ranked flow sets. Off,
   * a match keeps nothing and pays nothing. `sha256` hashes its encoding.
   */
  readonly recordReplay: false | ReplayRecording;
  /**
   * The wait before the start (#3818): everyone held in its spawn bubble
   * until the planned players are in, then a countdown. `null` starts at
   * once.
   */
  readonly preMatch: PreMatchTimes | null;
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
  readonly team: WireTeam;
  readonly name: string;
  readonly guildTag: string | null;
  readonly heroRank: number;
  readonly guildCape: WireCape | null;
} & (
  | { readonly bot: true; readonly build: PlayerBuild }
  | {
      readonly bot: false;
      readonly build: PlayerBuild | null;
      /** The player key its lobby host saw it prove (#2706). */
      readonly playerPubkey: string;
      /** What it wears (ADR-0056), from its lobby join; relayed unread. */
      readonly cosmetics: WireCosmetics;
      /** The morale it starts at (#2686): a Heroes' Ascent run's, carried; else 0. */
      readonly startMorale: number;
    }
);

/** Weapon swaps one seat may have handled (#489): sustained, and at once. */
export const WEAPON_SWAPS_PER_SECOND = 4;
export const WEAPON_SWAP_BURST = 4;

/** What a host records a replay with (#3572). */
export interface ReplayRecording {
  /** The build playing, which a replay is only good under. */
  readonly buildHash: string;
  readonly sha256: Sha256;
}

/** How a finished match ended, as its ranked result says it (ADR-0055, #3573). */
export interface MatchEnding {
  readonly endReason: MatchEndReason;
  /** Match time, whole seconds. */
  readonly durationSeconds: number;
  /**
   * The player keys of the humans whose seat the match freed before its
   * end: a bye, a drop not back within `RECONNECT_WINDOW_SECONDS`, or a
   * planned player that left the room before taking its seat.
   */
  readonly leavers: readonly string[];
}

export interface MatchHost {
  /** Run as many whole ticks as `seconds` holds, carrying the rest. */
  advance(seconds: number): void;
  readonly phase: WireMatchPhase;
  /** The team that won, once it is `finished` with a winner; `null` until then, or for none. */
  readonly winningTeam: WireTeam | null;
  /**
   * A lobby's match nobody is playing any more: every seat is gone, and
   * every seated peer that never came has left the room. The lobby then
   * ends it, as the server did with a room everyone left.
   */
  readonly abandoned: boolean;
  /** Weapon-set intents dropped over `WEAPON_SWAPS_PER_SECOND` (#489), every seat together. */
  readonly droppedWeaponSwaps: number;
  /**
   * The finished match's replay and its hash (#3572), once hashed and sent to
   * its players; `null` before, and always for a match not recording one.
   */
  readonly replay: RecordedReplay | null;
  /** How it ended, once `finished`; `null` before, and for a match the host closed. */
  readonly ending: MatchEnding | null;
  /**
   * Finished, and its observers not yet sent the end, which reaches them
   * `OBSERVER_DELAY_SECONDS` late (#480), or its replay still hashing
   * (#3572): keep advancing it, and its room open, until then.
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
  readonly team: WireTeam;
  readonly name: string;
  /** Sanitised (#1406); `null` for none, and for a bot. */
  readonly guildTag: string | null;
  readonly heroRank: number;
  /** Sanitised (#1422); `null` for none, and whenever `guildTag` is. */
  readonly guildCape: WireCape | null;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  /** A bot plays it (#1193): no peer ever, nothing sent to one. */
  readonly bot: boolean;
  /** Its player key's signet bits (#2805), from the lobby's plan; `null` for a bot or no lobby. */
  readonly signet: number | null;
  /** Its key and what it wears (ADR-0056), from the lobby's plan; `null` for a bot or no lobby. */
  readonly worn: { readonly playerPubkey: string; readonly cosmetics: WireCosmetics } | null;
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

function wireTeam(team: number | null | undefined): WireTeam | null {
  return team === 0 || team === 1 || team === 2 ? team : null;
}

/** The charts as the wire carries them (#3564): a team there is a `WireTeam`. */
function wireChart(chart: MatchChartResult): WireMatchChart {
  return {
    ...chart,
    events: chart.events.flatMap((event): WireChartEvent[] => {
      if (event.kind !== "objective") {
        return [event];
      }
      const team = wireTeam(event.team);
      return team === null ? [] : [{ ...event, team }];
    }),
  };
}

export function createMatchHost(options: MatchHostOptions): MatchHost {
  const { transport, map, random, maxPlayers, seats: planned } = options;
  const sim = createMatchSimulation(map, options.seed, options.matchRules);
  /**
   * Everything done to `sim` between ticks, for the replay (#3572): `null`
   * when not recording, and once past `MAX_REPLAY_INPUTS`: only ever a
   * match without a lobby, where `replayBudget` has no fixed slots.
   */
  let replayLog: ReplayInput[] | null = options.recordReplay === false ? null : [];
  /** Where the recording stopped (#3572): the tick a player overran its share, and who. */
  let overrun: { readonly tick: number; readonly by: string } | null = null;
  const logInput = (input: ReplayInput): void => {
    if (replayLog !== null && replayLog.length >= MAX_REPLAY_INPUTS) {
      replayLog = null;
    }
    if (overrun === null) {
      replayLog?.push(input);
    }
  };
  let recorded: RecordedReplay | null = null;
  /**
   * Each player's share of the replay (#3572), by slot: a lobby's peer,
   * or without a lobby the player. `null` when not recording.
   */
  const replayBudget =
    options.recordReplay === false
      ? null
      : new ReplayBudget(
          planned === null ? maxPlayers : [...planned.values()].filter((plan) => !plan.bot).length,
          options.matchRules.timeLimitSeconds,
        );
  const slotOf = new Map<string, string>();
  /**
   * Charge `chars` to `playerId`'s slot's share of the replay. Past it,
   * the player has overrun: what it does is still played, and the
   * recording stops here, naming it.
   */
  const charge = (
    playerId: string,
    chars: number,
    slot = slotOf.get(playerId) ?? playerId,
  ): void => {
    if (overrun === null && replayBudget?.take(slot, chars, sim.elapsedSeconds) === false) {
      overrun = { tick: sim.tick, by: playerId };
    }
  };
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
   * The peers whose seat this host dropped, by the player that sat there,
   * until the match ends (#3772). The drop may be the host's alone: a
   * page that stalled past the transport's timeout never saw the host go,
   * so when it is heard again it is told, or it would never ask back in.
   */
  const droppedPeers = new Map<string, string>();
  /**
   * The planned peers that have not said hello yet, while they are in the
   * room. A bot never says one: it is seated at once.
   */
  const awaited = new Set(
    [...(planned ?? [])].flatMap(([peerId, plan]) => (plan.bot ? [] : [peerId])),
  );
  /** A team with a member still on the way is not empty (#2890). */
  let awaitedLogged: string | undefined;
  const syncAwaitedTeams = (): void => {
    const teams = new Set([...awaited].flatMap((peerId) => planned?.get(peerId)?.team ?? []));
    sim.setAwaitedTeams(teams);
    // Only a change: `awaited` only shrinks, so the replay holds a few.
    const logged = [...teams].join();
    if (logged !== awaitedLogged) {
      awaitedLogged = logged;
      logInput([sim.tick, "awaited", [...teams]]);
    }
  };
  syncAwaitedTeams();

  /**
   * Before the start (#3818): `waiting` for the planned players, then the
   * `countdown`, every tick held; `ticks` into it. `null` once started,
   * which the replay hears once, as `start`.
   */
  let pre: { readonly phase: "waiting" | "countdown"; ticks: number } | null =
    options.preMatch === null ? null : { phase: "waiting", ticks: 0 };
  let startLogged = false;
  const ticksOf = (seconds: number): number => Math.round(seconds / TICK_SECONDS);
  /** This tick, held until the start (#3818), the match's own after. */
  const stepOrHold = (): ReturnType<typeof sim.step> => {
    const times = options.preMatch;
    if (pre?.phase === "waiting" && times !== null) {
      if (awaited.size === 0 || pre.ticks >= ticksOf(times.joinTimeoutSeconds)) {
        pre = { phase: "countdown", ticks: 0 };
      }
    }
    if (pre?.phase === "countdown" && times !== null) {
      if (pre.ticks >= ticksOf(times.countdownSeconds)) {
        pre = null;
      }
    }
    if (pre !== null) {
      pre.ticks += 1;
      return sim.stepHeld(TICK_SECONDS);
    }
    if (!startLogged) {
      startLogged = true;
      logInput([sim.tick, "start"]);
    }
    return sim.step(TICK_SECONDS);
  };
  /** What the players are told of the wait (#3818); `null` once started. */
  const preMatch = (): WirePreMatch | null => {
    const times = options.preMatch;
    const now = pre;
    if (now === null || times === null) {
      return null;
    }
    const expected = planned === null ? seats.size : planned.size;
    const left = (seconds: number): number =>
      Math.ceil((ticksOf(seconds) - now.ticks) / RULESET.tickRateHz);
    const untilAnyway = left(times.joinTimeoutSeconds);
    return {
      joined: expected - awaited.size,
      expected,
      secondsLeft:
        now.phase === "countdown"
          ? left(times.countdownSeconds)
          : untilAnyway <= STARTING_ANYWAY_SECONDS
            ? untilAnyway
            : null,
    };
  };
  /** At most one per peer: a new rejoin hello kills the old nonce. */
  const challenges = new Map<string, Challenge>();
  /**
   * The proof being checked for each peer, until it leaves the room: only
   * the latest of a peer's proofs may seat it.
   */
  const proving = new Map<string, object>();
  /** Each team's called foe and pings (#443), shown to that team alone. */
  const calls = createCallBoard(map.descriptor);
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
  /** The respawns each team was last sent (#3367), to send again only on a change. */
  const respawnsSent = new Map<Team, string>([
    [0, "[]"],
    [1, "[]"],
  ]);
  let seated = 0;
  /** The player keys of the humans whose seats were freed (`MatchEnding.leavers`). */
  const freedKeys = new Set<string>();
  let ending: MatchEnding | null = null;
  /**
   * The seats the match had, in seat order: whoever left still has a line
   * in the summary (#1057), under the name they joined with. At most
   * `MAX_LOBBY_PLAYERS`, all `ended` carries: past it, the earliest seat
   * no longer held goes (`seatNew`). Each with the build it played, for
   * the match record (#2528).
   */
  const everSeated = new Map<
    string,
    {
      readonly name: string;
      readonly guildTag: string | null;
      readonly heroRank: number;
      readonly team: WireTeam;
      readonly bot: boolean;
      readonly pubkey: string | null;
      readonly signet: number | null;
      readonly build: PlayerBuild;
    }
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
  /** The match's series and events, for the charts at its end (#3564). */
  const chart = new MatchChart(
    (id) => everSeated.get(id)?.team ?? teams.get(id),
    (id) => everSeated.has(id),
    options.matchRules.timeLimitSeconds,
  );
  /** One whole-number line per seat the match ever had. */
  const summary = (): WireSummaryRow[] =>
    [...everSeated].map(([id, { name, guildTag, heroRank, team, signet }]) => {
      const row = tally.row(id);
      return {
        id,
        name,
        guildTag,
        heroRank,
        team,
        signet,
        damage: Math.round(row.damage),
        healing: Math.round(row.healing),
        taken: Math.round(row.taken),
        kills: row.kills,
        deaths: row.deaths,
        interrupts: row.interrupts,
      };
    });
  /** The finished match as the world may read it (#2528): names, public keys and builds, no peer ids. */
  const record = (endReason: MatchEndReason): MatchRecord => {
    const team = (side: number): MatchRecordTeam => ({
      players: [...everSeated.values()]
        .filter((seat) => seat.team === side)
        .map(({ name, guildTag, bot, pubkey, build }) => ({
          name,
          guildTag,
          bot,
          pubkey,
          template: recordTemplate(build),
        })),
    });
    return {
      v: MATCH_RECORD_VERSION,
      mode: options.mode,
      map: map.descriptor.id,
      endedAt: Math.floor(options.nowSeconds()),
      durationSeconds: Math.round(sim.elapsedSeconds),
      winningTeam: sim.outcome.winningTeam ?? null,
      endReason,
      teams: teamIds(map.descriptor.teamCount).map(team),
    };
  };
  let accumulator = 0;
  let finished = false;
  /** Handed its room on: see `MatchHost.retire`. */
  let retired = false;
  /** Its replay hashing, not yet sent (#3572): the room stays until it is. */
  let replaySending = false;
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

  const refuse = (peerId: string, reason: PeerRefuse["reason"]): void => {
    const refusal: PeerRefuse = { reason };
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
   * `team`'s compass lines drawn since the last tick to every seated peer
   * of it, each its own (#2391): only the new ones, never a broadcast.
   */
  const sendStrokes = (team: Team): void => {
    const message: WireStrokes = { segments: calls.freshStrokes(team, sim.elapsedSeconds) };
    if (message.segments.length === 0) {
      return;
    }
    for (const seat of seats.values()) {
      if (seat.team === team && seat.peerId !== undefined) {
        transport.send("strokes", message, seat.peerId);
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

  /** Every seat's cape (#3554): told once, not in every snapshot. */
  const capes = (): WireCapes => ({
    capes: [...seats.values()].flatMap((seat) =>
      seat.guildCape === null ? [] : [{ id: seat.playerId, cape: seat.guildCape }],
    ),
  });
  /** Every keyed seat's cosmetics to `to` (ADR-0056), a message a seat: all of them do not fit one. */
  const tellCosmetics = (to: string): void => {
    for (const seat of seats.values()) {
      if (seat.worn !== null) {
        const told: WireSeatCosmetics = { id: seat.playerId, ...seat.worn };
        transport.send("cosmetics", told, to);
      }
    }
  };

  /**
   * `team`'s dead and when each comes back (#3367): a foe's respawn is
   * hidden information, so this is all a peer ever hears of them.
   */
  const respawnsOf = (team: Team): WireRespawns => ({
    respawns: [...sim.participants()]
      .flatMap((participant) => {
        const seconds = respawnIn(participant);
        return participant.combatant.team !== team || seconds === undefined
          ? []
          : [{ id: participant.id, respawnIn: seconds }];
      })
      .slice(0, MAX_WIRE_ACTORS),
  });

  /**
   * `team`'s respawns to every seated peer of it, each its own, never a
   * broadcast, when they changed since it was last sent them (#3367):
   * about once a second while any of it is dead.
   */
  const sendRespawns = (team: Team): void => {
    const view = respawnsOf(team);
    const key = JSON.stringify(view.respawns);
    if (key === respawnsSent.get(team)) {
      return;
    }
    respawnsSent.set(team, key);
    for (const seat of seats.values()) {
      if (seat.team === team && seat.peerId !== undefined) {
        transport.send("respawns", view, seat.peerId);
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
    droppedPeers.delete(peerId);
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
    // A rejoin sees the call its team has up, its lines, its traps and its dead.
    transport.send("calls", calls.view(seat.team, sim.elapsedSeconds), peerId);
    transport.send("strokes", { segments: calls.strokes(seat.team, sim.elapsedSeconds) }, peerId);
    transport.send("traps", trapsOf(seat.team), peerId);
    transport.send("respawns", respawnsOf(seat.team), peerId);
    transport.send("capes", capes(), peerId);
    tellCosmetics(peerId);
  };

  /** What the next seat on `team` playing `build` is set up as. */
  const nextSetup = (
    build: PlayerBuild,
    team: WireTeam,
    bot: boolean,
    startMorale: number,
  ): SeatSetup => ({
    id: `player-${String(seated + 1)}`,
    team,
    build,
    // Counted on the team, so each side fills its own points in turn
    // rather than every other player of a team landing on one.
    teammates: [...seats.values()].filter((seat) => seat.team === team).length,
    bot,
    startMorale,
  });

  /**
   * A new seat on `team` playing `loadout`, named by `nameOf` its player
   * id and of `guild`, wearing `worn` and marked with its key's signet, at
   * `startMorale`; a bot's if `bot`.
   */
  const seatNew = (
    build: PlayerBuild,
    team: WireTeam,
    nameOf: (playerId: string) => string,
    guild: Guild,
    bot: boolean,
    worn: Seat["worn"],
    startMorale: number,
  ): Seat => {
    const setup = nextSetup(build, team, bot, startMorale);
    seated += 1;
    const pubkey = worn?.playerPubkey ?? null;
    const signet = pubkey === null ? null : options.signetOf(pubkey);
    // Back in its seat: it did not leave after all.
    if (pubkey !== null) {
      freedKeys.delete(pubkey);
    }
    const playerId = setup.id;
    const loadout = loadoutOf(build);
    sim.add(participantSpec(map, setup));
    logInput([sim.tick, "add", setup]);
    const seat: Seat = {
      playerId,
      team,
      name: nameOf(playerId),
      guildTag: guild.guildTag,
      heroRank: guild.heroRank,
      guildCape: guild.guildCape,
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      bot,
      signet,
      worn,
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
    if (seat.guildCape !== null) {
      transport.send("capes", capes(), [...players(), ...observers]);
    }
    if (worn !== null) {
      const told: WireSeatCosmetics = { id: playerId, ...worn };
      transport.send("cosmetics", told, [...players(), ...observers]);
    }
    everSeated.set(playerId, {
      name: seat.name,
      guildTag: seat.guildTag,
      heroRank: seat.heroRank,
      team,
      bot,
      pubkey,
      signet,
      build,
    });
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
      refuse(from, "protocol-mismatch");
      return;
    }
    const hello = parsePeerHello(data);
    if (hello === undefined) {
      return;
    }
    if (finished) {
      refuse(from, "match-over");
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
      refuse(from, "protocol-mismatch");
      return;
    }
    const observe = parsePeerObserve(data);
    if (observe === undefined) {
      return;
    }
    // A player has a seat and a viewer none: one peer is never both.
    if (seatOfPeer.has(from) || !options.isSpectator(from)) {
      refuse(from, "not-a-spectator");
      return;
    }
    if (observe.matchId !== options.matchId) {
      refuse(from, "wrong-match");
      return;
    }
    // Over, and its end already sent on to whoever watched.
    if (finished && delayed.length === 0) {
      refuse(from, "match-over");
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
    transport.send("capes", capes(), from);
    tellCosmetics(from);
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
      refuse(from, "match-full");
      return;
    }
    // The lobby's build if it assigned one, whatever the hello brings (#1458).
    const build = plan?.build ?? resolveJoinLoadout(hello.build, RULESET.attributes, random).build;
    // Without a plan, teams alternate as players arrive, so a 1v1 is
    // adversarial by default.
    const team: WireTeam = plan?.team ?? (seats.size % 2 === 0 ? 0 : 1);
    // A lobby's carried Heroes' Ascent morale (#2686); without a lobby, none.
    const startMorale = plan === undefined ? 0 : plan.startMorale;
    // The seat pays for its add, and for its remove, drop and forfeit to come.
    const setup = nextSetup(build, team, false, startMorale);
    const slot = plan === undefined ? setup.id : from;
    const joinChars =
      inputChars([sim.tick, "add", setup]) +
      latestInputChars("remove", setup.id) +
      latestInputChars("drop", setup.id) +
      FORFEIT_CHARS;
    charge(setup.id, joinChars, slot);
    awaited.delete(from);
    syncAwaitedTeams();
    // The lobby's name, tag and cape, whatever the hello says (#53,
    // #1406, #1422). Without a lobby they are the peer's to choose, so
    // they are sanitised before anyone sees them.
    const seat = seatNew(
      build,
      team,
      (playerId) => plan?.name ?? sanitizeName(hello.name, playerId),
      plan ?? sanitizeGuild(hello),
      false,
      plan === undefined ? null : { playerPubkey: plan.playerPubkey, cosmetics: plan.cosmetics },
      startMorale,
    );
    slotOf.set(seat.playerId, slot);
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
      refuse(from, "match-over");
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
    // Each rejoin pays for the drop that may follow it.
    charge(held.playerId, latestInputChars("drop", held.playerId));
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
    const input: ReplayInput = [sim.tick, "intent", seat.playerId, intent];
    charge(seat.playerId, inputChars(input));
    const refusal = applyIntent(sim, seat.playerId, intent);
    // Refused ones too: the sim heard them, and a refusal can still change it.
    logInput(input);
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
    // It may change the team's call twice: now, and when it lapses.
    charge(seat.playerId, 2 * CALLED_CHARS);
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
    const pubkey = everSeated.get(seat.playerId)?.pubkey ?? null;
    if (!seat.bot && pubkey !== null && !finished) {
      freedKeys.add(pubkey);
    }
    sim.remove(seat.playerId);
    logInput([sim.tick, "remove", seat.playerId]);
    seats.delete(seat.playerId);
    swapBudget.forget(seat.playerId);
    if (!seat.bot) {
      forfeitIfNoHumans(seat.team);
    }
  };

  /**
   * Henchmen never carry a Heroes' Ascent side alone (#2688): a side with
   * no human seated and none still on the way is out, and its bots go.
   */
  const forfeitIfNoHumans = (team: WireTeam): void => {
    const side = [...seats.values()].filter((seat) => seat.team === team);
    if (
      options.mode !== "heroes-ascent" ||
      // The Zaishen are HA's one all-NPC side (#2692).
      (map.startLine !== undefined && team === 1) ||
      side.some((seat) => !seat.bot) ||
      [...awaited].some((peerId) => planned?.get(peerId)?.team === team)
    ) {
      return;
    }
    for (const bot of side) {
      free(bot);
    }
    const teams = [...(planned?.values() ?? []), ...seats.values()].map((seat) => seat.team);
    sim.forfeit(team, new Set(teams));
    logInput([sim.tick, "forfeit", team, [...new Set(teams)]]);
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
    const plan = awaited.delete(peerId) ? planned?.get(peerId) : undefined;
    syncAwaitedTeams();
    if (plan !== undefined && !finished) {
      if (!plan.bot) {
        freedKeys.add(plan.playerPubkey);
      }
      forfeitIfNoHumans(plan.team);
    }
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
    droppedPeers.set(peerId, seat.playerId);
    seat.recharges = undefined;
    seat.adrenaline = undefined;
    seat.chainMarks = undefined;
    seat.skillBar = undefined;
    seat.weaponSets = undefined;
    // Frozen, not left running into a wall while away.
    sim.setInputDirection(seat.playerId, ZERO);
    sim.get(seat.playerId)?.combatant.cast.cancelCast();
    logInput([sim.tick, "drop", seat.playerId]);
  });

  // A dropped peer heard again is told its seat is held, or that it is
  // gone (#3772); a peer the host never dropped hears nothing.
  transport.onPeerJoin((peerId) => {
    const playerId = droppedPeers.get(peerId);
    if (playerId === undefined || finished || retired) {
      return;
    }
    const held = seats.get(playerId);
    const dropped: PeerSeatDropped = {
      playerId,
      expired: held?.droppedAt === undefined,
    };
    transport.send("seat-dropped", dropped, peerId);
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
      layer: participant.layer,
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
      // Up, so a client never shows a teleport ready before the host has it.
      teleportReadyAt: Math.ceil(participant.teleportReadyAt * 10) / 10,
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
    score: [...sim.score.byTeam.values()],
    phase: sim.phase === "finished" ? "finished" : (pre?.phase ?? "active"),
    preMatch: preMatch(),
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
      fromLayer: shot.fromLayer,
      toLayer: shot.toLayer,
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
    gates: sim.gates.map((gate) => gate.open),
    switches: sim.switches.map((lever) => lever.up),
    teleports: sim.teleports.map((teleport) => teleport.on),
    breakables: sim.breakables.map((breakable) => breakable.health),
    decks: sim.switchedDecks.map(({ up, crossings }) => ({ up, cracks: crossings })),
    lifts: sim.lifts.map(({ phase, progress }) => ({ phase, progress })),
    capturePoints: sim.capturePoints.map((point) => ({
      x: point.position.x,
      y: point.position.y,
      layer: point.layer,
      owner: wireTeam(point.owner),
      capturer: wireTeam(point.capturer),
      // Within [0, 1] by construction; rounded as the other floats are.
      progress: round(point.progress, 3),
    })),
  });

  /**
   * The finished match's replay to `to` (#3572), once hashed, up to where
   * a player overran; none when not recording, past `MAX_REPLAY_INPUTS`
   * or `MAX_REPLAY_CHARS`.
   */
  const sendReplay = (to: readonly string[]): void => {
    const recording = options.recordReplay;
    if (recording === false || replayLog === null) {
      return;
    }
    const replay: MatchReplay = {
      buildHash: recording.buildHash,
      seed: options.seed,
      map: map.descriptor.id,
      teamCount: map.descriptor.teamCount,
      mode: options.mode,
      ticks: overrun?.tick ?? sim.tick,
      overrunBy: overrun?.by ?? null,
      inputs: replayLog,
    };
    // Finished: nothing done after it is part of it.
    replayLog = null;
    const text = encodeReplay(replay);
    if (text.length > MAX_REPLAY_CHARS) {
      return;
    }
    replaySending = true;
    void textHash(text, recording.sha256)
      .then((hash) => {
        const parts = packReplay(text, hash, MAX_MESSAGE_BYTES);
        if (parts.length > MAX_REPLAY_PARTS) {
          return;
        }
        recorded = { hash, replay };
        for (const part of parts) {
          transport.send("match-replay", part, to);
        }
      })
      .finally(() => {
        replaySending = false;
      });
  };

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

  /** Each team's call as the replay last has it: a stroke changes no target. */
  const calledLogged = new Map<WireTeam, string | null>();
  const tick = (): void => {
    for (const participant of sim.participants()) {
      teams.set(participant.id, participant.combatant.team);
    }
    const result = stepOrHold();
    expireDropped();
    for (const team of calls.step(sim.elapsedSeconds, isAlive)) {
      callsDirty.add(team);
    }
    for (const team of callsDirty) {
      // Its bots fight the called foe (#1193).
      const target = calls.view(team, sim.elapsedSeconds).target?.targetId;
      sim.setCalledTarget(team, target);
      if (calledLogged.get(team) !== (target ?? null)) {
        calledLogged.set(team, target ?? null);
        logInput([sim.tick, "called", team, target ?? null]);
      }
      sendCalls(team);
    }
    callsDirty.clear();
    sendStrokes(0);
    sendStrokes(1);
    sendTraps(0);
    sendTraps(1);
    sendRespawns(0);
    sendRespawns(1);
    // To the players, never the room (#480): a spectator in it watches
    // through `delayed` alone. One send to them all, so each part is
    // serialized once, not once per player.
    const live = players();
    const parts = packSnapshot(snapshot(), MAX_MESSAGE_BYTES);
    for (const part of parts) {
      transport.send("snapshot", part, live);
    }
    tally.add(result.log);
    chart.add(result.log, sim);
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
      ending = {
        endReason: sim.outcome.reason ?? "time",
        durationSeconds: Math.round(sim.elapsedSeconds),
        leavers: [...freedKeys],
      };
      ended = {
        winningTeam: wireTeam(sim.outcome.winningTeam),
        endReason: sim.outcome.reason ?? "time",
        summary: summary(),
        clearSeconds: sim.clearSeconds,
      };
      transport.send("ended", ended, live);
      // After the summary, so its size never holds the summary up.
      for (const part of packMatchChart(
        wireChart(chart.result([...everSeated.keys()])),
        MAX_MESSAGE_BYTES,
      )) {
        transport.send("match-chart", part, live);
      }
      sendReplay(live);
      // The Elite Zaishen Battle has no opposing players to record (#2692).
      if (map.startLine === undefined) {
        options.publishRecord(record(sim.outcome.reason ?? "time"));
      }
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
      seatNew(plan.build, plan.team, () => plan.name, NO_GUILD, true, null, 0);
    }
  }

  // A human away when the stage clock ran out left only bots planned (#2688).
  for (const team of new Set([...(planned?.values() ?? [])].map((plan) => plan.team))) {
    forfeitIfNoHumans(team);
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
      return finished ? "finished" : (pre?.phase ?? "active");
    },
    get winningTeam() {
      return sim.phase === "finished" ? wireTeam(sim.outcome.winningTeam) : null;
    },
    get abandoned() {
      return planned !== null && awaited.size === 0 && seats.size === 0;
    },
    get replay() {
      return recorded;
    },
    get ending() {
      return ending;
    },
    get droppedWeaponSwaps() {
      return droppedWeaponSwaps;
    },
    get draining() {
      return finished && (delayed.length > 0 || replaySending);
    },
    retire() {
      retired = true;
    },
    async close(reason) {
      // Nothing more is ticked onto a transport that has left.
      finished = true;
      observers.clear();
      delayed = [];
      const ended: WireEnded = {
        winningTeam: null,
        endReason: reason,
        summary: summary(),
        clearSeconds: null,
      };
      transport.send("ended", ended);
      await transport.leave();
    },
  };
}

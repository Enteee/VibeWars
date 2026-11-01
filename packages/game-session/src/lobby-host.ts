import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  STARTER_BUILDS,
  getProfession,
  parsePlayerBuild,
  validatePlayerBuild,
  type PlayerBuild,
} from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  MAX_TEAM_LOBBY_SIDE,
  PROTOCOL_VERSION,
  TEAM_LOBBY_STAGE_SECONDS,
  helloProtocolVersion,
  isTeamQueueMode,
  parsePeerChat,
  parsePeerLobbyHello,
  parsePeerLobbyLeave,
  parsePeerLobbyJoin,
  parsePeerPartyConsent,
  parsePeerStayTogether,
  parseWireLobbyCommand,
  teamQueueModeOf,
  teamSizeOf,
  type LobbyMode,
  type LobbyPhase,
  type PeerLobbyJoin,
  type LobbyRefusal,
  type WireCape,
  type WireChatLine,
  type WireLobbyCommand,
  type WireLobbyNote,
  type WireLobbyState,
  type WireLobbyWelcome,
  type WireMatchStart,
  type WirePartyFormed,
  type WirePartyProposal,
  type WireLobbyMove,
  type WirePartySplit,
  type WireTeamChoice,
  type WireTeamProposalBuilds,
  type WireTeamLobby,
  type WireTeamSide,
} from "@vibewars/game-protocol";

import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";
import type { LobbyCharacter, PartyPlanSeat } from "./lobby-connection.js";
import { keyGated } from "./key-gate.js";
import { createLocalPeer } from "./local-peer.js";
import {
  RECONNECT_WINDOW_SECONDS,
  type MatchHost,
  type PlannedSeat,
  type PlannedSeats,
} from "./match-host.js";
import { sanitizeCharacterName, sanitizeChatText, sanitizeGuild, sanitizeName } from "./names.js";
import {
  admissionDigest,
  partyGroupId,
  type QueuedSeat,
  type VerifyTicketSig,
} from "./queue-admission.js";
import { ticketsOf } from "./queue-formation.js";
import { scopeTransport } from "./scoped-transport.js";
import { decideStayTogether } from "./stay-together.js";
import { sizeChecked, type Transport } from "./transport.js";

/**
 * The pre-match lobby, hosted in one player's browser (#15, #379): the
 * server's lobby room over a `Transport`. Peers say `lobby-join` to come
 * in, send `lobby-cmd`s, and get the whole lobby back on every change.
 * The host's own player is one more peer (`createLocalPeer`), and the
 * lobby's host is its match's host: when it goes, the lobby ends.
 *
 * Nothing here reads a clock: whoever drives it calls `advance`, which
 * runs the match while there is one.
 */

/**
 * Chat lines a peer may send (#479): five in five seconds, refilling one
 * a second. Its own budget, apart from the lobby's commands.
 */
export const CHAT_LINES_PER_SECOND = 1;
export const CHAT_BURST = 5;

/**
 * From a party's proposal, on the lobby's clock, until each member must
 * have sent a consent that verifies, or the team splits (#1078).
 */
export const PARTY_CONSENT_MS = 5000;

/** A party every winner said yes to, waiting for each one's consent (#1078). */
interface PartyProposal {
  /** Their keys in party order (`inPartyOrder`). */
  readonly members: readonly string[];
  /** Each yes-voter's peer to its key. */
  readonly keys: ReadonlyMap<string, string>;
  /** What each consent signs: the group won and exactly these members. */
  readonly digest: Promise<Uint8Array>;
  /** Each verified consent, by member key. */
  readonly consents: Map<string, string>;
  /** Peers whose consent is being checked: one each, still. */
  readonly checking: Set<string>;
  /** On the lobby's clock. */
  readonly endsAt: number;
  /** Formed or split, and those it concerns told. */
  settled: boolean;
}

/** One side of a Team Lobby (#1458), as its host keeps it. */
interface TeamSide {
  /** Its team mode's size; `null` in a Hosted Game, which plays what it chose (#2029). */
  readonly size: number | null;
  /** Each proposer's builds, `size` legal ones, in the order proposed. */
  readonly proposals: Map<string, readonly PlayerBuild[]>;
  /** Each proposer's slots of its next proposal, as they arrive, one a message. */
  readonly pending: Map<string, (PlayerBuild | undefined)[]>;
  /** Each voter's proposer. */
  readonly votes: Map<string, string>;
  /** Once the vote is over. */
  chosen:
    | {
        readonly proposerId: string | null;
        readonly reason: WireTeamChoice["reason"];
        readonly builds: readonly PlayerBuild[];
      }
    | undefined;
  /** In the claim, the member holding each slot of `chosen`. */
  claims: (string | null)[];
}

/**
 * One seat of a team mode's side, as its party host plans it (ADR-0042):
 * the human `memberKey` or, `null`, a bot, and the build it plays,
 * `null` for one that is not legal here.
 */
interface TeamPlanSeat {
  readonly memberKey: string | null;
  readonly build: PlayerBuild | null;
}

/** A side's seat plan, its seats as they arrive, one a message. */
interface TeamPlan {
  readonly size: number;
  readonly seats: Map<number, TeamPlanSeat>;
}

/** A Team Lobby (#1458): both sides vote, then claim, on one clock. */
interface TeamLobby {
  stage: "vote" | "claim";
  /** In whole ms, on the lobby's clock. */
  endsAt: number;
  readonly sides: readonly [TeamSide, TeamSide];
  /** A team mode's (#1766): side 0 alone, the party, which queues once it ends. */
  readonly forQueue: boolean;
  /** The Heroes' Ascent round the party queues at (#1996); `null` in other modes. */
  readonly ascentRound: number | null;
}

/** One seat of a queueing party's side (#1766): its human's peer, `null` for a bot, and its build. */
export interface PartySeat {
  readonly holder: string | null;
  readonly build: PlayerBuild;
}

/**
 * A coded lobby's team-mode matchmaking (#1766): what its party's group
 * and consents are worked out with.
 */
export interface LobbyMatchmakingOptions {
  /** The lobby's derived room id (`deriveLobbyRoom`), never its key (ADR-0043). */
  readonly roomId: string;
  readonly verifyTicketSig: VerifyTicketSig;
  /** A fresh queue nonce: 64 lowercase hex digits, from a CSPRNG. */
  readonly newNonce: () => string;
}

/** A lobby's match, as the lobby hands it to whoever builds the `MatchHost`. */
export interface MatchPlan {
  readonly matchId: string;
  readonly mapId: string;
  /** Every member on a team, by peer id; spectators are not in it. */
  readonly seats: PlannedSeats;
  /** Whether `peerId` is a member on no team, now (#480): who may watch the match. */
  readonly isSpectator: (peerId: string) => boolean;
  /** The room, for this match alone: build the `MatchHost` on it. */
  readonly transport: Transport;
}

/**
 * A lobby the queue started (#871, #854 C5-C7): the group's teams and map
 * are fixed, only its tickets get in, each on its planned team, and
 * nobody picks or readies. In a team mode (ADR-0042), each side's party
 * host sends its seat plan, and the side plays it, bots and all. Once all are seated a countdown
 * runs, then the match; not all seated by the timeout, and everyone is
 * sent off. `key` is the host's own ticket key, the group's host ticket.
 */
export interface QueuedPlan extends QueuedSeat {
  readonly countdownSeconds: number;
  /** From the lobby's start, on its clock. */
  readonly timeoutSeconds: number;
  /** The lobby timed out without the `noShows` ticket ids; it has closed. */
  readonly onFellThrough: (noShows: readonly string[]) => void;
  /**
   * How long after its match the lobby waits for the winners to say
   * whether they stay together (#882), on its clock. Only a team of more
   * than one votes.
   */
  readonly stayTogetherSeconds: number;
  /**
   * Its match is over and nobody waits on this lobby any more: the vote,
   * if there was one, is decided and its winners have left, or its window
   * ran out. Once; the caller closes the lobby.
   */
  readonly onDone: () => void;
}

export interface LobbyHostOptions {
  /** The room named by the code. */
  readonly transport: Transport;
  readonly code: string;
  /**
   * What a peer proves the lobby key with (#1681, `LobbyRoom`): nobody
   * is in the room for this lobby until they have. `null` exactly for
   * a queued lobby, whose room is public and whose tickets gate it.
   */
  readonly proofKey: Uint8Array | null;
  /** The playable maps, from game-maps by the caller. The first is the default. */
  readonly mapIds: readonly string[];
  /**
   * Each mode's maps (#1526), some of `mapIds`, the first its default: a
   * mode the host picks moves a map outside it to that one.
   */
  readonly modeMaps: Readonly<Record<LobbyMode, readonly string[]>>;
  /** Build the match for `plan`. Injected, so a test can play a fake one. */
  readonly startMatch: (plan: MatchPlan) => MatchHost;
  /** The queue's lobby, not a coded one; its map must be one of `mapIds`. */
  readonly queued?: QueuedPlan;
  /**
   * Hosted from Team Play (#1458): everyone ready goes to a Team Lobby,
   * where each side votes on a Team Build, then claims its characters,
   * before the match. Never a queued lobby.
   */
  readonly teamLobby: boolean;
  /** A coded lobby's party may queue in a team mode (#1766); never a queued lobby's. */
  readonly matchmaking?: LobbyMatchmakingOptions;
  /** In [0, 1): what a Team Lobby picks at random. Injected, so a test can seed it. */
  readonly random: () => number;
}

/**
 * Whether a lobby is open and how many guests it has (#1682): what
 * decides if its host must be in its room at all.
 */
export interface LobbyReach {
  readonly open: boolean;
  /** Peers in it other than the host's own player, away ones too; never bots. */
  readonly guests: number;
}

export interface LobbyHost {
  /** The host's own player's side of the room: it joins the lobby, and plays, through this. */
  readonly local: Transport;
  /**
   * A queued party's team plan (#1766, ADR-0042), seat by seat, its host's
   * own seat under `selfKey`; `undefined` while it is not queued.
   */
  teamPlan(selfKey: string): readonly PartyPlanSeat[] | undefined;
  /**
   * Let peers that prove the key join, or stop them (#1682). A coded
   * lobby starts closed; closing keeps the guests already in. A queued
   * lobby is always open, and this does nothing to it.
   */
  setOpen(open: boolean): void;
  /** `handler` now, and on every change of the lobby's `LobbyReach`. */
  onReach(handler: (reach: LobbyReach) => void): () => void;
  /** Run `seconds` of the lobby's match, if one is on, and notice when it ends. */
  advance(seconds: number): void;
  /**
   * Send everyone off, end the match if one is on, and leave the room.
   * With `moveTo`, the key of the lobby its host has just joined
   * (#1553), each guest is told to follow it there first; bots belong to
   * this lobby and go with it.
   */
  close(moveTo?: string): Promise<void>;
}

interface Member {
  readonly id: string;
  name: string;
  /** Sanitised (#1406); `null` for none, and for a bot. */
  guildTag: string | null;
  /** Sanitised (#1422); `null` for none, and whenever `guildTag` is. */
  guildCape: WireCape | null;
  team: 0 | 1 | null;
  ready: boolean;
  /** The seat key it was admitted on, in a queued lobby (#882). */
  readonly seatKey: string | null;
  /**
   * A bot's build (#1193): it has no peer, is always ready and plays
   * this, a slot nobody claimed (#2029).
   */
  bot: PlayerBuild | null;
}

/** Whether `member` counts as ready: a bot always is (#1193). */
const isReady = (member: Member): boolean => member.bot !== null || member.ready;

/** Whether the lobby satisfies the rules for starting, and if not, why. */
export function canStart(
  players: readonly { readonly team: 0 | 1 | null; readonly ready: boolean }[],
): { ok: true } | { ok: false; reason: string } {
  const assigned = players.filter((player) => player.team !== null);
  if (assigned.length === 0) {
    return { ok: false, reason: "nobody has joined a team" };
  }
  if (!assigned.every((player) => player.ready)) {
    return { ok: false, reason: "not everyone on a team is ready" };
  }
  return { ok: true };
}

export function createLobbyHost(options: LobbyHostOptions): LobbyHost {
  const { code, mapIds, startMatch, queued, random } = options;
  const [defaultMap] = mapIds;
  if (defaultMap === undefined) {
    throw new Error("a lobby needs at least one map");
  }
  if (queued !== undefined && !mapIds.includes(queued.group.mapId)) {
    throw new Error(`a queued lobby's map ${queued.group.mapId} is not one of its maps`);
  }
  if (queued !== undefined && queued.key.ticketId !== queued.group.hostTicketId) {
    throw new Error("a queued lobby is hosted by its group's host ticket");
  }
  for (const [mode, ids] of Object.entries(options.modeMaps)) {
    if (ids.length === 0 || !ids.every((id) => mapIds.includes(id))) {
      throw new Error(`mode ${mode}'s maps are not some of the lobby's`);
    }
  }
  if (queued !== undefined && options.teamLobby) {
    throw new Error("a queued lobby has no Team Lobby");
  }
  const { matchmaking } = options;
  if (queued !== undefined && matchmaking !== undefined) {
    throw new Error("a queued lobby's party does not queue again");
  }
  if ((queued === undefined) !== (options.proofKey !== null)) {
    throw new Error("a lobby is gated on its key unless it is queued");
  }
  // Its match is on a scope of this room, so this checks every message the
  // host sends, the match's too, and the key gate keeps both from anyone
  // who has not proven the key.
  const gated =
    options.proofKey === null
      ? options.transport
      : keyGated(options.transport, options.proofKey, "host");
  const { host: transport, local } = createLocalPeer(sizeChecked(gated));
  /** In the order they joined, which is the order they are listed in. */
  const members = new Map<string, Member>();
  /** The member peer `peerId` is: never a bot, whatever a peer calls itself (#1193). */
  const peerMember = (peerId: string): Member | undefined => {
    const member = members.get(peerId);
    return member?.bot === null ? member : undefined;
  };
  /**
   * Members whose peer dropped (#596, #1764), and when, on the lobby's
   * clock: their seat is held, team and all, for the reconnect window,
   * or until the match it dropped from ends, whichever is first.
   */
  const away = new Map<string, number>();
  const budget = new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST, () => undefined);
  const chatBudget = new MessageBudget(CHAT_LINES_PER_SECOND, CHAT_BURST, () => undefined);
  /** Peers already told their lines are dropped, until one gets through: once a burst. */
  const throttled = new Set<string>();
  /** Peers a queued lobby has welcomed: each once, while it is here. */
  const welcomed = new Set<string>();
  /** Peers whose queued join was checked, admitted or not: each once, while it is here. */
  const judged = new Set<string>();
  let phase: LobbyPhase = "waiting";
  let mapId = queued?.group.mapId ?? defaultMap;
  /** The host's pick on the rail (#1526). */
  let mode: LobbyMode = "random-arena";
  /** Whether a peer with the key may join (#1682). */
  let open = queued !== undefined;
  const reachHandlers = new Set<(reach: LobbyReach) => void>();
  /** The reach handlers were last told, to tell them only of a change. */
  let toldReach: LobbyReach = { open, guests: 0 };
  let joined = 0;
  /** Bots ever added (#1193), for their ids. */
  let bots = 0;
  let matches = 0;
  /** The lobby's clock: the seconds `advance` was given, for the budget. */
  let elapsed = 0;
  let match:
    { readonly id: string; readonly host: MatchHost; readonly room: Transport } | undefined;
  /**
   * Matches over, still sending their observers the end, which reaches
   * them late (#480). Each room is left once its match has.
   */
  const draining: { readonly host: MatchHost; readonly room: Transport }[] = [];
  let closed = false;
  /** A queued lobby's countdown: when it ends, in whole ms on the lobby's clock, while it runs. */
  let countdownEndsAt: number | undefined;
  /** A queued lobby starts its match once; after it, the lobby only waits. */
  let queuedStarted = false;
  /** A queued lobby's Stay together, from its match's end (#882). */
  let vote:
    | {
        readonly teamSize: number;
        /** The winning side's peers as the match ended. */
        readonly winners: readonly string[];
        readonly votes: Map<string, string | null>;
        /** On the lobby's clock. */
        readonly endsAt: number;
        decided: boolean;
        /** Once every winner said yes: the party each must consent to (#1078). */
        proposal: PartyProposal | undefined;
      }
    | undefined;
  /** `onDone` was called. */
  let queuedDone = false;
  /** While `phase` is `"team-lobby"`. */
  let teamLobby: TeamLobby | undefined;
  /**
   * A team mode's party, from its Team Lobby's end until it leaves the
   * queue or plays the house team (#1766), while `phase` is `"queued"`.
   */
  let queueing:
    | {
        readonly nonce: string;
        /** The Heroes' Ascent round it queues at (#1996); `null` in other modes. */
        readonly ascentRound: number | null;
        readonly seats: readonly PartySeat[];
        /** On the lobby's clock: by then a party of more than one has every key, or leaves the queue. */
        readonly endsAt: number;
        /** `partyGroupId(roomId, nonce)`, once worked out. */
        groupId: string | undefined;
        /** Each party member's key, by peer, as it sent it. */
        readonly keys: Map<string, string>;
        /** Once every member sent its key: the party each must consent to. */
        proposal: PartyProposal | undefined;
      }
    | undefined;
  /** A team mode's queued lobby: each side's seat plan so far (ADR-0042). */
  const teamPlans: [TeamPlan | undefined, TeamPlan | undefined] = [undefined, undefined];

  const nowMs = (): number => elapsed * 1000;
  /** The clock in whole ms, so a countdown of ticks that do not add up exactly still ends. */
  const clockMs = (): number => Math.round(nowMs());

  /** Each human on `team`, in join order. */
  const humansOn = (team: 0 | 1): Member[] =>
    [...members.values()].filter((member) => member.bot === null && member.team === team);

  /** Who breaks a tie on `team`: the host on its own side, else its earliest-joined human. */
  const captainOf = (team: 0 | 1): string | null => {
    const humans = humansOn(team);
    return (humans.find((member) => member.id === local.selfId) ?? humans[0])?.id ?? null;
  };

  /** What a build is called on the wire: its name, cut at a word, and professions. */
  const characterOf = (build: PlayerBuild): LobbyCharacter => ({
    name: sanitizeCharacterName(build.name, getProfession(build.primaryProfession).name),
    primary: build.primaryProfession,
    secondary: build.secondaryProfession ?? null,
  });

  /** `team`'s side as its own members see it. */
  const wireSide = (lobby: TeamLobby, team: 0 | 1): WireTeamSide => {
    const side = lobby.sides[team];
    return {
      size: side.size,
      captainId: captainOf(team),
      // The vote's, over in the claim: a side's state fits one message (#1458).
      proposals: (lobby.stage === "vote" ? [...side.proposals] : []).map(
        ([proposerId, builds]) => ({
          proposerId,
          members: builds.map((build) => ({
            primary: build.primaryProfession,
            secondary: build.secondaryProfession ?? null,
          })),
          voterIds: [...side.votes].flatMap(([voterId, votedFor]) =>
            votedFor === proposerId ? [voterId] : [],
          ),
        }),
      ),
      chosen:
        side.chosen === undefined
          ? null
          : {
              proposerId: side.chosen.proposerId,
              reason: side.chosen.reason,
              members: side.chosen.builds.map(characterOf),
            },
      claims: lobby.stage === "claim" ? [...side.claims] : [],
    };
  };

  /** The Team Lobby as `team` sees it: the other side's choices are hidden from it. */
  const wireTeamLobby = (lobby: TeamLobby, team: 0 | 1 | null): WireTeamLobby => ({
    stage: lobby.stage,
    secondsLeft: countdownLeft(lobby.endsAt),
    sides: [team === 0 ? wireSide(lobby, 0) : null, team === 1 ? wireSide(lobby, 1) : null],
  });

  /** The lobby as `to` sees it; only a Team Lobby differs by recipient. */
  const state = (to: Member | undefined): WireLobbyState => ({
    code,
    phase,
    mode,
    mapId,
    open,
    hostId: transport.selfId,
    matchId: match?.id ?? null,
    players: [...members.values()].map((member) => ({
      id: member.id,
      name: member.name,
      guildTag: member.guildTag,
      guildCape: member.guildCape,
      team: member.team,
      ready: isReady(member),
      isHost: member.id === local.selfId,
      bot: member.bot !== null,
      away: away.has(member.id),
    })),
    countdownSeconds: countdownEndsAt === undefined ? null : countdownLeft(countdownEndsAt),
    queueNonce: queueing?.nonce ?? null,
    ascentRound: queueing?.ascentRound ?? null,
    teamLobby: teamLobby === undefined ? null : wireTeamLobby(teamLobby, to?.team ?? null),
  });

  const reach = (): LobbyReach => ({
    open,
    guests: [...members.values()].filter(
      (member) => member.bot === null && member.id !== local.selfId,
    ).length,
  });

  /** Tell the reach handlers, if it changed. */
  const tellReach = (): void => {
    const now = reach();
    if (toldReach.open === now.open && toldReach.guests === now.guests) {
      return;
    }
    toldReach = now;
    for (const handler of [...reachHandlers]) {
      handler(now);
    }
  };

  const broadcast = (): void => {
    tellReach();
    if (teamLobby === undefined) {
      transport.send("lobby-state", state(undefined));
      return;
    }
    // Each member its own: a side's vote is its own (#1458).
    for (const member of members.values()) {
      if (member.bot === null && !away.has(member.id)) {
        transport.send("lobby-state", state(member), member.id);
      }
    }
  };

  const note = (kind: WireLobbyNote["kind"], reason: string, to?: string): void => {
    const message: WireLobbyNote = { kind, reason };
    transport.send("lobby-note", message, to);
  };

  /**
   * `proposerId`'s proposal's skills and weapons (#1811), to `to`, or to
   * every human here on `team`: a side's proposals are its own.
   */
  const tellProposalBuilds = (
    team: 0 | 1,
    proposerId: string,
    builds: readonly PlayerBuild[],
    to?: string,
  ): void => {
    const message: WireTeamProposalBuilds = {
      proposerId,
      builds: builds.map(({ skillBar, equipment }) => {
        const [set] = equipment.weaponSets;
        return {
          skills: [...skillBar],
          mainHand: set.mainHand.weaponId,
          offHand: set.offHand?.offhandId ?? null,
        };
      }),
    };
    for (const member of humansOn(team)) {
      if (!away.has(member.id) && (to === undefined || member.id === to)) {
        transport.send("team-proposal-builds", message, member.id);
      }
    }
  };

  const refuse = (peerId: string, reason: LobbyRefusal): void => {
    note("refused", reason, peerId);
  };

  /** Whole seconds left until `endsAt`. */
  const countdownLeft = (endsAt: number): number =>
    Math.max(0, Math.ceil((endsAt - clockMs()) / 1000));

  /**
   * Start the match. `assigned` is each member's build, a Team Lobby's
   * (#1458); without one a bot plays its own and a human its hello's.
   */
  const start = (
    assigned: ReadonlyMap<string, PlayerBuild> = new Map(),
    rejected: ReadonlySet<0 | 1> = new Set(),
  ): void => {
    countdownEndsAt = undefined;
    phase = "starting";
    matches += 1;
    const id = `match-${String(matches)}`;
    const seatOf = (member: Member, team: 0 | 1): PlannedSeat => {
      const seat = {
        team,
        name: member.name,
        guildTag: member.guildTag,
        guildCape: member.guildCape,
      };
      const build = assigned.get(member.id) ?? null;
      return member.bot === null
        ? { ...seat, bot: false, build }
        : { ...seat, bot: true, build: build ?? member.bot };
    };
    // One away (#1764) is not seated: a bot plays its slot, as `remove`
    // fills a seat, and its window runs on through the match.
    const seats = new Map<string, PlannedSeat>();
    for (const member of members.values()) {
      if (member.team === null) {
        continue;
      }
      if (!away.has(member.id)) {
        seats.set(member.id, seatOf(member, member.team));
        continue;
      }
      const build = assigned.get(member.id) ?? starterBuild();
      seats.set(freeBotId(), {
        team: member.team,
        name: characterOf(build).name,
        guildTag: null,
        guildCape: null,
        bot: true,
        build,
      });
    }
    // Team Arena draws its map for each match (#1994); a queued lobby's
    // is its group's.
    if (mode === "team-arena" && queued === undefined) {
      mapId = pick(options.modeMaps[mode]) ?? mapId;
    }
    const room = scopeTransport(transport);
    try {
      match = {
        id,
        host: startMatch({
          matchId: id,
          mapId,
          seats,
          isSpectator: (peerId) => peerMember(peerId)?.team === null,
          transport: room,
        }),
        room,
      };
    } catch {
      // The caller's to report; the lobby only has to stay usable.
      void room.leave();
      phase = "waiting";
      // Back as before the vote (#2086): no retry adds a second set of
      // bots, and nobody stays ready to start the same failure again.
      dropCodedBots();
      clearReady();
      note("start-rejected", "the match could not be created", local.selfId);
      broadcast();
      return;
    }
    phase = "in-match";
    queuedStarted = queued !== undefined;
    // The state first: a peer takes a match-start only for the match the
    // lobby says is on, and each peer's messages arrive in order.
    broadcast();
    for (const [peerId, seat] of seats) {
      if (!seat.bot) {
        const message: WireMatchStart = {
          mapId,
          matchId: id,
          teamPlanRejected: rejected.has(seat.team),
        };
        transport.send("match-start", message, peerId);
      }
    }
  };

  /**
   * A coded lobby's bots were its match's alone (#2029): the next plays
   * its own unclaimed slots. A queued lobby's belong to its queue plan.
   */
  const dropCodedBots = (): void => {
    if (queued !== undefined) {
      return;
    }
    for (const member of [...members.values()]) {
      if (member.bot !== null) {
        members.delete(member.id);
      }
    }
  };

  /** Everyone re-confirms: a stage, or what they agreed to, changed. */
  const clearReady = (): void => {
    for (const member of members.values()) {
      member.ready = false;
    }
  };

  /**
   * Everyone ready, in a lobby hosted from Team Play (#1458): its vote
   * begins. A team mode's side is the mode's size; a Hosted Game's is the
   * Team Build it chooses (#2029). A side with more players than it
   * plays is turned down. A party's side alone queues (#1766).
   */
  const beginTeamLobby = (forQueue = false, ascentRound: number | null = null): boolean => {
    const queueMode = teamQueueModeOf(mode);
    const size = queueMode === undefined ? null : teamSizeOf(queueMode);
    const most = size ?? MAX_TEAM_LOBBY_SIDE;
    if (([0, 1] as const).some((team) => humansOn(team).length > most)) {
      note("start-rejected", `a team plays at most ${String(most)}`, local.selfId);
      return false;
    }
    const side = (size: number | null): TeamSide => ({
      size,
      proposals: new Map(),
      pending: new Map(),
      votes: new Map(),
      chosen: undefined,
      claims: [],
    });
    phase = "team-lobby";
    teamLobby = {
      stage: "vote",
      endsAt: clockMs() + TEAM_LOBBY_STAGE_SECONDS * 1000,
      sides: [side(size), side(forQueue ? 0 : size)],
      forQueue,
      ascentRound,
    };
    clearReady();
    return true;
  };

  /** Whether `team` plays the house team: nobody proposed, or nobody is there to. */
  const playsHouse = (team: 0 | 1, side: TeamSide): boolean =>
    side.proposals.size === 0 || humansOn(team).length === 0;

  /** One of `options`, at random from the lobby's RNG. */
  const pick = <T>(options: readonly T[]): T | undefined =>
    options[Math.min(options.length - 1, Math.floor(random() * options.length))];

  /**
   * The Team Build `team` plays, and why: the most votes; on a tie the
   * captain's vote if it is one of the tied, else one of them at random;
   * with no votes any proposal at random; with no proposal, or nobody to
   * make one, the house team of `houseSize`: the starter builds in order,
   * round and round.
   */
  const chooseFor = (
    team: 0 | 1,
    side: TeamSide,
    houseSize: number,
  ): NonNullable<TeamSide["chosen"]> => {
    if (playsHouse(team, side)) {
      return {
        proposerId: null,
        reason: "house",
        builds: Array.from({ length: houseSize }, (_, slot) => {
          const build = STARTER_BUILDS[slot % STARTER_BUILDS.length];
          if (build === undefined) {
            throw new Error("there are no starter builds for a house team");
          }
          return build;
        }),
      };
    }
    const tally = new Map([...side.proposals.keys()].map((proposerId) => [proposerId, 0]));
    for (const votedFor of side.votes.values()) {
      tally.set(votedFor, (tally.get(votedFor) ?? 0) + 1);
    }
    const most = Math.max(...tally.values());
    const tied = [...tally].flatMap(([proposerId, votes]) => (votes === most ? [proposerId] : []));
    const captain = captainOf(team);
    const captainsVote = captain === null ? undefined : side.votes.get(captain);
    const [only] = tied;
    const [proposerId, reason]: [string | undefined, WireTeamChoice["reason"]] =
      most > 0 && tied.length === 1
        ? [only, "votes"]
        : most > 0 && captainsVote !== undefined && tied.includes(captainsVote)
          ? [captainsVote, "captain"]
          : [pick(tied), "random"];
    const builds = proposerId === undefined ? undefined : side.proposals.get(proposerId);
    if (proposerId === undefined || builds === undefined) {
      throw new Error("a side with proposals chose none");
    }
    return { proposerId, reason, builds };
  };

  /**
   * End the Team Lobby's stage: the vote is decided and the claim begins,
   * or the claim is over, every slot is played, and the match starts.
   */
  const endStage = (lobby: TeamLobby): void => {
    if (lobby.stage === "vote") {
      // A Hosted Game's house team plays as many as the other side chose
      // (#2029); with neither chosen, 4 or the larger side's players.
      const order = playsHouse(0, lobby.sides[0]) ? ([1, 0] as const) : ([0, 1] as const);
      for (const team of order) {
        const side = lobby.sides[team];
        const other = team === 0 ? 1 : 0;
        const otherSize =
          lobby.sides[other].chosen?.builds.length ?? Math.max(4, humansOn(other).length);
        // A proposal still arriving is not one.
        side.pending.clear();
        side.chosen = chooseFor(
          team,
          side,
          side.size ?? Math.max(otherSize, humansOn(team).length),
        );
        side.claims = Array.from({ length: side.chosen.builds.length }, () => null);
      }
      lobby.stage = "claim";
      lobby.endsAt = clockMs() + TEAM_LOBBY_STAGE_SECONDS * 1000;
      clearReady();
      broadcast();
      return;
    }
    if (lobby.forQueue) {
      // The party's side alone: every seat nobody holds is a bot (#1766).
      const claims = claimsOf(0, lobby.sides[0]);
      const seats = (lobby.sides[0].chosen?.builds ?? []).map((build, slot) => ({
        holder: claims[slot] ?? null,
        build,
      }));
      teamLobby = undefined;
      beginQueueing(seats, lobby.ascentRound);
      return;
    }
    const assigned = new Map<string, PlayerBuild>();
    for (const team of [0, 1] as const) {
      const side = lobby.sides[team];
      const builds = side.chosen?.builds ?? [];
      // A bot, made now, plays every slot nobody holds (#2029).
      for (const [slot, holder] of claimsOf(team, side).entries()) {
        const build = builds[slot];
        if (build !== undefined) {
          assigned.set(holder ?? addBot(team), build);
        }
      }
    }
    nameSlotBots(assigned);
    teamLobby = undefined;
    start(assigned);
  };

  /** `side`'s claims, and a human on `team` who claimed nothing in the lowest free slot, in join order. */
  const claimsOf = (team: 0 | 1, side: TeamSide): (string | null)[] => {
    const claims = [...side.claims];
    for (const human of humansOn(team)) {
      const free = claims.indexOf(null);
      if (!claims.includes(human.id) && free >= 0) {
        claims[free] = human.id;
      }
    }
    return claims;
  };

  /** A bot plays under its slot character's name. */
  const nameSlotBots = (assigned: ReadonlyMap<string, PlayerBuild>): void => {
    for (const member of members.values()) {
      const build = assigned.get(member.id);
      if (member.bot !== null && build !== undefined) {
        member.bot = build;
        member.name = characterOf(build).name;
      }
    }
  };

  /**
   * The party's Team Lobby is over (#1766): it is queued, under a fresh
   * nonce, and once it is known which group that makes, a party of more
   * than one gathers its members' keys and consents.
   */
  const beginQueueing = (seats: readonly PartySeat[], ascentRound: number | null): void => {
    if (matchmaking === undefined) {
      return;
    }
    const nonce = matchmaking.newNonce();
    const current: NonNullable<typeof queueing> = {
      nonce,
      ascentRound,
      seats,
      endsAt: clockMs() + PARTY_CONSENT_MS,
      groupId: undefined,
      keys: new Map(),
      proposal: undefined,
    };
    queueing = current;
    phase = "queued";
    clearReady();
    void partyGroupId(matchmaking.roomId, nonce).then((groupId) => {
      current.groupId = groupId;
      gatherParty();
    });
    broadcast();
  };

  /**
   * A party of more than one, once every member sent its key: propose it,
   * the host's own key first; once each consented, tell each it formed.
   * A key, or then a consent, still missing `PARTY_CONSENT_MS` on, and
   * it leaves the queue.
   */
  const gatherParty = (): void => {
    const current = queueing;
    const queueMode = teamQueueModeOf(mode);
    if (current?.groupId === undefined || queueMode === undefined) {
      return;
    }
    const { groupId, proposal } = current;
    if (proposal === undefined) {
      const leader = current.keys.get(local.selfId);
      const party = humansOn(0);
      if (party.length < 2) {
        return;
      }
      if (leader === undefined || current.keys.size < party.length) {
        if (clockMs() >= current.endsAt) {
          leaveQueue();
        }
        return;
      }
      const rest = [...current.keys]
        .filter(([peerId]) => peerId !== local.selfId)
        .map(([, memberKey]) => memberKey)
        .sort();
      const partyMembers = [leader, ...rest];
      current.proposal = {
        members: partyMembers,
        keys: new Map(current.keys),
        digest: admissionDigest("vibewars-party", groupId, partyMembers.join(""), queueMode),
        consents: new Map(),
        checking: new Set(),
        endsAt: clockMs() + PARTY_CONSENT_MS,
        settled: false,
      };
      const proposed: WirePartyProposal = { groupId, members: partyMembers, mode: queueMode };
      for (const to of current.keys.keys()) {
        transport.send("party-proposal", proposed, to);
      }
      return;
    }
    if (proposal.settled) {
      return;
    }
    const consents = proposal.members.flatMap((memberKey) => {
      const consent = proposal.consents.get(memberKey);
      return consent === undefined ? [] : [consent];
    });
    if (consents.length === proposal.members.length) {
      proposal.settled = true;
      const formed: WirePartyFormed = { groupId, members: proposal.members, consents };
      for (const to of proposal.keys.keys()) {
        transport.send("party-formed", formed, to);
      }
    } else if (clockMs() >= proposal.endsAt) {
      leaveQueue();
    }
  };

  /** Out of the queue (#1766): the party is back in its lobby, and no party to any of it. */
  const leaveQueue = (): void => {
    const current = queueing;
    if (current === undefined) {
      return;
    }
    queueing = undefined;
    phase = "waiting";
    for (const to of current.keys.keys()) {
      if (members.has(to)) {
        transport.send("party-split", {} satisfies WirePartySplit, to);
      }
    }
    broadcast();
  };

  /**
   * No other team came (#1766, Q191): the party plays its own seats here,
   * a bot in each seat nobody holds, against a house team of bots.
   */
  const playHouseTeam = (): void => {
    const current = queueing;
    if (current === undefined) {
      return;
    }
    queueing = undefined;
    for (const to of current.keys.keys()) {
      if (members.has(to)) {
        transport.send("party-split", {} satisfies WirePartySplit, to);
      }
    }
    const assigned = new Map<string, PlayerBuild>();
    for (const seat of current.seats) {
      const holder = seat.holder === null ? undefined : peerMember(seat.holder);
      assigned.set(holder?.team === 0 ? holder.id : addBot(0), seat.build);
    }
    for (const slot of current.seats.keys()) {
      const build = STARTER_BUILDS[slot % STARTER_BUILDS.length];
      if (build !== undefined) {
        assigned.set(addBot(1), build);
      }
    }
    nameSlotBots(assigned);
    start(assigned);
  };

  /** A party member's key for its consent (#1766): once each, and no key twice. */
  const takePartyKey = (from: string, memberKey: string | null): void => {
    const current = queueing;
    const member = peerMember(from);
    if (
      current === undefined ||
      current.proposal !== undefined ||
      member?.team !== 0 ||
      memberKey === null ||
      current.keys.has(from) ||
      [...current.keys.values()].includes(memberKey)
    ) {
      return;
    }
    current.keys.set(from, memberKey);
    gatherParty();
  };

  /** Whether every human on a side is ready, which ends a Team Lobby's stage early. */
  const everyoneReady = (): boolean =>
    [...members.values()].every(
      (member) => member.bot !== null || member.team === null || member.ready,
    );

  /** `proposerId`'s proposal gone, and the votes for it back to none. */
  const dropProposal = (side: TeamSide, proposerId: string): boolean => {
    for (const [voterId, votedFor] of side.votes) {
      if (votedFor === proposerId) {
        side.votes.delete(voterId);
      }
    }
    return side.proposals.delete(proposerId);
  };

  /**
   * Apply `command` from `member` in a Team Lobby (#1458); whether
   * anything changed. Each command counts only in its own stage, and
   * only from a member on a side.
   */
  const applyTeam = (lobby: TeamLobby, member: Member, command: WireLobbyCommand): boolean => {
    if (member.team === null) {
      return false;
    }
    const side = lobby.sides[member.team];
    switch (command.kind) {
      case "ready": {
        const changed = member.ready !== command.ready;
        member.ready = command.ready;
        if (command.ready && everyoneReady()) {
          endStage(lobby);
          return false;
        }
        return changed;
      }
      case "propose": {
        if (lobby.stage !== "vote") {
          return false;
        }
        if (command.slot === null) {
          side.pending.delete(member.id);
          return dropProposal(side, member.id);
        }
        // Exactly the side's size, or in a Hosted Game any size with a
        // slot for each of its players (#2029), each build held to the
        // rule a hello's is.
        const build = parsePlayerBuild(command.build);
        if (
          command.size !== (side.size ?? command.size) ||
          command.size < humansOn(member.team).length ||
          build === undefined ||
          validatePlayerBuild(build, RULESET.attributes).length > 0
        ) {
          side.pending.delete(member.id);
          refuse(member.id, "invalid-proposal");
          return false;
        }
        const arriving = side.pending.get(member.id);
        const slots =
          arriving?.length === command.size
            ? arriving
            : Array.from({ length: command.size }, () => undefined);
        slots[command.slot] = build;
        const builds = slots.flatMap((slot) => (slot === undefined ? [] : [slot]));
        if (builds.length < command.size) {
          side.pending.set(member.id, slots);
          return false;
        }
        // Complete: a new proposal, last in the list, with no votes yet.
        side.pending.delete(member.id);
        dropProposal(side, member.id);
        side.proposals.set(member.id, builds);
        tellProposalBuilds(member.team, member.id, builds);
        return true;
      }
      case "vote": {
        if (lobby.stage !== "vote") {
          return false;
        }
        if (command.proposerId === null) {
          return side.votes.delete(member.id);
        }
        if (!side.proposals.has(command.proposerId)) {
          refuse(member.id, "invalid-vote");
          return false;
        }
        const changed = side.votes.get(member.id) !== command.proposerId;
        side.votes.set(member.id, command.proposerId);
        return changed;
      }
      case "claim": {
        if (lobby.stage !== "claim") {
          return false;
        }
        const held = side.claims.indexOf(member.id);
        if (command.slot === null) {
          if (held < 0) {
            return false;
          }
          side.claims[held] = null;
          return true;
        }
        const { slot } = command;
        if (!Number.isInteger(slot) || slot < 0 || slot >= side.claims.length) {
          refuse(member.id, "invalid-slot");
          return false;
        }
        if (side.claims[slot] === member.id) {
          return false;
        }
        if (side.claims[slot] !== null) {
          refuse(member.id, "slot-taken");
          return false;
        }
        if (held >= 0) {
          side.claims[held] = null;
        }
        side.claims[slot] = member.id;
        return true;
      }
      default:
        // The lobby's own choices were made before the Team Lobby began.
        return false;
    }
  };

  /** Apply `command` from `member`; whether anything changed. */
  const apply = (member: Member, command: WireLobbyCommand): boolean => {
    switch (command.kind) {
      case "choose-team":
        if (member.team === command.team) {
          return false;
        }
        member.team = command.team;
        // A player re-confirms after the side they agreed to has changed.
        member.ready = false;
        return true;
      case "ready": {
        // A spectator cannot be ready: readiness is about being in the match.
        const ready = command.ready && member.team !== null;
        const changed = member.ready !== ready;
        member.ready = ready;
        return changed;
      }
      case "select-map":
        // Only a Hosted Game is picked (#1994); every other mode chooses its own.
        if (mode !== "hosted-game") {
          refuse(member.id, "not-pickable");
          return false;
        }
        // The host decides what maps exist, and only its own player picks.
        if (member.id !== local.selfId || !mapIds.includes(command.mapId)) {
          return false;
        }
        mapId = command.mapId;
        // A map change can undo what players agreed to, so everyone re-confirms.
        for (const other of members.values()) {
          other.ready = false;
        }
        return true;
      case "select-mode": {
        if (member.id !== local.selfId) {
          refuse(member.id, "not-host");
          return false;
        }
        if (mode === command.mode) {
          return false;
        }
        mode = command.mode;
        const [first = defaultMap, ...rest] = options.modeMaps[mode];
        // In the same broadcast as the mode: no member ever sees a mode
        // with a map outside it. Only a Hosted Game keeps a picked one
        // (#1994): Heroes' Ascent starts on its first, and Team Arena's is a
        // placeholder until its draw.
        if (mapId !== first && (mode !== "hosted-game" || !rest.includes(mapId))) {
          mapId = first;
          for (const other of members.values()) {
            other.ready = false;
          }
        }
        return true;
      }
      case "start": {
        if (member.id !== local.selfId) {
          return false;
        }
        const check = canStart(
          [...members.values()].map((other) => ({ team: other.team, ready: isReady(other) })),
        );
        if (!check.ok) {
          note("start-rejected", check.reason, member.id);
          return false;
        }
        if (matchmaking !== undefined && teamQueueModeOf(mode) !== undefined) {
          note("start-rejected", "a team mode finds a match instead", member.id);
          return false;
        }
        if (options.teamLobby) {
          return beginTeamLobby();
        }
        start();
        return false;
      }
      case "find-match": {
        if (member.id !== local.selfId) {
          refuse(member.id, "not-host");
          return false;
        }
        const queueMode = teamQueueModeOf(mode);
        // Heroes' Ascent queues at a round, and no other mode does (#1996).
        if (
          matchmaking === undefined ||
          queueMode === undefined ||
          (queueMode === "heroes-ascent") !== (command.ascentRound !== null)
        ) {
          return false;
        }
        // The party is everyone here, on the one side; its seats nobody
        // claims are bots.
        const size = teamSizeOf(queueMode);
        if (members.size > size) {
          note("start-rejected", `a side plays ${String(size)}`, member.id);
          return false;
        }
        for (const other of members.values()) {
          other.team = 0;
        }
        return beginTeamLobby(true, command.ascentRound);
      }
      case "leave-queue":
      case "house-team":
        // A queued party's, and this one is not.
        return false;
      case "propose":
      case "vote":
      case "claim":
        // A Team Lobby's, and this is not one yet.
        return false;
      case "team-plan":
        // A queued team mode's alone (ADR-0042).
        return false;
    }
  };

  /** A bot's id that no member has. */
  const freeBotId = (): string => {
    let id: string;
    do {
      bots += 1;
      id = `bot-${String(bots)}`;
    } while (members.has(id));
    return id;
  };

  /** The build a bot plays until it is given one. */
  const starterBuild = (): PlayerBuild => {
    const [build] = STARTER_BUILDS;
    if (build === undefined) {
      throw new Error("there are no starter builds for a bot to play");
    }
    return build;
  };

  /**
   * Seat a bot on `team` (#1193), under an id no member has, and say
   * which; the build it is given makes it someone.
   */
  const addBot = (team: 0 | 1): string => {
    const id = freeBotId();
    const build = starterBuild();
    members.set(id, {
      id,
      name: id,
      guildTag: null,
      guildCape: null,
      team,
      ready: true,
      seatKey: null,
      bot: build,
    });
    return id;
  };

  /**
   * Give each bot in `builds` its build, and its name from it: each is
   * `"<Profession> Bot"`, numbered from 2 when the name is taken, in the
   * order the bots were added.
   */
  const nameBots = (builds: ReadonlyMap<string, PlayerBuild>): void => {
    const names = new Set(
      [...members.values()].flatMap((member) => (member.bot === null ? [member.name] : [])),
    );
    for (const bot of members.values()) {
      const build = builds.get(bot.id);
      if (build === undefined) {
        continue;
      }
      const base = `${getProfession(build.primaryProfession).name} Bot`;
      let name = base;
      for (let n = 2; names.has(name); n += 1) {
        name = `${base} ${String(n)}`;
      }
      name = sanitizeName(name, bot.id);
      names.add(name);
      bot.bot = build;
      bot.name = name;
    }
  };

  /** Seat `from`, which `join` brought, on `team`. */
  const admit = (
    from: string,
    join: PeerLobbyJoin,
    team: 0 | 1 | null,
    seatKey: string | null,
  ): void => {
    if (members.size >= MAX_LOBBY_PLAYERS) {
      refuse(from, "lobby-full");
      return;
    }
    joined += 1;
    members.set(from, {
      id: from,
      name: sanitizeName(join.name, `player-${String(joined)}`),
      ...sanitizeGuild(join),
      team,
      ready: false,
      seatKey,
      bot: null,
    });
    beginCountdown();
    broadcast();
  };

  /**
   * Take one seat of a team mode's side plan (ADR-0042) from `member`, if
   * it is that side's party host, the ticket's own key, and the match has
   * not started. A plan of another size starts over; a build that is not
   * legal here, whatever the reason, spoils the plan.
   */
  const takeTeamPlan = (
    plan: QueuedPlan,
    member: Member,
    command: Extract<WireLobbyCommand, { kind: "team-plan" }>,
  ): void => {
    const { group } = plan;
    if (
      !isTeamQueueMode(group.mode) ||
      queuedStarted ||
      member.team === null ||
      member.seatKey === null ||
      member.seatKey !== group.teams[member.team][0]
    ) {
      return;
    }
    const held = teamPlans[member.team];
    const side = held?.size === command.size ? held : { size: command.size, seats: new Map() };
    const build = parsePlayerBuild(command.build);
    side.seats.set(command.slot, {
      memberKey: command.memberKey,
      build:
        build !== undefined && validatePlayerBuild(build, RULESET.attributes).length === 0
          ? build
          : null,
    });
    teamPlans[member.team] = side;
  };

  /**
   * `plan`'s seats in slot order, if it is a whole side of `size` whose
   * humans are exactly `keys` and whose every build is legal.
   */
  const wholePlan = (
    plan: TeamPlan | undefined,
    keys: readonly string[],
    size: number,
  ): { readonly memberKey: string | null; readonly build: PlayerBuild }[] | undefined => {
    if (plan?.size !== size) {
      return undefined;
    }
    const seats: { readonly memberKey: string | null; readonly build: PlayerBuild }[] = [];
    for (let slot = 0; slot < size; slot += 1) {
      const seat = plan.seats.get(slot);
      if (seat?.build === undefined || seat.build === null) {
        return undefined;
      }
      seats.push({ memberKey: seat.memberKey, build: seat.build });
    }
    const humans = seats.flatMap(({ memberKey }) => (memberKey === null ? [] : [memberKey]));
    return humans.sort().join() === [...keys].sort().join() ? seats : undefined;
  };

  /**
   * Seat each side of a team mode's queued match by its plan (ADR-0042),
   * its bots added to the lobby, and say what each member plays. A side
   * with no whole plan plays the house team: its humans, then its bots,
   * the starter builds in order, round and round. A human's own hello
   * build is never read: every seat has one here. `rejected` holds the
   * sides that sent a plan which was not whole.
   */
  const seatTeamPlans = (
    plan: QueuedPlan,
  ): {
    readonly assigned: Map<string, PlayerBuild>;
    readonly rejected: ReadonlySet<0 | 1>;
  } => {
    const size = teamSizeOf(plan.group.mode);
    const assigned = new Map<string, PlayerBuild>();
    const rejected = new Set<0 | 1>();
    const botBuilds = new Map<string, PlayerBuild>();
    for (const team of [0, 1] as const) {
      const keys = plan.group.teams[team];
      const whole = wholePlan(teamPlans[team], keys, size);
      if (teamPlans[team] !== undefined && whole === undefined) {
        rejected.add(team);
      }
      const seats =
        whole ??
        [...keys, ...Array.from({ length: size - keys.length }, () => null)].map(
          (memberKey, slot) => {
            const build = STARTER_BUILDS[slot % STARTER_BUILDS.length];
            if (build === undefined) {
              throw new Error("there are no starter builds for a house team");
            }
            return { memberKey, build };
          },
        );
      for (const { memberKey, build } of seats) {
        if (memberKey === null) {
          const id = addBot(team);
          assigned.set(id, build);
          botBuilds.set(id, build);
          continue;
        }
        const human = [...members.values()].find((member) => member.seatKey === memberKey);
        if (human !== undefined) {
          assigned.set(human.id, build);
        }
      }
    }
    nameBots(botBuilds);
    return { assigned, rejected };
  };

  /** The group's seat keys no member holds; one away (#1764) holds none until it is back. */
  const unseated = (plan: QueuedPlan): string[] => {
    const seated = new Set(
      [...members.values()]
        .filter((member) => !away.has(member.id))
        .map((member) => member.seatKey),
    );
    return plan.group.teams.flat().filter((seatKey) => !seated.has(seatKey));
  };

  /** A queued lobby with every ticket seated counts down to its match. */
  const beginCountdown = (): void => {
    if (
      queued === undefined ||
      queuedStarted ||
      countdownEndsAt !== undefined ||
      unseated(queued).length > 0
    ) {
      return;
    }
    countdownEndsAt = clockMs() + queued.countdownSeconds * 1000;
    phase = "starting";
  };

  /** The host's proof to `to`, over the `vibewars-host` digest made for it; once. */
  const sendWelcome = (plan: QueuedPlan, hostDigest: Uint8Array, to: string): void => {
    if (welcomed.has(to)) {
      return;
    }
    welcomed.add(to);
    const welcome: WireLobbyWelcome = { hostSig: plan.key.sign(hostDigest) };
    transport.send("lobby-welcome", welcome, to);
  };

  /**
   * Welcome `from` with the host's proof, whoever it is, so even a
   * refusal comes from the planned host; then seat it on its planned team
   * if its own proof is for this host, this peer and a ticket of the
   * group nobody holds yet (ADR-0032 §6). A signature check costs
   * milliseconds, so it is the last check, and made once per peer.
   */
  const admitQueued = async (plan: QueuedPlan, join: PeerLobbyJoin, from: string) => {
    const { group, key, verifyTicketSig } = plan;
    const [hostDigest, admitDigest] = await Promise.all([
      admissionDigest("vibewars-host", group.groupId, key.ticketId, from),
      admissionDigest("vibewars-admit", group.groupId, key.ticketId, from),
    ]);
    // Settled while the digests were made: closed, or this peer gone.
    if (closed || !judged.has(from)) {
      return;
    }
    sendWelcome(plan, hostDigest, from);
    const { admission } = join;
    const team =
      admission === null
        ? undefined
        : ([0, 1] as const).find((side) => group.teams[side].includes(admission.seatKey));
    if (admission === null || team === undefined) {
      refuse(from, "not-admitted");
      return;
    }
    if ([...members.values()].some((member) => member.seatKey === admission.seatKey)) {
      refuse(from, "ticket-used");
      return;
    }
    if (!verifyTicketSig(admission.seatKey, admitDigest, admission.admissionSig)) {
      refuse(from, "not-admitted");
      return;
    }
    admit(from, join, team, admission.seatKey);
  };

  // A queued joiner asks before it joins: its proof goes only to a peer
  // whose welcome proved it this lobby's host.
  transport.on("lobby-hello", (data, from) => {
    if (
      queued === undefined ||
      closed ||
      members.has(from) ||
      !budget.take(from, nowMs()) ||
      parsePeerLobbyHello(data) === undefined
    ) {
      return;
    }
    const { group, key } = queued;
    void admissionDigest("vibewars-host", group.groupId, key.ticketId, from).then((digest) => {
      if (!closed && !members.has(from)) {
        sendWelcome(queued, digest, from);
      }
    });
  });

  transport.on("lobby-join", (data, from) => {
    if (closed || !budget.take(from, nowMs()) || (members.has(from) && !away.has(from))) {
      return;
    }
    // Checked first: a peer of another version is told so, rather than
    // left waiting for a state that never lists it.
    if (helloProtocolVersion(data) !== PROTOCOL_VERSION) {
      refuse(from, "protocol-mismatch");
      return;
    }
    const join = parsePeerLobbyJoin(data);
    if (join === undefined) {
      return;
    }
    const returning = members.get(from);
    // Back from a drop, it was admitted already: as this peer, on its ticket.
    if (returning !== undefined) {
      // Back from a drop during the match (#596): the seat it held, on its
      // team, to confirm again like everyone else when the match is over.
      away.delete(from);
      returning.name = sanitizeName(join.name, returning.name);
      const guild = sanitizeGuild(join);
      returning.guildTag = guild.guildTag;
      returning.guildCape = guild.guildCape;
      returning.ready = false;
      // The proposals its side lists, and the chosen one, it was told of
      // while here (#1811): it may have missed some.
      if (teamLobby !== undefined && returning.team !== null) {
        const side = teamLobby.sides[returning.team];
        const shown = [...side.proposals];
        if (side.chosen !== undefined && side.chosen.proposerId !== null) {
          shown.push([side.chosen.proposerId, side.chosen.builds]);
        }
        for (const [proposerId, builds] of shown) {
          tellProposalBuilds(returning.team, proposerId, builds, from);
        }
      }
      beginCountdown();
      broadcast();
      return;
    }
    if (queued !== undefined) {
      // One proof per peer while it is here: a refused one stays refused.
      if (!judged.has(from)) {
        judged.add(from);
        void admitQueued(queued, join, from);
      }
      return;
    }
    // A proof means a queued lobby, which this is not.
    if (join.admission !== null) {
      refuse(from, "not-admitted");
      return;
    }
    // Past the key gate: only a peer with the key learns it is closed
    // (#1682). The host's own player is no guest: it is always let in.
    if (!open && from !== local.selfId) {
      refuse(from, "closed");
      return;
    }
    admit(from, join, null, null);
  });

  transport.on("lobby-cmd", (data, from) => {
    const member = peerMember(from);
    // Nothing a peer says before its lobby-join counts.
    if (closed || member === undefined || !budget.take(from, nowMs())) {
      return;
    }
    const command = parseWireLobbyCommand(data);
    if (command === undefined) {
      return;
    }
    // A side's seat plan counts until the match starts, through the countdown.
    if (queued !== undefined && command.kind === "team-plan") {
      takeTeamPlan(queued, member, command);
      return;
    }
    // Queued, the host may only take its party out, or play the house team (#1766).
    if (phase === "queued") {
      if (member.id === local.selfId && command.kind === "leave-queue") {
        leaveQueue();
      } else if (
        member.id === local.selfId &&
        command.kind === "house-team" &&
        // Heroes' Ascent waits for a side at its round, never for bots (#1996).
        mode !== "heroes-ascent"
      ) {
        playHouseTeam();
      }
      return;
    }
    if (phase !== "waiting" && phase !== "team-lobby") {
      return;
    }
    // In a queued lobby nothing else is chosen.
    if (queued !== undefined) {
      return;
    }
    if (teamLobby === undefined ? apply(member, command) : applyTeam(teamLobby, member, command)) {
      broadcast();
    }
  });

  // Said on purpose (#1764), unlike a drop: its seat is freed now.
  transport.on("lobby-leave", (data, from) => {
    if (
      closed ||
      from === local.selfId ||
      peerMember(from) === undefined ||
      parsePeerLobbyLeave(data) === undefined
    ) {
      return;
    }
    remove(from);
  });

  // Chat (#479), in the lobby and through its match, whose teams are the
  // lobby's: all chat reaches every member, spectators too; team chat
  // only the sender's team, and a spectator has none.
  transport.on("chat", (data, from) => {
    const member = peerMember(from);
    if (closed || member === undefined || away.has(from)) {
      return;
    }
    if (!chatBudget.take(from, nowMs())) {
      if (!throttled.has(from)) {
        throttled.add(from);
        note("chat-throttled", "", from);
      }
      return;
    }
    throttled.delete(from);
    const chat = parsePeerChat(data);
    if (chat === undefined || (chat.channel === "team" && member.team === null)) {
      return;
    }
    const text = sanitizeChatText(chat.text);
    if (text === "") {
      return;
    }
    const line: WireChatLine = {
      channel: chat.channel,
      fromId: member.id,
      name: member.name,
      team: member.team,
      text,
    };
    for (const to of members.values()) {
      if (
        to.bot === null &&
        !away.has(to.id) &&
        (chat.channel === "all" || to.team === member.team)
      ) {
        transport.send("chat-line", line, to.id);
      }
    }
  });

  /**
   * `peerId` gone for good: it left, or did not come back in time. In a
   * Team Lobby (#1458) its proposal, vote and claim go with it, and a bot
   * plays its slot (#2029).
   */
  const remove = (peerId: string): void => {
    const leaving = members.get(peerId);
    away.delete(peerId);
    members.delete(peerId);
    tellReach();
    // A party member gone takes the party out of the queue (#1766).
    if (queueing !== undefined && leaving?.team === 0) {
      leaveQueue();
      return;
    }
    if (teamLobby !== undefined && leaving !== undefined && leaving.team !== null) {
      const side = teamLobby.sides[leaving.team];
      side.pending.delete(peerId);
      dropProposal(side, peerId);
      side.votes.delete(peerId);
      side.claims = side.claims.map((holder) => (holder === peerId ? null : holder));
      if (everyoneReady()) {
        endStage(teamLobby);
        return;
      }
    }
    if (queued !== undefined) {
      // A winner gone is a no; the last of them gone, and the lobby is done.
      runVote(queued);
    }
    // A queued lobby one short waits for it again, on the clock it started with.
    if (countdownEndsAt !== undefined) {
      countdownEndsAt = undefined;
      phase = "waiting";
    }
    broadcast();
  };

  /** Remove the away members `gone` picks. */
  const dropAway = (gone: (leftAt: number) => boolean): void => {
    for (const [peerId, leftAt] of [...away]) {
      if (gone(leftAt)) {
        remove(peerId);
      }
    }
  };

  /** Not all seated in time: everyone is sent off, and the queue told who never came. */
  const fallThrough = (plan: QueuedPlan): void => {
    closed = true;
    note("refused", "fell-through" satisfies LobbyRefusal);
    plan.onFellThrough(ticketsOf(plan.group, unseated(plan)));
    void transport.leave();
  };

  /**
   * A queued lobby's countdown and timeout, at the lobby's clock now;
   * `shown` is the countdown everyone was last told. Whether the lobby
   * is still open.
   */
  const runQueue = (plan: QueuedPlan, shown: number | null): boolean => {
    if (queuedStarted) {
      return true;
    }
    if (countdownEndsAt === undefined) {
      if (clockMs() < plan.timeoutSeconds * 1000) {
        return true;
      }
      fallThrough(plan);
      return false;
    }
    if (clockMs() >= countdownEndsAt) {
      if (isTeamQueueMode(plan.group.mode)) {
        const { assigned, rejected } = seatTeamPlans(plan);
        start(assigned, rejected);
      } else {
        start();
      }
    } else if (countdownLeft(countdownEndsAt) !== shown) {
      broadcast();
    }
    return true;
  };

  /**
   * The winners of a queued match vote on staying together, if they are
   * a team: everyone on `winningTeam` still here, who has `stayTogetherSeconds`.
   */
  const beginVote = (plan: QueuedPlan, winningTeam: 0 | 1 | null): void => {
    // A team mode's side is a party already (ADR-0042): nothing to vote on.
    const teamSize =
      winningTeam === null || isTeamQueueMode(plan.group.mode)
        ? 0
        : plan.group.teams[winningTeam].length;
    vote = {
      teamSize,
      winners:
        teamSize > 1
          ? [...members.values()]
              .filter((member) => member.team === winningTeam && !away.has(member.id))
              .map((member) => member.id)
          : [],
      votes: new Map(),
      endsAt: clockMs() + plan.stayTogetherSeconds * 1000,
      // No team won, or a team of one: nothing to vote on.
      decided: teamSize <= 1,
      proposal: undefined,
    };
  };

  /** Decide the vote if it can be, tell those it concerns, and say when the lobby is done. */
  const runVote = (plan: QueuedPlan): void => {
    if (vote === undefined || queuedDone) {
      return;
    }
    const gone = new Set(vote.winners.filter((peerId) => !members.has(peerId)));
    const timedOut = clockMs() >= vote.endsAt;
    if (!vote.decided) {
      const decision = decideStayTogether({
        teamSize: vote.teamSize,
        winners: vote.winners,
        votes: vote.votes,
        gone,
        timedOut,
      });
      if (decision.kind !== "waiting") {
        vote.decided = true;
        // To each yes alone: the losers share these channels.
        if (decision.kind === "formed") {
          const { votes } = vote;
          const { groupId, mode } = plan.group;
          const party = decision.members;
          vote.proposal = {
            members: party,
            keys: new Map(
              decision.to.flatMap((peerId) => {
                const memberKey = votes.get(peerId);
                return typeof memberKey === "string" ? [[peerId, memberKey] as const] : [];
              }),
            ),
            digest: admissionDigest("vibewars-party", groupId, party.join(""), mode),
            consents: new Map(),
            checking: new Set(),
            endsAt: clockMs() + PARTY_CONSENT_MS,
            settled: false,
          };
          const proposed: WirePartyProposal = { groupId, members: party, mode };
          for (const to of decision.to) {
            transport.send("party-proposal", proposed, to);
          }
        } else {
          for (const to of decision.to) {
            transport.send("party-split", {} satisfies WirePartySplit, to);
          }
        }
      }
    }
    const { proposal } = vote;
    if (proposal !== undefined && !proposal.settled) {
      const told = [...proposal.keys.keys()];
      const consents = proposal.members.flatMap((memberKey) => {
        const consent = proposal.consents.get(memberKey);
        return consent === undefined ? [] : [consent];
      });
      // A member gone splits it even with every consent in: a consent can
      // verify after its sender left, and a party naming them never forms.
      const left = told.some((peerId) => !members.has(peerId));
      if (!left && consents.length === proposal.members.length) {
        proposal.settled = true;
        const formed: WirePartyFormed = {
          groupId: plan.group.groupId,
          members: proposal.members,
          consents,
        };
        for (const to of told) {
          transport.send("party-formed", formed, to);
        }
      } else if (left || clockMs() >= proposal.endsAt) {
        // A consent missing, or bad, or a member gone: no party, and no
        // second proposal of fewer.
        proposal.settled = true;
        for (const to of told.filter((peerId) => members.has(peerId))) {
          transport.send("party-split", {} satisfies WirePartySplit, to);
        }
      }
    }
    if (proposal !== undefined && !proposal.settled) {
      return;
    }
    const waited = vote.winners.some((peerId) => peerId !== local.selfId && !gone.has(peerId));
    if (timedOut || (vote.decided && !waited)) {
      queuedDone = true;
      plan.onDone();
    }
  };

  // A winner's vote, once, while the vote is open; or a queueing party
  // member's key (#1766).
  transport.on("stay-together", (data, from) => {
    if (queueing !== undefined && !closed && budget.take(from, nowMs())) {
      takePartyKey(from, parsePeerStayTogether(data)?.memberKey ?? null);
      return;
    }
    if (
      queued === undefined ||
      closed ||
      vote === undefined ||
      vote.decided ||
      !vote.winners.includes(from) ||
      vote.votes.has(from) ||
      !budget.take(from, nowMs())
    ) {
      return;
    }
    const said = parsePeerStayTogether(data);
    if (said === undefined) {
      return;
    }
    vote.votes.set(from, said.memberKey);
    runVote(queued);
  });

  // A yes-voter's consent to the proposed party, once, while it is open (#1078).
  transport.on("party-consent", (data, from) => {
    const proposal = vote?.proposal ?? queueing?.proposal;
    const verify = queued?.verifyTicketSig ?? matchmaking?.verifyTicketSig;
    if (
      verify === undefined ||
      closed ||
      proposal === undefined ||
      proposal.settled ||
      !budget.take(from, nowMs())
    ) {
      return;
    }
    const memberKey = proposal.keys.get(from);
    const said = parsePeerPartyConsent(data);
    if (
      memberKey === undefined ||
      said?.memberKey !== memberKey ||
      proposal.consents.has(memberKey) ||
      proposal.checking.has(from)
    ) {
      return;
    }
    proposal.checking.add(from);
    void proposal.digest.then((digest) => {
      proposal.checking.delete(from);
      // One that does not verify is no consent: the party waits for a
      // good one until `PARTY_CONSENT_MS`, then splits.
      if (closed || proposal.settled || !verify(memberKey, digest, said.consent)) {
        return;
      }
      proposal.consents.set(memberKey, said.consent);
      if (queued === undefined) {
        gatherParty();
      } else {
        runVote(queued);
      }
    });
  });

  const host: LobbyHost = {
    local,
    teamPlan(selfKey) {
      const current = queueing;
      if (current === undefined) {
        return undefined;
      }
      return current.seats.map(({ holder, build }) => ({
        memberKey:
          holder === null
            ? null
            : holder === local.selfId
              ? selfKey
              : (current.keys.get(holder) ?? null),
        build,
      }));
    },
    setOpen(opened) {
      if (closed || queued !== undefined || open === opened) {
        return;
      }
      open = opened;
      broadcast();
    },
    onReach(handler) {
      reachHandlers.add(handler);
      handler(reach());
      return () => {
        reachHandlers.delete(handler);
      };
    },
    advance(seconds) {
      if (closed) {
        return;
      }
      const shown = countdownEndsAt === undefined ? null : countdownLeft(countdownEndsAt);
      const shownStage = teamLobby === undefined ? null : countdownLeft(teamLobby.endsAt);
      elapsed += seconds;
      if (queueing !== undefined) {
        gatherParty();
      }
      if (teamLobby !== undefined) {
        if (clockMs() >= teamLobby.endsAt) {
          endStage(teamLobby);
        } else if (countdownLeft(teamLobby.endsAt) !== shownStage) {
          broadcast();
        }
      }
      if (queued !== undefined && !runQueue(queued, shown)) {
        return;
      }
      if (queued !== undefined) {
        runVote(queued);
      }
      // Not back within the window: its seat is gone, in a match too.
      dropAway((leftAt) => nowMs() - leftAt >= RECONNECT_WINDOW_SECONDS * 1000);
      for (const ending of [...draining]) {
        ending.host.advance(seconds);
        if (!ending.host.draining) {
          draining.splice(draining.indexOf(ending), 1);
          void ending.room.leave();
        }
      }
      if (match === undefined) {
        return;
      }
      match.host.advance(seconds);
      // Over, or everyone walked out of it: either way, back to the lobby.
      if (match.host.phase === "finished" || match.host.abandoned) {
        // Back to the lobby: teams kept, so sides are not re-picked every
        // round, and ready cleared, so nobody is dragged into a match
        // they did not confirm.
        const { winningTeam } = match.host;
        if (match.host.draining) {
          match.host.retire();
          draining.push(match);
        } else {
          void match.room.leave();
        }
        match = undefined;
        phase = "waiting";
        if (queued !== undefined) {
          beginVote(queued, winningTeam);
        }
        dropCodedBots();
        // Whoever is still away is not coming back to this lobby.
        dropAway(() => true);
        for (const member of members.values()) {
          member.ready = false;
        }
        broadcast();
      }
    },
    async close(moveTo) {
      if (closed) {
        return;
      }
      closed = true;
      if (moveTo !== undefined) {
        const move: WireLobbyMove = { code: moveTo };
        for (const member of members.values()) {
          if (member.bot === null && member.id !== local.selfId) {
            transport.send("lobby-move", move, member.id);
          }
        }
      }
      const ending = [...(match === undefined ? [] : [match]), ...draining.splice(0)];
      match = undefined;
      await Promise.all(ending.map(({ host: over }) => over.close("host-left")));
      note("refused", "host-left" satisfies LobbyRefusal);
      await transport.leave();
    },
  };

  transport.onPeerLeave((peerId) => {
    budget.forget(peerId);
    chatBudget.forget(peerId);
    throttled.delete(peerId);
    welcomed.delete(peerId);
    judged.delete(peerId);
    if (peerId === local.selfId) {
      // The host's own player went: there is no lobby without its host.
      void host.close();
      return;
    }
    if (closed || peerMember(peerId) === undefined) {
      return;
    }
    // A drop may be a blip (#515, #596, #1764): the entry stays, still
    // listed, until the peer is back, the window runs out or the match it
    // dropped from ends. A peer that means to go says `lobby-leave` first.
    away.set(peerId, nowMs());
    if (match !== undefined) {
      return;
    }
    // Not ready while it is away, so nothing starts without it.
    const dropped = members.get(peerId);
    if (dropped !== undefined) {
      dropped.ready = false;
      // Nor does the queue: a party member dropped takes it out (#1766).
      if (queueing !== undefined && dropped.team === 0) {
        leaveQueue();
        return;
      }
    }
    // A queued lobby one short waits for it again, on the clock it started with.
    if (countdownEndsAt !== undefined) {
      countdownEndsAt = undefined;
      phase = "waiting";
    }
    broadcast();
  });

  return host;
}

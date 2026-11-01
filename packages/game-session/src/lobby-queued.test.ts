import { ANNIHILATION_MATCH_RULES, STARTER_BUILDS, type PlayerBuild } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parseWireLobbyNote,
  parseWireLobbyState,
  parseWirePartyProposal,
  type Channel,
  type JsonValue,
  type PeerLobbyJoin,
  type WireLobbyNote,
  type WireLobbyState,
  type WireLobbyWelcome,
  type WirePartyFormed,
  type WirePartyProposal,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { LobbyNoAnswerError, LobbyRefusedError, joinLobby } from "./lobby-client.js";
import type { LobbyClosedReason, LobbyConnection } from "./lobby-connection.js";
import { MAP_IDS, MODE_MAPS, openLobby, provenPeer } from "./lobby-harness.test-support.js";
import { PARTY_CONSENT_MS, createLobbyHost, type LobbyHost, type MatchPlan } from "./lobby-host.js";
import { ARENA, TICK_SECONDS, settle, until } from "./match-harness.test-support.js";
import { createMatchHost, type MatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import {
  admissionBytes,
  admissionDigest,
  type AdmissionTag,
  type VerifyTicketSig,
} from "./queue-admission.js";
import { createMemoryBoard } from "./queue-board.js";
import {
  createQueueClient,
  type QueueClient,
  type QueueParty,
  type TicketKey,
} from "./queue-client.js";
import type { FormedGroup } from "./queue-formation.js";
import type { Transport } from "./transport.js";

/**
 * The queued lobby (#871, #854 C5-C7): a `createLobbyHost` with a plan
 * from the queue, its admission by signature both ways, its countdown and
 * its timeout. Signatures here are a stand-in, the digest and the ticket
 * id side by side, which anyone could forge: what is under test is that
 * each side signs and checks the right digest, not secp256k1.
 */

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** A stand-in ticket key: its "signature" is the digest and its own id. */
function keyOf(ticketId: string): TicketKey {
  return { ticketId, sign: (digest) => `${hex(digest)}${ticketId}` };
}

/** Signature checks made so far, by every side: a real one costs milliseconds. */
let verifications = 0;

const verifyTicketSig: VerifyTicketSig = (ticketId, digest, sig) => {
  verifications += 1;
  return sig === `${hex(digest)}${ticketId}`;
};

const [HOST, ALLY, FOE, FOE_2] = ["1", "2", "3", "4"].map((digit) => digit.repeat(64)) as [
  string,
  string,
  string,
  string,
];
/** In no group. */
const STRANGER = "9".repeat(64);
const GROUP_ID = "a".repeat(64);

const GROUP: FormedGroup = {
  groupId: GROUP_ID,
  room: `ra-${GROUP_ID}`,
  hostTicketId: HOST,
  teams: [
    [HOST, ALLY],
    [FOE, FOE_2],
  ],
  parties: [],
  mapId: "other-arena",
  mode: "random-arena-2v2",
};

/** The same seats, as a party of HOST and ALLY against two solos (#882). */
const PARTY_GROUP: FormedGroup = { ...GROUP, parties: [[HOST, ALLY]] };

/** Two parties (#882): HOST and ALLY against FOE and FOE_2, which leads. */
const PARTIES_GROUP: FormedGroup = {
  ...GROUP,
  parties: [
    [HOST, ALLY],
    [FOE, FOE_2],
  ],
};

const COUNTDOWN_SECONDS = 5;
const TIMEOUT_SECONDS = 20;
const STAY_TOGETHER_SECONDS = 15;

/** A match the test ends by hand, with the winner it is given. */
interface FakeMatch extends MatchHost {
  finish(winningTeam: 0 | 1 | null): void;
}

function fakeMatch(): FakeMatch {
  let phase: "active" | "finished" = "active";
  let winner: 0 | 1 | null = null;
  return {
    advance: () => undefined,
    get phase() {
      return phase;
    },
    get winningTeam() {
      return winner;
    },
    abandoned: false,
    droppedWeaponSwaps: 0,
    draining: false,
    retire: () => undefined,
    close: () => Promise.resolve(),
    finish(winningTeam) {
      phase = "finished";
      winner = winningTeam;
    },
  };
}

interface OpenQueuedOptions {
  readonly group?: FormedGroup;
  /** The host's own ticket: `group`'s host ticket. */
  readonly host?: string;
  /** Play this match instead of a real one. */
  readonly match?: FakeMatch;
}

interface QueuedLobby {
  readonly network: MemoryNetwork;
  readonly lobby: LobbyHost;
  readonly host: LobbyConnection;
  readonly plans: MatchPlan[];
  /** Each `onFellThrough` call's no-shows. */
  readonly fellThrough: (readonly string[])[];
  /** How many times `onDone` was called. */
  readonly done: () => number;
  /** What the host's peer sent, and to whom. */
  readonly sent: {
    readonly channel: Channel;
    readonly to: string | readonly string[] | undefined;
  }[];
  /** How the host's peer rewrites a party proposal it sends over the room. */
  readonly proposals: ProposalRewrite;
  /** A joiner holding `ticketId`, on a fresh peer unless one is given. */
  join(ticketId: string, transport?: Transport): Promise<LobbyConnection>;
  /** Run the lobby's clock on by `seconds`, a tick at a time. */
  step(seconds: number): Promise<void>;
}

/** What a host sends as its party proposal instead, while set (#1078). */
interface ProposalRewrite {
  rewrite: ((proposal: WirePartyProposal) => WirePartyProposal) | undefined;
}

/** `transport`, recording what it sends, and rewriting a proposal as `proposals` says. */
function spied(
  transport: Transport,
  sent: { channel: Channel; to: string | readonly string[] | undefined }[],
  proposals: ProposalRewrite = { rewrite: undefined },
): Transport {
  return {
    ...transport,
    selfId: transport.selfId,
    send(channel, data, to) {
      sent.push({ channel, to });
      const proposal = channel === "party-proposal" ? parseWirePartyProposal(data) : undefined;
      if (proposal !== undefined && proposals.rewrite !== undefined) {
        transport.send(channel, proposals.rewrite(proposal), to);
        return;
      }
      transport.send(channel, data, to);
    },
  };
}

function joinQueued(transport: Transport, ticketId: string, timeoutMs = 1000, group = GROUP) {
  return joinLobby({
    transport,
    code: GROUP_ID,
    // A queue room is public: its tickets are its gate (#1681).
    proofKey: null,
    name: `ticket-${ticketId.slice(0, 1)}`,
    guildTag: null,
    guildCape: null,
    timeoutMs,
    queued: { group, key: keyOf(ticketId), verifyTicketSig },
  });
}

async function openQueued(options: OpenQueuedOptions = {}): Promise<QueuedLobby> {
  const { group = GROUP, match, host: hostTicket = HOST } = options;
  const network = createMemoryNetwork();
  const plans: MatchPlan[] = [];
  const fellThrough: (readonly string[])[] = [];
  let done = 0;
  const sent: { channel: Channel; to: string | readonly string[] | undefined }[] = [];
  const proposals: ProposalRewrite = { rewrite: undefined };
  const lobby = createLobbyHost({
    transport: spied(network.join("host"), sent, proposals),
    code: GROUP_ID,
    proofKey: null,
    mapIds: MAP_IDS,
    modeMaps: MODE_MAPS,
    teamLobby: false,
    random: () => 0.5,
    startMatch(plan) {
      plans.push(plan);
      if (match !== undefined) {
        return match;
      }
      return createMatchHost({
        transport: plan.transport,
        map: ARENA,
        seed: plan.matchId,
        matchRules: ANNIHILATION_MATCH_RULES,
        random: () => 0.5,
        maxPlayers: 8,
        seats: plan.seats,
        matchId: plan.matchId,
        isSpectator: plan.isSpectator,
      });
    },
    queued: {
      group,
      key: keyOf(hostTicket),
      verifyTicketSig,
      countdownSeconds: COUNTDOWN_SECONDS,
      timeoutSeconds: TIMEOUT_SECONDS,
      onFellThrough: (noShows) => fellThrough.push(noShows),
      stayTogetherSeconds: STAY_TOGETHER_SECONDS,
      onDone: () => {
        done += 1;
      },
    },
  });
  const host = await joinQueued(lobby.local, hostTicket, 1000, group);
  return {
    network,
    lobby,
    host,
    plans,
    fellThrough,
    done: () => done,
    sent,
    proposals,
    join: (ticketId, transport = network.join()) => joinQueued(transport, ticketId, 1000, group),
    async step(seconds) {
      const ticks = Math.round(seconds / TICK_SECONDS);
      for (let i = 0; i < ticks; i += 1) {
        lobby.advance(TICK_SECONDS);
        await settle();
      }
    },
  };
}

/** A peer in the room that speaks the wire by hand, and what it was told. */
function rawPeer(network: MemoryNetwork): {
  transport: Transport;
  notes: WireLobbyNote[];
  states: WireLobbyState[];
  welcomes: unknown[];
} {
  const transport = network.join();
  const notes: WireLobbyNote[] = [];
  const states: WireLobbyState[] = [];
  const welcomes: unknown[] = [];
  transport.on("lobby-note", (data) => {
    const note = parseWireLobbyNote(data);
    if (note !== undefined) {
      notes.push(note);
    }
  });
  transport.on("lobby-state", (data) => {
    const state = parseWireLobbyState(data);
    if (state !== undefined) {
      states.push(state);
    }
  });
  transport.on("lobby-welcome", (data) => welcomes.push(data));
  return { transport, notes, states, welcomes };
}

/** A join as `signer` signs it, for `ticketId`, over the digest of the fields given. */
async function forgedJoin(
  ticketId: string,
  signer: string,
  digest: { groupId: string; hostTicketId: string; peerId: string },
): Promise<PeerLobbyJoin> {
  const bytes = await admissionDigest(
    "vibewars-admit",
    digest.groupId,
    digest.hostTicketId,
    digest.peerId,
  );
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: "Forger",
    guildTag: null,
    guildCape: null,
    admission: { seatKey: ticketId, admissionSig: keyOf(signer).sign(bytes) },
  };
}

function teamsOf(connection: LobbyConnection): Record<string, 0 | 1 | null> {
  return Object.fromEntries(
    connection.getSnapshot().players.map((player) => [player.name, player.team]),
  );
}

describe("a queued lobby", () => {
  it("seats each ticket on its planned team, the host's own too, on the planned map", async () => {
    const queued = await openQueued();
    const foe = await queued.join(FOE);
    await queued.join(ALLY);
    await settle();
    expect(teamsOf(foe)).toEqual({ "ticket-1": 0, "ticket-3": 1, "ticket-2": 0 });
    expect(foe.getSnapshot().mapId).toBe("other-arena");
  });

  it("refuses a proof for another host, peer id or group, or signed by another ticket", async () => {
    const queued = await openQueued();
    const right = { groupId: GROUP_ID, hostTicketId: HOST };
    for (const [ticketId, signer, digest] of [
      [ALLY, ALLY, { ...right, hostTicketId: FOE }],
      [ALLY, ALLY, { ...right, peerId: "peer-elsewhere" }],
      [ALLY, ALLY, { ...right, groupId: "b".repeat(64) }],
      [ALLY, FOE, right],
      [STRANGER, STRANGER, right],
    ] as const) {
      const peer = rawPeer(queued.network);
      await settle();
      peer.transport.send(
        "lobby-join",
        await forgedJoin(ticketId, signer, { peerId: peer.transport.selfId, ...digest }),
        "host",
      );
      await until(() => peer.notes.length > 0);
      expect(peer.notes).toEqual([{ kind: "refused", reason: "not-admitted" }]);
    }
    expect(queued.host.getSnapshot().players).toHaveLength(1);
  });

  it("refuses a join with no proof, and a ticket already seated in another tab", async () => {
    const queued = await openQueued();
    const bare = rawPeer(queued.network);
    await settle();
    bare.transport.send(
      "lobby-join",
      {
        protocolVersion: PROTOCOL_VERSION,
        name: "Bare",
        guildTag: null,
        admission: null,
      },
      "host",
    );
    await until(() => bare.notes.length > 0);
    expect(bare.notes).toEqual([{ kind: "refused", reason: "not-admitted" }]);

    await queued.join(ALLY);
    await expect(queued.join(ALLY)).rejects.toEqual(new LobbyRefusedError("ticket-used"));
  });

  it("checks a peer's proof once while it is here, and a seated ticket's not at all", async () => {
    const queued = await openQueued();
    await queued.join(ALLY);
    const peer = rawPeer(queued.network);
    await settle();
    const bad = await forgedJoin(FOE, ALLY, {
      groupId: GROUP_ID,
      hostTicketId: HOST,
      peerId: peer.transport.selfId,
    });
    const before = verifications;
    for (let i = 0; i < 20; i += 1) {
      peer.transport.send("lobby-join", bad, "host");
    }
    await until(() => peer.notes.length > 0);
    await settle();
    expect(verifications - before).toBe(1);
    expect(peer.notes).toEqual([{ kind: "refused", reason: "not-admitted" }]);

    const twin = rawPeer(queued.network);
    await settle();
    const used = await forgedJoin(ALLY, FOE, {
      groupId: GROUP_ID,
      hostTicketId: HOST,
      peerId: twin.transport.selfId,
    });
    const beforeTwin = verifications;
    twin.transport.send("lobby-join", used, "host");
    await until(() => twin.notes.length > 0);
    expect(twin.notes).toEqual([{ kind: "refused", reason: "ticket-used" }]);
    expect(verifications - beforeTwin).toBe(0);
  });

  it("checks one welcome per peer, however many it sends", async () => {
    const network = createMemoryNetwork();
    const flooder = network.join("flooder");
    flooder.on("lobby-hello", (_data, from) => {
      const welcome: WireLobbyWelcome = { hostSig: "ab".repeat(64) };
      for (let i = 0; i < 20; i += 1) {
        flooder.send("lobby-welcome", welcome, from);
      }
    });
    const before = verifications;
    await expect(joinQueued(network.join(), FOE, 200)).rejects.toBeInstanceOf(LobbyNoAnswerError);
    expect(verifications - before).toBe(1);
  });

  it("is refused by a coded lobby, which takes no proof", async () => {
    const coded = await openLobby();
    // It holds the coded lobby's key (#1681): only the ticket is wrong.
    const transport = await provenPeer(coded);
    const notes: unknown[] = [];
    transport.on("lobby-note", (data) => notes.push(parseWireLobbyNote(data)));
    transport.send(
      "lobby-join",
      await forgedJoin(ALLY, ALLY, {
        groupId: GROUP_ID,
        hostTicketId: HOST,
        peerId: transport.selfId,
      }),
    );
    await settle();
    expect(notes).toEqual([{ kind: "refused", reason: "not-admitted" }]);
  });

  it("sends its join to the proven host alone, and only a hello to the room", async () => {
    const queued = await openQueued();
    const bystander = queued.network.join();
    const overheard: unknown[] = [];
    bystander.on("lobby-join", (data) => overheard.push(data));
    const sent: { channel: Channel; to: string | readonly string[] | undefined }[] = [];
    const ally = queued.network.join();
    await queued.join(ALLY, spied(ally, sent));
    const joins = sent.filter((message) => message.channel === "lobby-join");
    const welcomes = queued.sent.filter((message) => message.channel === "lobby-welcome");
    expect(sent).toContainEqual({ channel: "lobby-hello", to: undefined });
    expect(joins).toEqual([{ channel: "lobby-join", to: "host" }]);
    expect(overheard).toEqual([]);
    // Once, though its hello and its join both asked; the host's own player
    // is welcomed past the room, through its local peer.
    expect(welcomes).toEqual([{ channel: "lobby-welcome", to: ally.selfId }]);
  });

  it("seats a joiner that asks long after its peer joined the room", async () => {
    const queued = await openQueued();
    // Every peer's arrival is told before the joiner listens for it.
    const late = queued.network.join();
    await settle();
    await queued.join(ALLY, late);
    expect(teamsOf(queued.host)).toEqual({ "ticket-1": 0, "ticket-2": 0 });
  });

  it("takes no lobby from a peer whose welcome does not prove the planned host", async () => {
    for (const [signer, joins] of [
      [FOE, false],
      [HOST, true],
    ] as const) {
      const network = createMemoryNetwork();
      const impostor = network.join("impostor");
      // A lobby that lists the joiner, to its hello and to its join.
      const answer = (from: string): void => {
        const state: WireLobbyState = {
          code: GROUP_ID,
          phase: "waiting",
          mode: "random-arena",
          mapId: "other-arena",
          open: true,
          hostId: "impostor",
          matchId: null,
          teamLobby: null,
          queueNonce: null,
          players: [
            {
              id: from,
              name: "x",
              team: 1,
              ready: false,
              isHost: false,
              guildTag: null,
              guildCape: null,
              bot: false,
              away: false,
            },
          ],
          countdownSeconds: null,
        };
        impostor.send("lobby-state", state, from);
      };
      impostor.on("lobby-hello", (_data, from) => {
        void admissionDigest("vibewars-host", GROUP_ID, HOST, from).then((digest) => {
          const welcome: WireLobbyWelcome = { hostSig: keyOf(signer).sign(digest) };
          impostor.send("lobby-welcome", welcome, from);
          answer(from);
        });
      });
      impostor.on("lobby-join", (_data, from) => answer(from));
      const joining = joinQueued(network.join(), FOE, 200);
      if (joins) {
        await expect(joining).resolves.toBeDefined();
      } else {
        await expect(joining).rejects.toBeInstanceOf(LobbyNoAnswerError);
      }
    }
  });

  it("refuses team picks, map picks and ready", async () => {
    const queued = await openQueued();
    const foe = await queued.join(FOE);
    foe.chooseTeam(0);
    foe.setReady(true);
    queued.host.selectMap("test-arena");
    queued.host.chooseTeam(null);
    await settle();
    expect(teamsOf(foe)).toEqual({ "ticket-1": 0, "ticket-3": 1 });
    expect(foe.getSnapshot().players.every((player) => !player.ready)).toBe(true);
    expect(foe.getSnapshot().mapId).toBe("other-arena");
  });

  it("counts down once all are seated, then starts the match on the group's map", async () => {
    const queued = await openQueued();
    const ally = await queued.join(ALLY);
    await queued.join(FOE);
    expect(ally.getSnapshot().countdownSeconds).toBeNull();
    await queued.join(FOE_2);
    await settle();
    expect(ally.getSnapshot()).toMatchObject({ phase: "starting", countdownSeconds: 5 });
    await queued.step(1);
    expect(ally.getSnapshot().countdownSeconds).toBe(4);
    expect(queued.plans).toHaveLength(0);
    await queued.step(COUNTDOWN_SECONDS - 1);
    expect(queued.plans).toHaveLength(1);
    const [plan] = queued.plans;
    expect(plan?.mapId).toBe("other-arena");
    expect([...(plan?.seats.values() ?? [])].map((seat) => seat.team).sort()).toEqual([0, 0, 1, 1]);
    expect(ally.getSnapshot()).toMatchObject({ phase: "in-match", countdownSeconds: null });
  });

  it("falls through at the timeout, naming the tickets that never came", async () => {
    const queued = await openQueued();
    const ally = await queued.join(ALLY);
    const closed: LobbyClosedReason[] = [];
    ally.onClosed((reason) => closed.push(reason));
    await queued.step(TIMEOUT_SECONDS - 1);
    expect(queued.fellThrough).toEqual([]);
    await queued.step(1);
    expect(queued.fellThrough).toEqual([[FOE, FOE_2]]);
    await settle();
    expect(closed).toEqual(["fell-through"]);
  });

  it("stops the countdown when a member leaves it, on the timeout it started with", async () => {
    const queued = await openQueued();
    const ally = await queued.join(ALLY);
    const foeRoom = queued.network.join();
    await queued.join(FOE, foeRoom);
    await queued.join(FOE_2);
    await queued.step(2);
    await foeRoom.leave();
    await settle();
    expect(ally.getSnapshot()).toMatchObject({ phase: "waiting", countdownSeconds: null });
    await queued.step(TIMEOUT_SECONDS - 2);
    expect(queued.plans).toHaveLength(0);
    expect(queued.fellThrough).toEqual([[FOE]]);
  });
});

describe("a queued lobby with parties (#882)", () => {
  it("seats each party member on its own seat key, on its party's side", async () => {
    const queued = await openQueued({ group: PARTIES_GROUP });
    const foe = await queued.join(FOE);
    await queued.join(ALLY);
    await queued.join(FOE_2);
    await settle();
    expect(teamsOf(foe)).toEqual({ "ticket-1": 0, "ticket-2": 0, "ticket-3": 1, "ticket-4": 1 });
  });

  it("refuses a seat key proven by another member's key, and a seat key seated already", async () => {
    const queued = await openQueued({ group: PARTIES_GROUP });
    await queued.join(ALLY);
    const right = { groupId: GROUP_ID, hostTicketId: HOST };
    for (const [seatKey, signer, reason] of [
      [FOE_2, FOE, "not-admitted"],
      [ALLY, ALLY, "ticket-used"],
    ] as const) {
      const peer = rawPeer(queued.network);
      await settle();
      peer.transport.send(
        "lobby-join",
        await forgedJoin(seatKey, signer, { ...right, peerId: peer.transport.selfId }),
        "host",
      );
      await until(() => peer.notes.length > 0);
      expect(peer.notes).toEqual([{ kind: "refused", reason }]);
    }
  });

  it("falls through naming a party's ticket when one of its members never came", async () => {
    const queued = await openQueued({ group: PARTIES_GROUP });
    await queued.join(ALLY);
    await queued.join(FOE);
    await queued.step(TIMEOUT_SECONDS);
    expect(queued.fellThrough).toEqual([[FOE]]);
  });

  it("names the host's own party when its other member never came", async () => {
    const queued = await openQueued({ group: PARTY_GROUP });
    await queued.join(FOE);
    await queued.join(FOE_2);
    await queued.step(TIMEOUT_SECONDS);
    expect(queued.fellThrough).toEqual([[HOST]]);
  });
});

describe("a queued team mode's seat plans (ADR-0042)", () => {
  /** Team Arena: HOST and ALLY, and two bots, against FOE and three bots. */
  const ARENA_GROUP: FormedGroup = {
    ...GROUP,
    teams: [[HOST, ALLY], [FOE]],
    parties: [[FOE], [HOST, ALLY]],
    mode: "team-arena",
  };

  function starter(index: number): PlayerBuild {
    const build = STARTER_BUILDS[index % STARTER_BUILDS.length];
    if (build === undefined) {
      throw new Error("no starter builds");
    }
    return build;
  }

  /** `seats`, one `team-plan` a seat, from `transport` to the host. */
  function sendPlan(
    transport: Transport,
    seats: readonly { readonly memberKey: string | null; readonly build: JsonValue }[],
    size = seats.length,
  ): void {
    seats.forEach(({ memberKey, build }, slot) => {
      transport.send("lobby-cmd", { kind: "team-plan", slot, size, memberKey, build }, "host");
    });
  }

  /** Starter build `index`, renamed `"plan <index>"`, so it is told from the house team's. */
  const planned = (index: number): JsonValue =>
    JSON.parse(JSON.stringify({ ...starter(index), name: `plan ${String(index)}` })) as JsonValue;

  /** A whole Team Arena side for FOE: FOE on starter 5, bots on 6, 7 and 8. */
  const FOE_SEAT = { memberKey: FOE, build: planned(5) };
  const FOE_BOTS = [6, 7, 8].map((index) => ({ memberKey: null, build: planned(index) }));
  const FOE_PLAN = [FOE_SEAT, ...FOE_BOTS];

  /**
   * Open ARENA_GROUP, seat everyone, let `plan` act, and run the countdown
   * out. `rejected`: what each human's match-start said of its side's plan.
   */
  async function play(
    plan: (queued: QueuedLobby, foe: Transport, ally: Transport) => void,
  ): Promise<{
    readonly queued: QueuedLobby;
    readonly seats: MatchPlan["seats"];
    readonly rejected: ReadonlyMap<string, boolean>;
  }> {
    const queued = await openQueued({ group: ARENA_GROUP, match: fakeMatch() });
    const rejected = new Map<string, boolean>();
    const watch = (who: string, connection: LobbyConnection): void => {
      connection.onMatchStarting((start) => rejected.set(who, start.teamPlanRejected));
    };
    watch(HOST, queued.host);
    const ally = queued.network.join();
    watch(ALLY, await queued.join(ALLY, ally));
    const foe = queued.network.join();
    watch(FOE, await queued.join(FOE, foe));
    await settle();
    plan(queued, foe, ally);
    await settle();
    await queued.step(COUNTDOWN_SECONDS);
    await settle();
    const [started] = queued.plans;
    if (started === undefined) {
      throw new Error("the match never started");
    }
    return { queued, seats: started.seats, rejected };
  }

  /** Each seat on `team`: a bot, or a human by name, and its build's primary. */
  function sideOf(seats: MatchPlan["seats"], team: 0 | 1): string[] {
    return [...seats.values()]
      .filter((seat) => seat.team === team)
      .map((seat) => `${seat.bot ? "bot" : seat.name}:${seat.build?.name ?? "own"}`)
      .sort();
  }

  /** Seats as `sideOf` says them: who, and a plan's build or a house one. */
  function side(builds: readonly (readonly [string, number, "plan" | "house"])[]): string[] {
    return builds
      .map(
        ([who, index, from]) =>
          `${who}:${from === "plan" ? `plan ${String(index)}` : starter(index).name}`,
      )
      .sort();
  }

  it("seats a side by its plan, bots and builds, the host's own side by its own", async () => {
    const { seats } = await play((queued, foe) => {
      sendPlan(foe, FOE_PLAN);
      sendPlan(queued.lobby.local, [
        { memberKey: null, build: planned(1) },
        { memberKey: ALLY, build: planned(2) },
        { memberKey: HOST, build: planned(3) },
        { memberKey: null, build: planned(4) },
      ]);
    });
    expect(seats.size).toBe(8);
    expect(sideOf(seats, 1)).toEqual(
      side([
        ["ticket-3", 5, "plan"],
        ["bot", 6, "plan"],
        ["bot", 7, "plan"],
        ["bot", 8, "plan"],
      ]),
    );
    expect(sideOf(seats, 0)).toEqual(
      side([
        ["bot", 1, "plan"],
        ["ticket-2", 2, "plan"],
        ["ticket-1", 3, "plan"],
        ["bot", 4, "plan"],
      ]),
    );
  });

  it("gives a side with no plan the house team, its humans first", async () => {
    const { seats } = await play((_, foe) => sendPlan(foe, FOE_PLAN));
    expect(sideOf(seats, 0)).toEqual(
      side([
        ["ticket-1", 0, "house"],
        ["ticket-2", 1, "house"],
        ["bot", 2, "house"],
        ["bot", 3, "house"],
      ]),
    );
  });

  const HOUSE_FOE = side([
    ["ticket-3", 0, "house"],
    ["bot", 1, "house"],
    ["bot", 2, "house"],
    ["bot", 3, "house"],
  ]);

  it.each<[string, (queued: QueuedLobby, foe: Transport) => void]>([
    [
      "names a key not on its ticket",
      (_, foe) => sendPlan(foe, [{ ...FOE_SEAT, memberKey: ALLY }, ...FOE_BOTS]),
    ],
    [
      "leaves its human out",
      (_, foe) => sendPlan(foe, [{ memberKey: null, build: planned(5) }, ...FOE_BOTS]),
    ],
    ["is a seat short", (_, foe) => sendPlan(foe, FOE_PLAN.slice(0, 3))],
    [
      "is of another length",
      (_, foe) => sendPlan(foe, [...FOE_PLAN, { memberKey: null, build: planned(1) }]),
    ],
    [
      "plays a skill nobody knows",
      (_, foe) =>
        sendPlan(foe, [
          {
            ...FOE_SEAT,
            build: {
              ...(planned(5) as Record<string, JsonValue>),
              skillBar: ["warrior.no-such-skill", ...starter(5).skillBar.slice(1)],
            },
          },
          ...FOE_BOTS,
        ]),
    ],
    [
      "sends something that is no build",
      (_, foe) => sendPlan(foe, [{ ...FOE_SEAT, build: "a build" }, ...FOE_BOTS]),
    ],
  ])("gives the house team to a side whose plan %s", async (_, plan) => {
    const { seats } = await play(plan);
    expect(sideOf(seats, 1)).toEqual(HOUSE_FOE);
  });

  /** Each human's `teamPlanRejected`, HOST and ALLY on side 0, FOE on side 1. */
  const told = (host: boolean, ally: boolean, foe: boolean): Map<string, boolean> =>
    new Map([
      [HOST, host],
      [ALLY, ally],
      [FOE, foe],
    ]);

  it("tells every human of a side its plan was not accepted, and nobody else (#1822)", async () => {
    const { rejected } = await play((queued) =>
      sendPlan(queued.lobby.local, [
        { memberKey: null, build: planned(1) },
        { memberKey: ALLY, build: "a build" },
        { memberKey: HOST, build: planned(3) },
        { memberKey: null, build: planned(4) },
      ]),
    );
    expect(rejected).toEqual(told(true, true, false));
  });

  it("tells nobody of a whole plan, nor of a side that sent none (#1822)", async () => {
    const { rejected } = await play((_, foe) => sendPlan(foe, FOE_PLAN));
    expect(rejected).toEqual(told(false, false, false));
  });

  it("tells the side whose plan is a seat short (#1822)", async () => {
    const { rejected } = await play((_, foe) => sendPlan(foe, FOE_PLAN.slice(0, 3)));
    expect(rejected).toEqual(told(false, false, true));
  });

  it("ignores a plan from a member that is not its side's ticket host", async () => {
    const { seats } = await play((_, __, ally) =>
      sendPlan(ally, [
        { memberKey: HOST, build: planned(5) },
        { memberKey: ALLY, build: planned(6) },
        { memberKey: null, build: planned(7) },
        { memberKey: null, build: planned(8) },
      ]),
    );
    expect(sideOf(seats, 0)).toEqual(
      side([
        ["ticket-1", 0, "house"],
        ["ticket-2", 1, "house"],
        ["bot", 2, "house"],
        ["bot", 3, "house"],
      ]),
    );
  });

  it("ignores each human's own hello build: every seat plays the plan's", async () => {
    const { seats } = await play((_, foe) => sendPlan(foe, FOE_PLAN));
    expect([...seats.values()].every((seat) => seat.build !== null)).toBe(true);
  });

  it("takes no plan in a Random Arena lobby", async () => {
    const queued = await openQueued({ match: fakeMatch() });
    await queued.join(ALLY);
    const foe = queued.network.join();
    await queued.join(FOE, foe);
    await queued.join(FOE_2);
    sendPlan(foe, [
      { memberKey: FOE, build: planned(5) },
      { memberKey: FOE_2, build: planned(6) },
    ]);
    await settle();
    await queued.step(COUNTDOWN_SECONDS);
    expect([...(queued.plans[0]?.seats.values() ?? [])].map((seat) => seat.build)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("Stay together, on a queued lobby's host (#882, #1078)", () => {
  /** A 2v2 lobby whose match is over, team 0 (HOST and ALLY) the winner. */
  async function afterMatch(winningTeam: 0 | 1 | null = 0) {
    const match = fakeMatch();
    const queued = await openQueued({ match });
    const allyRoom = queued.network.join();
    /** What the ally's connection sent. */
    const allySent: { channel: Channel; to: string | readonly string[] | undefined }[] = [];
    const ally = await queued.join(ALLY, spied(allyRoom, allySent));
    const foe = await queued.join(FOE);
    await queued.join(FOE_2);
    await queued.step(COUNTDOWN_SECONDS);
    expect(queued.plans).toHaveLength(1);
    match.finish(winningTeam);
    await queued.step(TICK_SECONDS);
    /** Each connection's answers: the party's members, or `null`. */
    const answers = new Map<string, (readonly string[] | null)[]>();
    /** The ally's, whole. */
    const parties: (WirePartyFormed | null)[] = [];
    for (const [name, connection] of [
      ["host", queued.host],
      ["ally", ally],
      ["foe", foe],
    ] as const) {
      const heard: (readonly string[] | null)[] = [];
      answers.set(name, heard);
      connection.onParty((party) => heard.push(party === null ? null : party.members));
    }
    ally.onParty((party) => parties.push(party));
    return { queued, ally, allyRoom, allySent, foe, answers, parties };
  }

  const KEY_H = keyOf("e".repeat(64));
  const KEY_A = keyOf("d".repeat(64));
  /** The two of them, sorted. */
  const PARTY = [KEY_A.ticketId, KEY_H.ticketId];
  /** `key`'s consent to `members` of `groupId`, as the stand-in signs it. */
  const consentOf = async (
    key: TicketKey,
    members: readonly string[] = PARTY,
    groupId = GROUP_ID,
  ): Promise<string> =>
    key.sign(await admissionDigest("vibewars-party", groupId, members.join(""), GROUP.mode));
  /**
   * Until each of `names` has its answer: a consent is signed and checked
   * on `crypto.subtle`, which `settle` cannot wait for.
   */
  const answered = async (
    answers: ReadonlyMap<string, readonly unknown[]>,
    names: readonly string[] = ["host", "ally"],
  ): Promise<void> => {
    await until(() => names.every((name) => answers.get(name)?.length !== 0));
    await settle();
  };

  it("proposes the party once every winner sends a key, forms it once each consents, and tells only them", async () => {
    const { queued, ally, answers, parties } = await afterMatch();
    // What the shell extends its own deadline on (PR 1092).
    let signed = 0;
    ally.onPartyProposal(() => {
      signed += 1;
    });
    queued.host.stayTogether(KEY_H);
    await settle();
    expect(answers.get("host")).toEqual([]);
    ally.stayTogether(KEY_A);
    await answered(answers);
    expect(signed).toBe(1);
    expect(answers.get("host")).toEqual([PARTY]);
    expect(answers.get("ally")).toEqual([PARTY]);
    // Each consent beside its key, in the members' order.
    expect(parties).toEqual([
      {
        groupId: GROUP_ID,
        members: PARTY,
        consents: [await consentOf(KEY_A), await consentOf(KEY_H)],
      },
    ]);
    expect(answers.get("foe")).toEqual([]);
    // To the ally alone over the room; the host's own player is told in memory.
    for (const channel of ["party-proposal", "party-formed"]) {
      expect(
        queued.sent.filter((message) => message.channel === channel).map(({ to }) => to),
        channel,
      ).toEqual([ally.selfSessionId]);
    }
    // Done once the remote winner has its answer and has gone.
    expect(queued.done()).toBe(0);
    await ally.disconnect();
    await settle();
    expect(queued.done()).toBe(1);
  });

  it("end to end: both stay, the party meets two fresh solos, and each member seats on its own key", async () => {
    const { queued, ally, answers, parties } = await afterMatch();
    queued.host.stayTogether(KEY_H);
    ally.stayTogether(KEY_A);
    await answered(answers);
    const [formed] = parties;
    if (formed === undefined || formed === null) {
      throw new Error("no party formed");
    }
    const { members, groupId, consents } = formed;

    // The next queue: the two members as one party, two strangers alone.
    const board = createMemoryBoard();
    let now = 1_700_000_000_000;
    let fresh = 0;
    const client = (party?: QueueParty): QueueClient =>
      createQueueClient({
        board: board.board(),
        mode: "random-arena-2v2",
        ...(party === undefined ? {} : { party }),
        now: () => now,
        newTicketKey: () => keyOf(String((fresh += 1)).padStart(64, "5")),
        mapPool: ["other-arena"],
      });
    const clients = [
      client({ members, key: KEY_H, groupId, consents }),
      client({ members, key: KEY_A, groupId, consents }),
      client(),
      client(),
    ];
    for (let waited = 0; !clients.every((each) => each.state.kind === "in-lobby"); waited += 1) {
      expect(waited).toBeLessThan(30);
      now += 1_000;
      await Promise.all(clients.map((each) => each.tick()));
      await settle();
    }
    const groups = clients.map((each) =>
      each.state.kind === "in-lobby" ? each.state.group : undefined,
    );
    const [group] = groups;
    if (group === undefined) {
      throw new Error("no group");
    }
    expect(new Set(groups.map((each) => each?.groupId))).toEqual(new Set([group.groupId]));
    expect(group.teams).toContainEqual(members);
    expect(group.parties).toEqual([members]);

    // Its lobby, hosted by whichever ticket the group chose: every seat its own key.
    const next = await openQueued({ group, host: group.hostTicketId });
    for (const seatKey of group.teams.flat()) {
      if (seatKey !== group.hostTicketId) {
        await next.join(seatKey);
      }
    }
    await settle();
    const seated = next.host.getSnapshot().players;
    expect(seated).toHaveLength(4);
    const partySide = group.teams.findIndex((team) => team.includes(KEY_H.ticketId));
    expect(
      seated
        .filter((player) => player.team === partySide)
        .map((player) => player.name)
        .sort(),
    ).toEqual(["ticket-d", "ticket-e"]);
  });

  it("splits on one no, telling those who said yes", async () => {
    const { queued, ally, answers } = await afterMatch();
    queued.host.stayTogether(KEY_H);
    ally.stayTogether(null);
    await settle();
    expect(answers.get("host")).toEqual([null]);
    expect(answers.get("ally")).toEqual([]);
  });

  it("splits when a winner leaves before voting", async () => {
    const { queued, ally, answers } = await afterMatch();
    queued.host.stayTogether(KEY_H);
    await ally.disconnect();
    await settle();
    expect(answers.get("host")).toEqual([null]);
    expect(queued.done()).toBe(1);
  });

  it("splits when the window runs out, and is done", async () => {
    const { queued, answers } = await afterMatch();
    queued.host.stayTogether(KEY_H);
    await queued.step(STAY_TOGETHER_SECONDS - 1);
    expect(answers.get("host")).toEqual([]);
    expect(queued.done()).toBe(0);
    await queued.step(1);
    expect(answers.get("host")).toEqual([null]);
    expect(queued.done()).toBe(1);
  });

  it("ignores a loser's vote, a second vote and a key that is not one", async () => {
    const { queued, ally, foe, answers } = await afterMatch();
    foe.stayTogether(KEY_A);
    queued.host.stayTogether(KEY_H);
    queued.host.stayTogether(null);
    await settle();
    expect(answers.get("host")).toEqual([]);
    const raw = rawPeer(queued.network);
    raw.transport.send("stay-together", { memberKey: "nope" }, "host");
    ally.stayTogether(KEY_A);
    await answered(answers);
    expect(answers.get("host")).toEqual([PARTY]);
  });

  it("splits PARTY_CONSENT_MS after the proposal when a consent is missing or bad (#1078)", async () => {
    const { queued, allyRoom, answers } = await afterMatch();
    const before = verifications;
    queued.host.stayTogether(KEY_H);
    // By hand, so the ally's connection holds no key to consent with.
    allyRoom.send("stay-together", { memberKey: KEY_A.ticketId }, "host");
    await settle();
    // The ally's consent to another set (the PR 1092 attack), then one by another key.
    const elsewhere = [KEY_A.ticketId, "f".repeat(64)];
    for (const consent of [await consentOf(KEY_A, elsewhere), await consentOf(KEY_H)]) {
      const checked = verifications;
      allyRoom.send("party-consent", { memberKey: KEY_A.ticketId, consent }, "host");
      await until(() => verifications > checked);
    }
    // The host's own consent too: three checks, and still no party.
    await until(() => verifications >= before + 3);
    await settle();
    expect(answers.get("host")).toEqual([]);
    await queued.step(PARTY_CONSENT_MS / 1000 - TICK_SECONDS);
    expect(answers.get("host")).toEqual([]);
    await queued.step(TICK_SECONDS);
    expect(answers.get("host")).toEqual([null]);
    expect(answers.get("ally")).toEqual([null]);
  });

  it("splits when a member leaves after the proposal, with every other consent in (PR 1092)", async () => {
    const { queued, ally, allyRoom, answers } = await afterMatch();
    const before = verifications;
    queued.host.stayTogether(KEY_H);
    // By hand, so the ally's connection holds no key to consent with.
    allyRoom.send("stay-together", { memberKey: KEY_A.ticketId }, "host");
    // The host's own consent is in: the ally's is all that is missing.
    await until(() => verifications > before);
    await settle();
    expect(answers.get("host")).toEqual([]);
    await ally.disconnect();
    await settle();
    expect(answers.get("host")).toEqual([null]);
    expect(queued.sent.filter((message) => message.channel === "party-formed")).toEqual([]);
    expect(queued.done()).toBe(1);
  });

  it("signs no proposal without this player's key, of another group, or for another mode (#1078, #1766)", async () => {
    const rewrites: ((proposal: WirePartyProposal) => WirePartyProposal)[] = [
      (proposal) => ({ ...proposal, groupId: "b".repeat(64) }),
      (proposal) => ({ ...proposal, mode: "team-arena" }),
      (proposal) => ({ ...proposal, members: [KEY_H.ticketId, "f".repeat(64)] }),
    ];
    for (const rewrite of rewrites) {
      const { queued, ally, allySent, answers } = await afterMatch();
      queued.proposals.rewrite = rewrite;
      let signed = 0;
      ally.onPartyProposal(() => {
        signed += 1;
      });
      const before = verifications;
      queued.host.stayTogether(KEY_H);
      ally.stayTogether(KEY_A);
      await until(() => verifications > before);
      await queued.step(PARTY_CONSENT_MS / 1000);
      expect(allySent.filter((message) => message.channel === "party-consent")).toEqual([]);
      expect(signed).toBe(0);
      expect(answers.get("host")).toEqual([null]);
    }
  });

  it("is done at once when no team won, with nothing to vote on", async () => {
    const { queued } = await afterMatch(null);
    await queued.step(TICK_SECONDS);
    expect(queued.done()).toBe(1);
  });

  it("takes no vote from the host's player when its side lost", async () => {
    const { queued, foe, answers } = await afterMatch(1);
    queued.host.stayTogether(KEY_H);
    foe.stayTogether(KEY_A);
    await settle();
    // FOE_2 has not voted: the foes' vote still waits, and the host is not in it.
    expect(answers.get("foe")).toEqual([]);
    expect(answers.get("host")).toEqual([]);
  });
});

describe("admissionDigest", () => {
  it("tells two splits of the same characters apart", async () => {
    const tag: AdmissionTag = "vibewars-admit";
    const one = await admissionDigest(tag, "ab", "c", "d");
    const other = await admissionDigest(tag, "a", "bc", "d");
    expect(hex(one)).not.toBe(hex(other));
    expect(one).toHaveLength(32);
  });

  it("differs between the joiner's and the host's proof of the same seat", async () => {
    const admit = await admissionDigest("vibewars-admit", GROUP_ID, HOST, "peer-2");
    const welcome = await admissionDigest("vibewars-host", GROUP_ID, HOST, "peer-2");
    expect(hex(admit)).not.toBe(hex(welcome));
  });

  it("differs between a party consent and either proof of the same fields (#1078)", async () => {
    const party = hex(await admissionDigest("vibewars-party", GROUP_ID, HOST, ""));
    for (const tag of ["vibewars-admit", "vibewars-host"] as const) {
      expect(hex(await admissionDigest(tag, GROUP_ID, HOST, ""))).not.toBe(party);
    }
  });

  it("is the sha256 of admissionBytes, which the queue board hashes at once", async () => {
    const bytes = admissionBytes("vibewars-party", GROUP_ID, HOST, "");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    expect(hex(await admissionDigest("vibewars-party", GROUP_ID, HOST, ""))).toBe(hex(digest));
  });
});

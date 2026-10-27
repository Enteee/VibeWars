import { RANDOM_ARENA_RULES } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parseWireLobbyNote,
  parseWireLobbyState,
  type Channel,
  type PeerLobbyJoin,
  type WireLobbyNote,
  type WireLobbyState,
  type WireLobbyWelcome,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { LobbyNoAnswerError, LobbyRefusedError, joinLobby } from "./lobby-client.js";
import type { LobbyClosedReason, LobbyConnection } from "./lobby-connection.js";
import { openLobby } from "./lobby-harness.test-support.js";
import { createLobbyHost, type LobbyHost, type MatchPlan } from "./lobby-host.js";
import { ARENA, TICK_SECONDS, settle, until } from "./match-harness.test-support.js";
import { createMatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import { admissionDigest, type AdmissionTag, type VerifyTicketSig } from "./queue-admission.js";
import type { TicketKey } from "./queue-client.js";
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
  mapId: "other-arena",
};

const COUNTDOWN_SECONDS = 5;
const TIMEOUT_SECONDS = 20;

interface QueuedLobby {
  readonly network: MemoryNetwork;
  readonly lobby: LobbyHost;
  readonly host: LobbyConnection;
  readonly plans: MatchPlan[];
  /** Each `onFellThrough` call's no-shows. */
  readonly fellThrough: (readonly string[])[];
  /** What the host's peer sent, and to whom. */
  readonly sent: { readonly channel: Channel; readonly to: string | undefined }[];
  /** A joiner holding `ticketId`, on a fresh peer unless one is given. */
  join(ticketId: string, transport?: Transport): Promise<LobbyConnection>;
  /** Run the lobby's clock on by `seconds`, a tick at a time. */
  step(seconds: number): Promise<void>;
}

/** `transport`, recording what it sends. */
function spied(
  transport: Transport,
  sent: { channel: Channel; to: string | undefined }[],
): Transport {
  return {
    ...transport,
    selfId: transport.selfId,
    send(channel, data, to) {
      sent.push({ channel, to });
      transport.send(channel, data, to);
    },
  };
}

function joinQueued(transport: Transport, ticketId: string, timeoutMs = 1000) {
  return joinLobby({
    transport,
    code: GROUP_ID,
    name: `ticket-${ticketId.slice(0, 1)}`,
    character: null,
    timeoutMs,
    queued: { group: GROUP, key: keyOf(ticketId), verifyTicketSig },
  });
}

async function openQueued(): Promise<QueuedLobby> {
  const network = createMemoryNetwork();
  const plans: MatchPlan[] = [];
  const fellThrough: (readonly string[])[] = [];
  const sent: { channel: Channel; to: string | undefined }[] = [];
  const lobby = createLobbyHost({
    transport: spied(network.join("host"), sent),
    code: GROUP_ID,
    mapIds: ["test-arena", "other-arena"],
    startMatch(plan) {
      plans.push(plan);
      return createMatchHost({
        transport: plan.transport,
        map: ARENA,
        seed: plan.matchId,
        matchRules: plan.matchRules,
        random: () => 0.5,
        maxPlayers: 8,
        seats: plan.seats,
      });
    },
    queued: {
      group: GROUP,
      key: keyOf(HOST),
      verifyTicketSig,
      matchRules: RANDOM_ARENA_RULES,
      countdownSeconds: COUNTDOWN_SECONDS,
      timeoutSeconds: TIMEOUT_SECONDS,
      onFellThrough: (noShows) => fellThrough.push(noShows),
    },
  });
  const host = await joinQueued(lobby.local, HOST);
  return {
    network,
    lobby,
    host,
    plans,
    fellThrough,
    sent,
    join: (ticketId, transport = network.join()) => joinQueued(transport, ticketId),
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
    character: null,
    admission: { ticketId, admissionSig: keyOf(signer).sign(bytes) },
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
      { protocolVersion: PROTOCOL_VERSION, name: "Bare", character: null, admission: null },
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
    const peer = rawPeer(coded.network);
    await settle();
    peer.transport.send(
      "lobby-join",
      await forgedJoin(ALLY, ALLY, {
        groupId: GROUP_ID,
        hostTicketId: HOST,
        peerId: peer.transport.selfId,
      }),
    );
    await settle();
    expect(peer.notes).toEqual([{ kind: "refused", reason: "not-admitted" }]);
  });

  it("sends its join to the proven host alone, and only a hello to the room", async () => {
    const queued = await openQueued();
    const bystander = queued.network.join();
    const overheard: unknown[] = [];
    bystander.on("lobby-join", (data) => overheard.push(data));
    const sent: { channel: Channel; to: string | undefined }[] = [];
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
          mapId: "other-arena",
          hostId: "impostor",
          matchId: null,
          players: [{ id: from, name: "x", team: 1, ready: false, isHost: false, character: null }],
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

  it("counts down once all are seated, then starts the match with RANDOM_ARENA_RULES", async () => {
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
    expect(plan?.matchRules).toBe(RANDOM_ARENA_RULES);
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
});

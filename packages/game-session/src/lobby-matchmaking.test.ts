import {
  TEAM_LOBBY_STAGE_SECONDS,
  type LobbyMode,
  type WirePartyFormed,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { openLobby, type Member, type TestLobby } from "./lobby-harness.test-support.js";
import { PARTY_CONSENT_MS } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";
import { admissionDigest, partyGroupId, type VerifyTicketSig } from "./queue-admission.js";
import type { TicketKey } from "./queue-client.js";

/**
 * A party lobby's matchmaking (#1766, ADR-0042): Find a match runs the
 * party's one-sided Team Lobby, then queues it under a fresh nonce, and
 * a party of more than one gathers each member's key and consent.
 * Signatures are a stand-in, the digest and the key side by side: what
 * is under test is that each side signs and checks the right digest.
 */

const ROOM_ID = "c".repeat(64);
const NONCE = "d".repeat(64);
const [GUEST_KEY, HOST_KEY] = ["1", "9"].map((digit) => digit.repeat(64)) as [string, string];

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

function keyOf(ticketId: string): TicketKey {
  return { ticketId, sign: (digest) => `${hex(digest)}${ticketId}` };
}

const verifyTicketSig: VerifyTicketSig = (ticketId, digest, sig) =>
  sig === `${hex(digest)}${ticketId}`;

/** Let the hashing land: `crypto.subtle` answers outside the microtask queue. */
async function landed(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    await settle();
  }
}

/** A party lobby of `mode`, Team Arena's by default, of the host and `guests`. */
async function partyLobby(
  guests: readonly string[],
  mode: LobbyMode = "team-arena",
): Promise<{ lobby: TestLobby; party: Member[] }> {
  const lobby = await openLobby({
    teamLobby: true,
    matchmaking: { roomId: ROOM_ID, verifyTicketSig, newNonce: () => NONCE },
  });
  const party = [lobby.host];
  for (const name of guests) {
    party.push(await lobby.join(name));
  }
  lobby.host.connection.selectMode(mode);
  party.forEach((who, i) => {
    who.connection.chooseTeam(i % 2 === 0 ? 0 : 1);
  });
  await settle();
  return { lobby, party };
}

/** Find a match, at `ascentRound` in Heroes' Ascent, and run the Team Lobby's vote and claim out. */
async function queue(lobby: TestLobby, ascentRound: number | null = null): Promise<void> {
  lobby.host.connection.findMatch(ascentRound);
  await settle();
  for (let stage = 0; stage < 2; stage += 1) {
    lobby.lobby.advance(TEAM_LOBBY_STAGE_SECONDS);
    await settle();
  }
  await landed();
}

/** Every answer `who` gets to its key, as it gets them. */
function answers(who: Member): (WirePartyFormed | null)[] {
  const got: (WirePartyFormed | null)[] = [];
  who.connection.onParty((party) => got.push(party));
  return got;
}

const phaseOf = (who: Member) => who.connection.getSnapshot().phase;

describe("a party lobby's matchmaking (#1766)", () => {
  it("runs the Team Lobby for the party's one side of the mode's size, every human on it", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    lobby.host.connection.findMatch(null);
    await settle();

    for (const who of party) {
      const shown = who.connection.getSnapshot();
      expect(shown.phase).toBe("team-lobby");
      expect(shown.teamLobby?.sides[0]?.size).toBe(4);
      expect(shown.teamLobby?.sides[1]).toBeNull();
      // Nobody is a bot yet: the party's free seats are, once claimed (#2029).
      expect(shown.players.map((player) => [player.name, player.team])).toEqual([
        ["Host", 0],
        ["Ann", 0],
      ]);
    }
  });

  it("is the host's alone, and Start is not how a team mode plays", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    const [, ann] = party as [Member, Member];
    const refused: string[] = [];
    ann.connection.onRefused((reason) => refused.push(reason));
    ann.connection.findMatch(null);
    await settle();
    expect(refused).toEqual(["not-host"]);

    const rejected: string[] = [];
    lobby.host.connection.onStartRejected((reason) => rejected.push(reason));
    for (const who of party) {
      who.connection.setReady(true);
    }
    await settle();
    lobby.host.connection.startMatch();
    await settle();
    expect(rejected).toEqual(["a team mode finds a match instead"]);
    expect(lobby.matches).toHaveLength(0);
    expect(phaseOf(lobby.host)).toBe("waiting");
  });

  it("queues the party under a fresh nonce once its Team Lobby ends, its seats planned", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    await queue(lobby);

    for (const who of party) {
      expect(who.connection.getSnapshot().phase).toBe("queued");
      expect(who.connection.getSnapshot().queueNonce).toBe(NONCE);
    }
    // No proposal: the house team, the host and Ann in the first two
    // seats, in join order, and two bots.
    const plan = lobby.lobby.teamPlan(HOST_KEY);
    expect(plan?.map((seat) => seat.memberKey)).toEqual([HOST_KEY, null, null, null]);
    expect(plan).toHaveLength(4);
  });

  it("gathers each member's key, the host's first, and forms the party once each consented", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    const [host, ann] = party as [Member, Member];
    const toHost = answers(host);
    const toAnn = answers(ann);
    await queue(lobby);

    ann.connection.queueParty(keyOf(GUEST_KEY));
    host.connection.queueParty(keyOf(HOST_KEY));
    await landed();

    const groupId = await partyGroupId(ROOM_ID, NONCE);
    const members = [HOST_KEY, GUEST_KEY];
    const digest = await admissionDigest("vibewars-party", groupId, members.join(""), "team-arena");
    const formed = { groupId, members, consents: members.map((key) => `${hex(digest)}${key}`) };
    expect(toHost).toEqual([formed]);
    expect(toAnn).toEqual([formed]);
    expect(lobby.lobby.teamPlan(HOST_KEY)?.map((seat) => seat.memberKey)).toEqual([
      HOST_KEY,
      GUEST_KEY,
      null,
      null,
    ]);
  });

  it("leaves the queue when a member's key never comes", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    const [host] = party as [Member, Member];
    const toHost = answers(host);
    await queue(lobby);
    host.connection.queueParty(keyOf(HOST_KEY));
    await landed();

    lobby.lobby.advance(PARTY_CONSENT_MS / 1000);
    await settle();
    expect(phaseOf(host)).toBe("waiting");
    expect(toHost).toEqual([null]);
  });

  it("takes the party out of the queue on Leave the queue, and when a member leaves", async () => {
    const { lobby, party } = await partyLobby(["Ann", "Bob"]);
    const [host, , bob] = party as [Member, Member, Member];
    await queue(lobby);
    host.connection.leaveQueue();
    await settle();
    expect(party.map(phaseOf)).toEqual(["waiting", "waiting", "waiting"]);
    expect(host.connection.getSnapshot().queueNonce).toBeNull();

    await queue(lobby);
    expect(phaseOf(host)).toBe("queued");
    await bob.connection.disconnect();
    await settle();
    expect(phaseOf(host)).toBe("waiting");
  });

  it("takes the party out of the queue when a member's peer drops, its seat held (#1764)", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    const [host, ann] = party as [Member, Member];
    await queue(lobby);
    expect(phaseOf(host)).toBe("queued");
    // Away, it can neither consent nor play: the party is not queued without it.
    lobby.network.partition("host", ann.transport.selfId);
    await settle();
    expect(phaseOf(host)).toBe("waiting");
    expect(host.connection.getSnapshot().queueNonce).toBeNull();
    expect(host.connection.getSnapshot().players.map(({ name, away }) => [name, away])).toEqual([
      ["Host", false],
      ["Ann", true],
    ]);
  });

  it("consents to no group but the one a member works out itself, nor to another mode", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    const [, ann] = party as [Member, Member];
    let signed = 0;
    ann.connection.onPartyProposal(() => (signed += 1));
    await queue(lobby);
    ann.connection.queueParty(keyOf(GUEST_KEY));
    await landed();

    const members = [HOST_KEY, GUEST_KEY];
    const groupId = await partyGroupId(ROOM_ID, NONCE);
    const annId = ann.transport.selfId;
    lobby.room.send(
      "party-proposal",
      { groupId: "e".repeat(64), members, mode: "team-arena" },
      annId,
    );
    lobby.room.send("party-proposal", { groupId, members, mode: "random-arena-4v4" }, annId);
    await landed();
    expect(signed).toBe(0);

    lobby.room.send("party-proposal", { groupId, members, mode: "team-arena" }, annId);
    await landed();
    expect(signed).toBe(1);
  });

  it("keeps a newcomer out of a queued party: it waits in the lobby, on no side", async () => {
    const { lobby } = await partyLobby(["Ann"]);
    await queue(lobby);
    const late = await lobby.join("Late");
    expect(phaseOf(late)).toBe("queued");
    expect(
      late.connection.getSnapshot().players.find((player) => player.name === "Late")?.team,
    ).toBeNull();
  });

  it("plays the house team in its own lobby: the party's seats, bots in the free ones (Q191)", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    await queue(lobby);
    lobby.host.connection.playHouseTeam();
    await settle();

    expect(party.map(phaseOf)).toEqual(["in-match", "in-match"]);
    const seats = [...(lobby.matches[0]?.plan.seats.values() ?? [])];
    expect(seats.filter((seat) => seat.team === 0).map((seat) => seat.bot)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(seats.filter((seat) => seat.team === 1 && seat.bot)).toHaveLength(4);
  });
});

describe("a Heroes' Ascent party's round (#1996)", () => {
  it("queues every member at the host's round, whatever the guest's own run was", async () => {
    const { lobby, party } = await partyLobby(["Ann"], "heroes-ascent");
    // Ann's own run, had she hosted, would be at round 0: the party's is the host's.
    await queue(lobby, 2);

    expect(party.map(phaseOf)).toEqual(["queued", "queued"]);
    expect(party.map((who) => who.connection.getSnapshot().ascentRound)).toEqual([2, 2]);
  });

  it("has no round outside Heroes' Ascent, nor once out of the queue", async () => {
    const { lobby, party } = await partyLobby(["Ann"]);
    await queue(lobby);
    expect(party.map((who) => who.connection.getSnapshot().ascentRound)).toEqual([null, null]);

    const ascent = await partyLobby(["Ann"], "heroes-ascent");
    await queue(ascent.lobby, 3);
    ascent.lobby.host.connection.leaveQueue();
    await settle();
    expect(ascent.party.map(phaseOf)).toEqual(["waiting", "waiting"]);
    expect(ascent.party.map((who) => who.connection.getSnapshot().ascentRound)).toEqual([
      null,
      null,
    ]);
  });

  it("finds no match in Heroes' Ascent without a round, nor with one in Team Arena", async () => {
    const ascent = await partyLobby(["Ann"], "heroes-ascent");
    ascent.lobby.host.connection.findMatch(null);
    await settle();
    expect(ascent.party.map(phaseOf)).toEqual(["waiting", "waiting"]);

    const arena = await partyLobby(["Ann"]);
    arena.lobby.host.connection.findMatch(0);
    await settle();
    expect(arena.party.map(phaseOf)).toEqual(["waiting", "waiting"]);
  });

  it("never plays the house team: it waits for a side at its round", async () => {
    const { lobby, party } = await partyLobby(["Ann"], "heroes-ascent");
    await queue(lobby, 0);
    lobby.host.connection.playHouseTeam();
    await settle();

    expect(party.map(phaseOf)).toEqual(["queued", "queued"]);
    expect(lobby.matches).toHaveLength(0);
  });
});

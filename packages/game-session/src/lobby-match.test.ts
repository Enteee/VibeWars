import {
  ANNIHILATION_MATCH_RULES,
  defaultBuildEquipment,
  type MatchRules,
  type PlayerBuild,
} from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openLobby,
  play,
  playersOf,
  seat,
  start,
  type Member,
  type TestLobby,
} from "./lobby-harness.test-support.js";
import { MatchRefusedError, connectMatch } from "./match-client.js";
import {
  MATCH_FULL_MESSAGE,
  OBSERVER_DELAY_SECONDS,
  RECONNECT_WINDOW_SECONDS,
} from "./match-host.js";
import { connectObserver } from "./match-observer.js";
import { scopeTransport } from "./scoped-transport.js";
import { hello, playerIn, self, settle, toJson, until } from "./match-harness.test-support.js";

/**
 * A lobby's own match (#379), ported from the server's
 * `apps/server/src/lobby-match.test.ts`: who is seated, as what, and who
 * is turned away. The server reserved seats in a room; a P2P lobby hands
 * its `MatchHost` a plan by peer id, and anyone else's `hello` is refused.
 */

/** A lobby whose members, after the host, are named `names` and sit on `teams` (host first). */
async function lobbyOf(
  teams: readonly (0 | 1 | null)[],
  matchRules: MatchRules | ((n: number) => MatchRules) = ANNIHILATION_MATCH_RULES,
): Promise<{ lobby: TestLobby; members: Member[] }> {
  const lobby = await openLobby({ matchRules });
  const members = [lobby.host];
  for (let i = 1; i < teams.length; i += 1) {
    members.push(await lobby.join(`Guest ${String(i)}`));
  }
  await seat(members, teams);
  return { lobby, members };
}

/** `members[i]`, which the test made sure is there. */
function at(members: readonly Member[], i: number): Member {
  const found = members[i];
  if (found === undefined) {
    throw new Error(`no member ${String(i)}`);
  }
  return found;
}

/** Say hello to the lobby's match from `who`, whether or not it was seated. */
function intrude(who: Member, name = "Stranger") {
  return connectMatch({
    transport: who.transport,
    hostId: "host",
    hello: hello({ name }),
    timeoutMs: 1000,
  });
}

describe("a lobby's own match", () => {
  it("names each member in the match as the lobby named them, whatever they say hello as (#53)", async () => {
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    const [mine, theirs] = [
      await play(lobby.host, "Impostor"),
      await play(at(members, 1), "Impostor"),
    ];
    await lobby.step(0.05);
    expect(self(mine)?.name).toBe("Host");
    expect(playerIn(mine.getSnapshot(), theirs.selfSessionId)?.name).toBe("Guest 1");
  });

  it("plays each member with the build they bring to the lobby's match", async () => {
    const pyro: PlayerBuild = {
      name: "Lobby Pyro",
      primaryProfession: "elementalist",
      secondaryProfession: undefined,
      attributes: [{ attributeId: "elementalist.fire-magic", rank: 12 }],
      skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("elementalist"),
    };
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    const guest = at(members, 1);
    const starting = guest.starts.at(-1);
    if (starting === undefined) {
      throw new Error("the guest was handed no match");
    }
    const match = await connectMatch({
      transport: starting.transport,
      hostId: "host",
      hello: hello({ build: toJson(pyro) }),
      timeoutMs: 1000,
    });
    await lobby.step(0.05);
    // A starter build fills all eight slots: only this build has the gaps (#852).
    expect(match.skillBar.map((slot) => slot?.id ?? null)).toEqual(pyro.skillBar);
    expect(self(match)?.weaponId).toBe(
      defaultBuildEquipment("elementalist").weaponSets[0].mainHand.weaponId,
    );
  });

  it("seats each member on the team the lobby gave them, not one the host picks", async () => {
    // Both on team 1: alternating teams, the hello-only rule, would split them.
    const { lobby, members } = await lobbyOf([1, 1, 0]);
    await start(lobby);
    const matches = [];
    for (const who of members) {
      matches.push(await play(who));
    }
    await lobby.step(0.05);
    expect(matches.map((match) => self(match)?.team)).toEqual([1, 1, 0]);
  });

  it("spawns teammates on their own team's points in turn, not all on one", async () => {
    const { lobby, members } = await lobbyOf([0, 1, 0, 1]);
    await start(lobby);
    const matches = [];
    for (const who of members) {
      matches.push(await play(who));
    }
    await lobby.step(0.05);
    // The test arena has two points a side, 100 apart.
    const team0 = matches.filter((match) => self(match)?.team === 0).map((match) => self(match)?.y);
    expect(team0).toEqual([500, 600]);
  });

  it("sends a spectator no match start, and leaves them in the lobby", async () => {
    const { lobby, members } = await lobbyOf([0, null]);
    await start(lobby);
    const spectator = at(members, 1);
    expect(spectator.connection.getSnapshot().phase).toBe("in-match");
    expect(spectator.starts).toEqual([]);
    expect(lobby.host.starts).toHaveLength(1);
  });

  it("lets a spectator watch, late, and keeps the match's room until it has seen the end (#480)", async () => {
    const { lobby, members } = await lobbyOf([0, 1, null], {
      ...ANNIHILATION_MATCH_RULES,
      timeLimitSeconds: 1,
    });
    await start(lobby);
    const players = [await play(lobby.host), await play(at(members, 1))];
    const spectator = at(members, 2);
    const { hostId } = spectator.connection.getSnapshot();
    const matchId = lobby.matches[0]?.plan.matchId ?? "";
    const watching = connectObserver({
      transport: scopeTransport(spectator.transport),
      hostId,
      matchId,
      timeoutMs: 1000,
    });
    await settle();
    const viewer = await watching;
    // A player on a team is no spectator.
    await expect(
      connectObserver({
        transport: scopeTransport(at(members, 1).transport),
        hostId,
        matchId,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ reason: "not-a-spectator" });

    await lobby.step(1);
    expect(players.map((match) => match.getSnapshot().phase)).toEqual(["finished", "finished"]);
    expect(spectator.connection.getSnapshot().phase).toBe("waiting");
    expect(viewer.getSnapshot()).toBeUndefined();
    await lobby.step(OBSERVER_DELAY_SECONDS);
    expect(viewer.getSnapshot()?.phase).toBe("finished");
    expect(lobby.matches[0]?.host.draining).toBe(false);
  });

  it("hands a member the match on now to watch, and none while the lobby waits (#480)", async () => {
    const { lobby, members } = await lobbyOf([0, null]);
    const spectator = at(members, 1);
    expect(spectator.connection.watchMatch()).toBeUndefined();
    await start(lobby);
    await play(lobby.host);
    const watch = spectator.connection.watchMatch();
    expect(watch?.matchId).toBe(lobby.matches[0]?.plan.matchId);
    if (watch === undefined) {
      return;
    }
    const watching = connectObserver({
      transport: watch.transport,
      hostId: spectator.connection.getSnapshot().hostId,
      matchId: watch.matchId,
      timeoutMs: 1000,
    });
    await settle();
    const viewer = await watching;
    await lobby.step(OBSERVER_DELAY_SECONDS + 1);
    expect(viewer.getSnapshot()?.players.length).toBeGreaterThan(0);
  });

  it("lets the next match start while the last still drains to its spectator (#480)", async () => {
    // Only the first match is short: the second is still on when the first has drained.
    const { lobby, members } = await lobbyOf([0, 1, null, null, null], (n) =>
      n === 0 ? { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 1 } : ANNIHILATION_MATCH_RULES,
    );
    await start(lobby);
    await play(lobby.host);
    await play(at(members, 1));
    const matchId = (n: number): string => lobby.matches[n]?.plan.matchId ?? "";
    const watch = (who: Member, n: number) =>
      connectObserver({
        transport: scopeTransport(who.transport),
        hostId: who.connection.getSnapshot().hostId,
        matchId: matchId(n),
        timeoutMs: 1000,
      });
    // One stays a viewer of the first match, one goes on to watch the
    // second, and one to play in it.
    const [stays, watcher, player] = [at(members, 2), at(members, 3), at(members, 4)];
    const first = await watch(stays, 0);
    await watch(watcher, 0);
    await watch(player, 0);
    await lobby.step(1);
    expect(lobby.matches[0]?.host.draining).toBe(true);

    // Readied again and started at once: the first match has not drained.
    await seat(members, [0, 1, null, null, 0]);
    await start(lobby);
    expect(lobby.matches).toHaveLength(2);
    const second = [await play(lobby.host), await play(at(members, 1)), await play(player)];
    expect(second.map((match) => match.getSnapshot().phase)).toEqual([
      "active",
      "active",
      "active",
    ]);
    const watched = await watch(watcher, 1);
    // A viewer late for the first match is not answered by it, only by the one played now.
    await expect(watch(watcher, 0)).rejects.toMatchObject({ reason: "wrong-match" });

    await lobby.step(OBSERVER_DELAY_SECONDS);
    expect(first.getSnapshot()?.phase).toBe("finished");
    expect(lobby.matches[0]?.host.draining).toBe(false);
    // Neither who moved on was sent the first match's end in the second.
    expect(second.map((match) => match.getSnapshot().phase)).toEqual([
      "active",
      "active",
      "active",
    ]);
    expect(watched.getSnapshot()?.phase).not.toBe("finished");
  });

  it("is full before anyone arrives, so a stranger cannot take or hold a seat", async () => {
    const { lobby, members } = await lobbyOf([0, 1, null]);
    await start(lobby);
    // The spectator is in the room and knows the host: all a stranger needs.
    const spectator = at(members, 2);
    for (let i = 0; i < 3; i += 1) {
      await expect(intrude(spectator)).rejects.toEqual(
        new MatchRefusedError({ reason: "match-full", message: MATCH_FULL_MESSAGE }),
      );
    }
    const matches = [await play(lobby.host), await play(at(members, 1))];
    expect(matches).toHaveLength(2);
  });

  it("does not hand a seat its player gave up to a stranger", async () => {
    const { lobby, members } = await lobbyOf([0, 1, null]);
    await start(lobby);
    await play(lobby.host);
    const goes = await play(at(members, 1));
    await goes.disconnect();
    await settle();
    await expect(intrude(at(members, 2))).rejects.toBeInstanceOf(MatchRefusedError);
  });

  it("refuses a stranger into a seat whose player never came", async () => {
    // The server needed a join deadline for a seat never taken; a plan
    // names its peers, so the seat is never anyone else's to take.
    const { lobby, members } = await lobbyOf([0, 1, null]);
    await start(lobby);
    const seated = await play(lobby.host);
    await lobby.step(1);
    await expect(intrude(at(members, 2))).rejects.toBeInstanceOf(MatchRefusedError);
    expect(seated.getSnapshot().players).toHaveLength(1);
  });

  it("lets a seated member come late, after others have played a while", async () => {
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    await play(lobby.host);
    await lobby.step(1);
    const late = await play(at(members, 1));
    await lobby.step(0.05);
    expect(self(late)?.team).toBe(1);
  });

  it("ends a match whose seated players all left the room before it was over", async () => {
    // The server disposed a room everyone left, which told its lobby.
    const { lobby, members } = await lobbyOf([null, 0, 1]);
    await start(lobby);
    await play(at(members, 1));
    await at(members, 1).connection.disconnect();
    // Never came to the match at all, and now has gone.
    await at(members, 2).connection.disconnect();
    await lobby.step(0.05);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    // The dropped seat is held for the reconnect window, then freed.
    await lobby.step(30);
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
  });

  it("ignores a match start from an old match, or one handed on twice", async () => {
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    const guest = at(members, 1);
    expect(guest.starts).toHaveLength(1);
    // Forged as the host: the same match again, and one the lobby never ran.
    lobby.room.send(
      "match-start",
      { mapId: "test-arena", matchId: "match-1", teamPlanRejected: false },
      guest.transport.selfId,
    );
    lobby.room.send(
      "match-start",
      { mapId: "test-arena", matchId: "match-9", teamPlanRejected: false },
      guest.transport.selfId,
    );
    await settle();
    expect(guest.starts).toHaveLength(1);
  });

  it("ignores a match start that comes after its match is over", async () => {
    const { lobby, members } = await lobbyOf([0, 1], {
      ...ANNIHILATION_MATCH_RULES,
      timeLimitSeconds: 1,
    });
    await start(lobby);
    await lobby.step(1);
    const guest = at(members, 1);
    expect(guest.connection.getSnapshot().phase).toBe("waiting");
    lobby.room.send(
      "match-start",
      { mapId: "test-arena", matchId: "match-1", teamPlanRejected: false },
      guest.transport.selfId,
    );
    await settle();
    expect(guest.starts).toHaveLength(1);
  });

  it("plays a host and three guests through a match and back, then another (#379)", async () => {
    const { lobby, members } = await lobbyOf([0, 1, 0, 1], {
      ...ANNIHILATION_MATCH_RULES,
      timeLimitSeconds: 2,
    });
    lobby.host.connection.selectMode("hosted-game");
    lobby.host.connection.selectMap("other-arena");
    await seat(members, [0, 1, 0, 1]);
    await start(lobby);
    expect(lobby.matches[0]?.plan.mapId).toBe("other-arena");
    const matches = [];
    for (const who of members) {
      matches.push(await play(who));
    }
    await lobby.step(1);
    expect(matches.map((match) => match.getSnapshot().players.length)).toEqual([4, 4, 4, 4]);
    await lobby.step(1);
    expect(matches.map((match) => match.getSnapshot().phase)).toEqual([
      "finished",
      "finished",
      "finished",
      "finished",
    ]);
    for (const who of members) {
      expect(who.connection.getSnapshot().phase).toBe("waiting");
      expect(playersOf(who).map(({ team, ready }) => [team, ready])).toEqual([
        [0, false],
        [1, false],
        [0, false],
        [1, false],
      ]);
    }
    await seat(members, [0, 1, 0, 1]);
    await start(lobby);
    expect(members.map((who) => who.starts.length)).toEqual([2, 2, 2, 2]);
  });
});

/**
 * The lobby around a match whose host's peer drops (#515): it waits out
 * the match's window before it closes, and a guest whose host comes back
 * is in the lobby again for the match's end.
 */
describe("a lobby, when the host's peer drops during its match", () => {
  const WINDOW_MS = RECONNECT_WINDOW_SECONDS * 1000;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function inMatch() {
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    const guest = at(members, 1);
    const match = await play(guest, "Guest 1");
    const states: string[] = [];
    match.onConnectionChange((state) => states.push(state));
    const closed: string[] = [];
    guest.connection.onClosed((reason) => closed.push(reason));
    lobby.network.partition("host", guest.transport.selfId);
    await settle();
    return { lobby, guest, closed, states };
  }

  it("closes only once the window has run out", async () => {
    const { closed } = await inMatch();

    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(closed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(closed).toEqual(["connection-lost"]);
  });

  it("joins the lobby again when the host is back in time, and stays open", async () => {
    const { lobby, guest, closed, states } = await inMatch();
    // Its seat is held while it is away (#596).
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest 1"]);

    vi.advanceTimersByTime(10_000);
    lobby.network.heal();
    await until(() => states.includes("online"));
    vi.advanceTimersByTime(WINDOW_MS);

    expect(closed).toEqual([]);
    expect(playersOf(lobby.host).map(({ name }) => name)).toEqual(["Host", "Guest 1"]);
    expect(guest.connection.getSnapshot().players.map(({ name }) => name)).toEqual([
      "Host",
      "Guest 1",
    ]);
  });

  it("closes when the host is back only after the window, as a late timer would find it", async () => {
    const { lobby, closed } = await inMatch();

    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    lobby.network.heal();
    // Heard once it has proven the key again (#1681): an HMAC, on the event loop.
    await until(() => closed.length > 0);

    expect(closed).toEqual(["connection-lost"]);
  });
});

describe("a lobby's match played to its end (#403)", () => {
  it("ends when a team is wiped, both players see who won, and the lobby opens again", async () => {
    const { lobby, members } = await lobbyOf([0, 1]);
    await start(lobby);
    const [hunter, prey] = [await play(lobby.host, "Hunter"), await play(at(members, 1), "Prey")];
    await lobby.step(0.05);
    hunter.sendIntent({ kind: "attack", targetId: prey.selfSessionId });

    // The hunter's weapon, whichever starter build it came with, swings
    // until Prey's team is wiped.
    for (let i = 0; i < 1200 && hunter.getSnapshot().phase === "active"; i += 1) {
      await lobby.step(0.1);
    }

    for (const match of [hunter, prey]) {
      const snapshot = match.getSnapshot();
      expect(snapshot.phase).toBe("finished");
      expect(snapshot.endReason).toBe("annihilation");
      expect(snapshot.winningTeam).toBe(0);
    }
    expect(lobby.host.connection.getSnapshot().phase).toBe("waiting");
    expect(at(members, 1).connection.getSnapshot().phase).toBe("waiting");
  });
});

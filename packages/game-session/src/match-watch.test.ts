import { DEFAULT_MATCH_RULES } from "@vibewars/game-core";
import { PROTOCOL_VERSION } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { openLobby, play, seat, start, type Member } from "./lobby-harness.test-support.js";
import { MatchRefusedError } from "./match-client.js";
import { TICK_SECONDS, startMatch } from "./match-harness.test-support.js";
import { WATCH_FULL_MESSAGE } from "./match-host.js";
import { watchMatch, type WatchConnection } from "./match-watch.js";

/**
 * Observer mode (#480): a lobby spectator watches the match from no seat,
 * `observerDelaySeconds` behind it, and nothing it sends is applied.
 */

const DELAY = 1;

/** A lobby with the host on team 0, a guest on team 1 and a spectator, in its match. */
async function watchedLobby(matchRules = DEFAULT_MATCH_RULES) {
  const lobby = await openLobby({ matchRules, observerDelaySeconds: DELAY });
  const guest = await lobby.join("Guest");
  const spectator = await lobby.join("Spectator");
  await seat([lobby.host, guest, spectator], [0, 1, null]);
  await start(lobby);
  const players = [await play(lobby.host), await play(guest)] as const;
  return { lobby, guest, spectator, players };
}

/** `who` watching the lobby's match it is a spectator of. */
function watch(who: Member): Promise<WatchConnection> {
  const starting = who.connection.watchMatch();
  if (starting === undefined) {
    throw new Error("there is no match to watch");
  }
  return watchMatch({
    transport: starting.transport,
    hostId: who.connection.getSnapshot().hostId,
    timeoutMs: 1000,
  });
}

describe("watching a lobby's match (#480)", () => {
  it("shows a spectator the match, both teams, the delay behind the players", async () => {
    const { lobby, spectator, players } = await watchedLobby();
    const observer = await watch(spectator);
    expect(observer.delaySeconds).toBe(DELAY);
    expect(observer.map.id).toBe("test-arena");

    await lobby.step(3);
    const live = players[0].getSnapshot();
    const seen = observer.getSnapshot();
    expect(seen.players.map((player) => player.name).sort()).toEqual(["Guest", "Host"]);
    expect(live.elapsedSeconds - seen.elapsedSeconds).toBeCloseTo(DELAY, 5);
    expect(seen.selfSessionId).toBe("");
  });

  it("sends a spectator who is not watching nothing of the match", async () => {
    const { lobby, spectator } = await watchedLobby();
    let streamed = 0;
    for (const channel of ["snapshot", "combat"] as const) {
      spectator.transport.on(channel, () => (streamed += 1));
    }
    await lobby.step(1);
    expect(streamed).toBe(0);
  });

  it("applies nothing an observer sends: no intent, no call reaches the match", async () => {
    const { lobby, spectator, players } = await watchedLobby();
    const observer = await watch(spectator);
    const refused: unknown[] = [];
    spectator.transport.on("refused", (data) => refused.push(data));
    const target = players[1].selfSessionId;
    for (let i = 0; i < 5; i += 1) {
      spectator.transport.send("intent", { kind: "attack", targetId: target }, "host");
      spectator.transport.send("intent", { kind: "move", x: 1, y: 0 }, "host");
      spectator.transport.send("call", { kind: "target", targetId: target }, "host");
    }
    await lobby.step(2 + DELAY);
    expect(refused).toEqual([]);
    expect(players[1].getSnapshot().players).toHaveLength(2);
    expect(players[1].getCalls().target).toBeNull();
    // Nobody attacked, so the prey is whole, as the observer sees it too.
    const prey = observer.getSnapshot().players.find((player) => player.name === "Guest");
    expect(prey?.health).toBe(prey?.maxHealth);
  });

  it("hands a seated member no match to watch, and ignores a watch from one", async () => {
    const { lobby, guest } = await watchedLobby();
    expect(guest.connection.watchMatch()).toBeUndefined();
    let answered = 0;
    guest.transport.on("watching", () => (answered += 1));
    guest.transport.send("watch", { protocolVersion: PROTOCOL_VERSION }, "host");
    await lobby.step(TICK_SECONDS);
    expect(answered).toBe(0);
  });

  it("shows observers the end the delay late, and only then opens the lobby", async () => {
    const { lobby, spectator, players } = await watchedLobby({
      ...DEFAULT_MATCH_RULES,
      scoreToWin: 1,
    });
    const observer = await watch(spectator);
    const [hunter, prey] = players;
    await lobby.step(TICK_SECONDS);
    hunter.sendIntent({ kind: "attack", targetId: prey.selfSessionId });
    for (let i = 0; i < 1200 && hunter.getSnapshot().phase === "active"; i += 1) {
      await lobby.step(0.1);
    }
    expect(hunter.getSnapshot().phase).toBe("finished");
    expect(observer.getSnapshot().phase).toBe("active");
    expect(spectator.connection.getSnapshot().phase).toBe("in-match");

    await lobby.step(DELAY);
    const seen = observer.getSnapshot();
    expect(seen.phase).toBe("finished");
    expect(seen.winningTeam).toBe(0);
    expect(spectator.connection.getSnapshot().phase).toBe("waiting");
  });
});

describe("a match host's observers (#480)", () => {
  it("lets as many watch as there are seats left, and refuses the next", async () => {
    const match = startMatch({ maxPlayers: 2 });
    await match.join();
    const first = await watchMatch({
      transport: match.network.join(),
      hostId: "host",
      timeoutMs: 1000,
    });
    expect(first.delaySeconds).toBe(0);
    const second = watchMatch({ transport: match.network.join(), hostId: "host", timeoutMs: 1000 });
    await expect(second).rejects.toThrow(
      new MatchRefusedError({ reason: "match-full", message: WATCH_FULL_MESSAGE }),
    );
  });

  it("frees an observer's place when it leaves", async () => {
    const match = startMatch({ maxPlayers: 2 });
    await match.join();
    const first = await watchMatch({
      transport: match.network.join(),
      hostId: "host",
      timeoutMs: 1000,
    });
    await first.disconnect();
    await match.step(TICK_SECONDS);
    const second = await watchMatch({
      transport: match.network.join(),
      hostId: "host",
      timeoutMs: 1000,
    });
    await match.step(0.5);
    expect(second.getSnapshot().players).toHaveLength(1);
  });
});

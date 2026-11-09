import { pickStarterBuild } from "@vibewars/game-core";
import {
  LobbyNoAnswerError,
  LobbyRefusedError,
  MatchRefusedError,
  createMemoryBoard,
  createQueueClient,
  type QueueBoardEvent,
} from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  followHost,
  joinFailureNotice,
  leaveOnPageHide,
  lobbyClosedNotice,
  matchEndedNotice,
  lobbyRandom,
  lobbyRefusalNotice,
  loopbackHint,
  matchFailureNotice,
  secureRandom,
  watchHostMove,
  type FollowSteps,
} from "./session.js";
import { t } from "../i18n/index.js";

describe("the notice for a match that would not start (#1268)", () => {
  it("says a new version is out when the match chunk is gone, not that the connection was lost", () => {
    const gone = new TypeError(
      "error loading dynamically imported module: https://enteee.github.io/VibeWars/next/assets/arena-scene-BD7V1erG.js",
    );
    expect(matchFailureNotice(gone)).toBe(t("buildBanner.newVersion"));
  });

  it("leaves any other failure to the caller", () => {
    expect(matchFailureNotice(new Error("peer went away"))).toBeUndefined();
  });

  it("words the host's refusal from its reason alone (#2651)", () => {
    const notice = (reason: MatchRefusedError["reason"]): string | undefined =>
      matchFailureNotice(new MatchRefusedError({ reason }));
    expect(notice("match-full")).toBe(t("session.matchFull"));
    expect(notice("match-over")).toBe(t("session.matchOver"));
    expect(notice("protocol-mismatch")).toBe(t("session.protocolMismatch"));
    expect(notice("not-a-spectator")).toBe(t("session.notASpectator"));
    expect(notice("wrong-match")).toBe(t("session.wrongMatch"));
  });
});

describe("the notice for a match that ended under the player (#2905)", () => {
  it("says the host left when the host said so", () => {
    expect(matchEndedNotice("host-left")).toBe(t("queue.hostLeft"));
  });

  it("says the connection was lost when the host went without a word", () => {
    expect(matchEndedNotice("lost")).toBe(t("app.lostMatch"));
  });

  it("says nothing while the host may still be there", () => {
    expect(matchEndedNotice("online")).toBeUndefined();
    expect(matchEndedNotice("reconnecting")).toBeUndefined();
  });
});

describe("the notice for a closed lobby (#515)", () => {
  it("says the host closed it when the host said so", () => {
    expect(lobbyClosedNotice("host-left")).toBe(t("session.hostClosed"));
  });

  it("says the host removed this player (#2746)", () => {
    expect(lobbyClosedNotice("removed")).toBe(t("session.removed"));
    expect(t("session.removed")).toBe("The host removed you from the lobby.");
  });

  it("blames no one when the host's peer was gone for the whole window", () => {
    expect(lobbyClosedNotice("connection-lost")).toBe(t("session.connectionLost"));
    expect(t("session.connectionLost")).not.toBe(t("session.hostClosed"));
  });
});

describe("the notice for a refused ask (#1194)", () => {
  it("says the lobby is full, who may ask, or that the host turned it down", () => {
    expect(lobbyRefusalNotice("lobby-full")).toBe(t("session.lobbyFull"));
    expect(lobbyRefusalNotice("party-full")).toBe(t("session.partyFull"));
    expect(lobbyRefusalNotice("not-host")).toBe(t("session.notHost"));
    expect(lobbyRefusalNotice("closed")).toBe(t("session.refused"));
  });
});

describe("the notice for a Team Lobby refusal (#1460)", () => {
  it("says what was refused: a proposal, a vote, a seat taken, or no such seat", () => {
    expect(lobbyRefusalNotice("invalid-proposal")).toBe(t("session.proposalRefused"));
    expect(lobbyRefusalNotice("invalid-vote")).toBe(t("session.voteRefused"));
    expect(lobbyRefusalNotice("slot-taken")).toBe(t("session.seatTaken"));
    expect(lobbyRefusalNotice("invalid-slot")).toBe(t("session.seatRefused"));
  });
});

describe("the notice for a join nobody answered (#707)", () => {
  it("names how far it got: no relay, a host it could not reach, or no answer at all", () => {
    const notice = (trouble: "no-relay" | "peer-unreachable" | null): string =>
      joinFailureNotice(
        new LobbyNoAnswerError(20_000, trouble),
        { hostname: "127.0.0.1", port: "5173" },
        true,
      );
    expect(notice("no-relay")).toBe(t("session.noRelay"));
    expect(notice("peer-unreachable")).toBe(t("session.peerUnreachable"));
    expect(notice(null)).toBe(t("session.noAnswer"));
    expect(
      new Set([t("session.noRelay"), t("session.peerUnreachable"), t("session.noAnswer")]).size,
    ).toBe(3);
  });

  it("says a TURN relay link can fix an unreachable host, only when none is saved (#972)", () => {
    const notice = (trouble: "no-relay" | "peer-unreachable" | null, relayed: boolean): string =>
      joinFailureNotice(
        new LobbyNoAnswerError(20_000, trouble),
        { hostname: "enteee.github.io", port: "" },
        relayed,
      );
    expect(notice("peer-unreachable", false)).toBe(
      `${t("session.peerUnreachable")}\n${t("session.turnRelayHint")}`,
    );
    // With a relay saved, it must not claim one would help, nor that it was used.
    expect(notice("peer-unreachable", true)).toBe(t("session.peerUnreachable"));
    expect(notice("no-relay", false)).toBe(t("session.noRelay"));
    expect(notice(null, false)).toBe(t("session.noAnswer"));
  });

  it("on localhost or [::1], says to open 127.0.0.1 for an unreachable host, and only then", () => {
    const at = (hostname: string, trouble: "no-relay" | "peer-unreachable" | null): string =>
      joinFailureNotice(new LobbyNoAnswerError(20_000, trouble), { hostname, port: "5173" }, true);
    const hinted = `${t("session.peerUnreachable")}\nFirefox can't connect over IPv6 loopback (::1). Open http://127.0.0.1:5173 instead.`;
    expect(at("localhost", "peer-unreachable")).toBe(hinted);
    expect(at("[::1]", "peer-unreachable")).toBe(hinted);
    expect(at("localhost", "no-relay")).toBe(t("session.noRelay"));
    expect(at("localhost", null)).toBe(t("session.noAnswer"));
    expect(at("enteee.github.io", "peer-unreachable")).toBe(t("session.peerUnreachable"));
    expect(loopbackHint("")).toBe(
      "Firefox can't connect over IPv6 loopback (::1). Open http://127.0.0.1 instead.",
    );
  });
});

describe("following the host to its next lobby (#1553)", () => {
  const where = { hostname: "example.org", port: "" };
  const move = { code: "ABCD-EFGH", host: "Mira" };

  /** The steps `followHost` takes, recording which ran. */
  const steps = (
    join: (code: string) => Promise<string>,
    movedOn = (): boolean => false,
  ): { calls: string[]; follow: FollowSteps<string> } => {
    const calls: string[] = [];
    return {
      calls,
      follow: {
        join: (code) => {
          calls.push(`join ${code}`);
          return join(code);
        },
        movedOn,
        seat: (joined) => {
          calls.push(`seat ${joined}`);
        },
        drop: (joined) => {
          calls.push(`drop ${joined}`);
          return Promise.resolve();
        },
        fallBack: (notice) => {
          calls.push(`fall back: ${notice ?? "quietly"}`);
        },
      },
    };
  };

  it("joins the key the host moved to and sits in it", async () => {
    const { calls, follow } = steps((code) => Promise.resolve(`lobby ${code}`));
    await followHost(move, follow, where, false);
    expect(calls).toEqual(["join ABCD-EFGH", "seat lobby ABCD-EFGH"]);
  });

  it("falls back to a fresh own lobby, naming the host, when the join fails", async () => {
    const { calls, follow } = steps(() => Promise.reject(new LobbyNoAnswerError(20_000, null)));
    await followHost(move, follow, where, false);
    expect(calls).toEqual([
      "join ABCD-EFGH",
      `fall back: Could not follow Mira: ${t("session.noAnswer")}`,
    ]);
  });

  it("falls back the same way when that lobby is closed", async () => {
    const { calls, follow } = steps(() => Promise.reject(new LobbyRefusedError("closed")));
    await followHost(move, follow, where, false);
    expect(calls).toEqual([
      "join ABCD-EFGH",
      `fall back: Could not follow Mira: ${t("session.lobbyClosed")}`,
    ]);
  });

  it("falls back quietly once the tab moved on, and leaves a join that came in too late", async () => {
    const failed = steps(
      () => Promise.reject(new LobbyRefusedError("closed")),
      () => true,
    );
    await followHost(move, failed.follow, where, false);
    expect(failed.calls).toEqual(["join ABCD-EFGH", "fall back: quietly"]);
    const late = steps(
      (code) => Promise.resolve(`lobby ${code}`),
      () => true,
    );
    await followHost(move, late.follow, where, false);
    expect(late.calls).toEqual(["join ABCD-EFGH", "drop lobby ABCD-EFGH"]);
  });

  it("knows where the host went once its lobby closes, so that close is no host-left", () => {
    let onMove: ((code: string) => void) | undefined;
    const lobby = {
      onMove: (handler: (code: string) => void): void => {
        onMove = handler;
      },
      getSnapshot: () => ({
        players: [
          { name: "Aren", isHost: false },
          { name: "Mira", isHost: true },
        ],
      }),
    };
    const hostMove = watchHostMove(lobby);
    expect(hostMove()).toBeUndefined();
    onMove?.("ABCD-EFGH");
    expect(hostMove()).toEqual(move);
    // Taken once: a later close of the same lobby is an ordinary one.
    expect(hostMove()).toBeUndefined();
  });
});

describe("closing the tab while queued (#1881)", () => {
  it("withdraws the ticket once on pagehide, and nothing after leaving", async () => {
    const memory = createMemoryBoard();
    const heard: QueueBoardEvent[] = [];
    memory.board().subscribe("random-arena-4v4", (event) => heard.push(event));
    const ticketId = "a".repeat(64);
    const client = createQueueClient({
      board: memory.board(),
      ascentRound: null,
      teamCount: 2,
      mode: "random-arena-4v4",
      now: () => 1_700_000_000_000,
      newTicketKey: () => ({ ticketId, sign: () => "b".repeat(128) }),
      mapPool: ["arena-a"],
      hardNat: false,
    });
    await client.tick();
    const page = new EventTarget();
    let leaves = 0;
    // As `enterQueue`'s `finish`: leaving, by the tab or by Leave queue, stops listening.
    const stop = leaveOnPageHide(page, () => {
      leaves += 1;
      stop();
      client.leave();
    });
    const withdrawals = (): number => heard.filter((event) => event.kind === "withdrawn").length;

    page.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();
    expect([leaves, withdrawals()]).toEqual([1, 1]);

    page.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();
    expect([leaves, withdrawals()]).toEqual([1, 1]);
  });
});

describe("a Team Lobby's RNG (#2213)", () => {
  it("is crypto's in every build that sets no seed", () => {
    expect(lobbyRandom(undefined)).toBe(secureRandom);
  });

  it("with the e2e build's seed, gives every lobby the same solo foe: a healer Monk", () => {
    const foes = [lobbyRandom("4404"), lobbyRandom("4404")].map((random) =>
      pickStarterBuild(random),
    );
    expect(foes.map((foe) => foe.name)).toEqual(["Word of Healing (Mo)", "Word of Healing (Mo)"]);
  });

  it("refuses a seed that is not a decimal integer, rather than falling back to crypto", () => {
    for (const seed of ["", "1.5", "-3", "eleven"]) {
      expect(() => lobbyRandom(seed)).toThrow(/decimal integer/);
    }
  });
});

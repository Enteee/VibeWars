import { LobbyNoAnswerError } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  CONNECTION_LOST_MESSAGE,
  HOST_CLOSED_MESSAGE,
  NO_ANSWER_MESSAGE,
  NO_RELAY_MESSAGE,
  PEER_UNREACHABLE_MESSAGE,
  TURN_RELAY_HINT,
  joinFailureNotice,
  lobbyClosedNotice,
  loopbackHint,
} from "./session.js";

describe("the notice for a closed lobby (#515)", () => {
  it("says the host closed it when the host said so", () => {
    expect(lobbyClosedNotice("host-left")).toBe(HOST_CLOSED_MESSAGE);
  });

  it("blames no one when the host's peer was gone for the whole window", () => {
    expect(lobbyClosedNotice("connection-lost")).toBe(CONNECTION_LOST_MESSAGE);
    expect(CONNECTION_LOST_MESSAGE).not.toBe(HOST_CLOSED_MESSAGE);
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
    expect(notice("no-relay")).toBe(NO_RELAY_MESSAGE);
    expect(notice("peer-unreachable")).toBe(PEER_UNREACHABLE_MESSAGE);
    expect(notice(null)).toBe(NO_ANSWER_MESSAGE);
    expect(new Set([NO_RELAY_MESSAGE, PEER_UNREACHABLE_MESSAGE, NO_ANSWER_MESSAGE]).size).toBe(3);
  });

  it("says a TURN relay link can fix an unreachable host, only when none is saved (#972)", () => {
    const notice = (trouble: "no-relay" | "peer-unreachable" | null, relayed: boolean): string =>
      joinFailureNotice(
        new LobbyNoAnswerError(20_000, trouble),
        { hostname: "enteee.github.io", port: "" },
        relayed,
      );
    expect(notice("peer-unreachable", false)).toBe(
      `${PEER_UNREACHABLE_MESSAGE}\n${TURN_RELAY_HINT}`,
    );
    // With a relay saved, it must not claim one would help, nor that it was used.
    expect(notice("peer-unreachable", true)).toBe(PEER_UNREACHABLE_MESSAGE);
    expect(notice("no-relay", false)).toBe(NO_RELAY_MESSAGE);
    expect(notice(null, false)).toBe(NO_ANSWER_MESSAGE);
  });

  it("on localhost or [::1], says to open 127.0.0.1 for an unreachable host, and only then", () => {
    const at = (hostname: string, trouble: "no-relay" | "peer-unreachable" | null): string =>
      joinFailureNotice(new LobbyNoAnswerError(20_000, trouble), { hostname, port: "5173" }, true);
    const hinted = `${PEER_UNREACHABLE_MESSAGE}\nFirefox can't connect over IPv6 loopback (::1). Open http://127.0.0.1:5173 instead.`;
    expect(at("localhost", "peer-unreachable")).toBe(hinted);
    expect(at("[::1]", "peer-unreachable")).toBe(hinted);
    expect(at("localhost", "no-relay")).toBe(NO_RELAY_MESSAGE);
    expect(at("localhost", null)).toBe(NO_ANSWER_MESSAGE);
    expect(at("enteee.github.io", "peer-unreachable")).toBe(PEER_UNREACHABLE_MESSAGE);
    expect(loopbackHint("")).toBe(
      "Firefox can't connect over IPv6 loopback (::1). Open http://127.0.0.1 instead.",
    );
  });
});

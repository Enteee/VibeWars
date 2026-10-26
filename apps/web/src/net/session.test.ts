import { LobbyNoAnswerError } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import {
  CONNECTION_LOST_MESSAGE,
  HOST_CLOSED_MESSAGE,
  NO_ANSWER_MESSAGE,
  NO_RELAY_MESSAGE,
  PEER_UNREACHABLE_MESSAGE,
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
      joinFailureNotice(new LobbyNoAnswerError(20_000, trouble), {
        hostname: "127.0.0.1",
        port: "5173",
      });
    expect(notice("no-relay")).toBe(NO_RELAY_MESSAGE);
    expect(notice("peer-unreachable")).toBe(PEER_UNREACHABLE_MESSAGE);
    expect(notice(null)).toBe(NO_ANSWER_MESSAGE);
    expect(new Set([NO_RELAY_MESSAGE, PEER_UNREACHABLE_MESSAGE, NO_ANSWER_MESSAGE]).size).toBe(3);
  });

  it("on localhost or [::1], says to open 127.0.0.1 for an unreachable host, and only then", () => {
    const at = (hostname: string, trouble: "no-relay" | "peer-unreachable" | null): string =>
      joinFailureNotice(new LobbyNoAnswerError(20_000, trouble), { hostname, port: "5173" });
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

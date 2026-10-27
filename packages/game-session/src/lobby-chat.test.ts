import { MAX_CHAT_GRAPHEMES } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import type { ChatLine } from "./lobby-connection.js";
import { openLobby, seat, start, type Member } from "./lobby-harness.test-support.js";
import { CHAT_BURST } from "./lobby-host.js";
import { settle } from "./match-harness.test-support.js";

/**
 * Chat (#479): the lobby host routes every line, in the lobby and through
 * its match. All chat reaches every member, team chat the sender's team
 * alone, and a spectator has no team to talk to.
 */

/** Every line `who` is shown, and how often it was told it is throttled. */
function listen(who: Member): { lines: ChatLine[]; throttled: () => number } {
  const lines: ChatLine[] = [];
  let throttled = 0;
  who.connection.onChat((line) => lines.push(line));
  who.connection.onChatThrottled(() => {
    throttled += 1;
  });
  return { lines, throttled: () => throttled };
}

const texts = (lines: readonly ChatLine[]): string[] => lines.map((line) => line.text);

/** A lobby of host and Ann on team 0, Bob on team 1, and Sam spectating. */
async function fourInALobby() {
  const lobby = await openLobby();
  const ann = await lobby.join("Ann");
  const bob = await lobby.join("Bob");
  const sam = await lobby.join("Sam");
  await seat([lobby.host, ann, bob, sam], [0, 0, 1, null]);
  return {
    lobby,
    host: listen(lobby.host),
    ann: Object.assign(listen(ann), { member: ann }),
    bob: Object.assign(listen(bob), { member: bob }),
    sam: Object.assign(listen(sam), { member: sam }),
  };
}

describe("lobby chat (#479)", () => {
  it("reaches every member on all chat, spectators and the host included", async () => {
    const { host, ann, bob, sam } = await fourInALobby();
    bob.member.connection.sendChat("all", "gg");
    await settle();
    for (const who of [host, ann, bob, sam]) {
      expect(who.lines).toEqual([
        { channel: "all", fromId: bob.member.transport.selfId, name: "Bob", team: 1, text: "gg" },
      ]);
    }
  });

  it("reaches the sender's team alone on team chat", async () => {
    const { host, ann, bob, sam } = await fourInALobby();
    ann.member.connection.sendChat("team", "spike the monk");
    await settle();
    expect(texts(host.lines)).toEqual(["spike the monk"]);
    expect(texts(ann.lines)).toEqual(["spike the monk"]);
    expect(bob.lines).toEqual([]);
    expect(sam.lines).toEqual([]);
  });

  it("refuses team chat from a spectator, who has no team", async () => {
    const { host, ann, bob, sam } = await fourInALobby();
    sam.member.connection.sendChat("team", "psst");
    await settle();
    for (const who of [host, ann, bob, sam]) {
      expect(who.lines).toEqual([]);
    }
  });

  it("never lets team chat cross to the other team during the match", async () => {
    const { lobby, host, ann, bob, sam } = await fourInALobby();
    await start(lobby);
    expect(lobby.host.connection.getSnapshot().phase).toBe("in-match");
    bob.member.connection.sendChat("team", "they have no monk");
    ann.member.connection.sendChat("all", "glhf");
    await settle();
    expect(texts(bob.lines)).toEqual(["they have no monk", "glhf"]);
    expect(texts(host.lines)).toEqual(["glhf"]);
    expect(texts(ann.lines)).toEqual(["glhf"]);
    expect(texts(sam.lines)).toEqual(["glhf"]);
  });

  it("cleans a line as names are, cuts it to MAX_CHAT_GRAPHEMES, and drops an empty one", async () => {
    const { host, ann } = await fourInALobby();
    ann.member.connection.sendChat("all", "  hi\u202e   there all\u200b ");
    ann.member.connection.sendChat("all", "\u200b\u202e \u2066");
    ann.member.connection.sendChat("all", "👍".repeat(MAX_CHAT_GRAPHEMES * 20));
    await settle();
    const [clean, long, ...rest] = texts(host.lines);
    expect(clean).toBe("hi there all");
    expect(Array.from(long ?? "")).toHaveLength(MAX_CHAT_GRAPHEMES);
    expect(rest).toEqual([]);
  });

  it("keeps the name a line was sent under", async () => {
    const { host, ann } = await fourInALobby();
    ann.member.connection.sendChat("all", "first");
    await settle();
    ann.member.connection.chooseTeam(1);
    await settle();
    ann.member.connection.sendChat("all", "second");
    await settle();
    expect(host.lines.map(({ name, team }) => ({ name, team }))).toEqual([
      { name: "Ann", team: 0 },
      { name: "Ann", team: 1 },
    ]);
  });

  it("drops a line from a peer who never joined", async () => {
    const { lobby, host } = await fourInALobby();
    const stranger = lobby.network.join();
    await settle();
    stranger.send("chat", { channel: "all", text: "buy gold" }, lobby.room.selfId);
    await settle();
    expect(host.lines).toEqual([]);
  });

  it("takes only a line its own host sent", async () => {
    const { lobby, ann } = await fourInALobby();
    const forger = lobby.network.join();
    await settle();
    forger.send("chat-line", {
      channel: "all",
      fromId: lobby.room.selfId,
      name: "Host",
      team: 0,
      text: "everyone leave",
    });
    await settle();
    expect(ann.lines).toEqual([]);
  });

  it("drops lines past the budget, says so once a burst, and lets one through once it refills", async () => {
    const { lobby, host, ann } = await fourInALobby();
    for (let i = 0; i < CHAT_BURST + 3; i += 1) {
      ann.member.connection.sendChat("all", `line ${String(i)}`);
    }
    await settle();
    expect(host.lines).toHaveLength(CHAT_BURST);
    expect(ann.throttled()).toBe(1);

    await lobby.step(1.5);
    ann.member.connection.sendChat("all", "calm now");
    ann.member.connection.sendChat("all", "and again too fast");
    await settle();
    expect(texts(host.lines).at(-1)).toBe("calm now");
    expect(ann.throttled()).toBe(2);
  });
});

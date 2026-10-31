import type { Transport } from "@vibewars/game-session";
import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ATTACH_SETTLE_MS, linkLobbyRoom, needsRoom } from "./lobby-room.js";

describe("whether a lobby's host is in its room (#1682)", () => {
  it("is in it open, or closed with a guest; not closed and empty", () => {
    expect(needsRoom({ open: false, guests: 0 })).toBe(false);
    expect(needsRoom({ open: true, guests: 0 })).toBe(true);
    expect(needsRoom({ open: false, guests: 1 })).toBe(true);
    expect(needsRoom({ open: true, guests: 3 })).toBe(true);
  });
});

describe("a lobby host's link to its room (#1682)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A link on a memory network, counting its joins and the rooms it holds. */
  function linked() {
    const network = createMemoryNetwork();
    const rooms: Transport[] = [];
    let inRoom = 0;
    const link = linkLobbyRoom({
      selfId: "host",
      join: () => {
        const room = network.join("host");
        rooms.push(room);
        inRoom += 1;
        const leave = room.leave.bind(room);
        return {
          ...room,
          leave: () => {
            inRoom -= 1;
            return leave();
          },
        };
      },
    });
    return { network, link, rooms, inRoom: () => inRoom };
  }

  it("joins no room for a new, closed lobby", () => {
    const { link, rooms } = linked();
    link.follow({ open: false, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS * 10);
    expect(rooms).toHaveLength(0);
  });

  it("joins once opened, after the settle window", () => {
    const { link, rooms } = linked();
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS - 1);
    expect(rooms).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(rooms).toHaveLength(1);
  });

  it("follows the last of fast toggles: open, close, open makes one join", () => {
    const { link, rooms, inRoom } = linked();
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(100);
    link.follow({ open: false, guests: 0 });
    vi.advanceTimersByTime(100);
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS * 4);
    expect(rooms).toHaveLength(1);
    expect(inRoom()).toBe(1);
    link.follow({ open: false, guests: 0 });
    link.follow({ open: true, guests: 0 });
    link.follow({ open: false, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS * 4);
    expect(rooms).toHaveLength(1);
    expect(inRoom()).toBe(0);
  });

  it("stays while closed with a guest, and leaves at once when the last one goes", () => {
    const { link, inRoom } = linked();
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS);
    link.follow({ open: true, guests: 1 });
    link.follow({ open: false, guests: 1 });
    expect(inRoom()).toBe(1);
    link.follow({ open: false, guests: 0 });
    expect(inRoom()).toBe(0);
  });

  it("hears the room while in it, tells every peer gone when it leaves, and hears it again back in", async () => {
    const { network, link } = linked();
    const heard: string[] = [];
    const events: string[] = [];
    link.on("chat", (data, from) => heard.push(`${from}: ${JSON.stringify(data)}`));
    link.onPeerJoin((peerId) => events.push(`join ${peerId}`));
    link.onPeerLeave((peerId) => events.push(`leave ${peerId}`));
    const friend = network.join("friend");
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS);
    await vi.runAllTimersAsync();
    friend.send("chat", { text: "hi" });
    await vi.runAllTimersAsync();
    link.follow({ open: false, guests: 0 });
    friend.send("chat", { text: "anyone?" });
    await vi.runAllTimersAsync();
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS);
    await vi.runAllTimersAsync();
    friend.send("chat", { text: "back" });
    await vi.runAllTimersAsync();
    expect(heard).toEqual(['friend: {"text":"hi"}', 'friend: {"text":"back"}']);
    expect(events).toEqual(["join friend", "leave friend", "join friend"]);
  });

  it("joins nothing more once it has left", async () => {
    const { link, rooms } = linked();
    link.follow({ open: true, guests: 0 });
    await link.leave();
    link.follow({ open: true, guests: 0 });
    vi.advanceTimersByTime(ATTACH_SETTLE_MS * 4);
    expect(rooms).toHaveLength(0);
  });
});

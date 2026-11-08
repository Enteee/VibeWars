import type { WireSharedTrack } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { openLobby, start, type Member } from "./lobby-harness.test-support.js";
import { settle } from "./match-harness.test-support.js";

/**
 * Sharing a music track (#2745): the lobby host relays a member's share
 * to every other human member, the host too, one share a sender in ten
 * seconds, and only a shipped track.
 */

/** Every share `who` heard, and how often it was told to wait. */
function listen(who: Member): { shares: WireSharedTrack[]; throttled: () => number } {
  const shares: WireSharedTrack[] = [];
  let throttled = 0;
  who.connection.onSharedTrack((share) => shares.push(share));
  who.connection.onShareThrottled(() => {
    throttled += 1;
  });
  return { shares, throttled: () => throttled };
}

async function threeInALobby() {
  const lobby = await openLobby();
  const ann = await lobby.join("Ann");
  const bob = await lobby.join("Bob");
  await settle();
  return {
    lobby,
    host: listen(lobby.host),
    ann: Object.assign(listen(ann), { member: ann }),
    bob: Object.assign(listen(bob), { member: bob }),
  };
}

describe("sharing a track (#2745)", () => {
  it("reaches every other member, the host too, as from its sender", async () => {
    const { host, ann, bob } = await threeInALobby();
    ann.member.connection.shareTrack("test-track", "s(`bd sd`)");
    await settle();
    const shared = {
      from: ann.member.transport.selfId,
      trackId: "test-track",
      source: "s(`bd sd`)",
    };
    expect(host.shares).toEqual([shared]);
    expect(bob.shares).toEqual([shared]);
    expect(ann.shares).toEqual([]);
  });

  it("relays the host's own share to its members", async () => {
    const { lobby, host, ann } = await threeInALobby();
    lobby.host.connection.shareTrack("test-track", "s(`hh`)");
    await settle();
    expect(ann.shares.map((share) => share.from)).toEqual([lobby.host.transport.selfId]);
    expect(host.shares).toEqual([]);
  });

  it("refuses a second share inside ten seconds, telling the sender alone", async () => {
    const { lobby, host, ann, bob } = await threeInALobby();
    ann.member.connection.shareTrack("test-track", "first");
    ann.member.connection.shareTrack("test-track", "too soon");
    await settle();
    expect(host.shares.map((share) => share.source)).toEqual(["first"]);
    expect(ann.throttled()).toBe(1);
    expect(bob.throttled()).toBe(0);
    expect(host.throttled()).toBe(0);

    await lobby.step(10.5);
    ann.member.connection.shareTrack("test-track", "later");
    await settle();
    expect(host.shares.map((share) => share.source)).toEqual(["first", "later"]);
  });

  it("drops a track not shipped before it costs the sender their share", async () => {
    const { host, ann } = await threeInALobby();
    ann.member.connection.shareTrack("not-a-track", "s()");
    ann.member.connection.shareTrack("test-track", "s()");
    await settle();
    expect(host.shares.map((share) => share.trackId)).toEqual(["test-track"]);
    expect(ann.throttled()).toBe(0);
  });

  it("relays nothing from a peer who never joined, or one naming its sender", async () => {
    const { lobby, host, ann, bob } = await threeInALobby();
    const stranger = lobby.network.join();
    await settle();
    stranger.send(
      "lobby-cmd",
      { kind: "share-track", trackId: "test-track", source: "s()" },
      lobby.room.selfId,
    );
    ann.member.transport.send(
      "lobby-cmd",
      {
        kind: "share-track",
        trackId: "test-track",
        source: "s()",
        from: bob.member.transport.selfId,
      },
      lobby.room.selfId,
    );
    await settle();
    expect(host.shares).toEqual([]);
    expect(bob.shares).toEqual([]);
  });

  it("goes on through the match", async () => {
    const { lobby, ann, bob } = await threeInALobby();
    await start(lobby);
    ann.member.connection.shareTrack("test-track", "s()");
    await settle();
    expect(bob.shares).toHaveLength(1);
  });

  it("takes only a share its own host sent", async () => {
    const { lobby, ann } = await threeInALobby();
    const forger = lobby.network.join();
    await settle();
    forger.send("shared-track", { from: lobby.room.selfId, trackId: "test-track", source: "s()" });
    await settle();
    expect(ann.shares).toEqual([]);
  });
});

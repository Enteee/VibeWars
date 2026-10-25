import { describe, expect, it } from "vitest";

import { hello, playerIn, self, startMatch } from "./match-harness.test-support.js";

/**
 * Network robustness (brief §25), over P2P (#375).
 *
 * A LAN party runs on consumer wifi and laptops whose lids get closed.
 * Losing a match because of a two-second blip would be the single most
 * annoying failure mode, so a dropped player keeps their seat, their
 * character and their position for a window, and can walk back in.
 *
 * In P2P a drop is a peer leaving the transport, and a returning player
 * is a new peer that proves who it was with its rejoin token.
 */
describe("reconnection over P2P (#375)", () => {
  it("holds a dropped player's slot instead of deleting them immediately", async () => {
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection: dropper, transport } = await match.join();
    await match.step(0.05);
    expect(playerIn(watcher.getSnapshot(), dropper.selfSessionId)).toBeDefined();

    await transport.leave();
    await match.step(0.6);

    // Still present: their seat is being held open for them.
    expect(playerIn(watcher.getSnapshot(), dropper.selfSessionId)).toBeDefined();
  });

  it("lets a dropped player reconnect to the same character and position", async () => {
    const match = startMatch();
    await match.joinLocal();
    const { connection: dropper, transport } = await match.join();
    await match.step(0.05);

    // Move so the restored position is distinguishable from a fresh spawn.
    dropper.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.4);
    dropper.sendIntent({ kind: "stop" });
    await match.step(0.15);
    const beforeX = self(dropper)?.x ?? 0;

    await transport.leave();
    await match.step(0.4);

    const { connection: resumed } = await match.join(
      hello({ rejoin: { playerId: dropper.selfSessionId, token: dropper.rejoinToken } }),
    );
    await match.step(0.05);

    expect(resumed.selfSessionId).toBe(dropper.selfSessionId);
    // Same character, same place: not a fresh spawn.
    expect(self(resumed)?.x).toBeCloseTo(beforeX, 0);
  });

  it("freezes a dropped player rather than leaving them running into a wall", async () => {
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection: dropper, transport } = await match.join();
    await match.step(0.05);

    dropper.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.3);

    await transport.leave();
    await match.step(0.3);

    const settled = playerIn(watcher.getSnapshot(), dropper.selfSessionId)?.x ?? 0;
    await match.step(0.6);
    const later = playerIn(watcher.getSnapshot(), dropper.selfSessionId)?.x ?? 0;

    // A disconnected player must not keep sliding across the arena.
    expect(later).toBeCloseTo(settled, 1);
  });

  it("reconnects the same room in place after an abnormal drop", async () => {
    // apps/web's match client relies on this (#181): after a blip the
    // connection object it already holds, its snapshot, its handlers and
    // `sendIntent`, keeps working. Here the blip is the link between the
    // peer and the host going down and coming back, with the same peer.
    const match = startMatch();
    await match.joinLocal();
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const events: string[] = [];
    connection.onConnectionChange((state) => events.push(state));

    match.network.partition(transport.selfId, "host");
    await match.step(0.1);
    match.network.heal();
    await match.step(0.1);

    const before = connection.getSnapshot().elapsedSeconds;
    const beforeX = self(connection)?.x ?? 0;
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.3);

    expect(events).not.toContain("lost");
    expect(connection.getSnapshot().elapsedSeconds).toBeGreaterThan(before);
    expect(self(connection)?.x ?? 0).toBeGreaterThan(beforeX);
  });

  it("removes a player who leaves deliberately, without holding their slot", async () => {
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection: quitter } = await match.join();
    await match.step(0.05);
    expect(playerIn(watcher.getSnapshot(), quitter.selfSessionId)).toBeDefined();

    // A deliberate leave is consented: no reason to hold the seat.
    await quitter.disconnect();
    await match.step(0.6);

    expect(playerIn(watcher.getSnapshot(), quitter.selfSessionId)).toBeUndefined();
  });

  it("clears a stale target when the targeted player leaves deliberately", async () => {
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection: quitter } = await match.join();
    await match.step(0.05);

    watcher.sendIntent({ kind: "target", targetSessionId: quitter.selfSessionId });
    await match.step(0.2);
    expect(self(watcher)?.targetSessionId).toBe(quitter.selfSessionId);

    await quitter.disconnect();
    await match.step(0.6);

    expect(self(watcher)?.targetSessionId).toBeUndefined();
  });

  it("keeps the match running for everyone else while someone is away", async () => {
    const match = startMatch();
    const stayer = await match.joinLocal();
    const { transport } = await match.join();
    await match.step(0.05);

    await transport.leave();
    await match.step(0.3);

    // The remaining player can still move and the clock still runs.
    const beforeX = self(stayer)?.x ?? 0;
    const beforeClock = stayer.getSnapshot().elapsedSeconds;
    stayer.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.5);

    expect(self(stayer)?.x ?? 0).toBeGreaterThan(beforeX);
    expect(stayer.getSnapshot().elapsedSeconds).toBeGreaterThan(beforeClock);
  });

  it("lets a player back in while the host still holds their old peer", async () => {
    // A wifi blip: the player's page sees its link die and rejoins as a
    // new peer long before the host notices the old one is gone (#43).
    // The player must still get their own seat back.
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection: dropper } = await match.join();
    await match.step(0.05);

    const { connection: resumed } = await match.join(
      hello({ rejoin: { playerId: dropper.selfSessionId, token: dropper.rejoinToken } }),
    );
    await match.step(0.8);

    expect(resumed.selfSessionId).toBe(dropper.selfSessionId);
    expect(playerIn(watcher.getSnapshot(), dropper.selfSessionId)).toBeDefined();
  });
});

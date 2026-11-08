import { MAX_SHARED_SOURCE_BYTES } from "@vibewars/game-protocol";
import { describe, expect, it, vi } from "vitest";

import { SHARE_INTERVAL_MS } from "@vibewars/game-session";

import { createSharedTracks } from "./shared-tracks.js";

const share = (from: string, source = "s(`bd`)") => ({
  from,
  name: `Player ${from}`,
  trackId: "ruins",
  source,
});

describe("shared tracks (#2745)", () => {
  it("keeps the latest share from each sender", () => {
    const store = createSharedTracks();
    store.add(share("a", "one"));
    store.add(share("b"));
    store.add(share("a", "two"));
    expect(store.rows().map((row) => [row.from, row.source])).toEqual([
      ["b", "s(`bd`)"],
      ["a", "two"],
    ]);
  });

  it("counts what came since the popover was open, and a replacement counts again", () => {
    const store = createSharedTracks();
    store.add(share("a"));
    store.add(share("b"));
    expect(store.unheard()).toBe(2);
    store.hearAll();
    expect(store.unheard()).toBe(0);
    store.add(share("a", "again"));
    expect(store.unheard()).toBe(1);
  });

  it("a replaced share is no longer the one marked playing", () => {
    const store = createSharedTracks();
    store.add(share("a"));
    store.setPlaying("a");
    expect(store.playing).toBe("a");
    store.add(share("a", "newer"));
    expect(store.playing).toBeNull();
  });

  it("drops the rows of senders who left, and everything on a lobby change", () => {
    const store = createSharedTracks();
    store.add(share("a"));
    store.add(share("b"));
    store.setPlaying("b");
    store.keep(new Set(["a"]));
    expect(store.rows().map((row) => row.from)).toEqual(["a"]);
    expect(store.playing).toBeNull();
    store.clear();
    expect(store.rows()).toEqual([]);
    expect(store.unheard()).toBe(0);
  });

  it("never marks a sender with no share as playing", () => {
    const store = createSharedTracks();
    store.setPlaying("ghost");
    expect(store.playing).toBeNull();
  });

  it("tells its listeners when something changed, and only then", () => {
    const store = createSharedTracks();
    const listener = vi.fn();
    const stop = store.onChange(listener);
    store.clear();
    store.hearAll();
    expect(listener).not.toHaveBeenCalled();
    store.add(share("a"));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("shares only with a lobby to send to, and never over the cap", () => {
    const store = createSharedTracks();
    const send = vi.fn();
    expect(store.share("ruins", "s(`bd`)")).toBe("refused");
    store.setSender(send);
    expect(store.canShare).toBe(true);
    expect(store.share("ruins", "x".repeat(MAX_SHARED_SOURCE_BYTES))).toBe("refused");
    expect(store.share("ruins", "s(`bd`)")).toBe("sent");
    expect(send).toHaveBeenCalledExactlyOnceWith("ruins", "s(`bd`)");
    store.setSender(null);
    expect(store.canShare).toBe(false);
  });

  it("sends nothing inside the host's interval, and again after it (#2779)", () => {
    let clock = 1_000;
    const store = createSharedTracks(() => clock);
    const send = vi.fn();
    store.setSender(send);
    expect(store.share("ruins", "one")).toBe("sent");
    clock += SHARE_INTERVAL_MS - 1;
    expect(store.share("ruins", "two")).toBe("throttled");
    expect(send).toHaveBeenCalledOnce();
    clock += 1;
    expect(store.share("ruins", "three")).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not spend the interval on a share that cannot go (#2779)", () => {
    const store = createSharedTracks(() => 0);
    store.setSender(vi.fn());
    expect(store.share("ruins", "x".repeat(MAX_SHARED_SOURCE_BYTES + 1))).toBe("refused");
    expect(store.share("ruins", "s(`bd`)")).toBe("sent");
  });

  it("tells its listeners when the host says too soon, until they unsubscribe (#2779)", () => {
    const store = createSharedTracks();
    const heard = vi.fn();
    const unsubscribe = store.onHostThrottled(heard);
    store.hostThrottled();
    expect(heard).toHaveBeenCalledOnce();
    unsubscribe();
    store.hostThrottled();
    expect(heard).toHaveBeenCalledOnce();
  });
});

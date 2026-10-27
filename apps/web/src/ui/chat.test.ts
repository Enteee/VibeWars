import type { ChatLine } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { CHAT_LINES_KEPT, ChatLog, chatSide, chatToSend } from "./chat.js";

const line = (fromId: string, team: 0 | 1 | null, text = "hi"): ChatLine => ({
  channel: "all",
  fromId,
  name: fromId,
  team,
  text,
});

describe("chatToSend (#479)", () => {
  it("sends on the chosen channel, trimmed", () => {
    expect(chatToSend("  gg  ", "team", true)).toEqual({ channel: "team", text: "gg" });
  });

  it("takes GW1's prefixes over the chosen channel: ! all, # team", () => {
    expect(chatToSend("!glhf", "team", true)).toEqual({ channel: "all", text: "glhf" });
    expect(chatToSend("# spike", "all", true)).toEqual({ channel: "team", text: "spike" });
  });

  it("sends nothing for an empty line, or a spectator's team chat", () => {
    expect(chatToSend("   ", "all", true)).toBeUndefined();
    expect(chatToSend("!", "all", true)).toBeUndefined();
    expect(chatToSend("#psst", "all", false)).toBeUndefined();
    expect(chatToSend("hi", "all", false)).toEqual({ channel: "all", text: "hi" });
  });
});

describe("chatSide (#479)", () => {
  it("colours a line by the sender's side as this player sees it", () => {
    expect(chatSide(line("me", 0), "me", 0)).toBe("self");
    expect(chatSide(line("ann", 0), "me", 0)).toBe("ally");
    expect(chatSide(line("bob", 1), "me", 0)).toBe("enemy");
    expect(chatSide(line("sam", null), "me", 0)).toBe("spectator");
  });

  it("shows a spectator every player in the friendly hue", () => {
    expect(chatSide(line("bob", 1), "me", null)).toBe("ally");
  });
});

describe("ChatLog (#479)", () => {
  it(`keeps the last ${String(CHAT_LINES_KEPT)} lines`, () => {
    const log = new ChatLog();
    for (let i = 0; i < CHAT_LINES_KEPT + 5; i += 1) {
      log.add(line("ann", 0, String(i)));
    }
    const kept = log.visible();
    expect(kept).toHaveLength(CHAT_LINES_KEPT);
    expect(kept[0]?.text).toBe("5");
  });

  it("hides a muted sender's lines, kept and new, until unmuted", () => {
    const log = new ChatLog();
    log.add(line("ann", 0, "one"));
    log.add(line("bob", 1, "two"));
    log.mute("bob", true);
    expect(log.add(line("bob", 1, "three"))).toBe(false);
    expect(log.visible().map((l) => l.text)).toEqual(["one"]);
    log.mute("bob", false);
    expect(log.visible().map((l) => l.text)).toEqual(["one", "two", "three"]);
  });
});

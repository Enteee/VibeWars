import { describe, expect, it } from "vitest";

import { BOT_TAG, botTag, taggedName } from "./bot-tag.js";

/** The BOT tag (#1194): on a lobby's bot, wherever its name shows, and on nobody else. */
describe("botTag", () => {
  it("tags a bot BOT, and a player not at all", () => {
    expect(botTag({ bot: true })).toBe(BOT_TAG);
    expect(BOT_TAG).toBe("BOT");
    expect(botTag({ bot: false })).toBeUndefined();
  });

  it("puts the tag after a bot's name for its name plate, and leaves a player's alone", () => {
    expect(taggedName({ name: "Monk Bot", bot: true })).toBe("Monk Bot · BOT");
    expect(taggedName({ name: "Mhenlo", bot: false })).toBe("Mhenlo");
  });
});

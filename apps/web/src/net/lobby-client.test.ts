import { ROOM_LIMIT, SERVER_FULL_MESSAGE } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { isServerFull } from "./lobby-client.js";

describe("isServerFull (#114)", () => {
  it("is a refusal carrying ROOM_LIMIT, as matchmaking sends it", () => {
    const refused = Object.assign(new Error(SERVER_FULL_MESSAGE), { code: ROOM_LIMIT });
    expect(isServerFull(refused)).toBe(true);
  });

  it("is not any other failure", () => {
    expect(isServerFull(Object.assign(new Error("boom"), { code: 500 }))).toBe(false);
    expect(isServerFull(new Error(SERVER_FULL_MESSAGE))).toBe(false);
    expect(isServerFull({ code: ROOM_LIMIT })).toBe(false);
  });
});

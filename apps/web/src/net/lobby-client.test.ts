import {
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  CLIENT_LIMIT,
  ROOM_LIMIT,
  SERVER_FULL_MESSAGE,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { LobbyNotFoundError, capacityRefusal, joinByCodeFailure } from "./lobby-client.js";

const refused = (code: number): Error => Object.assign(new Error("refused"), { code });

describe("capacityRefusal (#114, #265)", () => {
  it("says the server is full for ROOM_LIMIT and CLIENT_LIMIT", () => {
    expect(capacityRefusal(refused(ROOM_LIMIT))).toBe(SERVER_FULL_MESSAGE);
    expect(capacityRefusal(refused(CLIENT_LIMIT))).toBe(SERVER_FULL_MESSAGE);
  });

  it("says this network is over its share for ADDRESS_LIMIT", () => {
    expect(capacityRefusal(refused(ADDRESS_LIMIT))).toBe(ADDRESS_LIMIT_MESSAGE);
  });

  it("survives a join by code, so the player is not told the code is wrong", () => {
    for (const code of [ROOM_LIMIT, CLIENT_LIMIT, ADDRESS_LIMIT]) {
      const error = refused(code);
      expect(joinByCodeFailure(error, "ABCD")).toBe(error);
    }
    expect(joinByCodeFailure(new Error("no rooms found"), "ABCD")).toBeInstanceOf(
      LobbyNotFoundError,
    );
  });

  it("says nothing for any other failure", () => {
    expect(capacityRefusal(refused(500))).toBeUndefined();
    expect(capacityRefusal(new Error(SERVER_FULL_MESSAGE))).toBeUndefined();
    expect(capacityRefusal({ code: ROOM_LIMIT })).toBeUndefined();
  });
});

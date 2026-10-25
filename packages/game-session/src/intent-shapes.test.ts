import type { IntentRefusal, MatchIntent } from "@vibewars/game-core";
import type { CastRefusedMessage, ClientIntent } from "@vibewars/game-protocol";
import { describe, expectTypeOf, it } from "vitest";

/**
 * game-core restates two of game-protocol's types, since it depends on
 * nothing (#375). Here, where both are in reach, they must stay one shape.
 */
describe("game-core's intents and refusals", () => {
  it("are game-protocol's, both ways", () => {
    expectTypeOf<ClientIntent>().toEqualTypeOf<MatchIntent>();
    expectTypeOf<IntentRefusal>().toEqualTypeOf<CastRefusedMessage>();
  });
});

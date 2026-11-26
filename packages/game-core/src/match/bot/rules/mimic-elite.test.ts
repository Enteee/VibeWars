import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { BOT, askBot, body, match } from "./test-support.js";

describe("play-build borrows an elite (#1965)", () => {
  it("casts Arcane Mimicry on an ally's elite with no foe in reach, never an attack or its own", () => {
    const at = (allyBar: readonly string[], ownBar: readonly string[] = []) =>
      match([
        body("m", 0, vec2(0, 0), {
          behaviour: BOT,
          skillBar: ["mesmer.arcane-mimicry", ...ownBar],
        }),
        body("ally", 0, vec2(0, 60), { skillBar: allyBar }),
        body("foe", 1, vec2(1500, 0)),
      ]);
    expect(askBot(at(["monk.word-of-healing"]), "m")).toMatchObject({
      targetId: "ally",
      useSkillId: "mesmer.arcane-mimicry",
    });
    expect(askBot(at(["warrior.eviscerate"]), "m").useSkillId).toBeUndefined();
    expect(
      askBot(at(["monk.word-of-healing"], ["monk.word-of-healing"]), "m").useSkillId,
    ).toBeUndefined();
  });
});

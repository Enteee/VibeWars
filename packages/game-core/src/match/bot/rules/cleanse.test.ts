import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { DT, MONK, WARRIOR, fighter, match, skillsUsed } from "./test-support.js";

describe("play-build cleanses (#1189)", () => {
  it("takes a condition off an ally", () => {
    const sim = match([
      fighter("warrior", 0, WARRIOR, vec2(400, 400)),
      fighter("ally", 0, MONK, vec2(480, 400), { behaviour: undefined }),
      fighter("hexer", 1, WARRIOR, vec2(1550, 750), {
        behaviour: {
          kind: "apply-status-cadence",
          statusId: "bleeding",
          durationSeconds: 20,
          everySeconds: 60,
          targeting: { kind: "fixed", participantId: "ally" },
        },
      }),
    ]);
    // The bleeding lands after the bot's first think: it sees it on its second.
    for (let t = 0; t < 0.5; t += DT) sim.step(DT);
    const cast = sim.get("warrior")?.combatant.cast.activeCast;
    expect(cast).toMatchObject({ skillId: "monk.mend-condition", targetId: "ally" });
    skillsUsed(sim, "warrior", 2);
    expect(sim.get("ally")?.combatant.statuses.has("bleeding")).toBe(false);
  });
});

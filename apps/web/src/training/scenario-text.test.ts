import { TRAINING_SCENARIOS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { scenarioText } from "./scenario-text.js";

describe("scenarioText (#3036)", () => {
  it("has a label and a teaches line in the catalog for every scenario", () => {
    for (const scenario of TRAINING_SCENARIOS) {
      expect(scenarioText(scenario, "label"), scenario.id).not.toBe("");
      expect(scenarioText(scenario, "teaches"), scenario.id).not.toBe("");
    }
  });

  it("reads the English text that used to live in game-core", () => {
    const target = TRAINING_SCENARIOS.find(({ id }) => id === "target-dummy");
    if (target === undefined) throw new Error("no target-dummy");
    expect(scenarioText(target, "label")).toBe("Target dummy");
  });

  it("throws for a scenario the catalog does not know", () => {
    const [first] = TRAINING_SCENARIOS;
    if (first === undefined) throw new Error("no scenarios");
    expect(() => scenarioText({ ...first, id: "no-such-scenario" }, "label")).toThrow(
      "training.scenario.no-such-scenario.label",
    );
  });
});

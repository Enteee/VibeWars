import { describe, expect, it } from "vitest";

import { describeStatus } from "./describe.js";
import { isSelfOnlyStatus } from "./self-only.js";

describe("a status only its caster bears (#2341)", () => {
  it.each([
    ["mist-form", true],
    ["dodge", true],
    ["vigorous-spirit", false],
    ["angelic-bond", false],
    ["backfire", false],
  ])("%s: %s", (id, selfOnly) => {
    expect(isSelfOnlyStatus(id)).toBe(selfOnly);
  });

  it.each([
    [
      "divine-boon",
      "whenever you cast a Protection Prayers or Divine Favor spell on an ally, that ally is healed for 15 and you lose 1 energy",
    ],
    [
      "mist-form",
      "33% less damage from foes with a Water Magic hex. Whenever you cast an elemental spell: you and non-spirit allies in earshot: heals for 210% of the spell's energy cost, under 80% Health",
    ],
    ["echo", "the next time you use a skill: that skill takes this skill's slot for 20 seconds"],
    [
      "feigned-neutrality",
      "+7 Health regeneration, +80 armor, ends if you hit with an attack, ends if you use a skill",
    ],
  ])("%s says you", (id, text) => {
    expect(describeStatus(id)).toBe(text);
  });

  it("leaves one an ally can bear to the bearer, and a hex to it", () => {
    expect(describeStatus("restful-breeze")).toBe(
      "+10 Health regeneration, ends if the bearer attacks, ends if the bearer uses a skill",
    );
    expect(describeStatus("vigorous-spirit")).toBe(
      "whenever it attacks or casts a spell: heals for 5",
    );
    expect(describeStatus("backfire")).toContain("whenever it casts a spell");
  });
});

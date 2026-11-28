import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../../distances.js";
import { NO_RANKS, getStatusDefinition, type StatusId } from "../../../skills/status.js";
import { getSkill } from "../../../skills/catalog.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { coverHexOf, coverTarget } from "./cover-hex.js";
import { ELEMENTALIST, WARRIOR, askBot, fighter, match, skillsUsed } from "./test-support.js";

const KEY = "mesmer.empathy";
const COVER = "mesmer.phantom-pain";

/** A mesmer bot `m` with `skillBar`, a foe `f` at `foeX` and an ally `a`. */
const at = (skillBar: string[], foeX = 800): MatchSimulation =>
  match([
    fighter("m", 0, ELEMENTALIST, vec2(400, 400), { skillBar, maxEnergy: 60 }),
    fighter("a", 0, ELEMENTALIST, vec2(380, 440), { behaviour: undefined }),
    fighter("f", 1, WARRIOR, vec2(foeX, 400), { behaviour: undefined }),
  ]);

const hex = (
  sim: MatchSimulation,
  statusId: StatusId,
  seconds: number,
  by: string,
  skillId: string,
) => sim.get("f")?.combatant.statuses.apply(statusId, seconds, by, NO_RANKS, null, skillId);

const newestHexOf = (sim: MatchSimulation): string | undefined =>
  sim
    .get("f")
    ?.combatant.statuses.active.filter(
      (status) => getStatusDefinition(status.id).category === "hex",
    )
    .at(-1)?.sourceSkillId;

const coverOf = (skillBar: string[]) => {
  const self = at(skillBar).get("m");
  return self === undefined ? undefined : coverHexOf(self);
};

const targetOf = (sim: MatchSimulation): string | undefined => {
  const self = sim.get("m");
  const cover = self === undefined ? undefined : coverHexOf(self);
  const foe = sim.get("f");
  return self === undefined || cover === undefined || foe === undefined
    ? undefined
    : coverTarget(self, cover, [foe], () => true)?.id;
};

describe("play-build covers its key hex (#4279)", () => {
  it("lays its cheap hex over its expensive one, and hex removal takes the cheap one", () => {
    const sim = at([KEY, COVER]);
    expect(skillsUsed(sim, "m", 6).slice(0, 2)).toEqual([KEY, COVER]);
    expect(newestHexOf(sim)).toBe(COVER);
    const removed = sim.get("f")?.combatant.statuses.removeByCategory("hex", 1);
    expect(removed?.map(({ sourceSkillId }) => sourceSkillId)).toEqual([COVER]);
    expect(sim.get("f")?.combatant.statuses.has("empathy")).toBe(true);
  });

  it("casts the cover at once on a foe whose newest hex is its key hex", () => {
    const sim = at([KEY, COVER]);
    hex(sim, "empathy", 10, "m", KEY);
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: COVER, targetId: "f" });
  });

  it("leaves a key hex something newer already covers", () => {
    const sim = at([KEY, COVER]);
    hex(sim, "empathy", 10, "m", KEY);
    hex(sim, "parasitic-bond", 10, "a", "necromancer.parasitic-bond");
    expect(targetOf(sim)).toBeUndefined();
  });

  it("leaves a key hex with under 3 s left", () => {
    const sim = at([KEY, COVER]);
    hex(sim, "empathy", 2.5, "m", KEY);
    expect(targetOf(sim)).toBeUndefined();
    hex(sim, "empathy", 10, "m", KEY);
    expect(targetOf(sim)).toBe("f");
  });

  it("leaves a key hex an ally cast", () => {
    const sim = at([KEY, COVER]);
    hex(sim, "empathy", 10, "a", KEY);
    expect(targetOf(sim)).toBeUndefined();
  });

  it("never walks off to cover a foe out of the cover's range", () => {
    const sim = at([KEY, COVER], 400 + RANGE_SPELL + 100);
    hex(sim, "empathy", 10, "m", KEY);
    expect(targetOf(sim)).toBeUndefined();
  });

  it("covers nothing with one hex, or two of the same cost", () => {
    expect(coverOf([KEY])).toBeUndefined();
    const sim = at([KEY, "mesmer.wandering-eye"]);
    hex(sim, "empathy", 10, "m", KEY);
    expect(targetOf(sim)).toBeUndefined();
  });

  it("picks the cheapest hex, ties to the shorter activation, then bar order", () => {
    const cover = (skillBar: string[]) => coverOf(skillBar)?.id;
    expect(getSkill(COVER)?.activationSeconds).toBe(2);
    expect(cover([KEY, COVER, "necromancer.parasitic-bond"])).toBe("necromancer.parasitic-bond");
    expect(cover([KEY, "mesmer.wandering-eye"])).toBe(KEY);
    expect(cover(["mesmer.wandering-eye", KEY])).toBe("mesmer.wandering-eye");
  });
});

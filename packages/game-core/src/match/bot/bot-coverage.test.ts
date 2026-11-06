import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS } from "../../skills/catalog.js";
import { BOT_GAP_DESCRIPTIONS, BOT_UNUSED, botCasts, botCoverable } from "./bot-coverage.js";

describe("bot coverage (#2490)", () => {
  const coverable = IMPLEMENTED_SKILLS.filter(botCoverable);

  it("names a reason for every skill a bot never casts", () => {
    const unlisted = coverable
      .filter((skill) => !botCasts(skill) && BOT_UNUSED[skill.id] === undefined)
      .map((skill) => skill.id);
    expect(unlisted).toEqual([]);
  });

  it("lists no skill a bot casts: fixing one deletes its row", () => {
    const cast = coverable.filter((skill) => botCasts(skill)).map((skill) => skill.id);
    expect(cast.filter((id) => BOT_UNUSED[id] !== undefined)).toEqual([]);
  });

  it("lists only catalog skills a bot could cover", () => {
    const ids = new Set(coverable.map((skill) => skill.id));
    expect(Object.keys(BOT_UNUSED).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("puts at least three skills in every gap but other", () => {
    const sizes = new Map<string, number>();
    for (const gap of Object.values(BOT_UNUSED)) sizes.set(gap, (sizes.get(gap) ?? 0) + 1);
    const thin = Object.keys(BOT_GAP_DESCRIPTIONS).filter(
      (gap) => gap !== "other" && (sizes.get(gap) ?? 0) < 3,
    );
    expect(thin).toEqual([]);
  });

  it("knows the never-cast skills that started it", () => {
    expect([
      BOT_UNUSED["ritualist.empowerment"],
      BOT_UNUSED["ritualist.recovery"],
      BOT_UNUSED["ritualist.armor-of-unfeeling"],
      BOT_UNUSED["ritualist.draw-spirit"],
      BOT_UNUSED["paragon.we-shall-return"],
    ]).toEqual(["support-spirit", "support-spirit", "spirit-buff", "spirit-buff", "party-buff"]);
  });
});

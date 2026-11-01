import { IMPLEMENTED_SKILLS, type ApplyStatusEffect, type Skill } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import skilldesc from "../raw/gw-skilldata/skilldesc-en.json" with { type: "json" };

// A status lasts as GW1 says at the caster's rank (#2041): an `apply-status`
// whose rank-12 seconds are a "N...M seconds" range of its skill's GW1 text
// scales with the skill's attribute, from N at 0 to M at 15.

const CONCISE: ReadonlyMap<number, string> = new Map(
  Object.values(skilldesc.skilldesc).map((record) => [record.id, record.concise]),
);

/** Every "N...M second(s)" of `gwId`'s concise text, as [N, M]. */
function ranges(gwId: number | undefined): (readonly [number, number])[] {
  return [
    ...((gwId === undefined ? undefined : CONCISE.get(gwId)) ?? "").matchAll(
      /(\d+)\.\.\.(\d+) seconds?/g,
    ),
  ].map(([, low, high]) => [Number(low), Number(high)] as const);
}

/** The rank-12 value of a range, unrounded, as the catalog writes it. */
function atTwelve([low, high]: readonly [number, number]): number {
  return low + (high - low) * 0.8;
}

/** Every `apply-status` anywhere in `skill`: its effects, riders, triggers. */
function applyStatuses(value: unknown): ApplyStatusEffect[] {
  if (Array.isArray(value)) {
    return value.flatMap(applyStatuses);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const own = "kind" in value && value.kind === "apply-status" ? [value as ApplyStatusEffect] : [];
  return [...own, ...Object.values(value).flatMap(applyStatuses)];
}

const statuses = IMPLEMENTED_SKILLS.flatMap((skill: Skill) =>
  applyStatuses(skill.effects).map((effect) => ({ skill, effect })),
);

describe("status durations at the caster's rank (#2041)", () => {
  it("scales each with its skill's attribute, along a range of its GW1 text", () => {
    const scaled = statuses.filter(({ effect }) => "scaling" in effect.durationSeconds);
    expect(scaled.length).toBeGreaterThan(300);
    for (const { skill, effect } of scaled) {
      if (!("scaling" in effect.durationSeconds)) {
        continue;
      }
      const { attributeId, atZero, atTwelve: twelve } = effect.durationSeconds.scaling;
      expect(attributeId, skill.id).toBe(skill.attributeId);
      expect(
        ranges(skill.gwId).some(
          (range) => range[0] === atZero && Math.abs(atTwelve(range) - twelve) < 1e-9,
        ),
        `${skill.id} ${effect.statusId}`,
      ).toBe(true);
    }
  });

  it("leaves none flat whose rank-12 seconds a range of its GW1 text gives", () => {
    const flat = statuses.filter(
      ({ skill, effect }) =>
        skill.attributeId !== undefined &&
        "flat" in effect.durationSeconds &&
        ranges(skill.gwId).some((range) => {
          const seconds = "flat" in effect.durationSeconds ? effect.durationSeconds.flat : NaN;
          return Math.round(atTwelve(range)) === seconds || atTwelve(range) === seconds;
        }),
    );
    expect(flat.map(({ skill, effect }) => `${skill.id} ${effect.statusId}`)).toEqual([]);
  });
});

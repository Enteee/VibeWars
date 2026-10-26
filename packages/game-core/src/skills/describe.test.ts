import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { describeSkill, describeStatus, formatScalingRange } from "./describe.js";
import { makeCombatant } from "./testing.js";
import { resolveMagnitude } from "./scaling.js";
import { STATUS_DEFINITIONS } from "./status.js";

/**
 * Descriptions are generated from the effect data, never authored, so
 * the thing most worth testing is that they agree with what the
 * simulation will actually do. A tooltip promising 91 damage while
 * combat deals 70 is the exact failure these tests exist to prevent.
 */

function skill(id: string) {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`${id} is not in the catalog`);
  }
  return found;
}

describe("describeSkill", () => {
  it("reports the number the simulation would actually produce", () => {
    // The anti-drift assertion: compare the description against
    // `resolveMagnitude`, which is what `applyEffects` calls.
    const ranks = new Map([["elementalist.fire-magic", 9]]);
    const fireball = skill("elementalist.fireball");
    const described = describeSkill(fireball, ranks);

    const damage = fireball.effects.find((effect) => effect.kind === "damage");
    expect(damage).toBeDefined();
    if (damage?.kind !== "damage") {
      return;
    }
    const simulated = resolveMagnitude(
      damage.amount,
      makeCombatant({ id: "c", team: 0, attributeRanks: ranks }),
    );

    expect(described.effects[0]?.magnitude?.current).toBe(simulated);
    expect(described.effects[0]?.text).toContain(String(simulated));
  });

  it("changes with the attribute rank", () => {
    const fireball = skill("elementalist.fireball");
    const weak = describeSkill(fireball, new Map([["elementalist.fire-magic", 0]]));
    const strong = describeSkill(fireball, new Map([["elementalist.fire-magic", 12]]));

    expect(strong.effects[0]?.magnitude?.current).toBeGreaterThan(
      weak.effects[0]?.magnitude?.current ?? Infinity,
    );
  });

  it("describes an unallocated character at rank 0, not at some typical rank", () => {
    const atZero = describeSkill(skill("elementalist.fireball"), new Map());
    const explicitZero = describeSkill(
      skill("elementalist.fireball"),
      new Map([["elementalist.fire-magic", 0]]),
    );

    expect(atZero.effects[0]?.text).toBe(explicitZero.effects[0]?.text);
  });

  it("names the attribute in readable form", () => {
    expect(describeSkill(skill("elementalist.fireball")).attributeName).toBe("Fire Magic");
  });

  it("formats cost, cast, recharge and target for display", () => {
    const described = describeSkill(skill("elementalist.fireball"));

    expect(described.cost).toBe("10 energy");
    expect(described.castTime).toBe("1s");
    expect(described.targetText).toBe("One foe");
    expect(described.rangeText).toContain("range");
  });

  it("says Instant rather than 0s", () => {
    const instant = IMPLEMENTED_SKILLS.find((s) => s.activationSeconds === 0);
    expect(instant).toBeDefined();
    if (instant === undefined) {
      return;
    }
    expect(describeSkill(instant).castTime).toBe("Instant");
  });

  it("reports an adrenaline cost as adrenaline", () => {
    expect(describeSkill(skill("warrior.sever-artery-lite")).cost).toContain("adrenaline");
  });

  it("says Self for a self-cast rather than inventing a range", () => {
    const described = describeSkill(skill("elementalist.armor-of-earth"));

    expect(described.targetText).toBe("Self");
    expect(described.rangeText).toBe("Self");
  });

  it("says Another ally for a skill that cannot target its caster (#503)", () => {
    expect(describeSkill(skill("necromancer.blood-ritual")).targetText).toBe("Another ally");
  });

  it("explains what an applied status does, not just its name", () => {
    const described = describeSkill(skill("warrior.sever-artery-lite"));
    const line = described.effects.map((effect) => effect.text).join(" ");

    expect(line).toContain("Bleeding");
    expect(line).toContain("−3 Health degeneration");
  });

  it("says what Swift Chop does when blocked, after what it does on a hit (#534)", () => {
    const ranks = new Map([["warrior.axe-mastery", 12]]);
    const lines = describeSkill(skill("warrior.swift-chop"), ranks).effects.map((e) => e.text);
    expect(lines).toEqual([
      "If blocked: deals 16 damage",
      expect.stringContaining("If blocked: applies Deep Wound for 20s"),
    ]);
  });

  it("says Guardian blocks half of all attacks (#534)", () => {
    expect(describeStatus("guardian")).toBe("50% chance to block attacks");
  });

  it("words a status's pips as GW1 does", () => {
    expect(describeStatus("bleeding")).toContain("−3 Health degeneration");
    expect(describeStatus("regeneration")).toContain("+4 Health regeneration");
    expect(describeStatus("malaise")).toContain("−1 Energy degeneration");
    expect(describeStatus("blood-ritual")).toContain("+3 Energy regeneration");
  });

  it("flags whether a skill scales at all", () => {
    expect(describeSkill(skill("elementalist.fireball")).scalesWithAttribute).toBe(true);
    // A pure interrupt has nothing to scale, and must not claim it does.
    expect(describeSkill(skill("ranger.broad-head-arrow")).scalesWithAttribute).toBe(false);
  });

  it("produces a line for every effect of every catalog skill", () => {
    // Guards the switch in `describeEffect`: a new effect kind that
    // nobody described would silently vanish from tooltips.
    for (const entry of IMPLEMENTED_SKILLS) {
      const described = describeSkill(entry);
      expect(described.effects, `${entry.id} lost an effect line`).toHaveLength(
        entry.effects.length + (entry.attack?.onBlocked.length ?? 0),
      );
      for (const line of described.effects) {
        expect(line.text.length, `${entry.id} has an empty description line`).toBeGreaterThan(0);
      }
    }
  });
});

describe("describeStatus", () => {
  it("describes every defined status in terms of what it does", () => {
    for (const definition of Object.values(STATUS_DEFINITIONS)) {
      const text = describeStatus(definition.id);
      expect(text.length).toBeGreaterThan(0);
      // Falling back to the bare name means the definition has an effect
      // this function does not know how to explain.
      expect(text, `${definition.id} is only described by its own name`).not.toBe(definition.name);
    }
  });

  it("explains dazed by its cast-time penalty", () => {
    expect(describeStatus("dazed")).toContain("cast times");
  });

  it("returns the id for an unknown status rather than throwing", () => {
    expect(describeStatus("not-a-status")).toBe("not-a-status");
  });
});

describe("formatScalingRange", () => {
  it("shows the span a scaled effect covers", () => {
    const described = describeSkill(skill("elementalist.fireball"));
    const magnitude = described.effects[0]?.magnitude;
    expect(magnitude).toBeDefined();
    if (magnitude === undefined) {
      return;
    }
    expect(formatScalingRange(magnitude)).toBe("7…91 at 12");
  });

  it("returns nothing for a flat magnitude, rather than a fake range", () => {
    expect(
      formatScalingRange({
        current: 5,
        atZero: undefined,
        atTwelve: undefined,
        attributeId: undefined,
      }),
    ).toBeUndefined();
  });
});

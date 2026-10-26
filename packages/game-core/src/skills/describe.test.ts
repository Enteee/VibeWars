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

  it("says a flying spell can be dodged (#535)", () => {
    expect(describeSkill(skill("elementalist.fireball")).effects.map((e) => e.text)).toContain(
      "Projectile: can be dodged",
    );
    expect(describeSkill(skill("monk.orison-of-healing")).effects.map((e) => e.text)).not.toContain(
      "Projectile: can be dodged",
    );
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

  it("says Self once for a self-cast, with no range of its own", () => {
    const described = describeSkill(skill("elementalist.armor-of-earth"));

    expect(described.targetText).toBe("Self");
    expect(described.rangeText).toBeUndefined();
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

  it("leads with the number that matters at these ranks (#567)", () => {
    const healing = skill("monk.orison-of-healing");
    expect(describeSkill(healing).headline).toBe("heals 20");
    expect(describeSkill(healing, new Map([["monk.healing-prayers", 12]])).headline).toBe(
      "heals 60",
    );
    expect(describeSkill(skill("elementalist.fireball")).headline).toMatch(/^\d+ damage$/);
    // Nothing to count: no headline rather than a made-up one.
    expect(describeSkill(skill("ranger.broad-head-arrow")).headline).toBeUndefined();
  });

  it("produces a line for every effect of every catalog skill", () => {
    // Guards the switch in `describeEffect`: a new effect kind that
    // nobody described would silently vanish from tooltips.
    for (const entry of IMPLEMENTED_SKILLS) {
      const described = describeSkill(entry);
      expect(described.effects, `${entry.id} lost an effect line`).toHaveLength(
        entry.effects.length +
          (entry.attack?.onBlocked.length ?? 0) +
          (entry.whileActivating === undefined ? 0 : 1) +
          (entry.projectile === undefined ? 0 : 1),
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

  it("explains dazed: slower spells, interrupted by attacks (#546)", () => {
    expect(describeStatus("dazed")).toContain("spells take 2× as long to cast");
    expect(describeStatus("dazed")).toContain("spells are interrupted by attacks");
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

describe("elite skills (#459)", () => {
  it("says Elite before the type, as GW1 does, and only for an elite", () => {
    const barrage = describeSkill(skill("ranger.barrage"));
    expect(barrage.typeText).toBe("Elite Attack.");
    expect(barrage.elite).toBe(true);
    const fireball = describeSkill(skill("elementalist.fireball"));
    expect(fireball.typeText).toBe("Spell.");
    expect(fireball.elite).toBe(false);
  });
});

describe("signets and shouts (#524)", () => {
  it("names the type first, as GW1 does", () => {
    expect(describeSkill(skill("warrior.healing-signet")).typeText).toBe("Signet.");
    expect(describeSkill(skill("warrior.watch-yourself")).typeText).toBe("Shout.");
    expect(describeSkill(skill("necromancer.malaise")).typeText).toBe("Hex Spell.");
  });

  it("says Healing Signet is free and what it costs in armor while activating", () => {
    const description = describeSkill(skill("warrior.healing-signet"));
    expect(description.cost).toBe("Free");
    expect(description.effects.map((effect) => effect.text)).toEqual([
      "Heals for 82",
      "While activating: -40 armor",
    ]);
  });

  it("says a shout reaches allies in earshot, and when its effect ends", () => {
    const description = describeSkill(skill("warrior.watch-yourself"));
    expect(description.targetText).toBe("Allies in earshot");
    expect(description.rangeText).toBe("350 radius");
    expect(description.castTime).toBe("Instant");
    expect(description.effects[0]?.text).toBe(
      "Applies Watch Yourself! for 10s (+21 armor, ends after 3 incoming attacks)",
    );
  });
});

describe("describeSkill at a primary attribute's rank (#531)", () => {
  it("shows Expertise's cost with the base in brackets", () => {
    const broadHead = skill("ranger.broad-head-arrow");
    expect(describeSkill(broadHead, new Map([["ranger.expertise", 12]])).cost).toBe(
      "5 energy (10)",
    );
  });

  it("shows Fast Casting's activation with the base in brackets", () => {
    const malaise = skill("necromancer.malaise");
    expect(describeSkill(malaise, new Map([["mesmer.fast-casting", 12]])).castTime).toBe(
      "1.1s (2s)",
    );
  });

  it("shows the base alone when the rank changes nothing", () => {
    const broadHead = skill("ranger.broad-head-arrow");
    const fireball = skill("elementalist.fireball");
    expect(describeSkill(broadHead, new Map()).cost).toBe("10 energy");
    expect(describeSkill(fireball, new Map([["ranger.expertise", 12]])).cost).toBe("10 energy");
    expect(describeSkill(fireball, new Map([["mesmer.fast-casting", 12]])).castTime).toBe("1s");
  });
});

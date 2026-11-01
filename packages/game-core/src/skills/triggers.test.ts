import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { makeCombatant } from "./testing.js";
import type { StatusId } from "./status.js";
import { fireChangeTriggers, fireTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant } from "./types.js";
import { NO_RANKS } from "./status.js";

describe("fireTriggers", () => {
  /** A bearer singing a paragon's song and hexed with a necromancer's Spiteful Spirit. */
  function bearer(): { bearer: Combatant; sources: Map<string, Combatant> } {
    const self = makeCombatant({ id: "b", team: 0, health: 200 });
    const sources = new Map([
      ["p", makeCombatant({ id: "p", team: 0 })],
      ["n", makeCombatant({ id: "n", team: 1 })],
    ]);
    self.statuses.apply("song-of-restoration", 10, "p", NO_RANKS);
    self.statuses.apply("spiteful-spirit", 8, "n", NO_RANKS);
    return { bearer: self, sources };
  }

  const fired = (spared: ReadonlySet<StatusId>): string[] => {
    const { bearer: self, sources } = bearer();
    return fireTriggers(
      self,
      "bearer-uses-skill",
      {
        sourceOf: (id) => sources.get(id),
        rng: createRng(1),
        rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
        surroundings: new Map(),
        usedSkill: { skillId: "paragon.song-of-restoration", key: "paragon.song-of-restoration" },
      },
      spared,
    ).map(({ skillId }) => skillId);
  };

  it("fires every status that answers the use", () => {
    expect(fired(new Set())).toEqual([
      "paragon.song-of-restoration",
      "necromancer.spiteful-spirit",
    ]);
  });

  it("fires nothing for a status the skill put on its own user, and the rest still (#999)", () => {
    expect(fired(new Set(["song-of-restoration"]))).toEqual(["necromancer.spiteful-spirit"]);
  });
});

describe("an offender trigger (#1022)", () => {
  const noSpread: SpreadGainedCondition = () => [];

  /** A bearer at 300 under a ritualist's Weapon of Remedy, poisoned and bleeding, hit by a warrior. */
  function struck(): { bearer: Combatant; sources: Map<string, Combatant> } {
    const self = makeCombatant({ id: "b", team: 0, health: 300 });
    const sources = new Map([
      ["b", self],
      ["rit", makeCombatant({ id: "rit", team: 0, health: 200 })],
      ["war", makeCombatant({ id: "war", team: 1 })],
    ]);
    self.statuses.apply("bleeding", 10, "war", NO_RANKS);
    self.statuses.apply("poison", 10, "war", NO_RANKS);
    self.statuses.apply("weapon-of-remedy", 8, "rit", NO_RANKS);
    self.statuses.drainChanges();
    self.statuses.recordDamageFromFoe("war", "slashing", 10, false);
    return { bearer: self, sources };
  }

  function fire(self: Combatant, sources: Map<string, Combatant>) {
    return self.statuses.drainChanges().flatMap((change) =>
      fireChangeTriggers(self, change, noSpread, {
        sourceOf: (id) => sources.get(id),
        rng: createRng(1),
        rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
        surroundings: new Map(),
        usedSkill: undefined,
      }),
    );
  }

  it("runs with the bearer as caster and the offender as target, then ends its status", () => {
    const { bearer: self, sources } = struck();
    const out = fire(self, sources);
    expect(out).toEqual([
      {
        sourceId: "rit",
        skillId: "ritualist.weapon-of-remedy",
        events: [
          { kind: "life-stolen", targetId: "war", amount: 68 },
          { kind: "heal", targetId: "b", amount: 68 },
          { kind: "status-removed", targetId: "b", statusId: "poison" },
          { kind: "status-removed", targetId: "b", statusId: "bleeding" },
          { kind: "status-expired", targetId: "b", statusId: "weapon-of-remedy" },
        ],
      },
    ]);
    expect(self.health).toBe(368);
    expect(sources.get("rit")?.health).toBe(200);
    expect(self.statuses.has("weapon-of-remedy")).toBe(false);
  });

  it("fires nothing, and spends nothing, at an offender gone from the match", () => {
    const { bearer: self, sources } = struck();
    sources.delete("war");
    expect(fire(self, sources)).toEqual([]);
    expect(self.statuses.has("weapon-of-remedy")).toBe(true);
  });

  it("fires nothing from a dead bearer", () => {
    const { bearer: self, sources } = struck();
    self.dead = true;
    self.health = 0;
    expect(fire(self, sources)).toEqual([]);
  });
});

describe("an ends-early trigger (#1421)", () => {
  const noSpread: SpreadGainedCondition = () => [];

  /** A Dervish under its own Enchanted Haste, poisoned by a foe. */
  function hasted(): Combatant {
    const self = makeCombatant({ id: "d", team: 0 });
    self.statuses.apply("poison", 20, "foe", NO_RANKS);
    self.statuses.apply("enchanted-haste", 7, "d", NO_RANKS);
    self.statuses.drainChanges();
    return self;
  }

  function fire(self: Combatant): string[] {
    return self.statuses
      .drainChanges()
      .flatMap((change) =>
        fireChangeTriggers(self, change, noSpread, {
          sourceOf: (id) => (id === "d" ? self : undefined),
          rng: createRng(1),
          rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
          surroundings: new Map(),
          usedSkill: undefined,
        }),
      )
      .map(({ skillId }) => skillId);
  }

  it("fires when the enchantment is removed: the bearer loses a condition", () => {
    const self = hasted();
    self.statuses.remove("enchanted-haste");
    expect(fire(self)).toEqual(["dervish.enchanted-haste"]);
    expect(self.statuses.has("poison")).toBe(false);
  });

  it("fires nothing when it runs out", () => {
    const self = hasted();
    self.statuses.advance(7.05, false);
    expect(self.statuses.has("enchanted-haste")).toBe(false);
    expect(fire(self)).toEqual([]);
    expect(self.statuses.has("poison")).toBe(true);
  });

  it("fires nothing when it is renewed", () => {
    const self = hasted();
    self.statuses.apply("enchanted-haste", 7, "d", NO_RANKS);
    expect(fire(self)).toEqual([]);
    expect(self.statuses.has("poison")).toBe(true);
  });
});

describe("a bearer-loses-enchantment trigger (#1437)", () => {
  const noSpread: SpreadGainedCondition = () => [];

  /** A Dervish in Avatar of Melandru, poisoned and bleeding, under a Dervish and a Monk enchantment. */
  function avatar(): Combatant {
    const self = makeCombatant({ id: "d", team: 0 });
    self.statuses.apply("poison", 20, "foe", NO_RANKS);
    self.statuses.apply("bleeding", 20, "foe", NO_RANKS);
    self.statuses.apply("avatar-of-melandru", 74, "d", NO_RANKS);
    self.statuses.apply("enchanted-haste", 7, "d", NO_RANKS);
    self.statuses.apply("guardian", 10, "monk", NO_RANKS);
    self.statuses.drainChanges();
    return self;
  }

  function fire(self: Combatant): string[] {
    return self.statuses
      .drainChanges()
      .flatMap((change) =>
        fireChangeTriggers(self, change, noSpread, {
          sourceOf: (id) => (id === "d" ? self : undefined),
          rng: createRng(1),
          rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
          surroundings: new Map(),
          usedSkill: undefined,
        }),
      )
      .map(({ skillId }) => skillId);
  }

  const conditions = (self: Combatant): number => self.statuses.countByCategory("condition");

  it("fires when a Dervish enchantment runs out", () => {
    const self = avatar();
    self.statuses.advance(7.05, false);
    expect(self.statuses.has("enchanted-haste")).toBe(false);
    expect(fire(self)).toContain("dervish.avatar-of-melandru");
    expect(conditions(self)).toBe(0);
  });

  it("fires when a Dervish enchantment is stripped, once for each", () => {
    const self = avatar();
    self.statuses.apply("mystic-regeneration", 10, "d", NO_RANKS);
    self.statuses.apply("crippled", 20, "foe", NO_RANKS);
    self.statuses.apply("blind", 20, "foe", NO_RANKS);
    self.statuses.drainChanges();
    self.statuses.removeByCategory("enchantment", Number.POSITIVE_INFINITY, "dervish");
    expect(fire(self).filter((id) => id === "dervish.avatar-of-melandru")).toHaveLength(2);
    expect(conditions(self)).toBe(0);
    expect(self.statuses.has("guardian")).toBe(true);
  });

  it("does not fire for another profession's enchantment", () => {
    const self = avatar();
    self.statuses.remove("guardian");
    expect(fire(self)).toEqual([]);
    expect(conditions(self)).toBe(2);
  });

  it("does not fire on death", () => {
    const self = avatar();
    self.statuses.endAll();
    expect(fire(self)).not.toContain("dervish.avatar-of-melandru");
  });

  it("does not fire for a form ending, which is no enchantment", () => {
    const self = avatar();
    self.statuses.apply("avatar-of-dwayna", 74, "d", NO_RANKS);
    expect(self.statuses.has("avatar-of-melandru")).toBe(false);
    expect(fire(self)).toEqual([]);
  });
});

describe("a bearer-uses-skill trigger bound to a kind of skill (#1437)", () => {
  function used(skillId: string): string[] {
    const self = makeCombatant({ id: "d", team: 0 });
    self.statuses.apply("avatar-of-dwayna", 74, "d", NO_RANKS);
    self.statuses.apply("faintheartedness", 10, "foe", NO_RANKS);
    return fireTriggers(
      self,
      "bearer-uses-skill",
      {
        sourceOf: (id) => (id === "d" ? self : undefined),
        rng: createRng(1),
        rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
        surroundings: new Map(),
        usedSkill: { skillId, key: skillId },
      },
      new Set(),
    ).map(({ skillId: id }) => id);
  }

  it("answers a Dervish attack skill", () => {
    expect(used("dervish.eremites-attack")).toEqual(["dervish.avatar-of-dwayna"]);
  });

  it("answers neither a Dervish skill that is no attack nor another profession's attack", () => {
    expect(used("dervish.enchanted-haste")).toEqual([]);
    expect(used("warrior.power-attack")).toEqual([]);
  });
});

describe("a bearer-loses-condition trigger (#1475)", () => {
  const noSpread: SpreadGainedCondition = () => [];

  /** A bearer under Fragility from `m`, poisoned and bleeding. */
  function fragile(): Combatant {
    const self = makeCombatant({ id: "b", team: 0 });
    self.statuses.apply("fragility", 18, "m", NO_RANKS);
    self.statuses.apply("poison", 5, "foe", NO_RANKS);
    self.statuses.apply("bleeding", 20, "foe", NO_RANKS);
    self.statuses.drainChanges();
    return self;
  }

  function fire(self: Combatant): string[] {
    const source = makeCombatant({ id: "m", team: 1 });
    return self.statuses
      .drainChanges()
      .flatMap((change) =>
        fireChangeTriggers(self, change, noSpread, {
          sourceOf: (id) => (id === "m" ? source : undefined),
          rng: createRng(1),
          rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
          surroundings: new Map(),
          usedSkill: undefined,
        }),
      )
      .map(({ skillId }) => skillId);
  }

  it("fires when a condition runs out", () => {
    const self = fragile();
    self.statuses.advance(5.05, false);
    expect(self.statuses.has("poison")).toBe(false);
    expect(fire(self)).toEqual(["mesmer.fragility"]);
  });

  it("fires once for each condition removed", () => {
    const self = fragile();
    self.statuses.removeByCategory("condition");
    expect(fire(self)).toEqual(["mesmer.fragility", "mesmer.fragility"]);
  });

  it("does not fire on a refresh", () => {
    const self = fragile();
    self.statuses.apply("poison", 20, "foe", NO_RANKS);
    expect(fire(self)).toEqual([]);
  });

  it("does not fire on death", () => {
    const self = fragile();
    self.statuses.endAll();
    expect(fire(self)).toEqual([]);
  });
});

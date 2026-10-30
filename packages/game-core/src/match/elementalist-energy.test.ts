import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Elementalist energy engine in a match (#1614): the four Attunements'
 * energy back for their own element's skills, Aura of Restoration's
 * energy and heal for every spell, Kinetic Armor renewed by spells, and
 * Steam's extra fire on a burning foe.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BAR = [
  "elementalist.fire-attunement",
  "elementalist.earth-attunement",
  "elementalist.aura-of-restoration",
  "elementalist.kinetic-armor",
  "elementalist.steam",
  "elementalist.flare",
  "elementalist.immolate",
  "elementalist.searing-flames",
  "elementalist.water-trident",
  "elementalist.glyph-of-lesser-energy",
];
const slot = (id: string): number => BAR.indexOf(id);

/** A rank-12 Elementalist `n` of team 1 with the bar, foe `a` of team 0. */
function sim(): MatchSimulation {
  const spec = (id: string, team: number, x: number, skillBar: readonly string[]) => {
    const result: ParticipantSpec = {
      id,
      team,
      skillBar,
      attributeRanks: new Map([
        ["elementalist.fire-magic", 12],
        ["elementalist.water-magic", 12],
        ["elementalist.earth-magic", 12],
        ["elementalist.energy-storage", 12],
      ]),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 200,
      spawn: vec2(x, 0),
      facing: 0,
    };
    return result;
  };
  return new MatchSimulation({
    seed: "elementalist-energy",
    participants: [spec("a", 0, 0, []), spec("n", 1, 300, BAR)],
  });
}

function steam() {
  const found = getSkill("elementalist.steam");
  if (found === undefined) {
    throw new Error("no Steam");
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `n` uses `skillId` on `a`, and steps until it is done; what was logged. */
function use(match: MatchSimulation, skillId: string, seconds = 4): CombatLogEntry[] {
  match.setTarget("n", "a");
  expect(match.requestSkill("n", slot(skillId))?.check, skillId).toEqual({ ok: true });
  return stepFor(match, seconds);
}

/** What the status of `skillId` gave `n`, of `kind`, in `log`. */
function given(log: readonly CombatLogEntry[], skillId: string, kind: "energy-gain" | "heal") {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === kind && event.targetId === "n" ? [event.amount] : []));
}

function remaining(match: MatchSimulation, statusId: "kinetic-armor"): number {
  return match.get("n")?.combatant.statuses.get(statusId)?.remainingSeconds ?? 0;
}

describe("Attunements (#1614)", () => {
  const FIRE = "elementalist.fire-attunement";

  it("give 1 Energy plus 30% of a Fire Magic skill's base cost, rounded half up", () => {
    const match = sim();
    use(match, FIRE);
    expect(given(use(match, "elementalist.flare"), FIRE, "energy-gain")).toEqual([1, 2]);
    expect(given(use(match, "elementalist.immolate"), FIRE, "energy-gain")).toEqual([1, 3]);
    expect(given(use(match, "elementalist.searing-flames"), FIRE, "energy-gain")).toEqual([1, 5]);
  });

  it("answer only their own attribute, each attunement its own", () => {
    const match = sim();
    use(match, FIRE);
    use(match, "elementalist.earth-attunement");
    expect(given(use(match, "elementalist.water-trident"), FIRE, "energy-gain")).toEqual([]);
    const flare = use(match, "elementalist.flare");
    expect(given(flare, FIRE, "energy-gain")).toEqual([1, 2]);
    expect(given(flare, "elementalist.earth-attunement", "energy-gain")).toEqual([]);
  });

  it("give nothing for their own recast, which only refreshes them (#999)", () => {
    const match = sim();
    use(match, FIRE);
    stepFor(match, 30);
    expect(given(use(match, FIRE), FIRE, "energy-gain")).toEqual([]);
    expect(match.get("n")?.combatant.statuses.get("fire-attunement")?.remainingSeconds).toBeCloseTo(
      52,
    );
  });

  it("last 55 s and say what they give", () => {
    const match = sim();
    use(match, FIRE);
    const status = match.get("n")?.combatant.statuses.get("fire-attunement");
    expect(status?.durationSeconds).toBe(55);
    expect(describeStatus("fire-attunement")).toBe(
      "whenever it uses a Fire Magic skill: gains 1 energy plus 30% of that skill's base energy cost",
    );
  });
});

describe("Aura of Restoration (#1614)", () => {
  const AURA = "elementalist.aura-of-restoration";

  it("gives 1 Energy and heals 360% of a spell's cost; nothing for a glyph", () => {
    const match = sim();
    use(match, AURA);
    const caster = match.get("n")?.combatant;
    if (caster === undefined) {
      throw new Error("no caster");
    }
    caster.health -= 300;
    const flare = use(match, "elementalist.flare");
    expect(given(flare, AURA, "energy-gain")).toEqual([1]);
    expect(given(flare, AURA, "heal")).toEqual([18]);
    const glyph = use(match, "elementalist.glyph-of-lesser-energy");
    expect(given(glyph, AURA, "energy-gain")).toEqual([]);
    expect(given(glyph, AURA, "heal")).toEqual([]);
  });
});

describe("Kinetic Armor (#1614)", () => {
  it("gives +68 armor for 12 s, renewed by a spell, not by a glyph", () => {
    const match = sim();
    use(match, "elementalist.kinetic-armor");
    expect(describeStatus("kinetic-armor")).toContain("+68 armor");
    expect(describeStatus("kinetic-armor")).toContain("renewed whenever it casts a spell");
    const before = remaining(match, "kinetic-armor");
    use(match, "elementalist.glyph-of-lesser-energy");
    expect(remaining(match, "kinetic-armor")).toBeLessThan(before - 3);
    match.setTarget("n", "a");
    expect(match.requestSkill("n", slot("elementalist.flare"))?.check).toEqual({ ok: true });
    for (let i = 0; i < 2 / DT && remaining(match, "kinetic-armor") < 12; i += 1) {
      match.step(DT);
    }
    expect(remaining(match, "kinetic-armor")).toBe(12);
  });
});

describe("Steam (#1614)", () => {
  const STEAM = "elementalist.steam";
  const damage = (log: readonly CombatLogEntry[]): number[] =>
    log
      .filter((entry) => entry.skillId === STEAM)
      .flatMap((entry) => entry.events)
      .flatMap((event) =>
        event.kind === "damage" && event.targetId === "a" ? [event.amount] : [],
      );

  it("strikes a foe not on fire for 52 (cold) only", () => {
    const match = sim();
    expect(damage(use(match, STEAM))).toEqual([52]);
    expect(match.get("a")?.combatant.statuses.get("blind")).toBeUndefined();
  });

  it("blinds a burning foe for 9 s and adds 52 (fire)", () => {
    const match = sim();
    use(match, "elementalist.immolate", 1.2);
    expect(match.get("a")?.combatant.statuses.get("burning")).toBeDefined();
    expect(damage(use(match, STEAM))).toEqual([52, 52]);
    expect(match.get("a")?.combatant.statuses.get("blind")?.durationSeconds).toBe(9);
    expect(
      describeSkill(steam(), new Map([["elementalist.water-magic", 12]])).effects.map(
        ({ text }) => text,
      ),
    ).toEqual([
      "Deals 52 damage",
      "If target has Burning: applies Blind for 9s (90% of attacks miss)",
      "If target has Burning: deals 52 damage",
    ]);
  });
});

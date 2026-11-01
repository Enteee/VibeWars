import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { copyKey, slotSkill } from "../skills/cast-state.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Skills that take one from the target and stand in for it (#1928):
 * Inspired Enchantment and Hex take what they removed, Arcane Thievery
 * the spell it disabled, into their own slot, as Echo's copy (#469).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const INSPIRED_ENCHANTMENT = "mesmer.inspired-enchantment";
const INSPIRED_HEX = "mesmer.inspired-hex";
const ARCANE_THIEVERY = "mesmer.arcane-thievery";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
const IMAGINED_BURDEN = "mesmer.imagined-burden";
const FIREBALL = "elementalist.fireball";
const HEALING_SIGNET = "warrior.healing-signet";

function body(id: string, team: number, skillBar: readonly string[], x: number): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["mesmer.inspiration-magic", 12],
      ["mesmer.domination-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 100,
    spawn: vec2(x, 0),
    facing: 0,
  };
}

/** `a`, the copier; `b`, its ally; `f`, a foe with two spells and a signet; `s`, one with no spell. */
function sim(): MatchSimulation {
  return new MatchSimulation({
    seed: "skill-copy",
    participants: [
      body("a", 0, [INSPIRED_ENCHANTMENT, INSPIRED_HEX, ARCANE_THIEVERY], 0),
      body("b", 0, [], 20),
      body("f", 1, [ARMOR_OF_EARTH, IMAGINED_BURDEN, FIREBALL, HEALING_SIGNET], 40),
      body("s", 1, [HEALING_SIGNET], 60),
    ],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** `id` uses `slot` on `targetId`, which is allowed, and its cast and aftercast run out. */
function use(match: MatchSimulation, id: string, slot: number, targetId: string): void {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  stepFor(match, 2);
}

/** What `a`'s `slot` holds now. */
function held(match: MatchSimulation, slot: number) {
  const a = get(match, "a");
  return slotSkill(a.skillBar, a.cast, slot);
}

describe("Inspired Enchantment (#1928)", () => {
  it("strips the foe's enchantment, gains Energy, and holds the skill that cast it for 20 s", () => {
    const match = sim();
    use(match, "f", 0, "f");
    expect(get(match, "f").statuses.has("armor-boost")).toBe(true);
    get(match, "a").energy = 50;

    use(match, "a", 0, "f");
    expect(get(match, "f").statuses.has("armor-boost")).toBe(false);
    // 3...15 at Inspiration 12: 12.6, as energy-gain rounds.
    expect(get(match, "a").energy).toBe(50 - 10 + 13);
    expect(held(match, 0)).toEqual({ skillId: ARMOR_OF_EARTH, key: copyKey(ARMOR_OF_EARTH, 0) });

    // The copy began as the 1 s cast ended, 1 s into `use`: 19 s are left.
    stepFor(match, 18.9);
    expect(held(match, 0)?.skillId).toBe(ARMOR_OF_EARTH);
    stepFor(match, 0.2);
    expect(held(match, 0)).toEqual({ skillId: INSPIRED_ENCHANTMENT, key: INSPIRED_ENCHANTMENT });
  });

  it("strips one a trigger put on, and gains Energy, with no copy", () => {
    const match = sim();
    get(match, "f").statuses.apply("armor-boost", 30, "f", NO_RANKS);
    get(match, "a").energy = 50;

    use(match, "a", 0, "f");
    expect(get(match, "f").statuses.has("armor-boost")).toBe(false);
    expect(get(match, "a").energy).toBe(50 - 10 + 13);
    expect(held(match, 0)?.skillId).toBe(INSPIRED_ENCHANTMENT);
  });

  it("with nothing to strip, gains nothing and copies nothing", () => {
    const match = sim();
    get(match, "a").energy = 50;

    use(match, "a", 0, "f");
    expect(get(match, "a").energy).toBe(50 - 10);
    expect(held(match, 0)?.skillId).toBe(INSPIRED_ENCHANTMENT);
  });
});

describe("Inspired Hex (#1928)", () => {
  it("takes the hex off the ally and holds the hex skill", () => {
    const match = sim();
    use(match, "f", 1, "b");
    expect(get(match, "b").statuses.has("imagined-burden")).toBe(true);

    use(match, "a", 1, "b");
    expect(get(match, "b").statuses.has("imagined-burden")).toBe(false);
    expect(held(match, 1)).toEqual({
      skillId: IMAGINED_BURDEN,
      key: copyKey(IMAGINED_BURDEN, 1),
    });

    // The copy is used as the hex it is, on a foe.
    use(match, "a", 1, "f");
    expect(get(match, "f").statuses.has("imagined-burden")).toBe(true);
  });

  it("a copy that ends mid-cast takes the cast with it", () => {
    const match = sim();
    use(match, "f", 1, "b");
    use(match, "a", 1, "b");
    // 1 s of the copy gone in `use`; with 0.7 s left, a 1 s cast cannot finish.
    stepFor(match, 18.3);
    match.setTarget("a", "f");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    expect(get(match, "a").cast.activeCast?.skillId).toBe(IMAGINED_BURDEN);
    stepFor(match, 1);

    expect(get(match, "a").cast.isCasting).toBe(false);
    expect(get(match, "f").statuses.has("imagined-burden")).toBe(false);
    expect(held(match, 1)).toEqual({ skillId: INSPIRED_HEX, key: INSPIRED_HEX });
  });
});

describe("Arcane Thievery (#1928)", () => {
  it("disables one of the foe's spells for 29 s, and holds that spell as long", () => {
    const match = sim();
    use(match, "a", 2, "f");
    const f = get(match, "f");
    const disabled = [ARMOR_OF_EARTH, IMAGINED_BURDEN, FIREBALL].filter(
      (id) => (f.cast.rechargeRemaining.get(id) ?? 0) > 0,
    );
    expect(disabled).toHaveLength(1);
    const [spell] = disabled;
    // 5...35 at Domination 12: 29 s, from the cast's end, a tick or so ago.
    expect(f.cast.rechargeRemaining.get(spell ?? "")).toBeGreaterThan(27);
    expect(f.cast.rechargeRemaining.has(HEALING_SIGNET)).toBe(false);
    expect(held(match, 2)?.skillId).toBe(spell);

    // 1 s of the 29 gone in `use`.
    stepFor(match, 27.9);
    expect(held(match, 2)?.skillId).not.toBe(ARCANE_THIEVERY);
    stepFor(match, 0.2);
    expect(held(match, 2)?.skillId).toBe(ARCANE_THIEVERY);
  });

  it("is refused at a foe with no spell, and costs nothing", () => {
    const match = sim();
    get(match, "a").energy = 50;
    match.setTarget("a", "s");
    expect(match.requestSkill("a", 2)?.check).toEqual({ ok: false, reason: "no-spells" });
    expect(get(match, "a").energy).toBe(50);
  });
});

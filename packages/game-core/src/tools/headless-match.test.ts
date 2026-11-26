import { describe, expect, it } from "vitest";

import { vec2 } from "../vec2.js";
import { fighter, runHeadlessMatch } from "./headless-match.js";

const DAMAGE_BAR = ["elementalist.fireball"];
const HEAL_BAR = ["monk.orison-of-healing"];

describe("runHeadlessMatch", () => {
  it("runs a fight to a conclusion with no server or browser", () => {
    const result = runHeadlessMatch({
      seed: "duel",
      fighters: [
        fighter("a", 0, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
          position: vec2(0, 0),
        }),
        fighter("b", 1, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
          position: vec2(100, 0),
        }),
      ],
      maxSeconds: 120,
    });

    // One side should be left standing in a symmetric duel decided by
    // who landed the first cast.
    expect(result.survivors.length).toBeLessThan(2);
    expect(result.seconds).toBeGreaterThan(0);
  });

  it("is deterministic: the same seed produces the same match", () => {
    const run = () =>
      runHeadlessMatch({
        seed: "repeatable",
        fighters: [
          fighter("a", 0, DAMAGE_BAR, {
            attributeRanks: new Map([["elementalist.fire-magic", 9]]),
          }),
          fighter("b", 1, DAMAGE_BAR, {
            attributeRanks: new Map([["elementalist.fire-magic", 9]]),
          }),
        ],
        maxSeconds: 60,
      });

    const first = run();
    const second = run();
    expect(second.ticks).toBe(first.ticks);
    expect(second.survivors).toEqual(first.survivors);
    expect(second.events.length).toBe(first.events.length);
  });

  it("records damage dealt per fighter", () => {
    const result = runHeadlessMatch({
      seed: "damage",
      fighters: [
        fighter("attacker", 0, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        }),
        fighter("victim", 1, [], { position: vec2(100, 0) }),
      ],
      maxSeconds: 60,
    });

    expect(result.damageDealt.get("attacker")).toBeGreaterThan(0);
    // The victim has no skills, so it cannot have dealt any.
    expect(result.damageDealt.get("victim") ?? 0).toBe(0);
  });

  it("stops early once only one team is left standing", () => {
    const quick = runHeadlessMatch({
      seed: "quick",
      fighters: [
        fighter("attacker", 0, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        }),
        fighter("victim", 1, [], { position: vec2(100, 0) }),
      ],
      maxSeconds: 300,
    });
    // It must not have burned the full 300 simulated seconds.
    expect(quick.seconds).toBeLessThan(300);
    expect(quick.survivors).toEqual(["attacker"]);
  });

  it("shows that a healer genuinely prolongs a fight — a real balance question", () => {
    const withoutHealer = runHeadlessMatch({
      seed: "balance",
      fighters: [
        fighter("dps", 0, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        }),
        fighter("victim", 1, [], { position: vec2(100, 0) }),
      ],
      maxSeconds: 300,
    });

    const withHealer = runHeadlessMatch({
      seed: "balance",
      fighters: [
        fighter("dps", 0, DAMAGE_BAR, {
          attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        }),
        fighter("victim", 1, [], { position: vec2(100, 0) }),
        fighter("healer", 1, HEAL_BAR, {
          attributeRanks: new Map([["monk.healing-prayers", 12]]),
          // Out of Fireball's 81-unit splash, or every cast burns both.
          position: vec2(100, 100),
        }),
      ],
      maxSeconds: 300,
    });

    // This is the kind of question the runner exists to answer.
    expect(withHealer.seconds).toBeGreaterThan(withoutHealer.seconds);
  });

  it("honours maxSeconds rather than running forever on a stalemate", () => {
    // Two fighters with no offensive skills can never resolve.
    const result = runHeadlessMatch({
      seed: "stalemate",
      fighters: [fighter("a", 0, []), fighter("b", 1, [])],
      maxSeconds: 5,
    });
    expect(result.seconds).toBeCloseTo(5, 1);
    expect(result.survivors).toHaveLength(2);
  });

  it("splashes a cluster the same way twice from one seed", () => {
    const run = () =>
      runHeadlessMatch({
        seed: "splash",
        fighters: [
          fighter("dps", 0, DAMAGE_BAR, {
            attributeRanks: new Map([["elementalist.fire-magic", 12]]),
          }),
          // Three within 81 of the nearest, one well outside it.
          fighter("near", 1, [], { position: vec2(200, 0) }),
          fighter("left", 1, [], { position: vec2(200, 40) }),
          fighter("right", 1, [], { position: vec2(200, -60) }),
          fighter("far", 1, [], { position: vec2(200, 300) }),
        ],
        maxSeconds: 10,
      });
    const first = run();
    expect(run()).toEqual(first);
    // The first cast: its use, then one Fireball, the cluster, never the straggler.
    expect(first.events.slice(0, 4)).toEqual([
      { kind: "skill-used", casterId: "dps", skillId: "elementalist.fireball", targetId: "near" },
      ...["near", "left", "right"].map((targetId) => ({
        kind: "damage",
        targetId,
        amount: 91,
        critical: false,
      })),
    ]);
    expect(first.events.some((event) => event.targetId === "far")).toBe(false);
  });
});

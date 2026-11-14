import type { CombatMessage } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { createHealWatch } from "./heal-watch.js";

const SELF = "self";
const TUTOR = "tutor";
const HEAL = "monk.heal-other";

const message = (over: Partial<CombatMessage>): CombatMessage => ({
  casterSessionId: "",
  cause: "skill",
  skillId: "",
  weaponId: "",
  attributeId: "",
  doubleStrike: false,
  events: [],
  ...over,
});
const strike = message({
  casterSessionId: "zone:rockfall:clearing-rockfall",
  cause: "zone",
  events: [{ kind: "damage", targetId: TUTOR, amount: 40, critical: false }],
});
const heal = message({
  casterSessionId: SELF,
  skillId: HEAL,
  events: [{ kind: "heal", targetId: TUTOR, amount: 35 }],
});

describe("createHealWatch (#3303)", () => {
  it("counts a zone's strike on the tutor, then the player's heal on it", () => {
    const watch = createHealWatch(SELF, TUTOR, HEAL);
    watch.observe(strike);
    expect(watch.tally()).toEqual({ tutorHit: true, healedTutor: false });
    watch.observe(heal);
    expect(watch.tally()).toEqual({ tutorHit: true, healedTutor: true });
  });

  it("counts the heal on a tutor already back to full: the cast resolved on it", () => {
    const watch = createHealWatch(SELF, TUTOR, HEAL);
    watch.observe(strike);
    watch.observe({
      ...heal,
      events: [{ kind: "skill-used", casterId: SELF, skillId: HEAL, targetId: TUTOR }],
    });
    expect(watch.tally().healedTutor).toBe(true);
  });

  it("does not count a heal before the hit, even once the hit comes", () => {
    const watch = createHealWatch(SELF, TUTOR, HEAL);
    watch.observe(heal);
    watch.observe(strike);
    expect(watch.tally()).toEqual({ tutorHit: true, healedTutor: false });
  });

  it("counts neither a strike on the player nor another skill or caster's heal", () => {
    const watch = createHealWatch(SELF, TUTOR, HEAL);
    watch.observe(
      message({
        cause: "zone",
        events: [{ kind: "damage", targetId: SELF, amount: 40, critical: false }],
      }),
    );
    expect(watch.tally().tutorHit).toBe(false);
    watch.observe(strike);
    watch.observe({ ...heal, skillId: "monk.orison-of-healing" });
    watch.observe({ ...heal, casterSessionId: TUTOR });
    expect(watch.tally().healedTutor).toBe(false);
  });
});

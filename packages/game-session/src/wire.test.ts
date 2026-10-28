import {
  outsideMatch,
  getStatusDefinition,
  type ActiveStatus,
  type GroundEffect,
  type StatusCategory,
  type StatusId,
} from "@vibewars/game-core";
import { MAX_WIRE_STATUSES } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  WIRE_STATUS_IDS,
  groundEffectSnapshot,
  sameSkillBar,
  skillBarSlots,
  statusSnapshot,
  wireStatuses,
  wireIdentity,
  type SeatIdentity,
} from "./wire.js";

const ORDER: readonly StatusCategory[] = [
  "condition",
  "hex",
  "enchantment",
  "stance",
  "preparation",
  "glyph",
  "weapon-spell",
  "shout",
  "chant",
  "skill-effect",
];

function status(id: StatusId, remainingSeconds: number): ActiveStatus {
  return {
    id,
    remainingSeconds,
    durationSeconds: 12,
    attacksLeft: undefined,
    spellsLeft: undefined,
    hitsLeft: undefined,
    sourceId: "caster",
    outbreak: null,
    maintained: null,
    projected: false,
  };
}

/** `id` maintained (#837): no end of its own. */
function maintained(id: StatusId): ActiveStatus {
  return {
    ...status(id, Infinity),
    durationSeconds: Infinity,
    maintained: { seq: 0, outOfRangeSeconds: 0 },
    projected: false,
  };
}

function rank(entry: ActiveStatus): number {
  return ORDER.indexOf(getStatusDefinition(entry.id).category);
}

describe("wireStatuses (#636)", () => {
  it("keeps 32 of 40, every condition and hex, by category, then least time left (#803)", () => {
    // One of every category first, then the rest, in reverse table order
    // with times that run against it: nothing is in place by accident, and
    // the table outgrowing 40 cannot drop a category from the test.
    const reversed = [...WIRE_STATUS_IDS, ...WIRE_STATUS_IDS].reverse();
    const firsts = ORDER.map((category) =>
      reversed.findIndex((id) => getStatusDefinition(id).category === category),
    );
    const ids = [
      ...reversed.filter((_, index) => firsts.includes(index)),
      ...reversed.filter((_, index) => !firsts.includes(index)),
    ];
    const active = ids.slice(0, 40).map((id, i) => status(id, (i * 7) % 11));
    expect(new Set(active.map(rank)).size).toBe(ORDER.length);

    const sent = wireStatuses(active);

    expect(sent).toHaveLength(MAX_WIRE_STATUSES);
    const urgent = active.filter((entry) => rank(entry) <= ORDER.indexOf("hex"));
    for (const entry of urgent) {
      expect(sent).toContain(entry);
    }
    const lowestSent = Math.max(...sent.map(rank));
    for (const dropped of active.filter((entry) => !sent.includes(entry))) {
      expect(rank(dropped)).toBeGreaterThanOrEqual(lowestSent);
      // At the cut, the one with less time left is the one kept.
      for (const kept of sent.filter((entry) => rank(entry) === rank(dropped))) {
        expect(
          kept.remainingSeconds < dropped.remainingSeconds ||
            (kept.remainingSeconds === dropped.remainingSeconds && kept.id <= dropped.id),
          `${kept.id} kept over ${dropped.id}`,
        ).toBe(true);
      }
    }
    // The ones kept go in the order applied.
    expect(sent).toEqual(active.filter((entry) => sent.includes(entry)));
  });

  it("keeps all of a few, in the order applied (#803)", () => {
    const active = [
      status("sprint", 4),
      status("regeneration", 9),
      status("malaise", 3),
      status("burning", 2),
      status("bleeding", 2),
    ];
    expect(wireStatuses(active)).toEqual(active);
    expect(wireStatuses([...active].reverse())).toEqual([...active].reverse());
  });

  it("sorts two with no end as equal, after every timed one of their rank (#837)", () => {
    const active = [
      maintained("mending"),
      maintained("regeneration"),
      ...Array.from({ length: 31 }, () => status("armor-boost", 5)),
    ];
    const sent = wireStatuses(active);
    expect(sent).toHaveLength(32);
    expect(sent.filter((entry) => entry.maintained !== null)).toHaveLength(1);
  });
});

describe("statusSnapshot (#803)", () => {
  it("ends on the match clock, at its full length, by its caster, to 0.1 s", () => {
    const burning = { ...status("burning", 2.345), durationSeconds: 6.04 };
    expect(statusSnapshot(burning, 10.01, undefined)).toEqual({
      id: "burning",
      endsAt: 12.4,
      durationSeconds: 6,
      casterId: "caster",
    });
  });

  it("never sends a duration of nothing", () => {
    const blink = { ...status("burning", 0.01), durationSeconds: 0.01 };
    expect(statusSnapshot(blink, 0, undefined).durationSeconds).toBe(0.1);
  });

  it("ends one borne while activating with its cast", () => {
    const cast = { remainingSeconds: 1.5, totalSeconds: 2 };
    const borne = { ...status("healing-signet-armor", Infinity), durationSeconds: Infinity };
    expect(statusSnapshot(borne, 4, cast)).toMatchObject({ endsAt: 5.5, durationSeconds: 2 });
  });

  it("sends a maintained enchantment with no times at all (#837)", () => {
    const mending = { ...maintained("mending"), sourceId: "monk" };
    expect(statusSnapshot(mending, 4, undefined)).toEqual({
      id: "mending",
      endsAt: null,
      durationSeconds: null,
      casterId: "monk",
    });
  });

  it("sends a spirit's aura with no times either, while its bearer casts (#1064)", () => {
    const cast = { remainingSeconds: 1.5, totalSeconds: 2 };
    const aura = {
      ...status("winnowing", Infinity),
      durationSeconds: Infinity,
      sourceId: "ranger/c1",
      projected: true,
    };
    expect(statusSnapshot(aura, 4, cast)).toEqual({
      id: "winnowing",
      endsAt: null,
      durationSeconds: null,
      casterId: "ranger/c1",
    });
  });
});

describe("groundEffectSnapshot (#1087)", () => {
  const ward: GroundEffect = {
    id: 3,
    skillId: "elementalist.ward-against-melee",
    ownerId: "ele",
    team: 1,
    position: { x: 120.5, y: 80 },
    act: {
      kind: "aura",
      aura: { statusId: "ward-against-melee", affects: "allies", radius: 109 },
    },
    durationSeconds: 17.04,
    remainingSeconds: 6.345,
    pulsed: 0,
  };

  it("sits where it was placed, at its aura's radius, ending on the match clock to 0.1 s", () => {
    expect(groundEffectSnapshot(ward, 10.01)).toEqual({
      id: 3,
      skillId: "elementalist.ward-against-melee",
      team: 1,
      x: 120.5,
      y: 80,
      radius: 109,
      endsAt: 16.4,
      durationSeconds: 17,
    });
  });

  it("never sends a duration of nothing", () => {
    expect(groundEffectSnapshot({ ...ward, durationSeconds: 0.01 }, 0).durationSeconds).toBe(0.1);
  });

  it("draws a trap at the area its spring hits (#1105)", () => {
    const trap: GroundEffect = {
      ...ward,
      skillId: "ranger.barbed-trap",
      act: {
        kind: "trap",
        trap: {
          triggerRadius: 40,
          springsAtEnd: false,
          spring: {
            count: 1,
            everySeconds: 1,
            area: {
              radius: 81,
              origin: "caster",
              affects: "enemies",
              maxTargets: undefined,
              includesCaster: false,
            },
            effects: [],
          },
        },
      },
    };
    expect(groundEffectSnapshot(trap, 10.01).radius).toBe(81);
  });
});

describe("skillBarSlots", () => {
  it("describes each skill as the host's skill-bar message does", () => {
    const bearer = outsideMatch(new Map());
    expect(skillBarSlots(["elementalist.fireball", null], bearer)).toEqual([
      {
        id: "elementalist.fireball",
        name: "Fireball",
        energyCost: 10,
        adrenalineCost: 0,
        activationSeconds: 1,
        rechargeSeconds: 7,
      },
      null,
    ]);
  });

  it("costs a spell what the glyph leaves of it (#637)", () => {
    const bearer = outsideMatch(new Map());
    bearer.statuses.apply("glyph-of-lesser-energy", 15, "e");
    expect(skillBarSlots(["elementalist.fireball"], bearer)[0]?.energyCost).toBe(0);
  });
});

describe("sameSkillBar (#637)", () => {
  const bar = ["elementalist.fireball", null, "warrior.healing-signet"] as const;
  const plain = () => skillBarSlots([...bar], outsideMatch(new Map()));

  it("holds for two bars built alike, gaps included", () => {
    expect(sameSkillBar(plain(), plain())).toBe(true);
  });

  it("tells a changed cost, a moved gap and a different length apart", () => {
    const glyphed = outsideMatch(new Map());
    glyphed.statuses.apply("glyph-of-lesser-energy", 15, "e");
    const cheaper = skillBarSlots([...bar], glyphed);
    expect(sameSkillBar(plain(), cheaper)).toBe(false);
    expect(sameSkillBar(plain(), [...plain()].reverse())).toBe(false);
    expect(sameSkillBar(plain(), plain().slice(0, 2))).toBe(false);
  });
});

describe("wireIdentity (#1052)", () => {
  const seats = new Map<string, SeatIdentity>([
    [
      "p1",
      { name: "Ann", team: 1, primaryProfession: "necromancer", secondaryProfession: undefined },
    ],
  ]);
  const minion = (ownerId: string) => ({
    id: `${ownerId}/c1`,
    creature: {
      ownerId,
      kind: "minion" as const,
      name: "Bone Minion",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 1,
      skillId: "test.summon",
      aura: undefined,
      onDeath: "vanish" as const,
      ownerDisableSeconds: 0,
      companionSkillId: undefined,
      mode: "guard" as const,
    },
  });

  it("sends a seated player as its seat says", () => {
    expect(wireIdentity({ id: "p1", creature: undefined }, seats)).toEqual({
      name: "Ann",
      team: 1,
      primaryProfession: "necromancer",
      secondaryProfession: null,
      creature: null,
    });
  });

  it("sends a creature with no seat, on its owner's team, named for its kind", () => {
    expect(wireIdentity(minion("p1"), seats)).toEqual({
      name: "Bone Minion",
      team: 1,
      primaryProfession: null,
      secondaryProfession: null,
      creature: { ownerId: "p1", kind: "minion", mode: null },
    });
  });

  it("sends a companion's mode, and a minion's as null (#1110)", () => {
    const wolf = {
      id: "p1/c2",
      creature: {
        ...minion("p1").creature,
        kind: "pet" as const,
        name: "Wolf",
        companionSkillId: "ranger.charm-animal",
        mode: "heel" as const,
      },
    };
    expect(wireIdentity(wolf, seats)?.creature).toEqual({
      ownerId: "p1",
      kind: "pet",
      mode: "heel",
    });
  });

  it("sends neither a body with no seat nor a creature whose owner has none", () => {
    expect(wireIdentity({ id: "dummy", creature: undefined }, seats)).toBeUndefined();
    expect(wireIdentity(minion("gone"), seats)).toBeUndefined();
  });
});

import {
  getStatusDefinition,
  type ActiveStatus,
  type StatusCategory,
  type StatusId,
} from "@vibewars/game-core";
import { MAX_WIRE_STATUSES } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { WIRE_STATUS_IDS, wireStatuses } from "./wire.js";

const ORDER: readonly StatusCategory[] = [
  "condition",
  "hex",
  "enchantment",
  "stance",
  "preparation",
  "glyph",
  "shout",
  "skill-effect",
];

function status(id: StatusId, remainingSeconds: number): ActiveStatus {
  return {
    id,
    remainingSeconds,
    attacksLeft: undefined,
    spellsLeft: undefined,
    sourceId: "caster",
  };
}

function rank(entry: ActiveStatus): number {
  return ORDER.indexOf(getStatusDefinition(entry.id).category);
}

describe("wireStatuses (#636)", () => {
  it("keeps 32 of 40, every condition and hex, by category, then least time left", () => {
    // Every status twice, then two more, in reverse table order with
    // times that run against it: nothing is in place by accident.
    const ids = [...WIRE_STATUS_IDS, ...WIRE_STATUS_IDS, ...WIRE_STATUS_IDS].reverse();
    const active = ids.slice(0, 40).map((id, i) => status(id, (i * 7) % 11));
    expect(new Set(active.map(rank)).size).toBe(ORDER.length);

    const sent = wireStatuses(active);

    expect(sent).toHaveLength(MAX_WIRE_STATUSES);
    const urgent = active.filter((entry) => rank(entry) <= ORDER.indexOf("hex"));
    for (const entry of urgent) {
      expect(sent).toContain(entry);
    }
    for (const [a, b] of sent.slice(1).map((entry, i) => [sent[i], entry] as const)) {
      if (a === undefined) {
        continue;
      }
      expect(rank(a) <= rank(b), `${a.id} before ${b.id}`).toBe(true);
      if (rank(a) === rank(b)) {
        expect(a.remainingSeconds <= b.remainingSeconds, `${a.id} before ${b.id}`).toBe(true);
        if (a.remainingSeconds === b.remainingSeconds) {
          expect(a.id <= b.id, `${a.id} before ${b.id}`).toBe(true);
        }
      }
    }
    const lowestSent = Math.max(...sent.map(rank));
    for (const dropped of active.filter((entry) => !sent.includes(entry))) {
      expect(rank(dropped)).toBeGreaterThanOrEqual(lowestSent);
    }
  });

  it("keeps all of a few, in category order", () => {
    const active = [
      status("sprint", 4),
      status("regeneration", 9),
      status("malaise", 3),
      status("burning", 2),
      status("bleeding", 2),
    ];
    expect(wireStatuses(active).map((entry) => entry.id)).toEqual([
      "bleeding",
      "burning",
      "malaise",
      "regeneration",
      "sprint",
    ]);
  });

  it("is the same for the same statuses in any order", () => {
    const active = WIRE_STATUS_IDS.map((id, i) => status(id, i % 3));
    expect(wireStatuses([...active].reverse())).toEqual(wireStatuses(active));
  });
});

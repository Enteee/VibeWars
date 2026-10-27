import {
  MAX_WIRE_PROJECTILES,
  MAX_WIRE_STATUSES,
  type WirePlayer,
  type WireProjectile,
  type WireSnapshot,
  type WireSnapshotPart,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { packSnapshot, snapshotAssembler } from "./snapshot-parts.js";
import { MAX_MESSAGE_BYTES, messageBytes } from "./transport.js";

function player(index: number): WirePlayer {
  return {
    id: `peer-${"x".repeat(40)}-${String(index)}`,
    name: "x".repeat(64),
    team: index % 2 === 0 ? 0 : 1,
    x: 1000 / 3,
    y: 1000 / 3,
    facing: -3.14,
    targetId: null,
    attackTargetId: null,
    walking: true,
    health: 480,
    maxHealth: 480,
    energy: 25,
    maxEnergy: 25,
    overcast: 0,
    adrenaline: 0,
    armor: 60,
    weaponId: "sword",
    offhandId: null,
    primaryProfession: "warrior",
    secondaryProfession: null,
    dead: false,
    castingSkillId: null,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 1.33,
    knockdownRemaining: 0,
    healthPips: 0,
    energyPips: 0,
    statuses: Array.from({ length: MAX_WIRE_STATUSES }, (_, i) => i),
  };
}

function projectile(index: number): WireProjectile {
  return {
    id: index,
    attackerId: "peer-1",
    skillId: "elementalist.fireball",
    from: { x: 1000 / 3, y: 1000 / 3 },
    to: { x: 1000 / 3, y: 1000 / 3 },
    launchedAt: 1000 / 3,
    flightSeconds: 1000 / 3,
  };
}

function snapshot(tick: number, players: number, projectiles: number): WireSnapshot {
  return {
    tick,
    elapsedSeconds: tick / 20,
    score: [3, 4],
    phase: "active",
    winningTeam: null,
    endReason: null,
    players: Array.from({ length: players }, (_, i) => player(i)),
    projectiles: Array.from({ length: projectiles }, (_, i) => projectile(i)),
  };
}

/** Feed `parts` in order; what the last one assembled, if anything. */
function assembleAll(parts: readonly WireSnapshotPart[]): (WireSnapshot | undefined)[] {
  const assemble = snapshotAssembler();
  return parts.map((part) => assemble(part));
}

describe("packSnapshot (#662)", () => {
  it("sends a tick that fits as one part", () => {
    const whole = snapshot(5, 2, 1);
    expect(packSnapshot(whole, MAX_MESSAGE_BYTES)).toEqual([{ ...whole, part: 0, parts: 1 }]);
  });

  it("sends an empty tick as one part with empty runs", () => {
    const parts = packSnapshot(snapshot(5, 0, 0), MAX_MESSAGE_BYTES);
    expect(parts.map((part) => [part.part, part.parts])).toEqual([[0, 1]]);
  });

  it("splits the worst case, 8 players and 256 projectiles, into parts within the budget", () => {
    const whole = snapshot(9, 8, MAX_WIRE_PROJECTILES);
    const parts = packSnapshot(whole, MAX_MESSAGE_BYTES);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part, index) => {
      expect(messageBytes(part)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
      expect(part.part).toBe(index);
      expect(part.parts).toBe(parts.length);
    });
    expect(parts.flatMap((part) => part.players)).toEqual(whole.players);
    expect(parts.flatMap((part) => part.projectiles)).toEqual(whole.projectiles);
  });

  it("fills a part exactly to the budget, and not a byte past it", () => {
    const whole = snapshot(9, 2, 0);
    const exact = messageBytes({ ...whole, part: 2, parts: 2 });
    expect(packSnapshot(whole, exact)).toHaveLength(1);
    expect(packSnapshot(whole, exact - 1)).toHaveLength(2);
  });

  it("sends an entry over the budget alone, never dropped", () => {
    const whole = snapshot(9, 3, 0);
    const parts = packSnapshot(whole, 200);
    expect(parts.map((part) => part.players.length)).toEqual([1, 1, 1]);
  });
});

describe("snapshotAssembler (#662)", () => {
  it("gives back an equal snapshot from one part and from many", () => {
    for (const whole of [snapshot(3, 2, 1), snapshot(4, 8, MAX_WIRE_PROJECTILES)]) {
      const assembled = assembleAll(packSnapshot(whole, MAX_MESSAGE_BYTES));
      expect(assembled.at(-1)).toEqual(whole);
      expect(assembled.slice(0, -1)).toEqual(assembled.slice(0, -1).map(() => undefined));
    }
  });

  it("places parts by index, whatever order they arrive in", () => {
    const whole = snapshot(4, 8, MAX_WIRE_PROJECTILES);
    const parts = packSnapshot(whole, MAX_MESSAGE_BYTES);
    expect(parts.length).toBeGreaterThan(2);
    const shuffled = [...parts.slice(1).reverse(), parts[0]].filter((part) => part !== undefined);
    expect(assembleAll(shuffled).at(-1)).toEqual(whole);
  });

  it("discards an unfinished tick when a newer one's part arrives", () => {
    const older = packSnapshot(snapshot(4, 8, MAX_WIRE_PROJECTILES), MAX_MESSAGE_BYTES);
    const newer = snapshot(5, 1, 0);
    const assemble = snapshotAssembler();
    const [first, ...rest] = older;
    if (first === undefined) {
      throw new Error("expected a part");
    }
    expect(assemble(first)).toBeUndefined();
    expect(assemble({ ...newer, part: 0, parts: 1 })).toEqual(newer);
    // The older tick's last parts come late: it is never shown.
    for (const part of rest) {
      expect(assemble(part)).toBeUndefined();
    }
  });

  it("drops a part of a tick at or below the last assembled", () => {
    const assemble = snapshotAssembler();
    const whole = snapshot(7, 1, 0);
    expect(assemble({ ...whole, part: 0, parts: 1 })).toEqual(whole);
    expect(assemble({ ...whole, part: 0, parts: 1 })).toBeUndefined();
    expect(assemble({ ...snapshot(6, 1, 0), part: 0, parts: 1 })).toBeUndefined();
  });

  it("drops the whole tick for a part twice, or parts that disagree", () => {
    const whole = snapshot(8, 8, MAX_WIRE_PROJECTILES);
    const parts = packSnapshot(whole, MAX_MESSAGE_BYTES);
    const [first, second] = parts;
    if (first === undefined || second === undefined) {
      throw new Error("expected at least two parts");
    }
    const twice = assembleAll([first, first, ...parts.slice(1)]);
    expect(twice.every((result) => result === undefined)).toBe(true);

    const miscounted = assembleAll([first, { ...second, parts: second.parts + 1 }, ...parts]);
    expect(miscounted.every((result) => result === undefined)).toBe(true);

    const rescored = assembleAll([first, { ...second, score: [9, 9] }, ...parts.slice(2)]);
    expect(rescored.every((result) => result === undefined)).toBe(true);
  });

  it("drops a tick whose parts together carry more players than a match holds", () => {
    const crowd = snapshot(9, 9, 0);
    const parts = [0, 1].map((part): WireSnapshotPart => ({
      ...crowd,
      part,
      parts: 2,
      projectiles: [],
    }));
    expect(assembleAll(parts).at(-1)).toBeUndefined();
  });
});

import {
  DEFAULT_SKILL_BAR,
  defaultBuildEquipment,
  type CombatLogEntry,
  type PlayerBuild,
} from "@vibewars/game-core";
import {
  MAX_WIRE_COMBATS,
  parsePeerHello,
  parseWireCombatBatch,
  parseWireSnapshot,
  type CastRefusedMessage,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  hello,
  playerIn,
  self,
  startMatch,
  toJson,
  type TestMatch,
} from "./match-harness.test-support.js";
import type { CombatMessage, MatchConnection } from "./match-connection.js";
import { combatMessage, wireCombat } from "./wire.js";

/**
 * Combat through a P2P host (#375), ported from the server's
 * `combat.test.ts`: real intents in, the host's authoritative match back
 * out, so the skill engine is proven wired in, not merely present.
 *
 * Unlike the server's tests these run on match time, not wall time: a
 * test walks and swings by stepping the host, so nothing here waits on a
 * clock or flakes on a busy runner.
 */

const FIREBALL = DEFAULT_SKILL_BAR.indexOf("elementalist.fireball");

/** A ranger with a bow and Broad Head Arrow, which the house loadout lacks. */
const ARCHER: PlayerBuild = {
  name: "Archer",
  primaryProfession: "ranger",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "ranger.marksmanship", rank: 12 }],
  skillBar: ["ranger.broad-head-arrow", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("ranger"),
};

/** One tick of match time. */
const TICK = 0.05;

/** Step `match` a tick at a time until `done`, or fail after `seconds` of match time. */
async function until(
  match: TestMatch,
  done: () => boolean,
  label: string,
  seconds = 10,
): Promise<void> {
  for (let passed = 0; passed < seconds; passed += TICK) {
    if (done()) {
      return;
    }
    await match.step(TICK);
  }
  if (!done()) {
    throw new Error(`timed out waiting for ${label}`);
  }
}

/**
 * Walk `connection`'s player toward `point` until within `tolerance`, or
 * until `seconds` of match time run out, then stop. As on the server, a
 * walk that ends short is not a failure: two bodies cannot overlap, so a
 * tight tolerance on a player's centre may never be met, and whatever
 * the test needs next is what it asserts. The same movement rules as real
 * play: no teleport for tests.
 */
async function walkTo(
  match: TestMatch,
  connection: MatchConnection,
  point: { x: number; y: number },
  tolerance: number,
  seconds = 5,
): Promise<void> {
  for (let passed = 0; passed < seconds; passed += TICK) {
    const me = self(connection);
    if (me === undefined) {
      break;
    }
    const dx = point.x - me.x;
    const dy = point.y - me.y;
    const length = Math.hypot(dx, dy);
    if (length <= tolerance) {
      break;
    }
    connection.sendIntent({ kind: "move", dirX: dx / length, dirY: dy / length });
    await match.step(TICK);
  }
  connection.sendIntent({ kind: "stop" });
  await match.step(TICK);
}

/** Move `connection`'s player within `range` of `targetId`. */
async function closeDistance(
  match: TestMatch,
  connection: MatchConnection,
  targetId: string,
  range: number,
): Promise<void> {
  const them = playerIn(connection.getSnapshot(), targetId);
  if (them === undefined) {
    throw new Error("no target to close on");
  }
  await walkTo(match, connection, { x: them.x, y: them.y }, range * 0.8);
}

/** A remote pair, on opposite teams, in their first snapshot. */
async function joinPair(match: TestMatch = startMatch()) {
  const { connection: a } = await match.join();
  const { connection: b } = await match.join();
  await match.step(TICK);
  return { match, a, b };
}

/** Every refusal `connection` hears. */
function refusals(connection: MatchConnection): CastRefusedMessage[] {
  const seen: CastRefusedMessage[] = [];
  connection.onCastRefused((message) => {
    seen.push(message);
  });
  return seen;
}

/** Every combat entry `connection` hears, as it arrives. */
function combatMessages(connection: MatchConnection): CombatMessage[] {
  const heard: CombatMessage[] = [];
  connection.onCombat((message) => {
    heard.push(message);
  });
  return heard;
}

/** Target `targetId`, and wait until the snapshot shows it. */
async function target(
  match: TestMatch,
  connection: MatchConnection,
  targetId: string,
): Promise<void> {
  connection.sendIntent({ kind: "target", targetSessionId: targetId });
  await until(match, () => self(connection)?.targetSessionId === targetId, "the target");
}

describe("networked combat (P2P)", () => {
  it("spawns players with full health and energy", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);

    const me = self(connection);
    expect(me?.maxHealth).toBeGreaterThan(0);
    expect(me?.health).toBe(me?.maxHealth);
    expect(me?.energy).toBe(me?.maxEnergy);
    expect(me?.dead).toBe(false);
  });

  it("sends the skill bar on join, so the client can render it", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    expect(connection.skillBar).toHaveLength(DEFAULT_SKILL_BAR.length);
    expect(connection.skillBar[0]?.id).toBe(DEFAULT_SKILL_BAR[0]);
    expect(connection.skillBar[0]?.name.length).toBeGreaterThan(0);
  });

  it("puts joining players on alternating teams so a 1v1 is adversarial", async () => {
    const { a, b } = await joinPair();
    expect(self(a)?.team).not.toBe(playerIn(a.getSnapshot(), b.selfSessionId)?.team);
  });

  it("tells only the caster why a cast was refused", async () => {
    const { match, a, b } = await joinPair();
    const toA = refusals(a);
    const toB = refusals(b);

    // The test arena's spawns are within spell range of each other, where
    // the server's were not: step back out of it first.
    await walkTo(match, a, { x: 150, y: 500 }, 10);

    // Nobody targeted yet: the nearest enemy is picked, and shown. Beyond
    // spell range, Fireball walks in rather than being refused (#499):
    // cancelled before it gets there.
    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(match, () => self(a)?.targetSessionId === b.selfSessionId, "the auto-target");
    a.sendIntent({ kind: "cancel" });

    // Fireball at yourself.
    await target(match, a, a.selfSessionId);
    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(match, () => toA.length === 1, "the refusal");
    expect(toA[0]).toEqual({
      kind: "skill",
      slot: FIREBALL,
      skillId: "elementalist.fireball",
      reason: "invalid-target-self",
    });

    // Nothing was cast, and the opponent heard nothing.
    expect(self(a)?.castingSkillId).toBeUndefined();
    await match.step(0.2);
    expect(toB).toEqual([]);
  });

  it("damages an enemy when a damage skill is cast at them", async () => {
    const { match, a, b } = await joinPair();
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(
      match,
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.health ?? 500) < 500,
      "the target to take damage",
    );

    // Fire Magic 12 -> 91 before mitigation. The house loadout is a
    // warrior (80 base armor) carrying a shield whose Strength
    // requirement it does not meet (+8, not +16), so armor is 88 and the
    // curve gives 91 * 2^((60 - 88) / 40) = 56. Spelled out, not derived,
    // so a change to either the curve or the house loadout fails loudly.
    expect(playerIn(a.getSnapshot(), b.selfSessionId)?.health).toBe(500 - 56);
  });

  it("deducts energy when a skill is cast", async () => {
    const { match, a, b } = await joinPair();
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    const before = self(a)?.energy ?? 0;
    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(match, () => (self(a)?.energy ?? 0) < before, "energy to be spent");
    expect(self(a)?.energy).toBeLessThan(before);
  });

  it("exposes cast progress so a client can draw a cast bar", async () => {
    const { match, a, b } = await joinPair();
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Troll Unguent has a 3s cast: long enough to observe mid-cast.
    a.sendIntent({ kind: "use-skill", slot: DEFAULT_SKILL_BAR.indexOf("ranger.troll-unguent") });
    await until(match, () => self(a)?.castingSkillId !== undefined, "the cast to start");

    const me = self(a);
    expect(me?.castingSkillId).toBe("ranger.troll-unguent");
    expect(me?.castRemaining).toBeGreaterThan(0);
    expect(me?.castTotal).toBe(3);
  });

  it("doubles a dazed player's cast, and syncs the doubled total for the cast bar", async () => {
    // Broad Head Arrow needs a bow (ADR-0029): A is a ranger.
    const match = startMatch();
    const { connection: a } = await match.join(hello({ build: toJson(ARCHER) }));
    const { connection: b } = await match.join();
    await match.step(TICK);
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Broad Head Arrow dazes whoever it hits.
    a.sendIntent({ kind: "use-skill", slot: 0 });
    await until(match, () => self(b)?.statuses.includes("dazed") ?? false, "b dazed");

    b.sendIntent({ kind: "use-skill", slot: DEFAULT_SKILL_BAR.indexOf("ranger.troll-unguent") });
    await until(match, () => self(b)?.castingSkillId !== undefined, "b's cast to start");

    const me = self(b);
    expect(me?.castingSkillId).toBe("ranger.troll-unguent");
    expect(me?.castTotal).toBe(6);
    expect(me?.castRemaining).toBeGreaterThan(3);
  });

  it("attacks with the weapon: shown to everyone, hits as cause weapon, cancel ends it", async () => {
    const { match, a, b } = await joinPair();
    const heard = combatMessages(b);
    await closeDistance(match, a, b.selfSessionId, 60);

    a.sendIntent({ kind: "attack", targetId: b.selfSessionId });
    await until(
      match,
      () => playerIn(b.getSnapshot(), a.selfSessionId)?.attackTargetSessionId === b.selfSessionId,
      "the attack, as B sees it",
    );
    await until(
      match,
      () =>
        heard.some(
          (message) =>
            message.cause === "weapon" &&
            message.casterSessionId === a.selfSessionId &&
            message.skillId === "" &&
            message.events.some((event) => event.kind === "damage"),
        ),
      "a weapon hit",
    );

    a.sendIntent({ kind: "cancel" });
    await until(
      match,
      () => playerIn(b.getSnapshot(), a.selfSessionId)?.attackTargetSessionId === undefined,
      "the attack to end",
    );
  });

  it("puts a ranged shot in the shared state while it flies, and takes it out when it lands", async () => {
    const match = startMatch();
    // An elementalist's default weapon is a ranged one.
    // The build goes through the host's own validator, as any peer's would:
    // a plain JSON object, not game-core's typed equipment.
    const shooter = parsePeerHello({
      ...hello({ name: "Shooter" }),
      build: {
        name: "Shooter",
        primaryProfession: "elementalist",
        attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
        skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
        equipment: defaultBuildEquipment("elementalist"),
      },
    });
    if (shooter === undefined) {
      throw new Error("the shooter's hello does not parse");
    }
    const { connection: caster } = await match.join(shooter);
    const { connection: victim } = await match.join();
    await match.step(TICK);
    await closeDistance(match, caster, victim.selfSessionId, 200);

    caster.sendIntent({ kind: "attack", targetId: victim.selfSessionId });
    await until(match, () => victim.getSnapshot().projectiles.length > 0, "a shot in flight");
    const snapshot = victim.getSnapshot();
    const shot = snapshot.projectiles[0];
    const me = playerIn(snapshot, caster.selfSessionId);
    expect(
      Math.hypot((shot?.from.x ?? 0) - (me?.x ?? 0), (shot?.from.y ?? 0) - (me?.y ?? 0)),
    ).toBeLessThan(1);
    expect(shot?.flightSeconds).toBeGreaterThan(0);
    // Who shot it and with what, for the client's tint and sprite (#161).
    expect(shot?.attackerId).toBe(caster.selfSessionId);
    expect(shot?.weaponId).toBe(defaultBuildEquipment("elementalist").mainHand.weaponId);
    expect(shot?.launchedAt).toBeLessThanOrEqual(snapshot.elapsedSeconds);

    const id = shot?.id;
    await until(
      match,
      () => !victim.getSnapshot().projectiles.some((flying) => flying.id === id),
      "the shot to land",
    );
  });

  it("refuses an attack on an ally or on nobody, and tells only the attacker why", async () => {
    const { match, a } = await joinPair();
    const toA = refusals(a);
    a.sendIntent({ kind: "attack", targetId: a.selfSessionId });
    a.sendIntent({ kind: "attack", targetId: "nobody" });
    await until(match, () => toA.length === 2, "two refusals");
    expect(toA).toEqual([
      { kind: "attack", reason: "invalid-target-self" },
      { kind: "attack", reason: "no-target" },
    ]);
    expect(self(a)?.attackTargetSessionId).toBeUndefined();
  });

  it("syncs applied statuses so the client can show condition markers, and ticks them as degeneration", async () => {
    const { match, a, b } = await joinPair();
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Sever Artery costs adrenaline, earned by landing attacks: so swing
    // first. The adrenaline economy working as designed.
    const heard = combatMessages(a);
    a.sendIntent({ kind: "attack", targetId: b.selfSessionId });
    await until(match, () => (self(a)?.adrenaline ?? 0) > 0, "adrenaline from landing a hit");

    await closeDistance(match, a, b.selfSessionId, 30);
    a.sendIntent({
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("warrior.sever-artery-lite"),
    });
    await until(
      match,
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.statuses.length ?? 0) > 0,
      "a status to appear",
    );
    expect(playerIn(a.getSnapshot(), b.selfSessionId)?.statuses).toContain("bleeding");

    // The bleeding ticks as its bearer's, caused by degeneration, no skill.
    await until(
      match,
      () =>
        heard.some(
          (message) =>
            message.cause === "degeneration" &&
            message.casterSessionId === b.selfSessionId &&
            message.skillId === "",
        ),
      "a bleeding tick",
    );
  });

  it("broadcasts combat events so clients can show floating numbers", async () => {
    const { match, a, b } = await joinPair();
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);
    const heard = combatMessages(a);

    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    const damaging = (): CombatMessage | undefined =>
      heard.find((entry) => entry.events.some((event) => event.kind === "damage"));
    await until(match, () => damaging() !== undefined, "a combat event");

    const message = damaging();
    expect(message?.cause).toBe("skill");
    expect(message?.skillId).toBe("elementalist.fireball");
  });

  it("sends at most one combat message a tick, as a batch of entries (#288)", async () => {
    const { match, a, b } = await joinPair();
    // A bystander that hears what the host broadcasts, raw, and which tick
    // it came after: the snapshot goes out before the tick's combat.
    const spy = match.network.join();
    let tick = -1;
    const sent: { tick: number; message: unknown }[] = [];
    spy.on("snapshot", (data) => {
      tick = parseWireSnapshot(data)?.tick ?? tick;
    });
    spy.on("combat", (data) => {
      sent.push({ tick, message: data });
    });

    await closeDistance(match, a, b.selfSessionId, 300);
    for (const [caster, victim] of [
      [a, b],
      [b, a],
    ] as const) {
      caster.sendIntent({ kind: "target", targetSessionId: victim.selfSessionId });
      caster.sendIntent({ kind: "use-skill", slot: FIREBALL });
    }
    await until(
      match,
      () =>
        [a, b].every((connection) => {
          const me = self(connection);
          return me !== undefined && me.health < me.maxHealth;
        }),
      "both fireballs to land",
    );

    expect(sent.length).toBeGreaterThan(0);
    const ticks = sent.map((entry) => entry.tick);
    expect(new Set(ticks).size).toBe(ticks.length);
    for (const { message } of sent) {
      const batch = parseWireCombatBatch(message);
      expect(batch).toBeDefined();
      expect(batch?.length).toBeGreaterThan(0);
      expect(batch?.length).toBeLessThanOrEqual(MAX_WIRE_COMBATS);
    }
  });

  it("splashes a Fireball over a clustered trio: three damage events from one cast", async () => {
    // Teams alternate by join order: a, b, then an idle ally of a and c,
    // then another and d. b, c and d are the enemy trio.
    const match = startMatch();
    const { a, b } = await joinPair(match);
    const others: MatchConnection[] = [];
    for (let i = 0; i < 4; i += 1) {
      others.push((await match.join()).connection);
    }
    const [, c, , d] = others;
    if (c === undefined || d === undefined) {
      throw new Error("no trio");
    }
    await match.step(TICK);
    expect(
      [b, c, d].map((connection) => playerIn(a.getSnapshot(), connection.selfSessionId)?.team),
    ).toEqual([1, 1, 1]);

    // Huddle on b, well inside the 81-unit splash.
    const huddle = playerIn(a.getSnapshot(), b.selfSessionId);
    for (const connection of [c, d]) {
      await walkTo(match, connection, { x: huddle?.x ?? 0, y: huddle?.y ?? 0 }, 45);
    }

    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);
    const heard = combatMessages(a);
    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    const fireball = (): CombatMessage | undefined =>
      heard.find((entry) => entry.skillId === "elementalist.fireball");
    await until(match, () => fireball() !== undefined, "the Fireball");

    const message = fireball();
    const hit = (message?.events ?? []).flatMap((event) =>
      event.kind === "damage" ? [event.targetId] : [],
    );
    expect(new Set(hit)).toEqual(new Set([b.selfSessionId, c.selfSessionId, d.selfSessionId]));
    expect(hit[0]).toBe(b.selfSessionId);
    expect(message?.area?.radius).toBe(81);
  });

  it("rejects a skill-slot index outside the bar rather than crashing", async () => {
    const { match, a, b } = await joinPair();
    const before = self(a)?.energy ?? 0;

    a.sendIntent({ kind: "use-skill", slot: 999 });
    a.sendIntent({ kind: "use-skill", slot: -1 });
    await match.step(0.2);

    // Nothing was cast, nothing was spent, and the match goes on.
    expect(self(a)?.energy).toBeGreaterThanOrEqual(before);
    expect(playerIn(a.getSnapshot(), b.selfSessionId)).toBeDefined();
    expect(match.host.phase).toBe("active");
  });

  it("refuses to cast a damage skill with no target selected", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);

    const before = self(connection)?.energy ?? 0;
    connection.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await match.step(0.3);

    // Energy regenerates, so assert it never *dropped* by the skill cost.
    expect(self(connection)?.energy).toBeGreaterThanOrEqual(before);
    expect(self(connection)?.castingSkillId).toBeUndefined();
  });

  it("regenerates energy over time", async () => {
    // A self-targeted skill, so the energy economy is tested without
    // walking across the arena.
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);
    const full = self(connection)?.energy ?? 0;

    connection.sendIntent({
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.armor-of-earth"),
    });
    await until(match, () => (self(connection)?.energy ?? full) < full, "energy spent");

    const spent = self(connection)?.energy ?? 0;
    await until(match, () => (self(connection)?.energy ?? 0) > spent, "energy to regenerate");
    expect(self(connection)?.energy).toBeGreaterThan(spent);
  });
});

describe("match rules over the network (P2P)", () => {
  it("starts a match active, scoreless, with a running clock", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);

    const snapshot = connection.getSnapshot();
    expect(snapshot.elapsedSeconds).toBeGreaterThan(0);
    expect(snapshot.phase).toBe("active");
    expect(snapshot.scoreTeam0).toBe(0);
    expect(snapshot.scoreTeam1).toBe(0);
    expect(snapshot.winningTeam).toBeUndefined();
  });
});

describe("wireCombat and combatMessage (#288, #375)", () => {
  const entry = (overrides: Partial<CombatLogEntry>): CombatLogEntry => ({
    tick: 7,
    atSeconds: 0.35,
    cause: "weapon",
    sourceId: "a",
    skillId: undefined,
    weaponId: "sword",
    area: undefined,
    events: [{ kind: "damage", targetId: "b", amount: 12, critical: false }],
    ...overrides,
  });

  it("puts two hits in one tick into one message, in log order", () => {
    const batch = wireCombat([entry({ sourceId: "a" }), entry({ sourceId: "c", weaponId: "axe" })]);
    expect(batch.map((e) => [e.casterId, e.weaponId])).toEqual([
      ["a", "sword"],
      ["c", "axe"],
    ]);
    // The host sends a tick's entries together while they fit in one message.
    expect(batch.length).toBeLessThanOrEqual(MAX_WIRE_COMBATS);
  });

  it("leaves out entries with no events, and sends nothing for none at all", () => {
    expect(wireCombat([entry({ events: [] }), entry({ sourceId: "c" })])).toHaveLength(1);
    // The host sends a message per slice of these: none, for none.
    expect(wireCombat([entry({ events: [] })])).toEqual([]);
    expect(wireCombat([])).toEqual([]);
  });

  it("sends a status tick as its bearer's, and a skill with its area", () => {
    const [tick, fireball] = wireCombat([
      entry({
        cause: "degeneration",
        sourceId: "a",
        weaponId: undefined,
        events: [{ kind: "damage", targetId: "b", amount: 2, critical: false }],
      }),
      entry({
        cause: "skill",
        skillId: "elementalist.fireball",
        weaponId: undefined,
        area: { x: 1, y: 2, radius: 81 },
      }),
    ]).map(combatMessage);
    expect(tick).toEqual({
      casterSessionId: "b",
      cause: "degeneration",
      skillId: "",
      weaponId: "",
      events: [{ kind: "damage", targetId: "b", amount: 2, critical: false }],
    });
    expect(fireball?.area).toEqual({ x: 1, y: 2, radius: 81 });
    expect(fireball?.skillId).toBe("elementalist.fireball");
  });

  it("carries a knockdown and how long it lasts, and drops one with no duration (#544)", () => {
    const wire = wireCombat([
      entry({
        cause: "skill",
        skillId: "warrior.backbreaker",
        weaponId: undefined,
        events: [{ kind: "knocked-down", targetId: "b", durationSeconds: 4 }],
      }),
    ]).map((combat) => ({
      sent: combatMessage(combat).events,
      broken: combatMessage({
        ...combat,
        events: combat.events.map((event) => ({ ...event, durationSeconds: null })),
      }).events,
    }));
    expect(wire).toEqual([
      { sent: [{ kind: "knocked-down", targetId: "b", durationSeconds: 4 }], broken: [] },
    ]);
  });

  it("carries a critical hit across, and only on damage (#533)", () => {
    const crit = { kind: "damage", targetId: "b", amount: 31, critical: true } as const;
    const heal = { kind: "heal", targetId: "a", amount: 5 } as const;
    const [wired] = wireCombat([entry({ events: [crit, heal] })]);
    expect(wired?.events.map((event) => event.crit)).toEqual([true, null]);
    expect(wired === undefined ? undefined : combatMessage(wired).events).toEqual([crit, heal]);
  });
});

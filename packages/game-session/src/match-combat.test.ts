import {
  NO_UPGRADES,
  ADRENALINE_PER_STRIKE,
  CHAIN_MARK_SECONDS,
  ANNIHILATION_MATCH_RULES,
  KILL_COUNT_MATCH_RULES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  defaultBuildEquipment,
  type CombatLogEntry,
  type PlayerBuild,
} from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_COMBATS,
  parseAdrenaline,
  parseChainMarks,
  parsePeerHello,
  parseWireCombatBatch,
  parseWireSnapshotPart,
  type AdrenalineMessage,
  type ChainMarksMessage,
  type CastRefusedMessage,
  type PeerHello,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  hello,
  helloAs,
  isStarterBar,
  playerIn,
  self,
  settle,
  startMatch,
  starterBuild,
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

/** The starter build most tests here play (#852): Fireball, and Armor of Earth on yourself. */
const NUKER = "Elementalist/Mesmer";

/** Slot of `skillId` on the starter build named `name`. */
function slotOf(name: string, skillId: string): number {
  const slot = starterBuild(name).skillBar.indexOf(skillId);
  if (slot === -1) {
    throw new Error(`${name} has no ${skillId}`);
  }
  return slot;
}

const FIREBALL = slotOf(NUKER, "elementalist.fireball");

/** A ranger with a bow and nothing but Broad Head Arrow, to daze. */
const ARCHER: PlayerBuild = {
  name: "Archer",
  primaryProfession: "ranger",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "ranger.marksmanship", rank: 12 }],
  skillBar: ["ranger.broad-head-arrow", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("ranger"),
};

/** A hammer warrior with Backbreaker, to knock a foe down (#545). */
const HAMMERER: PlayerBuild = {
  name: "Hammerer",
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "warrior.hammer-mastery", rank: 12 }],
  skillBar: ["warrior.backbreaker", null, null, null, null, null, null, null],
  equipment: {
    ...defaultBuildEquipment("warrior"),
    weaponSets: [
      {
        mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
        offHand: null,
      },
      null,
      null,
      null,
    ],
  },
};

/** A warrior with Healing Signet: a 2 s cast, borne at -40 armor until it ends (#803). */
const SIGNET: PlayerBuild = {
  name: "Signet",
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "warrior.tactics", rank: 12 }],
  skillBar: ["warrior.healing-signet", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("warrior"),
};

/** A mesmer with Power Block (#914), to disable a foe's spell. */
const BLOCKER: PlayerBuild = {
  name: "Blocker",
  primaryProfession: "mesmer",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "mesmer.domination-magic", rank: 12 }],
  skillBar: ["mesmer.power-block", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("mesmer"),
};

/** An assassin with daggers, a lead attack and the off-hand that follows it (#916). */
const DAGGERS: PlayerBuild = {
  name: "Daggers",
  primaryProfession: "assassin",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "assassin.dagger-mastery", rank: 12 }],
  skillBar: ["assassin.jagged-strike", "assassin.fox-fangs", null, null, null, null, null, null],
  equipment: defaultBuildEquipment("assassin"),
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
/** Two players on opposing teams, both `NUKER` unless named otherwise. */
async function joinPair(match: TestMatch = startMatch(), as: { a?: string; b?: string } = {}) {
  const { connection: a, transport: aRoom } = await match.join(helloAs(as.a ?? NUKER));
  const { connection: b } = await match.join(helloAs(as.b ?? NUKER));
  await match.step(TICK);
  return { match, a, b, aRoom };
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

    // No build: one of the starter builds, whole (#852).
    expect(isStarterBar(connection.skillBar.map((skill) => skill?.id ?? null))).toBe(true);
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
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.health ?? 590) < 590,
      "the target to take damage",
    );

    // Both are the Elementalist/Mesmer starter build. Fire Magic 12, the
    // head's minor rune and its headgear (#1140) make 14: 7 + 7 * 14 = 105
    // before mitigation. The target's armor is an elementalist's 60 (a focus
    // adds none), so the curve leaves it at 105. Its health is 500 + 50 (superior Vigor)
    // + 15 + 10 + 3 * 5 (Survivor on chest, legs and the other three) =
    // 590. Spelled out, not derived, so a change to either the curve or
    // the build fails loudly.
    expect(playerIn(a.getSnapshot(), b.selfSessionId)?.maxHealth).toBe(590);
    expect(playerIn(a.getSnapshot(), b.selfSessionId)?.health).toBe(590 - 105);
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
    const { match, a, b } = await joinPair(undefined, { a: "Ranger/Mesmer" });
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Troll Unguent has a 3s cast: long enough to observe mid-cast.
    a.sendIntent({ kind: "use-skill", slot: slotOf("Ranger/Mesmer", "ranger.troll-unguent") });
    await until(match, () => self(a)?.castingSkillId !== undefined, "the cast to start");

    const me = self(a);
    expect(me?.castingSkillId).toBe("ranger.troll-unguent");
    expect(me?.castRemaining).toBeGreaterThan(0);
    expect(me?.castTotal).toBe(3);
  });

  it("doubles a dazed player's spell, and syncs the doubled total for the cast bar", async () => {
    // Broad Head Arrow needs a bow (ADR-0029): A is a ranger.
    const match = startMatch();
    const { connection: a } = await match.join(hello({ build: toJson(ARCHER) }));
    const { connection: b } = await match.join(helloAs("Monk/Elementalist"));
    await match.step(TICK);
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Broad Head Arrow dazes whoever it hits.
    a.sendIntent({ kind: "use-skill", slot: 0 });
    await until(
      match,
      () => self(b)?.statuses.some((status) => status.id === "dazed") ?? false,
      "b dazed",
    );

    // A spell: dazed slows spells only (#524).
    b.sendIntent({
      kind: "use-skill",
      slot: slotOf("Monk/Elementalist", "monk.orison-of-healing"),
    });
    await until(match, () => self(b)?.castingSkillId !== undefined, "b's cast to start");

    const me = self(b);
    expect(me?.castingSkillId).toBe("monk.orison-of-healing");
    expect(me?.castTotal).toBe(2);
    expect(me?.castRemaining).toBeGreaterThan(1);
  });

  it("sends what a caster bears while activating, ending with the cast (#803)", async () => {
    const match = startMatch();
    const { connection: a } = await match.join(hello({ build: toJson(SIGNET) }));
    const { connection: b } = await match.join();
    await match.step(TICK);

    a.sendIntent({ kind: "use-skill", slot: 0 });
    const borne = () =>
      playerIn(b.getSnapshot(), a.selfSessionId)?.statuses.find(
        (status) => status.id === "healing-signet-armor",
      );
    await until(match, () => borne() !== undefined, "the signet's armor, as b sees it");

    const caster = playerIn(b.getSnapshot(), a.selfSessionId);
    expect(borne()?.durationSeconds).toBe(2);
    expect((borne()?.endsAt ?? 0) - b.getSnapshot().elapsedSeconds).toBeCloseTo(
      caster?.castRemaining ?? 0,
      0,
    );
    await until(match, () => borne() === undefined, "the cast to end");
  });

  it("tells the victim of a Power Block its disabled slot's new recharge (#914)", async () => {
    const match = startMatch();
    const { connection: a } = await match.join(hello({ build: toJson(BLOCKER) }));
    const { connection: b } = await match.join(helloAs(NUKER));
    await match.step(TICK);
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);
    await target(match, b, a.selfSessionId);

    // Fireball: a 1 s cast, the nuker's only Fire Magic skill.
    b.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(match, () => self(b)?.castingSkillId === "elementalist.fireball", "b's cast");
    a.sendIntent({ kind: "use-skill", slot: 0 });
    await until(
      match,
      () => b.getRecharges()[FIREBALL]?.total === 10,
      "the disable, as b hears it",
    );

    // Its own 7 s recharge, raised to the disable's 10 s; nothing else waits.
    expect(b.getRecharges()[FIREBALL]?.remaining).toBeGreaterThan(9);
    const armor = slotOf(NUKER, "elementalist.armor-of-earth");
    expect(b.getRecharges()[armor]).toEqual({ remaining: 0, total: 0, spent: false });
  });

  it("sends a knockdown's time left on the victim, and 0 once it rises (#545)", async () => {
    const match = startMatch();
    const { connection: a } = await match.join(hello({ build: toJson(HAMMERER) }));
    const { connection: b } = await match.join();
    await match.step(TICK);
    await closeDistance(match, a, b.selfSessionId, 60);
    await target(match, a, b.selfSessionId);

    // Backbreaker costs 9 strikes: one per hammer blow (#463).
    a.sendIntent({ kind: "attack", targetId: b.selfSessionId });
    await until(match, () => (a.getAdrenaline()[0] ?? 0) >= 9 * 25, "the adrenaline", 40);
    a.sendIntent({ kind: "use-skill", slot: 0 });
    await until(
      match,
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.knockdownRemaining ?? 0) > 0,
      "b knocked down, as a sees it",
    );
    expect(playerIn(a.getSnapshot(), b.selfSessionId)?.knockdownRemaining).toBeLessThanOrEqual(4);
    expect(self(b)?.knockdownRemaining).toBeGreaterThan(0);

    await until(match, () => self(b)?.knockdownRemaining === 0, "b to rise");
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
    // Who shot it, for the client's tint and sprite (#161); no spell (#535).
    expect(shot?.attackerId).toBe(caster.selfSessionId);
    expect(shot?.skillId).toBeUndefined();
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

  it("sends each player only its own adrenaline, once a blow lands, and again when it changes or a blow restarts its loss (#463, #827, #828)", async () => {
    const match = startMatch();
    const { connection: a, transport: ta } = await match.join(helloAs("Warrior/Monk"));
    // b wears the plain warrior kit: through the starter's armor no blow is the 1%
    // of health that charges a unit (#827).
    const lightWarrior = {
      ...starterBuild("Warrior/Monk"),
      equipment: defaultBuildEquipment("warrior"),
    };
    const { connection: b, transport: tb } = await match.join(
      hello({ build: toJson(lightWarrior) }),
    );
    await match.step(TICK);
    const toA: AdrenalineMessage[] = [];
    const toB: AdrenalineMessage[] = [];
    ta.on("adrenaline", (data) => {
      const message = parseAdrenaline(data);
      if (message !== undefined) {
        toA.push(message);
      }
    });
    tb.on("adrenaline", (data) => {
      const message = parseAdrenaline(data);
      if (message !== undefined) {
        toB.push(message);
      }
    });
    await closeDistance(match, a, b.selfSessionId, 30);
    await target(match, a, b.selfSessionId);

    const severArtery = slotOf("Warrior/Monk", "warrior.sever-artery");
    a.sendIntent({ kind: "attack", targetId: b.selfSessionId });
    await until(match, () => toA.length > 0, "a's adrenaline");
    expect(toA[0]?.slots[severArtery]).toBe(ADRENALINE_PER_STRIKE);
    expect(toA[0]?.lossInSeconds).toBeCloseTo(
      MINIMAL_GW_INSPIRED_PVP_V1.resources.adrenalineLossSeconds,
    );
    expect(a.getAdrenaline()[severArtery]).toBe(ADRENALINE_PER_STRIKE);

    // A message a blow until Sever Artery holds its 4 strikes...
    await until(
      match,
      () => a.getAdrenaline()[severArtery] === 4 * ADRENALINE_PER_STRIKE,
      "Sever Artery charged",
    );
    expect(toA).toHaveLength(4);
    // ...then more blows change no slot, and only start the loss again.
    await match.step(4);
    expect(toA.length).toBeGreaterThan(4);
    expect(toA.at(-1)?.slots).toEqual(toA[3]?.slots);
    expect(toA.at(-1)?.lossInSeconds).toBeCloseTo(
      MINIMAL_GW_INSPIRED_PVP_V1.resources.adrenalineLossSeconds,
    );
    // The client counts it down from the message, as a recharge.
    expect(a.getAdrenalineLossIn()).toBeGreaterThan(20);
    // b is sent its own: what the blows it took charged (#827), never a's.
    expect(toB.length).toBeGreaterThan(0);
    expect(toB.at(-1)?.slots).toEqual(b.getAdrenaline());
    expect(b.getAdrenaline()[severArtery]).toBeLessThan(4 * ADRENALINE_PER_STRIKE);
  });

  it("sends each player only the chain marks it placed: a lead, then an off-hand, gone with its target (#916)", async () => {
    const match = startMatch();
    const { connection: a, transport: ta } = await match.join(hello({ build: toJson(DAGGERS) }));
    const { connection: b, transport: tb } = await match.join();
    await match.step(TICK);
    const toA: ChainMarksMessage[] = [];
    const toB: ChainMarksMessage[] = [];
    ta.on("chain", (data) => {
      const message = parseChainMarks(data);
      if (message !== undefined) {
        toA.push(message);
      }
    });
    tb.on("chain", (data) => {
      const message = parseChainMarks(data);
      if (message !== undefined) {
        toB.push(message);
      }
    });
    const foe = b.selfSessionId;
    await closeDistance(match, a, foe, 30);
    await target(match, a, foe);
    expect(a.getChainMark(foe)).toBeUndefined();

    // Jagged Strike lands: a lead mark of a's on b, for the full time.
    a.sendIntent({ kind: "use-skill", slot: 0 });
    await until(match, () => a.getChainMark(foe) === "lead", "a's lead mark");
    expect(toA.at(-1)?.marks).toEqual([
      { targetId: foe, role: "lead", remainingSeconds: expect.closeTo(CHAIN_MARK_SECONDS, 1) },
    ]);
    // Fox Fangs follows it: the mark turns off-hand.
    await until(match, () => self(a)?.castingSkillId === undefined, "Jagged Strike done");
    a.sendIntent({ kind: "use-skill", slot: 1 });
    await until(match, () => a.getChainMark(foe) === "off-hand", "a's off-hand mark");
    expect(toA.at(-1)?.marks.map((mark) => mark.role)).toEqual(["off-hand"]);
    // b bears it, and is never told: the mark is a's alone.
    expect(toB).toEqual([]);
    expect(b.getChainMark(a.selfSessionId)).toBeUndefined();

    // Chained until b dies, so a mark is on it when it does...
    a.sendIntent({ kind: "attack", targetId: foe });
    await until(
      match,
      () => {
        if (self(a)?.castingSkillId === undefined) {
          a.sendIntent({ kind: "use-skill", slot: a.getChainMark(foe) === "lead" ? 1 : 0 });
        }
        return self(b)?.dead === true;
      },
      "b dead",
      120,
    );
    // ...and it goes with b, and a is told at once, not left to run out.
    await match.step(TICK);
    expect(toA.at(-2)?.marks).toHaveLength(1);
    expect(toA.at(-1)?.marks).toEqual([]);
    expect(a.getChainMark(foe)).toBeUndefined();
  });

  it("syncs applied statuses so the client can show condition markers, and ticks them as degeneration", async () => {
    const { match, a, b } = await joinPair(undefined, { a: "Warrior/Monk" });
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);

    // Sever Artery costs 4 strikes of adrenaline, one per landed attack:
    // so swing four times first. The adrenaline economy working as designed.
    const heard = combatMessages(a);
    a.sendIntent({ kind: "attack", targetId: b.selfSessionId });
    const severArtery = slotOf("Warrior/Monk", "warrior.sever-artery");
    await until(
      match,
      () => (a.getAdrenaline()[severArtery] ?? 0) >= 4 * ADRENALINE_PER_STRIKE,
      "adrenaline from landing four hits",
    );

    await closeDistance(match, a, b.selfSessionId, 30);
    a.sendIntent({
      kind: "use-skill",
      slot: severArtery,
    });
    await until(
      match,
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.statuses.length ?? 0) > 0,
      "a status to appear",
    );
    expect(
      playerIn(a.getSnapshot(), b.selfSessionId)?.statuses.map((status) => status.id),
    ).toContain("bleeding");

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
    const { match, a, b, aRoom } = await joinPair();
    // What the host sends a player, raw, and which tick it came after: the
    // snapshot goes out before the tick's combat.
    const spy = aRoom;
    let tick = -1;
    const sent: { tick: number; message: unknown }[] = [];
    spy.on("snapshot", (data) => {
      tick = parseWireSnapshotPart(data)?.tick ?? tick;
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
    const { connection } = await match.join(helloAs(NUKER));
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
    const { connection } = await match.join(helloAs(NUKER));
    await match.step(TICK);
    const full = self(connection)?.energy ?? 0;

    connection.sendIntent({
      kind: "use-skill",
      slot: slotOf(NUKER, "elementalist.armor-of-earth"),
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

  it("counts a kill-count team's kills in the snapshot score (#1200)", async () => {
    const match = startMatch({ matchRules: KILL_COUNT_MATCH_RULES });
    const { connection: a } = await match.join(hello({ build: toJson(DAGGERS) }));
    const { connection: b } = await match.join();
    await match.step(TICK);
    const foe = b.selfSessionId;
    await closeDistance(match, a, foe, 30);
    await target(match, a, foe);

    a.sendIntent({ kind: "attack", targetId: foe });
    await until(
      match,
      () => {
        if (self(a)?.castingSkillId === undefined) {
          a.sendIntent({ kind: "use-skill", slot: a.getChainMark(foe) === "lead" ? 1 : 0 });
        }
        return self(b)?.dead === true;
      },
      "b dead",
      120,
    );

    expect([self(a)?.team, self(b)?.team]).toEqual([0, 1]);
    expect(a.getSnapshot()).toMatchObject({ scoreTeam0: 1, scoreTeam1: 0 });
    expect(b.getSnapshot()).toMatchObject({ scoreTeam0: 1, scoreTeam1: 0 });
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
    attributeId: undefined,
    area: undefined,
    doubleStrike: false,
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
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "damage", targetId: "b", amount: 2, critical: false }],
    });
    expect(fireball?.area).toEqual({ x: 1, y: 2, radius: 81 });
    expect(fireball?.skillId).toBe("elementalist.fireball");
  });

  it("carries a double strike over the wire, and a single one as such (#561)", () => {
    const sent = wireCombat([
      entry({ weaponId: "daggers", doubleStrike: true }),
      entry({ weaponId: "daggers" }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify(sent)));
    expect(received?.map(combatMessage).map((message) => message.doubleStrike)).toEqual([
      true,
      false,
    ]);
  });

  it("carries a spread and whom it was caught from, and drops one with no carrier (#765)", () => {
    const spread = {
      kind: "status-spread",
      targetId: "b",
      fromId: "c",
      statusId: "disease",
    } as const;
    const [combat] = wireCombat([
      entry({ cause: "degeneration", sourceId: "a", weaponId: undefined, events: [spread] }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify([combat])));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([[spread]]);
    expect(
      combat &&
        combatMessage({
          ...combat,
          events: combat.events.map((event) => ({ ...event, fromId: null })),
        }).events,
    ).toEqual([]);
  });

  it("carries health a status took and which status, and drops an unknown one (#800)", () => {
    const lost = {
      kind: "health-lost",
      targetId: "b",
      amount: 100,
      statusId: "deep-wound",
    } as const;
    const [combat] = wireCombat([
      entry({ cause: "skill", skillId: "warrior.swift-chop", weaponId: undefined, events: [lost] }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify([combat])));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([[lost]]);
    expect(
      combat &&
        combatMessage({
          ...combat,
          events: combat.events.map((event) => ({ ...event, statusId: "no-such-status" })),
        }).events,
    ).toEqual([]);
  });

  it("carries the skill a picky interrupt refused, and null for an idle target (#796)", () => {
    const refused = {
      kind: "interrupt-missed",
      targetId: "b",
      refusedSkillId: "ranger.barrage",
    } as const;
    const idle = { kind: "interrupt-missed", targetId: "c", refusedSkillId: null } as const;
    const sent = wireCombat([
      entry({
        cause: "skill",
        skillId: "mesmer.power-spike",
        weaponId: undefined,
        events: [refused, idle],
      }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify(sent)));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([
      [refused, idle],
    ]);
  });

  it("carries the skill a disable held back and for how long (#914)", () => {
    const disabled = {
      kind: "skill-disabled",
      targetId: "b",
      skillId: "elementalist.fireball",
      seconds: 10,
    } as const;
    const sent = wireCombat([
      entry({
        cause: "skill",
        skillId: "mesmer.power-block",
        weaponId: undefined,
        events: [disabled],
      }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify(sent)));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([[disabled]]);
  });

  it("carries the energy a foe lost and what the caster gained for it (#793)", () => {
    const events = [
      { kind: "energy-loss", targetId: "b", amount: 6 },
      { kind: "energy-gain", targetId: "a", amount: 12 },
    ] as const;
    const sent = wireCombat([
      entry({
        cause: "skill",
        skillId: "mesmer.energy-tap",
        weaponId: undefined,
        events: [...events],
      }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify(sent)));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([events]);
  });

  it("carries a target's health loss, apart from a sacrifice (#1678)", () => {
    const events = [{ kind: "health-loss", targetId: "b", amount: 53 }] as const;
    const sent = wireCombat([
      entry({
        cause: "skill",
        skillId: "necromancer.enfeebling-touch",
        weaponId: undefined,
        events: [...events],
      }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify(sent)));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([events]);
  });

  it("carries a resurrection and the shares it brought back (#812)", () => {
    const back = {
      kind: "resurrected",
      targetId: "b",
      healthFraction: 0.56,
      energyFraction: 0.8,
    } as const;
    const [combat] = wireCombat([
      entry({ cause: "skill", skillId: "monk.restore-life", weaponId: undefined, events: [back] }),
    ]);
    const received = parseWireCombatBatch(JSON.parse(JSON.stringify([combat])));
    expect(received?.map(combatMessage).map((message) => message.events)).toEqual([[back]]);
    expect(
      combat &&
        combatMessage({
          ...combat,
          events: combat.events.map((event) => ({ ...event, energy: null })),
        }).events,
    ).toEqual([]);
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

  it("carries a shadow step and where it went, and drops one with nowhere (#988)", () => {
    const wire = wireCombat([
      entry({
        cause: "skill",
        skillId: "assassin.deaths-charge",
        weaponId: undefined,
        events: [{ kind: "shadow-stepped", targetId: "a", toId: "b" }],
      }),
    ]).map((combat) => ({
      sent: combatMessage(combat).events,
      broken: combatMessage({
        ...combat,
        events: combat.events.map((event) => ({ ...event, fromId: null })),
      }).events,
    }));
    expect(wire).toEqual([
      { sent: [{ kind: "shadow-stepped", targetId: "a", toId: "b" }], broken: [] },
    ]);
  });

  it("carries a teleport and whom it went beside, and drops one with nowhere (#474)", () => {
    const wire = wireCombat([
      entry({
        cause: "skill",
        skillId: "monk.rebirth",
        weaponId: undefined,
        events: [{ kind: "teleported", targetId: "a", toId: "b" }],
      }),
    ]).map((combat) => ({
      sent: combatMessage(combat).events,
      broken: combatMessage({
        ...combat,
        events: combat.events.map((event) => ({ ...event, fromId: null })),
      }).events,
    }));
    expect(wire).toEqual([
      { sent: [{ kind: "teleported", targetId: "a", toId: "b" }], broken: [] },
    ]);
  });

  it("carries a blocked attack across (#534)", () => {
    const blocked = { kind: "attack-blocked", targetId: "b" } as const;
    const [wired] = wireCombat([entry({ events: [blocked] })]);
    expect(wired === undefined ? undefined : combatMessage(wired).events).toEqual([blocked]);
  });

  it("carries an out-of-sequence miss across, apart from a blind one (#831)", () => {
    const outOfSequence = {
      kind: "attack-missed",
      targetId: "b",
      reason: "out-of-sequence",
    } as const;
    const blind = { kind: "attack-missed", targetId: "b" } as const;
    const [wired] = wireCombat([entry({ events: [outOfSequence, blind] })]);
    expect(wired === undefined ? undefined : combatMessage(wired).events).toEqual([
      outOfSequence,
      blind,
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

describe("the match summary (#1057)", () => {
  /** `connection`'s summary line for `id`. */
  const line = (connection: MatchConnection, id: string) =>
    connection.getSnapshot().summary?.find((row) => row.id === id);

  /** A hello named `name` that brings the nuker's build. */
  function nuker(name: string): PeerHello {
    return hello({ name, build: toJson(starterBuild(NUKER)) });
  }

  /** `a` closes on `b` and lands one Fireball: 105 after armor (see above). */
  async function fireball(match: TestMatch, a: MatchConnection, b: MatchConnection) {
    await closeDistance(match, a, b.selfSessionId, 300);
    await target(match, a, b.selfSessionId);
    a.sendIntent({ kind: "use-skill", slot: FIREBALL });
    await until(
      match,
      () => (playerIn(a.getSnapshot(), b.selfSessionId)?.health ?? 590) < 590,
      "the target to take damage",
    );
  }

  it("ends with every seat's line, one who left included, in seat order", async () => {
    const match = startMatch({ matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 30 } });
    const { connection: a } = await match.join(nuker("Ann"));
    const { connection: b } = await match.join(nuker("Bob"));
    const { connection: c } = await match.join(nuker("Cat"));
    await match.step(TICK);
    await c.disconnect();
    expect(a.getSnapshot().summary).toBeUndefined();

    await fireball(match, a, b);
    await until(match, () => a.getSnapshot().phase === "finished", "the end", 40);

    expect(a.getSnapshot().summary?.map(({ name, team }) => [name, team])).toEqual([
      ["Ann", 0],
      ["Bob", 1],
      ["Cat", 0],
    ]);
    expect(line(a, a.selfSessionId)).toMatchObject({ damage: 105, taken: 0, kills: 0, deaths: 0 });
    expect(line(a, b.selfSessionId)).toMatchObject({ damage: 0, taken: 105, deaths: 0 });
    expect(line(a, c.selfSessionId)).toMatchObject({ damage: 0, taken: 0, interrupts: 0 });
    // Everyone is told the same.
    expect(b.getSnapshot().summary).toEqual(a.getSnapshot().summary);
  });

  it("keeps at most a lobby's worth of lines, the seats still held among them", async () => {
    // Kill-count: a bye that empties a team is no wipe, so the match runs on.
    const match = startMatch({ matchRules: KILL_COUNT_MATCH_RULES, maxPlayers: 2 });
    const { connection: a } = await match.join(hello({ name: "Ann" }));
    // More distinct seats than `ended` carries: each comes, and says bye.
    for (let i = 0; i < MAX_LOBBY_PLAYERS + 4; i += 1) {
      const guest = match.network.join();
      await settle();
      guest.send("hello", hello({ name: `Guest${String(i)}` }), "host");
      await settle();
      guest.send("bye", {}, "host");
      await guest.leave();
      await match.step(TICK);
    }
    await match.join(hello({ name: "Bob" }));

    await match.host.close("host-left");
    await settle();

    const names = a.getSnapshot().summary?.map(({ name }) => name);
    expect(names).toHaveLength(MAX_LOBBY_PLAYERS);
    expect(names?.[0]).toBe("Ann");
    expect(names?.at(-1)).toBe("Bob");
    // The earliest who left went first.
    expect(names).not.toContain("Guest0");
    expect(names).toContain(`Guest${String(MAX_LOBBY_PLAYERS + 3)}`);
  });

  it("carries the summary so far when the host leaves", async () => {
    const { match, a, b } = await joinPair();
    await fireball(match, a, b);

    await match.host.close("host-left");
    await settle();

    expect(line(b, a.selfSessionId)?.damage).toBe(105);
    expect(line(b, b.selfSessionId)?.taken).toBe(105);
  });
});

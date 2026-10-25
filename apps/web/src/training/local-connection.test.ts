import { describe, expect, it } from "vitest";

import { getTrainingScenario } from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";

import type { CombatMessage } from "../net/match-connection.js";
import { setProfessions, setRank, setSkill, newCharacter } from "../ui/build-editor.js";
import {
  MAX_CATCHUP_SECONDS,
  TICK_SECONDS,
  NO_PROFESSIONS,
  createLocalConnection,
  drainAccumulator,
  skillSlotsFor,
} from "./local-connection.js";
import { SELF_ID, playerArming, setupScenario } from "./scenario-setup.js";

describe("drainAccumulator", () => {
  it("runs whole ticks and carries the rest", () => {
    expect(drainAccumulator(0, TICK_SECONDS * 2.5).ticks).toBe(2);
    const { remainder } = drainAccumulator(0, TICK_SECONDS * 2.5);
    expect(remainder).toBeCloseTo(TICK_SECONDS * 0.5);
    expect(drainAccumulator(remainder, TICK_SECONDS * 0.5).ticks).toBe(1);
  });

  it("a frame shorter than a tick runs none, and keeps it", () => {
    const { ticks, remainder } = drainAccumulator(0, TICK_SECONDS / 3);
    expect(ticks).toBe(0);
    expect(remainder).toBeCloseTo(TICK_SECONDS / 3);
  });

  it("clamps a 10 s delta, as a backgrounded tab sends, to at most 6 ticks", () => {
    const { ticks, remainder } = drainAccumulator(0, 10);
    expect(ticks).toBeLessThanOrEqual(6);
    expect(ticks).toBeGreaterThan(0);
    expect(remainder).toBeLessThan(TICK_SECONDS);
    expect(MAX_CATCHUP_SECONDS).toBe(0.25);
  });

  it("ignores a negative delta", () => {
    expect(drainAccumulator(0, -1)).toEqual({ ticks: 0, remainder: 0 });
  });
});

function pyro() {
  let character = setProfessions(newCharacter("c1"), "elementalist", undefined);
  character = setRank(character, "elementalist.fire-magic", 9);
  return setSkill(character, 0, "elementalist.fireball");
}

function targetDummy() {
  const scenario = getTrainingScenario("target-dummy");
  if (scenario === undefined) {
    throw new Error("the target-dummy scenario is gone");
  }
  const setup = setupScenario(scenario, pyro());
  return {
    setup,
    connection: createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf: (id) => (id === SELF_ID ? "Tester" : (setup.names.get(id) ?? id)),
      professionsOf: (id) =>
        id === SELF_ID ? { primary: "elementalist", secondary: undefined } : NO_PROFESSIONS,
    }),
  };
}

describe("createLocalConnection", () => {
  it("is a MatchConnection over the simulation: snapshot, bar and map", () => {
    const { connection } = targetDummy();
    const snapshot = connection.getSnapshot();
    expect(snapshot.selfSessionId).toBe(SELF_ID);
    expect(snapshot.players.map((p) => p.sessionId).sort()).toEqual(["dummy", SELF_ID].sort());
    // Every slot in its place, the empty ones null (#347).
    expect(connection.skillBar.map((slot) => slot?.id ?? null)).toEqual([
      "elementalist.fireball",
      ...Array.from({ length: 7 }, () => null),
    ]);
    expect(connection.map.id).toBe("training-hall");
  });

  it("casts on a use-skill intent, and reports the hit through onCombat and onStep", () => {
    const { connection } = targetDummy();
    const combat: string[] = [];
    const areas: CombatMessage["area"][] = [];
    let steps = 0;
    connection.onCombat((message) => {
      combat.push(...message.events.map((event) => event.kind));
      // The Fireball also turns the player on the dummy with their weapon.
      if (message.cause === "skill") {
        areas.push(message.area);
      }
    });
    connection.onStep(() => {
      steps += 1;
    });

    // No target: Fireball picks the nearest enemy itself (#9).
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    for (let i = 0; i < 80; i += 1) {
      connection.advance(TICK_SECONDS);
    }

    expect(steps).toBe(80);
    expect(combat).toContain("damage");
    const dummy = connection.getSnapshot().players.find((p) => p.sessionId === "dummy");
    expect(dummy?.health).toBeLessThan(dummy?.maxHealth ?? 0);
    // Fireball splashes, so the hit carries where it landed, as the
    // server's does: without it training would draw no flash.
    expect(areas).toEqual([{ x: dummy?.x, y: dummy?.y, radius: 81 }]);
  });

  it("reports a swing as its attacker's, caused by the weapon, with no skill", () => {
    const { connection } = targetDummy();
    const swings: CombatMessage[] = [];
    connection.onCombat((message) => {
      if (message.cause === "weapon") {
        swings.push(message);
      }
    });
    connection.sendIntent({ kind: "attack", targetId: "dummy" });
    const self = () => connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    expect(self()?.attackTargetSessionId).toBe("dummy");
    for (let i = 0; i < 400 && swings.length === 0; i += 1) {
      connection.advance(TICK_SECONDS);
    }
    expect(swings[0]?.casterSessionId).toBe(SELF_ID);
    expect(swings[0]?.skillId).toBe("");
    expect(swings[0]?.events[0]?.targetId).toBe("dummy");

    connection.sendIntent({ kind: "cancel" });
    expect(self()?.attackTargetSessionId).toBeUndefined();
  });

  it("says why an attack was refused, as the server does", () => {
    const { connection } = targetDummy();
    const refusals: CastRefusedMessage[] = [];
    connection.onCastRefused((message) => refusals.push(message));
    connection.sendIntent({ kind: "attack", targetId: SELF_ID });
    expect(refusals).toEqual([{ kind: "attack", reason: "invalid-target-self" }]);
  });

  it("reports a cast's real total, as the server does, so the bar fills over it", () => {
    const { connection } = targetDummy();
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    connection.advance(TICK_SECONDS);
    const self = connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    expect(self?.castingSkillId).toBe("elementalist.fireball");
    expect(self?.castTotal).toBe(connection.skillBar[0]?.activationSeconds);
    expect(self?.castRemaining).toBeLessThan(self?.castTotal ?? 0);
  });

  it("says why a cast was refused", () => {
    const { connection } = targetDummy();
    const reasons: string[] = [];
    connection.onCastRefused((message) => {
      reasons.push(message.reason);
    });
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    expect(reasons).toEqual(["already-casting"]);
  });

  it("moves on a move intent and stops on stop", () => {
    const { connection } = targetDummy();
    const start = connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    connection.sendIntent({ kind: "move", dirX: 0, dirY: 1 });
    connection.advance(TICK_SECONDS * 4);
    connection.sendIntent({ kind: "stop" });
    const moved = connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    connection.advance(TICK_SECONDS * 4);
    const stopped = connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    expect(moved?.y).toBeGreaterThan(start?.y ?? 0);
    expect(stopped?.y).toBe(moved?.y);
  });

  it("rearm swaps the bar in place", () => {
    const { connection } = targetDummy();
    const arming = playerArming(setSkill(pyro(), 1, "elementalist.armor-of-earth"));
    connection.rearm(arming.loadout, arming.skillBar);
    expect(connection.skillBar.slice(0, 3).map((slot) => slot?.name ?? null)).toEqual([
      "Fireball",
      "Armor of Earth",
      null,
    ]);
  });

  it("does nothing once disconnected", async () => {
    const { connection } = targetDummy();
    let steps = 0;
    connection.onStep(() => {
      steps += 1;
    });
    await connection.disconnect();
    connection.advance(1);
    expect(steps).toBe(0);
  });
});

describe("skillSlotsFor", () => {
  it("describes each skill as the server's join message does", () => {
    expect(skillSlotsFor(["elementalist.fireball"])).toEqual([
      {
        id: "elementalist.fireball",
        name: "Fireball",
        energyCost: 10,
        adrenalineCost: 0,
        activationSeconds: 1,
        rechargeSeconds: 7,
      },
    ]);
  });
});

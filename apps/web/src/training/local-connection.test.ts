import { describe, expect, it } from "vitest";

import { NO_RANKS, getTrainingScenario } from "@vibewars/game-core";
import type { CastRefusedMessage, WireCape } from "@vibewars/game-protocol";
import { NO_GUILD, type CombatMessage } from "@vibewars/game-session";

import { AttackClock } from "../render/attack-clock.js";
import { setProfessions, setRank, setSkill, newCharacter } from "../ui/build-editor.js";
import { setWeapon } from "../ui/gear-editor.js";
import { slotAffordable } from "../ui/skill-slot-state.js";
import { TICK_SECONDS, NO_PROFESSIONS, createLocalConnection } from "./local-connection.js";
import { SELF_ID, playerArming, setupScenario } from "./scenario-setup.js";

function pyro() {
  let character = setProfessions(newCharacter("c1"), "elementalist", undefined);
  character = setRank(character, "elementalist.fire-magic", 9);
  return setSkill(character, 0, "elementalist.fireball");
}

const CAPE: WireCape = { main: "violet", trim: "white", emblem: "diamond" };

function targetDummy(character = pyro()) {
  const scenario = getTrainingScenario("target-dummy");
  if (scenario === undefined) {
    throw new Error("the target-dummy scenario is gone");
  }
  const setup = setupScenario(scenario, character);
  return {
    setup,
    connection: createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf: (id) => (id === SELF_ID ? "Tester" : (setup.names.get(id) ?? id)),
      guildOf: (id) => (id === SELF_ID ? { guildTag: "VIBE", guildCape: CAPE } : NO_GUILD),
      professionsOf: (id) =>
        id === SELF_ID ? { primary: "elementalist", secondary: undefined } : NO_PROFESSIONS,
    }),
  };
}

describe("createLocalConnection", () => {
  it("tags your own body with your guild tag and cape, and no dummy (#1406, #1422)", () => {
    const { connection } = targetDummy();
    const players = connection.getSnapshot().players;
    const self = players.find((player) => player.sessionId === SELF_ID);
    expect(self?.guildTag).toBe("VIBE");
    expect(self?.guildCape).toEqual(CAPE);
    const others = players.filter((player) => player.sessionId !== SELF_ID);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((player) => player.guildTag === undefined)).toBe(true);
    expect(others.every((player) => player.guildCape === undefined)).toBe(true);
  });

  it("gives each status its end on the match clock, its length and its caster (#803)", () => {
    const { setup, connection } = targetDummy();
    setup.simulation.get(SELF_ID)?.combatant.statuses.apply("bleeding", 8, "dummy", NO_RANKS);
    for (let i = 0; i < 10; i += 1) {
      connection.advance(TICK_SECONDS);
    }

    const snapshot = connection.getSnapshot();
    const remaining = setup.simulation.get(SELF_ID)?.combatant.statuses.get("bleeding");
    const [shown] = snapshot.players.find((p) => p.sessionId === SELF_ID)?.statuses ?? [];
    expect(shown).toMatchObject({ id: "bleeding", durationSeconds: 8, casterId: "dummy" });
    // To 0.1 s: on 20 Hz ticks, the rounding is off by 0 or exactly 0.05.
    const left = (shown?.endsAt ?? 0) - snapshot.elapsedSeconds;
    expect(Math.abs(left - (remaining?.remainingSeconds ?? 0))).toBeLessThan(0.051);
  });

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
      // The Fireball also turns the player on the dummy with their weapon;
      // its release carries only its use (#1735), its landing the hit.
      if (message.cause === "skill" && message.events.some(({ kind }) => kind === "damage")) {
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

  it("plays each sword swing's strike to its end on the tick the host lands it, the first included (#560)", () => {
    // A warrior, whose house weapon is a sword: a melee hit lands the tick its swing ends.
    const { connection } = targetDummy(setSkill(newCharacter("c1"), 0, "warrior.sprint"));
    let swings = 0;
    connection.onCombat((message) => {
      if (message.cause === "weapon") {
        swings += 1;
      }
    });
    connection.sendIntent({ kind: "attack", targetId: "dummy" });
    const clock = new AttackClock();
    const phases: string[] = [];
    let hits = 0;
    for (let i = 0; i < 400 && hits < 3; i += 1) {
      const before = swings;
      connection.advance(TICK_SECONDS);
      const snapshot = connection.getSnapshot();
      const self = snapshot.players.find((player) => player.sessionId === SELF_ID);
      clock.observe(
        snapshot.elapsedSeconds,
        self?.swingElapsed ?? 0,
        self?.swingTotal ?? 0,
        "sword",
      );
      const frame = clock.frame(snapshot.elapsedSeconds, "sword");
      if (swings > before) {
        hits += 1;
        // The tick before was the strike, and now it has landed.
        expect(phases.at(-1), `hit ${String(hits)}`).toBe("strike");
        expect(["hold", "recover"]).toContain(frame.clip.phase);
        expect("sinceHit" in frame.clip ? frame.clip.sinceHit : Infinity).toBeLessThan(
          TICK_SECONDS,
        );
        expect(frame.hit).toBe(hits);
        // The first swing wound up like every other.
        expect(phases).toContain("wind-up");
        phases.length = 0;
      } else {
        phases.push(frame.clip.phase);
      }
    }
    expect(hits).toBe(3);
  });

  it("reports a walk to a clicked point until cancel ends it (#342)", () => {
    const { connection } = targetDummy();
    const self = () => connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    expect(self()?.walking).toBe(false);
    connection.sendIntent({ kind: "walk-to", x: 40, y: 40 });
    expect(self()?.walking).toBe(true);
    connection.advance(TICK_SECONDS);
    expect(self()?.walking).toBe(true);
    connection.sendIntent({ kind: "cancel" });
    expect(self()?.walking).toBe(false);
  });

  it("reports a spell walking in as walking, so Esc drops it unpaid (#499)", () => {
    const { setup, connection } = targetDummy();
    const me = setup.simulation.get(SELF_ID);
    const dummy = setup.simulation.get("dummy");
    if (me === undefined || dummy === undefined) {
      throw new Error("the target-dummy scenario lost a participant");
    }
    const self = () => connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    // Opposite corners of the hall, past Fireball range.
    me.position = { x: 20, y: 20 };
    dummy.position = { x: 540, y: 400 };
    const combat: string[] = [];
    connection.onCombat((message) => combat.push(message.cause));

    connection.sendIntent({ kind: "target", targetSessionId: "dummy" });
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    connection.advance(TICK_SECONDS);
    expect(self()?.walking).toBe(true);
    connection.sendIntent({ kind: "cancel" });
    expect(self()?.walking).toBe(false);
    for (let i = 0; i < 200; i += 1) {
      connection.advance(TICK_SECONDS);
    }

    expect(combat).not.toContain("skill");
    expect(self()?.energy).toBe(self()?.maxEnergy);
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
    for (let i = 0; i < 60; i += 1) {
      connection.advance(TICK_SECONDS);
    }
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    expect(reasons).toEqual(["still-recharging"]);
  });

  it("names the slot pressed during a cast as queued, until it goes (#1722)", () => {
    const { connection } = targetDummy(setSkill(pyro(), 1, "elementalist.armor-of-earth"));
    connection.sendIntent({ kind: "use-skill", slot: 0 });
    connection.advance(TICK_SECONDS);
    expect(connection.getQueuedSlot()).toBeUndefined();
    connection.sendIntent({ kind: "use-skill", slot: 1 });
    expect(connection.getQueuedSlot()).toBe(1);
    for (let i = 0; i < 80; i += 1) {
      connection.advance(TICK_SECONDS);
    }
    expect(connection.getQueuedSlot()).toBeUndefined();
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

  it("swaps weapon sets on the intent, and weaponSets follows, a rearm included (#489)", () => {
    const { connection } = targetDummy(setWeapon(pyro(), 1, "recurve-bow"));
    const weapon = (): string | undefined =>
      connection.getSnapshot().players.find((player) => player.sessionId === SELF_ID)?.weaponId;
    expect(connection.weaponSets).toMatchObject({ active: 0, pending: null });
    expect(connection.weaponSets?.sets[1]).toEqual({ weaponId: "recurve-bow", offhandId: null });

    connection.sendIntent({ kind: "weapon-set", set: 1 });
    expect(connection.weaponSets?.active).toBe(1);
    expect(weapon()).toBe("recurve-bow");

    // An empty set: nothing happens, and nothing is said.
    let refused = 0;
    connection.onCastRefused(() => {
      refused += 1;
    });
    connection.sendIntent({ kind: "weapon-set", set: 2 });
    expect(connection.weaponSets?.active).toBe(1);
    expect(refused).toBe(0);

    const arming = playerArming(pyro());
    connection.rearm(arming.loadout, arming.skillBar);
    expect(connection.weaponSets).toMatchObject({ active: 0, pending: null });
    expect(connection.weaponSets?.sets[1]).toBeNull();
  });

  it("describes the bar at the ranks it plays, rearmed or not (#485)", () => {
    const { connection } = targetDummy();
    expect(connection.ranks.get("elementalist.fire-magic")).toBe(9);
    const arming = playerArming(setRank(pyro(), "elementalist.fire-magic", 11));
    connection.rearm(arming.loadout, arming.skillBar);
    expect(connection.ranks.get("elementalist.fire-magic")).toBe(11);
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

describe("the bar a Ranger with Expertise sees (#528)", () => {
  it("shows Broad Head Arrow at the 5 energy it costs, so 5 energy is enough", () => {
    let character = setProfessions(newCharacter("c1"), "ranger", undefined);
    character = setRank(character, "ranger.expertise", 12);
    character = setSkill(character, 0, "ranger.broad-head-arrow");
    const scenario = getTrainingScenario("target-dummy");
    if (scenario === undefined) {
      throw new Error("the target-dummy scenario is gone");
    }
    const setup = setupScenario(scenario, character);
    const connection = createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf: (id) => id,
      guildOf: () => NO_GUILD,
      professionsOf: () => NO_PROFESSIONS,
    });
    const slot = connection.skillBar[0];
    expect(slot?.id).toBe("ranger.broad-head-arrow");
    expect(slot?.energyCost).toBe(5);
  });
});

describe("the bar with Glyph of Lesser Energy up (#637)", () => {
  it("costs Fireball what the glyph leaves, so 3 energy lights it, then the full 10 again", () => {
    let character = pyro();
    character = setRank(character, "elementalist.energy-storage", 9);
    character = setSkill(character, 1, "elementalist.glyph-of-lesser-energy");
    const { connection } = targetDummy(character);
    const fireball = () => connection.skillBar[0];
    // A tick at a time: one frame catches up only so far.
    const run = (seconds: number): void => {
      for (let t = 0; t < seconds; t += TICK_SECONDS) {
        connection.advance(TICK_SECONDS);
      }
    };
    expect(fireball()?.energyCost).toBe(10);

    connection.sendIntent({ kind: "use-skill", slot: 1 });
    run(1.5);
    expect(fireball()?.energyCost).toBe(0);
    const self = connection.getSnapshot().players.find((p) => p.sessionId === SELF_ID);
    const slot = fireball();
    if (self === undefined || slot === null || slot === undefined) {
      throw new Error("no player or no Fireball");
    }
    expect(slotAffordable(slot, { ...self, energy: 3 }, 0)).toBe(true);

    // The glyph's 15 s run out unused: the bar goes back.
    run(15);
    expect(fireball()?.energyCost).toBe(10);
  });
});

describe("the bar in Primal Echoes' range (#1920)", () => {
  it("costs a signet the 10 Energy the spirit asks, and nothing again once it is gone", () => {
    let character = setProfessions(newCharacter("c1"), "ranger", "mesmer");
    character = setSkill(character, 0, "ranger.primal-echoes");
    character = setSkill(character, 1, "mesmer.signet-of-humility");
    const { connection } = targetDummy(character);
    const signet = () => connection.skillBar[1];
    const run = (seconds: number): void => {
      for (let t = 0; t < seconds; t += TICK_SECONDS) {
        connection.advance(TICK_SECONDS);
      }
    };
    expect(signet()?.energyCost).toBe(0);

    connection.sendIntent({ kind: "use-skill", slot: 0 });
    run(2.5);
    expect(signet()?.energyCost).toBe(10);

    // At rank 0 the spirit lives 30 s.
    run(30);
    expect(signet()?.energyCost).toBe(0);
  });
});

describe("calls in the Training Ground (#443)", () => {
  it("calls the dummy and pings for your team, and the ping runs out", () => {
    const { connection } = targetDummy();
    connection.sendCall({ kind: "target", targetId: "dummy" });
    expect(connection.getCalls().target).toEqual({ targetId: "dummy", callerId: SELF_ID });
    // A second later, past the one-a-second limit; tick by tick, as the frame loop does.
    for (let i = 0; i < 20; i += 1) {
      connection.advance(TICK_SECONDS);
    }
    connection.sendCall({ kind: "ping", x: 100, y: 100 });
    expect(connection.getCalls().pings.map(({ x, y }) => [x, y])).toEqual([[100, 100]]);
    for (let i = 0; i < 60; i += 1) {
      connection.advance(TICK_SECONDS);
    }
    expect(connection.getCalls().pings).toEqual([]);
  });

  it("calls nothing while you are dead", () => {
    const { connection, setup } = targetDummy();
    const self = setup.simulation.get(SELF_ID);
    if (self === undefined) {
      throw new Error("no player");
    }
    self.combatant.dead = true;
    connection.sendCall({ kind: "target", targetId: "dummy" });
    connection.sendCall({ kind: "ping", x: 100, y: 100 });
    expect(connection.getCalls()).toEqual({ target: null, pings: [] });
  });
});

describe("a pet's armed attack (#1167)", () => {
  it("rides the wolf's creature from Brutal Strike with no foe until it lapses, 10 s on", () => {
    let character = setProfessions(newCharacter("c1"), "ranger", undefined);
    character = setRank(character, "ranger.beast-mastery", 12);
    character = setSkill(character, 0, "ranger.charm-animal");
    character = setSkill(character, 1, "ranger.brutal-strike");
    const scenario = getTrainingScenario("target-dummy");
    if (scenario === undefined) {
      throw new Error("the target-dummy scenario is gone");
    }
    const setup = setupScenario(scenario, character);
    const connection = createLocalConnection({
      simulation: setup.simulation,
      selfId: SELF_ID,
      map: setup.map,
      nameOf: (id) => id,
      guildOf: () => NO_GUILD,
      professionsOf: () => NO_PROFESSIONS,
    });
    const armed = () =>
      connection.getSnapshot().players.find((p) => p.creature?.ownerId === SELF_ID)?.creature
        ?.armedAttack;
    expect(armed()).toBeNull();

    connection.sendIntent({ kind: "use-skill", slot: 1 });
    connection.advance(TICK_SECONDS);
    const shown = armed();
    expect(shown?.skillId).toBe("ranger.brutal-strike");
    expect(
      Math.abs((shown?.endsAt ?? 0) - connection.getSnapshot().elapsedSeconds - 10),
    ).toBeLessThan(0.11);

    for (let i = 0; i < Math.round(9 / TICK_SECONDS); i += 1) {
      connection.advance(TICK_SECONDS);
    }
    expect(armed()?.skillId).toBe("ranger.brutal-strike");
    for (let i = 0; i < Math.round(1.1 / TICK_SECONDS); i += 1) {
      connection.advance(TICK_SECONDS);
    }
    expect(armed()).toBeNull();
  });
});

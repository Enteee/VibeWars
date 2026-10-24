import { describe, expect, it } from "vitest";

import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "../net/match-connection.js";
import { castSounds, combatSounds } from "./sound-cues.js";
import { SOUND_IDS } from "./sound-ids.js";

const ME = "me";

function message(casterSessionId: string, events: CombatMessage["events"]): CombatMessage {
  return { casterSessionId, skillId: "x", events };
}

describe("combatSounds", () => {
  it("cracks for a hit you deal and thuds for one you take", () => {
    expect(combatSounds(message(ME, [{ kind: "damage", targetId: "foe", amount: 9 }]), ME)).toEqual(
      ["hit-dealt"],
    );
    expect(combatSounds(message("foe", [{ kind: "damage", targetId: ME, amount: 9 }]), ME)).toEqual(
      ["hit-taken"],
    );
  });

  it("is silent for a fight you are not in", () => {
    const elsewhere = message("foe", [
      { kind: "damage", targetId: "ally", amount: 9 },
      { kind: "heal", targetId: "foe", amount: 9 },
      { kind: "interrupted", targetId: "ally" },
      { kind: "interrupt-missed", targetId: "ally" },
      { kind: "status-applied", targetId: "ally" },
    ]);
    expect(combatSounds(elsewhere, ME)).toEqual([]);
  });

  it("plays one crack for an area hit on many, not one each", () => {
    const splash = message(ME, [
      { kind: "damage", targetId: "a", amount: 9 },
      { kind: "damage", targetId: "b", amount: 9 },
      { kind: "damage", targetId: "c", amount: 9 },
    ]);
    expect(combatSounds(splash, ME)).toEqual(["hit-dealt"]);
  });

  it("chimes only for a heal on you", () => {
    expect(combatSounds(message("ally", [{ kind: "heal", targetId: ME, amount: 5 }]), ME)).toEqual([
      "heal",
    ]);
    expect(combatSounds(message(ME, [{ kind: "heal", targetId: "ally", amount: 5 }]), ME)).toEqual(
      [],
    );
  });

  it("plays the interrupt when it is yours, or you are the one interrupted", () => {
    expect(combatSounds(message(ME, [{ kind: "interrupted", targetId: "foe" }]), ME)).toEqual([
      "interrupt",
    ]);
    expect(combatSounds(message("foe", [{ kind: "interrupted", targetId: ME }]), ME)).toEqual([
      "interrupt",
    ]);
    expect(combatSounds(message(ME, [{ kind: "interrupt-missed", targetId: "foe" }]), ME)).toEqual([
      "interrupt-missed",
    ]);
  });

  it("plays a death for anyone's, and a hit and a death together", () => {
    expect(combatSounds(message("a", [{ kind: "death", targetId: "b" }]), ME)).toEqual(["death"]);
    const kill = message(ME, [
      { kind: "damage", targetId: "foe", amount: 90 },
      { kind: "death", targetId: "foe" },
    ]);
    expect(combatSounds(kill, ME)).toEqual(["hit-dealt", "death"]);
  });

  it("only ever names sounds that have a file", () => {
    const everything = message(ME, [
      { kind: "damage", targetId: ME, amount: 1 },
      { kind: "damage", targetId: "foe", amount: 1 },
      { kind: "heal", targetId: ME, amount: 1 },
      { kind: "interrupted", targetId: ME },
      { kind: "interrupt-missed", targetId: "foe" },
      { kind: "death", targetId: "foe" },
    ]);
    for (const id of combatSounds(everything, ME)) {
      expect(SOUND_IDS).toContain(id);
    }
  });
});

function player(sessionId: string, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    x: 0,
    y: 0,
    targetSessionId: undefined,
    health: 100,
    maxHealth: 100,
    energy: 20,
    maxEnergy: 20,
    adrenaline: 0,
    armor: 60,
    weaponId: undefined,
    team: sessionId === ME ? 0 : 1,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    statuses: [],
    ...extra,
  };
}

function snapshot(players: PlayerSnapshot[]): MatchSnapshot {
  return {
    selfSessionId: ME,
    players,
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
  };
}

describe("castSounds", () => {
  const idle = snapshot([player(ME, { targetSessionId: "foe" }), player("foe")]);

  it("plays cast-self once, when your cast starts", () => {
    const casting = snapshot([
      player(ME, { targetSessionId: "foe", castingSkillId: "fireball", castRemaining: 1 }),
      player("foe"),
    ]);
    const later = snapshot([
      player(ME, { targetSessionId: "foe", castingSkillId: "fireball", castRemaining: 0.5 }),
      player("foe"),
    ]);
    expect(castSounds(idle, casting)).toEqual(["cast-self"]);
    expect(castSounds(casting, later)).toEqual([]);
  });

  it("plays it again for the same skill cast again straight away", () => {
    const ending = snapshot([
      player(ME, { castingSkillId: "fireball", castRemaining: 0.01 }),
      player("foe"),
    ]);
    const again = snapshot([
      player(ME, { castingSkillId: "fireball", castRemaining: 1 }),
      player("foe"),
    ]);
    expect(castSounds(ending, again)).toEqual(["cast-self"]);
  });

  it("plays cast-target when your target starts casting, and nobody else's", () => {
    const targetCasts = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe", { castingSkillId: "heal", castRemaining: 2 }),
    ]);
    expect(castSounds(idle, targetCasts)).toEqual(["cast-target"]);

    const bystander = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe"),
      player("other", { castingSkillId: "heal", castRemaining: 2 }),
    ]);
    expect(castSounds(snapshot([...idle.players, player("other")]), bystander)).toEqual([]);
  });
});

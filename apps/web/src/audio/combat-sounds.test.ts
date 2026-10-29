import { describe, expect, it } from "vitest";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { hitsForCombat, soundsForCombat, soundsForSnapshot } from "./combat-sounds.js";

const ME = "me";

function message(casterSessionId: string, events: CombatMessage["events"]): CombatMessage {
  return {
    casterSessionId,
    cause: "skill",
    skillId: "x",
    weaponId: "",
    attributeId: "",
    doubleStrike: false,
    events,
  };
}

describe("soundsForCombat", () => {
  it("cracks for a hit you deal", () => {
    const hit = message(ME, [{ kind: "damage", targetId: "foe", amount: 9, critical: false }]);
    expect(soundsForCombat(hit, ME)).toEqual(["hit-dealt"]);
  });

  it("thuds for a hit you take", () => {
    const hit = message("foe", [{ kind: "damage", targetId: ME, amount: 9, critical: false }]);
    expect(soundsForCombat(hit, ME)).toEqual(["hit-taken"]);
  });

  it("counts hurting yourself as a hit taken, not one dealt", () => {
    const hit = message(ME, [{ kind: "damage", targetId: ME, amount: 9, critical: false }]);
    expect(soundsForCombat(hit, ME)).toEqual(["hit-taken"]);
  });

  it("chimes for a heal on you, and not for one you give", () => {
    const onMe = message("ally", [{ kind: "heal", targetId: ME, amount: 5 }]);
    const byMe = message(ME, [{ kind: "heal", targetId: "ally", amount: 5 }]);
    expect(soundsForCombat(onMe, ME)).toEqual(["heal"]);
    expect(soundsForCombat(byMe, ME)).toEqual([]);
  });

  it("plays the interrupt when it is yours, or you are the one interrupted", () => {
    const yours = message(ME, [{ kind: "interrupted", targetId: "foe", skillId: "x" }]);
    const onYou = message("foe", [{ kind: "interrupted", targetId: ME, skillId: "x" }]);
    expect(soundsForCombat(yours, ME)).toEqual(["interrupt"]);
    expect(soundsForCombat(onYou, ME)).toEqual(["interrupt"]);
  });

  it("is silent for a cast you cancel by moving (#279)", () => {
    const cancelled = message(ME, [{ kind: "cancelled", targetId: ME, skillId: "x" }]);
    expect(soundsForCombat(cancelled, ME)).toEqual([]);
  });

  it("plays interrupt-missed only for your own miss", () => {
    const yours = message(ME, [
      { kind: "interrupt-missed", targetId: "foe", refusedSkillId: null },
    ]);
    const theirs = message("foe", [
      { kind: "interrupt-missed", targetId: ME, refusedSkillId: null },
    ]);
    expect(soundsForCombat(yours, ME)).toEqual(["interrupt-missed"]);
    expect(soundsForCombat(theirs, ME)).toEqual([]);
  });

  it("plays a death for anyone's", () => {
    expect(soundsForCombat(message("a", [{ kind: "death", targetId: "b" }]), ME)).toEqual([
      "death",
    ]);
  });

  it("is silent for an ally's hit on an enemy, and for every other kind", () => {
    const elsewhere = message("ally", [
      { kind: "damage", targetId: "foe", amount: 9, critical: false },
      { kind: "heal", targetId: "foe", amount: 9 },
      { kind: "interrupted", targetId: "foe", skillId: "x" },
      { kind: "interrupt-missed", targetId: "foe", refusedSkillId: null },
    ]);
    const other = message(ME, [
      { kind: "status-applied", targetId: ME, statusId: "burning", durationSeconds: 3 },
    ]);
    expect(soundsForCombat(elsewhere, ME)).toEqual([]);
    expect(soundsForCombat(other, ME)).toEqual([]);
  });

  it("is silent for a status tick on you, except the death it causes", () => {
    // How the server sends burning or Regeneration: the bearer as caster, no skill.
    const burning: CombatMessage = {
      casterSessionId: ME,
      cause: "degeneration",
      skillId: "",
      weaponId: "",
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "damage", targetId: ME, amount: 1, critical: false }],
    };
    const regen: CombatMessage = {
      casterSessionId: ME,
      cause: "degeneration",
      skillId: "",
      weaponId: "",
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "heal", targetId: ME, amount: 1 }],
    };
    const fatal: CombatMessage = {
      casterSessionId: ME,
      cause: "degeneration",
      skillId: "",
      weaponId: "",
      attributeId: "",
      doubleStrike: false,
      events: [
        { kind: "damage", targetId: ME, amount: 1, critical: false },
        { kind: "death", targetId: ME },
      ],
    };
    expect(soundsForCombat(burning, ME)).toEqual([]);
    expect(soundsForCombat(regen, ME)).toEqual([]);
    expect(soundsForCombat(fatal, ME)).toEqual(["death"]);
  });

  it("cracks for a weapon hit you deal: no skill, but not a status tick either (#160)", () => {
    const swing: CombatMessage = {
      casterSessionId: ME,
      cause: "weapon",
      skillId: "",
      weaponId: "sword",
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "damage", targetId: "foe", amount: 12, critical: false }],
    };
    expect(soundsForCombat(swing, ME)).toEqual(["hit-dealt"]);
  });

  it("plays a kill as a hit and a death", () => {
    const kill = message(ME, [
      { kind: "damage", targetId: "foe", amount: 90, critical: false },
      { kind: "death", targetId: "foe" },
    ]);
    expect(soundsForCombat(kill, ME)).toEqual(["hit-dealt", "death"]);
  });
});

describe("hitsForCombat (#370)", () => {
  it("counts damage, interrupts, conditions and hexes, dealt or taken", () => {
    const dealt = message(ME, [
      { kind: "damage", targetId: "foe", amount: 9, critical: false },
      { kind: "interrupted", targetId: "foe", skillId: "heal" },
      { kind: "status-applied", targetId: "foe", statusId: "bleeding", durationSeconds: 5 },
      { kind: "status-applied", targetId: "foe", statusId: "faintheartedness", durationSeconds: 5 },
    ]);
    expect(hitsForCombat(dealt, ME)).toEqual(["dealt", "dealt", "dealt", "dealt"]);
    const taken = message("foe", [
      { kind: "damage", targetId: ME, amount: 9, critical: false },
      { kind: "status-applied", targetId: ME, statusId: "crippled", durationSeconds: 5 },
    ]);
    expect(hitsForCombat(taken, ME)).toEqual(["taken", "taken"]);
  });

  it("does not count heals, enchantments, your own buffs, status ticks or other fights", () => {
    const friendly = message("ally", [
      { kind: "heal", targetId: ME, amount: 5 },
      { kind: "status-applied", targetId: ME, statusId: "regeneration", durationSeconds: 5 },
    ]);
    const ownBuff = message(ME, [
      { kind: "status-applied", targetId: ME, statusId: "armor-boost", durationSeconds: 5 },
    ]);
    const tick: CombatMessage = {
      casterSessionId: "foe",
      cause: "degeneration",
      skillId: "",
      weaponId: "",
      attributeId: "",
      doubleStrike: false,
      events: [{ kind: "damage", targetId: ME, amount: 1, critical: false }],
    };
    const elsewhere = message("foe", [
      { kind: "damage", targetId: "ally", amount: 9, critical: false },
    ]);
    for (const m of [friendly, ownBuff, tick, elsewhere]) {
      expect(hitsForCombat(m, ME)).toEqual([]);
    }
  });
});

function player(sessionId: string, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 100,
    maxHealth: 100,
    energy: 20,
    maxEnergy: 20,
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: sessionId === ME ? 0 : 1,
    dead: false,
    corpseExploited: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    invulnerableSeconds: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
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
    projectiles: [],
    groundEffects: [],
    traps: [],
    flags: [],
    stand: undefined,
    aggression: [],
    relics: [],
    altar: undefined,
    summary: undefined,
  };
}

const casting = (skill: string): Partial<PlayerSnapshot> => ({
  castingSkillId: skill,
  castRemaining: 1,
});

describe("soundsForSnapshot", () => {
  const idle = snapshot([player(ME, { targetSessionId: "foe" }), player("foe")]);

  it("plays cast-self when your cast starts, and not again while it runs", () => {
    const started = snapshot([
      player(ME, { targetSessionId: "foe", ...casting("fireball") }),
      player("foe"),
    ]);
    const running = snapshot([
      player(ME, { targetSessionId: "foe", castingSkillId: "fireball", castRemaining: 0.5 }),
      player("foe"),
    ]);
    expect(soundsForSnapshot(idle, started)).toEqual(["cast-self"]);
    expect(soundsForSnapshot(started, running)).toEqual([]);
  });

  it("plays cast-self when one cast changes straight into another", () => {
    const first = snapshot([player(ME, casting("fireball")), player("foe")]);
    const second = snapshot([player(ME, casting("flare")), player("foe")]);
    expect(soundsForSnapshot(first, second)).toEqual(["cast-self"]);
  });

  it("plays cast-target when your target starts casting", () => {
    const targetCasts = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe", casting("heal")),
    ]);
    expect(soundsForSnapshot(idle, targetCasts)).toEqual(["cast-target"]);
  });

  it("is silent for a target that was already casting", () => {
    const before = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe", casting("heal")),
    ]);
    const after = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe", { castingSkillId: "heal", castRemaining: 0.5 }),
    ]);
    expect(soundsForSnapshot(before, after)).toEqual([]);
  });

  it("is silent when you switch onto someone in the middle of their cast", () => {
    const before = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe"),
      player("other"),
    ]);
    const after = snapshot([
      player(ME, { targetSessionId: "other" }),
      player("foe"),
      player("other", casting("heal")),
    ]);
    expect(soundsForSnapshot(before, after)).toEqual([]);
  });

  it("is silent for a cast by someone who is not your target", () => {
    const before = snapshot([...idle.players, player("other")]);
    const after = snapshot([...idle.players, player("other", casting("heal"))]);
    expect(soundsForSnapshot(before, after)).toEqual([]);
  });

  it("plays cast-self only, not both, when you target yourself", () => {
    const before = snapshot([player(ME, { targetSessionId: ME })]);
    const after = snapshot([player(ME, { targetSessionId: ME, ...casting("heal") })]);
    expect(soundsForSnapshot(before, after)).toEqual(["cast-self"]);
  });

  it("plays both when you and your target start casting together", () => {
    const after = snapshot([
      player(ME, { targetSessionId: "foe", ...casting("fireball") }),
      player("foe", casting("heal")),
    ]);
    expect(soundsForSnapshot(idle, after)).toEqual(["cast-self", "cast-target"]);
  });

  it("is silent for a dead caster", () => {
    const after = snapshot([
      player(ME, { targetSessionId: "foe" }),
      player("foe", { dead: true, ...casting("heal") }),
    ]);
    expect(soundsForSnapshot(idle, after)).toEqual([]);
  });

  it("is silent without a previous snapshot: the first one, or the one after a reconnect", () => {
    const busy = snapshot([
      player(ME, { targetSessionId: "foe", ...casting("fireball") }),
      player("foe", casting("heal")),
    ]);
    expect(soundsForSnapshot(undefined, busy)).toEqual([]);
  });
});

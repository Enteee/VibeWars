import { describe, expect, it } from "vitest";
import type { StatusId } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import {
  hitsForCombat,
  soundsForCombat,
  soundsForSkillWorld,
  soundsForSnapshot,
  soundsForWorld,
} from "./combat-sounds.js";
import type { WorldPlaces } from "./world-places.js";

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
    guildTag: undefined,
    heroRank: 0,
    guildCape: undefined,
    x: 0,
    y: 0,
    facing: 0,
    layer: 0,
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
    teleportReadyAt: 0,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    bot: false,
    signet: undefined,
    statuses: [],
    ...extra,
  };
}

function snapshot(players: PlayerSnapshot[]): MatchSnapshot {
  return {
    selfSessionId: ME,
    players,
    score: [0, 0],
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
    altarHolder: undefined,
    altarHeldSeconds: 0,
    capturePoints: [],
    gates: [],
    switches: [],
    teleports: [],
    breakables: [],
    decks: [],
    lifts: [],
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

describe("soundsForWorld", () => {
  // A lever 300 away, gates and walls 600 away: each just inside its earshot.
  const places: WorldPlaces = {
    gates: [
      { at: { x: 600, y: 0 }, blocks: "all" },
      { at: { x: 0, y: 600 }, blocks: "all" },
      { at: { x: -600, y: 0 }, blocks: "bodies-and-shots" },
    ],
    switches: [{ x: 300, y: 0 }],
    breakables: [{ x: 0, y: -600 }],
  };
  const world = (
    switches: boolean[],
    gates: boolean[],
    breakables: number[],
    players = [player(ME)],
  ): MatchSnapshot => ({ ...snapshot(players), switches, gates, breakables });
  const still = world([true], [false, false, false], [40]);

  it("plays a lever flipped within earshot, not one beyond it", () => {
    const flipped = world([false], [false, false, false], [40]);
    expect(soundsForWorld(still, flipped, ME, places)).toEqual(["lever"]);
    const far = world([true], [false, false, false], [40], [player(ME, { x: -100 })]);
    const farFlipped = world([false], [false, false, false], [40], [player(ME, { x: -100 })]);
    expect(soundsForWorld(far, farFlipped, ME, places)).toEqual([]);
  });

  it("grinds once for two stone gates moving together, and hums for a barrier", () => {
    const stones = world([true], [true, true, false], [40]);
    expect(soundsForWorld(still, stones, ME, places)).toEqual(["gate-stone"]);
    const barrier = world([true], [false, false, true], [40]);
    expect(soundsForWorld(still, barrier, ME, places)).toEqual(["barrier"]);
    expect(soundsForWorld(barrier, still, ME, places)).toEqual(["barrier"]);
  });

  it("crumbles a wall once, when it falls to 0", () => {
    const fallen = world([true], [false, false, false], [0]);
    expect(soundsForWorld(still, fallen, ME, places)).toEqual(["wall-crumble"]);
    expect(soundsForWorld(fallen, fallen, ME, places)).toEqual([]);
    const struck = world([true], [false, false, false], [20]);
    expect(soundsForWorld(still, struck, ME, places)).toEqual([]);
  });

  it("is silent without a prev or without a player of your own", () => {
    const moved = world([false], [true, true, true], [0]);
    expect(soundsForWorld(undefined, moved, ME, places)).toEqual([]);
    const watcher = world([true], [false, false, false], [40], [player("foe")]);
    const watched = world([false], [true, true, true], [0], [player("foe")]);
    expect(soundsForWorld(watcher, watched, ME, places)).toEqual([]);
  });

  it("does nothing on a map without elements", () => {
    const empty = world([], [], []);
    expect(soundsForWorld(empty, empty, ME, { gates: [], switches: [], breakables: [] })).toEqual(
      [],
    );
  });
});

describe("skill-type cues (#3297)", () => {
  const status = (targetId: string, statusId: StatusId): CombatMessage["events"][number] => ({
    kind: "status-applied",
    targetId,
    statusId,
    durationSeconds: 10,
  });
  const skillMessage = (
    caster: string,
    skillId: string,
    events: CombatMessage["events"],
  ): CombatMessage => ({ ...message(caster, events), skillId });

  it.each([
    ["enchant-on", "regeneration"],
    ["hex-on", "mind-wrack"],
    ["stance-on", "balanced-stance"],
  ] as const)("%s plays for a status of its category on you, once a message", (cue, id) => {
    const msg = message("foe", [status(ME, id), status(ME, id), status("ally", id)]);
    expect(soundsForCombat(msg, ME)).toEqual([cue]);
  });

  it("is silent for a status on someone else", () => {
    expect(soundsForCombat(message("foe", [status("ally", "mind-wrack")]), ME)).toEqual([]);
  });

  it("is silent for a status tick", () => {
    const tick: CombatMessage = {
      ...message("foe", [status(ME, "mind-wrack")]),
      cause: "degeneration",
      skillId: "",
    };
    expect(soundsForCombat(tick, ME)).toEqual([]);
  });

  it("shouts when a shout reaches you, once, and not when it misses you", () => {
    const reach = skillMessage("ally", "paragon.fall-back", [
      { kind: "heal", targetId: ME, amount: 0 },
      { kind: "heal", targetId: ME, amount: 0 },
    ]);
    const miss = skillMessage("ally", "paragon.fall-back", [
      { kind: "heal", targetId: "other", amount: 0 },
    ]);
    expect(soundsForCombat(reach, ME).filter((id) => id === "shout")).toEqual(["shout"]);
    expect(soundsForCombat(miss, ME)).toEqual([]);
  });

  it("plays form-on when you take a form, and not for another's", () => {
    const events: CombatMessage["events"] = [status(ME, "avatar-of-melandru")];
    expect(soundsForCombat(skillMessage(ME, "dervish.avatar-of-melandru", events), ME)).toContain(
      "form-on",
    );
    expect(
      soundsForCombat(skillMessage("foe", "dervish.avatar-of-melandru", events), ME),
    ).not.toContain("form-on");
  });
});

describe("soundsForSkillWorld (#3297)", () => {
  const effect = (id: number, skillId: string, team: number, x: number, radius = 100) => ({
    id,
    skillId,
    team,
    x,
    y: 0,
    layer: 0,
    radius,
    endsAt: 30,
    durationSeconds: 20,
  });
  const world = (
    groundEffects: MatchSnapshot["groundEffects"],
    players = [player(ME, { team: 0 })],
  ): MatchSnapshot => ({ ...snapshot(players), groundEffects });
  const empty = world([]);
  const WELL = "necromancer.well-of-suffering";

  it("warns when a foe's harmful area lands on you", () => {
    expect(soundsForSkillWorld(empty, world([effect(1, WELL, 1, 0)]), ME)).toEqual(["area-warn"]);
  });

  it("warns within 100 of the edge, not at 150", () => {
    const near = world([effect(1, WELL, 1, 190)]);
    const far = world([effect(1, WELL, 1, 250)]);
    expect(soundsForSkillWorld(empty, near, ME)).toEqual(["area-warn"]);
    expect(soundsForSkillWorld(empty, far, ME)).toEqual([]);
  });

  it("is silent for your own team's area, and for a foe's area that only helps foes", () => {
    expect(soundsForSkillWorld(empty, world([effect(1, WELL, 0, 0)]), ME)).toEqual([]);
    const ward = "elementalist.ward-against-melee";
    expect(soundsForSkillWorld(empty, world([effect(1, ward, 1, 0)]), ME)).toEqual([]);
  });

  it("warns once: the same area in the next snapshot is silent", () => {
    const landed = world([effect(1, WELL, 1, 0)]);
    expect(soundsForSkillWorld(landed, world([effect(1, WELL, 1, 0)]), ME)).toEqual([]);
  });

  it("is silent without a prev", () => {
    expect(soundsForSkillWorld(undefined, world([effect(1, WELL, 1, 0)]), ME)).toEqual([]);
  });

  const spirit = (id: string, x: number): PlayerSnapshot =>
    player(id, {
      x,
      team: 1,
      creature: {
        ownerId: "foe",
        kind: "spirit",
        look: "plain" as never,
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    });

  it("plays spirit-up for a spirit summoned at 699, not at 701", () => {
    const base = empty;
    expect(
      soundsForSkillWorld(base, world([], [player(ME, { team: 0 }), spirit("s", 699)]), ME),
    ).toEqual(["spirit-up"]);
    expect(
      soundsForSkillWorld(base, world([], [player(ME, { team: 0 }), spirit("s", 701)]), ME),
    ).toEqual([]);
  });

  it("is silent for a spirit that was already there", () => {
    const withSpirit = world([], [player(ME, { team: 0 }), spirit("s", 100)]);
    expect(soundsForSkillWorld(withSpirit, withSpirit, ME)).toEqual([]);
  });
});

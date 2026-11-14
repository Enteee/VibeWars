import { describe, expect, it } from "vitest";
import type { StatusId } from "@vibewars/game-core";
import type {
  CombatMessage,
  GroundEffectSnapshot,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";

import {
  hitsForCombat,
  soundsForCombat,
  soundsForSkillsAround,
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

describe("soundsForCombat: the skill types that concern you (#3297)", () => {
  const cast = (
    casterSessionId: string,
    skillId: string,
    events: CombatMessage["events"],
  ): CombatMessage => ({ ...message(casterSessionId, events), skillId });
  const on = (targetId: string, statusId: StatusId): CombatMessage["events"][number] => ({
    kind: "status-applied",
    targetId,
    statusId,
    durationSeconds: 5,
  });
  const tick = (events: CombatMessage["events"]): CombatMessage => ({
    ...message(ME, events),
    cause: "degeneration",
    skillId: "",
  });

  it("shimmers once for an enchantment on you, not on an ally, however many it lands on", () => {
    expect(soundsForCombat(message("ally", [on(ME, "armor-boost")]), ME)).toEqual(["enchant-on"]);
    expect(soundsForCombat(message(ME, [on("ally", "armor-boost")]), ME)).toEqual([]);
    const area = message("ally", [
      on("ally", "regeneration"),
      on(ME, "regeneration"),
      on(ME, "armor-boost"),
    ]);
    expect(soundsForCombat(area, ME)).toEqual(["enchant-on"]);
    expect(soundsForCombat(tick([on(ME, "regeneration")]), ME)).toEqual([]);
  });

  it("drones for a hex on you, not on a foe, and thuds too when it hurts", () => {
    expect(soundsForCombat(message("foe", [on(ME, "faintheartedness")]), ME)).toEqual(["hex-on"]);
    expect(soundsForCombat(message(ME, [on("foe", "faintheartedness")]), ME)).toEqual([]);
    const twice = message("foe", [
      on(ME, "faintheartedness"),
      { kind: "damage", targetId: ME, amount: 9, critical: false },
      on(ME, "faintheartedness"),
    ]);
    expect(soundsForCombat(twice, ME)).toEqual(["hit-taken", "hex-on"]);
    expect(soundsForCombat(tick([on(ME, "faintheartedness")]), ME)).toEqual([]);
  });

  it("pings for a stance you enter, not a foe's", () => {
    expect(soundsForCombat(cast(ME, "warrior.frenzy", [on(ME, "frenzy")]), ME)).toEqual([
      "stance-on",
    ]);
    expect(soundsForCombat(cast("foe", "warrior.frenzy", [on("foe", "frenzy")]), ME)).toEqual([]);
    const both = cast(ME, "warrior.frenzy", [on(ME, "frenzy"), on(ME, "frenzy")]);
    expect(soundsForCombat(both, ME)).toEqual(["stance-on"]);
    expect(soundsForCombat(tick([on(ME, "frenzy")]), ME)).toEqual([]);
  });

  it("swells once for a shout that reaches you, yours or an ally's, not one past you or at you", () => {
    const shout = (caster: string, targets: string[]): CombatMessage =>
      cast(
        caster,
        "warrior.watch-yourself",
        targets.map((t) => on(t, "watch-yourself")),
      );
    expect(soundsForCombat(shout(ME, [ME, "ally"]), ME)).toEqual(["shout"]);
    expect(soundsForCombat(shout("ally", ["ally", ME, ME]), ME)).toEqual(["shout"]);
    expect(soundsForCombat(shout("foe", ["foe"]), ME)).toEqual([]);
    const coward = cast("foe", "warrior.coward", [
      { kind: "damage", targetId: ME, amount: 9, critical: false },
    ]);
    expect(soundsForCombat(coward, ME)).toEqual(["hit-taken"]);
    expect(soundsForCombat({ ...shout("ally", [ME]), cause: "degeneration" }, ME)).toEqual([]);
  });

  it("swells deep for a form you take, not a foe's", () => {
    const avatar = (caster: string): CombatMessage =>
      cast(caster, "dervish.avatar-of-melandru", [on(caster, "avatar-of-melandru")]);
    expect(soundsForCombat(avatar(ME), ME)).toEqual(["form-on"]);
    expect(soundsForCombat(avatar("foe"), ME)).toEqual([]);
    expect(
      soundsForCombat({ ...avatar(ME), events: [...avatar(ME).events, ...avatar(ME).events] }, ME),
    ).toEqual(["form-on"]);
    expect(soundsForCombat({ ...avatar(ME), cause: "degeneration" }, ME)).toEqual([]);
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

describe("soundsForSkillsAround (#3297)", () => {
  /** A foe's well: ground that hurts you. */
  const well: GroundEffectSnapshot = {
    id: 4,
    skillId: "necromancer.well-of-darkness",
    team: 1,
    x: 0,
    y: 0,
    layer: 0,
    radius: 100,
    endsAt: 19,
    durationSeconds: 17,
  };
  const ground = (effects: GroundEffectSnapshot[], players = [player(ME)]): MatchSnapshot => ({
    ...snapshot(players),
    groundEffects: effects,
  });
  const bare = ground([]);

  it("warns once of a foe's harmful area landing on you, never of the same one again", () => {
    expect(soundsForSkillsAround(bare, ground([well]), ME)).toEqual(["area-warn"]);
    expect(soundsForSkillsAround(ground([well]), ground([well]), ME)).toEqual([]);
  });

  it("warns within 100 of the edge, not 150 from it, nor on another layer", () => {
    const near = { ...well, x: 199 };
    expect(soundsForSkillsAround(bare, ground([near]), ME)).toEqual(["area-warn"]);
    expect(soundsForSkillsAround(bare, ground([{ ...well, x: 250 }]), ME)).toEqual([]);
    expect(soundsForSkillsAround(bare, ground([{ ...well, layer: 1 }]), ME)).toEqual([]);
  });

  it("never warns of your own side's ground, nor of a foe's that only helps foes", () => {
    expect(soundsForSkillsAround(bare, ground([{ ...well, team: 0 }]), ME)).toEqual([]);
    const ward = { ...well, skillId: "elementalist.ward-against-melee" };
    expect(soundsForSkillsAround(bare, ground([ward]), ME)).toEqual([]);
  });

  describe("spirit-up", () => {
    const spirit = (x: number, team = 1): PlayerSnapshot =>
      player("spirit", {
        x,
        team,
        creature: {
          ownerId: "foe",
          kind: "spirit",
          look: "spirit",
          mode: null,
          armedAttack: null,
          leaderId: null,
        },
      });
    const alone = ground([]);
    const summoned = (x: number, team?: number) => ground([], [player(ME), spirit(x, team)]);

    it("breathes for a spirit summoned within 700, either side's, once", () => {
      expect(soundsForSkillsAround(alone, summoned(699), ME)).toEqual(["spirit-up"]);
      expect(soundsForSkillsAround(alone, summoned(699, 0), ME)).toEqual(["spirit-up"]);
      expect(soundsForSkillsAround(summoned(699), summoned(699), ME)).toEqual([]);
    });

    it("stays silent for one summoned at 701", () => {
      expect(soundsForSkillsAround(alone, summoned(701), ME)).toEqual([]);
    });
  });

  it("plays nothing without a prev, or for a watcher", () => {
    expect(soundsForSkillsAround(undefined, ground([well]), ME)).toEqual([]);
    expect(
      soundsForSkillsAround(ground([], [player("foe")]), ground([well], [player("foe")]), ME),
    ).toEqual([]);
  });
});

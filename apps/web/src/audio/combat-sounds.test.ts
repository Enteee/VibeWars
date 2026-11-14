import { describe, expect, it } from "vitest";
import { IMPLEMENTED_SKILLS, getSkill } from "@vibewars/game-core";
import type { Skill, StatusId } from "@vibewars/game-core";
import type {
  CombatMessage,
  GroundEffectSnapshot,
  MatchSnapshot,
  PlayerSnapshot,
} from "@vibewars/game-session";

import {
  AREA_WARN_REACH,
  CAST_EARSHOT,
  CAST_VOICE_LIMIT,
  SPIRIT_EARSHOT,
  castLayers,
  castPitch,
  castPitchStep,
  castVoices,
  instantCastVoice,
  hitsForCombat,
  soundsForCombat,
  soundsForSkillGround,
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
    expect(soundsForCombat(hit, ME, undefined)).toEqual(["hit-dealt"]);
  });

  it("thuds for a hit you take", () => {
    const hit = message("foe", [{ kind: "damage", targetId: ME, amount: 9, critical: false }]);
    expect(soundsForCombat(hit, ME, undefined)).toEqual(["hit-taken"]);
  });

  it("counts hurting yourself as a hit taken, not one dealt", () => {
    const hit = message(ME, [{ kind: "damage", targetId: ME, amount: 9, critical: false }]);
    expect(soundsForCombat(hit, ME, undefined)).toEqual(["hit-taken"]);
  });

  it("chimes for a heal on you, and not for one you give", () => {
    const onMe = message("ally", [{ kind: "heal", targetId: ME, amount: 5 }]);
    const byMe = message(ME, [{ kind: "heal", targetId: "ally", amount: 5 }]);
    expect(soundsForCombat(onMe, ME, undefined)).toEqual(["heal"]);
    expect(soundsForCombat(byMe, ME, undefined)).toEqual([]);
  });

  it("plays the interrupt when it is yours, or you are the one interrupted", () => {
    const yours = message(ME, [{ kind: "interrupted", targetId: "foe", skillId: "x" }]);
    const onYou = message("foe", [{ kind: "interrupted", targetId: ME, skillId: "x" }]);
    expect(soundsForCombat(yours, ME, undefined)).toEqual(["interrupt"]);
    expect(soundsForCombat(onYou, ME, undefined)).toEqual(["interrupt"]);
  });

  it("is silent for a cast you cancel by moving (#279)", () => {
    const cancelled = message(ME, [{ kind: "cancelled", targetId: ME, skillId: "x" }]);
    expect(soundsForCombat(cancelled, ME, undefined)).toEqual([]);
  });

  it("plays interrupt-missed only for your own miss", () => {
    const yours = message(ME, [
      { kind: "interrupt-missed", targetId: "foe", refusedSkillId: null },
    ]);
    const theirs = message("foe", [
      { kind: "interrupt-missed", targetId: ME, refusedSkillId: null },
    ]);
    expect(soundsForCombat(yours, ME, undefined)).toEqual(["interrupt-missed"]);
    expect(soundsForCombat(theirs, ME, undefined)).toEqual([]);
  });

  it("plays a death for anyone's", () => {
    expect(
      soundsForCombat(message("a", [{ kind: "death", targetId: "b" }]), ME, undefined),
    ).toEqual(["death"]);
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
    expect(soundsForCombat(elsewhere, ME, undefined)).toEqual([]);
    expect(soundsForCombat(other, ME, undefined)).toEqual([]);
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
    expect(soundsForCombat(burning, ME, undefined)).toEqual([]);
    expect(soundsForCombat(regen, ME, undefined)).toEqual([]);
    expect(soundsForCombat(fatal, ME, undefined)).toEqual(["death"]);
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
    expect(soundsForCombat(swing, ME, undefined)).toEqual(["hit-dealt"]);
  });

  it("plays a kill as a hit and a death", () => {
    const kill = message(ME, [
      { kind: "damage", targetId: "foe", amount: 90, critical: false },
      { kind: "death", targetId: "foe" },
    ]);
    expect(soundsForCombat(kill, ME, undefined)).toEqual(["hit-dealt", "death"]);
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

  it("is silent for your own cast: that is a voice (#3298)", () => {
    const started = snapshot([
      player(ME, { targetSessionId: "foe", ...casting("fireball") }),
      player("foe"),
    ]);
    expect(soundsForSnapshot(idle, started)).toEqual([]);
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

  it("plays no cast-target when you target yourself", () => {
    const before = snapshot([player(ME, { targetSessionId: ME })]);
    const after = snapshot([player(ME, { targetSessionId: ME, ...casting("heal") })]);
    expect(soundsForSnapshot(before, after)).toEqual([]);
  });

  it("plays cast-target when you and your target start casting together", () => {
    const after = snapshot([
      player(ME, { targetSessionId: "foe", ...casting("fireball") }),
      player("foe", casting("heal")),
    ]);
    expect(soundsForSnapshot(idle, after)).toEqual(["cast-target"]);
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

describe("skill type cues (#3297)", () => {
  const status = (targetId: string, statusId: StatusId): CombatMessage["events"][number] => ({
    kind: "status-applied",
    targetId,
    statusId,
    durationSeconds: 10,
  });
  const skill = (
    caster: string,
    skillId: string,
    events: CombatMessage["events"],
  ): CombatMessage => ({ ...message(caster, events), skillId });

  for (const [cue, statusId] of [
    ["enchant-on", "regeneration"],
    ["hex-on", "pacifism"],
    ["stance-on", "sprint"],
  ] as const) {
    describe(cue, () => {
      it("plays when it lands on you", () => {
        expect(soundsForCombat(message("ally", [status(ME, statusId)]), ME, undefined)).toEqual([
          cue,
        ]);
      });

      it("stays silent when it lands on an ally or a foe", () => {
        const others = message(ME, [status("ally", statusId), status("foe", statusId)]);
        expect(soundsForCombat(others, ME, undefined)).toEqual([]);
      });

      it("plays once for a message that applies it to you twice", () => {
        const twice = message("ally", [status(ME, statusId), status(ME, statusId)]);
        expect(soundsForCombat(twice, ME, undefined)).toEqual([cue]);
      });

      it("stays silent for a status tick", () => {
        const tick: CombatMessage = {
          ...message("ally", [status(ME, statusId)]),
          cause: "degeneration",
        };
        expect(soundsForCombat(tick, ME, undefined)).toEqual([]);
      });
    });
  }

  it("plays a hex and the damage beside it as two cues", () => {
    const both = message("foe", [
      status(ME, "pacifism"),
      { kind: "damage", targetId: ME, amount: 9, critical: false },
    ]);
    expect(soundsForCombat(both, ME, undefined)).toEqual(["hex-on", "hit-taken"]);
  });

  /** You and an ally on team 0, a foe on team 1. */
  const sides = snapshot([player(ME), player("ally", { team: 0 }), player("foe")]);

  it("plays no shout for a foe's shout on you", () => {
    const coward = skill("foe", "warrior.coward", [
      { kind: "knocked-down", targetId: ME, durationSeconds: 2 },
    ]);
    expect(soundsForCombat(coward, ME, sides)).not.toContain("shout");
    const alone = skill("foe", "warrior.youre-all-alone", [status(ME, "crippled")]);
    expect(soundsForCombat(alone, ME, sides)).toEqual([]);
  });

  it("plays no shout before the first snapshot, when no side is known", () => {
    const ally = skill("ally", "warrior.for-great-justice", [status(ME, "regeneration")]);
    expect(soundsForCombat(ally, ME, undefined)).toEqual(["enchant-on"]);
  });

  for (const [cue, skillId, statusId] of [
    ["shout", "warrior.for-great-justice", "regeneration"],
    ["shout", "paragon.defensive-anthem", "regeneration"],
    ["form-on", "dervish.avatar-of-melandru", "avatar-of-melandru"],
  ] as const) {
    describe(`${cue} from ${skillId}`, () => {
      it("plays when it reaches you", () => {
        const sounds = soundsForCombat(skill("ally", skillId, [status(ME, statusId)]), ME, sides);
        expect(sounds.filter((id) => id === cue)).toEqual([cue]);
      });

      it("stays silent when it reaches only others", () => {
        const others = skill(ME, skillId, [status("ally", statusId), status("foe", statusId)]);
        expect(soundsForCombat(others, ME, sides)).toEqual([]);
      });

      it("plays once however many of its events touch you", () => {
        const many = skill("ally", skillId, [status(ME, statusId), status(ME, statusId)]);
        expect(soundsForCombat(many, ME, sides).filter((id) => id === cue)).toEqual([cue]);
      });

      it("stays silent for a tick", () => {
        const tick: CombatMessage = {
          ...skill("ally", skillId, [status(ME, statusId)]),
          cause: "degeneration",
        };
        expect(soundsForCombat(tick, ME, sides)).toEqual([]);
      });
    });
  }
});

describe("soundsForSkillGround (#3297)", () => {
  /** A well of suffering hurts foes; a healing spring only helps allies. */
  const HARMFUL = "necromancer.well-of-suffering";
  const HELPFUL = "ranger.healing-spring";
  const area = (id: number, skillId: string, team: number, x = 0): GroundEffectSnapshot => ({
    id,
    skillId,
    team,
    x,
    y: 0,
    layer: 0,
    radius: 100,
    endsAt: 10,
    durationSeconds: 10,
  });
  const world = (
    groundEffects: GroundEffectSnapshot[],
    players: PlayerSnapshot[] = [player(ME)],
  ): MatchSnapshot => ({ ...snapshot(players), groundEffects });
  const spirit = (sessionId: string, x: number, team = 1): PlayerSnapshot =>
    player(sessionId, {
      x,
      team,
      creature: {
        ownerId: null,
        kind: "spirit",
        look: "spirit",
        mode: null,
        armedAttack: null,
        leaderId: null,
      },
    });

  it("warns of a foe's harmful area appearing with you inside", () => {
    expect(soundsForSkillGround(world([]), world([area(1, HARMFUL, 1)]), ME)).toEqual([
      "area-warn",
    ]);
  });

  it("warns of one appearing within reach of its edge", () => {
    const near = area(1, HARMFUL, 1, 100 + AREA_WARN_REACH);
    expect(soundsForSkillGround(world([]), world([near]), ME)).toEqual(["area-warn"]);
  });

  it("stays silent for your own side's area", () => {
    expect(soundsForSkillGround(world([]), world([area(1, HARMFUL, 0)]), ME)).toEqual([]);
  });

  it("stays silent for a foe's area that only helps foes", () => {
    expect(soundsForSkillGround(world([]), world([area(1, HELPFUL, 1)]), ME)).toEqual([]);
  });

  it("stays silent for the same area in the next snapshot", () => {
    const pool = area(1, HARMFUL, 1);
    expect(soundsForSkillGround(world([pool]), world([pool]), ME)).toEqual([]);
  });

  it("stays silent for an area 150 from your edge", () => {
    const far = area(1, HARMFUL, 1, 100 + 150);
    expect(soundsForSkillGround(world([]), world([far]), ME)).toEqual([]);
  });

  it("stays silent for an area on another layer", () => {
    const below = { ...area(1, HARMFUL, 1), layer: 1 };
    expect(soundsForSkillGround(world([]), world([below]), ME)).toEqual([]);
  });

  it("plays for a spirit of either side summoned within earshot", () => {
    for (const team of [0, 1]) {
      const next = world([], [player(ME), spirit("spirit", SPIRIT_EARSHOT - 1, team)]);
      expect(soundsForSkillGround(world([]), next, ME)).toEqual(["spirit-up"]);
    }
  });

  it("stays silent for a spirit summoned just past earshot", () => {
    const next = world([], [player(ME), spirit("spirit", SPIRIT_EARSHOT + 1)]);
    expect(soundsForSkillGround(world([]), next, ME)).toEqual([]);
  });

  it("stays silent for a spirit already standing", () => {
    const both = world([], [player(ME), spirit("spirit", 10)]);
    expect(soundsForSkillGround(both, both, ME)).toEqual([]);
  });

  it("stays silent without a prev, or without a player of your own", () => {
    const next = world([area(1, HARMFUL, 1)], [player(ME), spirit("spirit", 10)]);
    expect(soundsForSkillGround(undefined, next, ME)).toEqual([]);
    expect(soundsForSkillGround(world([], []), { ...next, players: [] }, ME)).toEqual([]);
  });
});

describe("castVoices (#3298)", () => {
  const skillWhere = (wanted: (skill: Skill) => boolean): Skill => {
    const skill = IMPLEMENTED_SKILLS.find(wanted);
    if (skill === undefined) {
      throw new Error("no such skill in the catalog");
    }
    return skill;
  };
  const monkSpell = skillWhere(
    (s) => s.profession === "monk" && s.type === "spell" && s.activationSeconds > 0,
  );
  const otherSpell = skillWhere(
    (s) =>
      s.profession === "monk" && s.type === "spell" && castPitch(s.id) !== castPitch(monkSpell.id),
  );
  const instant = skillWhere((s) => s.activationSeconds === 0 && s.attack === undefined);
  const seat = { selfId: ME, at: undefined };
  const at = (x: number, extra: Partial<PlayerSnapshot> = {}): Partial<PlayerSnapshot> => ({
    x,
    ...extra,
  });
  const before = (...others: PlayerSnapshot[]): MatchSnapshot => snapshot([player(ME), ...others]);

  it("voices a foe at 300 starting a Monk spell: the Monk base and the spell motif, at its pitch", () => {
    const after = snapshot([player(ME), player("foe", at(300, casting(monkSpell.id)))]);
    expect(castVoices(before(player("foe", at(300))), after, seat)).toEqual([
      expect.objectContaining({
        base: "cast-base-monk",
        motif: "cast-motif-spell",
        rate: castPitch(monkSpell.id),
      }),
    ]);
  });

  it("pitches the same skill the same every time, and another skill of its kind apart", () => {
    const first = castVoices(
      before(player("foe", at(300))),
      snapshot([player(ME), player("foe", at(300, casting(monkSpell.id)))]),
      seat,
    );
    const again = castVoices(
      before(player("ally", at(400, { team: 0 }))),
      snapshot([player(ME), player("ally", at(400, { team: 0, ...casting(monkSpell.id) }))]),
      seat,
    );
    expect(again[0]?.rate).toBe(first[0]?.rate);
    expect(castPitch(otherSpell.id)).not.toBe(castPitch(monkSpell.id));
  });

  it("is silent for a foe just out of earshot", () => {
    const far = CAST_EARSHOT + 1;
    const after = snapshot([player(ME), player("foe", at(far, casting(monkSpell.id)))]);
    expect(castVoices(before(player("foe", at(far))), after, seat)).toEqual([]);
  });

  it("fades a cast with distance, and an ally's under a foe's", () => {
    const gainOf = (id: string, x: number, team: number): number => {
      const after = snapshot([player(ME), player(id, at(x, { team, ...casting(monkSpell.id) }))]);
      return castVoices(before(player(id, at(x, { team }))), after, seat)[0]?.gain ?? 0;
    };
    expect(gainOf("foe", 100, 1)).toBeCloseTo(1);
    expect(gainOf("foe", 200, 1)).toBeCloseTo(1);
    expect(gainOf("foe", 700, 1)).toBeCloseTo(10 ** (-12 / 20));
    expect(gainOf("ally", 100, 0)).toBeCloseTo(10 ** (-3 / 20));
  });

  it("voices your own cast quietly, in place of cast-self", () => {
    const after = snapshot([player(ME, casting(monkSpell.id))]);
    const voices = castVoices(snapshot([player(ME)]), after, seat);
    expect(voices.map(({ base, motif }) => [base, motif])).toEqual([
      ["cast-base-monk", "cast-motif-spell"],
    ]);
    expect(voices[0]?.gain).toBeLessThan(0.5);
    expect(soundsForSnapshot(snapshot([player(ME)]), after)).toEqual([]);
  });

  it("keeps the limit of 5 casts starting at once, and never cuts your target's", () => {
    const ids = ["near", "mid", "ally", "far", "target"];
    const where = (id: string): Partial<PlayerSnapshot> =>
      id === "ally" ? at(100, { team: 0 }) : at(id === "near" ? 150 : id === "mid" ? 300 : 650);
    const idle = snapshot([
      player(ME, { targetSessionId: "target" }),
      ...ids.map((id) => player(id, where(id))),
    ]);
    const busy = snapshot([
      player(ME, { targetSessionId: "target" }),
      ...ids.map((id) => player(id, { ...where(id), ...casting(monkSpell.id) })),
    ]);
    const voices = castVoices(idle, busy, seat);
    expect(voices).toHaveLength(CAST_VOICE_LIMIT);
    expect(voices.map(({ priority }) => Math.floor(priority))).toEqual([0, 2, 2]);
  });

  it("hears a watcher's casts from its camera, with no own or target voice", () => {
    const watcher = { selfId: "watcher", at: { x: 1000, y: 0 } };
    const idle = snapshot([player("a", at(1200)), player("b", at(0))]);
    const busy = snapshot([
      player("a", at(1200, casting(monkSpell.id))),
      player("b", at(0, casting(monkSpell.id))),
    ]);
    expect(castVoices(idle, busy, watcher)).toHaveLength(1);
  });

  it("is silent without a previous snapshot", () => {
    const busy = snapshot([player(ME), player("foe", at(100, casting(monkSpell.id)))]);
    expect(castVoices(undefined, busy, seat)).toEqual([]);
  });

  it("voices an instant skill at its activation, and a timed one never from its message", () => {
    const latest = snapshot([player(ME), player("foe", at(300))]);
    const used = (skill: Skill): CombatMessage => ({
      ...message("foe", [
        { kind: "skill-used", casterId: "foe", skillId: skill.id, targetId: "foe" },
      ]),
      cause: "skill",
      skillId: skill.id,
    });
    expect(instantCastVoice(used(instant), latest, seat)).toMatchObject(castLayers(instant));
    expect(instantCastVoice(used(monkSpell), latest, seat)).toBeUndefined();
  });

  it("is silent for an instant's trigger, which carries no use", () => {
    const latest = snapshot([player(ME), player("foe", at(300))]);
    const riposte = getSkill("warrior.riposte");
    expect(riposte?.activationSeconds).toBe(0);
    const trigger: CombatMessage = {
      ...message("foe", [{ kind: "damage", targetId: ME, amount: 20, critical: false }]),
      skillId: "warrior.riposte",
    };
    expect(instantCastVoice(trigger, latest, seat)).toBeUndefined();
  });
});

describe("castPitch (#3298)", () => {
  it("pitches every catalog skill within -5 to +6 semitones", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      const semitones = castPitchStep(skill.id) / 2;
      expect(semitones, skill.id).toBeGreaterThanOrEqual(-5);
      expect(semitones, skill.id).toBeLessThanOrEqual(6);
    }
  });

  it("gives no two-layer sound to more than 6 skills", () => {
    const buckets = new Map<string, number>();
    for (const skill of IMPLEMENTED_SKILLS) {
      const { base, motif, rate } = castLayers(skill);
      const bucket = `${base} ${motif} ${String(rate)}`;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const [worst, size] = [...buckets].reduce((a, b) => (b[1] > a[1] ? b : a));
    console.info(`the worst cast sound is shared by ${String(size)} skills: ${worst}`);
    expect(size).toBeLessThanOrEqual(6);
  });
});

import {
  NO_UPGRADES,
  MatchSimulation,
  NO_RANKS,
  StatusSet,
  type ActiveStatus,
  type Participant,
} from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  MAX_WIRE_STATUSES,
  parseWireEnded,
  type PeerHello,
  type WireCape,
  type WireEnded,
} from "@vibewars/game-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  RULESET,
  WEAPON_SWAPS_PER_SECOND,
  WEAPON_SWAP_BURST,
  type PlannedSeats,
} from "./match-host.js";
import {
  ARENA,
  answerChallenges,
  hello,
  helloAs,
  playerIn,
  self,
  settle,
  startMatch,
  starterBuild,
  toJson,
} from "./match-harness.test-support.js";
import type { MatchSnapshot } from "./match-connection.js";
import { MAX_MESSAGE_BYTES, messageBytes } from "./transport.js";

/** A guild cape (#1422), as the designer makes one. */
const CAPE: WireCape = { main: "violet", trim: "white", emblem: "diamond" };

/** One entry of a lobby's plan. */
type PlannedSeat = NonNullable<ReturnType<PlannedSeats["get"]>>;

describe("a P2P match (#375)", () => {
  it("seats remote players and the host's own, and moves them", async () => {
    const match = startMatch();
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    expect(
      local
        .getSnapshot()
        .players.map((p) => p.sessionId)
        .sort(),
    ).toEqual([local.selfSessionId, remote.selfSessionId].sort());
    expect(self(local)?.team).not.toBe(self(remote)?.team);
    expect(self(local)?.x).toBe(ARENA.spawns[0]?.position.x);

    remote.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.5);
    const moved = (self(remote)?.x ?? 0) - (ARENA.spawns[1]?.position.x ?? 0);
    expect(moved).toBeGreaterThan(RULESET.movement.maxSpeedUnitsPerSecond * 0.3);
  });

  it("ticks nothing more once the host has closed it", async () => {
    const match = startMatch();
    await match.step(0.05);

    await match.host.close("host-left");
    const send = vi.spyOn(match.hostTransport, "send");
    await match.step(1);

    expect(match.host.phase).toBe("finished");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at most 32 statuses a player, so 33 freeze no guest (#636)", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    const many: ActiveStatus[] = Array.from({ length: MAX_WIRE_STATUSES + 1 }, (_, i) => ({
      id: i % 2 === 0 ? "burning" : "regeneration",
      remainingSeconds: i,
      durationSeconds: MAX_WIRE_STATUSES + 1,
      attacksLeft: undefined,
      hitsLeft: undefined,
      unblockableLeft: undefined,
      attacksMadeLeft: undefined,
      spellsLeft: undefined,
      castsLeft: undefined,
      skillsLeft: undefined,
      ownSkillsLeft: undefined,
      triggersLeft: undefined,
      reflectionsLeft: undefined,
      touchFailsLeft: undefined,
      sourceId: remote.selfSessionId,
      sourceSkillId: undefined,
      ranks: NO_RANKS,
      outbreak: null,
      maintained: null,
      projected: false,
      returnPoint: null,
      stepTargetId: null,
    }));
    vi.spyOn(StatusSet.prototype, "active", "get").mockReturnValue(many);
    const before = remote.getSnapshot().elapsedSeconds;

    await match.step(0.5);

    expect(remote.getSnapshot().elapsedSeconds).toBeGreaterThan(before);
    expect(self(remote)?.statuses).toHaveLength(MAX_WIRE_STATUSES);
    vi.restoreAllMocks();
  });

  it("sends each status with its end on the match clock, its length and its caster (#803)", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    const bleeding: ActiveStatus = {
      id: "bleeding",
      remainingSeconds: 5.25,
      durationSeconds: 8,
      attacksLeft: undefined,
      hitsLeft: undefined,
      unblockableLeft: undefined,
      attacksMadeLeft: undefined,
      spellsLeft: undefined,
      castsLeft: undefined,
      skillsLeft: undefined,
      ownSkillsLeft: undefined,
      triggersLeft: undefined,
      reflectionsLeft: undefined,
      touchFailsLeft: undefined,
      sourceId: "foe",
      sourceSkillId: undefined,
      ranks: NO_RANKS,
      outbreak: null,
      maintained: null,
      projected: false,
      returnPoint: null,
      stepTargetId: null,
    };
    vi.spyOn(StatusSet.prototype, "active", "get").mockReturnValue([bleeding]);

    await match.step(0.5);

    const snapshot = remote.getSnapshot();
    const [sent] = self(remote)?.statuses ?? [];
    expect(sent).toMatchObject({ id: "bleeding", durationSeconds: 8, casterId: "foe" });
    // To 0.1 s: on 20 Hz ticks, the rounding is off by 0 or exactly 0.05.
    expect(Math.abs((sent?.endsAt ?? 0) - snapshot.elapsedSeconds - 5.25)).toBeLessThan(0.051);
    vi.restoreAllMocks();
  });
});

describe("guild tags (#1406)", () => {
  it("seats a hello's tag, sanitised, in every snapshot and the summary; a bad one as none", async () => {
    const match = startMatch();
    const { connection: ann } = await match.join(hello({ name: "Ann", guildTag: " Vb1 " }));
    const { connection: bob } = await match.join(hello({ name: "Bob", guildTag: "[x]" }));
    await match.step(1 / RULESET.tickRateHz);

    for (const who of [ann, bob]) {
      expect(playerIn(who.getSnapshot(), ann.selfSessionId)?.guildTag).toBe("Vb1");
      expect(playerIn(who.getSnapshot(), bob.selfSessionId)?.guildTag).toBeUndefined();
    }

    await match.host.close("host-left");
    await settle();
    expect(bob.getSnapshot().summary?.map(({ name, guildTag }) => [name, guildTag])).toEqual([
      ["Ann", "Vb1"],
      ["Bob", null],
    ]);
  });
});

describe("guild capes (#1422)", () => {
  it("seats a hello's cape in every snapshot, and none without a valid tag or for a bad one", async () => {
    const match = startMatch();
    const { connection: ann } = await match.join(
      hello({ name: "Ann", guildTag: "Vb1", guildCape: CAPE }),
    );
    const { connection: bob } = await match.join(
      hello({ name: "Bob", guildTag: "[x]", guildCape: CAPE }),
    );
    // A modified client's: the parser reads no cape out of it.
    const odd = { ...hello({ name: "Cy", guildTag: "Cy" }), guildCape: { ...CAPE, main: "red" } };
    const { connection: cy } = await match.join(odd as unknown as PeerHello);
    await match.step(1 / RULESET.tickRateHz);

    for (const who of [ann, bob, cy]) {
      expect(playerIn(who.getSnapshot(), ann.selfSessionId)?.guildCape).toEqual(CAPE);
      expect(playerIn(who.getSnapshot(), bob.selfSessionId)?.guildCape).toBeUndefined();
      expect(playerIn(who.getSnapshot(), cy.selfSessionId)?.guildCape).toBeUndefined();
    }
  });
});

describe("the match summary's size (#1057)", () => {
  it("fits a full lobby's lines in one `ended`", () => {
    // Sixteen names of sixteen four-byte characters, the most a name keeps,
    // and numbers no match reaches.
    const ended: WireEnded = {
      winningTeam: 0,
      endReason: "annihilation",
      summary: Array.from({ length: MAX_LOBBY_PLAYERS }, (_, i) => ({
        id: `player-${String(1000 + i)}`,
        name: "\u{1D54E}".repeat(16),
        guildTag: "WWWW",
        team: i % 2 === 0 ? 0 : 1,
        damage: 9_999_999,
        healing: 9_999_999,
        taken: 9_999_999,
        kills: 9_999,
        deaths: 9_999,
        interrupts: 9_999,
      })),
    };
    expect(parseWireEnded(ended)).toEqual(ended);
    expect(messageBytes(ended)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });
});

describe("corpses on the wire (#466)", () => {
  it("sends whether a corpse was exploited", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    expect(self(remote)?.corpseExploited).toBe(false);

    const participants = Object.getOwnPropertyDescriptor(MatchSimulation.prototype, "participants")
      ?.value as (this: MatchSimulation) => IterableIterator<Participant>;
    vi.spyOn(MatchSimulation.prototype, "participants").mockImplementation(function* (
      this: MatchSimulation,
    ) {
      for (const participant of participants.call(this)) {
        yield participant.id === remote.selfSessionId
          ? {
              ...participant,
              combatant: Object.create(participant.combatant, { dead: { value: true } }),
              corpseExploited: true,
            }
          : participant;
      }
    });
    await match.step(0.05);
    vi.restoreAllMocks();

    expect(self(remote)).toMatchObject({ dead: true, corpseExploited: true });
  });
});

describe("weapon sets (#489)", () => {
  const TICK = 1 / RULESET.tickRateHz;

  /** The Warrior/Monk starter, with a bow in set 2. */
  function swapper(): PeerHello {
    const build = starterBuild("Warrior/Monk");
    const [set1] = build.equipment.weaponSets;
    const bow = {
      mainHand: { weaponId: "recurve-bow", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: null,
    };
    return hello({
      build: toJson({
        ...build,
        equipment: { ...build.equipment, weaponSets: [set1, bow, null, null] },
      }),
    });
  }

  it("swaps a seat's set on its intent, and tells that peer alone", async () => {
    const match = startMatch();
    const { connection: other } = await match.join();
    const { connection: remote } = await match.join(swapper());
    await match.step(TICK);
    expect(self(remote)?.weaponId).toBe("sword");
    expect(remote.weaponSets).toMatchObject({ active: 0, pending: null });
    expect(remote.weaponSets?.sets[1]).toEqual({ weaponId: "recurve-bow", offhandId: null });
    const send = vi.spyOn(match.hostTransport, "send");

    remote.sendIntent({ kind: "weapon-set", set: 1 });
    await settle();
    await match.step(TICK);

    expect(self(remote)?.weaponId).toBe("recurve-bow");
    expect(playerIn(other.getSnapshot(), remote.selfSessionId)?.weaponId).toBe("recurve-bow");
    expect(remote.weaponSets?.active).toBe(1);
    expect(other.weaponSets?.sets[1]).toBeNull();
    const sent = send.mock.calls.filter(([channel]) => channel === "weapon-sets");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[2]).toBeDefined();
    vi.restoreAllMocks();
  });

  it("says nothing for an empty set", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join(swapper());
    await match.step(TICK);
    const send = vi.spyOn(match.hostTransport, "send");

    remote.sendIntent({ kind: "weapon-set", set: 2 });
    await settle();
    await match.step(TICK);

    expect(send.mock.calls.filter(([channel]) => channel === "refused")).toEqual([]);
    expect(remote.weaponSets?.active).toBe(0);
    vi.restoreAllMocks();
  });

  it(`handles ${String(WEAPON_SWAP_BURST)} swaps at once, drops and counts the rest, and refills`, async () => {
    const match = startMatch();
    const { connection: remote } = await match.join(swapper());
    await match.step(TICK);

    // Set 2, set 1, ...: the last handled is set 1, so a dropped one would show.
    for (let i = 0; i < WEAPON_SWAP_BURST + 3; i += 1) {
      remote.sendIntent({ kind: "weapon-set", set: i % 2 === 0 ? 1 : 0 });
    }
    remote.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    const before = self(remote)?.x ?? 0;
    await settle();
    await match.step(TICK);

    expect(match.host.droppedWeaponSwaps).toBe(3);
    expect(remote.weaponSets?.active).toBe(0);
    await match.step(TICK);
    // The move was not a swap: it landed.
    expect(self(remote)?.x).toBeGreaterThan(before);

    await match.step(1 / WEAPON_SWAPS_PER_SECOND);
    remote.sendIntent({ kind: "weapon-set", set: 1 });
    await settle();
    await match.step(TICK);
    expect(remote.weaponSets?.active).toBe(1);
    expect(match.host.droppedWeaponSwaps).toBe(3);
  });

  it("sends energy below 0 as 0", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(TICK);

    const participants = Object.getOwnPropertyDescriptor(MatchSimulation.prototype, "participants")
      ?.value as (this: MatchSimulation) => IterableIterator<Participant>;
    vi.spyOn(MatchSimulation.prototype, "participants").mockImplementation(function* (
      this: MatchSimulation,
    ) {
      for (const participant of participants.call(this)) {
        yield participant.id === remote.selfSessionId
          ? {
              ...participant,
              combatant: Object.create(participant.combatant, { energy: { value: -7 } }),
            }
          : participant;
      }
    });
    await match.step(TICK);
    vi.restoreAllMocks();

    expect(self(remote)?.energy).toBe(0);
  });
});

describe("pet orders (#1110)", () => {
  const TICK = 1 / RULESET.tickRateHz;

  /** The Ranger/Mesmer starter, with Charm Animal for Savage Shot. */
  function houndmaster(): PeerHello {
    const build = starterBuild("Ranger/Mesmer");
    return hello({
      build: toJson({ ...build, skillBar: ["ranger.charm-animal", ...build.skillBar.slice(1)] }),
    });
  }

  it("takes the owner's order for their wolf, and drops anyone else's", async () => {
    const match = startMatch();
    const { connection: owner } = await match.join(houndmaster());
    const { connection: other } = await match.join();
    await match.step(TICK);
    const wolf = owner
      .getSnapshot()
      .players.find((player) => player.creature?.ownerId === owner.selfSessionId);
    expect(wolf?.creature).toMatchObject({ kind: "pet", mode: "guard" });
    const heel = {
      kind: "command",
      creatureId: wolf?.sessionId ?? "",
      order: { kind: "mode", mode: "heel" },
    } as const;

    other.sendIntent(heel);
    await settle();
    await match.step(TICK);
    expect(playerIn(owner.getSnapshot(), heel.creatureId)?.creature?.mode).toBe("guard");

    owner.sendIntent(heel);
    await settle();
    await match.step(TICK);
    expect(playerIn(owner.getSnapshot(), heel.creatureId)?.creature?.mode).toBe("heel");
    expect(playerIn(other.getSnapshot(), heel.creatureId)?.creature?.mode).toBe("heel");
  });
});

describe("a Team Lobby's seats (#1458)", () => {
  const TICK = 1 / RULESET.tickRateHz;

  it("plays the build the lobby assigned a seat, not the one its hello brings", async () => {
    const assigned = starterBuild("Monk/Elementalist");
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([
        [
          "host/local",
          { team: 0, name: "Me", guildTag: null, guildCape: null, bot: false, build: assigned },
        ],
      ]),
    });
    const local = await match.joinLocal(helloAs("Warrior/Monk"));
    await match.step(TICK);
    expect(local.skillBar.map((slot) => slot?.id ?? null)).toEqual(assigned.skillBar);
    expect(self(local)?.name).toBe("Me");
  });
});

describe("a lobby's bots (#1193)", () => {
  const TICK = 1 / RULESET.tickRateHz;
  /** A bot's planned seat, keyed by its name as a lobby keys it by its id. */
  const bot = (team: 0 | 1, name: string, build: string) =>
    [
      name,
      { team, name, guildTag: null, guildCape: null, bot: true, build: starterBuild(build) },
    ] as const;
  const human = (team: 0 | 1) =>
    [
      "host/local",
      { team, name: "Me", guildTag: "VIBE", guildCape: CAPE, bot: false, build: null },
    ] as const;
  const named = (snapshot: MatchSnapshot, name: string) =>
    snapshot.players.find((player) => player.name === name);

  it("seats a bot at once, on its team, and it casts at a foe in range within 10 s", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([
        bot(1, "Elementalist Bot", "Elementalist/Mesmer"),
        human(0),
      ]),
    });
    const local = await match.joinLocal();
    await match.step(TICK);
    expect(named(local.getSnapshot(), "Elementalist Bot")).toMatchObject({ team: 1, bot: true });
    expect(self(local)?.bot).toBe(false);
    // The lobby's tag and cape, whatever the hello says; a bot wears neither (#1406, #1422).
    expect(self(local)?.guildTag).toBe("VIBE");
    expect(self(local)?.guildCape).toEqual(CAPE);
    expect(named(local.getSnapshot(), "Elementalist Bot")?.guildTag).toBeUndefined();
    expect(named(local.getSnapshot(), "Elementalist Bot")?.guildCape).toBeUndefined();
    let cast: string | undefined;
    for (let t = 0; t < 10 && cast === undefined; t += 0.1) {
      await match.step(0.1);
      cast = named(local.getSnapshot(), "Elementalist Bot")?.castingSkillId;
    }
    expect(cast).toBeDefined();
  });

  it("lets no peer play a bot's seat, even one calling itself by the bot's id", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([bot(1, "Warrior Bot", "Warrior/Monk"), human(0)]),
    });
    const local = await match.joinLocal();
    const intruder = match.network.join("Warrior Bot");
    const refused: unknown[] = [];
    intruder.on("refuse", (data) => refused.push(data));
    await settle();
    intruder.send("hello", hello(), "host");
    await settle();
    expect(refused).toHaveLength(1);
    await match.step(TICK);
    const before = named(local.getSnapshot(), "Warrior Bot")?.y;
    for (let i = 0; i < 10; i += 1) {
      intruder.send("intent", { kind: "move", dirX: 0, dirY: 1 }, "host");
      await match.step(TICK);
    }
    // It walks to its foe, level with it: never down, as the intent asked.
    expect(named(local.getSnapshot(), "Warrior Bot")?.y).toBeCloseTo(before ?? Number.NaN, 0);
  });

  it("never asks a peer to prove itself for a bot's seat, which has no token", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([bot(1, "Warrior Bot", "Warrior/Monk"), human(0)]),
    });
    const local = await match.joinLocal();
    await match.step(TICK);
    const playerId = named(local.getSnapshot(), "Warrior Bot")?.sessionId ?? "";
    const intruder = match.network.join("Warrior Bot");
    const challenges: unknown[] = [];
    intruder.on("rejoin-challenge", (data) => challenges.push(data));
    answerChallenges(intruder, "");
    await settle();
    intruder.send("hello", hello({ rejoin: { playerId } }), "host");
    await match.step(0.3);
    expect(challenges).toEqual([]);
    expect(named(local.getSnapshot(), "Warrior Bot")?.bot).toBe(true);
  });

  it("is not abandoned for bots that never say hello, even with nobody else seated", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([
        bot(0, "Monk Bot", "Monk/Elementalist"),
        bot(1, "Ranger Bot", "Ranger/Mesmer"),
      ]),
    });
    await match.step(1);
    expect(match.host.abandoned).toBe(false);
    expect(match.host.phase).toBe("active");
  });

  it("fights the foe its team called", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([
        bot(1, "Elementalist Bot", "Elementalist/Mesmer"),
        human(1),
        bot(0, "Warrior Bot", "Warrior/Monk"),
        bot(0, "Monk Bot", "Monk/Elementalist"),
      ]),
    });
    const local = await match.joinLocal();
    await match.step(0.5);
    const targetOf = () => named(local.getSnapshot(), "Elementalist Bot")?.targetSessionId;
    const warrior = named(local.getSnapshot(), "Warrior Bot")?.sessionId;
    const monk = named(local.getSnapshot(), "Monk Bot")?.sessionId ?? "";
    // The nearer of two whole foes, before any call.
    expect(targetOf()).toBe(warrior);
    local.sendCall({ kind: "target", targetId: monk });
    await settle();
    // Once the cast under way, if any, is done.
    for (let t = 0; t < 5 && targetOf() !== monk; t += 0.1) {
      await match.step(0.1);
    }
    expect(targetOf()).toBe(monk);
  });
});

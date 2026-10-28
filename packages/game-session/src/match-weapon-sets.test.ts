import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  MatchSimulation,
  defaultBuildEquipment,
  validatePlayerBuild,
  type Participant,
  type PlayerBuild,
} from "@vibewars/game-core";
import { describe, expect, it, vi } from "vitest";

import { TICK_SECONDS, hello, self, startMatch, toJson } from "./match-harness.test-support.js";
import { WEAPON_SWAP_BURST, WEAPON_SWAPS_PER_SECOND } from "./match-host.js";

/**
 * Swapping weapon sets in a P2P match (#489, ADR-0036): the intent, the
 * per-seat `weapon-sets` channel, the host's swap budget and the hidden
 * negative energy.
 */

const DEFAULT_GEAR = defaultBuildEquipment("elementalist");
const [SET_1] = DEFAULT_GEAR.weaponSets;
const SWORD = { mainHand: { weaponId: "sword", requirementAttributeId: null }, offHand: null };

/** An elementalist carrying its default set 1 and a sword in set 2. */
const TWO_SETS: PlayerBuild = {
  name: "Swapper",
  primaryProfession: "elementalist",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "elementalist.fire-magic", rank: 12 }],
  skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
  equipment: { ...DEFAULT_GEAR, weaponSets: [SET_1, SWORD, null, null] },
};

async function joinSwapper() {
  const match = startMatch({ random: () => 0 });
  const joined = await match.join(hello({ build: toJson(TWO_SETS) }));
  await match.step(TICK_SECONDS);
  return { match, ...joined };
}

describe("weapon sets in a P2P match (#489)", () => {
  it("has a legal fixture build", () => {
    expect(validatePlayerBuild(TWO_SETS, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
  });

  it("sends the sets on welcome, and swaps the seat on a weapon-set intent", async () => {
    const { match, connection } = await joinSwapper();
    expect(connection.weaponSets).toEqual({
      sets: [
        { weaponId: SET_1.mainHand.weaponId, offhandId: SET_1.offHand?.offhandId ?? null },
        { weaponId: "sword", offhandId: null },
        null,
        null,
      ],
      active: 0,
      pending: null,
    });
    expect(self(connection)?.weaponId).toBe(SET_1.mainHand.weaponId);

    connection.sendIntent({ kind: "weapon-set", set: 1 });
    await match.step(TICK_SECONDS * 2);
    expect(self(connection)?.weaponId).toBe("sword");
    expect(connection.weaponSets?.active).toBe(1);
  });

  it("sends weapon-sets after a swap to that peer alone, and not again while nothing changes", async () => {
    const { match, connection, transport } = await joinSwapper();
    const other = await match.join();
    await match.step(TICK_SECONDS);
    const send = vi.spyOn(match.hostTransport, "send");
    const sentTo = () =>
      send.mock.calls.filter(([channel]) => channel === "weapon-sets").map(([, , to]) => to);

    await match.step(TICK_SECONDS * 3);
    expect(sentTo()).toEqual([]);

    connection.sendIntent({ kind: "weapon-set", set: 1 });
    await match.step(TICK_SECONDS * 3);
    expect(sentTo()).toEqual([transport.selfId]);
    expect(other.connection.weaponSets?.active).toBe(0);
    vi.restoreAllMocks();
  });

  it("does nothing for an empty set, quietly", async () => {
    const { match, connection } = await joinSwapper();
    const refused: unknown[] = [];
    connection.onCastRefused((message) => refused.push(message));
    connection.sendIntent({ kind: "weapon-set", set: 2 });
    await match.step(TICK_SECONDS * 2);
    expect(connection.weaponSets?.active).toBe(0);
    expect(refused).toEqual([]);
  });

  it(`handles ${String(WEAPON_SWAP_BURST)} swaps at once, drops and counts the rest, and leaves other intents be`, async () => {
    const { match, connection } = await joinSwapper();
    for (let i = 0; i < WEAPON_SWAP_BURST + 3; i += 1) {
      connection.sendIntent({ kind: "weapon-set", set: i % 2 === 0 ? 1 : 0 });
    }
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    const before = self(connection)?.x ?? 0;
    await match.step(TICK_SECONDS * 2);
    expect(match.host.droppedWeaponSwaps).toBe(3);
    // An even burst swaps there and back.
    expect(connection.weaponSets?.active).toBe(0);
    expect(self(connection)?.x ?? 0).toBeGreaterThan(before);

    connection.sendIntent({ kind: "move", dirX: 0, dirY: 0 });
    await match.step(1 / WEAPON_SWAPS_PER_SECOND - TICK_SECONDS);
    connection.sendIntent({ kind: "weapon-set", set: 1 });
    await match.step(TICK_SECONDS * 2);
    expect(match.host.droppedWeaponSwaps).toBe(3);
    expect(connection.weaponSets?.active).toBe(1);
  });

  it("sends energy below 0 as 0", async () => {
    const { match, connection } = await joinSwapper();
    const participants = Object.getOwnPropertyDescriptor(MatchSimulation.prototype, "participants")
      ?.value as (this: MatchSimulation) => IterableIterator<Participant>;
    vi.spyOn(MatchSimulation.prototype, "participants").mockImplementation(function* (
      this: MatchSimulation,
    ) {
      for (const participant of participants.call(this)) {
        yield participant.id === connection.selfSessionId
          ? {
              ...participant,
              combatant: Object.create(participant.combatant, { energy: { value: -7 } }),
            }
          : participant;
      }
    });
    await match.step(TICK_SECONDS);
    vi.restoreAllMocks();
    expect(self(connection)?.energy).toBe(0);
  });
});

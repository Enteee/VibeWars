import { defaultBuildEquipment, type PlayerBuild } from "@vibewars/game-core";
import { parseWireTraps, type WireTraps } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import type { PeerMatchConnection } from "./match-client.js";
import {
  TICK_SECONDS,
  hello,
  startMatch,
  toJson,
  type TestMatch,
} from "./match-harness.test-support.js";

/**
 * Traps through the host (#1105): hidden information, so a team's traps
 * reach that team's peers alone, on a channel of their own, and never a
 * snapshot.
 */

/** A Ranger whose first slot is Barbed Trap. */
const TRAPPER: PlayerBuild = {
  name: "Trapper",
  primaryProfession: "ranger",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "ranger.wilderness-survival", rank: 12 }],
  skillBar: ["ranger.barbed-trap", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("ranger"),
};

/** The same Ranger with Flame Trap (#1113). */
const FLAMER: PlayerBuild = {
  ...TRAPPER,
  skillBar: ["ranger.flame-trap", null, null, null, null, null, null, null],
};

interface Player {
  readonly connection: PeerMatchConnection;
  /** Every `traps` message this peer was sent. */
  readonly heard: WireTraps[];
}

async function joinListening(match: TestMatch, build = TRAPPER): Promise<Player> {
  const { connection, transport } = await match.join(hello({ build: toJson(build) }));
  const heard: WireTraps[] = [];
  transport.on("traps", (data) => {
    const traps = parseWireTraps(data);
    if (traps !== undefined) {
      heard.push(traps);
    }
  });
  return { connection, heard };
}

/** Three players, seated in turn: a and c on team 0, b on team 1; a sets a trap, `build`'s first. */
async function trapSet(match: TestMatch, build = TRAPPER) {
  const a = await joinListening(match, build);
  const b = await joinListening(match);
  const c = await joinListening(match);
  await match.step(TICK_SECONDS);
  a.connection.sendIntent({ kind: "use-skill", slot: 0 });
  await match.step(2.5);
  return { a, b, c };
}

describe("traps through the P2P host (#1105)", () => {
  it("shows a trap to its setter's team, and never sends it to a foe", async () => {
    const match = startMatch();
    const { a, b, c } = await trapSet(match);
    const [trap, ...others] = a.connection.getSnapshot().traps;
    expect(others).toEqual([]);
    expect(trap).toMatchObject({ skillId: "ranger.barbed-trap", team: 0, radius: 81 });
    expect(c.connection.getSnapshot().traps).toEqual([trap]);
    expect(b.connection.getSnapshot().traps).toEqual([]);
    for (const peer of [a, b, c]) {
      expect(peer.connection.getSnapshot().groundEffects).toEqual([]);
    }
    // Not only not shown: never sent.
    expect(b.heard.every(({ traps }) => traps.length === 0)).toBe(true);
  });

  it("tells the team again when a foe springs it, and the foe only through combat", async () => {
    const match = startMatch();
    const { a, b, c } = await trapSet(match);
    const [trap] = a.connection.getSnapshot().traps;
    if (trap === undefined) {
      throw new Error("no trap set");
    }
    const heardBefore = c.heard.length;
    const struck: string[] = [];
    b.connection.onCombat(({ skillId, casterSessionId }) => {
      if (skillId === "ranger.barbed-trap") {
        struck.push(casterSessionId);
      }
    });
    b.connection.sendIntent({ kind: "walk-to", x: trap.x, y: trap.y });
    await match.step(3);
    expect(c.connection.getSnapshot().traps).toEqual([]);
    expect(c.heard.length).toBe(heardBefore + 1);
    expect(struck).toContain(a.connection.selfSessionId);
    expect(b.heard.every(({ traps }) => traps.length === 0)).toBe(true);
  });

  it("shows a sprung Flame Trap's pulse to everyone, the foe included (#1113)", async () => {
    const match = startMatch();
    const { a, b, c } = await trapSet(match, FLAMER);
    const [trap] = a.connection.getSnapshot().traps;
    if (trap === undefined) {
      throw new Error("no trap set");
    }
    b.connection.sendIntent({ kind: "walk-to", x: trap.x, y: trap.y });
    let seen: readonly unknown[] = [];
    for (let i = 0; i < 40 && seen.length === 0; i += 1) {
      await match.step(TICK_SECONDS * 3);
      seen = b.connection.getSnapshot().groundEffects;
    }
    for (const peer of [a, b, c]) {
      expect(peer.connection.getSnapshot().traps).toEqual([]);
      expect(peer.connection.getSnapshot().groundEffects).toEqual([
        expect.objectContaining({ skillId: "ranger.flame-trap", team: 0, radius: 81 }),
      ]);
    }
  });

  it("gives a rejoining peer its team's traps", async () => {
    const match = startMatch();
    const { c } = await trapSet(match);
    await c.connection.disconnect();
    await match.step(TICK_SECONDS);
    const { connection: back } = await match.rejoin(c.connection);
    await match.step(TICK_SECONDS);
    expect(back.getSnapshot().traps).toHaveLength(1);
  });
});

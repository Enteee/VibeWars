import {
  ALL_OFFHANDS,
  ANNIHILATION_MATCH_RULES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  WEAPONS,
  type PlayerBuild,
  type ProfessionId,
} from "@vibewars/game-core";
import { PROTOCOL_VERSION, type JsonValue } from "@vibewars/game-protocol";
import { connectMatch, createLocalPeer, createMatchHost } from "@vibewars/game-session";
import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { describe, expect, it } from "vitest";

import { offhandMarkLayout } from "../render/arena-snapshot.js";
import { REST_FRAME } from "../render/attack-clock.js";
import { weaponMarkLayout } from "../render/weapon-mark.js";
import { DEFAULT_ARENA_ID, hostMap } from "../net/maps.js";
import { fromPlayerBuild, toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { characterAppearance, figureBody, type CharacterAppearance } from "./character-figure.js";

function starter(primary: ProfessionId): PlayerBuild {
  const build = STARTER_BUILDS.find((b) => b.primaryProfession === primary);
  if (build === undefined) {
    throw new Error(`no ${primary} starter`);
  }
  return build;
}

const WARRIOR = fromPlayerBuild(starter("warrior"), "warrior", 1);

const RANGER_BUILD = starter("ranger");
const LONGBOW_RANGER = fromPlayerBuild(
  {
    ...RANGER_BUILD,
    equipment: {
      ...RANGER_BUILD.equipment,
      weaponSets: [
        { mainHand: { weaponId: "longbow", requirementAttributeId: null }, offHand: null },
        null,
        null,
        null,
      ],
    },
  },
  "ranger",
  1,
);

const ILLEGAL: StoredCharacter = {
  ...WARRIOR,
  id: "illegal",
  skillBar: ["no.such-skill", null, null, null, null, null, null, null],
};

/** What a match host seats `character` holding, read off its first snapshot. */
async function hostSeats(character: StoredCharacter): Promise<CharacterAppearance> {
  const map = hostMap(DEFAULT_ARENA_ID);
  if (map === undefined) {
    throw new Error("no default arena");
  }
  const { host: transport, local } = createLocalPeer(createMemoryNetwork().join("host"));
  const host = createMatchHost({
    transport,
    map,
    seed: "figure",
    matchRules: ANNIHILATION_MATCH_RULES,
    random: () => 0,
    maxPlayers: 2,
    seats: null,
  });
  const connection = await connectMatch({
    transport: local,
    hostId: "host",
    hello: {
      protocolVersion: PROTOCOL_VERSION,
      name: character.name,
      build: JSON.parse(JSON.stringify(toPlayerBuild(character))) as JsonValue,
      rejoin: null,
    },
    timeoutMs: 1000,
  });
  host.advance(1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz);
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
  const self = connection
    .getSnapshot()
    .players.find((player) => player.sessionId === connection.selfSessionId);
  if (self === undefined) {
    throw new Error("not seated");
  }
  return { weaponId: self.weaponId, offhandId: self.offhandId };
}

describe("characterAppearance (#1250)", () => {
  it("holds what the host seats a default Warrior with: sword and shield", async () => {
    expect(characterAppearance(WARRIOR)).toEqual({ weaponId: "sword", offhandId: "shield" });
    expect(characterAppearance(WARRIOR)).toEqual(await hostSeats(WARRIOR));
  });

  it("holds what the host seats a Ranger with a longbow with", async () => {
    expect(characterAppearance(LONGBOW_RANGER)).toEqual({
      weaponId: "longbow",
      offhandId: undefined,
    });
    expect(characterAppearance(LONGBOW_RANGER)).toEqual(await hostSeats(LONGBOW_RANGER));
  });

  it("holds nothing for a build the host refuses: it plays a random starter instead", async () => {
    expect(characterAppearance(ILLEGAL)).toEqual({ weaponId: undefined, offhandId: undefined });
    // The host seats it holding a starter's weapon, not the build's.
    expect((await hostSeats(ILLEGAL)).weaponId).toBeDefined();
  });
});

describe("figureBody (#1250)", () => {
  it("is your own body at rest, at the arena's radius, facing right", () => {
    expect(figureBody({ weaponId: "sword", offhandId: "shield" })).toMatchObject({
      r: 14,
      facing: 0,
      team: "self",
      weaponId: "sword",
      offhandId: "shield",
      frame: REST_FRAME,
    });
  });

  it("leaves room for every weapon and off-hand on its canvas", () => {
    const body = figureBody({ weaponId: undefined, offhandId: undefined });
    // The canvas is twice the body's centre each way.
    const inside = (x: number, y: number, by: number) =>
      x - by >= 0 && x + by <= body.x * 2 && y - by >= 0 && y + by <= body.y * 2;
    for (const weaponId of Object.keys(WEAPONS)) {
      const mark = weaponMarkLayout(body.x, body.y, body.r, body.facing, weaponId, REST_FRAME);
      for (const point of [...mark.strokes, ...mark.fills, ...mark.strings].flat()) {
        expect(inside(point.x, point.y, 2), weaponId).toBe(true);
      }
    }
    for (const offhand of ALL_OFFHANDS) {
      const mark = offhandMarkLayout(body.x, body.y, body.r, body.facing, offhand.id);
      if (mark !== undefined) {
        expect(inside(mark.x, mark.y, mark.radius + mark.casing / 2), offhand.id).toBe(true);
      }
    }
  });
});

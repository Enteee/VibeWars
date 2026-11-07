import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import type { TeamCharacter } from "../storage/schema.js";
import {
  decodeSkillDrag,
  dropSkill,
  encodeSkillDrag,
  equipTarget,
  type SkillDrag,
  type SkillDrop,
} from "./build-drop.js";

const CHOP = "warrior.swift-chop";
const BASH = "warrior.hammer-bash";
const SEVER = "warrior.sever-artery";
const BACKBREAKER = "warrior.backbreaker";
const EVISCERATE = "warrior.eviscerate";
const HUNDRED_BLADES = "warrior.hundred-blades";
const BATTLE_RAGE = "warrior.battle-rage";

/** A Warrior named `id`, holding `bar` from slot 0. */
function warrior(id: string, bar: readonly (string | null)[] = []): TeamCharacter {
  return {
    id,
    name: id,
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: 8 }, (_, slot) => bar[slot] ?? null),
    equipment: defaultBuildEquipment("warrior"),
  };
}

const library = (skillId: string): SkillDrag => ({ from: "library", skillId });
const fromSlot = (member: number, slot: number): SkillDrag => ({ from: "slot", member, slot });

/** The first `n` slots of every bar after `drop`; a refusal throws, saying why. */
function barsOf(drop: SkillDrop<TeamCharacter>, n = 3): (string | null)[][] {
  if ("refused" in drop) {
    throw new Error(drop.refused);
  }
  return drop.bars.map((bar) => bar.skillBar.slice(0, n));
}

describe("skill drag payloads", () => {
  it("round-trip", () => {
    for (const drag of [library("x.y"), fromSlot(3, 7)]) {
      expect(decodeSkillDrag(encodeSkillDrag(drag))).toEqual(drag);
    }
  });

  it("refuse anything dragged in from anywhere else", () => {
    // A drop can carry text from any application on the desktop. It must
    // do nothing rather than throw or equip something invented.
    for (const raw of [
      "",
      "nonsense",
      "slot:",
      "slot:0",
      "slot:0:",
      "slot:abc:1",
      "slot:-1:0",
      "slot:0:99",
      "slot:0:1:2",
      "library:",
      "library:a:b",
    ]) {
      expect(decodeSkillDrag(raw), `${JSON.stringify(raw)} was accepted`).toBeUndefined();
    }
  });
});

describe("equipTarget (#564)", () => {
  const full = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("goes to the first empty slot when none is picked", () => {
    expect(equipTarget(["a", null, "c", null, null, null, null, null], undefined)).toEqual({
      slot: 1,
      replaces: false,
    });
  });

  it("has nowhere to go on a full bar with none picked: nothing is overwritten", () => {
    expect(equipTarget(full, undefined)).toBeUndefined();
  });

  it("goes to the picked slot, replacing what is there", () => {
    expect(equipTarget(full, 5)).toEqual({ slot: 5, replaces: true });
  });

  it("goes to a picked empty slot over an earlier empty one", () => {
    expect(equipTarget([null, null, null, null, null, null, null, null], 6)).toEqual({
      slot: 6,
      replaces: false,
    });
  });
});

describe("a library skill dropped on a bar (#2225)", () => {
  it("equips to the slot it was dropped on, on that bar alone", () => {
    const bars = [warrior("a"), warrior("b")];
    expect(barsOf(dropSkill(bars, library(SEVER), { member: 1, slot: 2 }, false, 0))).toEqual([
      [null, null, null],
      [null, null, SEVER],
    ]);
  });

  it("moves rather than duplicates one already on that bar", () => {
    const bars = [warrior("a", [CHOP, BASH])];
    expect(barsOf(dropSkill(bars, library(CHOP), { member: 0, slot: 2 }, false, 0))).toEqual([
      [null, BASH, CHOP],
    ]);
  });

  it("refuses one already on another member's bar, saying why", () => {
    const bars = [warrior("a", [CHOP]), warrior("b", [SEVER])];
    expect(dropSkill(bars, library(SEVER), { member: 1, slot: 2 }, false, 0)).toEqual({
      refused: "Sever Artery is already on b's bar",
    });
  });

  it("refuses another profession's skill, saying why", () => {
    const monk: TeamCharacter = { ...warrior("m"), name: "Mira", primaryProfession: "monk" };
    expect(dropSkill([monk], library(SEVER), { member: 0, slot: 0 }, false, 0)).toEqual({
      refused: "Monk can't use Sever Artery",
    });
  });

  it("refuses what is not a skill in the game", () => {
    expect(dropSkill([warrior("a")], library("nope"), { member: 0, slot: 0 }, false, 0)).toEqual({
      refused: "Not a skill in the game",
    });
  });

  it("lets a second elite take the first's place, and says so", () => {
    const dropped = dropSkill(
      [warrior("a", [HUNDRED_BLADES])],
      library(BATTLE_RAGE),
      { member: 0, slot: 4 },
      false,
      0,
    );
    expect(barsOf(dropped, 8)[0]?.filter((id) => id !== null)).toEqual([BATTLE_RAGE]);
    expect("notice" in dropped && dropped.notice).toBe(
      "Battle Rage replaced Hundred Blades: only one elite skill per bar.",
    );
  });
});

describe("a bar slot dropped on another (#2227)", () => {
  it.each([
    {
      what: "moves onto another member's empty slot",
      a: [CHOP],
      b: [],
      from: 0,
      to: 1,
      copy: false,
      want: [
        [null, null, null],
        [null, CHOP, null],
      ],
    },
    {
      what: "swaps with what it lands on",
      a: [CHOP],
      b: [BASH],
      from: 0,
      to: 0,
      copy: false,
      want: [
        [BASH, null, null],
        [CHOP, null, null],
      ],
    },
    {
      what: "copies with Shift, the source keeping it, replacing what is there",
      a: [CHOP],
      b: [BASH],
      from: 0,
      to: 0,
      copy: true,
      want: [
        [CHOP, null, null],
        [CHOP, null, null],
      ],
    },
    {
      what: "swaps two elites between two bars",
      a: [BACKBREAKER],
      b: [EVISCERATE],
      from: 0,
      to: 0,
      copy: false,
      want: [
        [EVISCERATE, null, null],
        [BACKBREAKER, null, null],
      ],
    },
  ])("$what", ({ a, b, from, to, copy, want }) => {
    const bars = [warrior("a", a), warrior("b", b)];
    expect(barsOf(dropSkill(bars, fromSlot(0, from), { member: 1, slot: to }, copy, 0))).toEqual(
      want,
    );
  });

  it("swaps two slots of one bar, an empty one too, and with Shift still only moves", () => {
    for (const copy of [false, true]) {
      const bars = [warrior("a", [CHOP, null, BASH])];
      expect(barsOf(dropSkill(bars, fromSlot(0, 0), { member: 0, slot: 2 }, copy, 0))).toEqual([
        [BASH, null, CHOP],
      ]);
      expect(barsOf(dropSkill(bars, fromSlot(0, 0), { member: 0, slot: 1 }, copy, 0))).toEqual([
        [null, CHOP, BASH],
      ]);
    }
  });

  it("leaves the bars themselves when a skill is dropped back on its slot", () => {
    const bars = [warrior("a", [CHOP])];
    expect(dropSkill(bars, fromSlot(0, 0), { member: 0, slot: 0 }, false, 0)).toEqual({
      bars,
      notice: undefined,
    });
  });

  it.each([
    {
      what: "a copy onto a bar already holding it",
      a: [CHOP],
      b: [null, CHOP],
      copy: true,
      want: "Swift Chop is already on b's bar",
    },
    {
      what: "an elite onto a bar with another elite",
      a: [BACKBREAKER],
      b: [null, EVISCERATE],
      copy: false,
      want: "b already has an elite, Eviscerate",
    },
    {
      what: "a swap whose displaced skill the source may not hold",
      a: [CHOP, EVISCERATE],
      b: [BACKBREAKER],
      copy: false,
      want: "a already has an elite, Eviscerate",
    },
    {
      what: "a skill of another profession",
      a: ["monk.orison-of-healing"],
      b: [],
      copy: false,
      want: "can't use Orison of Healing",
    },
    {
      what: "an empty slot",
      a: [],
      b: [],
      copy: false,
      want: "Nothing to drag",
    },
  ])("refuses $what, saying why", ({ a, b, copy, want }) => {
    const bars = [warrior("a", a), warrior("b", b)];
    expect(dropSkill(bars, fromSlot(0, 0), { member: 1, slot: 0 }, copy, 0)).toEqual({
      refused: expect.stringContaining(want) as unknown,
    });
  });
});

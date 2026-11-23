import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { newCharacter } from "../ui/build-editor.js";
import { teamCharacter, teamOf } from "../ui/team-builder.js";

import type { CoachView } from "./coach-overlay.js";
import { FAREWELL_MS, startMenuQuest } from "./menu-quest-session.js";

const KEY = `${STORAGE_NAMESPACE}.tutorial`;

/** A coach that keeps what it was shown, with Skip and Got it to press, and its closing line to let go. */
function fakeCoach(): {
  coach: Parameters<typeof startMenuQuest>[0]["coach"];
  shown: CoachView[];
  removed: () => boolean;
  skip: () => void;
  farewell: () => { readonly line: string; readonly ms: number } | undefined;
  farewellGone: () => void;
} {
  const shown: CoachView[] = [];
  let removed = false;
  let onSkip = (): void => undefined;
  let farewell: { readonly line: string; readonly ms: number } | undefined;
  let onGone = (): void => undefined;
  return {
    coach: (callbacks) => {
      onSkip = callbacks.onSkip;
      return {
        show: (view) => shown.push(view),
        farewell: (line, ms, gone) => {
          farewell = { line, ms };
          onGone = gone;
        },
        remove: () => {
          removed = true;
        },
      };
    },
    shown,
    removed: () => removed,
    skip: () => {
      onSkip();
    },
    farewell: () => farewell,
    farewellGone: () => {
      onGone();
    },
  };
}

function gotIt(view: CoachView | undefined): void {
  if (view?.gotIt === undefined) {
    throw new Error("no Got it");
  }
  view.gotIt();
}

describe("the menu quest session", () => {
  const items = new Map<string, string>();
  beforeEach(() => {
    items.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves its step as it starts, and points at the rail first, with Got it", () => {
    const { coach, shown } = fakeCoach();
    startMenuQuest({ touch: false, from: "menu", coach, onEnd: () => undefined });
    expect(items.get(KEY)).toBe("menu:menu");
    expect(shown.at(-1)?.target).toBe("rail");
    expect(shown.at(-1)?.gotIt).toBeDefined();
    expect(shown.at(-1)?.objectives).toEqual([]);
  });

  it("walks rail, Characters and Teams on Got it, then saves the spec step and points on", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ touch: false, from: "menu", coach, onEnd });
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("rail-characters");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("rail-teams");
    gotIt(shown.at(-1));
    expect(items.get(KEY)).toBe("menu:spec");
    expect(shown.at(-1)?.target).toBe("rail-characters");
    expect(shown.at(-1)?.gotIt).toBeUndefined();
    expect(removed()).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("follows the spec step from the editor events, then saves the team step and points on (#3541, #3542)", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ touch: false, from: "spec", coach, onEnd });
    quest.event({ kind: "screen-shown", screen: "characters" });
    expect(shown.at(-1)?.target).toBe("rail-characters");
    quest.event({ kind: "roster-shown", random: true });
    expect(shown.at(-1)?.target).toBe("character-random");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("character-new");
    quest.event({ kind: "screen-shown", screen: "character-builder" });
    expect(shown.at(-1)?.target).toBe("character-new");
    quest.event({ kind: "character-new" });
    expect(shown.at(-1)?.target).toBe("professions");
    const start = newCharacter("c1");
    const ranger: StoredCharacter = { ...start, secondaryProfession: "ranger" };
    quest.event({ kind: "build-draft", before: start, draft: ranger });
    expect(shown.at(-1)?.target).toBe("attributes");
    expect(items.get(KEY)).toBe("menu:spec");
    const ranked: StoredCharacter = {
      ...ranger,
      attributes: [{ attributeId: "ranger.marksmanship", rank: 9 }],
    };
    quest.event({ kind: "build-draft", before: ranger, draft: ranked });
    expect(shown.at(-1)?.target).toBe("skills");
    const skilled: StoredCharacter = {
      ...ranked,
      skillBar: ["ranger.barrage", ...ranked.skillBar.slice(1)],
    };
    quest.event({ kind: "build-draft", before: ranked, draft: skilled });
    expect(shown.at(-1)?.target).toBe("weapons");
    const [set1, , set3, set4] = skilled.equipment.weaponSets;
    const armed: StoredCharacter = {
      ...skilled,
      equipment: { ...skilled.equipment, weaponSets: [set1, set1, set3, set4] },
    };
    quest.event({ kind: "build-draft", before: skilled, draft: armed });
    expect(shown.at(-1)?.target).toBe("gear");
    const { armor } = armed.equipment;
    const dressed: StoredCharacter = {
      ...armed,
      equipment: {
        ...armed.equipment,
        armor: { ...armor, head: { ...armor.head, headgearAttributeId: "warrior.tactics" } },
      },
    };
    quest.event({ kind: "build-draft", before: armed, draft: dressed });
    expect(shown.at(-1)?.target).toBe("save");
    quest.event({ kind: "character-saved", before: undefined, after: dressed });
    // On to the team step (#3542), saved for a launch to resume at.
    expect(items.get(KEY)).toBe("menu:team");
    expect(shown.at(-1)?.target).toBe("rail-teams");
    expect(removed()).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("follows the team step from the team editor's events, then on to the modes (#3542)", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ touch: false, from: "team", coach, onEnd });
    expect(items.get(KEY)).toBe("menu:team");
    expect(shown.at(-1)?.target).toBe("rail-teams");
    quest.event({ kind: "screen-shown", screen: "teams" });
    // 2v2 in the sidebar first, then New team build (#3794).
    expect(shown.at(-1)?.target).toBe("team-build-size");
    quest.event({ kind: "team-build-size", size: 2 });
    expect(shown.at(-1)?.target).toBe("team-new");
    const mine: StoredCharacter = {
      ...newCharacter("c1"),
      secondaryProfession: "monk",
      attributes: [{ attributeId: "warrior.tactics", rank: 8 }],
      skillBar: ["warrior.sprint", "monk.orison-of-healing", null, null, null, null, null, null],
    };
    const blank = (id: string) => teamCharacter(newCharacter(id), id);
    const opened = teamOf("t1", 2, [blank("m1"), blank("m2")]);
    const draft = (team: StoredTeam) =>
      quest.event({ kind: "team-draft", draft: team, isNew: true, characters: [mine] });
    draft(opened);
    expect(shown.at(-1)?.target).toBe("team-members");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("team-member-build");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("team-problems");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("team-character");
    const copied = teamOf("t1", 2, [teamCharacter(mine, "m1"), blank("m2")]);
    draft(copied);
    expect(shown.at(-1)?.line).toBe(
      "Give every member a build, until the team has no problems left.",
    );
    const filled = teamOf("t1", 2, [teamCharacter(mine, "m1"), teamCharacter(mine, "m2")]);
    draft(filled);
    expect(shown.at(-1)?.target).toBe("team-save");
    quest.event({ kind: "team-saved", team: filled, isNew: true });
    expect(items.get(KEY)).toBe("menu:modes");
    expect(shown.at(-1)?.target).toBe("rail-random-arena");
    expect(removed()).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("on touch, asks for the character by tap and Put here, and waits for it (#3876)", () => {
    const { coach, shown } = fakeCoach();
    const quest = startMenuQuest({ touch: true, from: "team", coach, onEnd: vi.fn() });
    quest.event({ kind: "screen-shown", screen: "teams" });
    quest.event({ kind: "team-build-size", size: 2 });
    const mine: StoredCharacter = { ...newCharacter("c1"), secondaryProfession: "monk" };
    const blank = (id: string) => teamCharacter(newCharacter(id), id);
    const draft = (team: StoredTeam) =>
      quest.event({ kind: "team-draft", draft: team, isNew: true, characters: [mine] });
    draft(teamOf("t1", 2, [blank("m1"), blank("m2")]));
    gotIt(shown.at(-1));
    gotIt(shown.at(-1));
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("team-character");
    expect(shown.at(-1)?.line).toBe("Tap your character, then Put here on a member.");
    draft(teamOf("t1", 2, [teamCharacter(mine, "m1"), blank("m2")]));
    expect(shown.at(-1)?.line).toBe(
      "Give every member a build, until the team has no problems left.",
    );
  });

  it("opens and explains each mode, ticking its list, then goes on to the arena (#3543)", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ touch: false, from: "modes", coach, onEnd });
    expect(items.get(KEY)).toBe("menu:modes");
    quest.event({ kind: "screen-shown", screen: "teams" });
    expect(shown.at(-1)?.target).toBe("rail-random-arena");
    expect(shown.at(-1)?.objectives.map(({ done }) => done)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    quest.event({ kind: "screen-shown", screen: "random-arena" });
    expect(shown.at(-1)?.target).toBe("mode-random-arena");
    expect(shown.at(-1)?.line).toBe(
      "Random Arena is the quickest fight: your own character, in a team of strangers, 1v1, 2v2 or 4v4. The map is drawn for you, and every place is a real player.",
    );
    expect(shown.at(-1)?.objectives.map(({ done }) => done)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("rail-team-arena");
    for (const mode of ["team-arena", "heroes-ascent", "gvg", "hosted-game"] as const) {
      quest.event({ kind: "screen-shown", screen: mode });
      expect(shown.at(-1)?.target).toBe(`mode-${mode}`);
      expect(removed()).toBe(false);
      gotIt(shown.at(-1));
    }
    expect(items.get(KEY)).toBe("menu:arena");
    expect(shown.at(-1)?.target).toBe("rail-team-arena");
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("queues a team of two for Team Arena, then saves done and says goodbye (#3544)", () => {
    const { coach, shown, removed, farewell, farewellGone } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ touch: false, from: "arena", coach, onEnd });
    expect(items.get(KEY)).toBe("menu:arena");
    quest.event({ kind: "screen-shown", screen: "team-arena" });
    expect(shown.at(-1)?.target).toBe("team-size");
    quest.event({ kind: "team-size", size: 4 });
    const views = shown.length;
    // The lobby redrawn, nothing changed: the coach is not shown anew.
    quest.event({ kind: "team-size", size: 4 });
    expect(shown).toHaveLength(views);
    quest.event({ kind: "team-size", size: 2 });
    expect(shown.at(-1)?.target).toBe("find-match");
    quest.event({ kind: "screen-shown", screen: "team-lobby" });
    expect(shown.at(-1)?.target).toBe("team-builds");
    quest.event({ kind: "team-picked", teamId: "duo", offered: ["duo"] });
    expect(shown.at(-1)?.target).toBe("team-lobby");
    quest.event({ kind: "queue-joined", mode: "team-arena", size: 2 });
    expect(items.get(KEY)).toBe("done");
    expect(farewell()).toEqual({ line: "You're in the queue. Good luck.", ms: FAREWELL_MS });
    expect(onEnd).not.toHaveBeenCalled();
    farewellGone();
    expect(onEnd).toHaveBeenCalledWith("done");
    // Stopped now, as for a match found, nothing is left on screen.
    quest.stop();
    expect(removed()).toBe(true);
  });

  it("is not moved on by the menu's events while it explains", () => {
    const { coach, shown } = fakeCoach();
    const quest = startMenuQuest({ touch: false, from: "menu", coach, onEnd: () => undefined });
    quest.event({ kind: "screen-shown", screen: "teams" });
    expect(shown.at(-1)?.target).toBe("rail");
  });

  it("saves skipped on a confirmed Skip, and goes", () => {
    const { coach, removed, skip } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ touch: false, from: "menu", coach, onEnd });
    skip();
    expect(items.get(KEY)).toBe("skipped");
    expect(removed()).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("skipped");
  });

  it("keeps its step when stopped for a link, so the next launch resumes", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ touch: false, from: "menu", coach, onEnd });
    gotIt(shown.at(-1));
    quest.stop();
    expect(items.get(KEY)).toBe("menu:menu");
    expect(removed()).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

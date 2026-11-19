import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { newCharacter } from "../ui/build-editor.js";
import { teamCharacter, teamOf } from "../ui/team-builder.js";

import type { CoachView } from "./coach-overlay.js";
import { startMenuQuest } from "./menu-quest-session.js";

const KEY = `${STORAGE_NAMESPACE}.tutorial`;

/** A coach that keeps what it was shown, with Skip and Got it to press. */
function fakeCoach(): {
  coach: Parameters<typeof startMenuQuest>[0]["coach"];
  shown: CoachView[];
  removed: () => boolean;
  skip: () => void;
} {
  const shown: CoachView[] = [];
  let removed = false;
  let onSkip = (): void => undefined;
  return {
    coach: (callbacks) => {
      onSkip = callbacks.onSkip;
      return {
        show: (view) => shown.push(view),
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
    startMenuQuest({ from: "menu", coach, onEnd: () => undefined });
    expect(items.get(KEY)).toBe("menu:menu");
    expect(shown.at(-1)?.target).toBe("rail");
    expect(shown.at(-1)?.gotIt).toBeDefined();
    expect(shown.at(-1)?.objectives).toEqual([]);
  });

  it("walks rail, Characters and Teams on Got it, then saves the spec step and points on", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ from: "menu", coach, onEnd });
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
    const quest = startMenuQuest({ from: "spec", coach, onEnd });
    quest.event({ kind: "screen-shown", screen: "characters" });
    expect(shown.at(-1)?.target).toBe("character-open");
    quest.event({ kind: "screen-shown", screen: "character-builder" });
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

  it("follows the team step from the team editor's events, then saves done and goes (#3542)", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ from: "team", coach, onEnd });
    expect(items.get(KEY)).toBe("menu:team");
    expect(shown.at(-1)?.target).toBe("rail-teams");
    quest.event({ kind: "screen-shown", screen: "teams" });
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
    expect(items.get(KEY)).toBe("done");
    expect(removed()).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("done");
  });

  it("is not moved on by the menu's events while it explains", () => {
    const { coach, shown } = fakeCoach();
    const quest = startMenuQuest({ from: "menu", coach, onEnd: () => undefined });
    quest.event({ kind: "screen-shown", screen: "teams" });
    expect(shown.at(-1)?.target).toBe("rail");
  });

  it("saves skipped on a confirmed Skip, and goes", () => {
    const { coach, removed, skip } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ from: "menu", coach, onEnd });
    skip();
    expect(items.get(KEY)).toBe("skipped");
    expect(removed()).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("skipped");
  });

  it("keeps its step when stopped for a link, so the next launch resumes", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ from: "menu", coach, onEnd });
    gotIt(shown.at(-1));
    quest.stop();
    expect(items.get(KEY)).toBe("menu:menu");
    expect(removed()).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });
});

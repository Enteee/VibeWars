import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeElement } from "./fake-dom.test-support.js";
import {
  heroRankText,
  nameplateName,
  playerLabel,
  playerLabelText,
  signedText,
} from "./player-label.js";

describe("playerLabel (#1406)", () => {
  it("puts a player's guild tag after their name, in brackets", () => {
    expect(playerLabel("Ente", "VIBE")).toEqual({ name: "Ente", tag: "[VIBE]" });
    expect(playerLabelText("Ente", "VIBE", 0)).toBe("Ente [VIBE]");
  });

  it("is the bare name without a tag, from the snapshot's undefined or the wire's null", () => {
    expect(playerLabel("Ente", undefined)).toEqual({ name: "Ente", tag: undefined });
    expect(playerLabelText("Ente", null, 0)).toBe("Ente");
  });

  it("puts a hero rank after the tag, and none at rank 0 (#2702)", () => {
    expect(playerLabelText("Ente", "VIBE", 3)).toBe("Ente [VIBE] ★3");
    expect(playerLabelText("Ente", null, 15)).toBe("Ente ★15");
    expect(heroRankText(0)).toBeUndefined();
  });
});

describe("nameplateName (#2636)", () => {
  it("keeps a name of up to 24 graphemes whole", () => {
    expect(nameplateName("Ente")).toBe("Ente");
    expect(nameplateName("Wastrel's Collapse (A/E)")).toBe("Wastrel's Collapse (A/E)");
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}".repeat(24);
    expect(nameplateName(family)).toBe(family);
    expect(nameplateName(family)).toBe(family);
  });

  it("cuts a longer one to 23 and an ellipsis, never inside a grapheme", () => {
    expect(nameplateName("Balthazar FFF Zaishen Trappers 3 (R/Mo)")).toBe(
      "Balthazar FFF Zaishen T…",
    );
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(nameplateName(family.repeat(30))).toBe(`${family.repeat(23)}…`);
  });

  it("drops a space before the ellipsis", () => {
    expect(nameplateName("Twenty two letters abc defgh")).toBe("Twenty two letters abc…");
  });
});

describe("signedText (#3232)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createDocumentFragment: () => new FakeElement(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The sentence as read: each signet `[n]`, then the name. */
  const read = (node: FakeElement): string =>
    node.className === "signet"
      ? node.hidden
        ? ""
        : `[${node.src === "" ? "?" : "s"}]`
      : node.textContent + node.children.map(read).join("");
  const signed = (fragment: DocumentFragment): FakeElement => fragment as unknown as FakeElement;
  const signets = (node: FakeElement): number =>
    (node.className === "signet" ? 1 : 0) +
    node.children.reduce((sum, child) => sum + signets(child), 0);

  it("puts one signet before each named player", () => {
    const line = signed(
      signedText("hud.ghostNameFollows", {
        name: { name: "Ana", signet: 1 },
        leader: { name: "Bo", signet: 2 },
      }),
    );
    expect(read(line)).toBe("[s]Ana follows [s]Bo");
    expect(signets(line)).toBe(2);
  });

  it("signs the placeholder, never the same letters elsewhere in the sentence", () => {
    const line = signed(signedText("chat.muted", { name: { name: "a", signet: 3 } }));
    expect(signets(line)).toBe(1);
    expect(read(line)).toBe("You muted [s]a for this session.");
  });

  it("keeps markup in a name as text, and a bot's name unsigned", () => {
    const line = signed(signedText("chat.muted", { name: { name: "<b>&", signet: undefined } }));
    expect(read(line)).toBe("You muted <b>& for this session.");
    expect(signets(line)).toBe(0);
  });

  const signedNames = (node: FakeElement): number =>
    (node.className === "signed-name" ? 1 : 0) +
    node.children.reduce((sum, child) => sum + signedNames(child), 0);

  it("never lets a plain param forge a signed name (#3256)", () => {
    const line = signed(
      signedText("hud.ghostNameFollows", {
        name: "0",
        leader: { name: "Bo", signet: 2 },
      }),
    );
    expect(signedNames(line)).toBe(1);
    expect(read(line)).toBe("0 follows [s]Bo");
  });

  it("signs nothing on a plain-only line holding marks (#3256)", () => {
    const line = signed(signedText("chat.muted", { name: "0" }));
    expect(signedNames(line)).toBe(0);
    expect(read(line)).toBe("You muted 0 for this session.");
  });

  it("keeps a mark in a player's own name inside their element (#3256)", () => {
    const line = signed(signedText("chat.muted", { name: { name: "ab", signet: 3 } }));
    expect(signedNames(line)).toBe(1);
    expect(read(line)).toContain("ab");
  });
});

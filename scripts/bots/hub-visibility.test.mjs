/**
 * What the company may see.
 *
 * Every function here fails open if it is wrong: a missed selector, a list
 * row that is not filtered, a stranger's URL that counts as ours. Each test
 * below is one way a stranger's issue could otherwise reach an agent.
 */
import { describe, expect, it } from "vitest";

import {
  boardNumbers,
  isVisible,
  itemAddUrl,
  namesItem,
  prepareList,
  renderList,
  selectorsOf,
} from "./hub-visibility.mjs";

const REPO = "Enteee/VibeWars";

/** @param {number[]} board */
const viewer = (board = []) => ({
  members: new Set(["enteee", "operator"]),
  repo: REPO,
  board: new Set(board),
});

/**
 * @param {number} number
 * @param {string} login
 */
const item = (number, login) => ({
  number,
  author: { login },
  url: `https://github.com/${REPO}/issues/${String(number)}`,
});

describe("isVisible", () => {
  it("shows the company's own work, on the board or not", () => {
    // The point of a blacklist: an agent that forgets to put its issue on the
    // board must not lose it.
    expect(isVisible(item(3, "Enteee"), viewer())).toBe(true);
  });

  it("shows work raised by any other collaborator", () => {
    expect(isVisible(item(5, "Operator"), viewer())).toBe(true);
  });

  it("hides a stranger's issue that nobody has put on the board", () => {
    expect(isVisible(item(4, "stranger"), viewer())).toBe(false);
  });

  it("shows a stranger's issue once it is on the board", () => {
    expect(isVisible(item(4, "stranger"), viewer([4]))).toBe(true);
  });

  it("hides everything from another repository, even our own login's", () => {
    const elsewhere = { ...item(4, "Enteee"), url: "https://github.com/Enteee/other/issues/4" };

    expect(isVisible(elsewhere, viewer([4]))).toBe(false);
  });

  it("hides work with no readable author", () => {
    // A deleted account shows up as an empty or missing login; neither is a
    // member.
    expect(isVisible({ ...item(4, ""), author: null }, viewer())).toBe(false);
    expect(isVisible(item(4, ""), { ...viewer(), members: new Set([""]) })).toBe(false);
  });
});

describe("boardNumbers", () => {
  it("collects issue and pull request numbers from this repository only", () => {
    const listing = {
      items: [
        { content: { type: "Issue", number: 1, repository: REPO } },
        { content: { type: "PullRequest", number: 12, repository: "enteee/vibewars" } },
        { content: { type: "Issue", number: 7, repository: "Enteee/other" } },
        { content: { type: "DraftIssue", title: "draft" } },
      ],
    };

    expect([...boardNumbers(listing, REPO)].sort()).toStrictEqual([1, 12]);
  });

  it("is empty for anything that is not a listing", () => {
    expect(boardNumbers(null, REPO).size).toBe(0);
    expect(boardNumbers({ items: "nope" }, REPO).size).toBe(0);
  });
});

describe("namesItem", () => {
  it("covers every verb that reads or touches one item", () => {
    expect(namesItem(["issue", "view", "4"])).toBe(true);
    expect(namesItem(["issue", "comment", "4"])).toBe(true);
    expect(namesItem(["pr", "diff", "4"])).toBe(true);
    expect(namesItem(["pr", "merge", "4"])).toBe(true);
  });

  it("leaves lists, creation and other groups alone", () => {
    expect(namesItem(["issue", "list"])).toBe(false);
    expect(namesItem(["pr", "create"])).toBe(false);
    expect(namesItem(["run", "view", "4"])).toBe(false);
  });
});

describe("selectorsOf", () => {
  it("reads the selectors straight after the verb", () => {
    expect(selectorsOf(["issue", "edit", "4", "5", "--add-label", "bug"])).toStrictEqual({
      selectors: ["4", "5"],
    });
    expect(selectorsOf(["pr", "view", "bot/x", "--json", "title"])).toStrictEqual({
      selectors: ["bot/x"],
    });
  });

  it("skips flag values", () => {
    expect(selectorsOf(["issue", "comment", "4", "--body", "7"])).toStrictEqual({
      selectors: ["4"],
    });
  });

  it("refuses a command that names nothing", () => {
    expect(selectorsOf(["pr", "view"])).toHaveProperty("error");
    expect(selectorsOf(["pr", "merge", "--squash", "12"])).toHaveProperty("error");
  });

  it("refuses a second selector hidden behind a boolean flag", () => {
    // Without the boolean list, the 6 would read as the value of --squash
    // and gh would act on a pull request nobody checked.
    expect(selectorsOf(["pr", "merge", "5", "--squash", "6"])).toHaveProperty("error");
    expect(selectorsOf(["issue", "edit", "5", "--remove-milestone", "6"])).toHaveProperty("error");
  });

  it("refuses a selector after an ordinary flag value, or after --", () => {
    expect(selectorsOf(["issue", "edit", "5", "--add-label", "bug", "6"])).toHaveProperty("error");
    expect(selectorsOf(["issue", "edit", "5", "--", "6"])).toHaveProperty("error");
  });
});

describe("itemAddUrl", () => {
  it("reads both spellings", () => {
    expect(itemAddUrl(["project", "item-add", "2", "--url", "u"])).toBe("u");
    expect(itemAddUrl(["project", "item-add", "2", "--url=u"])).toBe("u");
  });

  it("is null when there is no URL", () => {
    expect(itemAddUrl(["project", "item-add", "2"])).toBeNull();
    expect(itemAddUrl(["project", "item-add", "2", "--url"])).toBeNull();
  });
});

describe("prepareList", () => {
  it("asks for JSON itself when the agent did not", () => {
    const prepared = prepareList(["issue", "list", "--state", "open"]);

    expect(prepared).toMatchObject({ fields: null });
    expect(/** @type {{ argv: string[] }} */ (prepared).argv.at(-1)).toBe(
      "number,state,title,labels,updatedAt,author,url",
    );
  });

  it("adds the fields it needs and remembers what was asked for", () => {
    expect(prepareList(["pr", "list", "--json", "title"])).toStrictEqual({
      argv: ["pr", "list", "--json", "title,number,author,url"],
      fields: ["title"],
    });
    expect(prepareList(["pr", "list", "--json=number,title"])).toStrictEqual({
      argv: ["pr", "list", "--json=number,title,author,url"],
      fields: ["number", "title"],
    });
  });

  it("refuses output that gh would shape before hubd could filter it", () => {
    expect(prepareList(["issue", "list", "--json", "number", "--jq", ".[]"])).toHaveProperty(
      "error",
    );
    expect(prepareList(["issue", "list", "-q", ".[]"])).toHaveProperty("error");
    expect(prepareList(["pr", "list", "--template={{.}}"])).toHaveProperty("error");
    expect(prepareList(["pr", "list", "--web"])).toHaveProperty("error");
  });

  it("refuses --json with no fields", () => {
    expect(prepareList(["issue", "list", "--json"])).toHaveProperty("error");
  });
});

describe("renderList", () => {
  const row = {
    number: 4,
    title: "Melee",
    state: "OPEN",
    labels: [{ name: "bug" }, { name: "combat" }],
    updatedAt: "2026-10-24",
    author: { login: "Enteee" },
    url: "u",
  };

  it("strips the fields hubd added", () => {
    expect(JSON.parse(renderList("issue", [row], ["title"]))).toStrictEqual([{ title: "Melee" }]);
  });

  it("prints gh's tab-separated table when no fields were asked for", () => {
    expect(renderList("issue", [row], null)).toBe("4\tOPEN\tMelee\tbug, combat\t2026-10-24\n");
  });

  it("prints nothing for nothing", () => {
    expect(renderList("pr", [], null)).toBe("");
  });
});

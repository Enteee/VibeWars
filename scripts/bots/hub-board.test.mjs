/**
 * hubd's copy of the board: what each command hubd runs does to it, and
 * what it costs to keep it true.
 *
 * The expensive mistakes here are quiet ones. A mutation the copy could
 * have applied but drops instead costs a whole-board read; one it applies
 * wrongly shows an agent a card in the wrong column until the next sweep.
 */
import { describe, expect, it } from "vitest";

import {
  BOARD_FORMAT_VERSION,
  BOARD_TTL_MS,
  answerBoard,
  applyFacts,
  arrivals,
  boardLines,
  listing,
  needsSweep,
  parseBoardRequest,
  parseColumnFlag,
  parseIssueAnswer,
  parseItemAnswer,
  parseRankRequest,
  planHint,
  planLanding,
  planMutation,
  rankCards,
  rankLine,
  rankTarget,
  readBoardState,
  selectorNumber,
  sweep,
} from "./hub-board.mjs";

const REPO = "Enteee/VibeWars";
const NOW = 1_800_000_000_000;

/** @type {import("./hub-board.mjs").BoardIds} */
const IDS = {
  project: 2,
  projectId: "PVT_2",
  fieldId: "F_status",
  options: new Map([
    ["Ready", "o_ready"],
    ["In Review", "o_review"],
    ["Done", "o_done"],
  ]),
};

/**
 * @param {number} number
 * @param {string} [status]
 * @param {string} [repo]
 * @returns {import("./hub-board.mjs").Item}
 */
const item = (number, status = "Ready", repo = REPO) => ({
  id: `PVTI_${String(number)}`,
  title: `item ${String(number)}`,
  status,
  content: {
    type: "Issue",
    number,
    title: `item ${String(number)}`,
    url: `https://github.com/${repo}/issues/${String(number)}`,
    repository: repo,
  },
});

/** A board of #8 and #10 in Ready, as a first sweep makes it. */
const fresh = () => sweep(null, [item(8), item(10)], NOW, "e1", REPO);

/**
 * @param {string[]} argv
 * @param {import("./hub-board.mjs").BoardState | null} [state]
 * @param {{ code: number, stdout: string }} [result]
 */
const plan = (argv, state = fresh(), result = { code: 0, stdout: "" }) =>
  planMutation(argv, result, IDS, state, REPO);

/** @param {string} option */
const move = (option, id = "PVTI_8") => [
  "project",
  "item-edit",
  "--id",
  id,
  "--project-id",
  "PVT_2",
  "--field-id",
  "F_status",
  "--single-select-option-id",
  option,
];

describe("sweep", () => {
  it("starts a line of revisions on the first read", () => {
    const state = fresh();
    expect(state).toMatchObject({ format: BOARD_FORMAT_VERSION, epoch: "e1", rev: 1 });
    expect(listing(state)).toEqual({ items: [item(8), item(10)], totalCount: 2 });
  });

  it("keeps the revision when nothing changed, so `changes` stays empty", () => {
    const again = sweep(fresh(), [item(8), item(10)], NOW + 1, "ignored", REPO);
    expect(again.rev).toBe(1);
    expect(again.sweptAt).toBe(NOW + 1);
    expect(again.epoch).toBe("e1");
  });

  it("marks what moved and remembers what left", () => {
    const after = sweep(fresh(), [item(8, "Done"), item(12)], NOW + 1, "ignored", REPO);
    expect(after.rev).toBe(2);
    expect(after.cards.map((card) => [card.item.id, card.rev])).toEqual([
      ["PVTI_8", 2],
      ["PVTI_12", 2],
    ]);
    expect(after.removed).toEqual([{ id: "PVTI_10", number: 10, rev: 2 }]);
  });

  it("clears a stale mark", () => {
    expect(sweep({ ...fresh(), stale: true }, [item(8)], NOW, "x", REPO).stale).toBe(false);
  });
});

describe("needsSweep", () => {
  it("sweeps with no copy, a stale one, or one past its time, and not otherwise", () => {
    expect(needsSweep(null, NOW)).toBe(true);
    expect(needsSweep({ ...fresh(), stale: true }, NOW)).toBe(true);
    expect(needsSweep(fresh(), NOW + BOARD_TTL_MS)).toBe(true);
    expect(needsSweep(fresh(), NOW + BOARD_TTL_MS - 1)).toBe(false);
  });
});

describe("planMutation", () => {
  it("applies a move exactly, for nothing", () => {
    expect(plan(move("o_done"))).toEqual({
      kind: "apply",
      facts: [{ kind: "item", id: "PVTI_8", item: item(8, "Done") }],
    });
  });

  it("applies a cleared column exactly", () => {
    const planned = plan([
      "project",
      "item-edit",
      "--id",
      "PVTI_8",
      "--field-id",
      "F_status",
      "--clear",
    ]);
    const { status: _status, ...cleared } = item(8);
    expect(planned).toEqual({
      kind: "apply",
      facts: [{ kind: "item", id: "PVTI_8", item: cleared }],
    });
  });

  it("re-reads the one item when the column or the card is not known", () => {
    expect(plan(move("o_new_column"))).toEqual({ kind: "item", id: "PVTI_8" });
    expect(plan(move("o_done", "PVTI_99"))).toEqual({ kind: "item", id: "PVTI_99" });
  });

  it("leaves the copy alone after a failed mutation, or one on another field or project", () => {
    expect(plan(move("o_done"), fresh(), { code: 1, stdout: "" })).toEqual({ kind: "none" });
    expect(
      plan(["project", "item-edit", "--id", "PVTI_8", "--field-id", "F_estimate", "--number", "3"]),
    ).toEqual({ kind: "none" });
    expect(plan(["project", "item-edit", "--id", "PVTI_8", "--project-id", "PVT_9"])).toEqual({
      kind: "none",
    });
    expect(plan(["project", "item-archive", "7", "--id", "PVTI_8"])).toEqual({ kind: "none" });
  });

  it("removes an archived card, and re-reads an unarchived one", () => {
    expect(plan(["project", "item-archive", "2", "--id", "PVTI_8"])).toEqual({
      kind: "apply",
      facts: [{ kind: "item", id: "PVTI_8", item: null }],
    });
    expect(plan(["project", "item-archive", "2", "--id", "PVTI_8", "--undo"])).toEqual({
      kind: "item",
      id: "PVTI_8",
    });
  });

  it("re-reads an added item, whose column GitHub's workflows decide", () => {
    const url = `https://github.com/${REPO}/issues/14`;
    expect(plan(["project", "item-add", "2", "--url", url])).toEqual({ kind: "issue", number: 14 });
    expect(
      plan(["project", "item-add", "2", "--url", url, "--format", "json"], fresh(), {
        code: 0,
        stdout: JSON.stringify({ id: "PVTI_14", type: "Issue" }),
      }),
    ).toEqual({ kind: "item", id: "PVTI_14" });
  });

  it("sweeps when it cannot tell what happened", () => {
    // Another repository's issue, which has no number here to re-read by.
    expect(plan(["project", "item-add", "2", "--url", "https://github.com/x/y/issues/1"])).toEqual({
      kind: "sweep",
    });
    // A draft's title: `--id` is the draft's, not an item's.
    expect(plan(["project", "item-edit", "--id", "DI_1", "--title", "new"])).toEqual({
      kind: "sweep",
    });
    expect(plan(["project", "field-create", "2", "--name", "Size"])).toEqual({ kind: "sweep" });
  });

  it("leaves reads alone", () => {
    expect(plan(["project", "item-list", "2", "--format", "json"])).toEqual({ kind: "none" });
  });
});

describe("planHint", () => {
  it("re-reads what GitHub's workflows move: a close, a reopen, a merge", () => {
    expect(planHint(["issue", "close", "8"], 0, REPO)).toBe(8);
    expect(planHint(["issue", "reopen", "8", "--comment", "x"], 0, REPO)).toBe(8);
    expect(planHint(["pr", "merge", "9", "--squash"], 0, REPO)).toBe(9);
    expect(planHint(["pr", "close", `https://github.com/${REPO}/pull/9`], 0, REPO)).toBe(9);
  });

  it("re-reads a card whose title changed", () => {
    expect(planHint(["issue", "edit", "8", "--title", "better"], 0, REPO)).toBe(8);
    expect(planHint(["issue", "edit", "8", "--add-label", "bug"], 0, REPO)).toBeNull();
  });

  it("ignores failures, reads, and what it cannot name", () => {
    expect(planHint(["issue", "close", "8"], 1, REPO)).toBeNull();
    expect(planHint(["issue", "view", "8"], 0, REPO)).toBeNull();
    expect(planHint(["pr", "close", "bot/developer-1/x"], 0, REPO)).toBeNull();
    expect(planHint(["issue", "close", "https://github.com/x/y/issues/8"], 0, REPO)).toBeNull();
  });
});

describe("selectorNumber", () => {
  it("reads numbers and this repository's URLs only", () => {
    expect(selectorNumber("12", REPO)).toBe(12);
    expect(selectorNumber(`https://github.com/${REPO.toLowerCase()}/pull/12`, REPO)).toBe(12);
    expect(selectorNumber("https://github.com/x/y/pull/12", REPO)).toBeNull();
    expect(selectorNumber(undefined, REPO)).toBeNull();
  });
});

describe("applyFacts", () => {
  it("applies a move under one new revision", () => {
    const after = applyFacts(
      fresh(),
      [{ kind: "item", id: "PVTI_8", item: item(8, "Done") }],
      NOW + 5,
      REPO,
    );
    expect(after.rev).toBe(2);
    expect(after.at).toBe(NOW + 5);
    expect(after.cards[0]).toEqual({ rev: 2, item: item(8, "Done") });
    expect(after.cards[1]?.rev).toBe(1);
  });

  it("returns the same state for a fact that changes nothing", () => {
    const state = fresh();
    expect(applyFacts(state, [{ kind: "item", id: "PVTI_8", item: item(8) }], NOW, REPO)).toBe(
      state,
    );
    expect(applyFacts(state, [{ kind: "item", id: "PVTI_99", item: null }], NOW, REPO)).toBe(state);
  });

  it("makes an issue's cards exactly what GitHub says", () => {
    const after = applyFacts(
      fresh(),
      [
        { kind: "issue", number: 8, repo: REPO, items: [] },
        { kind: "issue", number: 14, repo: REPO, items: [item(14, "Backlog")] },
      ],
      NOW,
      REPO,
    );
    expect(after.cards.map((card) => card.item.id)).toEqual(["PVTI_10", "PVTI_14"]);
    expect(after.removed).toEqual([{ id: "PVTI_8", number: 8, rev: 2 }]);
  });

  it("forgets a removal once the card is back", () => {
    const gone = applyFacts(fresh(), [{ kind: "item", id: "PVTI_8", item: null }], NOW, REPO);
    const back = applyFacts(gone, [{ kind: "item", id: "PVTI_8", item: item(8) }], NOW, REPO);
    expect(back.removed).toEqual([]);
    expect(back.cards.map((card) => card.item.id)).toEqual(["PVTI_10", "PVTI_8"]);
  });
});

describe("re-reading one item", () => {
  const rateLimit = { cost: 1, remaining: 4000, resetAt: "2026-10-25T01:00:00Z" };
  /**
   * @param {number} number
   * @param {Record<string, unknown>} [extra]
   */
  const node = (number, extra = {}) => ({
    id: `PVTI_${String(number)}`,
    isArchived: false,
    project: { id: "PVT_2" },
    status: { name: "Done" },
    content: {
      __typename: "Issue",
      number,
      title: `item ${String(number)}`,
      url: `https://github.com/${REPO}/issues/${String(number)}`,
      repository: { nameWithOwner: REPO },
    },
    ...extra,
  });

  it("reads an item by id, with what it cost", () => {
    const answer = parseItemAnswer(
      JSON.stringify({ data: { rateLimit, item: node(8) } }),
      "PVTI_8",
      "PVT_2",
    );
    expect(answer?.facts).toEqual([{ kind: "item", id: "PVTI_8", item: item(8, "Done") }]);
    expect(answer?.cost).toBe(1);
    expect(answer?.budget?.remaining).toBe(4000);
  });

  it("reads an archived item, one on another board, or none at all as off this board", () => {
    for (const found of [
      node(8, { isArchived: true }),
      node(8, { project: { id: "PVT_9" } }),
      null,
    ]) {
      expect(
        parseItemAnswer(JSON.stringify({ data: { rateLimit, item: found } }), "PVTI_8", "PVT_2")
          ?.facts,
      ).toEqual([{ kind: "item", id: "PVTI_8", item: null }]);
    }
  });

  it("is no answer when GitHub answered with errors or not at all", () => {
    expect(
      parseItemAnswer(JSON.stringify({ errors: [{ message: "x" }] }), "PVTI_8", "PVT_2"),
    ).toBeNull();
    expect(parseItemAnswer("<html>", "PVTI_8", "PVT_2")).toBeNull();
    expect(parseIssueAnswer(JSON.stringify({ data: {} }), 8, "PVT_2", REPO)).toBeNull();
  });

  it("reads a merged pull request together with the issues it closes", () => {
    const answer = parseIssueAnswer(
      JSON.stringify({
        data: {
          rateLimit,
          repository: {
            issueOrPullRequest: {
              number: 9,
              projectItems: { nodes: [] },
              closingIssuesReferences: {
                nodes: [
                  {
                    number: 8,
                    projectItems: {
                      nodes: [node(8), node(8, { id: "PVTI_x", project: { id: "PVT_9" } })],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
      9,
      "PVT_2",
      REPO,
    );
    expect(answer?.facts).toEqual([
      { kind: "issue", number: 9, repo: REPO, items: [] },
      { kind: "issue", number: 8, repo: REPO, items: [item(8, "Done")] },
    ]);
  });
});

describe("answering board", () => {
  it("lists one column, or shows one card", () => {
    const state = fresh();
    const moved = applyFacts(
      state,
      [{ kind: "item", id: "PVTI_8", item: item(8, "Done") }],
      NOW,
      REPO,
    );
    expect(answerBoard(moved, { verb: "ls", column: "Done" }, REPO)).toEqual({
      token: "e1.2",
      sweptAt: NOW,
      cards: [{ id: "PVTI_8", number: 8, title: "item 8", status: "Done", type: "Issue" }],
    });
    expect(answerBoard(moved, { verb: "show", number: 10, fresh: false }, REPO)).toMatchObject({
      card: { number: 10, status: "Ready" },
    });
    expect(answerBoard(moved, { verb: "show", number: 99, fresh: false }, REPO)).toMatchObject({
      card: null,
    });
  });

  it("does not answer for another repository's card of the same number", () => {
    const state = sweep(null, [item(8, "Ready", "x/y")], NOW, "e1", REPO);
    expect(answerBoard(state, { verb: "show", number: 8, fresh: false }, REPO)).toMatchObject({
      card: null,
    });
  });

  it("answers changes with only what moved or left since the token", () => {
    const state = fresh();
    const later = applyFacts(
      state,
      [
        { kind: "item", id: "PVTI_8", item: item(8, "Done") },
        { kind: "item", id: "PVTI_10", item: null },
      ],
      NOW,
      REPO,
    );
    expect(answerBoard(later, { verb: "changes", since: "e1.1" }, REPO)).toEqual({
      token: "e1.2",
      reset: false,
      cards: [{ id: "PVTI_8", number: 8, title: "item 8", status: "Done", type: "Issue" }],
      removed: [{ id: "PVTI_10", number: 10 }],
    });
    expect(answerBoard(later, { verb: "changes", since: "e1.2" }, REPO)).toMatchObject({
      reset: false,
      cards: [],
      removed: [],
    });
  });

  it("answers the whole board to a token it cannot vouch for", () => {
    const state = { ...fresh(), floor: 3, rev: 5 };
    for (const since of [null, "other.1", "e1.2", "e1.6", "garbage"]) {
      expect(answerBoard(state, { verb: "changes", since }, REPO), String(since)).toMatchObject({
        reset: true,
        cards: [{ number: 8 }, { number: 10 }],
      });
    }
  });
});

describe("parseBoardRequest", () => {
  it("reads what board sends, and refuses anything else", () => {
    expect(parseBoardRequest(["ls", "In", "Review"])).toEqual({ verb: "ls", column: "In Review" });
    expect(parseBoardRequest(["show", "14", "--fresh"])).toEqual({
      verb: "show",
      number: 14,
      fresh: true,
    });
    expect(parseBoardRequest(["changes", "--since", "e1.4"])).toEqual({
      verb: "changes",
      since: "e1.4",
    });
    expect(parseBoardRequest(["changes"])).toEqual({ verb: "changes", since: null });
    for (const bad of [["show"], ["show", "x"], ["changes", "--since"], ["move", "1"], []]) {
      expect(parseBoardRequest(bad), bad.join(" ")).toHaveProperty("error");
    }
  });
});

describe("arrivals", () => {
  it("reports a card that entered the column, once", () => {
    const changes = {
      reset: false,
      cards: [
        { id: "PVTI_8", number: 8, title: "", status: "QA", type: "Issue" },
        { id: "PVTI_10", number: 10, title: "", status: "Done", type: "Issue" },
      ],
      removed: [],
    };
    const first = arrivals(new Set(["PVTI_10"]), changes, "QA");
    expect(first.arrived.map((card) => card.number)).toEqual([8]);
    expect([...first.known]).toEqual(["PVTI_8"]);
    expect(arrivals(first.known, changes, "QA").arrived).toEqual([]);
  });

  it("starts over on a reset, and forgets cards that left the board", () => {
    const reset = arrivals(
      new Set(["PVTI_8"]),
      {
        reset: true,
        cards: [
          { id: "PVTI_8", number: 8, title: "", status: "QA", type: "Issue" },
          { id: "PVTI_9", number: 9, title: "", status: "QA", type: "Issue" },
        ],
        removed: [],
      },
      "QA",
    );
    expect(reset.arrived.map((card) => card.number)).toEqual([9]);
    const gone = arrivals(
      reset.known,
      { reset: false, cards: [], removed: [{ id: "PVTI_9" }] },
      "QA",
    );
    expect([...gone.known]).toEqual(["PVTI_8"]);
  });
});

describe("readBoardState", () => {
  it("reads back what hubd writes", () => {
    const state = applyFacts(fresh(), [{ kind: "item", id: "PVTI_8", item: null }], NOW, REPO);
    expect(readBoardState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("discards anything in another shape, rather than adapting it", () => {
    const state = fresh();
    // The shape the previous build wrote.
    expect(readBoardState({ at: NOW, board: { items: [], totalCount: 0 } })).toBeNull();
    expect(readBoardState({ ...state, format: BOARD_FORMAT_VERSION + 1 })).toBeNull();
    expect(readBoardState({ ...state, stale: undefined })).toBeNull();
    expect(readBoardState({ ...state, cards: [{ rev: 1, item: { id: "x" } }] })).toBeNull();
    expect(readBoardState({ ...state, removed: [{ id: "x", rev: 1 }] })).toBeNull();
    expect(readBoardState(null)).toBeNull();
  });
});

describe("boardLines", () => {
  /**
   * @param {number} number
   * @param {string} status
   */
  const card = (number, status) => ({
    id: `I_${String(number)}`,
    number,
    title: `card ${String(number)}`,
    status,
    type: "Issue",
  });
  const done = Array.from({ length: 12 }, (_, i) => card(100 + i, "Done"));
  const board = [card(1, "Ready"), ...done, card(2, "In Review")];

  it("folds Done to its last five cards and says how many more there are", () => {
    expect(boardLines(board, true)).toEqual([
      "Ready:",
      "  #1    card 1",
      "In Review:",
      "  #2    card 2",
      "Done:",
      "  #107  card 107",
      "  #108  card 108",
      "  #109  card 109",
      "  #110  card 110",
      "  #111  card 111",
      "  … 7 more: board ls Done",
    ]);
  });

  it("lists every Done card when not folded, as `board ls Done` does", () => {
    const lines = boardLines(done, false);
    expect(lines).toHaveLength(13);
    expect(lines.some((line) => line.includes("more"))).toBe(false);
  });

  it("prints no 'more' line when Done fits", () => {
    expect(boardLines(done.slice(0, 5), true)).toEqual([
      "Done:",
      ...done.slice(0, 5).map((c) => `  #${String(c.number)}  ${c.title}`),
    ]);
  });
});

describe("ranking (#351)", () => {
  /** #1, #2 and #3 in Backlog with #4 in Ready after them, in the project's order. */
  const ranked = () =>
    sweep(
      null,
      [item(1, "Backlog"), item(2, "Backlog"), item(3, "Backlog"), item(4)],
      NOW,
      "e1",
      REPO,
    );
  /** @param {import("./hub-board.mjs").BoardState} state */
  const order = (state) => state.cards.map((card) => card.item.id);

  it("moves a card to the top, after another, or to the bottom", () => {
    expect(order(rankCards(ranked(), "PVTI_3", null, NOW + 1))).toEqual([
      "PVTI_3",
      "PVTI_1",
      "PVTI_2",
      "PVTI_4",
    ]);
    expect(order(rankCards(ranked(), "PVTI_1", "PVTI_2", NOW + 1))).toEqual([
      "PVTI_2",
      "PVTI_1",
      "PVTI_3",
      "PVTI_4",
    ]);
    expect(order(rankCards(ranked(), "PVTI_1", "PVTI_4", NOW + 1))).toEqual([
      "PVTI_2",
      "PVTI_3",
      "PVTI_4",
      "PVTI_1",
    ]);
  });

  it("gives the moved card a new revision, so board changes shows it", () => {
    const before = ranked();
    const after = rankCards(before, "PVTI_3", null, NOW + 1);
    expect(after.rev).toBe(before.rev + 1);
    expect(after.at).toBe(NOW + 1);
    expect(
      after.cards.filter((card) => card.rev === after.rev).map((card) => card.item.id),
    ).toEqual(["PVTI_3"]);
  });

  it("leaves the state as it was for a card already in place, or one it does not hold", () => {
    const state = ranked();
    expect(rankCards(state, "PVTI_1", null, NOW + 1)).toBe(state);
    expect(rankCards(state, "PVTI_2", "PVTI_1", NOW + 1)).toBe(state);
    expect(rankCards(state, "PVTI_9", null, NOW + 1)).toBe(state);
    expect(rankCards(state, "PVTI_1", "PVTI_9", NOW + 1)).toBe(state);
  });

  it("finds the items to send, bottom being after the project's last card", () => {
    const state = ranked();
    expect(rankTarget(state, { number: 2, place: "top" }, REPO)).toEqual({
      id: "PVTI_2",
      afterId: null,
    });
    expect(rankTarget(state, { number: 2, place: "after", after: 3 }, REPO)).toEqual({
      id: "PVTI_2",
      afterId: "PVTI_3",
    });
    expect(rankTarget(state, { number: 2, place: "bottom" }, REPO)).toEqual({
      id: "PVTI_2",
      afterId: "PVTI_4",
    });
    expect(rankTarget(state, { number: 4, place: "bottom" }, REPO)).toEqual({
      id: "PVTI_4",
      afterId: "PVTI_3",
    });
    expect(rankTarget(state, { number: 9, place: "top" }, REPO)).toEqual({
      error: "#9 is not on the board",
    });
    expect(rankTarget(state, { number: 1, place: "after", after: 9 }, REPO)).toEqual({
      error: "#9 is not on the board",
    });
  });

  it("says where the card now is in its column", () => {
    const state = rankCards(ranked(), "PVTI_3", null, NOW + 1);
    expect(rankLine(state, "PVTI_3", REPO)).toBe("#3: now 1st of 3 in Backlog");
    expect(rankLine(state, "PVTI_2", REPO)).toBe("#2: now 3rd of 3 in Backlog");
    expect(rankLine(state, "PVTI_4", REPO)).toBe("#4: now 1st of 1 in Ready");
  });

  it("parses top, bottom and after, and refuses anything else", () => {
    expect(parseRankRequest(["12", "top"])).toEqual({ number: 12, place: "top" });
    expect(parseRankRequest(["12", "bottom"])).toEqual({ number: 12, place: "bottom" });
    expect(parseRankRequest(["12", "after", "7"])).toEqual({
      number: 12,
      place: "after",
      after: 7,
    });
    expect(parseRankRequest(["12", "after", "12"])).toEqual({
      error: "#12 cannot go after itself",
    });
    for (const argv of [
      [],
      ["12"],
      ["x", "top"],
      ["12", "up"],
      ["12", "top", "7"],
      ["12", "after"],
      ["12", "after", "7", "8"],
      ["0", "top"],
    ]) {
      expect(parseRankRequest(argv), argv.join(" ")).toHaveProperty("error");
    }
  });
});

describe("parseColumnFlag (#517)", () => {
  const columns = ["Backlog", "In Review"];

  it("reads both spellings and strips the flag", () => {
    expect(parseColumnFlag(["a", "--column", "In Review", "b"], columns)).toEqual({
      argv: ["a", "b"],
      column: "In Review",
    });
    expect(parseColumnFlag(["a", "--column=Backlog"], columns)).toEqual({
      argv: ["a"],
      column: "Backlog",
    });
    expect(parseColumnFlag(["a"], columns)).toEqual({ argv: ["a"], column: null });
  });

  it("refuses twice, a value that is missing, and a column that is not one", () => {
    expect(parseColumnFlag(["--column", "Backlog", "--column=Backlog"], columns)).toHaveProperty(
      "error",
    );
    expect(parseColumnFlag(["--column"], columns)).toHaveProperty("error");
    expect(parseColumnFlag(["--column", "Nowhere"], columns)).toHaveProperty("error");
  });
});

describe("planLanding (#517)", () => {
  const repo = "Enteee/VibeWars";
  const url = "https://github.com/Enteee/VibeWars/issues/12";

  it("adds the issue gh created, named by the last line of its output", () => {
    expect(
      planLanding(["issue", "create"], { code: 0, stdout: `Creating...\n${url}\n` }, repo),
    ).toEqual({
      kind: "add",
      url,
    });
  });

  it("does nothing for a failure, and says so when no URL came back", () => {
    expect(planLanding(["issue", "create"], { code: 1, stdout: url }, repo)).toEqual({
      kind: "none",
    });
    expect(planLanding(["issue", "create"], { code: 0, stdout: "ok" }, repo).kind).toBe("unlanded");
  });

  it("lands an added item by its id when gh printed it, else by its issue", () => {
    const add = ["project", "item-add", "2", "--url", url];
    expect(planLanding(add, { code: 0, stdout: '{"id":"PVTI_12"}' }, repo)).toEqual({
      kind: "land",
      id: "PVTI_12",
      number: 12,
    });
    expect(planLanding(add, { code: 0, stdout: "" }, repo)).toEqual({
      kind: "land",
      id: null,
      number: 12,
    });
    expect(planLanding(["project", "item-add", "2"], { code: 0, stdout: "" }, repo).kind).toBe(
      "unlanded",
    );
  });
});

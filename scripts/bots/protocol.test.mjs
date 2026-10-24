/**
 * Covers the wire contract between a sandboxed agent and Telegram.
 *
 * These are the parts of the bridge that cannot be checked against the live
 * API in CI — doing so would need a real bot token, a real supergroup and two
 * real human taps — so they are isolated as pure functions and checked here
 * instead. What is NOT covered is the half that needs a socket: that is what
 * the end-to-end steps in docs/adr/0014-agent-coordination.md are for.
 */
import { describe, expect, it } from "vitest";

import {
  acceptsManagedBot,
  formatLine,
  inboundLine,
  indexRoles,
  isReadyOutboxEntry,
  outboundParams,
  readInbox,
  retryDelay,
  suggestName,
  suggestUsername,
} from "./protocol.mjs";

const CHAT = "-1001234567890";

/** @type {import("./protocol.mjs").Registry} */
const REGISTRY = {
  managerOffset: 7,
  roles: {
    architect: { id: 1001, username: "vibewars_architect_7f3a_bot", topicId: 11, token: "a" },
    gameplay: { id: 1002, username: "vibewars_gameplay_2b91_bot", topicId: 12, token: "b" },
    // Provisioning got as far as creating the bot but not its topic.
    qa: { id: 1003, username: "vibewars_qa_c40e_bot", token: "c" },
  },
};

const { byId, topics, usernames } = indexRoles(REGISTRY);

/**
 * @param {Record<string, unknown>} message
 * @returns {unknown}
 */
function update(message) {
  return {
    update_id: 500,
    message: {
      message_id: 42,
      date: 1_767_225_600,
      chat: { id: Number(CHAT) },
      ...message,
    },
  };
}

describe("indexRoles", () => {
  it("indexes only the roles that have reached each stage", () => {
    expect(byId.get(1001)).toBe("architect");
    expect([...topics.keys()].sort()).toStrictEqual(["architect", "gameplay"]);
    expect([...usernames.keys()].sort()).toStrictEqual(["architect", "gameplay", "qa"]);
  });
});

describe("inboundLine", () => {
  it("labels a message from a known role bot as a peer, by role name", () => {
    const line = inboundLine(
      update({ from: { id: 1001, is_bot: true }, text: "ADR drafted", message_thread_id: 12 }),
      { chatId: CHAT, selfId: 1002, byId },
    );

    expect(line).toStrictEqual({
      ts: 1_767_225_600_000,
      from: "architect",
      kind: "peer",
      text: "ADR drafted",
      topicId: 12,
      messageId: 42,
    });
  });

  it("labels a message from an unknown sender as human", () => {
    const line = inboundLine(update({ from: { id: 99, username: "ente" }, text: "ship it" }), {
      chatId: CHAT,
      selfId: 1002,
      byId,
    });

    expect(line?.kind).toBe("human");
    expect(line?.from).toBe("@ente");
    expect(line?.topicId).toBeNull();
  });

  it("falls back to a first name when a human has no username", () => {
    const line = inboundLine(update({ from: { id: 99, first_name: "Ente" }, text: "hi" }), {
      chatId: CHAT,
      selfId: 1002,
      byId,
    });

    expect(line?.from).toBe("Ente");
  });

  it("drops the bot's own messages so an agent cannot read itself back", () => {
    const line = inboundLine(update({ from: { id: 1002, is_bot: true }, text: "mine" }), {
      chatId: CHAT,
      selfId: 1002,
      byId,
    });

    expect(line).toBeNull();
  });

  it("drops anything from outside the swarm group", () => {
    const line = inboundLine(
      {
        update_id: 1,
        message: {
          message_id: 42,
          date: 1,
          chat: { id: -100999 },
          from: { id: 99 },
          text: "dm",
        },
      },
      { chatId: CHAT, selfId: 1002, byId },
    );

    expect(line).toBeNull();
  });

  it("drops non-text updates an agent could not read anyway", () => {
    for (const payload of [
      update({ from: { id: 99 }, sticker: { file_id: "x" } }),
      update({ from: { id: 99 }, text: "" }),
      update({ from: { id: 99 }, text: "ok", message_id: "not a number" }),
      { update_id: 1, edited_message: { text: "ok" } },
      {},
    ]) {
      expect(inboundLine(payload, { chatId: CHAT, selfId: 1002, byId })).toBeNull();
    }
  });
});

describe("outboundParams", () => {
  it("routes a directed message into the recipient's topic and mentions it", () => {
    const params = outboundParams(
      { to: "gameplay", text: "server is red" },
      { chatId: CHAT, from: "architect", topics, usernames },
    );

    expect(params).toStrictEqual({
      chat_id: CHAT,
      message_thread_id: 12,
      text: "@vibewars_gameplay_2b91_bot [architect] server is red",
    });
  });

  it("sends a broadcast to General, with no thread id", () => {
    const params = outboundParams(
      { to: "all", text: "main is broken" },
      { chatId: CHAT, from: "qa", topics, usernames },
    );

    expect(params).toStrictEqual({ chat_id: CHAT, text: "[qa] main is broken" });
  });

  it("treats a missing recipient as a broadcast", () => {
    const params = outboundParams(
      { text: "anyone there" },
      { chatId: CHAT, from: "qa", topics, usernames },
    );

    expect(params.message_thread_id).toBeUndefined();
  });

  it("refuses a role that has no topic yet, and names the ones that do", () => {
    expect(() =>
      outboundParams(
        { to: "qa", text: "hi" },
        { chatId: CHAT, from: "architect", topics, usernames },
      ),
    ).toThrow(/unknown role "qa".*architect, gameplay/s);
  });
});

describe("readInbox", () => {
  const a = JSON.stringify({
    ts: 1,
    from: "architect",
    kind: "peer",
    text: "one",
    topicId: 11,
    messageId: 1,
  });
  const b = JSON.stringify({
    ts: 2,
    from: "qa",
    kind: "peer",
    text: "two",
    topicId: 12,
    messageId: 2,
  });

  it("returns everything from a zero cursor and reports where it got to", () => {
    const result = readInbox(`${a}\n${b}\n`, 0);

    expect(result.lines.map((line) => line.text)).toStrictEqual(["one", "two"]);
    expect(result.cursor).toBe(Buffer.byteLength(`${a}\n${b}\n`, "utf8"));
  });

  it("returns only what arrived after the cursor", () => {
    const first = readInbox(`${a}\n`, 0);
    const second = readInbox(`${a}\n${b}\n`, first.cursor);

    expect(second.lines.map((line) => line.text)).toStrictEqual(["two"]);
  });

  it("counts bytes, not characters, so non-ASCII does not desynchronise it", () => {
    const wide = JSON.stringify({
      ts: 1,
      from: "architect",
      kind: "peer",
      text: "déjà vu — 🎮",
      topicId: 11,
      messageId: 1,
    });
    const first = readInbox(`${wide}\n`, 0);
    const second = readInbox(`${wide}\n${b}\n`, first.cursor);

    expect(first.lines[0]?.text).toBe("déjà vu — 🎮");
    expect(second.lines.map((line) => line.text)).toStrictEqual(["two"]);
  });

  it("stops at a partially written line and resumes from it next time", () => {
    const partial = `${a}\n${b.slice(0, 10)}`;
    const first = readInbox(partial, 0);

    expect(first.lines).toHaveLength(1);
    expect(readInbox(`${a}\n${b}\n`, first.cursor).lines.map((line) => line.text)).toStrictEqual([
      "two",
    ]);
  });

  it("restarts from the beginning if the inbox was truncated under it", () => {
    expect(readInbox(`${a}\n`, 99_999).lines).toHaveLength(1);
    expect(readInbox(`${a}\n`, -1).lines).toHaveLength(1);
  });

  it("steps over a complete line that is not a message, rather than wedging", () => {
    const junk = JSON.stringify({ unrelated: true });
    const first = readInbox(`${junk}\n${a}\n`, 0);

    expect(first.lines.map((line) => line.text)).toStrictEqual(["one"]);
    expect(readInbox(`${junk}\n${a}\n${b}\n`, first.cursor).lines).toHaveLength(1);
  });

  it("defaults the fields a hand-written line may be missing", () => {
    const sparse = JSON.stringify({ from: "ente", text: "hello" });
    const [line] = readInbox(`${sparse}\n`, 0).lines;

    expect(line).toStrictEqual({
      ts: 0,
      from: "ente",
      kind: "peer",
      text: "hello",
      topicId: null,
      messageId: 0,
    });
  });

  it("is empty for an empty inbox", () => {
    expect(readInbox("", 0)).toStrictEqual({ lines: [], cursor: 0 });
  });
});

describe("suggestUsername", () => {
  it("suggests the clean username for a role", () => {
    expect(suggestUsername("vibewars", "qa")).toBe("vibewars_qa_bot");
  });

  it("replaces hyphens, which Telegram usernames do not allow", () => {
    expect(suggestUsername("vibewars", "net-code")).toBe("vibewars_net_code_bot");
  });

  it("keeps the 32-character limit and the required bot ending", () => {
    const name = suggestUsername("vibewars", "an-extremely-long-role-name");

    expect(name.length).toBeLessThanOrEqual(32);
    expect(name.endsWith("_bot")).toBe(true);
  });
});

describe("suggestName", () => {
  it("builds a display name in the convention the operator picked by hand", () => {
    expect(suggestName("architect")).toBe("VibeWars-Architect-Bot");
  });

  it("title-cases every hyphenated part", () => {
    expect(suggestName("net-code")).toBe("VibeWars-Net-Code-Bot");
  });
});

describe("formatLine", () => {
  it("marks human messages so an agent can tell an operator from a peer", () => {
    const human = formatLine({
      ts: 1_767_225_600_000,
      from: "@ente",
      kind: "human",
      text: "stop",
      topicId: null,
      messageId: 1,
    });
    const peer = formatLine({
      ts: 1_767_225_600_000,
      from: "qa",
      kind: "peer",
      text: "ok",
      topicId: 11,
      messageId: 2,
    });

    expect(human).toBe("00:00:00*@ente: stop");
    expect(peer).toBe("00:00:00 qa: ok");
  });
});

describe("isReadyOutboxEntry", () => {
  it("accepts a message that has been renamed into place", () => {
    expect(isReadyOutboxEntry("01767225600000-4821.json")).toBe(true);
  });

  it("rejects the temporary name tg writes before renaming", () => {
    // The trap this guards: the temporary name ends in .json too, so an
    // extension-only filter would read a file mid-write.
    expect(isReadyOutboxEntry(".01767225600000-4821.json.part")).toBe(false);
    expect(isReadyOutboxEntry(".01767225600000-4821.json")).toBe(false);
  });

  it("rejects anything that is not a message", () => {
    expect(isReadyOutboxEntry("cursor")).toBe(false);
    expect(isReadyOutboxEntry("inbox.jsonl")).toBe(false);
  });
});

describe("acceptsManagedBot", () => {
  const claimed = new Set([8924738395]);

  it("accepts a genuinely new bot during a fresh provision", () => {
    expect(acceptsManagedBot(999, { claimed, recoverableId: null })).toBe(true);
  });

  it("refuses a bot another role already owns", () => {
    // The regression: a rewound offset replays the update that created the
    // architect's bot, and the gameplay role accepts it — two roles, one
    // identity, one token.
    expect(acceptsManagedBot(8924738395, { claimed, recoverableId: null })).toBe(false);
  });

  it("accepts only the specific bot being recovered", () => {
    expect(acceptsManagedBot(555, { claimed, recoverableId: 555 })).toBe(true);
    expect(acceptsManagedBot(777, { claimed, recoverableId: 555 })).toBe(false);
  });

  it("still refuses a claimed bot while recovering", () => {
    expect(acceptsManagedBot(8924738395, { claimed, recoverableId: 8924738395 })).toBe(false);
  });
});

describe("retryDelay", () => {
  it("backs off exponentially from one second", () => {
    expect([1, 2, 3, 4].map((n) => retryDelay(n))).toStrictEqual([1000, 2000, 4000, 8000]);
  });

  it("caps the wait, because a dropped long-poll reconnects immediately", () => {
    expect(retryDelay(6)).toBe(30_000);
  });

  it("gives up past the attempt limit", () => {
    expect(retryDelay(7)).toBeNull();
    expect(retryDelay(0)).toBeNull();
  });
});

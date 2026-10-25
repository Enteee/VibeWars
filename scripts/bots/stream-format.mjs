/**
 * Reading an agent's turn as it happens (#146).
 *
 * Every agent runs one turn per process: `claude -p --output-format
 * stream-json --verbose`, which prints one JSON event per line and exits
 * when the turn ends (ADR-0027). This turns those events into what the
 * pane shows: the agent's text, one line per tool call and one per tool
 * result. It also holds the rule that tells a failed run from a turn that
 * simply ended, which the restart loop in nix/claude-llc.nix acts on.
 *
 * Pure, so it can be tested without a claude; agent-turn.mjs is the part
 * that runs one.
 */

/** The widest a single pane line gets before it is cut. */
export const LINE_MAX = 200;

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/**
 * The first line of `text`, cut to `LINE_MAX`, saying how much was left out.
 *
 * @param {string} text
 * @returns {string}
 */
export function oneLine(text) {
  const lines = text.trim().split("\n");
  const first = (lines[0] ?? "").trimEnd();
  const more = lines.length > 1 ? ` (+${String(lines.length - 1)} lines)` : "";
  const cut = first.length > LINE_MAX ? `${first.slice(0, LINE_MAX - 1)}…` : first;
  return `${cut}${more}`;
}

/**
 * One line of claude's output as an event, or `null` if it is not one.
 *
 * @param {string} line
 * @returns {Record<string, unknown> | null}
 */
export function parseEvent(line) {
  try {
    const event = record(JSON.parse(line));
    return event !== null && typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isJson(line) {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/**
 * The input field that says what a tool call is about, by tool, so the pane
 * reads `Bash: pnpm run ci` rather than a JSON object.
 *
 * @type {Record<string, string>}
 */
const SUBJECT = {
  Bash: "command",
  Read: "file_path",
  Edit: "file_path",
  Write: "file_path",
  NotebookEdit: "notebook_path",
  Grep: "pattern",
  Glob: "pattern",
  WebFetch: "url",
  WebSearch: "query",
  Skill: "skill",
  Agent: "description",
  ToolSearch: "query",
};

/**
 * @param {Record<string, unknown>} block a `tool_use` content block
 * @returns {string}
 */
function toolCall(block) {
  const name = typeof block.name === "string" ? block.name : "tool";
  const input = record(block.input) ?? {};
  const key = SUBJECT[name];
  const subject = key !== undefined && typeof input[key] === "string" ? input[key] : null;
  return `→ ${name}: ${oneLine(subject ?? JSON.stringify(input))}`;
}

/**
 * @param {unknown} content a `tool_result` block's content: text, or text blocks
 * @returns {string}
 */
function resultText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      const block = record(part);
      if (block === null) {
        return "";
      }
      return typeof block.text === "string" ? block.text : `[${String(block.type)}]`;
    })
    .join("\n");
}

/**
 * @param {Record<string, unknown>} event
 * @returns {unknown[]}
 */
function contentOf(event) {
  const content = record(event.message)?.content;
  return Array.isArray(content) ? content : [];
}

/**
 * @param {Record<string, unknown>} event a `result` event
 * @returns {string}
 */
function turnEnd(event) {
  const parts = [typeof event.subtype === "string" ? event.subtype : "ended"];
  if (typeof event.num_turns === "number") {
    parts.push(`${String(event.num_turns)} steps`);
  }
  if (typeof event.duration_ms === "number") {
    parts.push(`${String(Math.round(event.duration_ms / 1000))}s`);
  }
  if (typeof event.total_cost_usd === "number") {
    parts.push(`$${event.total_cost_usd.toFixed(2)}`);
  }
  return `■ turn ${parts.join(" · ")}`;
}

/**
 * What the pane shows for one line of claude's output.
 *
 * Never throws: a formatter that dies takes the agent's output with it. A
 * line that is not JSON, an error claude printed say, is shown cut to one
 * line; an event of a kind this does not know is skipped.
 *
 * @param {string} line
 * @returns {string[]}
 */
export function formatLine(line) {
  if (line.trim() === "") {
    return [];
  }
  const event = parseEvent(line);
  if (event === null) {
    return isJson(line) ? [] : [oneLine(line)];
  }
  switch (event.type) {
    case "system":
      return event.subtype === "init"
        ? [`● session ${String(event.session_id)} · ${String(event.model)}`]
        : [];
    case "assistant":
      return contentOf(event).flatMap((part) => {
        const block = record(part);
        if (block?.type === "text" && typeof block.text === "string") {
          return block.text.trim() === "" ? [] : [block.text.trim()];
        }
        return block?.type === "tool_use" ? [toolCall(block)] : [];
      });
    case "user":
      return contentOf(event).flatMap((part) => {
        const block = record(part);
        if (block?.type !== "tool_result") {
          return [];
        }
        const mark = block.is_error === true ? "✗" : "←";
        return [`  ${mark} ${oneLine(resultText(block.content))}`];
      });
    case "result":
      return [turnEnd(event)];
    default:
      return [];
  }
}

/**
 * The session to resume next turn, from the `system`/`init` event that opens
 * every run.
 *
 * @param {Record<string, unknown> | null} event
 * @returns {string | null}
 */
export function sessionIdOf(event) {
  return event?.type === "system" &&
    event.subtype === "init" &&
    typeof event.session_id === "string" &&
    /^[A-Za-z0-9-]+$/.test(event.session_id)
    ? event.session_id
    : null;
}

/**
 * Did this run fail, rather than end its turn?
 *
 * A short turn is not a crash: an agent that checks its inbox and finds
 * nothing ends in seconds, and that is fine. A run failed if it exited
 * non-zero, or never got as far as a `result` event.
 *
 * @param {{ code: number | null, sawResult: boolean }} run `code` is `null`
 *   when a signal ended it
 * @returns {boolean}
 */
export function runFailed({ code, sawResult }) {
  return code !== 0 || !sawResult;
}

/**
 * A client-originated value, as a log line may show it (#115, SECURITY.md
 * gap 7): `JSON.stringify` of its string form, and what JSON leaves raw
 * escaped too, so a newline, a carriage
 * return, an escape sequence or a quote inside it cannot end the line or
 * forge another. A skill id of `"a\n[match] finished winner=1"` once
 * printed a `[match] finished` line no match produced.
 *
 * This is the only way a value a client chose goes into a `console.*`
 * line. `log-safe.test.ts` checks that every interpolation in the rooms'
 * log lines is either this or a value the server made.
 */
export function quote(value: unknown): string {
  // JSON leaves DEL, the C1 controls and the two Unicode line separators
  // raw, and a terminal or a log viewer may still break a line on them.
  return JSON.stringify(String(value)).replace(
    /[\u007f-\u009f\u2028\u2029]/gu,
    (char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
  );
}

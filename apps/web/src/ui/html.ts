/**
 * `value` made safe inside a quoted HTML attribute (#3043): a translation
 * with a quote in it stays text instead of closing the attribute. `&` goes
 * first, or the entities the others become would be escaped again.
 */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

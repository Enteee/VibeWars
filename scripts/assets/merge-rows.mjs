// Joins the per-profession icon tables into one. A plain object spread would
// let a row in two files silently win by order, which is what a union merge
// of a deleted stand-in row does (#1705): this throws instead, at import.

/**
 * @template Row
 * @param {Readonly<Record<string, Readonly<Record<string, Row>>>>} tables Rows by file name.
 * @param {{ prefixed: boolean }} options `prefixed`: ids start with their file's name and a dot.
 * @returns {Record<string, Row>}
 */
export const mergeRows = (tables, { prefixed }) => {
  /** @type {Record<string, Row>} */
  const merged = {};
  /** @type {Map<string, string>} */
  const home = new Map();
  for (const [file, rows] of Object.entries(tables)) {
    for (const [id, row] of Object.entries(rows)) {
      if (prefixed && !id.startsWith(`${file}.`)) {
        throw new Error(
          `icon row "${id}" is in ${file}.mjs but belongs to "${id.slice(0, id.indexOf("."))}"`,
        );
      }
      const other = home.get(id);
      if (other !== undefined) {
        throw new Error(`icon row "${id}" is in ${other}.mjs and ${file}.mjs`);
      }
      home.set(id, file);
      merged[id] = row;
    }
  }
  return merged;
};

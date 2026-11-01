// Joins tables of rows into one. A plain object spread would let a row in two
// files silently win by order, which is what a union merge of a deleted
// stand-in row does (#1705): this throws instead, at import. Each table is a
// file of its own (#2021), so two cards add two files and edit none.

import { readdirSync } from "node:fs";

/**
 * @template Row
 * @param {Readonly<Record<string, Readonly<Record<string, Row>>>>} tables Rows by file name.
 * @param {{ prefixed: boolean, what: string }} options `prefixed`: ids start with their
 * file's name and a dot. `what`: a row's name, for the error.
 * @returns {Record<string, Row>}
 */
export const mergeRows = (tables, { prefixed, what }) => {
  /** @type {Record<string, Row>} */
  const merged = {};
  /** @type {Map<string, string>} */
  const home = new Map();
  for (const [file, rows] of Object.entries(tables)) {
    for (const [id, row] of Object.entries(rows)) {
      if (prefixed && !id.startsWith(`${file}.`)) {
        throw new Error(
          `${what} "${id}" is in ${file} but belongs to "${id.slice(0, id.indexOf("."))}"`,
        );
      }
      const other = home.get(id);
      if (other !== undefined) {
        throw new Error(`${what} "${id}" is in ${other}.mjs and ${file}.mjs`);
      }
      home.set(id, file);
      merged[id] = row;
    }
  }
  return merged;
};

/**
 * Every `*.mjs` file in `dir`, by file name, each its default export: one
 * table of rows a file (#2021). Sorted, so an error always names the same file.
 * @param {URL} dir
 * @param {string} prefix What the files are named by in an error, e.g. `ranger/`.
 * @returns {Promise<Record<string, Readonly<Record<string, unknown>>>>}
 */
export const loadTables = async (dir, prefix) => {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".mjs"))
    .sort();
  /** @type {Record<string, Readonly<Record<string, unknown>>>} */
  const tables = {};
  for (const file of files) {
    /** @type {unknown} */
    const module = await import(new URL(file, dir).href);
    const rows = /** @type {{ default: Readonly<Record<string, unknown>> }} */ (module).default;
    tables[`${prefix}${file.slice(0, -".mjs".length)}`] = rows;
  }
  return tables;
};

/**
 * The tables in each directory of `dir`, by the directory's name, each
 * directory's files merged into one: a profession's rows (#2021).
 * @param {URL} dir
 * @param {string} what
 * @returns {Promise<Record<string, Readonly<Record<string, unknown>>>>}
 */
export const loadDirectories = async (dir, what) => {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  /** @type {Record<string, Readonly<Record<string, unknown>>>} */
  const tables = {};
  for (const name of names) {
    const files = await loadTables(new URL(`${name}/`, dir), `${name}/`);
    tables[name] = mergeRows(files, { prefixed: false, what });
  }
  return tables;
};

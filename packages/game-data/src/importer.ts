import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parseGwMemorialSkill } from "./sources/gw-memorial.js";
import { validateNormalizedSkill, type NormalizedSkill } from "./schema.js";

/**
 * Orchestrates fetch (or cached-raw-reuse) -> parse -> validate -> write,
 * for the one source this pipeline currently has (brief §7's "separate
 * data-ingestion pipeline"; see ADR-0004 for why only one source is wired
 * up so far).
 */

export interface SkillSpec {
  readonly id: string;
  readonly profession: string;
  readonly url: string;
}

export interface ImportProblem {
  readonly id: string;
  readonly url: string;
  readonly reason: string;
}

export interface ImportReport {
  readonly imported: number;
  readonly normalized: number;
  readonly unsupported: readonly ImportProblem[];
  readonly rejected: readonly ImportProblem[];
}

export interface ImportOptions {
  readonly rawDir: string;
  readonly normalizedDir: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

interface RawCacheEntry {
  readonly html: string;
  readonly fetchedAt: string;
}

/**
 * Read a previously-cached raw fetch, or perform (and cache) a new one.
 * Caching means a repeat import run never re-hits the live site for a
 * skill it already has — important given this is a small community site,
 * not an API meant for bulk automated traffic.
 */
async function getRawHtml(
  spec: SkillSpec,
  rawDir: string,
  fetchImpl: typeof fetch,
): Promise<RawCacheEntry> {
  const htmlPath = resolve(rawDir, `${spec.id}.html`);
  const metaPath = resolve(rawDir, `${spec.id}.meta.json`);

  if (existsSync(htmlPath) && existsSync(metaPath)) {
    const html = readFileSync(htmlPath, "utf8");
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { fetchedAt: string };
    return { html, fetchedAt: meta.fetchedAt };
  }

  const response = await fetchImpl(spec.url);
  if (!response.ok) {
    throw new Error(`fetching ${spec.url} failed: HTTP ${String(response.status)}`);
  }
  const html = await response.text();
  const fetchedAt = new Date().toISOString();

  mkdirSync(rawDir, { recursive: true });
  writeFileSync(htmlPath, html, "utf8");
  writeFileSync(metaPath, JSON.stringify({ url: spec.url, fetchedAt }, null, 2) + "\n", "utf8");

  return { html, fetchedAt };
}

export async function importSkills(
  specs: readonly SkillSpec[],
  options: ImportOptions,
): Promise<ImportReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const unsupported: ImportProblem[] = [];
  const rejected: ImportProblem[] = [];
  let imported = 0;
  let normalized = 0;

  mkdirSync(options.normalizedDir, { recursive: true });

  for (const spec of specs) {
    const { html, fetchedAt } = await getRawHtml(spec, options.rawDir, fetchImpl);
    imported += 1;

    const parsed = parseGwMemorialSkill({
      html,
      id: spec.id,
      profession: spec.profession,
      url: spec.url,
      fetchedAt,
    });

    if (parsed.kind === "unsupported") {
      unsupported.push({ id: spec.id, url: spec.url, reason: parsed.reason });
      continue;
    }

    let skill: NormalizedSkill;
    try {
      skill = validateNormalizedSkill(parsed.skill);
    } catch (error) {
      rejected.push({
        id: spec.id,
        url: spec.url,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const outPath = resolve(options.normalizedDir, `${spec.id}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(skill, null, 2) + "\n", "utf8");
    normalized += 1;
  }

  return { imported, normalized, unsupported, rejected };
}

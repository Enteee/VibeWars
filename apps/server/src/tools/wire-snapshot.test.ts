import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { schema, t } from "@colyseus/schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  SCHEMA_FILE,
  VERSION_FILE,
  describeConstants,
  describeState,
  describeTypes,
  generateWireFiles,
  moduleOf,
  programFor,
  versionOf,
  type WireFiles,
} from "./wire-snapshot.js";

const ROOMS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../rooms");

/** `WIRE_SNAPSHOT=write` is `pnpm run wire:snapshot`: regenerate, then check as CI does. */
const WRITE = process.env.WIRE_SNAPSHOT === "write";

const STALE = "wire schema is stale: run pnpm run wire:snapshot and commit both files";

let generated: WireFiles;

beforeAll(async () => {
  generated = await generateWireFiles();
  if (WRITE) {
    fs.writeFileSync(SCHEMA_FILE, generated.schema);
    fs.writeFileSync(VERSION_FILE, generated.version);
  }
}, 60_000);

describe("the wire schema snapshot (#303)", () => {
  it("is committed as generated, both files", () => {
    expect(fs.readFileSync(SCHEMA_FILE, "utf8") === generated.schema, STALE).toBe(true);
    expect(fs.readFileSync(VERSION_FILE, "utf8") === generated.version, STALE).toBe(true);
  });

  it("names the version after the snapshot's hash", () => {
    expect(generated.version).toContain(`PROTOCOL_VERSION = "${versionOf(generated.schema)}"`);
  });

  it("is the same on a second run", async () => {
    expect(await generateWireFiles()).toEqual(generated);
  }, 60_000);

  it("is what the rooms send: every send goes through the typed helpers", () => {
    const raw: string[] = [];
    for (const file of roomSources()) {
      if (path.basename(file.name) !== "wire.ts") {
        for (const match of file.source.matchAll(/\.(?:send|broadcast)\(/g)) {
          raw.push(`${file.name}: ${match[0]}`);
        }
      }
    }
    expect(raw, "send through rooms/wire.ts, so the snapshot sees the payload").toEqual([]);
  });

  it("holds every message the rooms handle, and no other", () => {
    const handled = new Set<string>();
    for (const file of roomSources()) {
      for (const match of file.source.matchAll(/\.onMessage\(\s*"([^"]+)"/g)) {
        handled.add(match[1] ?? "");
      }
    }
    const snapshot = JSON.parse(generated.schema) as {
      messages: { clientToServer: Record<string, unknown> };
    };
    expect(handled.size).toBeGreaterThan(0);
    expect(new Set(Object.keys(snapshot.messages.clientToServer))).toEqual(handled);
  });
});

/** The rooms' sources, tests aside. */
function roomSources(): { name: string; source: string }[] {
  return fs
    .readdirSync(ROOMS)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ name: file, source: fs.readFileSync(path.join(ROOMS, file), "utf8") }));
}

describe("what changes the hash", () => {
  /** The hash of one module's exported types, as the snapshot describes them. */
  function hashOf(source: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wire-"));
    try {
      fs.writeFileSync(path.join(dir, "payloads.ts"), source);
      fs.writeFileSync(path.join(dir, "main.ts"), 'export * from "./payloads.js";\n');
      fs.writeFileSync(
        path.join(dir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true, module: "nodenext" } }),
      );
      const main = path.join(dir, "main.ts");
      const program = programFor([main], path.join(dir, "tsconfig.json"));
      const file = program.getSourceFile(main);
      if (file === undefined) {
        throw new Error("the fixture did not compile");
      }
      const checker = program.getTypeChecker();
      const module = moduleOf(program, file, "./payloads.js");
      return versionOf(
        JSON.stringify([describeTypes(checker, module), describeConstants(checker, module, [])]),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const BASE = "export interface Hit { readonly targetId: string; readonly amount: number }\n";

  it("an optional field added to a payload changes it", () => {
    expect(
      hashOf(
        "export interface Hit { readonly targetId: string; readonly amount: number; readonly crit?: boolean }\n",
      ),
    ).not.toBe(hashOf(BASE));
  });

  it("a payload's properties reordered do not", () => {
    expect(
      hashOf("export interface Hit { readonly amount: number; readonly targetId: string }\n"),
    ).toBe(hashOf(BASE));
  });

  it("an exported constant changed changes it", () => {
    expect(hashOf(`${BASE}export const ADDRESS_LIMIT = 4429;\n`)).not.toBe(
      hashOf(`${BASE}export const ADDRESS_LIMIT = 429;\n`),
    );
  });

  it("a state schema's fields reordered do", () => {
    const ab = schema({ a: t.string(), b: t.number() }, "Fixture");
    const ba = schema({ b: t.number(), a: t.string() }, "Fixture");
    expect(versionOf(JSON.stringify(describeState([ab])))).not.toBe(
      versionOf(JSON.stringify(describeState([ba]))),
    );
  });
});

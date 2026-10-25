import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { schema, t } from "@colyseus/schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  SCHEMA_FILE,
  VERSION_FILE,
  describeExports,
  describeState,
  generateWireFiles,
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

  it("holds every message the rooms send, broadcast or handle, and no other", () => {
    const used = new Set<string>();
    for (const file of fs.readdirSync(ROOMS)) {
      if (file.endsWith(".ts") && !file.endsWith(".test.ts")) {
        const source = fs.readFileSync(path.join(ROOMS, file), "utf8");
        for (const match of source.matchAll(/\.(?:send|broadcast|onMessage)\(\s*"([^"]+)"/g)) {
          used.add(match[1] ?? "");
        }
      }
    }
    const snapshot = JSON.parse(generated.schema) as {
      messages: Record<string, Record<string, unknown>>;
    };
    const named = Object.values(snapshot.messages).flatMap((direction) => Object.keys(direction));
    expect(used.size).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(used);
  });
});

describe("what changes the hash", () => {
  /** The hash of one module's exported types, as the snapshot describes them. */
  function hashOf(source: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wire-"));
    try {
      fs.writeFileSync(path.join(dir, "payloads.ts"), source);
      fs.writeFileSync(path.join(dir, "main.ts"), 'export type * from "./payloads.js";\n');
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
      return versionOf(JSON.stringify(describeExports(program, file, "./payloads.js")));
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

  it("a state schema's fields reordered do", () => {
    const ab = schema({ a: t.string(), b: t.number() }, "Fixture");
    const ba = schema({ b: t.number(), a: t.string() }, "Fixture");
    expect(versionOf(JSON.stringify(describeState([ab])))).not.toBe(
      versionOf(JSON.stringify(describeState([ba]))),
    );
  });
});

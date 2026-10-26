import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHANNELS } from "@vibewars/game-protocol";
import { beforeAll, describe, expect, it } from "vitest";

import {
  SCHEMA_FILE,
  VERSION_FILE,
  describeConstants,
  describeTypes,
  generateWireFiles,
  moduleOf,
  programFor,
  versionOf,
  type WireFiles,
} from "./wire-snapshot.js";

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

  it("names every channel peers send on", () => {
    const snapshot = JSON.parse(generated.schema) as { channels: readonly string[] };
    expect(snapshot.channels).toEqual(CHANNELS);
  });
});

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

  it("a tuple's elements changed change it (#82)", () => {
    const tuple = (elements: string) =>
      hashOf(`export interface Score { readonly score: readonly [${elements}] }\n`);
    expect(tuple("number, number")).not.toBe(tuple("number, string"));
    expect(tuple("number, number")).not.toBe(tuple("number, number, number"));
  });

  it("a recursive named union is described, by name where it recurs, and changes it (#375)", () => {
    const json = (leaf: string) =>
      hashOf(
        `export type Json = ${leaf} | readonly Json[] | { readonly [key: string]: Json };\n` +
          "export interface Hello { readonly build: Json }\n",
      );
    expect(json("null | string")).toMatch(/^[0-9a-f]{12}$/);
    expect(json("null | string")).not.toBe(json("null | number"));
  });
});

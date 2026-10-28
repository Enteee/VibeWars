import path from "node:path";
import { fileURLToPath } from "node:url";

import { CHANNELS } from "@vibewars/game-protocol";
import * as prettier from "prettier";
import ts from "typescript";

import { WIRE_STATUS_IDS } from "../wire.js";

/**
 * The wire schema snapshot (#303): a canonical description of everything
 * that crosses between peers, committed as `wire-schema.json`.
 * `PROTOCOL_VERSION` is computed from it when game-protocol loads, so a
 * wire change changes the version and a stale tab is refused at join, with
 * no human step and no committed hash. The file is canonical (sorted keys,
 * unions and status ids), so two PRs that each add to the wire merge
 * cleanly unless they touch the same lines. `wire-snapshot.test.ts` fails
 * a change that did not regenerate.
 *
 * It lives here because this is the package that sees game-protocol and
 * game-core together; the file it writes lands in game-protocol, which
 * keeps no dependencies. It is a Node tool, outside the package's build.
 */

/**
 * Bump this, by hand, for a change in *meaning* with no change in shape:
 * a unit changed, an enum value reused, a field read differently. The
 * snapshot cannot see those, and old and new tabs must still not meet.
 */
const SEMANTICS_REVISION = 2;

/** A JSON value, as the snapshot holds it. */
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const PROTOCOL = path.join(REPO, "packages/game-protocol");
export const SCHEMA_FILE = path.join(PROTOCOL, "src/wire-schema.json");
const TSCONFIG = path.join(REPO, "packages/game-session/tsconfig.json");
/** Between game-core's shapes and the wire's: it imports both packages. */
const WIRE_FILE = path.join(HERE, "../wire.ts");

/** Generate the schema file in memory, as it must be committed. */
export async function generateWireSchema(): Promise<string> {
  const program = programFor([WIRE_FILE], TSCONFIG);
  const wire = program.getSourceFile(WIRE_FILE);
  if (wire === undefined) {
    throw new Error(`cannot read ${WIRE_FILE}`);
  }
  const checker = program.getTypeChecker();
  const protocol = moduleOf(program, wire, "@vibewars/game-protocol");
  const core = moduleOf(program, wire, "@vibewars/game-core");
  const snapshot: Json = {
    semanticsRevision: SEMANTICS_REVISION,
    // One message per channel; each channel's payload is a type below.
    channels: CHANNELS,
    // A snapshot names a status by its index here (#632), so another
    // table must be another version.
    statusIds: WIRE_STATUS_IDS,
    // The version cannot hash itself.
    constants: describeConstants(checker, protocol, ["PROTOCOL_VERSION"]),
    types: sortKeys({
      ...describeTypes(checker, protocol),
      CombatEvent: describeType(checker, exportedType(checker, core, "CombatEvent")),
    }),
  };
  return formatted(`${JSON.stringify(snapshot)}\n`, SCHEMA_FILE);
}

/** In the repo's own format, so the hooks leave a generated file alone. */
async function formatted(source: string, file: string): Promise<string> {
  const options = await prettier.resolveConfig(file);
  return prettier.format(source, { ...options, filepath: file, endOfLine: "lf" });
}

/** A program over `roots`, compiled as `tsconfig` says. */
export function programFor(roots: readonly string[], tsconfig: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  if (parsed === undefined) {
    throw new Error(`cannot read ${tsconfig}`);
  }
  return ts.createProgram({ rootNames: roots, options: { ...parsed.options, noEmit: true } });
}

/** The module `file` imports as `from`, or `file`'s own without one. */
export function moduleOf(program: ts.Program, file: ts.SourceFile, from?: string): ts.Symbol {
  const checker = program.getTypeChecker();
  const resolved =
    from === undefined
      ? file.fileName
      : ts.resolveModuleName(from, file.fileName, program.getCompilerOptions(), ts.sys)
          .resolvedModule?.resolvedFileName;
  const source = resolved === undefined ? undefined : program.getSourceFile(resolved);
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (module === undefined) {
    throw new Error(`${file.fileName} does not import ${from ?? "itself"}`);
  }
  return module;
}

/** `module`'s exports, aliases resolved, by name. */
function exportsOf(checker: ts.TypeChecker, module: ts.Symbol): Map<string, ts.Symbol> {
  return new Map(
    checker
      .getExportsOfModule(module)
      .map((exported) => [
        exported.name,
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported,
      ]),
  );
}

const TYPES = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias;

/** The type `module` exports as `name`. */
export function exportedType(checker: ts.TypeChecker, module: ts.Symbol, name: string): ts.Type {
  const symbol = exportsOf(checker, module).get(name);
  if (symbol === undefined || !(symbol.flags & TYPES)) {
    throw new Error(`${module.name} exports no type ${name}`);
  }
  return checker.getDeclaredTypeOfSymbol(symbol);
}

/** Every type `module` exports, by name, to its shape. */
export function describeTypes(checker: ts.TypeChecker, module: ts.Symbol): Record<string, Json> {
  const described: Record<string, Json> = {};
  for (const [name, symbol] of exportsOf(checker, module)) {
    if (symbol.flags & TYPES) {
      described[name] = describeType(checker, checker.getDeclaredTypeOfSymbol(symbol));
    }
  }
  return sortKeys(described);
}

/**
 * Every constant `module` exports whose type is a literal, by name, to its
 * value: close codes, room names and limits mean something on the wire
 * as much as a payload's shape does. Constants of any other type say
 * nothing about the wire and are left out.
 */
export function describeConstants(
  checker: ts.TypeChecker,
  module: ts.Symbol,
  except: readonly string[],
): Record<string, Json> {
  const described: Record<string, Json> = {};
  for (const [name, symbol] of exportsOf(checker, module)) {
    if (symbol.flags & ts.SymbolFlags.BlockScopedVariable && !except.includes(name)) {
      const type = checker.getTypeOfSymbol(symbol);
      if (type.flags & ts.TypeFlags.Literal) {
        described[name] = describeType(checker, type);
      }
    }
  }
  return sortKeys(described);
}

const PRIMITIVES: readonly (readonly [ts.TypeFlags, string])[] = [
  [ts.TypeFlags.String, "string"],
  [ts.TypeFlags.Number, "number"],
  [ts.TypeFlags.BigInt, "bigint"],
  [ts.TypeFlags.Undefined, "undefined"],
  [ts.TypeFlags.Null, "null"],
  [ts.TypeFlags.Unknown, "unknown"],
  [ts.TypeFlags.Never, "never"],
  [ts.TypeFlags.Void, "void"],
  [ts.TypeFlags.Any, "any"],
];

/**
 * A type's shape, structurally: unions as sorted member lists, objects as
 * properties sorted by name with their optionality, literals as values.
 * Readonly-ness and declaration order are not part of it; nothing about
 * the encoding depends on them. A named union met again inside itself,
 * as `JsonValue` is, is described by name there: `{ ref: "JsonValue" }`.
 */
export function describeType(
  checker: ts.TypeChecker,
  type: ts.Type,
  within: ReadonlySet<ts.Type> = new Set(),
): Json {
  if (type.flags & ts.TypeFlags.Boolean) {
    return "boolean";
  }
  for (const [flag, name] of PRIMITIVES) {
    if (type.flags & flag) {
      return name;
    }
  }
  if (type.isUnion()) {
    const name = type.aliasSymbol?.name;
    if (name !== undefined && within.has(type)) {
      return { ref: name };
    }
    const inner = name === undefined ? within : new Set([...within, type]);
    return union(type.types.map((member) => describeType(checker, member, inner)));
  }
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return { literal: type.value };
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return { literal: checker.typeToString(type) === "true" };
  }
  if (type.flags & ts.TypeFlags.TypeParameter) {
    return { typeParameter: type.symbol.name };
  }
  if (checker.isArrayType(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference);
    if (element === undefined) {
      throw new Error(`an array of nothing: ${checker.typeToString(type)}`);
    }
    return { array: describeType(checker, element, within) };
  }
  if (checker.isTupleType(type)) {
    return {
      tuple: checker
        .getTypeArguments(type as ts.TypeReference)
        .map((element) => describeType(checker, element, within)),
    };
  }
  if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
    if (within.has(type)) {
      throw new Error(`a recursive type cannot be described: ${checker.typeToString(type)}`);
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      throw new Error(`a function cannot cross the wire: ${checker.typeToString(type)}`);
    }
    const inner = new Set([...within, type]);
    const properties = [...checker.getPropertiesOfType(type)].sort((a, b) =>
      compare(a.name, b.name),
    );
    const described: Record<string, Json> = {
      properties: properties.map((property) => {
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const propertyType = checker.getTypeOfSymbol(property);
        // An optional property's type carries `undefined`; `optional` says it.
        const members =
          optional && propertyType.isUnion()
            ? propertyType.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined))
            : [propertyType];
        return {
          name: property.name,
          optional,
          type: union(members.map((member) => describeType(checker, member, inner))),
        };
      }),
    };
    const indexes = checker.getIndexInfosOfType(type);
    if (indexes.length > 0) {
      described.index = indexes.map((index) => ({
        key: describeType(checker, index.keyType, inner),
        value: describeType(checker, index.type, inner),
      }));
    }
    return described;
  }
  throw new Error(`no wire description for ${checker.typeToString(type)}`);
}

function union(members: readonly Json[]): Json {
  const unique = [...new Map(members.map((member) => [JSON.stringify(member), member])).entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, member]) => member);
  const [only] = unique;
  return unique.length === 1 && only !== undefined ? only : { union: unique };
}

function sortKeys(record: Record<string, Json>): Record<string, Json> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => compare(a, b)));
}

/** By code unit, so the order is the same on every machine and locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

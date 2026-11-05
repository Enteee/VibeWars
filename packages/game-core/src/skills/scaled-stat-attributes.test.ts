import { describe, expect, it } from "vitest";

import {
  STATUS_DEFINITIONS,
  scaledStatAttributes,
  type StatusDefinition,
  type StatusId,
} from "./status.js";
import { withStatusDefinitions } from "./testing.js";

/**
 * Every scaled stat in a status definition scales in play (#2306): its
 * attribute is one `scaledStatAttributes` names, so the source's rank in it
 * is captured as the status lands. Retribution's cap was missed so once
 * (PR 2297), and its test passed ranks to `apply` itself.
 */

/** A `scaling.attributeId` at `path` in a status definition. */
interface ScaledAt {
  readonly path: string;
  readonly attributeId: string;
}

/**
 * Fields whose numbers are read at another rank by design, each with why:
 * every path under one is left alone.
 */
const RESOLVED_ELSEWHERE: readonly (readonly [field: string, reason: string])[] = [
  ["triggers", "a trigger's effects are its source's, at its ranks as it fires (fireTriggers)"],
  ["failsNextSpell", "the failed spell's price is its source's, at its ranks as it fails"],
  // True only while the attacker is the status's source: `weaponSpellRiders` holds that.
  ["onAttackHit", "a rider lands at the attacker's ranks as the blow does (applyRiders)"],
  ["onAttackBlocked", "as onAttackHit: at the attacker's ranks as the blow is blocked"],
];

/** Every `scaling.attributeId` in `value`, with its path. */
function scaledAt(value: unknown, path: string, into: ScaledAt[]): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const entries: [string, unknown][] = Object.entries(value);
  for (const [key, field] of entries) {
    const at = path === "" ? key : `${path}.${key}`;
    if (
      key === "scaling" &&
      typeof field === "object" &&
      field !== null &&
      "attributeId" in field &&
      typeof field.attributeId === "string"
    ) {
      into.push({ path: at, attributeId: field.attributeId });
    } else {
      scaledAt(field, at, into);
    }
  }
}

/** `id`'s scaled stats `scaledStatAttributes` leaves out: "id path attribute" each. */
function misses(id: StatusId): readonly string[] {
  const found: ScaledAt[] = [];
  scaledAt(STATUS_DEFINITIONS[id], "", found);
  const named = new Set(scaledStatAttributes(id));
  return found
    .filter(({ path }) => !RESOLVED_ELSEWHERE.some(([field]) => path.startsWith(`${field}.`)))
    .filter(({ attributeId }) => !named.has(attributeId))
    .map(({ path, attributeId }) => `${id} ${path} ${attributeId}`);
}

/**
 * `id`'s scaled rider stats if it is a weapon spell: one cast on an ally
 * would land at the ally's ranks, not its caster's, so none may scale
 * until `applyRiders` reads the source's.
 */
function weaponSpellRiders(id: StatusId): readonly string[] {
  const definition = STATUS_DEFINITIONS[id];
  if (definition.category !== "weapon-spell") {
    return [];
  }
  const found: ScaledAt[] = [];
  scaledAt(
    { onAttackHit: definition.onAttackHit, onAttackBlocked: definition.onAttackBlocked },
    "",
    found,
  );
  return found.map(
    ({ path, attributeId }) =>
      `${id} ${path} ${attributeId}: applyRiders must read the source's ranks first`,
  );
}

function allStatusIds(): StatusId[] {
  return Object.values(STATUS_DEFINITIONS).map(({ id }) => id);
}

describe("scaledStatAttributes (#2306)", () => {
  it("names the attribute of every scaled stat in every status", () => {
    expect(allStatusIds().flatMap(misses)).toEqual([]);
  });

  it("scales no weapon spell's rider, which lands at its bearer's ranks", () => {
    expect(allStatusIds().flatMap(weaponSpellRiders)).toEqual([]);
  });

  it("finds a weapon spell's scaled rider", () => {
    const rider: Partial<StatusDefinition> = {
      category: "weapon-spell",
      onAttackHit: {
        skillId: "ritualist.splinter-weapon",
        attackSkillsOnly: false,
        weapon: undefined,
        weaponDamage: undefined,
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "ritualist.channeling-magic", atZero: 5, atTwelve: 20 },
            },
            type: "cold",
            armorPenetration: 0,
          },
        ],
      },
    };
    expect(withStatusDefinitions({ burning: rider }, () => weaponSpellRiders("burning"))).toEqual([
      "burning onAttackHit.effects.0.amount.scaling ritualist.channeling-magic: applyRiders must read the source's ranks first",
    ]);
  });

  it("finds a nested scaled stat scaledStatAttributes leaves out", () => {
    const nested: Partial<StatusDefinition> = {
      nextAttackSkill: [
        {
          kind: "damage",
          amount: { scaling: { attributeId: "warrior.strength", atZero: 5, atTwelve: 20 } },
          type: "fire",
          armorPenetration: 0,
        },
      ],
    };
    expect(withStatusDefinitions({ burning: nested }, () => misses("burning"))).toEqual([
      "burning nextAttackSkill.0.amount.scaling warrior.strength",
    ]);
  });

  it("lets a scaled stat it names pass", () => {
    const named: Partial<StatusDefinition> = {
      damageToHealing: {
        cap: { scaling: { attributeId: "monk.protection-prayers", atZero: 1, atTwelve: 2 } },
      },
    };
    expect(withStatusDefinitions({ burning: named }, () => misses("burning"))).toEqual([]);
  });
});

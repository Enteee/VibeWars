import type { AttributeAllocation } from "./attributes.js";
import { validatePlayerBuild, type PlayerBuild } from "./build.js";
import {
  NO_UPGRADES,
  allowsOffhand,
  defaultEquipmentFor,
  getWeapon,
  wieldsFor,
  type ArmorPiece,
  type ArmorSet,
  type BuildEquipment,
  type EquippedRune,
  type InsigniaId,
  type WeaponId,
  type WeaponSet,
} from "./equipment/index.js";
import { decodeTemplateCode, type TemplateBuild } from "./template-code.js";
import { PROFESSIONS, primaryAttributeOf } from "./professions.js";
import { PVX_SOLO, type PvxBuild } from "./pvx-builds.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import type { AttackWeaponClass } from "./skills/types.js";

export function allocations(
  ranks: Readonly<Record<string, number>>,
): readonly AttributeAllocation[] {
  return Object.entries(ranks).map(([attributeId, rank]) => ({ attributeId, rank }));
}

function minorRune(attributeId: string): EquippedRune {
  return { kind: "attribute", attributeId, tier: "minor" };
}

const SUPERIOR_VIGOR: EquippedRune = { kind: "universal", runeId: "vigor", tier: "superior" };

/**
 * One insignia on every piece, a minor rune of the build's main
 * attribute on the head, with its headgear on the same attribute
 * (#1140), and a superior Vigor on the chest; `hands` takes one more
 * rune where the build has a use for it.
 */
export function armor(
  insigniaId: InsigniaId,
  mainAttributeId: string,
  hands?: EquippedRune,
): ArmorSet {
  const piece = (rune: EquippedRune | null): ArmorPiece => ({ insigniaId, rune });
  return {
    head: { ...piece(minorRune(mainAttributeId)), headgearAttributeId: mainAttributeId },
    chest: piece(SUPERIOR_VIGOR),
    hands: piece(hands ?? null),
    legs: piece(null),
    feet: piece(null),
  };
}

/** The weapon an attack needing `required` is made with when the primary's own cannot. */
const WEAPON_FOR: Readonly<Record<AttackWeaponClass, WeaponId>> = {
  axe: "axe",
  sword: "sword",
  hammer: "hammer",
  daggers: "daggers",
  scythe: "scythe",
  spear: "spear",
  bow: "flatbow",
  melee: "sword",
};

/**
 * A template carries no gear: the primary's default weapon, or the one
 * most of the bar's attack skills need, a set more for each other class
 * of attack on the bar, as a GW1 player swaps to, and the starter
 * builds' armour on the primary's highest attribute.
 */
function equipmentFor(template: TemplateBuild): BuildEquipment {
  const primary = template.primaryProfession;
  const [first] = defaultEquipmentFor(primary).weaponSets;
  const own = first.mainHand.weaponId;
  const needs = template.skillBar.flatMap((id) => {
    const weapon = id === null ? undefined : getSkill(id)?.attack?.weapon;
    return weapon === undefined ? [] : [weapon];
  });
  const count = (weapon: AttackWeaponClass): number =>
    needs.filter((need) => need === weapon).length;
  // Most needed first; a tie goes to the earlier slot.
  const classes = [...new Set(needs)].sort((a, b) => count(b) - count(a));
  const sets: WeaponSet[] = [];
  for (const required of classes) {
    if (sets.some((set) => wieldsFor(set.mainHand.weaponId, required))) {
      continue;
    }
    const weaponId = wieldsFor(own, required) ? own : WEAPON_FOR[required];
    const weapon = getWeapon(weaponId);
    sets.push(
      weaponId === own
        ? first
        : {
            mainHand: { weaponId, requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand:
              sets.length === 0 && weapon !== undefined && allowsOffhand(weapon)
                ? first.offHand
                : null,
          },
    );
  }
  const mainAttributeId =
    template.attributes
      .filter(({ attributeId }) =>
        PROFESSIONS[primary].attributes.some((attribute) => attribute.id === attributeId),
      )
      .reduce<{ attributeId: string; rank: number } | undefined>(
        (best, attribute) => (best === undefined || attribute.rank > best.rank ? attribute : best),
        undefined,
      )?.attributeId ?? primaryAttributeOf(primary).id;
  return {
    weaponSets: [sets[0] ?? first, sets[1] ?? null, sets[2] ?? null, sets[3] ?? null],
    armor: armor("survivor", mainAttributeId),
  };
}

export type PvxDecoded =
  | { readonly ok: true; readonly build: PlayerBuild }
  | { readonly ok: false; readonly reason: string };

/** `build` as a legal build named `Gust (E/Me)`, or why it is not one. */
export function decodePvxBuild(build: PvxBuild): PvxDecoded {
  const decoded = decodeTemplateCode(build.code);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.problems.join(" ") };
  }
  if (decoded.missingSkills.length > 0) {
    return { ok: false, reason: `GW1 skills not in the game: ${decoded.missingSkills.join(", ")}` };
  }
  const { build: template } = decoded;
  const professions = [template.primaryProfession, template.secondaryProfession]
    .flatMap((profession) =>
      profession === undefined ? [] : [PROFESSIONS[profession].abbreviation],
    )
    .join("/");
  const player: PlayerBuild = {
    name: `${build.name} (${professions})`,
    primaryProfession: template.primaryProfession,
    secondaryProfession: template.secondaryProfession,
    attributes: template.attributes,
    skillBar: template.skillBar,
    equipment: equipmentFor(template),
  };
  const problems = validatePlayerBuild(player, MINIMAL_GW_INSPIRED_PVP_V1.attributes);
  if (problems.length > 0) {
    return { ok: false, reason: problems.map((problem) => problem.message).join(" ") };
  }
  return { ok: true, build: player };
}

/** How a PvX build is named in `PVX_SKIPPED`: the PvX file's name, its rating left out. */
export function pvxKey(build: PvxBuild): string {
  return `${build.professions} ${build.mode} ${build.name}`;
}

/**
 * `list`'s builds that decode to a legal one, a bar already taken
 * counted once, and every other one by `pvxKey` with why it is not.
 */
export function decodePvxBuilds(list: readonly PvxBuild[]): {
  readonly builds: readonly PlayerBuild[];
  readonly skipped: Readonly<Record<string, string>>;
} {
  const builds: PlayerBuild[] = [];
  const skipped: Record<string, string> = {};
  const bars = new Map<string, string>();
  for (const pvx of list) {
    const decoded = decodePvxBuild(pvx);
    if (!decoded.ok) {
      skipped[pvxKey(pvx)] = decoded.reason;
      continue;
    }
    const bar = [...decoded.build.skillBar].sort().join();
    const taken = bars.get(bar);
    if (taken !== undefined) {
      skipped[pvxKey(pvx)] = `The same bar as ${taken}.`;
      continue;
    }
    bars.set(bar, decoded.build.name);
    builds.push(decoded.build);
  }
  return { builds, skipped };
}

/**
 * The built-in builds (#2554): the PvX solo builds that are legal here.
 * What the host hands a player who brings no legal build of their own,
 * one picked at random, and what a bot or a reroll draws from.
 */
export const STARTER_BUILDS: readonly PlayerBuild[] = decodePvxBuilds(PVX_SOLO).builds;

/**
 * A starter build by `random` ([0, 1), the host's own), never one with
 * `not`'s professions, so a reroll always changes it. By professions,
 * not name: a rolled character carries a name of its own (#1149).
 */
export function pickStarterBuild(random: () => number, not?: PlayerBuild): PlayerBuild {
  return pickBuildFrom(STARTER_BUILDS, random, not);
}

function sameProfessions(a: PlayerBuild, b: PlayerBuild): boolean {
  return (
    a.primaryProfession === b.primaryProfession && a.secondaryProfession === b.secondaryProfession
  );
}

/** `pickStarterBuild` over `builds`. With only `not` to pick, that is what it picks. */
export function pickBuildFrom(
  builds: readonly PlayerBuild[],
  random: () => number,
  not?: PlayerBuild,
): PlayerBuild {
  const others = builds.filter((build) => not === undefined || !sameProfessions(build, not));
  const pool = others.length > 0 ? others : builds;
  // Clamped: a `random` just under 1 must not index past the end.
  const picked = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (picked === undefined) {
    throw new Error("no builds to pick from");
  }
  return picked;
}

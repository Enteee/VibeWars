import type { AttributeAllocation } from "./attributes.js";
import { validatePlayerBuild, type PlayerBuild, type SkillBar } from "./build.js";
import { defaultEquipmentFor, type BuildEquipment } from "./equipment/index.js";
import { ALL_WEAPONS, allowsOffhand, wieldsFor } from "./equipment/weapons.js";
import { decodeTemplate } from "./gw1-template.js";
import { PROFESSIONS, primaryAttributeOf, type ProfessionId } from "./professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import { armor } from "./starter-armor.js";

/**
 * The PvX wiki's solo PvP builds (#2554), verbatim from the operator's
 * list on #2546: every one rated Good or Great there, in any mode, PvE
 * packs left out. `name` is PvX's, `code` its GW1 template code.
 */
export interface PvxEntry {
  readonly name: string;
  readonly rating: string;
  readonly mode: string;
  readonly code: string;
}

export const PVX_SOLO: readonly PvxEntry[] = [
  { name: "Gust", rating: "Good", mode: "PvP", code: "OwZjgod8IOnDFWCz4jwWadDAA" },
  { name: "Wastrel's Collapse", rating: "Great", mode: "PvP", code: "OwZjsod8ISsZ/PMMJMGfIMPDTQA" },
  {
    name: "Way of the Assassin",
    rating: "Meta-Good",
    mode: "PvP",
    code: "OwZjgYd7ITOMEfHM7PxZaVdDAAA",
  },
  { name: "Flourish", rating: "Provisional-Good", mode: "RA", code: "OwFjMNd8IPLFFWCz4jwwKFGBA" },
  {
    name: "Wounding Strike",
    rating: "Provisional-Good",
    mode: "GvG",
    code: "OgejkyqJbSAYcflbVX0XihTQCAA",
  },
  {
    name: "Zurrie Dervish",
    rating: "Meta-Great",
    mode: "GvG",
    code: "OgCkkuq0ayqU8l3mFo4G7F3l6F6F",
  },
  {
    name: "Avatar of Balthazar",
    rating: "Meta-Great",
    mode: "PvP",
    code: "OgCjkqqK7OuXvN3PAXuBAIYAA",
  },
  {
    name: "Avatar of Grenth",
    rating: "Meta-Great",
    mode: "PvP",
    code: "OgCjkyqIrSBYAAAAibobdfwXCAA",
  },
  { name: "May Scythe", rating: "Great", mode: "PvP", code: "OgCjkyqJbSBYPX/XlbYXibobCAA" },
  { name: "Pious Renewal", rating: "Good", mode: "PvP", code: "OgCikysM9fJdFgBAsdJGegJAA" },
  { name: "Avatar of Lyssa", rating: "Good", mode: "RA", code: "OgCjkuqKrSBYWgibebIYcfxXCAA" },
  {
    name: "Empathic Removal",
    rating: "Provisional-Good",
    mode: "RA",
    code: "OgOisysMZGBeZfpfJexdxeRfB",
  },
  { name: "Life Sheath", rating: "Good", mode: "RA", code: "OgOj8wrIrOjR7r+V8ydBvzX6L" },
  {
    name: "March Signet of Suffering",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OgSiQws8QVbDgtCB99RcgBAA",
  },
  { name: "Mirror of Ice", rating: "Great", mode: "GvG", code: "OgBSsYGTIDKRVDmVPfrDQiAAA" },
  { name: "Double Dragon", rating: "Great", mode: "PvP", code: "OgBSoYGPDxfRvYXMWxFAABA" },
  {
    name: "Flux Master of Magic",
    rating: "Great",
    mode: "PvP",
    code: "OgBUkQVuSmO/Cn22YdAAAAiVBA",
  },
  { name: "Gust", rating: "Meta-Great", mode: "PvP", code: "OgBSgYGTLNiCeDLgcD0ChDCAA" },
  { name: "Invoke Lightning", rating: "Great", mode: "PvP", code: "OgBSgYGTAaLgeDcD0ChDAAAAA" },
  { name: "Lightning Surge", rating: "Meta-Great", mode: "PvP", code: "OgBSgYmSNDfDeDcDAA0ChDCAA" },
  { name: "Mind Blast", rating: "Great", mode: "PvP", code: "OgBSoYGO+5fRvYXAAAA0CcB" },
  { name: "Stone Sheath", rating: "Great", mode: "PvP", code: "OgBSkYGTdVrCbDAAAAAApCCAA" },
  { name: "Stoning", rating: "Great", mode: "PvP", code: "OgBSkYGPe1Vx2AAAAoFpCBA" },
  {
    name: "Teinai's Mind Burn",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgBTgQFzUKXIHasqpRICXgWAAA",
  },
  { name: "Mind Shock", rating: "Great", mode: "RA", code: "OgBSgYGTeDLgcDiDAAhD0CCAA" },
  {
    name: "Second Wind",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgpkgwKITuWUOk3Q5ADIQkBm6lAA",
  },
  {
    name: "Mind Burn",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OgNToYm2wJX8LGrCRQSZlWgLA",
  },
  { name: "Blinding Surge", rating: "Great", mode: "RA", code: "OgRTcMEz25qCAAAcjdHtIcIAA" },
  { name: "Searing Flames", rating: "Great", mode: "PvP", code: "OgljowMpZS0NjVED7CAAID4C7YA" },
  { name: "Unsteady Ground", rating: "Great", mode: "PvP", code: "OgljkwMpZS7QnCeVrCID0CpC7YA" },
  {
    name: "Wastrel's Capper",
    rating: "Meta-Great",
    mode: "JQ",
    code: "OQdUAOBP0PR5AhQ3UyAAAoAIQTQA",
  },
  { name: "Migraine Wastrel's", rating: "Good", mode: "FA", code: "OQBUAwwKyBS1A9U3UXA5A9AAAAAA" },
  {
    name: "Psychic Instability Wastrel's",
    rating: "Meta-Great",
    mode: "FA",
    code: "OQBTAUBPQqJIESG4mKHAAAFAAA",
  },
  { name: "Shutdown", rating: "Great", mode: "FA", code: "OQBTAQBP0AA5wDAAFFJDAA" },
  { name: "Panic", rating: "Provisional-Good", mode: "HA", code: "OQBTAQBPUh0zgiwDmBaAAAAA" },
  {
    name: "Air of Disenchantment",
    rating: "Meta-Good",
    mode: "PvP",
    code: "OQBTAyAPSCPbCAAonCAAAgIQAA",
  },
  { name: "Arcane Languor", rating: "Good", mode: "PvP", code: "OQBTAUBPwhkdTFcaAPARoHIAA" },
  { name: "Power Block", rating: "Great", mode: "PvP", code: "OQhkAoC8AGKUBApTGAAwMQRARQyF" },
  { name: "Energy Surge", rating: "Meta-Good", mode: "RA", code: "OQBTAQBPU6EAAAAQD4nKnyDQAA" },
  { name: "Migraine", rating: "Great", mode: "RA", code: "OQBTAwAPUqGAHAAonKDoHgIQAA" },
  { name: "Power Block", rating: "Great", mode: "RA", code: "OQBTAQBP0pA4BupAAAAAgIIAA" },
  { name: "Psychic Distraction", rating: "Good", mode: "RA", code: "OQBTAQBPQqDyDQD4miIAAAAQAA" },
  { name: "Glyph of Renewal", rating: "Great", mode: "FA", code: "OQZTAQBP0YZAIHzwDFBAoA" },
  { name: "Glyph of Renewal", rating: "Good", mode: "JQ", code: "OQZTASBPSqJYZY6h0JHAAAAgIA" },
  { name: "May Wastrel's", rating: "Good", mode: "FA", code: "OQRUAOBPoiOLhmwNVGkD4AiOvA" },
  { name: "Energy Surge", rating: "Meta-Great", mode: "GvG", code: "OQhkAoC8AGKEpDAAAwMwJQRARQyF" },
  {
    name: "Healing Burst",
    rating: "Meta-Great",
    mode: "GvG",
    code: "OwcU04HC1vQeRNgkECE1NTf3ENQA",
  },
  { name: "Air of Enchantment", rating: "Great", mode: "FA", code: "OwAT00HDRaLamoBcj4uqeQgYTD" },
  {
    name: "June Healing Burst",
    rating: "Meta-Great",
    mode: "PvP",
    code: "OwEU0ynCzKSNgeRCE3EAATf8FzFA",
  },
  {
    name: "Word of Healing",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OwAT043BRqBUj4mQgY6DAAAAAA",
  },
  {
    name: "Ray of Judgment",
    rating: "Meta-Great",
    mode: "JQ",
    code: "Owkj4wQpZS4VUfuE+MAAAA3Y7YA",
  },
  { name: "Zealous Benediction", rating: "Good", mode: "JQ", code: "Owkj8wQpZSXazEba3V1DtE7Y3YA" },
  {
    name: "Restore Condition",
    rating: "Meta-Great",
    mode: "GvG",
    code: "OwET8YIWViiQLKgQgYlom4BcuA",
  },
  { name: "Healing Burst", rating: "Meta-Great", mode: "RA", code: "OwEU04nA1KSNgeRAA3ETfQgAA8FA" },
  {
    name: "Word of Healing",
    rating: "Meta-Great",
    mode: "RA",
    code: "OwEU04nA1KSNgaE3N3ETfQg8FzFA",
  },
  { name: "Contagion Bomber", rating: "Meta-Good", mode: "JQ", code: "OAdTQ4CbGCNgOgpSBUOLSwTYCC" },
  {
    name: "Degen Pressure",
    rating: "Provisional-Good",
    mode: "JQ",
    code: "OAdVUSzdUv+jBktnfzAA1AbABOBB",
  },
  {
    name: "Life Transfer",
    rating: "Provisional-Good",
    mode: "JQ",
    code: "OAdTQYD61xPMIAbfu38jYOMBB",
  },
  { name: "Pain of Disenchantment", rating: "Good", mode: "FA", code: "OABSY4DTPVHC7BjBJgAAAAAAA" },
  { name: "Corrupt Enchantment", rating: "Good", mode: "PvP", code: "OABSY4DTSVAAHCMiJgVCAACAA" },
  { name: "Signet of Suffering", rating: "Great", mode: "PvP", code: "OAdSQYDTUVFCtBgNPCNiTQCAA" },
  {
    name: "Pain of Disenchantment Healer",
    rating: "Good",
    mode: "FA",
    code: "OAhjYgHaIPPVAAAQaO5inTsxJ",
  },
  { name: "May Spiker", rating: "Meta-Great", mode: "GvG", code: "OQCjUymIqSPYFZBZWYAAVYubCAA" },
  {
    name: "Flesh Wound",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OQGlUhlrJeGoJ9jZhFk9gxVwT4uBAA",
  },
  { name: "Stunning Strike", rating: "Great", mode: "PvP", code: "OQGjUhlMqOAZAAAgnIk5LCA3N" },
  {
    name: "Cruel Spear",
    rating: "Provisional-Good",
    mode: "RA",
    code: "OQGjUhlMqO8EF8DmBXk5LubBA",
  },
  { name: "Barrage", rating: "Good", mode: "JQ", code: "OgASc5MTLGPGqGIGFHAAAAAAA" },
  {
    name: "Apply Poison",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OgATcXsmV6xQ1oqp4AAY24XDAA",
  },
  {
    name: "Concussion Shot",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgATcVsm35xgZytzmfNAAAIAA",
  },
  { name: "Poison Arrow", rating: "Good", mode: "PvP", code: "OgATcXsm1R18YoM+2fNAAAIAA" },
  {
    name: "Moebius Strike",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OgcTc580Zyhx/Jhph5g5xo4QAA",
  },
  {
    name: "Magebane Shot",
    rating: "Provisional-Great",
    mode: "HA",
    code: "OgYUky7ixMOAAf9jZ28rbFxCBA",
  },
  {
    name: "Melandru's Shot",
    rating: "Provisional-Great",
    mode: "HA",
    code: "OgYUky7ixMOVNVzjZ28rbFxCBA",
  },
  {
    name: "June Star Burst",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgYTgW1ex5ImDRHnjsqw1YIAA",
  },
  { name: "May Apply Poison", rating: "Good", mode: "PvP", code: "OgMU8m7ix8OAAEjq5xMb+15VAA" },
  { name: "Edge of Extinction", rating: "Good", mode: "FA", code: "OgQUUQreTcOqhKD0Z6AcNboBxA" },
  { name: "May Toucher", rating: "Good", mode: "FA", code: "OgQTQ4zc5pGyJAAoGNhwhVmaA" },
  { name: "Turret", rating: "Provisional-Great", mode: "GvG", code: "OgQTcmLnZ6xQ1AxQ3a1gCEAoRA" },
  {
    name: "Packhunter",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgkjYxXYpS8Weh/GDZ8G0GbGCAA",
  },
  {
    name: "Stunning Strike",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OgkkYhXI2VyEQmZ4QmQGAgxxshAA",
  },
  {
    name: "Caretaker's Charge",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OAChIyD0OZac9mAAAAAAAA",
  },
  { name: "Soul Twisting", rating: "Good", mode: "PvP", code: "OACjAyhG5SYThTWPPOyTqTAAJXA" },
  {
    name: "Channeling Magic Pressure",
    rating: "Meta-Good",
    mode: "RA",
    code: "OACjEyiM5QWbdTbMLTGXYOlTSTA",
  },
  {
    name: "Destructive Was Glaive Support",
    rating: "Provisional-Good",
    mode: "PvP",
    code: "OAejEuiMpREbOOYMTMxTRTjTTQA",
  },
  { name: "Xinrae's Weapon", rating: "Great", mode: "FA", code: "OAajEqiLpSWbUOGXTMxTHTIDlTA" },
  { name: "Soul Twisting", rating: "Great", mode: "FA", code: "OAOjAyhDJTWPPOhTAAYTWTST1EA" },
  {
    name: "Destructive Was Glaive Utility",
    rating: "Provisional-Good",
    mode: "FA",
    code: "OASjUYhrITEbOOTOSTZMjTMTeBA",
  },
  {
    name: "Spirit's Strength Caller",
    rating: "Great",
    mode: "HA",
    code: "OAmkASka5amkGIR2N2HGZoyGymAA",
  },
  { name: "Rampage as One Axe", rating: "Good", mode: "PvP", code: "OgETIZreRKXLqYviqAAg2YzQAA" },
  { name: "Enraged Smash", rating: "Meta-Great", mode: "GvG", code: "OQASE5JThPLFgFGFJO8VdFCAA" },
  {
    name: "Devastating Hammer",
    rating: "Meta-Great",
    mode: "PvP",
    code: "OQASE5JPjFwySBAwU4rGWBA",
  },
  {
    name: "Earth Shaker",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OQASE5JPiFwySBAwU4rGWBA",
  },
  { name: "May Axe", rating: "Meta-Great", mode: "PvP", code: "OQASEZJPRFAweFAwU0K/EBA" },
  {
    name: "Backbreaker Daggers",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OQcTExp25xswXVYIMjP/bCKAA",
  },
  { name: "Forceful Blow", rating: "Good", mode: "PvP", code: "OQcTE5J7nJvtUALMF+qhViJAA" },
  {
    name: "November Enraged Smash",
    rating: "Meta-Great",
    mode: "PvP",
    code: "OQcSE5JPhvE3SBs0m1KTQBA",
  },
  { name: "Coward Axe", rating: "Good", mode: "PvP", code: "OQYTgmILZKqoScv6cosRr4nQAA" },
  {
    name: "June Star Burst",
    rating: "Provisional-Great",
    mode: "PvP",
    code: "OQYTo2oKV6IqSMqgpQr4nwWQAA",
  },
  { name: "Shock Axe", rating: "Great", mode: "PvP", code: "OQYTgmILZSqoSkq4cgpQr4nQAA" },
  { name: "Whirling Axe", rating: "Great", mode: "PvP", code: "OQYTgmILZJqwbAgpOHt6nEAA" },
  {
    name: "Stunning Strike Warrior",
    rating: "Good",
    mode: "RA",
    code: "OQkiExlMBkZGWkNkJkxXBAIAA",
  },
];

/**
 * The PvX builds that are not starter builds, by name, and why: a skill
 * VibeWars lacks, or a bar that is not legal here. Never patched to
 * fit. A test holds this to exactly what decoding skips, so it only
 * shrinks as skills land.
 */
export const PVX_SKIPPED: Readonly<Record<string, string>> = {
  // PVX_SKIPPED_DATA
};

/** A decoded PvX entry: its build, or why it is not one. */
export type PvxBuildResult =
  | { readonly ok: true; readonly build: PlayerBuild }
  | { readonly ok: false; readonly reason: string };

/** `name (P/S)`, as PvX names a build, with the code's own secondary. */
function pvxName(name: string, primary: ProfessionId, secondary: ProfessionId | undefined): string {
  const professions = [primary, secondary].flatMap((profession) =>
    profession === undefined ? [] : [PROFESSIONS[profession].abbreviation],
  );
  return `${name} (${professions.join("/")})`;
}

/**
 * The primary's own equipment, with the weapon the bar's first attack
 * skill needs when the primary's own cannot use it; a two-handed one
 * leaves the off-hand empty. Armour as the starter teams wear it, on
 * the primary attribute ranked highest.
 */
function equipmentFor(
  primary: ProfessionId,
  attributes: readonly AttributeAllocation[],
  skillBar: SkillBar,
): BuildEquipment {
  const base = defaultEquipmentFor(primary);
  const [own] = base.weaponSets;
  const needed = skillBar.flatMap((id) => {
    const weapon = id === null ? undefined : getSkill(id)?.attack?.weapon;
    return weapon === undefined ? [] : [weapon];
  })[0];
  let weaponSet = own ?? null;
  if (own !== undefined && own !== null && needed !== undefined) {
    if (!wieldsFor(own.mainHand.weaponId, needed)) {
      const weapon = ALL_WEAPONS.find((candidate) => wieldsFor(candidate.id, needed));
      if (weapon !== undefined) {
        weaponSet = {
          mainHand: { ...own.mainHand, weaponId: weapon.id, requirementAttributeId: null },
          offHand: allowsOffhand(weapon) ? own.offHand : null,
        };
      }
    }
  }
  const ranked = attributes
    .filter((attribute) => attribute.attributeId.startsWith(`${primary}.`))
    .reduce<AttributeAllocation | undefined>(
      (best, attribute) => (best === undefined || attribute.rank > best.rank ? attribute : best),
      undefined,
    );
  const main = ranked?.attributeId ?? primaryAttributeOf(primary).id;
  return {
    weaponSets: [weaponSet, null, null, null],
    armor: armor("survivor", main),
  };
}

/** `entry` as a starter build, or the reason it cannot be one. */
export function pvxBuild(entry: PvxEntry): PvxBuildResult {
  const decoded = decodeTemplate(entry.code);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.problems.join(" ") };
  }
  if (decoded.missingSkills.length > 0) {
    return {
      ok: false,
      reason: `GW1 skill ${decoded.missingSkills.join(", ")} not in VibeWars`,
    };
  }
  const { primaryProfession, secondaryProfession, attributes, skillBar } = decoded.build;
  const build: PlayerBuild = {
    name: pvxName(entry.name, primaryProfession, secondaryProfession),
    primaryProfession,
    secondaryProfession,
    attributes,
    skillBar,
    equipment: equipmentFor(primaryProfession, attributes, skillBar),
  };
  const problems = validatePlayerBuild(build, MINIMAL_GW_INSPIRED_PVP_V1.attributes);
  if (problems.length > 0) {
    return { ok: false, reason: problems.map((problem) => problem.message).join(" ") };
  }
  return { ok: true, build };
}

function barKey(build: PlayerBuild): string {
  return `${build.primaryProfession}/${String(build.secondaryProfession)}:${build.skillBar.join(",")}`;
}

/**
 * Every PvX entry decoded: the legal builds, the first of any two with
 * the same professions and bar, and the rest by name with the reason.
 */
export function decodePvxBuilds(entries: readonly PvxEntry[]): {
  readonly builds: readonly PlayerBuild[];
  readonly skipped: Readonly<Record<string, string>>;
} {
  const builds: PlayerBuild[] = [];
  const skipped: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const result = pvxBuild(entry);
    if (!result.ok) {
      skipped[entry.name] = result.reason;
      continue;
    }
    const first = seen.get(barKey(result.build));
    if (first !== undefined) {
      skipped[entry.name] = `same bar as ${first}`;
      continue;
    }
    seen.set(barKey(result.build), entry.name);
    builds.push(result.build);
  }
  return { builds, skipped };
}

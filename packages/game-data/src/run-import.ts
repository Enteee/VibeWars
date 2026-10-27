import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importSkills, type SkillSpec } from "./importer.js";
import { writeSkillBundle } from "./generate.js";

/**
 * The curated skill list for this pass of the pipeline (brief §9: "do not
 * attempt to implement all skills simultaneously"). Chosen to span
 * distinct mechanics — attack damage, AoE, heal, condition removal,
 * interrupt, hex, enchantment, skill-copy — so Sprint 10's engine has a
 * genuinely varied set to prove itself against, not sixteen damage spells.
 *
 * Source: gw-memorial.net (brief §7). Expanding this list (or adding the
 * Guild Wars Wiki as a second source once it is reachable — see
 * ADR-0004) is just adding more entries here and re-running `pnpm run
 * import`.
 */
const SKILL_SPECS: readonly SkillSpec[] = [
  {
    id: "warrior.swift-chop",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/10-Swift_Chop",
  },
  {
    id: "warrior.whirlwind-attack",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/1247-Whirlwind_Attack",
  },
  {
    id: "warrior.backbreaker",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/11-Backbreaker",
  },
  {
    id: "warrior.distracting-blow",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/71-Distracting_Blow",
  },
  {
    id: "warrior.healing-signet",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/65-Healing_Signet",
  },
  {
    id: "warrior.watch-yourself",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/56-Watch_Yourself!",
  },
  {
    id: "monk.contemplation-of-purity",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/154-Contemplation_of_Purity",
  },
  {
    id: "monk.orison-of-healing",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/175-Orison_of_Healing",
  },
  {
    id: "monk.guardian",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/183-Guardian",
  },
  {
    id: "elementalist.fireball",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/416-Fireball",
  },
  {
    id: "elementalist.meteor-shower",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/425-Meteor_Shower",
  },
  {
    id: "elementalist.armor-of-earth",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/394-Armor_of_Earth",
  },
  {
    id: "necromancer.contagion",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/876-Contagion",
  },
  {
    id: "necromancer.faintheartedness",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/258-Faintheartedness",
  },
  {
    id: "necromancer.weaken-armor",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/275-Weaken_Armor",
  },
  {
    id: "necromancer.parasitic-bond",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/264-Parasitic_Bond",
  },
  {
    id: "necromancer.rotting-flesh",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/291-Rotting_Flesh",
  },
  {
    id: "ranger.broad-head-arrow",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/501-Broad_Head_Arrow",
  },
  {
    id: "ranger.barrage",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/109-Barrage",
  },
  {
    id: "ranger.troll-unguent",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/143-Troll_Unguent",
  },
  {
    id: "mesmer.arcane-echo",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/370-Arcane_Echo",
  },
  {
    id: "mesmer.echo",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/372-Echo",
  },
  {
    id: "warrior.sprint",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/39-Sprint",
  },
  {
    id: "assassin.dash",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/705-Dash",
  },
  {
    id: "paragon.wild-throw",
    profession: "paragon",
    url: "https://www.gw-memorial.net/skills/Paragon/1131-Wild_Throw",
  },
  {
    id: "ranger.apply-poison",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/122-Apply_Poison",
  },
  {
    id: "elementalist.glyph-of-lesser-energy",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/452-Glyph_of_Lesser_Energy",
  },
  {
    id: "elementalist.chain-lightning",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/378-Chain_Lightning",
  },
  {
    id: "elementalist.lightning-orb",
    profession: "elementalist",
    url: "https://www.gw-memorial.net/skills/Elementalist/384-Lightning_Orb",
  },
  {
    id: "necromancer.enfeeble",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/256-Enfeeble",
  },
  {
    id: "paragon.anthem-of-flame",
    profession: "paragon",
    url: "https://www.gw-memorial.net/skills/Paragon/1084-Anthem_of_Flame",
  },
  {
    id: "ritualist.weapon-of-warding",
    profession: "ritualist",
    url: "https://www.gw-memorial.net/skills/Ritualist/769-Weapon_of_Warding",
  },
  {
    id: "mesmer.power-spike",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/320-Power_Spike",
  },
  {
    id: "mesmer.power-block",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/318-Power_Block",
  },
  {
    id: "mesmer.power-drain",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/367-Power_Drain",
  },
  {
    id: "mesmer.shatter-enchantment",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/323-Shatter_Enchantment",
  },
  {
    id: "mesmer.drain-enchantment",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/346-Drain_Enchantment",
  },
  {
    id: "monk.mend-condition",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/189-Mend_Condition",
  },
  {
    id: "assassin.jagged-strike",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/658-Jagged_Strike",
  },
  {
    id: "assassin.black-lotus-strike",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/635-Black_Lotus_Strike",
  },
  {
    id: "assassin.fox-fangs",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/654-Fox_Fangs",
  },
  {
    id: "assassin.wild-strike",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/665-Wild_Strike",
  },
  {
    id: "assassin.death-blossom",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/648-Death_Blossom",
  },
  {
    id: "assassin.twisting-fangs",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/644-Twisting_Fangs",
  },
  {
    id: "assassin.horns-of-the-ox",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/657-Horns_of_the_Ox",
  },
  {
    id: "assassin.moebius-strike",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/661-Moebius_Strike",
  },
  {
    id: "paragon.cruel-spear",
    profession: "paragon",
    url: "https://www.gw-memorial.net/skills/Paragon/1119-Cruel_Spear",
  },
  {
    id: "warrior.sever-artery",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/50-Sever_Artery",
  },
  {
    id: "warrior.eviscerate",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/7-Eviscerate",
  },
  {
    id: "warrior.disrupting-chop",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/6-Disrupting_Chop",
  },
  {
    id: "warrior.executioners-strike",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/8-Executioner's_Strike",
  },
  {
    id: "ranger.punishing-shot",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/119-Punishing_Shot",
  },
  {
    id: "ranger.throw-dirt",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/107-Throw_Dirt",
  },
  {
    id: "necromancer.enfeebling-blood",
    profession: "necromancer",
    url: "https://www.gw-memorial.net/skills/Necromancer/257-Enfeebling_Blood",
  },
  {
    id: "monk.word-of-healing",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/178-Word_of_Healing",
  },
  {
    id: "dervish.mystic-sweep",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/1029-Mystic_Sweep",
  },
  {
    id: "ranger.savage-shot",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/121-Savage_Shot",
  },
  {
    id: "ranger.distracting-shot",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/99-Distracting_Shot",
  },
  {
    id: "mesmer.energy-burn",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/311-Energy_Burn",
  },
  {
    id: "mesmer.energy-tap",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/349-Energy_Tap",
  },
  {
    id: "mesmer.backfire",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/305-Backfire",
  },
  {
    id: "mesmer.empathy",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/310-Empathy",
  },
  {
    id: "monk.restore-life",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/176-Restore_Life",
  },
  {
    id: "mesmer.energy-surge",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/312-Energy_Surge",
  },
  {
    id: "mesmer.leech-signet",
    profession: "mesmer",
    url: "https://www.gw-memorial.net/skills/Mesmer/355-Leech_Signet",
  },
  {
    id: "monk.dwaynas-kiss",
    profession: "monk",
    url: "https://www.gw-memorial.net/skills/Monk/164-Dwayna's_Kiss",
  },
  {
    id: "dervish.mystic-regeneration",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/991-Mystic_Regeneration",
  },
  {
    id: "dervish.fleeting-stability",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/989-Fleeting_Stability",
  },
  {
    id: "dervish.heart-of-fury",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/1011-Heart_of_Fury",
  },
  {
    id: "dervish.wounding-strike",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/1036-Wounding_Strike",
  },
  {
    id: "dervish.signet-of-pious-light",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/996-Signet_of_Pious_Light",
  },
  {
    id: "dervish.pious-restoration",
    profession: "dervish",
    url: "https://www.gw-memorial.net/skills/Dervish/1052-Pious_Restoration",
  },
  {
    id: "warrior.frenzy",
    profession: "warrior",
    url: "https://www.gw-memorial.net/skills/Warrior/73-Frenzy",
  },
  {
    id: "assassin.dark-escape",
    profession: "assassin",
    url: "https://www.gw-memorial.net/skills/Assassin/688-Dark_Escape",
  },
  {
    id: "ranger.natural-stride",
    profession: "ranger",
    url: "https://www.gw-memorial.net/skills/Ranger/826-Natural_Stride",
  },
];

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

async function main(): Promise<void> {
  const report = await importSkills(SKILL_SPECS, {
    rawDir: resolve(packageRoot(), "raw/gw-memorial"),
    normalizedDir: resolve(packageRoot(), "normalized"),
  });

  console.info(`imported:    ${String(report.imported)}`);
  console.info(`normalized:  ${String(report.normalized)}`);
  console.info(`unsupported: ${String(report.unsupported.length)}`);
  for (const p of report.unsupported) {
    console.info(`  - ${p.id} (${p.url}): ${p.reason}`);
  }
  console.info(`rejected:    ${String(report.rejected.length)}`);
  for (const p of report.rejected) {
    console.info(`  - ${p.id} (${p.url}): ${p.reason}`);
  }

  const generated = writeSkillBundle();
  console.info(`generated bundle: ${String(generated.skills.length)} skills`);
  if (generated.rejected.length > 0) {
    console.error(
      `generate step rejected ${String(generated.rejected.length)} normalized file(s):`,
    );
    for (const r of generated.rejected) {
      console.error(`  - ${r.file}: ${r.reason}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("import failed:", error);
  process.exitCode = 1;
});

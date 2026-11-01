import {
  IMPLEMENTED_SKILLS,
  STATUS_DEFINITIONS,
  computeCoverage,
  fighter,
  formatCoverage,
  getSkill,
  runHeadlessMatch,
  statAtTwelve,
} from "@vibewars/game-core";

import { generateSkillBundle } from "./generate.js";

/**
 * Developer tooling (brief §28): a skill inspector, a status inspector,
 * the coverage report and a headless match runner, all from a terminal.
 *
 * It lives in `game-data` rather than `game-core` because the coverage
 * report needs the imported corpus, and `game-core` must not depend on
 * the data package (ADR-0001's one-way dependency rule). `game-data`
 * already depends on `game-core`, so this is the one place both are
 * legitimately in scope.
 */

function printSkills(filter: string | undefined): void {
  const skills =
    filter === undefined
      ? IMPLEMENTED_SKILLS
      : IMPLEMENTED_SKILLS.filter(
          (skill) =>
            skill.id.includes(filter) || skill.name.toLowerCase().includes(filter.toLowerCase()),
        );

  if (skills.length === 0) {
    console.info(`no implemented skill matches ${JSON.stringify(filter ?? "")}`);
    return;
  }

  for (const skill of skills) {
    const cost =
      skill.cost === undefined ? "free" : `${String(skill.cost.amount)} ${skill.cost.kind}`;
    console.info(skill.id);
    console.info(`  ${skill.name} — ${skill.attributeId ?? `${skill.profession}, no attribute`}`);
    console.info(
      `  cost ${cost} · cast ${String(skill.activationSeconds)}s · recharge ${String(
        skill.rechargeSeconds,
      )}s · range ${String(skill.range)} · target ${skill.target}`,
    );
    for (const effect of skill.effects) {
      console.info(`  - ${effect.kind}`);
    }
    console.info("");
  }
}

function printStatuses(): void {
  for (const status of Object.values(STATUS_DEFINITIONS)) {
    const parts: string[] = [];
    const healthPips = statAtTwelve(status.healthPips);
    const armorModifier = statAtTwelve(status.armorModifier);
    const attackDurationMultiplier = statAtTwelve(status.attackDurationMultiplier);
    if (healthPips !== 0) {
      parts.push(`${String(healthPips)} health pips`);
    }
    if (status.energyPips !== 0) {
      parts.push(`${String(status.energyPips)} energy pips`);
    }
    if (armorModifier !== 0) {
      parts.push(`${String(armorModifier)} armor`);
    }
    if (status.moveSpeedMultiplier !== 1) {
      parts.push(`move x${String(status.moveSpeedMultiplier)}`);
    }
    if (status.attackMissChance !== 0) {
      parts.push(`${String(status.attackMissChance * 100)}% miss`);
    }
    if (status.maxHealthLoss !== undefined) {
      const { fraction, cap } = status.maxHealthLoss;
      parts.push(`max hp -${String(fraction * 100)}% (cap ${String(cap)})`);
    }
    if (status.healingMultiplier !== 1) {
      parts.push(`healing x${String(status.healingMultiplier)}`);
    }
    if (status.castTimeMultiplier !== 1) {
      parts.push(`cast x${String(status.castTimeMultiplier)}`);
    }
    if (status.interruptsSpells) {
      parts.push("attacks interrupt spells");
    }
    if (attackDurationMultiplier !== 1) {
      parts.push(`attack x${String(attackDurationMultiplier)}`);
    }
    console.info(`${status.id.padEnd(14)} ${status.category.padEnd(12)} ${parts.join(", ")}`);
  }
}

function printCoverage(): void {
  const bundle = generateSkillBundle();
  console.info(formatCoverage(computeCoverage(bundle.skills.map((skill) => skill.id))));
}

function printDuel(aSkill: string, bSkill: string, seed: string): void {
  if (getSkill(aSkill) === undefined || getSkill(bSkill) === undefined) {
    console.error("both arguments must be implemented skill ids; run `skills` to list them");
    process.exitCode = 1;
    return;
  }

  const result = runHeadlessMatch({
    seed,
    maxSeconds: 300,
    fighters: [fighter("a", 0, [aSkill]), fighter("b", 1, [bSkill])],
  });

  console.info(`seed:      ${seed}`);
  console.info(`duration:  ${result.seconds.toFixed(1)}s (${String(result.ticks)} ticks)`);
  console.info(`survivors: ${result.survivors.length > 0 ? result.survivors.join(", ") : "none"}`);
  for (const [id, damage] of result.damageDealt) {
    console.info(`  ${id} dealt ${String(Math.round(damage))} damage`);
  }
}

function usage(): void {
  console.info(`vibewars dev tools

  skills [filter]                 inspect implemented skills
  statuses                        list conditions, hexes and enchantments
  coverage                        imported vs implemented skill coverage
  duel <skillA> <skillB> [seed]   run a headless 1v1 and report the outcome
`);
}

export function runCli(argv: readonly string[]): void {
  const [command, ...rest] = argv;

  switch (command) {
    case "skills":
      printSkills(rest[0]);
      return;
    case "statuses":
      printStatuses();
      return;
    case "coverage":
      printCoverage();
      return;
    case "duel": {
      const [a, b, seed] = rest;
      if (a === undefined || b === undefined) {
        usage();
        process.exitCode = 1;
        return;
      }
      printDuel(a, b, seed ?? "duel");
      return;
    }
    default:
      usage();
      if (command !== undefined && command !== "help") {
        process.exitCode = 1;
      }
  }
}

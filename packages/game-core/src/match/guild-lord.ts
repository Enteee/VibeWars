import { baseEnergyPipsFor } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * The Guild Battle's Guild Lord (#1222, GW1): a map's NPC at the back of
 * its team's lord room. It never moves, and shoots whatever foe comes
 * within its longbow's reach. Its team loses the moment it dies. GW1's
 * numbers where it publishes them; the rest are the spec's.
 */

/** Where a team's Guild Lord stands (#1222), from its map's `guild-lord` objective. */
export interface GuildLord {
  readonly team: number;
  readonly position: Vec2;
}

export const GUILD_LORD_HEALTH = 1680;
export const GUILD_LORD_ARMOR = 80;
export const GUILD_LORD_ENERGY = 30;
/** GW1's "+5 innate" Health regeneration, on top of natural regeneration. */
export const GUILD_LORD_HEALTH_PIPS = 5;
export const GUILD_LORD_MARKSMANSHIP = 12;
export const GUILD_LORD_SKILL_BAR = ["ranger.hunters-shot", "ranger.crippling-shot"] as const;

const LONGBOW = WEAPONS.longbow;

/** GW1's Amulet of Protection (#1223): the most Health a Guild Lord loses in a second at 0:00. */
export const GUILD_LORD_LOSS_CAP_START = 25;
/** ... and from `GUILD_LORD_LOSS_CAP_FULL_SECONDS` on. */
export const GUILD_LORD_LOSS_CAP_FULL = 300;
export const GUILD_LORD_LOSS_CAP_FULL_SECONDS = 12 * 60;

/**
 * The most Health a Guild Lord loses in the whole second of match clock
 * starting at `elapsedSeconds` (#1223): rising linearly from 25 at 0:00 to
 * 300 at 12:00, and 300 after.
 */
export function guildLordLossCap(elapsedSeconds: number): number {
  const share = Math.min(1, Math.max(0, elapsedSeconds) / GUILD_LORD_LOSS_CAP_FULL_SECONDS);
  return GUILD_LORD_LOSS_CAP_START + (GUILD_LORD_LOSS_CAP_FULL - GUILD_LORD_LOSS_CAP_START) * share;
}

/** Rooted at its post: shoots what its bow reaches, chases nothing. */
function guildLordBehaviour(post: Vec2): Behaviour {
  return {
    kind: "guard",
    post,
    aggroUnits: LONGBOW.range,
    leashUnits: 0,
    rooted: true,
    thinkSeconds: 0.25,
  };
}

/** The id of `team`'s Guild Lord: no seat's id has a `/` in it. */
export function guildLordId(team: number): string {
  return `guild-lord/${String(team)}`;
}

/** `lord`, facing `facing`, as the simulation adds it. */
export function guildLordSpec(lord: GuildLord, facing: number): ParticipantSpec {
  return {
    id: guildLordId(lord.team),
    team: lord.team,
    skillBar: [...GUILD_LORD_SKILL_BAR],
    attributeRanks: new Map([["ranger.marksmanship", GUILD_LORD_MARKSMANSHIP]]),
    equipment: {
      ...unarmedResolvedEquipment(GUILD_LORD_ARMOR),
      mainHand: {
        weapon: LONGBOW,
        attributeId: "ranger.marksmanship",
        damageType: LONGBOW.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn: lord.position,
    facing,
    maxHealth: GUILD_LORD_HEALTH,
    maxEnergy: GUILD_LORD_ENERGY,
    baseEnergyPips: baseEnergyPipsFor("ranger"),
    behaviour: guildLordBehaviour(lord.position),
    creature: {
      ownerId: undefined,
      kind: "guild-lord",
      look: "guild-lord",
      name: "Guild Lord",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  };
}

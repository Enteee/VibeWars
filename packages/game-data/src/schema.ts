import { z } from "zod";

/**
 * The normalized skill record (ADR-0004). This is the *normalized* stage
 * of the brief's pipeline — imported raw facts, structurally validated —
 * not yet the *representable* stage (mapped onto `game-core`'s generic
 * effect system, Sprint 10+). `description` stays as source prose because
 * turning it into structured effects is exactly the skill-engine work this
 * sprint explicitly does not do yet.
 */

const costSchema = z.object({
  kind: z.enum(["energy", "adrenaline", "sacrifice"]),
  amount: z.number().nonnegative(),
});

export const normalizedSkillSchema = z.object({
  /** Our own stable id, e.g. "warrior.swift-chop" — never the source's numeric id. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** The source's profession grouping; not yet validated against `game-core`'s
   *  ProfessionId since some skills (PvE-only, shared) don't map 1:1. */
  profession: z.string().min(1),
  attribute: z.string().min(1),
  /** Raw skill-type text from the source, e.g. "Axe attack", "Hex Spell". */
  type: z.string().min(1),
  elite: z.boolean(),
  campaign: z.string().min(1),
  cost: costSchema.optional(),
  /** Activation/cast time in seconds. `0` for instant/not-applicable. */
  activationSeconds: z.number().nonnegative(),
  /** Recharge in seconds. `0` if the source shows none. */
  rechargeSeconds: z.number().nonnegative(),
  description: z.string().min(1),

  /**
   * Explicitly a PvP numbers variant — this source's "current" values are
   * framed around PvP balance (brief §10's PvP/PvE distinction). A PvE
   * variant is out of scope for this pass; see ADR-0004.
   */
  variant: z.literal("pvp"),
  /** Marks this as unmodified reference data, never our own ruleset's numbers. */
  ruleset: z.literal("gw1-reference"),

  source: z.object({
    name: z.literal("gw-memorial.net"),
    url: z.url(),
    fetchedAt: z.iso.datetime(),
  }),

  /**
   * Anything the parser found but could not confidently classify into the
   * fields above. Never silently discarded (brief §7.8) — surfaced here
   * and counted in the coverage report instead.
   */
  unmapped: z.record(z.string(), z.unknown()),
});

export type NormalizedSkill = z.infer<typeof normalizedSkillSchema>;

export class SkillValidationError extends Error {
  public override readonly name = "SkillValidationError";
}

export function validateNormalizedSkill(value: unknown): NormalizedSkill {
  const result = normalizedSkillSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new SkillValidationError(`Invalid normalized skill:\n${issues}`);
  }
  return result.data;
}

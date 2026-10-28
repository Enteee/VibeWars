import { z } from "zod";

/**
 * GW1's whole skill table, from build-wars/gw-skilldata (MIT), vendored
 * unmodified under `raw/gw-skilldata/` at the commit `meta.json` pins
 * (#458, ADR-0038). Ids, numbers and the profession, attribute, type and
 * campaign codes stay GW1's own; `corpus.ts` maps them to ours (#1220).
 */
export interface GwSkillRecord {
  /** GW1's skill id, as template codes carry it. */
  readonly gwId: number;
  readonly name: string;
  /** GW1's full description, scaled numbers as `82...172`. */
  readonly description: string;
  readonly professionGwId: number;
  /** `-1` for none, as upstream. */
  readonly attributeGwId: number;
  readonly typeGwId: number;
  readonly campaignGwId: number;
  readonly elite: boolean;
  /** Upstream's `is_rp`: usable only in PvE. */
  readonly pveOnly: boolean;
  /** Upstream's `is_pvp`: this record is the PvP variant of `splitId`. */
  readonly pvp: boolean;
  /** The record on the other side of a PvP split; `undefined` for none. */
  readonly splitId: number | undefined;
  readonly energy: number;
  /** Energy regeneration it costs while maintained: `-1` for one pip, `0` for none. */
  readonly upkeep: number;
  readonly activation: number;
  readonly aftercast: number;
  readonly recharge: number;
  readonly adrenaline: number;
  readonly sacrifice: number;
  readonly overcast: number;
}

const id = z.number().int().nonnegative();
const amount = z.number().nonnegative();

const dataSchema = z.object({
  id,
  split_id: id,
  campaign: z.number().int(),
  profession: z.number().int(),
  attribute: z.number().int(),
  type: z.number().int(),
  is_elite: z.boolean(),
  is_rp: z.boolean(),
  is_pvp: z.boolean(),
  energy: amount,
  upkeep: z.number().int().nonpositive(),
  activation: amount,
  aftercast: amount,
  recharge: amount,
  adrenaline: amount,
  sacrifice: amount,
  overcast: amount,
});

const descSchema = z.object({ id, name: z.string().min(1), description: z.string() });

// Each file's records by id, unchecked: each is checked on its own, so a
// bad one can be named.
const dataFileSchema = z.object({ skilldata: z.record(z.string(), z.unknown()) });
const descFileSchema = z.object({ skilldesc: z.record(z.string(), z.unknown()) });

/** Throws naming `gwId` when `value` does not fit `schema` or carries another id. */
function parseRecord<T extends { readonly id: number }>(
  schema: z.ZodType<T>,
  value: unknown,
  gwId: string,
  file: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`gw-skilldata ${file}: skill ${gwId} is malformed: ${parsed.error.message}`);
  }
  if (String(parsed.data.id) !== gwId) {
    throw new Error(`gw-skilldata ${file}: skill ${gwId} carries id ${String(parsed.data.id)}`);
  }
  return parsed.data;
}

/**
 * Every record of `skilldata` (`skilldata.json`'s content) joined with
 * `skilldesc` (`skilldesc-en.json`'s), by GW1 id. A record that fails its
 * schema, or has no partner in the other file, throws naming its id. No
 * file access, so the browser parses with it too (#1220).
 */
export function parseGwSkillData(
  skilldata: unknown,
  skilldesc: unknown,
): ReadonlyMap<number, GwSkillRecord> {
  const data = dataFileSchema.parse(skilldata).skilldata;
  const descs = descFileSchema.parse(skilldesc).skilldesc;
  for (const gwId of Object.keys(descs)) {
    if (!(gwId in data)) {
      throw new Error(`gw-skilldata skilldesc-en.json: skill ${gwId} has no skilldata record`);
    }
  }
  const out = new Map<number, GwSkillRecord>();
  for (const [gwId, value] of Object.entries(data)) {
    const record = parseRecord(dataSchema, value, gwId, "skilldata.json");
    if (!(gwId in descs)) {
      throw new Error(`gw-skilldata skilldata.json: skill ${gwId} has no description`);
    }
    const desc = parseRecord(descSchema, descs[gwId], gwId, "skilldesc-en.json");
    out.set(record.id, {
      gwId: record.id,
      name: desc.name,
      description: desc.description,
      professionGwId: record.profession,
      attributeGwId: record.attribute,
      typeGwId: record.type,
      campaignGwId: record.campaign,
      elite: record.is_elite,
      pveOnly: record.is_rp,
      pvp: record.is_pvp,
      splitId: record.split_id === 0 ? undefined : record.split_id,
      energy: record.energy,
      upkeep: record.upkeep,
      activation: record.activation,
      aftercast: record.aftercast,
      recharge: record.recharge,
      adrenaline: record.adrenaline,
      sacrifice: record.sacrifice,
      overcast: record.overcast,
    });
  }
  return out;
}

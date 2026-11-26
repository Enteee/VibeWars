/**
 * The stings (#2523, #366 §3.8), apart from their sources so the protocol
 * can name them without bundling them.
 */
export const STING_IDS = [
  "match-start",
  "first-blood",
  "resurrected",
  "victory",
  "defeat",
] as const;

export type StingId = (typeof STING_IDS)[number];

export function isStingId(value: unknown): value is StingId {
  return STING_IDS.some((id) => id === value);
}

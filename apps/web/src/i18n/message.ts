/**
 * The shape of one message in a string table (#2648): text with `{name}`
 * placeholders, or a plural whose form `Intl.PluralRules` picks by the
 * `count` parameter. `other` is the form every language has.
 */
export interface Plural {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type Message = string | Plural;

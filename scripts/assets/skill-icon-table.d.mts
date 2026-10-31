export interface SkillIconRow {
  readonly glyph: string;
  readonly modifier?: string;
}

export const SKILL_ICONS: Readonly<Record<string, SkillIconRow>>;

export const SKILL_ICON_TABLES: Readonly<Record<string, Readonly<Record<string, SkillIconRow>>>>;

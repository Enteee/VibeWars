export interface SkillIconRow {
  readonly glyph: string;
  readonly modifier?: string;
}

export const SKILL_ICONS: Readonly<Record<string, SkillIconRow>>;

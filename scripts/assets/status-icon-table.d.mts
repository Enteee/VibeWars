import type { Category, Glyph } from "./icon-kit.mjs";

export type StatusIconRow = readonly [Category, Glyph];

export const STATUS_ICON_TABLES: Readonly<Record<string, Readonly<Record<string, StatusIconRow>>>>;

export const STATUS_ICONS: Readonly<Record<string, StatusIconRow>>;

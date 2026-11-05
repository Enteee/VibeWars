import { SKILLS_BY_ID } from "./catalog.js";
import { STATUS_DEFINITIONS, findStatusDefinition } from "./status.js";

/**
 * Where a skill or status puts each status (#2341): `true` while every
 * placing seen is on its caster, `false` once one is not.
 */
function placings(): ReadonlyMap<string, boolean> {
  const onCaster = new Map<string, boolean>();
  const visit = (value: unknown, self: boolean): void => {
    if (Array.isArray(value)) {
      for (const each of value) {
        visit(each, self);
      }
      return;
    }
    if (typeof value !== "object" || value === null) {
      return;
    }
    const kind = "kind" in value ? value.kind : undefined;
    if (
      (kind === "apply-status" || kind === "maintain-status") &&
      "statusId" in value &&
      typeof value.statusId === "string"
    ) {
      const mine = self || ("on" in value && value.on === "caster");
      onCaster.set(value.statusId, (onCaster.get(value.statusId) ?? true) && mine);
    }
    // Only an `if` keeps its effects on the caster; a splash, a rider or
    // a trigger reaches someone else.
    for (const child of Object.values(value)) {
      visit(child, self && kind === "if");
    }
  };
  for (const skill of SKILLS_BY_ID.values()) {
    const { effects, ...rest } = skill;
    visit(effects, skill.target === "self" && skill.area === undefined);
    visit(rest, false);
  }
  // One status placing another: who it lands on is not known here.
  visit(Object.values(STATUS_DEFINITIONS), false);
  return onCaster;
}

let selfOnly: ReadonlyMap<string, boolean> | undefined;

/**
 * Whether only its caster ever bears `statusId` (#2341): every stance and
 * preparation, and a status every skill puts on its caster, so its
 * tooltip says "you". Unknown, or placed by another status: `false`.
 */
export function isSelfOnlyStatus(statusId: string): boolean {
  const category = findStatusDefinition(statusId)?.category;
  if (category === "stance" || category === "preparation") {
    return true;
  }
  selfOnly ??= placings();
  return selfOnly.get(statusId) ?? false;
}

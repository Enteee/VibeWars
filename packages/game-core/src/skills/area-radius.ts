import type { GroundAct, RadiusArea, Skill, SkillEffect } from "./types.js";

/**
 * The largest area `skill` hits its caster's foes in (#4142): its own
 * area, a splash on foes, nested in an `if` too, or a ground effect's
 * pulse, trap or aura. An area only on allies, or none: `undefined`.
 */
export function areaRadius(skill: Skill): number | undefined {
  const own = skill.area !== undefined && "radius" in skill.area ? onFoes(skill.area) : undefined;
  return largest(own, effectsRadius(skill.effects));
}

/** The largest foe area among `effects`. */
function effectsRadius(effects: readonly SkillEffect[]): number | undefined {
  let radius: number | undefined;
  for (const effect of effects) {
    const each =
      effect.kind === "splash"
        ? effect.hits === "foes"
          ? effect.radius
          : undefined
        : effect.kind === "if"
          ? effectsRadius(effect.effects)
          : effect.kind === "create-ground-effect"
            ? groundRadius(effect.act)
            : undefined;
    radius = largest(radius, each);
  }
  return radius;
}

/** How far a ground effect reaches its owner's foes. */
function groundRadius(act: GroundAct): number | undefined {
  switch (act.kind) {
    case "aura":
      return act.aura.affects === "allies" ? undefined : act.aura.radius;
    case "trap":
      return onFoes(act.trap.spring.area);
    case "pulse":
      return largest(
        onFoes(act.pulse.area),
        act.atEnd === undefined ? undefined : onFoes(act.atEnd.area),
      );
  }
}

/** `area`'s radius, unless it takes only allies. */
function onFoes(area: RadiusArea): number | undefined {
  return area.affects === "allies" ? undefined : area.radius;
}

function largest(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}

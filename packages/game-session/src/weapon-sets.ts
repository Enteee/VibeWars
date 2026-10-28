import type { Participant } from "@vibewars/game-core";
import type { WireWeaponSets } from "@vibewars/game-protocol";

/** A participant's weapon sets, as `"weapon-sets"` sends them (#489). */
export function weaponSetsOf(
  participant: Pick<Participant, "weaponSets" | "activeWeaponSet" | "pendingWeaponSet">,
): WireWeaponSets {
  return {
    sets: participant.weaponSets.map((set) =>
      set === null
        ? null
        : {
            weaponId: set.equipment.mainHand.weapon.id,
            offhandId: set.equipment.offhandId ?? null,
          },
    ),
    active: participant.activeWeaponSet,
    pending: participant.pendingWeaponSet ?? null,
  };
}

import { describe, expect, it } from "vitest";

import { MOD_SLOTS, WEAPON_MODS, fittingUpgrades, getWeaponMod, modFits } from "./mods.js";

describe("weapon mods (#2007)", () => {
  it("gives every mod a home: each item it fits has its slot", () => {
    for (const mod of WEAPON_MODS) {
      expect(mod.fits.length, mod.id).toBeGreaterThan(0);
      for (const item of mod.fits) {
        expect(MOD_SLOTS[item], `${mod.id} on ${item}`).toContain(mod.slot);
      }
    }
  });

  it("names each mod once, with text and at least one effect", () => {
    const ids = WEAPON_MODS.map((mod) => mod.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mod of WEAPON_MODS) {
      expect(mod.text, mod.id).not.toBe("");
      expect(mod.effects.length, mod.id).toBeGreaterThan(0);
    }
  });

  it("gives a wand, shield or focus no prefix", () => {
    expect(MOD_SLOTS.wand).not.toContain("prefix");
    expect(MOD_SLOTS.shield).not.toContain("prefix");
    expect(MOD_SLOTS.focus).not.toContain("prefix");
    expect(MOD_SLOTS.staff).toEqual(["prefix", "suffix", "inscription"]);
  });

  it("fits a mod only in its own slot, on an item made for it", () => {
    const fortitude = getWeaponMod("of-fortitude");
    const hale = getWeaponMod("hale");
    if (fortitude === undefined || hale === undefined) {
      throw new Error("of-fortitude and hale are in the catalog");
    }
    expect(modFits(fortitude, "sword", "suffix")).toBe(true);
    expect(modFits(fortitude, "sword", "prefix")).toBe(false);
    expect(modFits(fortitude, "wand", "suffix")).toBe(false);
    expect(modFits(fortitude, "unarmed", "suffix")).toBe(false);
    expect(modFits(hale, "staff", "prefix")).toBe(true);
    expect(modFits(hale, "sword", "prefix")).toBe(false);
  });

  it("keeps what still fits when the item changes", () => {
    const staff = { prefix: "hale", suffix: "of-fortitude", inscription: "seize-the-day" };
    expect(fittingUpgrades("sword", staff)).toEqual({
      prefix: null,
      suffix: "of-fortitude",
      inscription: null,
    });
    expect(fittingUpgrades("wand", staff)).toEqual({
      prefix: null,
      suffix: null,
      inscription: "seize-the-day",
    });
  });

  it("fits the martial prefixes on the weapons GW1 makes them for (#2009)", () => {
    const fits = (id: string): readonly string[] => getWeaponMod(id)?.fits ?? [];
    const bows = ["flatbow", "shortbow", "longbow", "recurve-bow", "hornbow"];
    const martial = ["sword", "axe", "hammer", "daggers", "scythe", "spear", ...bows];
    const but = (...out: string[]) => martial.filter((item) => !out.includes(item));
    for (const id of ["vampiric", "zealous", "sundering", "ebon", "fiery", "icy", "shocking"]) {
      expect(fits(id), id).toEqual(martial);
    }
    for (const id of ["furious", "cruel"]) {
      expect(fits(id), id).toEqual(but(...bows));
    }
    for (const id of ["barbed", "crippling", "poisonous"]) {
      expect(fits(id), id).toEqual(but("hammer"));
    }
    expect(fits("heavy")).toEqual(["axe", "hammer", "scythe", "spear"]);
    expect(fits("silencing")).toEqual(["daggers", "spear", ...bows]);
    for (const id of ["vampiric", "furious", "barbed", "heavy", "silencing", "icy"]) {
      expect(getWeaponMod(id)?.slot, id).toBe("prefix");
    }
  });
});

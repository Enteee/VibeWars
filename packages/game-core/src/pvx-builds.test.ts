import { describe, expect, it } from "vitest";

import { validatePlayerBuild } from "./build.js";
import { decodeTemplateCode, encodeTemplateCode } from "./template-code.js";
import { PVX_SKIPPED, PVX_SOLO } from "./pvx-builds.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import {
  STARTER_BUILDS,
  decodePvxBuild,
  decodePvxBuilds,
  pickStarterBuild,
  pvxKey,
} from "./starter-builds.js";

describe("the PvX solo builds (#2554)", () => {
  it("are each in STARTER_BUILDS or PVX_SKIPPED, and PVX_SKIPPED is exactly what is skipped", () => {
    // A ratchet: a skill landing that makes a skipped build decode fails
    // this until it is struck from PVX_SKIPPED, so the list only shrinks.
    expect(decodePvxBuilds(PVX_SOLO).skipped).toEqual(PVX_SKIPPED);
    for (const pvx of PVX_SOLO) {
      const decoded = decodePvxBuild(pvx);
      if (pvxKey(pvx) in PVX_SKIPPED) {
        continue;
      }
      expect(decoded.ok, pvxKey(pvx)).toBe(true);
      if (decoded.ok) {
        expect(STARTER_BUILDS).toContainEqual(decoded.build);
        expect(validatePlayerBuild(decoded.build, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual(
          [],
        );
      }
    }
  });

  it("names each build once in the list, by its code and by its key", () => {
    expect(new Set(PVX_SOLO.map((pvx) => pvx.code)).size).toBe(PVX_SOLO.length);
    expect(new Set(PVX_SOLO.map(pvxKey)).size).toBe(PVX_SOLO.length);
  });

  it("holds no bar twice", () => {
    const bars = STARTER_BUILDS.map((build) => [...build.skillBar].sort().join());
    expect(new Set(bars).size).toBe(bars.length);
  });

  it("keeps the first of two codes for one bar, and skips the second", () => {
    const [first] = PVX_SOLO;
    if (first === undefined) throw new Error("no PvX builds");
    const again = { ...first, mode: "RA" };
    const { builds, skipped } = decodePvxBuilds([first, again]);
    expect(builds).toHaveLength(1);
    expect(skipped).toEqual({ [pvxKey(again)]: `The same bar as ${String(builds[0]?.name)}.` });
  });

  it("skips a code that does not decode, and says why", () => {
    const [first] = PVX_SOLO;
    if (first === undefined) throw new Error("no PvX builds");
    const broken = { ...first, code: first.code.slice(0, 6) };
    expect(decodePvxBuilds([broken]).skipped).toEqual({
      [pvxKey(broken)]: "This GW1 code is cut short.",
    });
  });

  it.each(PVX_SOLO.filter((pvx) => !(pvxKey(pvx) in PVX_SKIPPED)).map((pvx) => [pvxKey(pvx), pvx]))(
    "%s round-trips through the encoder",
    (_, pvx) => {
      const decoded = decodeTemplateCode(pvx.code);
      if (!decoded.ok) throw new Error(decoded.problems.join(" "));
      const encoded = encodeTemplateCode(decoded.build);
      if (!encoded.ok) throw new Error(encoded.problem);
      const again = decodeTemplateCode(encoded.code);
      expect(again.ok && again.build).toEqual(decoded.build);
    },
  );

  it("is what pickStarterBuild draws from", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999999]) {
      expect(STARTER_BUILDS).toContain(pickStarterBuild(() => r));
    }
  });
});

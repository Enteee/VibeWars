import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { fromPlayerBuild } from "./build-validation.js";
import { cloneCharacter } from "./clone-character.js";

describe("cloneCharacter", () => {
  it("copies the build under a new id, named '<name> (copy)', updated now", () => {
    const [build] = STARTER_BUILDS;
    if (build === undefined) {
      throw new Error("no starter builds");
    }
    const source = fromPlayerBuild(build, "source", 1_000);

    const copy = cloneCharacter(source, "copy", 2_000);

    expect(copy.id).toBe("copy");
    expect(copy.name).toBe(`${source.name} (copy)`);
    expect(copy.updatedAt).toBe(2_000);
    expect({ ...copy, id: source.id, name: source.name, updatedAt: source.updatedAt }).toEqual(
      source,
    );
    expect(source.id).toBe("source");
  });
});

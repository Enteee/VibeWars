import { describe, expect, it } from "vitest";

import { SectionSwitcher, type Mountable } from "./options-screen.js";

/** A container is just a log of what happened to it. */
type Log = string[];

function section(id: string): Mountable<Log> {
  return {
    id,
    mount: (log) => {
      log.push(`mount ${id}`);
      return () => {
        log.push(`cleanup ${id}`);
      };
    },
  };
}

function switcher(): { readonly log: Log; readonly sections: SectionSwitcher<Log> } {
  const log: Log = [];
  return {
    log,
    sections: new SectionSwitcher(log, (container) => {
      container.push("clear");
    }),
  };
}

describe("SectionSwitcher (#423)", () => {
  it("mounts the section it is shown", () => {
    const { log, sections } = switcher();
    sections.show(section("controls"));
    expect(log).toEqual(["mount controls"]);
    expect(sections.current).toBe("controls");
  });

  it("cleans the old section up before it mounts the next", () => {
    const { log, sections } = switcher();
    sections.show(section("sound"));
    sections.show(section("controls"));
    expect(log).toEqual(["mount sound", "cleanup sound", "clear", "mount controls"]);
    expect(sections.current).toBe("controls");
  });

  it("leaves the section alone when it is shown again", () => {
    const { log, sections } = switcher();
    sections.show(section("controls"));
    sections.show(section("controls"));
    expect(log).toEqual(["mount controls"]);
  });

  it("cleans up on close, so leaving the screen leaves no listener behind", () => {
    const { log, sections } = switcher();
    sections.show(section("controls"));
    sections.close();
    expect(log).toEqual(["mount controls", "cleanup controls", "clear"]);
    expect(sections.current).toBeUndefined();
  });
});

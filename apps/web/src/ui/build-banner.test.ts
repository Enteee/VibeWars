import { describe, expect, it } from "vitest";

import { bannerSpaceWriter } from "./build-banner.js";

describe("bannerSpaceWriter (#1283)", () => {
  it("writes the banner's bottom edge while shown, and 0px once hidden", () => {
    const written: string[] = [];
    const write = bannerSpaceWriter((value) => written.push(value));
    write(52.3);
    write(undefined);
    expect(written).toEqual(["53px", "0px"]);
  });

  it("writes nothing while the height holds, as the countdown ticks", () => {
    const written: string[] = [];
    const write = bannerSpaceWriter((value) => written.push(value));
    write(52);
    write(52);
    write(51.6);
    write(88);
    expect(written).toEqual(["52px", "88px"]);
  });
});

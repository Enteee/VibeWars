import { describe, expect, it } from "vitest";

import { REST_FRAME } from "./attack-clock.js";
import { paintStandingBody, type Painter, type StandingBody } from "./body-painter.js";

/** Every call painting `body` makes, numbers to 0.01 so the pin reads. */
function calls(body: StandingBody): unknown[][] {
  const out: unknown[][] = [];
  const round = (value: unknown): unknown =>
    typeof value === "number"
      ? Math.round(value * 100) / 100
      : Array.isArray(value)
        ? value.map(round)
        : typeof value === "object" && value !== null
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]))
          : value;
  const painter = new Proxy({} as Painter, {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        out.push([String(name), ...args.map(round)]);
      },
  });
  paintStandingBody(painter, body);
  return out;
}

const AT = { x: 22, y: 22, r: 14, facing: 0, frame: REST_FRAME } as const;

describe("paintStandingBody (#1250)", () => {
  it("draws a sword-and-shield self body: disc, edge, rim, shield, sword", () => {
    expect(
      calls({ ...AT, team: "self", weaponId: "sword", offhandId: "shield" }),
    ).toMatchSnapshot();
  });

  it("draws a bow foe: no rim, no off-hand, the bow and its string", () => {
    expect(
      calls({ ...AT, team: "enemy", weaponId: "longbow", offhandId: undefined }),
    ).toMatchSnapshot();
  });

  it("draws a body holding nothing with no marks at all", () => {
    expect(
      calls({ ...AT, team: "ally", weaponId: undefined, offhandId: undefined }).map(
        ([name]) => name,
      ),
    ).toEqual(["fillStyle", "fillCircle", "lineStyle", "strokeCircle"]);
  });
});

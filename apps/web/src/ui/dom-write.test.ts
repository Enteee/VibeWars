import { describe, expect, it } from "vitest";

import { percent, setDisabled, setHidden, setStyle, setText } from "./dom-write.js";

/**
 * The render loop's writes (#1352): each lands only when its value
 * changes. Node has no DOM, so the element here is a plain object that
 * logs every write.
 */

function element(): {
  writes: string[];
  node: { textContent: string | null; hidden: boolean; disabled: boolean };
} {
  const writes: string[] = [];
  const node = new Proxy(
    { textContent: "", hidden: false, disabled: false },
    {
      set(target, property, value: unknown) {
        writes.push(String(property));
        return Reflect.set(target, property, value);
      },
    },
  );
  return { writes, node };
}

describe("the render loop's DOM writes (#1352)", () => {
  it("writes text, hidden and disabled only when they change", () => {
    const { writes, node } = element();
    setText(node, "20 / 25");
    setHidden(node, true);
    setDisabled(node, true);
    expect(writes).toEqual(["textContent", "hidden", "disabled"]);
    writes.length = 0;
    setText(node, "20 / 25");
    setHidden(node, true);
    setDisabled(node, true);
    expect(writes).toEqual([]);
    setText(node, "21 / 25");
    expect(writes).toEqual(["textContent"]);
    expect(node).toMatchObject({ textContent: "21 / 25", hidden: true, disabled: true });
  });

  it("sets a style property only when it reads back different", () => {
    const set: string[] = [];
    const properties = new Map<string, string>();
    const style = {
      getPropertyValue: (name: string): string => properties.get(name) ?? "",
      setProperty: (name: string, value: string): void => {
        set.push(`${name}: ${value}`);
        properties.set(name, value);
      },
    };
    setStyle(style, "width", "25%");
    setStyle(style, "width", "25%");
    setStyle(style, "width", "30%");
    expect(set).toEqual(["width: 25%", "width: 30%"]);
  });

  it("gives a share as a percentage to a hundredth, which reads back the same", () => {
    expect(percent(0.25)).toBe("25%");
    expect(percent(1 / 3)).toBe("33.33%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
  });
});

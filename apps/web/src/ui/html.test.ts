import { describe, expect, it } from "vitest";

import { escapeAttribute } from "./html.js";

describe("escapeAttribute", () => {
  it("escapes each character that can leave an attribute", () => {
    expect(escapeAttribute("&")).toBe("&amp;");
    expect(escapeAttribute('"')).toBe("&quot;");
    expect(escapeAttribute("'")).toBe("&#39;");
    expect(escapeAttribute("<")).toBe("&lt;");
    expect(escapeAttribute(">")).toBe("&gt;");
  });

  it("escapes a mix of them, and leaves the rest alone", () => {
    expect(escapeAttribute(`a"b<c>&'d`)).toBe("a&quot;b&lt;c&gt;&amp;&#39;d");
    expect(escapeAttribute("")).toBe("");
    expect(escapeAttribute("Verzauberung · 呪文")).toBe("Verzauberung · 呪文");
  });

  it("escapes the ampersand first, so no entity is escaped twice", () => {
    expect(escapeAttribute('&"')).toBe("&amp;&quot;");
    expect(escapeAttribute("&quot;")).toBe("&amp;quot;");
  });
});

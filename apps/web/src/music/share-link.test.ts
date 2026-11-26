import { describe, expect, it } from "vitest";

import { STRUDEL_URL, pastedSource, prelude, shareLink, stripPrelude } from "./share-link.js";

const SOURCE = 'setcpm(30)\n// Ünïcode, ☃ and 𝄞\nlayer(1, s("bd*2"))\n';

describe("the strudel.cc link (#373)", () => {
  it("round-trips a source through a link, non-ASCII included", () => {
    const link = shareLink(SOURCE, 2);
    expect(link.startsWith(`${STRUDEL_URL}#`)).toBe(true);
    expect(pastedSource(link)).toBe(SOURCE);
  });

  it("is base64 of the UTF-8 source with the prelude, percent-encoded", () => {
    const link = shareLink("s('bd')", 3);
    const hash = link.slice(STRUDEL_URL.length + 1);
    expect(hash).not.toMatch(/[+/=]/);
    const shared = new TextDecoder().decode(
      Uint8Array.from(atob(decodeURIComponent(hash)), (char) => char.charCodeAt(0)),
    );
    expect(shared).toBe(`${prelude(3)}s('bd')`);
  });

  it("defines INTENSITY at the editor's level, and layer from it", () => {
    expect(prelude(1)).toMatch(/^let INTENSITY = 1 /);
    expect(prelude(1).split("\n")).toHaveLength(3);
    expect(prelude(0)).toContain("let layer = (n, pat) => (INTENSITY >= n ? pat : silence)");
  });

  it("strips only its own prelude", () => {
    expect(stripPrelude(prelude(0) + SOURCE)).toBe(SOURCE);
    expect(stripPrelude(SOURCE)).toBe(SOURCE);
    const moved = `${SOURCE}${prelude(0)}`;
    expect(stripPrelude(moved)).toBe(moved);
  });

  it("takes pasted code as it is, and refuses a strudel.cc link that does not decode", () => {
    expect(pastedSource(SOURCE)).toBe(SOURCE);
    expect(pastedSource("https://example.com/#abc")).toBe("https://example.com/#abc");
    expect(pastedSource(`${STRUDEL_URL}#%%%`)).toBeNull();
    expect(pastedSource(`${STRUDEL_URL}#${encodeURIComponent(btoa("\xff\xfe"))}`)).toBeNull();
  });
});

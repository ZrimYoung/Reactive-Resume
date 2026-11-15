import { describe, expect, it } from "vitest";

import { fontCssString, selectedFontStyle, uploadedFontCss } from "./local-fonts";

describe("local font rendering", () => {
  it("rebases uploaded fonts onto the current app origin after restart and retains variable weights", () => {
    const css = uploadedFontCss(
      [
        {
          fontFamily: "中文 Font",
          url: "http://localhost:3001/api/storage/local-user-id/fonts/example.ttf",
          format: "truetype",
          variableFont: { isVariable: true, axes: [{ tag: "wght", min: 100, max: 900 }] },
        },
      ],
      "http://localhost:3009",
    );
    expect(css).toContain('url("/api/storage/local-user-id/fonts/example.ttf")');
    expect(css).toContain("font-weight: 100 900");
    expect(css).not.toContain("3001");
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("never emits an external font URL from uploaded-font metadata", () => {
    expect(
      uploadedFontCss(
        [{ family: "External", url: "https://example.com/font.ttf", format: "truetype" }],
        "http://localhost:3000",
      ),
    ).toBe("");
    expect(fontCssString('My "Font"\nname')).toBe(String.raw`"My \"Font\" name"`);
  });

  it("applies the selected weight and italic style without changing the selected family", () => {
    expect(selectedFontStyle(["700italic"])).toEqual({ weight: 700, style: "italic" });
    expect(selectedFontStyle(["regular"])).toEqual({ weight: 400, style: "normal" });
    expect(selectedFontStyle([])).toEqual({ weight: 400, style: "normal" });
  });
});

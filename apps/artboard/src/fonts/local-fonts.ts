type UploadedFont = {
  fontFamily?: string;
  family?: string;
  url: string;
  format: string;
  variableFont?: { isVariable: boolean; axes: { tag: string; min: number; max: number }[] };
};

export const fontCssString = (value: string) =>
  `"${value
    .replace(/\\/g, String.raw`\\`)
    .replace(/"/g, String.raw`\"`)
    .replace(/[\n\f\r]/g, " ")}"`;

export function selectedFontStyle(variants: string[]) {
  const variant = variants[0] ?? "regular";
  const parsed = Number.parseInt(variant, 10);
  return {
    weight: Number.isFinite(parsed) && parsed >= 100 && parsed <= 900 ? parsed : 400,
    style: variant.includes("italic") ? "italic" : "normal",
  };
}

/** Font uploads are local resources, including after the app restarts on a different port. */
export function uploadedFontCss(fonts: UploadedFont[], origin: string): string {
  return fonts
    .flatMap((font) => {
      const family = font.fontFamily ?? font.family;
      if (!family || !["truetype", "opentype", "woff", "woff2"].includes(font.format)) return [];
      try {
        const source = new URL(font.url, origin);
        if (!source.pathname.startsWith("/api/storage/")) return [];
        const axis = font.variableFont?.isVariable
          ? font.variableFont.axes.find((entry) => entry.tag === "wght")
          : undefined;
        const weight =
          axis &&
          Number.isFinite(axis.min) &&
          Number.isFinite(axis.max) &&
          axis.min >= 1 &&
          axis.max <= 1000
            ? `${axis.min} ${axis.max}`
            : "400";
        return [
          `@font-face { font-family: ${fontCssString(family)}; src: url(${fontCssString(source.pathname)}) format("${font.format}"); font-display: swap; font-weight: ${weight}; font-style: normal; }`,
        ];
      } catch {
        return [];
      }
    })
    .join("\n");
}

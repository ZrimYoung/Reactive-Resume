/* eslint-disable lingui/no-unlocalized-strings -- Synthetic PDF fixtures. */
import { i18n } from "@lingui/core";
import { resumeDataSchema } from "@reactive-resume/schema";
import { beforeAll, describe, expect, it } from "vitest";

import type { ExtractedPdf, PdfLine } from ".";
import { convertPdfImport, pdfImportLines } from "./import";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});
const line = (text: string, x: number, y: number, width = 80): PdfLine => ({
  text,
  x,
  y,
  width,
  height: 12,
});
const pdf = (lines: PdfLine[]): ExtractedPdf => ({
  pages: [{ pageNumber: 1, width: 600, height: 800, lines }],
  pageCount: 1,
  text: "",
  warnings: [],
});

describe("offline PDF import", () => {
  it("keeps Chinese fragments together and retains all uncertain content as editable text", () => {
    const result = convertPdfImport(
      pdf([
        line("张", 20, 20, 12),
        line("三", 32, 20, 12),
        line("zhang@example.com", 20, 45),
        line("工作经历", 20, 70),
        line("示例公司 2020—2024", 20, 95, 200),
        line("开发离线工具", 20, 120),
      ]),
    );
    expect(result.data.basics.name).toBe("张三");
    expect(result.data.basics.email).toBe("zhang@example.com");
    const sections = Object.values(result.data.sections.custom);
    expect(sections.find((section) => section.name === "工作经历")?.items[0].summary).toContain(
      "开发离线工具",
    );
    expect(result.data.metadata.layout[0][0]).toHaveLength(sections.length);
    expect(resumeDataSchema.safeParse(result.data).success).toBe(true);
  });
  it("reads columns independently instead of joining their sentences across the gutter", () => {
    const source = pdf([
      line("Alex Example", 20, 20, 400),
      line("Experience", 20, 60),
      line("Skills", 350, 60),
      line("Left employer", 20, 90),
      line("Right skill", 350, 90),
      line("Left achievement", 20, 120),
      line("Right language", 350, 120),
    ]);
    expect(pdfImportLines(source)).toEqual([
      "Alex Example",
      "Experience",
      "Left employer",
      "Left achievement",
      "Skills",
      "Right skill",
      "Right language",
    ]);
  });
  it("escapes PDF markup and does not invent structured employers or dates", () => {
    const result = convertPdfImport(
      pdf([line("<img src=x onerror=alert(1)>", 20, 20, 400), line("Acme 2024", 20, 40)]),
    );
    const content = Object.values(result.data.sections.custom)[0].items[0].summary;
    expect(content).toContain("&lt;img");
    expect(content).not.toContain("<img");
    expect(result.data.sections.experience.items).toEqual([]);
    expect(result.text).toContain("Acme 2024");
  });
  it("rejects scanned or empty PDFs without creating an empty resume", () => {
    expect(() => convertPdfImport(pdf([]))).toThrow(/OCR/u);
  });
});

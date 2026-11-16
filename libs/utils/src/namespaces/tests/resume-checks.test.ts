import type { ResumeData } from "@reactive-resume/schema";
import {
  defaultCustomSection,
  defaultEducation,
  defaultExperience,
  defaultResumeData,
  defaultSection,
  defaultSkill,
} from "@reactive-resume/schema";
import { describe, expect, it } from "vitest";

import {
  checkExtractedPdf,
  checkResume,
  inspectResumeDate,
  parseResumePageMetrics,
} from "../resume-checks";

const resume = (): ResumeData => {
  const data = structuredClone(defaultResumeData);
  data.basics.name = "张小明";
  data.basics.email = "xiaoming@example.com";
  data.basics.phone = "+852 1234 5678";
  return data;
};

const page = (text: string, pageNumber = 1) => ({
  pageNumber,
  width: 595,
  height: 842,
  lines: [{ text, x: 20, y: 20, width: 200, height: 12 }],
});

describe("neutral local resume checks", () => {
  it("accepts Chinese headings and ordinary Chinese dates without English-language assumptions or changing data", () => {
    const data = resume();
    data.sections.education.name = "教育经历";
    data.sections.education.items = [
      {
        ...defaultEducation,
        id: "education",
        institution: "中文大学",
        date: "2018年9月—2022年6月",
      },
    ];
    const before = JSON.stringify(data);
    expect(checkResume(data)).toEqual([]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("uses v4 href fields for links and distinguishes missing content from intentional hidden content", () => {
    const data = resume();
    data.basics.url.href = "javascript:alert(1)";
    data.sections.experience.visible = false;
    data.sections.experience.items = [
      { ...defaultExperience, id: "hidden", company: "Hidden employer", date: "" },
    ];
    data.sections.skills.items = [{ ...defaultSkill, id: "hidden-skill", visible: false }];
    const checks = checkResume(data);
    expect(checks.some((finding) => finding.code === "invalid-url")).toBe(true);
    expect(checks.find((finding) => finding.code === "hidden-section")?.severity).toBe("info");
    expect(checks.find((finding) => finding.code === "hidden-items")?.severity).toBe("info");
    expect(checks.some((finding) => finding.code === "missing-date")).toBe(false);
  });

  it("finds visible standard and custom content missing from the layout and reports reversed dates", () => {
    const data = resume();
    data.metadata.layout = [[[], []]];
    data.sections.education.items = [
      { ...defaultEducation, id: "education", institution: "School", date: "2025-09 – 2024-02" },
    ];
    data.sections.custom.research = {
      ...defaultSection,
      id: "research",
      name: "研究",
      items: [{ ...defaultCustomSection, id: "custom-item", name: "课题", date: "2024" }],
    };
    const checks = checkResume(data);
    expect(
      checks
        .filter((finding) => finding.code === "unplaced-section")
        .map((finding) => finding.sectionId),
    ).toEqual(["education", "custom.research"]);
    expect(checks.some((finding) => finding.code === "reversed-date")).toBe(true);
  });

  it("converts point guidance to CSS pixels instead of interpreting 9 px as 9 pt", () => {
    const data = resume();
    data.metadata.typography.font.size = 11.9;
    data.metadata.typography.lineHeight = 1.14;
    data.metadata.page.margin = 10.6;
    expect(checkResume(data).map((finding) => finding.code)).toEqual([
      "small-text",
      "tight-lines",
      "tight-margins",
    ]);
    data.metadata.typography.font.size = 12;
    data.metadata.typography.lineHeight = 1.15;
    data.metadata.page.margin = (8 * 96) / 72;
    expect(checkResume(data)).toEqual([]);
  });

  it.each([
    ["", "empty"],
    ["2024-02-29", "readable"],
    ["2023-02-29", "custom"],
    ["January 2024 – Present", "readable"],
    ["2020年—至今", "readable"],
    ["2025 – 2024", "reversed"],
    ["2025-02 – 2025", "readable"],
    ["预计2027年毕业", "custom"],
    ["Summer 2020", "custom"],
    ["Januwrong 2024", "custom"],
  ])("preserves date wording %s and classifies it as %s", (value, result) => {
    expect(inspectResumeDate(value)).toBe(result);
  });
});

describe("actual PDF text checks", () => {
  it("keeps Chinese text and content-stream order intact, without English dictionary heuristics", () => {
    const extraction = {
      pages: [page("张小明 教育经历 工作经历")],
      text: "张小明 教育经历 工作经历",
      pageCount: 1,
      warnings: [],
    };
    const before = JSON.stringify(extraction);
    expect(checkExtractedPdf(extraction)).toEqual([]);
    expect(JSON.stringify(extraction)).toBe(before);
  });
  it("distinguishes missing text, replacement characters, private-use icons and a blank page", () => {
    expect(checkExtractedPdf({ pages: [page("")], text: "", pageCount: 1, warnings: [] })).toEqual([
      { code: "no-text" },
    ]);
    const checks = checkExtractedPdf({
      pages: [page("中文�\uE000"), page("", 2)],
      text: "中文�\uE000",
      pageCount: 2,
      warnings: [],
    });
    expect(checks.map((finding) => finding.code)).toEqual([
      "replacement-characters",
      "private-use-characters",
      "empty-page",
    ]);
    expect(checks[2].pageNumber).toBe(2);
  });
  it("rejects malformed or impossible cross-frame measurements", () => {
    expect(
      parseResumePageMetrics({ plannedPages: 1, estimatedPages: 1, pages: [null] }),
    ).toBeUndefined();
    expect(
      parseResumePageMetrics({ plannedPages: 0, estimatedPages: 1, pages: [] }),
    ).toBeUndefined();
    expect(
      parseResumePageMetrics({
        plannedPages: 1,
        estimatedPages: 1,
        pages: [{ pageNumber: 1, widthPx: 700, heightPx: 1000, contentHeightPx: Number.NaN }],
      }),
    ).toBeUndefined();
  });
});

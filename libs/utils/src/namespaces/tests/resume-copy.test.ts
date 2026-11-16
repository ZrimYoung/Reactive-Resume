import { describe, expect, it } from "vitest";

import { nextResumeCopy } from "../resume-copy";

describe("numbered resume copies", () => {
  const source = { title: "我的简历", slug: "我的简历" };
  it("keeps Unicode and avoids occupied names and identifiers independently", () => {
    expect(
      nextResumeCopy(source, [
        source,
        { title: "我的简历 (2)", slug: "old-copy" },
        { title: "Other", slug: "我的简历-copy-3" },
      ]),
    ).toEqual({ title: "我的简历 (4)", slug: "我的简历-copy-4" });
  });
  it("numbers a copy of a copy from its original when it still exists", () => {
    const second = nextResumeCopy(source, [source]);
    expect(nextResumeCopy(second, [source, second])).toEqual({
      title: "我的简历 (3)",
      slug: "我的简历-copy-3",
    });
  });
  it("keeps meaningful numeric titles when there is no matching original", () => {
    const year = { title: "Report (2024)", slug: "report-2024" };
    expect(nextResumeCopy(year, [year])).toEqual({
      title: "Report (2024) (2)",
      slug: "report-2024-copy-2",
    });
  });
  it("recognizes legacy Copy suffixes", () => {
    expect(nextResumeCopy({ title: "我的简历 (Copy)", slug: "我的简历-copy" }, [source])).toEqual({
      title: "我的简历 (2)",
      slug: "我的简历-copy-2",
    });
  });
});

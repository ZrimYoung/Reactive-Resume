import { describe, expect, it } from "vitest";

import { sortResumeItemsByDate } from "../resume-date";

const sort = (dates: string[]) => {
  const items = dates.map((date, id) => ({ id, date }));
  return { original: items, ...sortResumeItemsByDate(items, (item) => item.date) };
};

describe("resume item date sorting", () => {
  it("sorts ongoing ranges before completed ranges, newest end then newest start", () => {
    const result = sort(["2019 - 2024", "2020 - Present", "2022至今", "2023 - 2024", "2025"]);
    expect(result.items.map(({ id }) => id)).toEqual([2, 1, 4, 3, 0]);
    expect(result.changed).toBe(true);
    expect(result.unparsedCount).toBe(0);
    expect(result.original.map(({ id }) => id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("recognizes ISO, slash, dot, Chinese and English month formats without changing any text", () => {
    const dates = [
      "2022",
      "March 2023",
      "2024年2月",
      "2024/03",
      "2024.04.02",
      "2024-05-01",
      "2023-01–2024-06",
    ];
    const result = sort(dates);
    expect(result.items.map(({ id }) => id)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(result.items.every(({ date, id }) => date === dates[id])).toBe(true);
  });

  it("keeps blanks, unknown text, ambiguous formats, invalid dates and backwards ranges stable at the end", () => {
    const dates = [
      "Spring semester",
      "2024-02-30",
      "",
      "03/04/2024",
      "2025 - 2020",
      "2023",
      "2024-13",
    ];
    const result = sort(dates);
    expect(result.items.map(({ id }) => id)).toEqual([5, 0, 1, 2, 3, 4, 6]);
    expect(result.unparsedCount).toBe(6);
  });

  it("retains tied and entirely unrecognized entry order, including leap dates and no-op sorts", () => {
    const dates = ["2024-02-29", "2024-02-29", "2023-02-29", "TBC"];
    const result = sort(dates);
    expect(result.items).toEqual(result.original);
    expect(result.changed).toBe(false);
    expect(result.unparsedCount).toBe(2);
    expect(sort([])).toMatchObject({ items: [], changed: false, unparsedCount: 0 });
  });
});

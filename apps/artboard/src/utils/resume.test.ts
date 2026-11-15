import { defaultResumeData } from "@reactive-resume/schema";
import { describe, expect, it } from "vitest";

import { getPageDimensions, normalizeArtboardResume } from "./resume";

describe("older resume compatibility", () => {
  it("completes nested page settings and missing sections before the canvas renders", () => {
    const resume = normalizeArtboardResume({
      basics: { name: "Older document" },
      metadata: { page: { format: "a4" }, typography: { font: { family: "Arial" } } },
    });
    expect(resume.basics.name).toBe("Older document");
    expect(resume.metadata.page.custom.enabled).toBe(false);
    expect(resume.metadata.page.options.pageNumbers).toBe(true);
    expect(resume.sections.experience.items).toEqual([]);
    expect(getPageDimensions(resume.metadata.page)).toEqual({ width: 210, height: 297 });
    resume.metadata.page.custom.width = 400;
    expect(defaultResumeData.metadata.page.custom.width).toBe(210);
  });

  it("recovers from an empty or malformed layout without removing an intentionally empty column", () => {
    expect(normalizeArtboardResume({ metadata: { layout: [] } }).metadata.layout.length).toBe(1);
    expect(normalizeArtboardResume({ metadata: { layout: [null] } }).metadata.layout.length).toBe(
      1,
    );
    expect(
      normalizeArtboardResume({ metadata: { layout: [[[], ["summary"]]] } }).metadata.layout,
    ).toEqual([[[], ["summary"]]]);
  });

  it("reconnects old local picture and CSS URLs to this launch's port, preserving external links", () => {
    const input = structuredClone(defaultResumeData);
    input.basics.picture.url =
      "http://localhost:3001/api/storage/local-user-id/pictures/avatar.jpg";
    input.metadata.css.value =
      '.avatar { background-image: url("http://127.0.0.1:3002/api/storage/local-user-id/pictures/photo.jpg"); }';
    input.basics.url.href = "https://example.com/profile";
    const resume = normalizeArtboardResume(input);
    expect(resume.basics.picture.url).toBe(
      `${window.location.origin}/api/storage/local-user-id/pictures/avatar.jpg`,
    );
    expect(resume.metadata.css.value).toContain(
      `${window.location.origin}/api/storage/local-user-id/pictures/photo.jpg`,
    );
    expect(resume.basics.url.href).toBe(input.basics.url.href);
    expect(input.basics.picture.url).toContain("localhost:3001");
  });
});

describe("canvas page geometry", () => {
  it("uses the same dimensions for preset landscape and custom paper", () => {
    const page = structuredClone(defaultResumeData.metadata.page);
    page.orientation = "landscape";
    expect(getPageDimensions(page)).toEqual({ width: 297, height: 210 });
    page.custom = { enabled: true, width: 150, height: 400 };
    expect(getPageDimensions(page)).toEqual({ width: 400, height: 150 });
    page.custom.width = 0;
    page.custom.height = Number.NaN;
    expect(getPageDimensions(page)).toEqual({ width: 297, height: 210 });
  });
});

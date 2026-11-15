import { defaultResumeData } from "@reactive-resume/schema";
import { describe, expect, it } from "vitest";

import { getPrintDimensions, preparePrintData, refreshLocalAssetUrls } from "./print-data";

describe("desktop print data", () => {
  it("relocates saved local images and CSS to this launch's port, without touching remote URLs", () => {
    const data = {
      image: "http://localhost:3000/api/storage/local-user-id/pictures/photo.jpg",
      css: "background:url('http://127.0.0.1:3001/api/storage/local-user-id/pictures/a.jpg')",
      remote: "https://example.com/api/storage/photo.jpg",
    };
    const relocated = refreshLocalAssetUrls(data, "http://127.0.0.1:3308");
    expect(relocated.image).toBe(
      "http://127.0.0.1:3308/api/storage/local-user-id/pictures/photo.jpg",
    );
    expect(relocated.css).toContain("http://127.0.0.1:3308/api/storage/");
    expect(relocated.remote).toBe(data.remote);
    expect(data.image).toContain(":3000/");
  });

  it("uses both custom dimensions when printing in landscape", () => {
    const dimensions = getPrintDimensions({
      ...defaultResumeData.metadata.page,
      orientation: "landscape",
      custom: { enabled: true, width: 120, height: 180 },
    });
    expect(dimensions).toEqual({ width: 180, height: 120 });
  });

  it("normalizes older page metadata and empty layouts without mutating the resume", () => {
    const input = JSON.parse(JSON.stringify(defaultResumeData)) as typeof defaultResumeData;
    input.metadata.layout = [];
    const data = preparePrintData(input, "http://localhost:3301");
    expect(data.metadata.layout).toEqual(defaultResumeData.metadata.layout);
    expect(input.metadata.layout).toEqual([]);
    expect(data.metadata.page.custom.enabled).toBe(false);
  });
});

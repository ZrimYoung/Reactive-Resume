/* eslint-disable lingui/no-unlocalized-strings -- Test fixtures are not product text. */
/* eslint-disable @typescript-eslint/require-await -- Async dependency stubs exercise workflow ordering. */
import { createHash } from "node:crypto";

import type { ResumeData } from "@reactive-resume/schema";
import { defaultResumeData } from "@reactive-resume/schema";
import { describe, expect, it, vi } from "vitest";

import { PdfReviewError, reviewSavedPdf } from "./pdf-review";

const extraction = {
  pages: [
    {
      pageNumber: 1,
      width: 595,
      height: 842,
      lines: [{ text: "中文末尾", x: 0, y: 0, width: 100, height: 12 }],
    },
  ],
  text: "中文末尾",
  pageCount: 1,
  warnings: [],
};
const fixture = () => {
  let current = { id: "resume-1", data: structuredClone(defaultResumeData) };
  const controller = new AbortController();
  const dependencies = {
    getResume: () => current,
    flush: vi.fn(async () => true),
    createPdf: vi.fn(async () => ({
      url: "http://localhost/api/storage/local-user-id/resumes/resume.pdf",
      dataHash: createHash("sha256").update(JSON.stringify(current.data)).digest("hex"),
    })),
    snapshotKey: vi.fn(async (data: ResumeData) =>
      createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    ),
    extract: vi.fn(async () => extraction),
    origin: "http://localhost",
    signal: controller.signal,
    fetcher: vi.fn<typeof fetch>(
      async () => new Response(new Blob(["%PDF-test"], { type: "application/pdf" })),
    ),
  };
  return {
    dependencies,
    controller,
    setCurrent: (value: typeof current) => {
      current = value;
    },
    getCurrent: () => current,
  };
};

describe("snapshot-bound PDF review", () => {
  it("never generates a PDF when saving failed or the current content changed while saving", async () => {
    const { dependencies, setCurrent, getCurrent } = fixture();
    dependencies.flush.mockResolvedValueOnce(false);
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("save"));
    dependencies.flush.mockImplementationOnce(async () => {
      setCurrent({
        ...getCurrent(),
        data: { ...getCurrent().data, basics: { ...getCurrent().data.basics, name: "New draft" } },
      });
      return true;
    });
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("changed"));
    expect(dependencies.createPdf).not.toHaveBeenCalled();
    expect(dependencies.extract).not.toHaveBeenCalled();
  });
  it("reads the local generated PDF and retains its exact authored snapshot for later expiry checks", async () => {
    const { dependencies, getCurrent } = fixture();
    const before = JSON.stringify(getCurrent().data);
    const result = await reviewSavedPdf(dependencies);
    expect(result.snapshot).toBe(before);
    expect(result.resumeId).toBe("resume-1");
    expect(result.extraction.text).toBe("中文末尾");
    expect(dependencies.fetcher).toHaveBeenCalledWith(
      "http://localhost/api/storage/local-user-id/resumes/resume.pdf",
      expect.objectContaining({ signal: dependencies.signal }),
    );
  });
  it("refuses an external checking/download host and does not fetch it", async () => {
    const { dependencies } = fixture();
    dependencies.createPdf.mockResolvedValue({
      url: "https://external.example/resume.pdf",
      dataHash: await dependencies.snapshotKey(dependencies.getResume().data),
    });
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("local-pdf"));
    expect(dependencies.fetcher).not.toHaveBeenCalled();
  });
  it("cancels after an in-progress save without starting an obsolete print job", async () => {
    const { dependencies, controller } = fixture();
    dependencies.flush.mockImplementation(async () => {
      controller.abort();
      return true;
    });
    await expect(reviewSavedPdf(dependencies)).rejects.toThrow();
    expect(dependencies.createPdf).not.toHaveBeenCalled();
  });
  it("rejects a PDF generated from another window's save even when this window did not edit", async () => {
    const { dependencies } = fixture();
    dependencies.createPdf.mockResolvedValue({
      url: "/api/storage/resume.pdf",
      dataHash: "a".repeat(64),
    });
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("changed"));
    expect(dependencies.fetcher).not.toHaveBeenCalled();
  });
  it("never labels unverifiable PDF content current when the digest or server hash is unavailable", async () => {
    const { dependencies } = fixture();
    dependencies.snapshotKey.mockRejectedValueOnce(new Error("Digest unavailable"));
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("unverified"));
    expect(dependencies.createPdf).not.toHaveBeenCalled();
    dependencies.createPdf.mockResolvedValue({ url: "/api/storage/resume.pdf", dataHash: "" });
    await expect(reviewSavedPdf(dependencies)).rejects.toEqual(new PdfReviewError("unverified"));
    expect(dependencies.fetcher).not.toHaveBeenCalled();
  });
});

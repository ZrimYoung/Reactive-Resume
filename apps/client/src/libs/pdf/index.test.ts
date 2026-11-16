/* eslint-disable lingui/no-unlocalized-strings -- Synthetic PDF worker lifecycle tests. */
import { i18n } from "@lingui/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { extractPdf, MAX_PDF_BYTES } from ".";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument, GlobalWorkerOptions: {} }));
beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const file = () => ({ size: 4, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }) as Blob;

function pendingWorker() {
  let reject!: (reason: Error) => void;
  const promise = new Promise<never>((_resolve, no) => {
    reject = no;
  });
  const destroy = vi.fn(() => {
    reject(new Error("Worker stopped"));
    return Promise.resolve();
  });
  getDocument.mockReturnValue({ promise, destroy });
  return destroy;
}

describe("bounded local PDF reading", () => {
  it("rejects oversized files before starting a parser", async () => {
    await expect(extractPdf({ size: MAX_PDF_BYTES + 1 } as Blob)).rejects.toThrow("20 MB");
    expect(getDocument).not.toHaveBeenCalled();
  });
  it("terminates a stuck worker at the total reading budget", async () => {
    vi.useFakeTimers();
    const destroy = pendingWorker();
    const result = extractPdf(file());
    const rejected = expect(result).rejects.toThrow(/timed out/u);
    await vi.waitFor(() => {
      expect(getDocument).toHaveBeenCalled();
    });
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    expect(destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a running worker and releases the timer when its caller leaves", async () => {
    vi.useFakeTimers();
    const destroy = pendingWorker();
    const controller = new AbortController();
    const result = extractPdf(file(), { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => {
      expect(getDocument).toHaveBeenCalled();
    });
    controller.abort();
    await rejected;
    expect(destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

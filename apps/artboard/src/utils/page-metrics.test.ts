import { defaultResumeData } from "@reactive-resume/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { measureResumePages, observeResumePages } from "./page-metrics";

function page(height: number, width = 700) {
  const element = document.createElement("div");
  element.dataset.page = "1";
  element.dataset.mode = "builder";
  Object.defineProperties(element, {
    scrollHeight: { value: height },
    offsetHeight: { value: height },
    scrollWidth: { value: width },
  });
  return element;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = "";
  delete document.documentElement.dataset.artboardReady;
  delete document.documentElement.dataset.resumeFonts;
});

describe("read-only local page measurement", () => {
  it("ignores the one-pixel boundary border, counts each authored page's spill, and detects horizontal overflow", () => {
    const metrics = measureResumePages([page(1001), page(1400, 735)], {
      widthPx: 700,
      heightPx: 1000,
      lineHeightPx: 20,
    });
    expect(metrics.plannedPages).toBe(2);
    expect(metrics.estimatedPages).toBe(3);
    expect(metrics.pages[0].overflowPx).toBe(0);
    expect(metrics.pages[1].overflowLines).toBe(20);
    expect(metrics.pages[1].horizontalOverflowPx).toBe(35);
  });

  it("measures untransformed CSS layout sizes instead of magnified canvas rectangles", () => {
    const element = page(1400);
    element.getBoundingClientRect = () => ({ width: 350, height: 700 }) as DOMRect;
    expect(
      measureResumePages([element], { widthPx: 700, heightPx: 1000, lineHeightPx: 20 }).pages[0]
        .overflowPx,
    ).toBe(400);
  });

  it("waits for fonts and layout readiness, debounces reads, and never mutates the resume", async () => {
    vi.useFakeTimers();
    const data = structuredClone(defaultResumeData);
    const before = JSON.stringify(data);
    const publish = vi.fn();
    document.body.append(page(1200));
    document.documentElement.dataset.artboardReady = "false";
    document.documentElement.dataset.resumeFonts = "loading";
    const stop = observeResumePages({
      getResume: () => data,
      getPlan: () => ({ widthPx: 700, heightPx: 1000, lineHeightPx: 20 }),
      publish,
      snapshotKey: () => Promise.resolve("snapshot"),
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(publish).not.toHaveBeenCalled();
    document.documentElement.dataset.resumeFonts = "ready";
    document.documentElement.dataset.artboardReady = "true";
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe("snapshot");
    expect(JSON.stringify(data)).toBe(before);
    stop();
    document.documentElement.dataset.artboardReady = "false";
    await vi.advanceTimersByTimeAsync(300);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("does not publish a completed digest for a resume that has changed meanwhile", async () => {
    vi.useFakeTimers();
    let data = structuredClone(defaultResumeData);
    let finish: ((key: string) => void) | undefined;
    const publish = vi.fn();
    document.body.append(page(1200));
    document.documentElement.dataset.artboardReady = "true";
    document.documentElement.dataset.resumeFonts = "ready";
    const stop = observeResumePages({
      getResume: () => data,
      getPlan: () => ({ widthPx: 700, heightPx: 1000, lineHeightPx: 20 }),
      publish,
      snapshotKey: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    await vi.advanceTimersByTimeAsync(300);
    data = structuredClone(data);
    finish?.("obsolete");
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    stop();
  });
});

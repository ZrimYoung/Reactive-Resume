/* eslint-disable lingui/no-unlocalized-strings -- Test fixtures and assertions are not product text. */
/* eslint-disable @typescript-eslint/require-await -- React's async act flushes effects and promise callbacks. */
import { createHash } from "node:crypto";

import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema";
import type * as ResumeUtils from "@reactive-resume/utils";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadResumeState, useResumeStore } from "@/client/stores/resume";

import { ResumeCheckPanel } from "./check-panel";

const mocks = vi.hoisted(() => ({ flush: vi.fn(), get: vi.fn(), extract: vi.fn() }));
vi.mock("@/client/services/resume", () => ({ debouncedUpdateResume: vi.fn() }));
vi.mock("@/client/services/resume/update", () => ({ flushResumeSaves: mocks.flush }));
vi.mock("@/client/libs/axios", () => ({ axios: { get: mocks.get } }));
vi.mock("@/client/libs/pdf", () => ({ extractPdf: mocks.extract }));
vi.mock("@reactive-resume/hooks", () => ({ useBreakpoint: () => ({ isDesktop: true }) }));
vi.mock("./use-page-metrics", () => ({ usePageMetrics: vi.fn() }));
vi.mock("@reactive-resume/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof ResumeUtils>()),
  resumeMeasurementKey: (data: unknown) =>
    Promise.resolve(createHash("sha256").update(JSON.stringify(data)).digest("hex")),
}));

let container: HTMLDivElement;
let root: Root;
const extracted = {
  pages: [
    {
      pageNumber: 1,
      width: 595,
      height: 842,
      lines: [{ text: "中文最后经历", x: 0, y: 0, width: 100, height: 12 }],
    },
  ],
  text: "中文最后经历",
  pageCount: 1,
  warnings: [],
};
const load = (id = "resume-1", name = "First") => {
  const data = structuredClone(defaultResumeData);
  data.basics.name = name;
  loadResumeState(Object.assign({}, useResumeStore.getState().resume, { id, data }));
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.flush.mockReset().mockResolvedValue(true);
  mocks.get.mockReset().mockImplementation(() =>
    Promise.resolve({
      data: {
        url: `${window.location.origin}/api/storage/local-user-id/resumes/resume.pdf`,
        dataHash: createHash("sha256")
          .update(JSON.stringify(useResumeStore.getState().resume.data))
          .digest("hex"),
      },
    }),
  );
  mocks.extract.mockReset().mockResolvedValue(extracted);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response("%PDF-fixture")),
  );
  load();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});
const button = (text: string) => {
  const element = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
};
const show = async () => {
  await act(async () => {
    root.render(<ResumeCheckPanel />);
  });
};
const check = async () => {
  await act(async () => {
    button("Check exported PDF").click();
  });
};

it("does not generate a PDF during editing, and shows the actual local PDF's extracted reading order only on request", async () => {
  await show();
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();
  await check();
  expect(mocks.flush).toHaveBeenCalledWith("resume-1");
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(container.querySelector("textarea")?.value).toBe("中文最后经历");
  expect(container.textContent).toContain("Actual PDF pages");
});

it("blocks the actual PDF check when save/conflict resolution has not succeeded", async () => {
  mocks.flush.mockResolvedValue(false);
  await show();
  await check();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Save the current resume successfully",
  );
  expect(mocks.get).not.toHaveBeenCalled();
});

it("marks results stale after edits and rejects late extraction from a previously opened resume", async () => {
  await show();
  await check();
  await act(async () => {
    load("resume-1", "Edited");
  });
  expect(container.textContent).toContain("out of date because the resume changed");
  let finish: ((value: typeof extracted) => void) | undefined;
  mocks.extract.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await check();
  await act(async () => {
    load("resume-2", "Other resume");
  });
  await act(async () => {
    finish?.(extracted);
  });
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).not.toContain("Actual PDF pages");
});

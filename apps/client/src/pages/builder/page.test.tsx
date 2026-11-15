/* eslint-disable lingui/no-unlocalized-strings -- Synthetic fixtures are not user-facing. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush pending React effects. */
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useBuilderStore } from "@/client/stores/builder";

import { BuilderPage } from "./page";

type ResumeFixture = { id: string; title: string; data: typeof defaultResumeData };
const state = vi.hoisted(() => ({ resume: undefined as unknown as ResumeFixture }));
vi.mock("@/client/stores/resume", () => ({
  useResumeStore: (selector: (value: typeof state) => unknown) => selector(state),
  loadResumeState: vi.fn(),
}));
vi.mock("./_components/recovery", () => ({ ResumeRecovery: () => null }));
vi.mock("@/client/libs/query-client", () => ({ queryClient: {} }));
vi.mock("@/client/services/resume", () => ({ findResumeById: vi.fn() }));
vi.mock("@/client/services/resume/drafts", () => ({
  assessResumeDraft: vi.fn(),
  resumeDraftStorage: {},
}));
vi.mock("@/client/services/resume/update", () => ({ resumeSaveQueue: {} }));

let root: Root;
let host: HTMLDivElement;
beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.resume = {
    id: "first",
    title: "First",
    data: structuredClone(defaultResumeData),
  } as ResumeFixture;
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});
const getFrame = () => {
  const element = host.querySelector("iframe");
  if (!element?.contentWindow) throw new Error("Missing canvas iframe");
  return { element, contentWindow: element.contentWindow };
};

const render = async () => {
  await act(async () => {
    root.render(
      <HelmetProvider>
        <BuilderPage />
      </HelmetProvider>,
    );
  });
};
const announceReady = async (source: Window, origin = window.location.origin) => {
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source,
        data: { type: "ARTBOARD_READY" },
      }),
    ),
  );
};

describe("canvas handshake", () => {
  it("sends the latest document when the iframe becomes ready after an edit", async () => {
    await render();
    const frame = getFrame();
    state.resume = {
      ...state.resume,
      data: { ...state.resume.data, basics: { ...state.resume.data.basics, name: "Latest edit" } },
    };
    await render();
    const post = vi.spyOn(frame.contentWindow, "postMessage");
    await announceReady(frame.contentWindow);
    expect(post).toHaveBeenLastCalledWith(
      { type: "SET_RESUME", payload: state.resume.data },
      window.location.origin,
    );
    expect(useBuilderStore.getState().frame.ref).toBe(frame.element);
  });

  it("replaces the iframe between resumes and ignores readiness from the previous document or origin", async () => {
    await render();
    const oldWindow = getFrame().contentWindow;
    state.resume = { ...state.resume, id: "second", title: "Second" };
    await render();
    const current = getFrame();
    expect(current.contentWindow).not.toBe(oldWindow);
    const post = vi.spyOn(current.contentWindow, "postMessage");
    await announceReady(oldWindow);
    await announceReady(current.contentWindow, "https://unrelated.example");
    expect(post).not.toHaveBeenCalled();
    await announceReady(current.contentWindow);
    expect(post).toHaveBeenCalledOnce();
  });
});

/* eslint-disable lingui/no-unlocalized-strings -- Synthetic fixtures and test descriptions. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React effects. */
import { i18n } from "@lingui/core";
import { defaultExperience, defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/client/hooks/use-toast";
import { debouncedUpdateResume } from "@/client/services/resume";
import { useResumeStore } from "@/client/stores/resume";

import { SectionOptions } from "./section-options";

vi.mock("@/client/services/resume", () => ({ debouncedUpdateResume: vi.fn() }));
vi.mock("@/client/hooks/use-toast", () => ({ toast: vi.fn() }));

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const data = structuredClone(defaultResumeData);
  data.sections.experience.items = ["2018", "TBC", "2023 - Present"].map((date, index) => ({
    ...defaultExperience,
    id: `entry-${index}`,
    date,
  }));
  useResumeStore.setState({
    resume: Object.assign({}, useResumeStore.getState().resume, { id: "sort-test", data }),
  });
  useResumeStore.temporal.getState().clear();
  vi.clearAllMocks();
  await act(async () => {
    root.render(<SectionOptions id="experience" />);
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
});
const dates = () =>
  useResumeStore.getState().resume.data.sections.experience.items.map(({ date }) => date);
const clickSort = async () => {
  const trigger = host.querySelector("button");
  if (!trigger) throw new Error("Section menu button missing");
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  const action = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) =>
    element.textContent?.includes("Sort by date"),
  );
  expect(action).toBeDefined();
  if (!action) throw new Error("Section sort action missing");
  await act(async () => {
    action.click();
  });
};

describe("section date sort action", () => {
  it("waits for an explicit action, saves one undoable change, preserves unknown dates and can redo", async () => {
    expect(dates()).toEqual(["2018", "TBC", "2023 - Present"]);
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
    await clickSort();
    expect(dates()).toEqual(["2023 - Present", "2018", "TBC"]);
    expect(toast).toHaveBeenCalledWith({
      variant: "info",
      title:
        "Some dates could not be recognized. Those items were kept at the end in their original order.",
    });
    expect(debouncedUpdateResume).toHaveBeenCalledTimes(1);
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(1);
    await act(async () => {
      useResumeStore.temporal.getState().undo();
    });
    expect(dates()).toEqual(["2018", "TBC", "2023 - Present"]);
    await act(async () => {
      useResumeStore.temporal.getState().redo();
    });
    expect(dates()).toEqual(["2023 - Present", "2018", "TBC"]);
  });

  it("does not add saves or undo history when the sorted order is already correct", async () => {
    await clickSort();
    vi.mocked(debouncedUpdateResume).mockClear();
    useResumeStore.temporal.getState().clear();
    await clickSort();
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(0);
  });
});

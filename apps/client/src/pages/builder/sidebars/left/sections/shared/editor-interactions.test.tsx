/* eslint-disable lingui/no-unlocalized-strings -- Test names, fixtures, and selectors are not user-facing. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks ensure React flushes effects before assertions. */
import { i18n } from "@lingui/core";
import { TooltipProvider } from "@reactive-resume/ui";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { debouncedUpdateResume } from "@/client/services/resume";
import { useBuilderStore } from "@/client/stores/builder";
import { useResumeStore } from "@/client/stores/resume";

import { BasicsSection } from "../basics";
import { SortableKeywords } from "./sortable-keywords";

vi.mock("@/client/services/resume", () => ({ debouncedUpdateResume: vi.fn() }));
vi.mock("../picture/section", () => ({ PictureSection: () => null }));
vi.mock("../custom/section", () => ({ CustomFieldsSection: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useBuilderStore.setState({ collapsedSections: {} });
  useResumeStore.temporal.getState().clear();
  vi.mocked(debouncedUpdateResume).mockClear();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const moveWithKeyboard = async (element: Element, key: string) => {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        code: key,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
};

const keywordOrder = () =>
  Array.from(container.querySelectorAll('[role="listitem"]'), (element) => element.textContent);

const query = (selector: string): HTMLElement => {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
};

describe("editor section folding", () => {
  it("hides and reopens a section without remounting fields, saving data, or adding undo history", async () => {
    const resume = useResumeStore.getState().resume;
    await act(async () => {
      root.render(
        <TooltipProvider>
          <BasicsSection />
        </TooltipProvider>,
      );
    });

    const nameInput = query('[id="basics.name"]');
    const toggle = query('button[aria-controls="section-content-basics"]');
    const content = query("#section-content-basics");

    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);
    expect(content.classList.contains("hidden")).toBe(true);

    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(content.hidden).toBe(false);
    expect(container.querySelector('[id="basics.name"]')).toBe(nameInput);
    expect(useResumeStore.getState().resume).toBe(resume);
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(0);
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
  });

  it("folds built-in and custom sections together while allowing a single section to reopen", () => {
    const resume = useResumeStore.getState().resume;
    const ids = ["basics", "summary", "experience", "custom.example"] as const;
    useBuilderStore.getState().setAllSectionsCollapsed([...ids], true);
    expect(ids.every((id) => useBuilderStore.getState().collapsedSections[id])).toBe(true);

    useBuilderStore.getState().setSectionCollapsed("experience", false);
    expect(useBuilderStore.getState().collapsedSections.experience).toBe(false);
    expect(useBuilderStore.getState().collapsedSections["custom.example"]).toBe(true);

    useBuilderStore.getState().setAllSectionsCollapsed([...ids], false);
    expect(ids.every((id) => !useBuilderStore.getState().collapsedSections[id])).toBe(true);
    expect(useResumeStore.getState().resume).toBe(resume);
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(0);
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
  });
});

describe("sortable keyword controls", () => {
  const submit = vi.fn((event: React.FormEvent) => {
    event.preventDefault();
  });

  const KeywordsForm = ({ initialKeywords }: { initialKeywords: string[] }) => {
    const [keywords, setKeywords] = useState(initialKeywords);
    return (
      <form onSubmit={submit}>
        <SortableKeywords keywords={keywords} onChange={setKeywords} />
      </form>
    );
  };

  it("keeps focus while reordering, handles boundaries, and still removes the selected keyword", async () => {
    submit.mockClear();
    await act(async () => {
      root.render(<KeywordsForm initialKeywords={["Alpha", "Beta", "Gamma"]} />);
    });

    const handle = query('[aria-label="Reorder keyword: Beta"]');
    handle.focus();
    await moveWithKeyboard(handle, "ArrowLeft");
    expect(keywordOrder()).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(document.activeElement).toBe(handle);

    await moveWithKeyboard(handle, "ArrowLeft");
    expect(keywordOrder()).toEqual(["Beta", "Alpha", "Gamma"]);
    await click(query('[aria-label="Remove keyword: Alpha"]'));
    expect(keywordOrder()).toEqual(["Beta", "Gamma"]);
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves duplicate imported keywords and removes only the selected occurrence", async () => {
    await act(async () => {
      root.render(<KeywordsForm initialKeywords={["same", "same", "other"]} />);
    });
    expect(keywordOrder()).toEqual(["same", "same", "other"]);
    await click(query('[aria-label="Remove keyword: same"]'));
    expect(keywordOrder()).toEqual(["same", "other"]);
    await moveWithKeyboard(query('[aria-label="Reorder keyword: same"]'), "ArrowRight");
    expect(keywordOrder()).toEqual(["other", "same"]);
  });

  it("allows a keyboard drag to be cancelled without deleting a keyword or submitting the form", async () => {
    submit.mockClear();
    await act(async () => {
      root.render(<KeywordsForm initialKeywords={["Alpha", "Beta"]} />);
    });
    const handle = query('[aria-label="Reorder keyword: Alpha"]');
    handle.focus();
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    expect(keywordOrder()).toEqual(["Alpha", "Beta"]);
    expect(handle.getAttribute("aria-pressed")).not.toBe("true");
    expect(submit).not.toHaveBeenCalled();
  });
});

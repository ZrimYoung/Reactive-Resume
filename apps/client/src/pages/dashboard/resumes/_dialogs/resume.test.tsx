/* eslint-disable lingui/no-unlocalized-strings -- Test names, fixtures, and selectors are not user-facing. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React effects. */
import { i18n } from "@lingui/core";
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { TooltipProvider } from "@reactive-resume/ui";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/client/libs/query-client";
import type { DialogMode } from "@/client/stores/dialog";
import { useDialogStore } from "@/client/stores/dialog";

import { ResumeDialog } from "./resume";

const { createResume, updateResume, deleteResume, importResume } = vi.hoisted(() => ({
  createResume: vi.fn(),
  updateResume: vi.fn(),
  deleteResume: vi.fn(),
  importResume: vi.fn(),
}));

vi.mock("@/client/services/resume", () => ({
  useCreateResume: () => ({ createResume, loading: false }),
  useUpdateResume: () => ({ updateResume, loading: false }),
  useDeleteResume: () => ({ deleteResume, loading: false }),
}));
vi.mock("@/client/services/resume/import", () => ({
  useImportResume: () => ({ importResume, loading: false }),
}));

const resume: ResumeDto = {
  id: "clxexample0000000000000001",
  title: "我的简历",
  slug: "existing-resume-url",
  data: defaultResumeData,
  locked: false,
  userId: "clxexample0000000000000002",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  useDialogStore.setState({ dialog: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  queryClient.clear();
  useDialogStore.setState({ dialog: null });
});

const open = async (mode: DialogMode = "create") => {
  await act(async () => {
    useDialogStore.setState({
      dialog: { name: "resume", mode, payload: { id: "resume", item: resume } },
    });
    root.render(
      <TooltipProvider>
        <ResumeDialog />
      </TooltipProvider>,
    );
  });
};

const field = (name: "title" | "slug") => {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Missing ${name} input`);
  return input;
};

const type = async (name: "title" | "slug", value: string) => {
  const input = field(name);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) throw new Error("Missing native input value setter");
  await act(async () => {
    descriptor.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const click = async (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button: ${selector}`);
  await act(async () => {
    button.click();
  });
};

describe("resume dialog slug synchronization", () => {
  it.each(["我的简历", "我的作品"])(
    "creates a complete distinct Unicode slug while typing %s character by character",
    async (title) => {
      await open();
      let typed = "";
      for (const character of title) {
        typed += character;
        await type("title", typed);
        expect(field("slug").value).toBe(typed);
      }
      await click('button[type="submit"]');
      expect(createResume).toHaveBeenCalledWith({ title, slug: title });
    },
  );

  it("updates normalized slugs through spaces, punctuation, and clearing a new title", async () => {
    await open();
    for (const [title, slug] of [
      ["Senior", "senior"],
      ["Senior ", "senior"],
      ["Senior Product", "senior-product"],
      ["Senior Product!", "senior-product"],
      ["", ""],
    ]) {
      await type("title", title);
      expect(field("slug").value).toBe(slug);
    }
  });

  it("preserves a manually edited slug, including an intentionally cleared slug", async () => {
    await open();
    await type("title", "我的简历");
    await type("slug", "custom-url");
    await type("title", "我的作品");
    expect(field("slug").value).toBe("custom-url");

    await type("slug", "");
    await type("title", "新的标题");
    expect(field("slug").value).toBe("");
  });

  it("preserves a locked slug and resumes synchronization after unlocking", async () => {
    await open();
    await type("title", "我的");
    await click('button[aria-label="Lock slug"]');
    expect(field("slug").disabled).toBe(true);
    await type("title", "我的简历");
    expect(field("slug").value).toBe("我的");

    await click('button[aria-label="Unlock slug"]');
    expect(field("slug").disabled).toBe(false);
    await type("title", "我的作品");
    expect(field("slug").value).toBe("我的作品");
  });

  it("keeps an existing slug when renaming and submits its original revision", async () => {
    await open("update");
    await type("title", "新的标题");
    expect(field("slug").value).toBe(resume.slug);
    await click('button[type="submit"]');
    expect(updateResume).toHaveBeenCalledWith({
      id: resume.id,
      title: "新的标题",
      slug: resume.slug,
      updatedAt: resume.updatedAt,
    });
  });

  it.each([false, true])(
    "preserves a precomputed unique copy slug when its title is edited: %s",
    async (editTitle) => {
      queryClient.setQueryData<ResumeDto[]>(
        ["resumes"],
        [
          resume,
          Object.assign({}, resume, {
            id: "occupied-title",
            title: "我的简历 (2)",
            slug: "other-url",
          }),
          Object.assign({}, resume, {
            id: "occupied-slug",
            title: "Other",
            slug: `${resume.slug}-copy-3`,
          }),
        ],
      );
      await open("duplicate");
      expect(field("title").value).toBe("我的简历 (4)");
      expect(field("slug").value).toBe(`${resume.slug}-copy-4`);

      if (editTitle) await type("title", "新的副本标题");
      expect(field("slug").value).toBe(`${resume.slug}-copy-4`);
      await click('button[type="submit"]');
      expect(importResume).toHaveBeenCalledWith({
        title: editTitle ? "新的副本标题" : "我的简历 (4)",
        slug: `${resume.slug}-copy-4`,
        data: resume.data,
        autoNumber: !editTitle,
      });
    },
  );
});

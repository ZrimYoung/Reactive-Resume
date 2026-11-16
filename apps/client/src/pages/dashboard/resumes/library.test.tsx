/* eslint-disable lingui/no-unlocalized-strings -- Fixtures, selectors and test names are not product UI. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React work. */
/* eslint-disable unicorn/prefer-spread -- This project's DOM lib does not include DOM.Iterable. */
import { i18n } from "@lingui/core";
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { TooltipProvider } from "@reactive-resume/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/client/libs/query-client";
import type { ResumeLibrary, ResumeSummary } from "@/client/services/resume/library";
import { useDialogStore } from "@/client/stores/dialog";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

import { ResumeHistoryDialog } from "./_components/history-dialog";
import { ResumeTagsDialog } from "./_components/tags-dialog";
import { ResumesPage } from "./page";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const saves = vi.hoisted(() => ({
  flush: vi.fn(),
  register: vi.fn(),
  acceptServer: vi.fn(),
  hasPending: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/client/libs/axios", () => ({ axios: api }));
vi.mock("@/client/hooks/use-toast", () => ({ toast: saves.toast }));
vi.mock("@/client/services/resume/update", () => ({
  flushResumeSaves: saves.flush,
  debouncedUpdateResume: vi.fn(),
  resumeSaveQueue: {
    register: saves.register,
    acceptServer: saves.acceptServer,
    hasPending: saves.hasPending,
  },
}));

const revision = new Date("2026-11-16T01:00:00.000Z");
const makeResume = (): ResumeDto => ({
  id: "resume-1",
  userId: "local-user-id",
  title: "Current resume",
  slug: "current",
  locked: false,
  tags: ["Work"],
  trashedAt: null,
  editedAt: revision,
  createdAt: revision,
  updatedAt: revision,
  data: structuredClone(defaultResumeData),
});
const makeSummary = (trashed = false): ResumeSummary => ({
  id: "resume-1",
  userId: "local-user-id",
  title: "Current resume",
  slug: "current",
  locked: false,
  tags: ["Work"],
  trashedAt: trashed ? revision : null,
  template: "rhyhorn",
  editedAt: revision,
  createdAt: revision,
  updatedAt: revision,
});
let current: ResumeDto;
let host: HTMLDivElement;
let root: Root;
const snapshot = () => ({
  id: "version-1",
  kind: "named" as const,
  name: "Milestone",
  createdAt: revision,
  data: {
    ...structuredClone(defaultResumeData),
    basics: { ...structuredClone(defaultResumeData.basics), name: "Historical name" },
  },
});

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
  localStorage.clear();
  useDialogStore.setState({ dialog: null });
  current = makeResume();
  current.data.basics.name = "Current local name";
  loadResumeState(current);
  saves.flush.mockResolvedValue(true);
  saves.hasPending.mockReturnValue(false);
  saves.acceptServer.mockResolvedValue();
  api.get.mockImplementation(
    async (url: string, options?: { params?: Record<string, unknown> }) => {
      if (url === "/resume/library") {
        const trashed = options?.params?.trashed === "1";
        return {
          data: {
            items: [makeSummary(trashed)],
            total: 41,
            page: Number(options?.params?.page ?? 1),
            pageSize: 20,
            tags: ["Work", "Personal"],
          } satisfies ResumeLibrary,
        };
      }
      if (url.endsWith("/versions/version-1")) return { data: snapshot() };
      if (url.endsWith("/versions")) return { data: [{ ...snapshot(), data: undefined }] };
      if (url === "/resume/resume-1") return { data: current };
      throw new Error(`Unexpected GET ${url}`);
    },
  );
  api.post.mockResolvedValue({ data: current });
  api.patch.mockResolvedValue({ data: current });
  api.delete.mockResolvedValue({ data: { deleted: 1 } });
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
  vi.restoreAllMocks();
});

const settle = async (milliseconds = 5) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
};
const render = async (content: React.ReactNode) => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <MemoryRouter>
            <TooltipProvider>{content}</TooltipProvider>
          </MemoryRouter>
        </HelmetProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
};
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Typed selector returns the requested DOM subtype after checking existence.
const element = <T extends Element = HTMLElement>(
  selector: string,
  parent: ParentNode = document,
): T => {
  const result = parent.querySelector<T>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
};
const button = (text: string, parent: ParentNode = document): HTMLElement => {
  const result = Array.from(parent.querySelectorAll<HTMLElement>('button,[role="menuitem"]')).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
};
const click = async (target: HTMLElement) => {
  await act(async () => {
    target.click();
  });
  await settle();
};
const type = async (selector: string, value: string) => {
  const input = element<HTMLInputElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const select = async (selector: string, value: string) => {
  const input = element<HTMLSelectElement>(selector);
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};
const openMenu = async () => {
  const trigger = element<HTMLButtonElement>('button[aria-label="Actions for Current resume"]');
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  await settle();
  return element('[role="menu"]');
};
const menu = async (text: string) => {
  await click(button(text, await openMenu()));
};
const chooseVersion = async () => {
  const target = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.startsWith("Milestone"),
  );
  if (!target) throw new Error("Missing saved version");
  await click(target);
};

describe("resume library", () => {
  it("requests summaries with search, sort, tag and page filters instead of loading full documents", async () => {
    await render(<ResumesPage />);
    expect(api.get.mock.calls.every(([url]) => url === "/resume/library")).toBe(true);
    await click(button("Next"));
    expect(api.get).toHaveBeenLastCalledWith(
      "/resume/library",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, pageSize: 20 }) }),
    );
    await select('select[aria-label="Sort resumes"]', "name:asc");
    expect(api.get).toHaveBeenLastCalledWith(
      "/resume/library",
      expect.objectContaining({
        params: expect.objectContaining({ sort: "name", order: "asc", page: 1 }),
      }),
    );
    await select('select[aria-label="Filter by tag"]', "Work");
    await type('input[aria-label="Search resumes"]', "engineer");
    await settle(240);
    expect(api.get).toHaveBeenLastCalledWith(
      "/resume/library",
      expect.objectContaining({
        params: expect.objectContaining({ q: "engineer", tag: "Work", page: 1 }),
      }),
    );
  });

  it("does not display a late result from an earlier search", async () => {
    const normal = api.get.getMockImplementation();
    let finish!: (value: { data: ResumeLibrary }) => void;
    api.get.mockImplementation((url: string, options?: { params?: Record<string, unknown> }) => {
      if (options?.params?.q === "old")
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (options?.params?.q === "new")
        return Promise.resolve({
          data: {
            items: [{ ...makeSummary(), title: "New result" }],
            total: 1,
            page: 1,
            pageSize: 20,
            tags: [],
          },
        });
      return normal?.(url, options);
    });
    await render(<ResumesPage />);
    await type('input[aria-label="Search resumes"]', "old");
    await settle(240);
    await type('input[aria-label="Search resumes"]', "new");
    await settle(240);
    await act(async () => {
      finish({
        data: {
          items: [{ ...makeSummary(), title: "Old result" }],
          total: 1,
          page: 1,
          pageSize: 20,
          tags: [],
        },
      });
    });
    await settle();
    expect(host.textContent).toContain("New result");
    expect(host.textContent).not.toContain("Old result");
  });

  it("fetches the latest full resume only when making a copy", async () => {
    await render(<ResumesPage />);
    current.data.basics.name = "Latest saved body";
    await menu("Duplicate");
    expect(api.get).toHaveBeenCalledWith("/resume/resume-1");
    expect(useDialogStore.getState().dialog?.payload?.item).toEqual(current);
    expect(saves.flush).toHaveBeenCalledWith("resume-1");
  });

  it("moves a resume to Trash only after explicit confirmation with the observed revision", async () => {
    await render(<ResumesPage />);
    await menu("Move to Trash");
    expect(api.post).not.toHaveBeenCalled();
    await click(button("Cancel", element('[role="alertdialog"]')));
    expect(api.post).not.toHaveBeenCalled();
    await menu("Move to Trash");
    await click(button("Move to Trash", element('[role="alertdialog"]')));
    expect(api.post).toHaveBeenCalledWith("/resume/resume-1/trash", {
      expectedUpdatedAt: revision,
    });
  });

  it("requires confirmation for permanent deletion and for emptying all Trash", async () => {
    await render(<ResumesPage />);
    await click(button("Trash"));
    await menu("Delete permanently");
    expect(api.delete).not.toHaveBeenCalled();
    await click(button("Delete permanently", element('[role="alertdialog"]')));
    expect(api.delete).toHaveBeenCalledWith("/resume/resume-1/permanent", {
      data: { expectedUpdatedAt: revision },
    });
    api.delete.mockClear();
    await click(button("Empty Trash"));
    expect(api.delete).not.toHaveBeenCalled();
    await click(button("Empty Trash", element('[role="alertdialog"]')));
    expect(api.delete).toHaveBeenCalledWith("/resume/trash", { data: { confirm: true } });
  });

  it("distinguishes a failed library read from an empty library", async () => {
    api.get.mockRejectedValue(new Error("Offline"));
    await render(<ResumesPage />);
    expect(element('[role="alert"]').textContent).toContain("does not mean it is empty");
    expect(host.textContent).not.toContain("No resumes match");
  });

  it("ignores a late full-document result after the library filters change", async () => {
    const normal = api.get.getMockImplementation();
    let finish!: (value: { data: ResumeDto }) => void;
    api.get.mockImplementation((url: string, options?: { params?: Record<string, unknown> }) =>
      url === "/resume/resume-1"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : normal?.(url, options),
    );
    await render(<ResumesPage />);
    await menu("Duplicate");
    await type('input[aria-label="Search resumes"]', "changed");
    await act(async () => {
      finish({ data: current });
    });
    await settle(240);
    expect(useDialogStore.getState().dialog).toBeNull();
  });

  it("keeps Move to Trash disabled for a locked active resume", async () => {
    const normal = api.get.getMockImplementation();
    api.get.mockImplementation(
      async (url: string, options?: { params?: Record<string, unknown> }) => {
        if (url === "/resume/library")
          return {
            data: {
              items: [{ ...makeSummary(), locked: true }],
              total: 1,
              page: 1,
              pageSize: 20,
              tags: [],
            },
          };
        return normal?.(url, options);
      },
    );
    await render(<ResumesPage />);
    const content = await openMenu();
    expect(button("Move to Trash", content).getAttribute("aria-disabled")).toBe("true");
    await click(button("Move to Trash", content));
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("allows a locked trashed resume to return to the library after confirmation", async () => {
    const normal = api.get.getMockImplementation();
    api.get.mockImplementation(
      async (url: string, options?: { params?: Record<string, unknown> }) => {
        if (url === "/resume/library")
          return {
            data: {
              items: [{ ...makeSummary(options?.params?.trashed === "1"), locked: true }],
              total: 1,
              page: 1,
              pageSize: 20,
              tags: [],
            },
          };
        return normal?.(url, options);
      },
    );
    await render(<ResumesPage />);
    await click(button("Trash"));
    await menu("Restore resume");
    expect(api.post).not.toHaveBeenCalled();
    await click(button("Restore resume", element('[role="alertdialog"]')));
    expect(api.post).toHaveBeenCalledWith("/resume/resume-1/restore", {
      expectedUpdatedAt: revision,
    });
  });

  it("does not describe a filtered empty Trash result as an empty Trash", async () => {
    const normal = api.get.getMockImplementation();
    api.get.mockImplementation(
      async (url: string, options?: { params?: Record<string, unknown> }) => {
        if (url === "/resume/library" && options?.params?.q === "missing")
          return { data: { items: [], total: 0, page: 1, pageSize: 20, tags: [] } };
        return normal?.(url, options);
      },
    );
    await render(<ResumesPage />);
    await click(button("Trash"));
    await type('input[aria-label="Search resumes"]', "missing");
    await settle(240);
    // Debounce commits the new query key at the end of act; wait for that query's notification too.
    await vi.waitFor(async () => {
      await settle();
      expect(host.textContent).toContain("No resumes match these filters.");
    });
    expect(host.textContent).not.toContain("Trash is empty.");
    expect((button("Empty Trash") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("resume tags", () => {
  it("deduplicates tags and saves buffered input with the revision the user observed", async () => {
    const close = vi.fn();
    await render(<ResumeTagsDialog resume={makeSummary()} onClose={close} />);
    await type('input[aria-label="New tags"]', "work, Research");
    await click(button("Save tags"));
    expect(api.patch).toHaveBeenCalledWith("/resume/resume-1", {
      tags: ["Work", "Research"],
      expectedUpdatedAt: revision,
    });
    expect(close).toHaveBeenCalled();
  });
  it("keeps edited tags visible after a version conflict", async () => {
    api.patch.mockRejectedValue({ response: { status: 409 } });
    const close = vi.fn();
    await render(<ResumeTagsDialog resume={makeSummary()} onClose={close} />);
    await type('input[aria-label="New tags"]', "Research");
    await click(button("Save tags"));
    expect(element('[role="alert"]').textContent).toContain("changed");
    expect(close).not.toHaveBeenCalled();
    expect(element<HTMLInputElement>('input[aria-label="New tags"]').value).toBe("Research");
  });
});

describe("version history", () => {
  const openHistory = () =>
    render(
      <ResumeHistoryDialog
        open
        resumeId="resume-1"
        title="Current resume"
        onOpenChange={vi.fn()}
      />,
    );
  const choose = chooseVersion;

  it("previews isolated saved content without mutating the live resume", async () => {
    await openHistory();
    await choose();
    const frame = element<HTMLIFrameElement>('iframe[title="Saved version preview"]');
    expect(frame.getAttribute("src")).toBe("/artboard/builder");
    const previewWindow = frame.contentWindow;
    if (!previewWindow) throw new Error("Missing preview window");
    const send = vi.spyOn(previewWindow, "postMessage");
    send.mockClear();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://untrusted.example",
          source: frame.contentWindow,
          data: { type: "ARTBOARD_READY" },
        }),
      );
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: frame.contentWindow,
          data: { type: "ARTBOARD_READY" },
        }),
      );
    });
    expect(send).toHaveBeenCalledWith(
      { type: "SET_RESUME", payload: snapshot().data },
      window.location.origin,
    );
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Current local name");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("names a snapshot only after flushing saved content", async () => {
    api.post.mockResolvedValue({ data: { ...snapshot(), data: undefined } });
    await openHistory();
    await type('input[aria-label="Snapshot name"]', "Before sending");
    await click(button("Save snapshot"));
    expect(saves.flush).toHaveBeenCalledWith("resume-1");
    expect(api.post).toHaveBeenCalledWith("/resume/resume-1/versions", {
      name: "Before sending",
      expectedUpdatedAt: revision,
    });
  });

  it("confirms a restore, sends CAS, and adopts the acknowledged revision", async () => {
    const restored = Object.assign({}, current, {
      data: snapshot().data,
      updatedAt: new Date("2026-11-16T02:00:00.000Z"),
    });
    api.post.mockResolvedValue({ data: restored });
    await openHistory();
    await choose();
    await click(button("Restore this version"));
    expect(api.post).not.toHaveBeenCalled();
    await click(button("Restore version", element('[role="alertdialog"]')));
    expect(api.post).toHaveBeenCalledWith("/resume/resume-1/versions/version-1/restore", {
      expectedUpdatedAt: revision,
    });
    expect(saves.acceptServer).toHaveBeenCalledWith(restored);
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Historical name");
  });

  it("preserves the live document and requires a new review after CAS conflict", async () => {
    api.post.mockRejectedValue({ response: { status: 409 } });
    await openHistory();
    await choose();
    await click(button("Restore this version"));
    await click(button("Restore version", element('[role="alertdialog"]')));
    expect(element('[role="alert"]').textContent).toContain("changed");
    expect(saves.acceptServer).not.toHaveBeenCalled();
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Current local name");
  });

  it("blocks restoration when the latest local edits cannot be saved", async () => {
    await openHistory();
    await choose();
    saves.flush.mockResolvedValue(false);
    await click(button("Restore this version"));
    await click(button("Restore version", element('[role="alertdialog"]')));
    expect(api.post).not.toHaveBeenCalled();
    expect(element('[role="alert"]').textContent).toContain("Save or resolve");
  });

  it("keeps newer local edits if they arrive while the restore request is in flight", async () => {
    let finish!: (value: { data: ResumeDto }) => void;
    api.post.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await openHistory();
    await choose();
    await click(button("Restore this version"));
    await click(button("Restore version", element('[role="alertdialog"]')));
    const newer = structuredClone(current);
    newer.data.basics.name = "Newer local draft";
    loadResumeState(newer);
    saves.hasPending.mockReturnValue(true);
    await act(async () => {
      finish({ data: Object.assign({}, current, { data: snapshot().data }) });
    });
    await settle();
    expect(saves.acceptServer).not.toHaveBeenCalled();
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Newer local draft");
    expect(saves.toast).toHaveBeenLastCalledWith(expect.objectContaining({ variant: "warning" }));
  });
});

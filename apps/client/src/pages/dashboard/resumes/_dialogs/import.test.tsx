/* eslint-disable lingui/no-unlocalized-strings -- Test descriptions and synthetic input are not UI text. */
/* eslint-disable @typescript-eslint/require-await -- Async act callbacks flush React effects. */
import { i18n } from "@lingui/core";
import { JsonResumeParser, ReactiveResumeParser } from "@reactive-resume/parser";
import { defaultResumeData } from "@reactive-resume/schema";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useDialogStore } from "@/client/stores/dialog";

import { ImportDialog } from "./import";

const { importResume, toast, extractPdf } = vi.hoisted(() => ({
  importResume: vi.fn(),
  toast: vi.fn(),
  extractPdf: vi.fn(),
}));
vi.mock("@/client/libs/pdf", () => ({ extractPdf }));
vi.mock("@/client/services/resume/import", () => ({
  useImportResume: () => ({ importResume, loading: false }),
}));
vi.mock("@/client/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const jsonFileParser = new JsonResumeParser();
const readJSONFile = jsonFileParser.readFile.bind(jsonFileParser);
const resume = (name: string) => {
  const data = structuredClone(defaultResumeData);
  data.basics.name = name;
  return data;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
type NativeData = Awaited<ReturnType<ReactiveResumeParser["readFile"]>>;

let root: Root;
let host: HTMLDivElement;
beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  i18n.load("en", {});
  i18n.activate("en");
});
beforeEach(async () => {
  vi.clearAllMocks();
  extractPdf.mockReset();
  importResume.mockResolvedValue(null);
  Reflect.deleteProperty(window, "electron");
  useDialogStore.setState({ dialog: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ImportDialog />);
    useDialogStore.setState({ dialog: { name: "import", mode: "create" } });
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  Reflect.deleteProperty(window, "electron");
  useDialogStore.setState({ dialog: null });
  vi.restoreAllMocks();
});

function button(label: string) {
  // eslint-disable-next-line unicorn/prefer-spread -- This app's TypeScript lib omits DOM.Iterable.
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent?.trim() === label,
  );
}
async function click(label: string) {
  const target = button(label);
  if (!target) throw new Error(`Button missing: ${label}`);
  await act(async () => {
    target.click();
  });
}
function selectFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input missing");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function choose(file = new File(["fixture"], "resume.json", { type: "application/json" })) {
  await act(async () => {
    selectFile(file);
  });
  return file;
}
async function format(value: string) {
  const select = document.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("Format select missing");
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("import validation ownership", () => {
  it("shows a review without writing before explicit confirmation", async () => {
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockResolvedValue(resume("Preview only"));
    await choose();
    await click("Validate");
    expect(document.querySelector('[data-testid="import-review"]')?.textContent).toContain(
      "Preview only",
    );
    expect(importResume).not.toHaveBeenCalled();
    await click("Import");
    expect(importResume).toHaveBeenCalledTimes(1);
  });

  it("reviews local PDF text before creating a new resume", async () => {
    extractPdf.mockResolvedValue({
      pages: [
        {
          pageNumber: 1,
          width: 600,
          height: 800,
          lines: [{ text: "测试简历", x: 20, y: 20, width: 80, height: 12 }],
        },
      ],
      pageCount: 1,
      text: "测试简历",
      warnings: [],
    });
    await format("pdf");
    await choose(new File(["%PDF-fixture"], "local.pdf", { type: "application/pdf" }));
    await click("Validate");
    expect(document.querySelector('[data-testid="import-review"]')?.textContent).toContain(
      "测试简历",
    );
    expect(importResume).not.toHaveBeenCalled();
    await click("Import");
    expect(importResume.mock.calls[0][0].data.basics.name).toBe("测试简历");
  });

  it("cancels an obsolete PDF parse when a new file is chosen", async () => {
    const pending = deferred<unknown>();
    extractPdf.mockReturnValueOnce(pending.promise);
    await format("pdf");
    await choose(new File(["A"], "a.pdf"));
    await click("Validate");
    const signal = extractPdf.mock.calls[0][1].signal as AbortSignal;
    await choose(new File(["B"], "b.pdf"));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ pages: [], text: "", pageCount: 1, warnings: [] });
    });
    expect(button("Import")).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });
  it("imports only the current file when validations complete out of order", async () => {
    const first = deferred<NativeData>();
    const latest = deferred<NativeData>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(latest.promise);
    await choose(new File(["A"], "a.json"));
    await click("Validate");
    await choose(new File(["B"], "b.json"));
    await click("Validate");
    await act(async () => {
      latest.resolve(resume("File B"));
    });
    await act(async () => {
      first.resolve(resume("File A"));
    });
    await click("Import");
    expect(importResume).toHaveBeenCalledTimes(1);
    expect(importResume.mock.calls[0][0].data.basics.name).toBe("File B");
  });

  it("ignores an obsolete failure after selecting a new file", async () => {
    const pending = deferred<NativeData>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockReturnValueOnce(pending.promise);
    await choose();
    await click("Validate");
    await choose(new File(["B"], "b.json"));
    await act(async () => {
      pending.reject(new Error("Old read failed"));
    });
    expect(button("Import")).toBeUndefined();
    expect(button("Validate")).toBeDefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it("rejects the previously validated snapshot even before React renders a file change", async () => {
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockResolvedValue(resume("File A"));
    await choose();
    await click("Validate");
    const submit = button("Import");
    if (!submit) throw new Error("Import button missing");
    await act(async () => {
      selectFile(new File(["B"], "b.json"));
      submit.click();
    });
    expect(importResume).not.toHaveBeenCalled();
  });

  it("invalidates pending validation on a format change", async () => {
    const pending = deferred<NativeData>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockReturnValueOnce(pending.promise);
    await choose();
    await click("Validate");
    await format("json-resume-json");
    await act(async () => {
      pending.resolve(resume("Old format"));
    });
    expect(button("Import")).toBeUndefined();
    expect(button("Validate")).toBeDefined();
  });

  it("does not reuse a validation after closing and reopening with the same File", async () => {
    const pending = deferred<NativeData>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockReturnValueOnce(pending.promise);
    const file = await choose();
    await click("Validate");
    await click("Close");
    await act(async () => {
      useDialogStore.setState({ dialog: { name: "import", mode: "create" } });
    });
    await choose(file);
    await act(async () => {
      pending.resolve(resume("Previous visit"));
    });
    expect(button("Import")).toBeUndefined();
    expect(button("Validate")).toBeDefined();
  });

  it("invalidates an older request when a failed validation is discarded", async () => {
    const first = deferred<NativeData>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile")
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("Current read failed"));
    await choose();
    await click("Validate");
    await click("Validate");
    await click("Discard");
    await act(async () => {
      first.resolve(resume("Discarded request"));
    });
    expect(button("Import")).toBeUndefined();
    expect(button("Validate")).toBeDefined();
  });

  it("uses the selected JSON Resume parser and a real File for native open-and-import", async () => {
    const source = {
      basics: { name: "Native JSON Resume" },
      projects: [{ description: "Offline tool", highlights: ["Printable"] }],
    };
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: { openJson: vi.fn().mockResolvedValue({ canceled: false, content: source }) },
    });
    const reader = vi.spyOn(JsonResumeParser.prototype, "readFile").mockResolvedValue(source);
    const wrongReader = vi.spyOn(ReactiveResumeParser.prototype, "readFile");
    await format("json-resume-json");
    await click("Open Local File");
    expect(reader).toHaveBeenCalledTimes(1);
    const file = reader.mock.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(await readJSONFile.call(new JsonResumeParser(), file)).toEqual(source);
    expect(wrongReader).not.toHaveBeenCalled();
    await click("Import");
    expect(importResume.mock.calls[0][0].data.basics.name).toBe("Native JSON Resume");
    expect(importResume.mock.calls[0][0].data.sections.projects.items[0].summary).toContain(
      "Printable",
    );
  });

  it("ignores a native picker response returned after its dialog was closed", async () => {
    const pending = deferred<{ canceled: boolean; content: unknown }>();
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: { openJson: vi.fn().mockReturnValue(pending.promise) },
    });
    const reader = vi.spyOn(ReactiveResumeParser.prototype, "readFile");
    await act(async () => {
      root.render(<ImportDialog />);
    });
    await click("Open Local File");
    await click("Close");
    await act(async () => {
      useDialogStore.setState({ dialog: { name: "import", mode: "create" } });
    });
    await act(async () => {
      pending.resolve({ canceled: false, content: resume("Old picker") });
    });
    expect(reader).not.toHaveBeenCalled();
    expect(button("Import")).toBeUndefined();
  });

  it("does not close a newer file selection when an already submitted import finishes", async () => {
    const pending = deferred<unknown>();
    vi.spyOn(ReactiveResumeParser.prototype, "readFile").mockResolvedValue(resume("Submitted A"));
    importResume.mockReturnValueOnce(pending.promise);
    await choose();
    await click("Validate");
    await click("Import");
    await choose(new File(["B"], "b.json"));
    await act(async () => {
      pending.resolve(null);
    });
    expect(useDialogStore.getState().dialog?.name).toBe("import");
    expect(button("Validate")).toBeDefined();
  });
});

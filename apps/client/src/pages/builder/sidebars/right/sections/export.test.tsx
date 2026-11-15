/* eslint-disable lingui/no-unlocalized-strings -- Fixture and assertion text is not product UI. */
/* eslint-disable @typescript-eslint/require-await -- Async React act callbacks intentionally flush pending microtasks. */

import { i18n } from "@lingui/core";
import type { ResumeData } from "@reactive-resume/schema";
import { defaultResumeData } from "@reactive-resume/schema";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportSection } from "./export";

const dependencies = vi.hoisted(() => ({
  flush: vi.fn(),
  print: vi.fn(),
  saveAs: vi.fn(),
  download: vi.fn(),
  toast: vi.fn(),
  state: { resume: { id: "resume-1", data: undefined as unknown as ResumeData } },
}));

vi.mock("@/client/services/resume/update", () => ({ flushResumeSaves: dependencies.flush }));
vi.mock("@/client/services/resume/print", () => ({ printResume: dependencies.print }));
vi.mock("@/client/hooks/use-toast", () => ({ toast: dependencies.toast }));
vi.mock("@/client/stores/resume", () => ({
  useResumeStore: { getState: () => dependencies.state },
}));
vi.mock("file-saver", () => ({ saveAs: dependencies.saveAs }));
vi.mock("../shared/section-icon", () => ({ SectionIcon: () => null }));
vi.mock("@reactive-resume/ui", async () => {
  const { createElement: element } = await import("react");
  const component = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
    element("div", props, children);
  return {
    Card: component,
    CardContent: component,
    CardDescription: component,
    CardTitle: component,
    ToastAction: component,
    buttonVariants: () => "",
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  i18n.load("en", {});
  i18n.activate("en");
  Reflect.deleteProperty(window, "electron");
  dependencies.state.resume = { id: "resume-1", data: structuredClone(defaultResumeData) };
  dependencies.state.resume.data.basics.name = "Latest local name";
  dependencies.flush.mockResolvedValue(true);
  dependencies.print.mockResolvedValue({ url: "https://example.com/resume.pdf" });
  dependencies.download.mockResolvedValue({ canceled: false });
  vi.spyOn(window, "open").mockReturnValue({ focus: vi.fn() } as unknown as Window);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ExportSection));
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  Reflect.deleteProperty(window, "electron");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const clickExport = async (index: number) => {
  await act(async () => {
    container.querySelectorAll<HTMLElement>('[role="button"]')[index].click();
  });
};

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Expected a text blob"));
    });
    reader.addEventListener("error", () => {
      reject(new Error(reader.error?.message ?? "Could not read the exported blob"));
    });
    // eslint-disable-next-line unicorn/prefer-blob-reading-methods -- jsdom's Blob does not implement text().
    reader.readAsText(blob);
  });

describe("export save boundaries", () => {
  it.each([
    [0, "json"],
    [1, "md"],
  ] as const)(
    "%s waits for saving, then exports the latest store snapshot as %s",
    async (index, extension) => {
      let finish!: (saved: boolean) => void;
      dependencies.flush.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      );
      await clickExport(index);
      expect(dependencies.saveAs).not.toHaveBeenCalled();
      expect(dependencies.flush).toHaveBeenCalledWith("resume-1");
      dependencies.state.resume.data = structuredClone(dependencies.state.resume.data);
      dependencies.state.resume.data.basics.name = "Edited while saving";
      await act(async () => {
        finish(true);
      });
      const [blob, filename] = dependencies.saveAs.mock.calls[0] as [Blob, string];
      expect(filename).toBe(`reactive_resume-resume-1.${extension}`);
      expect(await readBlob(blob)).toContain("Edited while saving");
      expect(dependencies.toast).not.toHaveBeenCalled();
    },
  );

  it.each([
    [0, "json"],
    [1, "md"],
  ] as const)(
    "%s still provides a local %s backup with a warning after save failure",
    async (index, extension) => {
      dependencies.flush.mockResolvedValue(false);
      await clickExport(index);
      const [blob, filename] = dependencies.saveAs.mock.calls[0] as [Blob, string];
      expect(filename).toBe(`reactive_resume-resume-1.${extension}`);
      expect(await readBlob(blob)).toContain("Latest local name");
      expect(dependencies.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "warning" }),
      );
      expect(dependencies.print).not.toHaveBeenCalled();
    },
  );

  it("does not request a PDF from an older saved revision after save failure", async () => {
    dependencies.flush.mockResolvedValue(false);
    await clickExport(2);
    expect(dependencies.print).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(dependencies.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("prints only after saving succeeds", async () => {
    const calls: string[] = [];
    dependencies.flush.mockImplementation(async () => {
      calls.push("save");
      return true;
    });
    dependencies.print.mockImplementation(async () => {
      calls.push("print");
      return { url: "https://example.com/resume.pdf" };
    });
    await clickExport(2);
    expect(calls).toEqual(["save", "print"]);
    expect(dependencies.print).toHaveBeenCalledWith({ id: "resume-1" });
    expect(window.open).toHaveBeenCalledWith("https://example.com/resume.pdf", "_blank");
  });

  it("uses the Electron save dialog with Markdown data and excludes private fields", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: { downloadAndSave: dependencies.download },
    });
    dependencies.state.resume.data.metadata.notes = "PRIVATE-NOTES";
    dependencies.state.resume.data.basics.picture.url = "https://example.com/PRIVATE-PHOTO.png";
    dependencies.state.resume.data.basics.picture.effects.hidden = true;
    await clickExport(1);
    const [url, filename] = dependencies.download.mock.calls[0] as [string, string];
    expect(filename).toBe("reactive_resume-resume-1.md");
    expect(url).toMatch(/^data:text\/markdown;charset=utf-8,/);
    const text = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    expect(text).toContain("# Latest local name");
    expect(text).not.toContain("PRIVATE-");
    expect(dependencies.saveAs).not.toHaveBeenCalled();
  });

  it("shows a save-dialog failure instead of silently swallowing it", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: { downloadAndSave: dependencies.download },
    });
    dependencies.download.mockRejectedValueOnce(new Error("Disk full"));
    await clickExport(1);
    expect(dependencies.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error", description: "Disk full" }),
    );
  });

  it("does not export a different resume when navigation occurs during saving", async () => {
    let finish!: (saved: boolean) => void;
    dependencies.flush.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    await clickExport(1);
    dependencies.state.resume.id = "resume-2";
    await act(async () => {
      finish(true);
    });
    expect(dependencies.saveAs).not.toHaveBeenCalled();
    expect(dependencies.print).not.toHaveBeenCalled();
    expect(dependencies.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "warning" }),
    );
  });
});

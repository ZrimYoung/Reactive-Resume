/* eslint-disable @typescript-eslint/require-await -- Async mock methods model Puppeteer's promise-returning API. */

import { createHash } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "../config/schema";
import type { StorageService } from "../storage/storage.service";
import { PrinterService } from "./printer.service";

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer", () => ({ launch }));

const resume = (id: string): ResumeDto => ({
  id,
  title: id,
  slug: id,
  userId: "local-user-id",
  locked: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  data: JSON.parse(JSON.stringify(defaultResumeData)) as typeof defaultResumeData,
});

const createService = (storage?: Pick<StorageService, "uploadObject">) => {
  const config = new ConfigService<Config>({ PUBLIC_URL: "http://127.0.0.1:3301" });
  const target = storage ?? {
    uploadObject: vi.fn().mockResolvedValue("http://127.0.0.1:3301/result.pdf"),
  };
  return new PrinterService(
    config,
    target as unknown as StorageService,
    undefined as never,
    undefined as never,
  );
};

beforeEach(() => launch.mockReset());

describe("offline printer lifecycle", () => {
  it("shares one lazy Chrome launch when first requests arrive together", async () => {
    const browser = {
      connected: true,
      once: vi.fn(),
      version: vi.fn().mockResolvedValue("Chrome/test"),
    };
    launch.mockResolvedValue(browser);
    const service = createService();
    expect(launch).not.toHaveBeenCalled();
    expect(await Promise.all([service.getVersion(), service.getVersion()])).toEqual([
      "Chrome/test",
      "Chrome/test",
    ]);
    expect(launch).toHaveBeenCalledOnce();
  });

  it("isolates concurrent render localStorage, waits for the artboard, and closes each context", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const contexts: {
      close: ReturnType<typeof vi.fn>;
      page: Record<string, ReturnType<typeof vi.fn>>;
    }[] = [];
    const browser = {
      connected: true,
      once: vi.fn(),
      createBrowserContext: vi.fn().mockImplementation(async () => {
        const page = Object.fromEntries(
          [
            "setDefaultNavigationTimeout",
            "setDefaultTimeout",
            "evaluateOnNewDocument",
            "goto",
            "emulateMediaType",
            "waitForSelector",
            "waitForFunction",
            "evaluate",
            "setViewport",
          ].map((name) => [name, vi.fn().mockResolvedValue()]),
        );
        page.$ = vi.fn().mockResolvedValue({});
        page.pdf = vi.fn().mockResolvedValue(bytes);
        page.screenshot = vi.fn().mockResolvedValue(Buffer.from("preview"));
        const context = { close: vi.fn().mockResolvedValue(), page };
        contexts.push(context);
        return { ...context, newPage: async () => page };
      }),
    };
    launch.mockResolvedValue(browser);
    const service = createService();
    await Promise.all([
      service.generateResume(resume("one")),
      service.generatePreview(resume("two")),
    ]);
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    for (const context of contexts) {
      expect(context.close).toHaveBeenCalledOnce();
      expect(context.page.waitForSelector).toHaveBeenCalledWith('[data-page="1"]', {
        timeout: 30_000,
      });
      expect(context.page.waitForFunction).toHaveBeenCalled();
    }
  });

  it("closes the context when navigation fails so retries do not leak pages", async () => {
    const context = { close: vi.fn(), newPage: vi.fn() };
    context.newPage.mockResolvedValue({
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      evaluateOnNewDocument: vi.fn(),
      goto: vi.fn().mockRejectedValue(new Error("preview unavailable")),
    });
    launch.mockResolvedValue({
      connected: true,
      once: vi.fn(),
      createBrowserContext: async () => context,
    });
    await expect(createService().generateResume(resume("one"))).rejects.toThrow(
      "ResumePrinterError",
    );
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("keeps concurrent PDF versions of the same resume available under their own byte-bound URLs", async () => {
    const firstPdf = await PDFDocument.create();
    firstPdf.addPage();
    const secondPdf = await PDFDocument.create();
    secondPdf.addPage();
    secondPdf.addPage();
    const sourcePdfs = [await firstPdf.save(), await secondPdf.save()];
    const files = new Map<string, Buffer>();
    const storage = {
      uploadObject: vi.fn(async (_userId: string, _type: string, buffer: Buffer, filename = "") => {
        files.set(filename, buffer);
        return `http://127.0.0.1:3301/${filename}.pdf`;
      }),
    };
    let contextIndex = 0;
    launch.mockResolvedValue({
      connected: true,
      once: vi.fn(),
      createBrowserContext: vi.fn(async () => {
        const bytes = sourcePdfs[contextIndex++];
        const page = Object.fromEntries(
          [
            "setDefaultNavigationTimeout",
            "setDefaultTimeout",
            "evaluateOnNewDocument",
            "goto",
            "emulateMediaType",
            "waitForSelector",
            "waitForFunction",
            "evaluate",
            "setViewport",
          ].map((name) => [name, vi.fn().mockResolvedValue()]),
        );
        page.pdf = vi.fn().mockResolvedValue(bytes);
        page.$ = vi.fn().mockResolvedValue({});
        return { close: vi.fn().mockResolvedValue(), newPage: async () => page };
      }),
    });
    const service = createService(storage);
    const first = resume("same-resume");
    const second = resume("same-resume");
    second.data.basics.name = "Changed in another window";
    const urls = await Promise.all([service.generateResume(first), service.generateResume(second)]);

    expect(new Set(urls).size).toBe(2);
    expect(files.size).toBe(2);
    const pageCounts: number[] = [];
    for (const [filename, buffer] of files) {
      expect(filename).toBe(`same-resume-${createHash("sha256").update(buffer).digest("hex")}`);
      expect(urls).toContain(`http://127.0.0.1:3301/${filename}.pdf`);
      const parsed = await PDFDocument.load(buffer);
      pageCounts.push(parsed.getPageCount());
    }
    expect(pageCounts.sort()).toEqual([1, 2]);
  });
});
